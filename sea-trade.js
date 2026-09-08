// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

'use strict';

import { H, MS_PER_GAME_HOUR, TILE, W, clamp, ctx, logEvent, makeId, session, state, tile } from './state.js';
import { runHumanAI, worldHour } from './ai-simulation.js';
import { resourceCapacity } from './cities-kingdoms.js';
import { PATH_MAX_NODES, PathHeap, isCoastalCity, isWater, sameWaterRegion } from './territory-units.js';
import { showToast } from './ui.js';

  export function searchWaterAStar(sx, sy, tx, ty, minX, minY, maxX, maxY) {
    const startIdx = sy * W + sx, targetIdx = ty * W + tx;
    const heap = new PathHeap();
    const gScore = new Map([[startIdx, 0]]);
    const cameFrom = new Map();
    const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
    heap.push({ idx: startIdx, g: 0, f: h(sx, sy) });
    let explored = 0;
    const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
    while (heap.size) {
      const current = heap.pop();
      if (current.g > (gScore.get(current.idx) ?? Infinity)) continue;
      if (current.idx === targetIdx) {
        const path = [];
        let cur = targetIdx;
        while (cur !== startIdx) {
          path.push(cur);
          cur = cameFrom.get(cur);
          if (cur == null) return null;
        }
        path.reverse();
        return path.map(idx => ({ x: (idx % W) + .5, y: ((idx / W) | 0) + .5 }));
      }
      if (++explored > PATH_MAX_NODES) return null;
      const x = current.idx % W, y = (current.idx / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue;
        const nidx = ny * W + nx;
        if (!isWater(state.tiles[nidx])) continue;
        const tentativeG = current.g + 1;
        if (tentativeG < (gScore.get(nidx) ?? Infinity)) {
          gScore.set(nidx, tentativeG);
          cameFrom.set(nidx, current.idx);
          heap.push({ idx: nidx, g: tentativeG, f: tentativeG + h(nx, ny) });
        }
      }
    }
    return null;
  }
  export function findWaterPath(startX, startY, targetX, targetY) {
    const sx = clamp(Math.floor(startX), 0, W - 1), sy = clamp(Math.floor(startY), 0, H - 1);
    const tx = clamp(Math.floor(targetX), 0, W - 1), ty = clamp(Math.floor(targetY), 0, H - 1);
    if (sx === tx && sy === ty) return [];
    const startIdx = sy * W + sx, targetIdx = ty * W + tx;
    if (!isWater(state.tiles[targetIdx]) || !sameWaterRegion(startIdx, targetIdx)) return null;
    const margin = Math.max(8, Math.round(Math.hypot(tx - sx, ty - sy) * .6));
    const boxed = searchWaterAStar(sx, sy, tx, ty,
      Math.max(0, Math.min(sx, tx) - margin), Math.max(0, Math.min(sy, ty) - margin),
      Math.min(W - 1, Math.max(sx, tx) + margin), Math.min(H - 1, Math.max(sy, ty) + margin));
    if (boxed) return boxed;
    return searchWaterAStar(sx, sy, tx, ty, 0, 0, W - 1, H - 1);
  }

  export function coastalAnchor(c) {
    if (c.seaAnchorIdx != null) return c.seaAnchorIdx;
    let best = null, bestDist = Infinity;
    for (const idx of (c.claimedTiles || [])) {
      const x = idx % W, y = (idx / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = tile(x + dx, y + dy);
        if (!t || !isWater(t)) continue;
        const d = Math.hypot((x + dx) - c.x, (y + dy) - c.y);
        if (d < bestDist) { bestDist = d; best = t.y * W + t.x; }
      }
    }
    c.seaAnchorIdx = best;
    return best;
  }

  // --- Route lifecycle -----------------------------------------------------
  export const SEA_TRADE_SCAN_INTERVAL = 8;   // in-game hours between looking for brand-new routes
  export const SEA_TRADE_MAX_RANGE = 170;     // straight-line cap, cheap to check before ever pathfinding
  export const SEA_TRADE_GOLD_PER_DELIVERY = 16;    // per kingdom, per arrival
  export const SEA_TRADE_CULTURE_PER_DELIVERY = 7;  // per city, per arrival

  export function updateSeaTrade() {
    state.seaTradeRoutes ||= [];
    for (const route of state.seaTradeRoutes) {
      const cityA = state.cities.find(c => c.id === route.cityAId);
      const cityB = state.cities.find(c => c.id === route.cityBId);
      if (!cityA || !cityB || !cityA.buildings?.port || !cityB.buildings?.port) {
        route.broken = true;
        const ship = state.units.find(u => u.id === route.shipId);
        if (ship) ship.alive = false;
        const transportShip = state.units.find(u => u.id === route.transportShipId);
        if (transportShip) transportShip.alive = false;
      }
    }
    if (state.seaTradeRoutes.some(r => r.broken)) state.seaTradeRoutes = state.seaTradeRoutes.filter(r => !r.broken);

    for (const route of state.seaTradeRoutes) maybeSpawnTransportShip(route);
    updateFishingBoats();
    updateFishingCatches();

    if (worldHour() < (state.nextSeaTradeScanAt || 0) || !state.cities.length) return;
    state.nextSeaTradeScanAt = worldHour() + SEA_TRADE_SCAN_INTERVAL;
    const ports = state.cities.filter(c => (c.buildings?.port || 0) > 0);
    for (let i = 0; i < ports.length; i++) {
      for (let j = i + 1; j < ports.length; j++) {
        const a = ports[i], b = ports[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) > SEA_TRADE_MAX_RANGE) continue;
        if (state.seaTradeRoutes.some(r => (r.cityAId === a.id && r.cityBId === b.id) || (r.cityAId === b.id && r.cityBId === a.id))) continue;
        const anchorA = coastalAnchor(a), anchorB = coastalAnchor(b);
        if (anchorA == null || anchorB == null || !sameWaterRegion(anchorA, anchorB)) continue;
        const waterPath = findWaterPath(anchorA % W + .5, (anchorA / W | 0) + .5, anchorB % W + .5, (anchorB / W | 0) + .5);
        if (!waterPath) continue; // same water body per sameWaterRegion, but the node budget still gave up — a route that convoluted just doesn't form yet
        state.seaTradeRoutes.push({
          id: makeId(), cityAId: a.id, cityBId: b.id,
          path: [{ x: a.x, y: a.y }, ...waterPath, { x: b.x, y: b.y }],
          establishedAt: worldHour()
        });
        spawnCargoShip(state.seaTradeRoutes[state.seaTradeRoutes.length - 1]);
        logEvent(`${a.name} เปิดเส้นทางเดินเรือค้าขายกับ ${b.name}`, '🚢');
        showToast(`เปิดเส้นทางเดินเรือ: ${a.name} ↔ ${b.name} 🚢`);
      }
    }
  }

  export function portCity(route, end) {
    return state.cities.find(c => c.id === (end === 'A' ? route.cityAId : route.cityBId));
  }
  export const RESOURCE_LABEL = { food: 'อาหาร', wood: 'ไม้', stone: 'หิน' };
  export const SEA_CARGO_MAX_PER_LEG = 40;
  export function pickResourceToExport(city) {
    const candidates = [
      { key: 'food', spare: (city.food || 0) - 80 },
      { key: 'wood', spare: (city.wood || 0) - 50 },
      { key: 'stone', spare: (city.stone || 0) - 30 }
    ].filter(r => r.spare > 10);
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.spare - a.spare);
    const top = candidates[0];
    return { resource: top.key, amount: Math.min(top.spare * .4, SEA_CARGO_MAX_PER_LEG) };
  }
  export function deliverCargo(u, route, end) {
    const city = portCity(route, end);
    if (!city) return;
    const kingdom = state.kingdoms.find(k => k.id === city.kingdomId);
    if (kingdom) kingdom.gold = (kingdom.gold || 0) + SEA_TRADE_GOLD_PER_DELIVERY;
    city.cultureProgress = (city.cultureProgress || 0) + SEA_TRADE_CULTURE_PER_DELIVERY;
    if (u.cargo && u.cargo.amount > .5) {
      const cap = resourceCapacity(city, u.cargo.resource);
      const room = Math.max(0, cap - (city[u.cargo.resource] || 0));
      const delivered = Math.min(u.cargo.amount, room);
      city[u.cargo.resource] = (city[u.cargo.resource] || 0) + delivered;
      if (delivered > .5) logEvent(`เรือสินค้าขน${RESOURCE_LABEL[u.cargo.resource]}มาส่งที่ ${city.name} (${Math.round(delivered)})`, '📦');
    } else {
      logEvent(`เรือสินค้าเทียบท่าที่ ${city.name} นำสินค้ามาส่ง`, '⚓');
    }
    u.cargo = null;
    const pick = pickResourceToExport(city);
    if (pick) { u.cargo = pick; city[pick.resource] -= pick.amount; }
  }

  export const TRANSPORT_CULTURE_MIN = 12;
  export const TRANSPORT_MIGRATE_PER_TRIP = 2;
  export function maybeSpawnTransportShip(route) {
    if (route.transportShipId && state.units.some(u => u.id === route.transportShipId && u.alive)) return;
    const cityA = state.cities.find(c => c.id === route.cityAId);
    const cityB = state.cities.find(c => c.id === route.cityBId);
    if (!cityA || !cityB) return;
    if ((cityA.cultureLevel || 1) < TRANSPORT_CULTURE_MIN || (cityB.cultureLevel || 1) < TRANSPORT_CULTURE_MIN) return;
    const start = route.path[0];
    const u = {
      id: makeId(), type: 'ship', role: 'transport', alive: true, hp: 100,
      routeId: route.id, shipPath: route.path, pathT: 0, pathDir: 1,
      x: start.x, y: start.y, heading: 0, passengers: []
    };
    state.units.push(u);
    route.transportShipId = u.id;
    logEvent(`${cityA.name} ↔ ${cityB.name} เปิดเรือขนส่งประชากร`, '🛳️');
    showToast(`🛳️ เรือขนส่งประชากรออกเดินทาง: ${cityA.name} ↔ ${cityB.name}`);
  }
  export function transportArrive(u, route, end) {
    const city = portCity(route, end);
    if (!city) return;
    if (u.passengers && u.passengers.length) {
      let delivered = 0;
      for (const pid of u.passengers) {
        const person = state.units.find(x => x.id === pid && x.alive);
        if (!person) continue;
        person.city = city.id; person.everHadCity = true; person.governorOf = null;
        person.job = null; person.x = city.x; person.y = city.y;
        // Teleporting the passenger leaves their old workTarget/roamTarget and
        // moveTarget/path pointing at the previous city — often across water,
        // which the pathfinder can never resolve, so they'd stand frozen
        // until the AI happened to reroll. Clear that stale state and run
        // the AI immediately (same immediate-walk fix as spawnHuman/spawnAnimal)
        // so they get a valid target in their new city right away.
        person.workTarget = null; person.roamTarget = null; person.roamLabel = null;
        person.activity = null; person.moveTarget = null; person.path = null;
        runHumanAI(person, city);
        delivered++;
      }
      if (delivered) logEvent(`เรือขนส่งนำผู้อพยพ ${delivered} คนมาถึง ${city.name}`, '🛳️');
      u.passengers = [];
    }
    if ((city.pop || 0) > (city.housingCapacity || 0) * .85) {
      const candidates = state.units.filter(x => x.type === 'human' && x.alive && x.city === city.id
        && !x.royalRole && !x.governorOf && (x.job === 'claimer' || x.job === 'forager' || x.job === 'hunter'));
      u.passengers = candidates.slice(0, TRANSPORT_MIGRATE_PER_TRIP).map(p => p.id);
    }
  }

  export const FISHING_BOAT_CULTURE_MIN = 4;
  export const FISHING_CATCH_INTERVAL = 10;   // in-game hours between catches
  export const FISHING_CATCH_AMOUNT = 14;
  export const FISHING_DOCK_CATCH_INTERVAL = 7;
  export const FISHING_DOCK_CATCH_AMOUNT = 22;
  export const FISHING_GROUND_BONUS = 18;
  export const FISHING_TRIP_HOURS = 5;
  export const FISHING_GROUND_MIN_DIST = 5;
  export const FISHING_GROUND_MAX_DIST = 12;

  export function findFishingGround(c) {
    const anchor = coastalAnchor(c);
    if (anchor == null) return null;
    const ax = anchor % W, ay = (anchor / W) | 0;
    const dx = (ax + .5) - c.x, dy = (ay + .5) - c.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    for (let d = FISHING_GROUND_MAX_DIST; d >= FISHING_GROUND_MIN_DIST; d--) {
      const tx = clamp(Math.round(ax + ux * d), 0, W - 1);
      const ty = clamp(Math.round(ay + uy * d), 0, H - 1);
      if (isWater(tile(tx, ty)) && sameWaterRegion(anchor, ty * W + tx)) return { x: tx, y: ty };
    }
    return null;
  }
  export function assignFishingRoute(u, c) {
    const anchor = coastalAnchor(c);
    if (anchor == null) return false;
    const ground = findFishingGround(c);
    if (!ground) return false;
    const anchorPoint = { x: anchor % W + .5, y: (anchor / W | 0) + .5 };
    const waterPath = findWaterPath(anchorPoint.x, anchorPoint.y, ground.x + .5, ground.y + .5);
    if (!waterPath || !waterPath.length) return false;
    u.shipPath = [anchorPoint, ...waterPath];
    u.pathT = 0; u.pathDir = 1;
    u.transitHours = FISHING_TRIP_HOURS;
    return true;
  }
  export function updateFishingBoats() {
    for (const c of state.cities) {
      const eligible = isCoastalCity(c) && (c.cultureLevel || 1) >= FISHING_BOAT_CULTURE_MIN;
      const existing = c.fishingBoatId != null && state.units.find(u => u.id === c.fishingBoatId && u.alive);
      if (eligible && !existing) {
        const anchor = coastalAnchor(c);
        if (anchor == null) continue;
        const u = {
          id: makeId(), type: 'ship', role: 'fishing', alive: true, hp: 100,
          homeCityId: c.id, x: anchor % W + .5, y: (anchor / W | 0) + .5, heading: 0,
          nextCatchAt: worldHour() + FISHING_CATCH_INTERVAL
        };
        state.units.push(u);
        c.fishingBoatId = u.id;
        logEvent(`${c.name} ต่อเรือประมงลำแรก`, '🎣');
        if ((c.buildings?.fishingDock || 0) > 0) assignFishingRoute(u, c);
      } else if (!eligible && existing) {
        existing.alive = false;
        c.fishingBoatId = null;
      }
    }
    for (const c of state.cities) {
      const boat = c.fishingBoatId != null && state.units.find(u => u.id === c.fishingBoatId && u.alive);
      if (!boat) continue;
      const hasDock = (c.buildings?.fishingDock || 0) > 0;
      if (hasDock && !boat.shipPath) assignFishingRoute(boat, c);
      else if (!hasDock && boat.shipPath) {
        // Dock lost somehow (razed/downgraded) — revert to moored rather
        // than leaving the boat sailing a route its city no longer backs.
        delete boat.shipPath; boat.pathT = 0; boat.pathDir = 1; delete boat.transitHours;
        const anchor = coastalAnchor(c);
        if (anchor != null) { boat.x = anchor % W + .5; boat.y = (anchor / W | 0) + .5; }
      }
    }
  }
  export function fishingBoatArrive(u, end) {
    const city = state.cities.find(c => c.id === u.homeCityId);
    if (!city) return;
    if (end === 'B') {
      logEvent(`เรือประมงของ ${city.name} ถึงแหล่งจับปลากลางทะเล`, '🎣');
      return;
    }
    const room = Math.max(0, resourceCapacity(city, 'food') - (city.food || 0));
    const bonus = Math.min(FISHING_GROUND_BONUS, room);
    city.food = (city.food || 0) + bonus;
    if (bonus > .5) logEvent(`เรือประมงของ ${city.name} กลับเข้าฝั่งพร้อมปลาที่จับได้`, '🎣');
  }
  export function updateFishingCatches() {
    for (const u of state.units) {
      if (u.type !== 'ship' || u.role !== 'fishing' || !u.alive) continue;
      if (worldHour() < (u.nextCatchAt || 0)) continue;
      const city = state.cities.find(c => c.id === u.homeCityId);
      if (!city) { u.alive = false; continue; }
      const hasDock = (city.buildings?.fishingDock || 0) > 0;
      u.nextCatchAt = worldHour() + (hasDock ? FISHING_DOCK_CATCH_INTERVAL : FISHING_CATCH_INTERVAL);
      const room = Math.max(0, resourceCapacity(city, 'food') - (city.food || 0));
      const catchAmt = Math.min(hasDock ? FISHING_DOCK_CATCH_AMOUNT : FISHING_CATCH_AMOUNT, room);
      city.food = (city.food || 0) + catchAmt;
      if (catchAmt > .5 && Math.random() < .2) logEvent(`เรือประมงของ ${city.name} นำปลากลับมาส่ง`, '🎣');
    }
  }

  export const SHIP_TRANSIT_HOURS = 14;

  export function spawnCargoShip(route) {
    const start = route.path[0];
    const u = {
      id: makeId(), type: 'ship', role: 'cargo', alive: true, hp: 100,
      routeId: route.id, shipPath: route.path, pathT: 0, pathDir: 1,
      x: start.x, y: start.y, heading: 0
    };
    state.units.push(u);
    route.shipId = u.id;
    return u.id;
  }

  export function updateShipUnits(dtMs) {
    if (session.speed <= 0) return;
    const gameHours = (dtMs * session.speed) / MS_PER_GAME_HOUR;
    if (gameHours <= 0) return;
    for (const u of state.units) {
      if (u.type !== 'ship' || !u.alive || !u.shipPath) continue;
      const step = gameHours / (u.transitHours || SHIP_TRANSIT_HOURS);
      const prevT = u.pathT;
      u.pathT += step * u.pathDir;
      let arrivedEnd = null;
      if (u.pathT >= 1) { u.pathT = 1; u.pathDir = -1; if (prevT < 1) arrivedEnd = 'B'; }
      else if (u.pathT <= 0) { u.pathT = 0; u.pathDir = 1; if (prevT > 0) arrivedEnd = 'A'; }
      const p = pointAlongPath(u.shipPath, u.pathT);
      u.x = p.x; u.y = p.y;
      if (p.heading != null) u.heading = p.heading;
      if (arrivedEnd) {
        if (u.role === 'fishing') { fishingBoatArrive(u, arrivedEnd); continue; }
        const route = state.seaTradeRoutes?.find(r => r.id === u.routeId);
        if (route) {
          if (u.role === 'transport') transportArrive(u, route, arrivedEnd);
          else deliverCargo(u, route, arrivedEnd);
        }
      }
    }
  }

  export const SHIP_HULL_COLOR = { cargo: '#7d5a3d', fishing: '#3f6b4f', transport: '#5c6f8a' };
  export function drawShipGlyph(px, py, heading, role) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading || 0);
    ctx.fillStyle = 'rgba(20,14,10,.3)';
    ctx.beginPath(); ctx.ellipse(0, 2.6, 5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SHIP_HULL_COLOR[role] || SHIP_HULL_COLOR.cargo;
    ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(5, 1); ctx.lineTo(3, 3); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8e0c8';
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, -5); ctx.lineTo(4, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3c2e22'; ctx.fillRect(-.4, -5, .8, 6);
    ctx.restore();
  }

  export function pointAlongPath(path, t) {
    if (path.length < 2) return path[0] || { x: 0, y: 0 };
    const totalSegs = path.length - 1;
    const scaled = clamp(t, 0, 1) * totalSegs;
    const i = clamp(Math.floor(scaled), 0, totalSegs - 1);
    const localT = scaled - i;
    const p0 = path[i], p1 = path[i + 1];
    return { x: p0.x + (p1.x - p0.x) * localT, y: p0.y + (p1.y - p0.y) * localT, heading: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
  }
  export function drawSeaTradeRoutes(now) {
    if (!state.seaTradeRoutes || !state.seaTradeRoutes.length) return;
    for (const route of state.seaTradeRoutes) {
      if (!route.path || route.path.length < 2) continue;
      ctx.strokeStyle = 'rgba(210,232,246,.28)'; ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(route.path[0].x * TILE, route.path[0].y * TILE);
      for (let i = 1; i < route.path.length; i++) ctx.lineTo(route.path[i].x * TILE, route.path[i].y * TILE);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  export function drawFishingPaths() {
    for (const u of state.units) {
      if (u.type !== 'ship' || u.role !== 'fishing' || !u.alive || !u.shipPath || u.shipPath.length < 2) continue;
      ctx.strokeStyle = 'rgba(150,205,180,.22)'; ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(u.shipPath[0].x * TILE, u.shipPath[0].y * TILE);
      for (let i = 1; i < u.shipPath.length; i++) ctx.lineTo(u.shipPath[i].x * TILE, u.shipPath[i].y * TILE);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
