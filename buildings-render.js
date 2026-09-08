// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// Kingdom/city color assignment, territory overlay rendering, and all building/entity drawing (houses, farms, civic buildings, units).
// Part of the World Simulator script split (see index.html for load order).
'use strict';

import { CITY_BUILD_PLANS, GRAPHICS_PRESETS, H, LOD_BLOCK_ZOOM, LOD_FULL_ZOOM, SPECIES, TILE, W, clamp, ctx, latticeNoise, rand, session, state, tile } from './state.js';
import { DEVELOPMENT_PROJECTS, findFarmSite } from './cities-kingdoms.js';
import { drawShipGlyph } from './sea-trade.js';
import { cityOf, isHabitable } from './territory-units.js';
import { selected } from './ui.js';
import { cityLevel } from './world.js';
import { drawCapitalGlyph, drawCityGlyph, drawCivGlyph, drawCrownGlyph, drawKingdomGlyph } from './icons.js';

  export const KINGDOM_COLOR_POOL = [
    '#e0605f', '#e8a23c', '#e0cf4a', '#5aa9e6', '#c96fd8', '#4fd6b0',
    '#ff8b5e', '#7fd1e0', '#c2e05f', '#e05fa0', '#5fe0a0', '#9d7fe0'
  ];
  export function assignKingdomColor(kingdom) {
    const used = new Set(state.kingdoms.filter(k => k !== kingdom && k.color).map(k => k.color));
    const available = KINGDOM_COLOR_POOL.filter(c => !used.has(c));
    let color;
    if (available.length) {
      color = available[Math.floor(Math.random() * available.length)];
    } else {
      let hue = Math.random() * 360, tries = 0;
      color = `hsl(${hue.toFixed(0)},62%,58%)`;
      while (used.has(color) && tries < 60) { hue = (hue + 47) % 360; color = `hsl(${hue.toFixed(0)},62%,58%)`; tries++; }
    }
    kingdom.color = color;
    return color;
  }

  export const CITY_FALLBACK_COLOR_POOL = ['#e0605f', '#e8a23c', '#e0cf4a', '#5aa9e6', '#c96fd8', '#4fd6b0'];
  export function fallbackCityColor(id) {
    const n = Math.abs(Number(id) || 0);
    const hash = (n * 2654435761 + (state.seed || 0) * 97) >>> 0;
    return CITY_FALLBACK_COLOR_POOL[hash % CITY_FALLBACK_COLOR_POOL.length];
  }
  export function territoryColor(id) {
    const kingdom = state.kingdoms.find(k => k.id === id);
    if (kingdom) return kingdom.color || assignKingdomColor(kingdom);
    return fallbackCityColor(id);
  }

  export const CIV_COLOR_POOL = [
    '#f2c14e', '#7ee3d8', '#d883e0', '#8bd17f', '#f08a5d', '#6fa8e0', '#e0537e', '#b7e05f'
  ];
  export function civTerritoryColor(id) {
    const n = Math.abs(Number(id) || 0);
    const hash = (n * 40503 + (state.seed || 0) * 131) >>> 0;
    return CIV_COLOR_POOL[hash % CIV_COLOR_POOL.length];
  }

  export function withAlpha(hex, alpha) {
    const value = hex.replace('#', '');
    const number = parseInt(value.length === 3 ? value.split('').map(x => x + x).join('') : value, 16);
    return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
  }

  export function territoryOwner(x, y) {
    if (session.overlay === 'civilization') {
      if (!session.civGrid) return null;
      const kingdomId = session.civGrid[y * W + x];
      if (kingdomId === -1) return null;
      const kingdom = state.kingdoms.find(k => k.id === kingdomId);
      if (!kingdom) return null;
      return { key: `civ:${kingdom.id}`, color: civTerritoryColor(kingdom.id), kingdom };
    }
    if (!session.territoryGrid) return null;
    const cityId = session.territoryGrid[y * W + x];
    if (cityId === -1) return null;
    const city = state.cities.find(c => c.id === cityId);
    if (!city) return null;
    if (session.overlay === 'kingdom' && !city.kingdomId) return null;
    const key = session.overlay === 'kingdom' ? `kingdom:${city.kingdomId}` : `city:${city.id}`;
    return {
      key,
      // A city is the visible face of its kingdom. Once it belongs to a
      // kingdom, both overlays must use that kingdom's exact color.
      color: territoryColor(city.kingdomId || city.id),
      city
    };
  }

  export function drawTerritories(left, right, top, bottom) {
    if (session.overlay === 'none') return;
    const sx = Math.max(0, Math.floor(left / TILE) - 1), ex = Math.min(W, Math.ceil(right / TILE) + 1);
    const sy = Math.max(0, Math.floor(top / TILE) - 1), ey = Math.min(H, Math.ceil(bottom / TILE) + 1);
    const owners = new Map();
    for (let y = sy; y < ey; y++) for (let x = sx; x < ex; x++) owners.set(`${x},${y}`, territoryOwner(x, y));
    const now = performance.now();
    for (let y = sy; y < ey; y++) for (let x = sx; x < ex; x++) {
      const owner = owners.get(`${x},${y}`);
      if (!owner) continue;
      const t = tile(x, y);
      if (t && t.terrain === 'deepWater') continue;
      const px = x * TILE, py = y * TILE;
      const isCiv = session.overlay === 'civilization';
      const claimedX = isCiv ? owner.kingdom.civLastClaimedX : owner.city.lastClaimedX;
      const claimedY = isCiv ? owner.kingdom.civLastClaimedY : owner.city.lastClaimedY;
      const claimedAt = isCiv ? owner.kingdom.civLastClaimedAt : owner.city.lastClaimedAt;
      const justClaimed = claimedX === x && claimedY === y;
      const sinceFlash = now - (claimedAt ?? -9999);
      const flashBoost = (justClaimed && sinceFlash >= 0 && sinceFlash < 900) ? (1 - sinceFlash / 900) * .35 : 0;
      ctx.fillStyle = `rgba(10, 14, 10, ${.14 + flashBoost * .3})`;
      ctx.fillRect(px, py, TILE + .3, TILE + .3);
      ctx.fillStyle = withAlpha(owner.color, (session.overlay === 'kingdom' ? .34 : .26) + flashBoost);
      ctx.fillRect(px, py, TILE + .3, TILE + .3);
      const leftOwner = owners.get(`${x - 1},${y}`), topOwner = owners.get(`${x},${y - 1}`);
      const rightOwner = owners.get(`${x + 1},${y}`), bottomOwner = owners.get(`${x},${y + 1}`);
      const edgeLeft = !leftOwner || leftOwner.key !== owner.key;
      const edgeTop = !topOwner || topOwner.key !== owner.key;
      const edgeRight = !rightOwner || rightOwner.key !== owner.key;
      const edgeBottom = !bottomOwner || bottomOwner.key !== owner.key;
      if (edgeLeft || edgeTop || edgeRight || edgeBottom) {
        ctx.strokeStyle = 'rgba(15, 18, 15, .65)'; ctx.lineWidth = 3.2;
        if (edgeLeft) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + TILE); ctx.stroke(); }
        if (edgeTop) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + TILE, py); ctx.stroke(); }
        if (edgeRight) { ctx.beginPath(); ctx.moveTo(px + TILE, py); ctx.lineTo(px + TILE, py + TILE); ctx.stroke(); }
        if (edgeBottom) { ctx.beginPath(); ctx.moveTo(px, py + TILE); ctx.lineTo(px + TILE, py + TILE); ctx.stroke(); }
        ctx.strokeStyle = withAlpha(owner.color, 1); ctx.lineWidth = 1.6;
        if (edgeLeft) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + TILE); ctx.stroke(); }
        if (edgeTop) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + TILE, py); ctx.stroke(); }
        if (edgeRight) { ctx.beginPath(); ctx.moveTo(px + TILE, py); ctx.lineTo(px + TILE, py + TILE); ctx.stroke(); }
        if (edgeBottom) { ctx.beginPath(); ctx.moveTo(px, py + TILE); ctx.lineTo(px + TILE, py + TILE); ctx.stroke(); }
      }
    }
  }

  export function drawWindmill(px, py, now) {
    const hubY = py - 13;
    ctx.fillStyle = '#241b1670'; ctx.beginPath(); ctx.ellipse(px, py + 3, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9bfa9'; ctx.beginPath();
    ctx.moveTo(px - 4, py + 2); ctx.lineTo(px - 2.4, hubY); ctx.lineTo(px + 2.4, hubY); ctx.lineTo(px + 4, py + 2);
    ctx.closePath(); ctx.fill();
    // The four blades spin slowly, purely cosmetic, so a farm cluster reads
    // as alive at a glance even before any crop plots have been drawn.
    const spin = (now || 0) / 900;
    ctx.strokeStyle = '#efe6d2'; ctx.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) {
      const angle = spin + (Math.PI / 2) * i;
      ctx.beginPath(); ctx.moveTo(px, hubY);
      ctx.lineTo(px + Math.cos(angle) * 8, hubY + Math.sin(angle) * 8);
      ctx.stroke();
    }
    ctx.fillStyle = '#4b3d2c'; ctx.beginPath(); ctx.arc(px, hubY, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  export function drawFarmPlots(c) {
    const now = performance.now();
    for (const center of (c.farmCenters || [])) {
      drawWindmill(center.x * TILE, center.y * TILE, now);
    }
    for (const idx of (c.farmTiles || []).slice(0, 300)) {
      const fx = (idx % W + .5) * TILE;
      const fy = (Math.floor(idx / W) + .5) * TILE;
      ctx.fillStyle = '#b9904eaa'; ctx.fillRect(fx - 6, fy - 5, 12, 10);
      ctx.strokeStyle = '#ead18a99'; ctx.lineWidth = 1;
      for (let line = -3; line <= 3; line += 3) {
        ctx.beginPath(); ctx.moveTo(fx + line, fy - 4); ctx.lineTo(fx + line - 3, fy + 4); ctx.stroke();
      }
    }
  }

  export function cityColor(c) {
    return territoryColor(c.kingdomId || c.id);
  }

  export const HOUSE_SHAPES = {
    human(x, y, index, wall, roof, level) {
      // Stone footing grounds the timber walls.
      ctx.fillStyle = '#5a4a3d'; ctx.fillRect(x - 5.5, y + 1.6, 11, 2.4);
      ctx.fillStyle = wall; ctx.fillRect(x - 5, y - 4, 10, 6.2);
      // A thin outline keeps the wall reading as one crisp block instead of
      // blending into a same-toned roof face behind it.
      ctx.strokeStyle = withAlpha('#2c231c', .4); ctx.lineWidth = .5;
      ctx.strokeRect(x - 5, y - 4, 10, 6.2);
      ctx.fillStyle = roof; ctx.beginPath();
      ctx.moveTo(x - 7.6, y - 3.8); ctx.lineTo(x, y - 10.4); ctx.lineTo(x, y - 3.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = withAlpha(roof, .76); ctx.beginPath();
      ctx.moveTo(x, y - 10.4); ctx.lineTo(x + 7.6, y - 3.8); ctx.lineTo(x, y - 3.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4b3228'; ctx.fillRect(x - 1.4, y - 1.2, 2.8, 3.4);
      const glass = index % 2 ? '#f6df8a' : '#b9ddda';
      ctx.fillStyle = glass; ctx.fillRect(x - 4.2, y - 2.2, 2.2, 2.2); ctx.fillRect(x + 2, y - 2.2, 2.2, 2.2);
      ctx.strokeStyle = '#4b3228'; ctx.lineWidth = .5;
      ctx.strokeRect(x - 4.2, y - 2.2, 2.2, 2.2); ctx.strokeRect(x + 2, y - 2.2, 2.2, 2.2);
      if (level >= 3 && index % 4 === 0) {
        ctx.fillStyle = '#55433b'; ctx.fillRect(x + 3, y - 9, 2, 5);
        // A lazy curl of smoke, drifting differently per house so a whole
        // district of chimneys doesn't breathe in unison.
        const t = performance.now() / 900 + index * 1.7;
        ctx.strokeStyle = 'rgba(224,224,224,.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 4, y - 9);
        ctx.quadraticCurveTo(x + 4 + Math.sin(t) * 2, y - 13, x + 4 + Math.sin(t * 1.3) * 3, y - 17);
        ctx.stroke();
      }
    },
    elf(x, y, index, wall, roof, level) {
      // A slender trunk lifts the whole dwelling off the forest floor.
      ctx.fillStyle = '#5c4632'; ctx.fillRect(x - 1.1, y - 5.5, 2.2, 7.5);
      ctx.strokeStyle = '#7a6448'; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(x - 2, y - 3.5); ctx.lineTo(x - 1.6, y + 1.8);
      ctx.moveTo(x + 2, y - 3.5); ctx.lineTo(x + 1.6, y + 1.8); ctx.stroke();
      // Organic, rounded pod instead of a boxy wall — a touch fuller than
      // before so it doesn't look pinched between the roof and the trunk.
      ctx.fillStyle = wall;
      ctx.beginPath(); ctx.ellipse(x, y - 8, 5.8, 4.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha('#3f5c3a', .35); ctx.lineWidth = .5;
      ctx.beginPath(); ctx.ellipse(x, y - 8, 5.8, 4.6, 0, 0, Math.PI * 2); ctx.stroke();
      // Canopy roof built from overlapping leaf-clusters, not a hard peak.
      ctx.fillStyle = roof;
      for (const [dx, dy, r] of [[-3.2, -12.2, 3.4], [3.2, -12.6, 3.6], [0, -14.9, 3.8]]) {
        ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = index % 2 ? '#f6df8a' : '#b9ddda';
      ctx.beginPath(); ctx.arc(x, y - 8, 1.6, 0, Math.PI * 2); ctx.fill();
      if (level >= 3 && index % 4 === 0) {
        // A tiny lantern instead of a chimney — elves don't burn wood
        // indoors, but the glow reads the same "someone's home" signal.
        const pulse = .55 + Math.sin(performance.now() / 500 + index) * .25;
        ctx.fillStyle = `rgba(246,223,138,${pulse})`;
        ctx.beginPath(); ctx.arc(x + 5.2, y - 8, 1, 0, Math.PI * 2); ctx.fill();
      }
    },
    dwarf(x, y, index, wall, roof, level) {
      // Built low and wide, half sunk into the hillside — one stone dome
      // rather than raised timber walls.
      ctx.fillStyle = wall; ctx.beginPath();
      ctx.moveTo(x - 7, y + 2); ctx.arc(x, y - 1, 7, Math.PI, 0); ctx.lineTo(x + 7, y + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = withAlpha(roof, .55); ctx.lineWidth = .7;
      for (let r = 2.2; r <= 6; r += 1.9) { ctx.beginPath(); ctx.arc(x, y - 1, r, Math.PI, 0); ctx.stroke(); }
      // A brighter rim along the very top catches the light, so the dome
      // reads as curved stone rather than a flat gray slab.
      ctx.strokeStyle = withAlpha('#e8e2d4', .3); ctx.lineWidth = .8;
      ctx.beginPath(); ctx.arc(x, y - 1, 6.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      // A stout arched door, a touch taller and narrower for real proportion.
      ctx.fillStyle = '#3a2c22'; ctx.beginPath();
      ctx.moveTo(x - 1.7, y + 2); ctx.lineTo(x - 1.7, y - .8); ctx.arc(x, y - .8, 1.7, Math.PI, 0); ctx.lineTo(x + 1.7, y + 2); ctx.closePath(); ctx.fill();
      const glass = index % 2 ? '#f6df8a' : '#b9ddda';
      ctx.fillStyle = glass; ctx.fillRect(x - 5.5, y - .8, 1.6, 1.6); ctx.fillRect(x + 3.9, y - .8, 1.6, 1.6);
      if (level >= 3 && index % 4 === 0) {
        // A squat stone flue for the forge every dwarf keeps burning.
        ctx.fillStyle = withAlpha(roof, .85); ctx.fillRect(x + 3.8, y - 6.5, 2, 3.2);
      }
    },
    orc(x, y, index, wall, roof, level) {
      // Lashed together from raw, uneven timber — two mismatched corner
      // posts and a lopsided hide roof instead of a tidy gable.
      ctx.fillStyle = '#4b3a2c';
      ctx.fillRect(x - 5.6, y - 3.2, 1.4, 5.4); ctx.fillRect(x + 4.2, y - 4.2, 1.4, 6.4);
      // Cap each post so it reads as a solid timber end rather than a
      // rectangle sliced flat by the wall behind it.
      ctx.fillStyle = '#6b5540'; ctx.fillRect(x - 5.9, y - 3.6, 2, .8); ctx.fillRect(x + 3.9, y - 4.6, 2, .8);
      ctx.fillStyle = wall; ctx.beginPath();
      ctx.moveTo(x - 5.6, y + 2.2); ctx.lineTo(x - 5.6, y - 3); ctx.lineTo(x + 4.6, y - 4); ctx.lineTo(x + 4.6, y + 2.2);
      ctx.closePath(); ctx.fill();
      // Ragged hide/thatch roof, tilted rather than symmetrical.
      ctx.fillStyle = roof; ctx.beginPath();
      ctx.moveTo(x - 7.6, y - 3.2); ctx.lineTo(x - 1, y - 10); ctx.lineTo(x + 6.6, y - 4.2);
      ctx.lineTo(x + 4.6, y - 2.6); ctx.lineTo(x - 6, y - 1.8); ctx.closePath(); ctx.fill();
      // Crossed bone/spike trophies on the ridge — cheap menace, no extra sprite.
      ctx.strokeStyle = '#d8d2c2'; ctx.lineWidth = .9; ctx.beginPath();
      ctx.moveTo(x - 2, y - 9.4); ctx.lineTo(x - 3.6, y - 12.6);
      ctx.moveTo(x, y - 9.7); ctx.lineTo(x + 1.4, y - 13); ctx.stroke();
      // No proper door, just a dark gap in the hides.
      ctx.fillStyle = '#1c140f'; ctx.fillRect(x - 1.6, y - 1.2, 3, 3.6);
      ctx.fillStyle = (index % 2 ? '#f6df8a' : '#b9ddda') + 'a0';
      ctx.fillRect(x + 1.6, y - 2, 1.8, 1.8);
    }
  };

  export function drawHouse(x, y, index, race, level, realmColor) {
    const wall = index % 5 === 0 ? withAlpha(realmColor, .9) : withAlpha(realmColor, .72);
    const roof = realmColor;
    const houseScale = .8 + latticeNoise(x * .17 + index * 7, y * .13 + index * 3, state.seed) * .5;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(houseScale, houseScale);
    ctx.fillStyle = 'rgba(20,14,10,.32)';
    ctx.beginPath(); ctx.ellipse(0, 4.2, 7.4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    (HOUSE_SHAPES[race] || HOUSE_SHAPES.human)(0, 0, index, wall, roof, level);
    ctx.restore();
  }

  export const CIVIC_CORE_RADIUS = 1;
  export function isCivicCore(c, x, y) {
    return Math.max(Math.abs(x - Math.floor(c.x)), Math.abs(y - Math.floor(c.y))) <= CIVIC_CORE_RADIUS;
  }
  export function shuffled(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  export function ensureHouseSlots(c, count) {
    c.houseSlots ||= [];
    if (c.houseSlots.length >= count) return c.houseSlots;
    const used = new Set(c.houseSlots);
    const candidates = shuffled((c.claimedTiles || [])
      .filter(idx => !used.has(idx))
      .map(idx => state.tiles[idx])
      .filter(t => t && isHabitable(t) && t.terrain !== 'forest' && !t.tree && !t.ore && !t.berries
        && !t.farmCityId && !t.houseCityId && !t.buildingCityId && !isCivicCore(c, t.x, t.y)));
    for (const t of candidates) {
      if (c.houseSlots.length >= count) break;
      t.houseCityId = c.id;
      c.houseSlots.push(t.y * W + t.x);
    }
    return c.houseSlots;
  }
  export function houseSlotPoint(c, index) {
    const idx = ensureHouseSlots(c, index + 1)[index];
    return idx == null ? { x: c.x, y: c.y } : { x: idx % W + .5, y: Math.floor(idx / W) + .5 };
  }

  export function ensureBuildingSlot(c, key, index = 0) {
    c.buildingSlots ||= {};
    c.buildingSlots[key] ||= [];
    if (c.buildingSlots[key][index] != null) return c.buildingSlots[key][index];
    const used = new Set([...(c.houseSlots || []), ...Object.values(c.buildingSlots).flat()]);
    const candidates = shuffled((c.claimedTiles || [])
      .filter(idx => !used.has(idx))
      .map(idx => state.tiles[idx])
      .filter(t => t && isHabitable(t) && t.terrain !== 'forest' && !t.tree && !t.ore && !t.berries
        && !t.farmCityId && !t.houseCityId && !t.buildingCityId && !isCivicCore(c, t.x, t.y)));
    const chosen = candidates[0];
    if (!chosen) return null;
    chosen.buildingCityId = c.id;
    const idx = chosen.y * W + chosen.x;
    c.buildingSlots[key][index] = idx;
    return idx;
  }
  export function buildingSlotPoint(c, key, index = 0) {
    const idx = ensureBuildingSlot(c, key, index);
    return idx == null ? { x: c.x, y: c.y } : { x: idx % W + .5, y: Math.floor(idx / W) + .5 };
  }

  // Thai labels for the building-slot tile info panel (ui.js showTile), and
  // a lookup from a tile index back to which building/index sits there —
  // so tapping a tile can say what's actually on it instead of just terrain.
  export const BUILDING_LABELS = {
    granary: 'ยุ้งฉาง', woodStore: 'คลังไม้', oreStore: 'คลังแร่', market: 'ตลาด',
    barracks: 'ค่ายทหาร', temple: 'วิหาร', workshop: 'โรงงาน', tavern: 'โรงเตี๊ยม',
    school: 'โรงเรียน', library: 'ห้องสมุด', port: 'ท่าเรือ', townCenter: 'ศูนย์กลางเมือง',
    plaza: 'ลานเมือง', fort: 'ป้อมปราการ', fishingDock: 'ท่าประมง',
    stoneMine: 'เหมืองหิน', ironMine: 'เหมืองเหล็ก', goldMine: 'เหมืองทอง'
  };
  export function findBuildingAt(c, idx) {
    if (!c || !c.buildingSlots) return null;
    for (const key of Object.keys(c.buildingSlots)) {
      const i = (c.buildingSlots[key] || []).indexOf(idx);
      if (i !== -1) return { key, index: i };
    }
    return null;
  }

  export function drawCityFootprint(c) {
    // This is the town's real claimed ground, not a wall or a decorative
    // square. It starts around the civic centre and grows one grid at a time.
    const tint = cityColor(c);
    for (const idx of (c.claimedTiles || [])) {
      const x = idx % W, y = Math.floor(idx / W);
      ctx.fillStyle = withAlpha(tint, .10);
      ctx.fillRect(x * TILE, y * TILE, TILE + .2, TILE + .2);
    }
  }

  export function drawRoads(c, px, py, houseCount, extraPoints = []) {
    if (houseCount <= 0 && !extraPoints.length) return;
    const points = [{ x: px, y: py }];
    ctx.strokeStyle = 'rgba(198,168,118,.5)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const connect = (hx, hy) => {
      let best = points[0], bestD = Math.hypot(best.x - hx, best.y - hy);
      for (let j = 1; j < points.length; j++) {
        const d = Math.hypot(points[j].x - hx, points[j].y - hy);
        if (d < bestD) { bestD = d; best = points[j]; }
      }
      ctx.beginPath(); ctx.moveTo(best.x, best.y); ctx.lineTo(hx, hy); ctx.stroke();
      points.push({ x: hx, y: hy });
    };
    for (let i = 0; i < houseCount; i++) {
      const point = houseSlotPoint(c, i);
      connect(point.x * TILE, point.y * TILE);
    }
    for (const p of extraPoints) connect(p.x, p.y);
  }

  export function drawCityDistrict(c, px, py, info) {
    const houseCount = Math.min(c.houses || 0, Math.max(0, (c.claimedTiles || []).length - 1));
    // A new settlement starts as people on the land. Do not paint a ready-made
    // district before the first construction project has actually finished.
    if (!c.townHallBuilt && !c.palaceBuilt && houseCount === 0 && !(c.farmAreas || 0)) return;
    drawFarmPlots(c);
    const specialPoints = [];
    for (const key of ['barracks', 'temple', 'workshop', 'tavern', 'school', 'library', 'port', 'townCenter', 'plaza', 'fort', 'fishingDock', 'stoneMine', 'ironMine', 'goldMine']) {
      if (c.buildings?.[key]) { const p = buildingSlotPoint(c, key); specialPoints.push({ x: p.x * TILE, y: p.y * TILE }); }
    }
    for (const key of ['granary', 'woodStore', 'oreStore', 'market']) {
      const count = c.buildings?.[key] || 0;
      for (let i = 0; i < count; i++) {
        const p = buildingSlotPoint(c, key, i);
        specialPoints.push({ x: p.x * TILE, y: p.y * TILE });
      }
    }
    drawRoads(c, px, py, houseCount, specialPoints);

    for (let i = 0; i < houseCount; i++) {
      const point = houseSlotPoint(c, i);
      drawHouse(point.x * TILE, point.y * TILE, i, c.race, info.level, cityColor(c));
    }
  }

  export function drawScaffold(x, y, width, height, progress, accent = '#dca15b') {
    const left = x - width / 2, top = y - height / 2;
    const right = x + width / 2, bottom = y + height / 2;
    const level = clamp(progress, 0, 1);
    ctx.fillStyle = '#33271f88';
    ctx.fillRect(left - 4, bottom - 1, width + 8, 4);
    ctx.strokeStyle = '#6e4c32'; ctx.lineWidth = 2;
    ctx.strokeRect(left - 5, top - 5, width + 10, height + 8);
    ctx.beginPath();
    ctx.moveTo(left - 5, bottom); ctx.lineTo(left - 5, top - 5);
    ctx.moveTo(right + 5, bottom); ctx.lineTo(right + 5, top - 5);
    ctx.moveTo(left - 5, top + height * .45); ctx.lineTo(right + 5, top + height * .45);
    ctx.stroke();
    ctx.strokeStyle = '#9a7047'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left - 5, bottom); ctx.lineTo(left + 5, top - 5);
    ctx.moveTo(right + 5, bottom); ctx.lineTo(right - 5, top - 5);
    ctx.stroke();
    // The solid portion rises with the real project progress, leaving the
    // upper half as timber framing until the project is actually complete.
    const builtHeight = Math.max(2, height * level);
    ctx.fillStyle = `${accent}cc`;
    ctx.fillRect(left + 2, bottom - builtHeight, width - 4, builtHeight);
    ctx.strokeStyle = '#f0c77a'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const beamY = bottom - builtHeight + (builtHeight / 4) * i;
      if (beamY < bottom - 2) {
        ctx.beginPath(); ctx.moveTo(left + 2, beamY); ctx.lineTo(right - 2, beamY); ctx.stroke();
      }
    }
    ctx.fillStyle = '#f5dfa1'; ctx.fillRect(x - 17, top - 15, 34, 4);
    ctx.fillStyle = '#51402f'; ctx.fillRect(x - 16, top - 14, 32 * level, 2);
  }

  export function drawConstructionSite(c, px, py, info) {
    if (!c.project) return;
    const plan = CITY_BUILD_PLANS[c.project] || DEVELOPMENT_PROJECTS[c.project];
    if (!plan) return;
    if (c.project === 'townHall') {
      const centerTile = tile(Math.floor(c.x), Math.floor(c.y));
      if (centerTile && (centerTile.terrain === 'forest' || centerTile.tree)) {
        if (session.view.zoom >= .75) {
          const clearing = clamp((centerTile.chopProgress || 0) / 4, 0, 1);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
          ctx.fillText(`🪓 แผ้วถางป่า ${Math.floor(clearing * 100)}%`, px, py - 22);
        }
        return;
      }
    }
    const progress = clamp((c.projectProgress || 0) / plan.needed, 0, 1);
    let labelX = px, labelY = py;
    if (c.project === 'house') {
      const point = houseSlotPoint(c, c.houses || 0);
      drawScaffold(point.x * TILE, point.y * TILE, 13, 11, progress, cityColor(c));
      labelX = point.x * TILE; labelY = point.y * TILE;
    } else if (c.project === 'farm') {
      const site = findFarmSite(c);
      const farmX = site ? (site.x + .5) * TILE : px;
      const farmY = site ? (site.y + .5) * TILE : py;
      ctx.fillStyle = '#6b4e32aa'; ctx.fillRect(farmX - 9, farmY - 7, 18, 14);
      ctx.strokeStyle = '#dfbd72'; ctx.lineWidth = 1.5;
      for (let line = -5; line <= 5; line += 5) {
        ctx.beginPath(); ctx.moveTo(farmX + line, farmY - 5); ctx.lineTo(farmX + line - 3, farmY + 5); ctx.stroke();
      }
      ctx.fillStyle = '#f5dfa1'; ctx.fillRect(farmX - 17, farmY - 18, 34, 4);
      ctx.fillStyle = '#51402f'; ctx.fillRect(farmX - 16, farmY - 17, 32 * progress, 2);
      labelX = farmX; labelY = farmY;
    } else if (c.project === 'townHall' || c.project === 'palace') {
      const palace = c.project === 'palace';
      drawScaffold(px, py - (palace ? 5 : 0), palace ? 35 : 27, palace ? 27 : 21, progress, cityColor(c));
      labelX = px; labelY = py;
    } else {
      const nextIndex = c.buildings?.[c.project] || 0;
      const point = buildingSlotPoint(c, c.project, nextIndex);
      drawScaffold(point.x * TILE, point.y * TILE, 27, 21, progress, cityColor(c));
      labelX = point.x * TILE; labelY = point.y * TILE;
    }
    if (session.view.zoom >= .75) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`ก่อสร้าง${plan.label} ${Math.floor(progress * 100)}%`, labelX, labelY - 34);
    }
  }

  export const TOWNHALL_SHAPES = {
    human(px, py, width, height, color) {
      const top = py - height / 2, bottom = py + height / 2, hw = width / 2;
      ctx.fillStyle = '#5a4a3d'; ctx.fillRect(px - hw - 1, bottom - 2, width + 2, 3);
      ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(px - hw, top + 4, width, height - 4);
      // Exposed timber cross-bracing on the hall's face.
      ctx.strokeStyle = '#4b3228'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(px - hw, top + 4); ctx.lineTo(px, bottom - 2); ctx.moveTo(px + hw, top + 4); ctx.lineTo(px, bottom - 2);
      ctx.stroke();
      // Wide gable roof, lit and shaded faces.
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(px - hw - 4, top + 4); ctx.lineTo(px, top - 8); ctx.lineTo(px, top + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = withAlpha(color, .76); ctx.beginPath();
      ctx.moveTo(px, top - 8); ctx.lineTo(px + hw + 4, top + 4); ctx.lineTo(px, top + 4); ctx.closePath(); ctx.fill();
      // Bell cupola on the ridge, the hall's one flourish.
      ctx.fillStyle = '#8c7256'; ctx.fillRect(px - 1.6, top - 14, 3.2, 6);
      ctx.fillStyle = '#c98d3f'; ctx.beginPath();
      ctx.moveTo(px - 2.6, top - 14); ctx.lineTo(px, top - 18); ctx.lineTo(px + 2.6, top - 14); ctx.closePath(); ctx.fill();
      // Arched double door.
      ctx.fillStyle = '#3c2e29'; ctx.beginPath();
      ctx.moveTo(px - 3, bottom - 2); ctx.lineTo(px - 3, top + 9); ctx.arc(px, top + 9, 3, Math.PI, 0);
      ctx.lineTo(px + 3, bottom - 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#251b16'; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(px, top + 9); ctx.lineTo(px, bottom - 2); ctx.stroke();
      ctx.fillStyle = '#f6df8a';
      ctx.fillRect(px - hw + 2.5, top + 7, 3, 4); ctx.fillRect(px + hw - 5.5, top + 7, 3, 4);
    },
    elf(px, py, width, height, color) {
      const hw = width / 2;
      // A real trunk thick enough for a hall, not just a house-sized pole.
      ctx.fillStyle = '#5c4632'; ctx.fillRect(px - 2.2, py - height * .7, 4.4, height * 1.15);
      // A walkway ring wrapped around the trunk partway up.
      ctx.fillStyle = withAlpha(color, .8);
      ctx.beginPath(); ctx.ellipse(px, py, hw, height * .32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = withAlpha('#3f5c3a', .8); ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(px, py, hw, height * .32, 0, 0, Math.PI); ctx.stroke();
      // A fuller canopy than an ordinary house's three-leaf cluster.
      ctx.fillStyle = color;
      const topY = py - height * .95;
      for (const [dx, dy, r] of [[-hw * .5, 3, hw * .38], [hw * .5, 2, hw * .4],
        [0, -hw * .28, hw * .46], [-hw * .22, -hw * .55, hw * .3], [hw * .22, -hw * .58, hw * .3]]) {
        ctx.beginPath(); ctx.arc(px + dx, topY + dy, r, 0, Math.PI * 2); ctx.fill();
      }
      // Lanterns marking the entrance, no bare doorway.
      const pulse = .6 + Math.sin(performance.now() / 500) * .25;
      ctx.fillStyle = `rgba(246,223,138,${pulse})`;
      ctx.beginPath(); ctx.arc(px - hw * .6, py + height * .1, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + hw * .6, py + height * .1, 1.4, 0, Math.PI * 2); ctx.fill();
    },
    dwarf(px, py, width, height, color) {
      const base = py + height / 2, hw = width / 2, top = py - height / 2;
      // Carved into a stone slope rather than a free-standing dome.
      ctx.fillStyle = withAlpha(color, .85); ctx.beginPath();
      ctx.moveTo(px - hw - 3, base); ctx.lineTo(px - hw - 3, top + 3);
      ctx.arc(px, top + 3, hw + 3, Math.PI, 0); ctx.lineTo(px + hw + 3, base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = withAlpha('#2c2620', .5); ctx.lineWidth = .8;
      for (let r = hw * .35; r <= hw + 2; r += hw * .35) { ctx.beginPath(); ctx.arc(px, top + 3, r, Math.PI, 0); ctx.stroke(); }
      // Twin flanking pillars.
      ctx.fillStyle = '#8c8478';
      ctx.fillRect(px - hw - 2, top + 5, 3, base - top - 5); ctx.fillRect(px + hw - 1, top + 5, 3, base - top - 5);
      // Grand arched doorway with a carved rune lintel.
      ctx.fillStyle = '#241d18'; ctx.beginPath();
      ctx.moveTo(px - 4, base); ctx.lineTo(px - 4, top + 8); ctx.arc(px, top + 8, 4, Math.PI, 0);
      ctx.lineTo(px + 4, base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px - 5, top + 2); ctx.lineTo(px + 5, top + 2); ctx.stroke();
    },
    orc(px, py, width, height, color) {
      const top = py - height / 2, bottom = py + height / 2, hw = width / 2;
      // Reinforced longhouse: heavier corner posts than an ordinary hut.
      ctx.fillStyle = '#4b3a2c';
      ctx.fillRect(px - hw - 1.4, top + 3, 2, bottom - top - 5); ctx.fillRect(px + hw - .6, top + 1, 2, bottom - top - 3);
      ctx.fillStyle = withAlpha(color, .85); ctx.beginPath();
      ctx.moveTo(px - hw, bottom - 2); ctx.lineTo(px - hw, top + 2); ctx.lineTo(px + hw, top); ctx.lineTo(px + hw, bottom - 2);
      ctx.closePath(); ctx.fill();
      // Rope lashings across the planks.
      ctx.strokeStyle = '#c9b27a'; ctx.lineWidth = .7;
      for (let lx = -hw + 3; lx < hw; lx += 5) { ctx.beginPath(); ctx.moveTo(px + lx, top + 3); ctx.lineTo(px + lx + 2, bottom - 2); ctx.stroke(); }
      // Jagged, spiked roofline.
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(px - hw - 5, top + 2); ctx.lineTo(px - hw * .3, top - 10); ctx.lineTo(px + hw + 4, top - 3);
      ctx.lineTo(px + hw + 1, top + 1); ctx.lineTo(px - hw + 2, top - 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d8d2c2'; ctx.lineWidth = .8;
      for (const sx of [-hw * .3, -hw * .3 + 5, -hw * .3 - 5]) {
        ctx.beginPath(); ctx.moveTo(px + sx, top - 10); ctx.lineTo(px + sx + 1.5, top - 15); ctx.stroke();
      }
      // No proper door, a torn hide gap.
      ctx.fillStyle = '#1c140f'; ctx.fillRect(px - 2.4, top + height * .55, 4.6, bottom - top - height * .55 - 2);
    }
  };

  export const PALACE_SHAPES = {
    human(px, py, width, height, color) {
      const top = py - height / 2, bottom = py + height / 2, hw = width / 2;
      // Flanking wings either side of the main hall.
      ctx.fillStyle = withAlpha(color, .78);
      ctx.fillRect(px - hw - 8, top + height * .35, 8, bottom - top - height * .35);
      ctx.fillRect(px + hw, top + height * .35, 8, bottom - top - height * .35);
      ctx.fillStyle = '#5a4a3d'; ctx.fillRect(px - hw - 9, bottom - 2, width + 18, 3);
      // Main hall body.
      ctx.fillStyle = withAlpha(color, .9); ctx.fillRect(px - hw, top + 4, width, height - 4);
      ctx.strokeStyle = '#4b3228'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(px - hw, top + 4); ctx.lineTo(px, bottom - 2); ctx.moveTo(px + hw, top + 4); ctx.lineTo(px, bottom - 2);
      ctx.stroke();
      // Hip roof over the main hall.
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(px - hw - 4, top + 4); ctx.lineTo(px, top - 10); ctx.lineTo(px, top + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = withAlpha(color, .76); ctx.beginPath();
      ctx.moveTo(px, top - 10); ctx.lineTo(px + hw + 4, top + 4); ctx.lineTo(px, top + 4); ctx.closePath(); ctx.fill();
      // Corner turrets, one on each wing, with conical spires.
      for (const tx of [px - hw - 4, px + hw + 4]) {
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(tx - 2.5, top - 6, 5, height * .55);
        ctx.fillStyle = '#c9a24a'; ctx.beginPath();
        ctx.moveTo(tx - 3, top - 6); ctx.lineTo(tx, top - 13); ctx.lineTo(tx + 3, top - 6); ctx.closePath(); ctx.fill();
      }
      // Grand arched entrance, gold-trimmed.
      ctx.fillStyle = '#3c2e29'; ctx.beginPath();
      ctx.moveTo(px - 4, bottom - 2); ctx.lineTo(px - 4, top + 9); ctx.arc(px, top + 9, 4, Math.PI, 0);
      ctx.lineTo(px + 4, bottom - 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f1d27d'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, top + 9, 4, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#f6df8a';
      ctx.fillRect(px - hw + 2, top + 7, 2.6, 4); ctx.fillRect(px + hw - 4.6, top + 7, 2.6, 4);
    },
    elf(px, py, width, height, color) {
      const hw = width / 2;
      // A far thicker ancient trunk, carved with a doorway.
      ctx.fillStyle = '#5c4632'; ctx.fillRect(px - 3.2, py - height * .95, 6.4, height * 1.4);
      ctx.fillStyle = '#241d18'; ctx.beginPath(); ctx.ellipse(px, py + height * .25, 1.8, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      // Stacked canopy tiers, each wider ring bigger and higher than a
      // town hall's single cluster — a real "wedding cake" of foliage.
      const tiers = [
        { y: py - height * .25, r: hw * .55, n: 4 },
        { y: py - height * .75, r: hw * .42, n: 3 },
        { y: py - height * 1.15, r: hw * .3, n: 2 }
      ];
      for (const tier of tiers) {
        ctx.fillStyle = color;
        for (let i = 0; i < tier.n; i++) {
          const ang = (i / tier.n) * Math.PI * 2 + tier.y;
          ctx.beginPath(); ctx.arc(px + Math.cos(ang) * tier.r * .8, tier.y + Math.sin(ang) * tier.r * .3, tier.r * .6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(px, tier.y, tier.r, 0, Math.PI * 2); ctx.fill();
      }
      // A ring of glowing motifs around the trunk's base tier.
      const pulse = .6 + Math.sin(performance.now() / 500) * .25;
      ctx.fillStyle = `rgba(246,223,138,${pulse})`;
      for (const ang of [0, Math.PI * .66, Math.PI * 1.33]) {
        ctx.beginPath(); ctx.arc(px + Math.cos(ang) * hw * .5, py - height * .1 + Math.sin(ang) * hw * .2, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    },
    dwarf(px, py, width, height, color) {
      const base = py + height / 2, hw = width / 2, top = py - height / 2;
      // Full mountain gate: twin stepped towers flanking a grand arch,
      // carved deeper into the slope than the town hall's simple pillars.
      ctx.fillStyle = withAlpha(color, .88); ctx.beginPath();
      ctx.moveTo(px - hw - 6, base); ctx.lineTo(px - hw - 6, top); ctx.arc(px, top, hw + 6, Math.PI, 0);
      ctx.lineTo(px + hw + 6, base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = withAlpha('#2c2620', .5); ctx.lineWidth = .8;
      for (let r = hw * .3; r <= hw + 5; r += hw * .3) { ctx.beginPath(); ctx.arc(px, top, r, Math.PI, 0); ctx.stroke(); }
      // Twin stepped towers.
      for (const tx of [px - hw - 3, px + hw + 3]) {
        ctx.fillStyle = '#8c8478';
        ctx.fillRect(tx - 3, top - 10, 6, base - top + 10 - 4);
        ctx.fillStyle = withAlpha('#8c8478', .8); ctx.fillRect(tx - 4, top - 10, 8, 3);
        ctx.fillStyle = '#e0a63c'; ctx.fillRect(tx - 1, top - 14, 2, 4);
      }
      // Grand arch with a glowing gem inset.
      ctx.fillStyle = '#241d18'; ctx.beginPath();
      ctx.moveTo(px - 5, base); ctx.lineTo(px - 5, top + 5); ctx.arc(px, top + 5, 5, Math.PI, 0);
      ctx.lineTo(px + 5, base); ctx.closePath(); ctx.fill();
      const pulse = .65 + Math.sin(performance.now() / 450) * .25;
      ctx.fillStyle = `rgba(224,166,60,${pulse})`;
      ctx.beginPath(); ctx.arc(px, top + 1, 2, 0, Math.PI * 2); ctx.fill();
    },
    orc(px, py, width, height, color) {
      const top = py - height / 2, bottom = py + height / 2, hw = width / 2;
      // A wider, taller fortress body than the longhouse-scale town hall.
      ctx.fillStyle = '#4b3a2c';
      ctx.fillRect(px - hw - 2, top, 2.4, bottom - top - 2); ctx.fillRect(px + hw - .4, top - 3, 2.4, bottom - top + 1);
      ctx.fillStyle = withAlpha(color, .88); ctx.beginPath();
      ctx.moveTo(px - hw, bottom - 2); ctx.lineTo(px - hw, top + 1); ctx.lineTo(px + hw, top - 2); ctx.lineTo(px + hw, bottom - 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9b27a'; ctx.lineWidth = .8;
      for (let lx = -hw + 3; lx < hw; lx += 5.5) { ctx.beginPath(); ctx.moveTo(px + lx, top + 2); ctx.lineTo(px + lx + 2.5, bottom - 2); ctx.stroke(); }
      // Taller spiked towers on both sides.
      for (const tx of [px - hw - 2, px + hw + 1]) {
        ctx.fillStyle = withAlpha(color, .82); ctx.fillRect(tx - 2.6, top - 12, 5.2, height * .5);
        ctx.strokeStyle = '#d8d2c2'; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(tx - 2, top - 12); ctx.lineTo(tx - 1, top - 17); ctx.moveTo(tx + 2, top - 12); ctx.lineTo(tx + 1, top - 17); ctx.stroke();
      }
      // A skull totem looming over the entrance.
      ctx.fillStyle = '#e6ddc6'; ctx.beginPath(); ctx.arc(px, top - 6, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1c140f'; ctx.fillRect(px - 1.6, top - 6.5, 1.2, 1.6); ctx.fillRect(px + .4, top - 6.5, 1.2, 1.6);
      // Torn hide gap for a door.
      ctx.fillStyle = '#1c140f'; ctx.fillRect(px - 2.8, top + height * .5, 5.4, bottom - top - height * .5 - 2);
    }
  };

  export function drawCivicCenter(c, px, py, info, speciesInfo) {
    // The civic centre is earned through construction. Before the town hall
    // is complete, residents and the terrain are the only visible settlement.
    if (!c.townHallBuilt && !c.palaceBuilt) return;
    ctx.fillStyle = '#3b2d1e99'; ctx.beginPath(); ctx.ellipse(px, py + 9, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
    const width = c.isCapital ? 22 : info.level >= 3 ? 18 : 14;
    const height = c.isCapital ? 18 : info.level >= 3 ? 15 : 12;
    const realmColor = cityColor(c);
    const race = c.race;
    if (c.palaceBuilt) {
      (PALACE_SHAPES[race] || PALACE_SHAPES.human)(px, py, width, height, realmColor);
    } else {
      (TOWNHALL_SHAPES[race] || TOWNHALL_SHAPES.human)(px, py, width, height, realmColor);
    }
    if (c.buildings?.barracks) drawSpecialBuilding(c, 'barracks');
    if (c.buildings?.temple) drawSpecialBuilding(c, 'temple');
    if (c.buildings?.workshop) drawSpecialBuilding(c, 'workshop');
    if (c.buildings?.tavern) drawSpecialBuilding(c, 'tavern');
    if (c.buildings?.school) drawSpecialBuilding(c, 'school');
    if (c.buildings?.library) drawSpecialBuilding(c, 'library');
    if (c.buildings?.port) drawSpecialBuilding(c, 'port');
    if (c.buildings?.townCenter) drawSpecialBuilding(c, 'townCenter');
    if (c.buildings?.plaza) drawSpecialBuilding(c, 'plaza');
    if (c.buildings?.fort) drawSpecialBuilding(c, 'fort');
    if (c.buildings?.fishingDock) drawSpecialBuilding(c, 'fishingDock');
    if (c.buildings?.stoneMine) drawSpecialBuilding(c, 'stoneMine');
    if (c.buildings?.ironMine) drawSpecialBuilding(c, 'ironMine');
    if (c.buildings?.goldMine) drawSpecialBuilding(c, 'goldMine');
    for (const key of ['granary', 'woodStore', 'oreStore', 'market']) {
      const count = c.buildings?.[key] || 0;
      for (let i = 0; i < count; i++) drawSpecialBuilding(c, key, i);
    }
    if (c.isCapital) {
      ctx.fillStyle = '#6f4b3b'; ctx.fillRect(px + 10, py - 21, 2, 22);
      ctx.fillStyle = '#e05d5d'; ctx.beginPath(); ctx.moveTo(px + 12, py - 21); ctx.lineTo(px + 22, py - 18); ctx.lineTo(px + 12, py - 15); ctx.closePath(); ctx.fill();
    }
  }

  export const SPECIAL_BUILDING_SHAPES = {
    market: {
      // An open-sided stall: striped awning over a wooden counter with a
      // couple of goods crates on top.
      human(mx, my, color) {
        ctx.fillStyle = '#7d4b37'; ctx.fillRect(mx - 6, my - 3, 12, 7);
        ctx.fillStyle = '#5c3a29'; ctx.fillRect(mx - 6, my - 3, 1.5, 7); ctx.fillRect(mx + 4.5, my - 3, 1.5, 7);
        ctx.fillStyle = withAlpha(color, .85);
        ctx.beginPath(); ctx.moveTo(mx - 8, my - 5); ctx.lineTo(mx + 8, my - 5); ctx.lineTo(mx + 6, my - 8); ctx.lineTo(mx - 6, my - 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = withAlpha(color, .6);
        for (let sx = -6; sx < 8; sx += 4) { ctx.beginPath(); ctx.moveTo(mx + sx, my - 5); ctx.lineTo(mx + sx + 2, my - 5); ctx.lineTo(mx + sx + 1.3, my - 8); ctx.lineTo(mx + sx - .3, my - 8); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = '#a45a3a'; ctx.fillRect(mx - 4, my - 2, 3, 3); ctx.fillRect(mx + 1, my - 1.5, 3, 2.5);
        ctx.fillStyle = '#e8c76e'; ctx.fillRect(mx - 4, my - 2.6, 3, .8); ctx.fillRect(mx + 1, my - 2, 3, .7);
      },
      // A woven stall slung between two living poles that have sprouted
      // fresh leaves, goods glowing softly instead of sitting in crates.
      elf(mx, my, color) {
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 7, my - 8, 1.4, 12); ctx.fillRect(mx + 5.6, my - 8, 1.4, 12);
        ctx.fillStyle = withAlpha(color, .8);
        ctx.beginPath(); ctx.moveTo(mx - 8, my - 6); ctx.quadraticCurveTo(mx, my - 10, mx + 8, my - 6); ctx.lineTo(mx + 7, my - 3); ctx.quadraticCurveTo(mx, my - 6.5, mx - 7, my - 3); ctx.closePath(); ctx.fill();
        for (const [dx, r] of [[-6.2, 1.6], [6.2, 1.6], [0, 1.3]]) {
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx + dx, my - 8, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#7d5a3d'; ctx.fillRect(mx - 5, my - 1, 10, 3);
        const pulse = .6 + Math.sin(performance.now() / 500) * .25;
        ctx.fillStyle = `rgba(246,223,138,${pulse})`;
        ctx.beginPath(); ctx.arc(mx - 2, my - .5, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 2.5, my - .5, 1.1, 0, Math.PI * 2); ctx.fill();
      },
      // A squat stone counter with a hinged metal awning and gem-strung
      // wares instead of cloth-covered crates.
      dwarf(mx, my, color) {
        ctx.fillStyle = '#8c8478'; ctx.fillRect(mx - 6, my - 3, 12, 7);
        ctx.strokeStyle = withAlpha('#2c2620', .5); ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(mx - 6, my); ctx.lineTo(mx + 6, my); ctx.stroke();
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx - 7, my - 7, 14, 2.5);
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx - 7, my - 5, 1.6, 3); ctx.fillRect(mx + 5.4, my - 5, 1.6, 3);
        const pulse = .6 + Math.sin(performance.now() / 500) * .3;
        ctx.fillStyle = `rgba(224,166,60,${pulse})`;
        ctx.beginPath(); ctx.arc(mx - 3, my - 1.5, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 2, my - 1.5, 1, 0, Math.PI * 2); ctx.fill();
      },
      // A crude stall made of hide draped over crossed spears, with bone
      // trophies dangling in place of tidy goods.
      orc(mx, my, color) {
        ctx.strokeStyle = '#4b3a2c'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(mx - 7, my - 9); ctx.lineTo(mx + 3, my); ctx.moveTo(mx + 7, my - 9); ctx.lineTo(mx - 3, my); ctx.stroke();
        ctx.fillStyle = withAlpha(color, .8);
        ctx.beginPath(); ctx.moveTo(mx - 7, my - 6); ctx.lineTo(mx + 7, my - 6); ctx.lineTo(mx + 5, my - 2); ctx.lineTo(mx - 5, my - 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#74584a'; ctx.fillRect(mx - 5, my - 2, 10, 4);
        ctx.fillStyle = '#e6ddc6';
        ctx.beginPath(); ctx.arc(mx - 3, my + .5, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 3, my + .5, 1.1, 0, Math.PI * 2); ctx.fill();
      }
    },
    granary: {
      // A raised timber silo with a peaked lid, up on short stilts to
      // keep the grain off the ground.
      human(mx, my, color) {
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 4.5, my + 1, 1.6, 4); ctx.fillRect(mx + 3, my + 1, 1.6, 4);
        ctx.fillStyle = '#d7b878'; ctx.fillRect(mx - 5, my - 6, 10, 8);
        ctx.strokeStyle = '#9a673e'; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(mx - 5, my - 2); ctx.lineTo(mx + 5, my - 2); ctx.stroke();
        ctx.fillStyle = withAlpha(color, .85); ctx.beginPath(); ctx.moveTo(mx - 6, my - 6); ctx.lineTo(mx, my - 12); ctx.lineTo(mx + 6, my - 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7c5230'; ctx.fillRect(mx - 1, my - 4, 2, 3);
      },
      // A woven basket-pod of grain hanging from a bough, capped with a
      // tuft of leaves instead of a shingle lid.
      elf(mx, my, color) {
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - .8, my - 12, 1.6, 5);
        ctx.fillStyle = '#c9a86a'; ctx.beginPath(); ctx.ellipse(mx, my - 2, 5.5, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = withAlpha('#7d5a3d', .6); ctx.lineWidth = .6;
        for (let ly = -6; ly <= 3; ly += 2.5) { ctx.beginPath(); ctx.moveTo(mx - 5.3, my - 2 + ly * .1); ctx.lineTo(mx + 5.3, my - 2 + ly * .1); ctx.stroke(); }
        for (const [dx, r] of [[-3, 1.5], [3, 1.5], [0, 1.8]]) {
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx + dx, my - 8, r, 0, Math.PI * 2); ctx.fill();
        }
      },
      // A grain store carved straight into stone, sealed with a riveted
      // metal hatch.
      dwarf(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .85); ctx.beginPath();
        ctx.moveTo(mx - 5, my + 2); ctx.lineTo(mx - 5, my - 4); ctx.arc(mx, my - 4, 5, Math.PI, 0); ctx.lineTo(mx + 5, my + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx - 2.6, my - 3, 5.2, 5);
        ctx.strokeStyle = '#e0a63c'; ctx.lineWidth = .6;
        ctx.strokeRect(mx - 2.6, my - 3, 5.2, 5);
        ctx.fillStyle = '#e0a63c'; ctx.beginPath(); ctx.arc(mx, my - .5, .8, 0, Math.PI * 2); ctx.fill();
      },
      // Bundled hide sacks piled and lashed with rope, ringed with a few
      // stakes to keep scavengers off.
      orc(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .8);
        ctx.beginPath(); ctx.ellipse(mx - 2, my, 4, 3.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(mx + 3, my - 1.5, 3.4, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c9b27a'; ctx.lineWidth = .7;
        ctx.beginPath(); ctx.moveTo(mx - 5, my - 1); ctx.lineTo(mx + 6, my - 3); ctx.stroke();
        ctx.fillStyle = '#5c4632';
        ctx.fillRect(mx - 6, my - 8, 1, 8); ctx.fillRect(mx + 6, my - 8, 1, 8);
      }
    },
    woodStore: {
      // A stacked cordwood pile under a lean-to roof.
      human(mx, my, color) {
        ctx.fillStyle = '#6b4a30'; ctx.fillRect(mx - 7, my - 6, 14, 3);
        ctx.fillStyle = '#8a6038'; ctx.fillRect(mx - 7, my - 2, 14, 3);
        ctx.fillStyle = '#6b4a30'; ctx.fillRect(mx - 7, my + 2, 14, 3);
        for (let lx = -6; lx <= 6; lx += 4) {
          ctx.fillStyle = '#4a3320';
          ctx.beginPath(); ctx.arc(mx + lx, my - 4.5, 1.3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(mx + lx, my - .5, 1.3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(mx + lx, my + 3.5, 1.3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = withAlpha(color, .8);
        ctx.beginPath(); ctx.moveTo(mx - 9, my - 7); ctx.lineTo(mx + 9, my - 7); ctx.lineTo(mx + 6, my - 12); ctx.lineTo(mx - 6, my - 12); ctx.closePath(); ctx.fill();
      }
    },
    oreStore: {
      // A roofed quarry-store: a hopper of broken rock beside a fenced
      // stone yard.
      human(mx, my, color) {
        ctx.fillStyle = '#7d7d7d';
        ctx.beginPath(); ctx.moveTo(mx - 6, my + 4); ctx.lineTo(mx - 4, my - 2); ctx.lineTo(mx + 1, my + 1); ctx.lineTo(mx + 4, my - 4); ctx.lineTo(mx + 7, my + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9a9a9a';
        ctx.beginPath(); ctx.arc(mx - 3, my - 1, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 3, my - 3, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 5.5, my + 1, 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx - 8, my - 12, 16, 4);
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx - 8, my - 8, 2, 8); ctx.fillRect(mx + 6, my - 8, 2, 8);
      }
    },
    stoneMine: {
      // A mountainside mine shaft: braced timber portal cut into a grey
      // rock face, with a loaded ore cart parked outside.
      human(mx, my, color) {
        ctx.fillStyle = '#7d7d7d';
        ctx.beginPath(); ctx.moveTo(mx - 9, my + 5); ctx.lineTo(mx - 6, my - 9); ctx.lineTo(mx, my - 3); ctx.lineTo(mx + 6, my - 10); ctx.lineTo(mx + 9, my + 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = withAlpha(color, .9); ctx.beginPath(); ctx.arc(mx, my + 1, 3.4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#1c140f'; ctx.beginPath(); ctx.arc(mx, my + 1, 2.4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx - 5, my + 4, 3, 2.4); ctx.fillRect(mx + 2, my + 4, 3, 2.4);
        ctx.fillStyle = '#9a9a9a';
        ctx.beginPath(); ctx.arc(mx + 6, my + 4.5, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 4.5, my + 5.5, 1.1, 0, Math.PI * 2); ctx.fill();
      }
    },
    ironMine: {
      // Same mountain portal, but with a raised timber headframe and pulley
      // for hauling iron ore up out of the shaft.
      human(mx, my, color) {
        ctx.fillStyle = '#726a63';
        ctx.beginPath(); ctx.moveTo(mx - 9, my + 5); ctx.lineTo(mx - 6, my - 9); ctx.lineTo(mx, my - 3); ctx.lineTo(mx + 6, my - 10); ctx.lineTo(mx + 9, my + 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = withAlpha(color, .9); ctx.beginPath(); ctx.arc(mx, my + 1, 3.4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#1c140f'; ctx.beginPath(); ctx.arc(mx, my + 1, 2.4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 1, my - 15, 2, 12);
        ctx.strokeStyle = '#5c4632'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mx - 4, my - 12); ctx.lineTo(mx, my - 15); ctx.lineTo(mx + 4, my - 12); ctx.stroke();
        ctx.fillStyle = '#b3673d'; ctx.beginPath(); ctx.arc(mx, my - 15.5, 1.1, 0, Math.PI * 2); ctx.fill();
      }
    },
    goldMine: {
      // The grandest of the three: a stone-arched portal with a gilded
      // sign and glinting ore cart, marking a proven gold vein.
      human(mx, my, color) {
        ctx.fillStyle = '#8c8478';
        ctx.beginPath(); ctx.moveTo(mx - 9, my + 5); ctx.lineTo(mx - 6, my - 9); ctx.lineTo(mx, my - 3); ctx.lineTo(mx + 6, my - 10); ctx.lineTo(mx + 9, my + 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = withAlpha(color, .9); ctx.beginPath(); ctx.arc(mx, my + 1, 3.4, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#1c140f'; ctx.beginPath(); ctx.arc(mx, my + 1, 2.4, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#e0a63c'; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.arc(mx, my + 1, 4.2, Math.PI, 0); ctx.stroke();
        const glint = .5 + Math.sin(performance.now() / 400) * .3;
        ctx.fillStyle = `rgba(224,166,60,${glint})`;
        ctx.beginPath(); ctx.arc(mx + 5.5, my + 4, 1.3, 0, Math.PI * 2); ctx.fill();
      }
    },
    barracks: {
      // A small fortified post: stone-footed timber walls, a lookout
      // tower with crenellations and a raised gate.
      human(mx, my, color) {
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx - 6, my - 1, 12, 5);
        ctx.fillStyle = '#74584a'; ctx.fillRect(mx - 6, my - 6, 12, 5);
        ctx.fillStyle = '#4a4038';
        for (let bx = -6; bx <= 5; bx += 3) ctx.fillRect(mx + bx, my - 8, 2, 2);
        ctx.fillStyle = '#847058'; ctx.fillRect(mx + 2, my - 12, 5, 8);
        for (let bx = 2; bx <= 5; bx += 3) ctx.fillRect(mx + bx, my - 13.5, 1.6, 1.6);
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx - 2, my - 3, 3, 3);
      },
      // A slender watch-post ringed round a living trunk, reached by a
      // rope ladder up to a leaf-roofed platform.
      elf(mx, my, color) {
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 1.6, my - 14, 3.2, 16);
        ctx.fillStyle = withAlpha(color, .8); ctx.beginPath(); ctx.ellipse(mx, my - 10, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7d5a3d'; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(mx - 2.5, my - 5); ctx.lineTo(mx - 4.5, my + 2); ctx.moveTo(mx + 2.5, my - 5); ctx.lineTo(mx + 4.5, my + 2); ctx.stroke();
        for (let ry = -4; ry <= 1; ry += 2.5) { ctx.beginPath(); ctx.moveTo(mx - 2.5 - ry * -.3, my + ry); ctx.lineTo(mx + 2.5 + ry * -.3, my + ry); ctx.stroke(); }
        ctx.fillStyle = color;
        for (const [dx, dy, r] of [[-3, -13, 2], [3, -13.5, 2.2], [0, -15.5, 2]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2); ctx.fill(); }
      },
      // A squat stone bastion carved into the slope with a heavy iron
      // gate instead of an arched doorway.
      dwarf(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .88); ctx.beginPath();
        ctx.moveTo(mx - 6, my + 2); ctx.lineTo(mx - 6, my - 5); ctx.arc(mx, my - 5, 6, Math.PI, 0); ctx.lineTo(mx + 6, my + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8c8478'; ctx.fillRect(mx - 7, my - 9, 3, 4); ctx.fillRect(mx + 4, my - 9, 3, 4);
        ctx.fillStyle = '#241d18'; ctx.fillRect(mx - 2.4, my - 2, 4.8, 4);
        ctx.strokeStyle = '#e0a63c'; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(mx - 2.4, my); ctx.lineTo(mx + 2.4, my); ctx.stroke();
      },
      // A rough wooden watchtower topped with a skull totem and a ring
      // of outward-facing spikes.
      orc(mx, my, color) {
        ctx.fillStyle = '#4b3a2c'; ctx.fillRect(mx - 5.6, my - 13, 1.8, 15); ctx.fillRect(mx + 3.8, my - 13, 1.8, 15);
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx - 6, my - 13, 12, 5);
        ctx.strokeStyle = '#d8d2c2'; ctx.lineWidth = .8;
        for (const sx of [-5, -1.5, 2, 5.5]) { ctx.beginPath(); ctx.moveTo(mx + sx, my - 13); ctx.lineTo(mx + sx + 1, my - 16); ctx.stroke(); }
        ctx.fillStyle = '#e6ddc6'; ctx.beginPath(); ctx.arc(mx, my - 16.5, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1c140f'; ctx.fillRect(mx - 1.2, my - 17, .9, 1.2); ctx.fillRect(mx + .3, my - 17, .9, 1.2);
        ctx.fillStyle = '#1c140f'; ctx.fillRect(mx - 2, my - 3, 4, 4);
      }
    },
    temple: {
      // A small shrine: raised stone base, a pair of pillars, and a
      // triangular pediment roof.
      human(mx, my, color) {
        ctx.fillStyle = '#a8a48a'; ctx.fillRect(mx - 6, my + 1, 12, 2);
        ctx.fillStyle = '#c9c5a7'; ctx.fillRect(mx - 5, my - 5, 10, 6);
        ctx.fillStyle = '#eee5b0';
        ctx.fillRect(mx - 4.5, my - 5, 1.6, 6); ctx.fillRect(mx - 1, my - 5, 1.6, 6); ctx.fillRect(mx + 2.5, my - 5, 1.6, 6);
        ctx.fillStyle = withAlpha(color, .85); ctx.beginPath(); ctx.moveTo(mx - 6.5, my - 5); ctx.lineTo(mx, my - 10); ctx.lineTo(mx + 6.5, my - 5); ctx.closePath(); ctx.fill();
      },
      // A ring of living trees curved around a glowing sapling altar —
      // worship as a grove, not a walled building.
      elf(mx, my, color) {
        ctx.fillStyle = '#5c4632';
        for (const dx of [-6, -2.5, 2.5, 6]) ctx.fillRect(mx + dx - .6, my - 9, 1.2, 11);
        ctx.fillStyle = withAlpha(color, .75);
        for (const dx of [-6, -2.5, 2.5, 6]) { ctx.beginPath(); ctx.arc(mx + dx, my - 10, 2.6, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - .5, my - 3, 1, 5);
        const pulse = .55 + Math.sin(performance.now() / 400) * .3;
        ctx.fillStyle = `rgba(246,223,138,${pulse})`;
        ctx.beginPath(); ctx.arc(mx, my - 4.5, 1.8, 0, Math.PI * 2); ctx.fill();
      },
      // A shrine cut straight into the mountain face with a glowing rune
      // set above the entrance.
      dwarf(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .85); ctx.beginPath();
        ctx.moveTo(mx - 6, my + 2); ctx.lineTo(mx - 6, my - 4); ctx.arc(mx, my - 4, 6, Math.PI, 0); ctx.lineTo(mx + 6, my + 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = withAlpha('#2c2620', .5); ctx.lineWidth = .6;
        for (let r = 2; r <= 6; r += 2) { ctx.beginPath(); ctx.arc(mx, my - 4, r, Math.PI, 0); ctx.stroke(); }
        ctx.fillStyle = '#241d18'; ctx.fillRect(mx - 2, my - 1, 4, 4);
        const pulse = .6 + Math.sin(performance.now() / 450) * .3;
        ctx.fillStyle = `rgba(224,166,60,${pulse})`;
        ctx.beginPath(); ctx.arc(mx, my - 6, 1.3, 0, Math.PI * 2); ctx.fill();
      },
      // A totem-pole shrine hung with bone trophies over a low fire.
      orc(mx, my, color) {
        ctx.fillStyle = '#6b5847'; ctx.fillRect(mx - 1.4, my - 13, 2.8, 15);
        ctx.fillStyle = withAlpha(color, .8);
        ctx.fillRect(mx - 3.4, my - 13, 6.8, 3); ctx.fillRect(mx - 2.6, my - 8.5, 5.2, 3);
        ctx.fillStyle = '#e6ddc6';
        ctx.beginPath(); ctx.arc(mx - 3.2, my - 3, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 3.2, my - 3, 1, 0, Math.PI * 2); ctx.fill();
        const flick = .5 + Math.sin(performance.now() / 300) * .3;
        ctx.fillStyle = `rgba(224,110,50,${flick})`;
        ctx.beginPath(); ctx.moveTo(mx - 2, my + 1); ctx.lineTo(mx, my - 3); ctx.lineTo(mx + 2, my + 1); ctx.closePath(); ctx.fill();
      }
    },
    workshop: {
      // A working shed with a stone chimney puffing smoke and a hint of
      // an anvil silhouette by the doorway.
      human(mx, my, color) {
        ctx.fillStyle = '#6b5847'; ctx.fillRect(mx - 6, my - 4, 12, 7);
        ctx.fillStyle = withAlpha(color, .8); ctx.beginPath(); ctx.moveTo(mx - 7, my - 4); ctx.lineTo(mx, my - 9); ctx.lineTo(mx + 7, my - 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx + 3, my - 12, 2.6, 6);
        const puff = .35 + Math.sin(performance.now() / 400 + mx) * .15;
        ctx.fillStyle = `rgba(200,200,200,${puff})`;
        ctx.beginPath(); ctx.arc(mx + 4.3, my - 14, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 5.5, my - 16.5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3c3530'; ctx.fillRect(mx - 4.5, my, 3, 1.6);
        ctx.fillStyle = '#8c8478'; ctx.fillRect(mx - 4, my - 1.2, 2, 1.4);
      },
      // A carving platform built onto a bough, wood-shavings drifting
      // down like leaf-dust instead of chimney smoke.
      elf(mx, my, color) {
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 6.5, my - 3, 1.4, 7); ctx.fillRect(mx + 5.1, my - 3, 1.4, 7);
        ctx.fillStyle = '#7d5a3d'; ctx.fillRect(mx - 6, my - 1, 12, 4);
        ctx.fillStyle = withAlpha(color, .78); ctx.beginPath(); ctx.ellipse(mx, my - 6, 6.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c9a86a';
        const drift = Math.sin(performance.now() / 500);
        ctx.beginPath(); ctx.arc(mx - 4 + drift, my + 3, .8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 2 - drift, my + 4, .7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3c2e22'; ctx.fillRect(mx - 4, my, 2.6, 3);
      },
      // A stone forge glowing with ember-light instead of a smoke plume.
      dwarf(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx - 6, my - 5, 12, 8);
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx + 2.5, my - 11, 3, 6);
        const ember = .5 + Math.sin(performance.now() / 350) * .3;
        ctx.fillStyle = `rgba(224,110,50,${ember})`;
        ctx.beginPath(); ctx.arc(mx - 2, my, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#241d18'; ctx.fillRect(mx - 4, my - 3, 3, 3);
      },
      // A crude lean-to with a bonfire out front, sparks flying.
      orc(mx, my, color) {
        ctx.strokeStyle = '#4b3a2c'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(mx - 6, my - 8); ctx.lineTo(mx - 6, my + 2); ctx.moveTo(mx + 6, my - 9); ctx.lineTo(mx + 6, my + 2); ctx.stroke();
        ctx.fillStyle = withAlpha(color, .8);
        ctx.beginPath(); ctx.moveTo(mx - 6, my - 8); ctx.lineTo(mx + 6, my - 9); ctx.lineTo(mx + 6, my - 4); ctx.lineTo(mx - 6, my - 3); ctx.closePath(); ctx.fill();
        const flick = .5 + Math.sin(performance.now() / 280) * .3;
        ctx.fillStyle = `rgba(224,110,50,${flick})`;
        ctx.beginPath(); ctx.moveTo(mx - 1.5, my + 2); ctx.lineTo(mx, my - 3); ctx.lineTo(mx + 1.5, my + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2c2420'; ctx.fillRect(mx - 3, my + 1.5, 6, 1.4);
      }
    },
    tavern: {
      // A cosy inn: a lit window, a hanging sign on a post, and a small
      // lantern by the door.
      human(mx, my, color) {
        ctx.fillStyle = '#7d5a3d'; ctx.fillRect(mx - 6, my - 4, 12, 7);
        ctx.fillStyle = withAlpha(color, .8); ctx.beginPath(); ctx.moveTo(mx - 7, my - 4); ctx.lineTo(mx, my - 9); ctx.lineTo(mx + 7, my - 4); ctx.closePath(); ctx.fill();
        const glow = .55 + Math.sin(performance.now() / 450) * .2;
        ctx.fillStyle = `rgba(246,223,138,${glow})`; ctx.fillRect(mx - 4, my - 2, 3, 3);
        ctx.fillStyle = '#3c2e22'; ctx.fillRect(mx + 1, my - 2.5, 2.4, 4.5);
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 6.5, my - 8, 1, 4);
        ctx.fillStyle = '#a85c3f'; ctx.fillRect(mx - 6.8, my - 8, 3.6, 2);
      },
      // A lantern-lit nook tucked against the trunk, its sign wrapped in
      // vine instead of hung from a bare post.
      elf(mx, my, color) {
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 6.5, my - 10, 2, 14);
        ctx.fillStyle = withAlpha(color, .78); ctx.beginPath(); ctx.ellipse(mx - .5, my - 1, 6.5, 5, 0, 0, Math.PI * 2); ctx.fill();
        const glow = .55 + Math.sin(performance.now() / 450) * .25;
        ctx.fillStyle = `rgba(246,223,138,${glow})`;
        ctx.beginPath(); ctx.arc(mx, my - 1, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx - 5.5, my - 9, 1.6, 0, Math.PI * 2); ctx.fill();
      },
      // A warm stone hall, its hanging sign a carved stone mug rather
      // than a painted board.
      dwarf(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx - 6, my - 5, 12, 8);
        const glow = .55 + Math.sin(performance.now() / 450) * .2;
        ctx.fillStyle = `rgba(246,223,138,${glow})`; ctx.fillRect(mx - 4, my - 1, 3, 3);
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx + 3.5, my - 10, 1, 4);
        ctx.fillStyle = '#8c8478'; ctx.fillRect(mx + 1.5, my - 11, 3.2, 3);
        ctx.fillStyle = '#241d18'; ctx.fillRect(mx - .5, my - 2, 3, 5);
      },
      // A rowdy hide-walled hall lit by a bonfire glow, its sign a
      // lashed pair of tusks.
      orc(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .8); ctx.fillRect(mx - 6, my - 4, 12, 8);
        const flick = .5 + Math.sin(performance.now() / 320) * .3;
        ctx.fillStyle = `rgba(224,110,50,${flick})`; ctx.fillRect(mx - 4, my - 1, 3, 4);
        ctx.fillStyle = '#e6ddc6';
        ctx.beginPath(); ctx.moveTo(mx + 3, my - 8); ctx.quadraticCurveTo(mx + 5.5, my - 9, mx + 5, my - 6); ctx.quadraticCurveTo(mx + 4, my - 7, mx + 3, my - 8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(mx + 5.5, my - 8); ctx.quadraticCurveTo(mx + 8, my - 9, mx + 7.5, my - 6); ctx.quadraticCurveTo(mx + 6.5, my - 7, mx + 5.5, my - 8); ctx.fill();
        ctx.fillStyle = '#1c140f'; ctx.fillRect(mx + 1, my - 5, 4, 9);
      }
    },
    school: {
      // A single-room schoolhouse with a bell mounted over the door to
      // call students in — the bell gently swings to show it's in use.
      human(mx, my, color) {
        ctx.fillStyle = '#8c6b4a'; ctx.fillRect(mx - 6, my - 4, 12, 8);
        ctx.fillStyle = withAlpha(color, .85); ctx.beginPath(); ctx.moveTo(mx - 7, my - 4); ctx.lineTo(mx, my - 10); ctx.lineTo(mx + 7, my - 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3c2e22'; ctx.fillRect(mx - 1.4, my - 1, 2.8, 5);
        ctx.fillStyle = '#cfe0e8'; ctx.fillRect(mx - 5, my - 2, 2, 2); ctx.fillRect(mx + 3, my - 2, 2, 2);
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx - .5, my - 11, 1, 3);
        const swing = Math.sin(performance.now() / 500) * 1.2;
        ctx.fillStyle = '#c9a86a';
        ctx.beginPath(); ctx.moveTo(mx, my - 11); ctx.lineTo(mx + swing, my - 7.5); ctx.lineTo(mx - 1.4, my - 7.5); ctx.closePath(); ctx.fill();
      },
      // A ring of low benches beneath a woven leaf-canopy, with a wooden
      // chime instead of a cast bell hanging from the bough overhead.
      elf(mx, my, color) {
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 6.5, my - 11, 1.4, 13); ctx.fillRect(mx + 5.1, my - 11, 1.4, 13);
        ctx.fillStyle = withAlpha(color, .78); ctx.beginPath(); ctx.ellipse(mx, my - 9, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7d5a3d';
        for (const dx of [-4, 0, 4]) ctx.fillRect(mx + dx - 1.3, my + 2, 2.6, 1.4);
        const swing = Math.sin(performance.now() / 500) * 1;
        ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(mx, my - 8); ctx.lineTo(mx + swing, my - 3); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx + swing, my - 2.4, 1, 0, Math.PI * 2); ctx.fill();
      },
      // A stone-carved hall with a rune-etched gong in place of a bell.
      dwarf(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx - 6, my - 5, 12, 8);
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx - 5.4, my - 4, 2, 2); ctx.fillRect(mx + 3.4, my - 4, 2, 2);
        ctx.strokeStyle = '#e0a63c'; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.arc(mx, my - 8, 2.4, 0, Math.PI * 2); ctx.stroke();
        const pulse = .5 + Math.sin(performance.now() / 500) * .3;
        ctx.fillStyle = `rgba(224,166,60,${pulse})`;
        ctx.beginPath(); ctx.arc(mx, my - 8, 1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#241d18'; ctx.fillRect(mx - 1.4, my - 1, 2.8, 4);
      },
      // A cleared drum-circle where a war-hide gong stands in for a bell —
      // orcish "schooling" is still a gathering call, just a blunter one.
      orc(mx, my, color) {
        ctx.strokeStyle = '#4b3a2c'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(mx - 4, my - 11); ctx.lineTo(mx - 4, my - 2); ctx.moveTo(mx + 4, my - 11); ctx.lineTo(mx + 4, my - 2); ctx.stroke();
        ctx.fillStyle = withAlpha(color, .8); ctx.beginPath(); ctx.ellipse(mx, my - 6.5, 3.6, 4.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e6ddc6'; ctx.lineWidth = .5;
        ctx.beginPath(); ctx.moveTo(mx - 3, my - 6.5); ctx.lineTo(mx + 3, my - 6.5); ctx.stroke();
        ctx.fillStyle = '#74584a'; ctx.beginPath(); ctx.ellipse(mx, my + 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
    },
    library: {
      human(mx, my, color) {
        ctx.fillStyle = '#9a8464'; ctx.fillRect(mx - 6.5, my - 6, 13, 10);
        ctx.fillStyle = withAlpha(color, .85);
        ctx.beginPath(); ctx.moveTo(mx - 2.4, my + 4); ctx.lineTo(mx - 2.4, my - 1); ctx.arc(mx, my - 1, 2.4, Math.PI, 0); ctx.lineTo(mx + 2.4, my + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3c352c';
        ctx.fillRect(mx - 5.6, my - 4, 2.2, 3); ctx.fillRect(mx + 3.4, my - 4, 2.2, 3);
        ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = .4;
        ctx.beginPath(); ctx.moveTo(mx - 5.6, my - 2.5); ctx.lineTo(mx - 3.4, my - 2.5); ctx.moveTo(mx + 3.4, my - 2.5); ctx.lineTo(mx + 5.6, my - 2.5); ctx.stroke();
        const colors = ['#a8453f', '#3f6f9a', '#3f9a5c'];
        for (let i = 0; i < 3; i++) { ctx.fillStyle = colors[i]; ctx.fillRect(mx + 3.5 - i * .4, my + 3.6 - i * 1.1, 3, 1); }
      },
      // A living archive: scrolls and glowing memory-crystals nested in
      // the hollows of an ancient trunk rather than shelved indoors.
      elf(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .8); ctx.beginPath(); ctx.ellipse(mx, my - 4, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3c2e22';
        for (const [dx, dy] of [[-2.5, -6], [2, -2], [-2, 2], [2.5, -8]]) { ctx.beginPath(); ctx.ellipse(mx + dx, my + dy, 1.4, 1, 0, 0, Math.PI * 2); ctx.fill(); }
        const pulse = .5 + Math.sin(performance.now() / 450) * .3;
        ctx.fillStyle = `rgba(140,200,246,${pulse})`;
        for (const [dx, dy] of [[-2.5, -6], [2, -2], [-2, 2]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, .6, 0, Math.PI * 2); ctx.fill(); }
      },
      // Stone tablets and bound ledgers set into a fireproof vault instead
      // of shelved paper — a dwarf archive is built to outlast the reader.
      dwarf(mx, my, color) {
        ctx.fillStyle = withAlpha(color, .88); ctx.fillRect(mx - 6, my - 6, 12, 10);
        ctx.fillStyle = '#5c5044'; ctx.fillRect(mx - 2.6, my - 3, 5.2, 7);
        ctx.strokeStyle = '#e0a63c'; ctx.lineWidth = .5;
        ctx.strokeRect(mx - 2.6, my - 3, 5.2, 7);
        ctx.fillStyle = '#8c8478'; ctx.fillRect(mx - 5.4, my - 4.6, 2.2, 3); ctx.fillRect(mx + 3.2, my - 4.6, 2.2, 3);
        const pulse = .5 + Math.sin(performance.now() / 500) * .3;
        ctx.fillStyle = `rgba(224,166,60,${pulse})`;
        ctx.beginPath(); ctx.arc(mx, my - .5, .9, 0, Math.PI * 2); ctx.fill();
      },
      // A tent stitched from hide, packed with stacked tusk-carved tally
      // tablets — orc record-keeping is oral and bone-etched, not bound.
      orc(mx, my, color) {
        ctx.strokeStyle = '#4b3a2c'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(mx - 6, my + 2); ctx.lineTo(mx, my - 10); ctx.lineTo(mx + 6, my + 2); ctx.stroke();
        ctx.fillStyle = withAlpha(color, .82);
        ctx.beginPath(); ctx.moveTo(mx - 6, my + 2); ctx.lineTo(mx, my - 10); ctx.lineTo(mx + 6, my + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e6ddc6';
        for (let i = 0; i < 3; i++) { ctx.fillRect(mx - 3 + i * 2.2, my - .5 - i * .3, 1.8, 3); }
        ctx.fillStyle = '#1c140f'; ctx.fillRect(mx - 1, my + 1.6, .8, .8); ctx.fillRect(mx + .4, my + 1, .8, .8);
      }
    },
    townCenter: {
      // A raised paved civic platform flying the city's banner — the
      // Culture-4 "clearer civic heart" companion to the town hall itself.
      human(mx, my, color) {
        ctx.fillStyle = '#9a8f78'; ctx.fillRect(mx - 8, my, 16, 5);
        ctx.strokeStyle = '#6f6552'; ctx.lineWidth = .5;
        for (let lx = -7; lx <= 7; lx += 3.5) { ctx.beginPath(); ctx.moveTo(mx + lx, my); ctx.lineTo(mx + lx, my + 5); ctx.stroke(); }
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - .5, my - 11, 1, 11);
        ctx.fillStyle = withAlpha(color, .85);
        ctx.beginPath(); ctx.moveTo(mx + .5, my - 11); ctx.lineTo(mx + 7, my - 8); ctx.lineTo(mx + .5, my - 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#4a4030'; ctx.beginPath(); ctx.arc(mx - 5, my + 1, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 5, my + 1, 1.3, 0, Math.PI * 2); ctx.fill();
      }
    },
    plaza: {
      // An open paved square around a small fountain, ringed by lamp posts —
      // the open-air counterpart to the Town Center's raised platform.
      human(mx, my, color) {
        ctx.fillStyle = '#a89c84'; ctx.beginPath(); ctx.ellipse(mx, my + 1, 9, 4.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7c7160'; ctx.lineWidth = .4;
        ctx.beginPath(); ctx.ellipse(mx, my + 1, 6, 3, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#6f8ea3'; ctx.beginPath(); ctx.ellipse(mx, my + 1, 2.4, 1.3, 0, 0, Math.PI * 2); ctx.fill();
        const pulse = .5 + Math.sin(performance.now() / 400) * .3;
        ctx.fillStyle = `rgba(210,232,246,${pulse})`;
        ctx.beginPath(); ctx.arc(mx, my, .8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a4030';
        ctx.fillRect(mx - 8, my - 4, .8, 5); ctx.fillRect(mx + 7.2, my - 4, .8, 5);
        ctx.fillStyle = withAlpha(color, .8);
        ctx.beginPath(); ctx.arc(mx - 7.6, my - 4.6, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx + 7.6, my - 4.6, 1, 0, Math.PI * 2); ctx.fill();
      }
    },
    fort: {
      // A heavier fortification than Barracks — twin towers with
      // crenellations flanking a walled courtyard — its Culture-6 sibling.
      human(mx, my, color) {
        ctx.fillStyle = '#8c8478'; ctx.fillRect(mx - 8, my - 1, 16, 8);
        ctx.strokeStyle = '#5c5548'; ctx.lineWidth = .5; ctx.strokeRect(mx - 8, my - 1, 16, 8);
        for (const tx of [-8, 8]) {
          ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx + tx - 2.4, my - 12, 4.8, 12);
          ctx.fillStyle = '#5c5548';
          for (let i = -2; i <= 2; i += 2) { ctx.fillRect(mx + tx - 2.4 + (i + 2), my - 13.4, 1.4, 1.6); }
        }
        ctx.fillStyle = '#5c5548';
        for (let i = -6; i <= 6; i += 3) { ctx.fillRect(mx + i - .8, my - 2.4, 1.6, 1.6); }
        ctx.fillStyle = '#3c342a'; ctx.fillRect(mx - 2, my + 1, 4, 6);
      }
    },
    fishingDock: {
      // A working pier distinct from Port's cargo harbor: a short jetty
      // with net-drying racks and stacked fish crates instead of a warehouse.
      human(mx, my, color) {
        ctx.fillStyle = '#7d5a3d';
        for (let i = -1; i <= 5; i += 2) { ctx.fillRect(mx - 3 + i, my + 1, 1.3, 6); }
        ctx.fillStyle = '#8c6b47'; ctx.fillRect(mx - 4, my + 1.4, 10, 1.8);
        ctx.strokeStyle = '#5c4632'; ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(mx - 3, my - 5); ctx.lineTo(mx + 3, my - 5); ctx.moveTo(mx - 3, my - 5); ctx.lineTo(mx - 3, my + 1); ctx.moveTo(mx + 3, my - 5); ctx.lineTo(mx + 3, my + 1); ctx.stroke();
        ctx.strokeStyle = withAlpha(color, .6); ctx.lineWidth = .4;
        for (let ny = -4; ny <= 0; ny += 1.4) { ctx.beginPath(); ctx.moveTo(mx - 3, my + ny); ctx.lineTo(mx + 3, my + ny + 1); ctx.stroke(); }
        ctx.fillStyle = withAlpha(color, .85); ctx.fillRect(mx - 8, my + 2.2, 3, 2.4);
        ctx.fillStyle = '#c9ced3'; ctx.beginPath(); ctx.ellipse(mx - 6.5, my + 2, 1, .6, .4, 0, Math.PI * 2); ctx.fill();
      }
    },
    port: {
      human(mx, my, color) {
        ctx.fillStyle = '#6b5847'; ctx.fillRect(mx - 2, my - 2, 4, 5);
        ctx.fillStyle = '#a8875f';
        for (let i = -1; i <= 5; i += 2) { ctx.fillRect(mx - 2 + i, my + 2, 1.4, 8); }
        ctx.fillStyle = '#8c6b47'; ctx.fillRect(mx - 3, my + 2.5, 9, 2);
        ctx.fillStyle = withAlpha(color, .85);
        ctx.beginPath(); ctx.moveTo(mx + 5, my + 6); ctx.lineTo(mx + 5, my - 2); ctx.lineTo(mx + 10, my + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx + 4.6, my - 2, .8, 8);
      },
      elf(mx, my, color) {
        ctx.fillStyle = '#5c4632'; ctx.fillRect(mx - 2, my - 8, 1.4, 11);
        ctx.fillStyle = '#7d5a3d';
        for (let i = -2; i <= 6; i += 2.4) { ctx.fillRect(mx - 3 + i, my + 3, 1.2, 7); }
        ctx.fillStyle = '#8c6b47'; ctx.fillRect(mx - 4, my + 3.5, 10, 1.8);
        ctx.fillStyle = withAlpha(color, .8); ctx.beginPath(); ctx.ellipse(mx - 1.3, my - 9, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
        const pulse = .6 + Math.sin(performance.now() / 500) * .25;
        ctx.fillStyle = `rgba(246,223,138,${pulse})`; ctx.beginPath(); ctx.arc(mx - 1.3, my - 9, 1, 0, Math.PI * 2); ctx.fill();
      },
      dwarf(mx, my, color) {
        ctx.fillStyle = '#8c8478'; ctx.fillRect(mx - 3, my - 3, 6, 6);
        ctx.fillStyle = '#5c5044';
        for (let i = -1; i <= 6; i += 2) { ctx.fillRect(mx - 2 + i, my + 3, 1.6, 7); }
        ctx.fillStyle = '#74695c'; ctx.fillRect(mx - 3, my + 3.5, 9, 2);
        ctx.strokeStyle = '#e0a63c'; ctx.lineWidth = .5; ctx.strokeRect(mx - 3, my - 3, 6, 6);
      },
      orc(mx, my, color) {
        ctx.strokeStyle = '#4b3a2c'; ctx.lineWidth = 1.2;
        for (let i = -1; i <= 6; i += 2.2) { ctx.beginPath(); ctx.moveTo(mx - 2 + i, my + 2); ctx.lineTo(mx - 2 + i, my + 8); ctx.stroke(); }
        ctx.fillStyle = '#74584a'; ctx.fillRect(mx - 3, my + 2.4, 9, 1.8);
        ctx.fillStyle = withAlpha(color, .8); ctx.fillRect(mx - 3, my - 4, 5, 5);
        ctx.fillStyle = '#e6ddc6'; ctx.beginPath(); ctx.arc(mx - .5, my - 5.5, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  };
  export function drawSpecialBuilding(c, key, index = 0) {
    const point = buildingSlotPoint(c, key, index);
    const mx = point.x * TILE, my = point.y * TILE;
    ctx.fillStyle = '#241b1660'; ctx.beginPath(); ctx.ellipse(mx, my + 4, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    const shapes = SPECIAL_BUILDING_SHAPES[key];
    (shapes[c.race] || shapes.human)(mx, my, cityColor(c));
  }

  export const JOB_ACCENT = {
    farmer: '#8fd35c', woodcutter: '#a9713f', miner: '#c9ced3', builder: '#e2a23d',
    claimer: '#5aa9e6', forager: '#c23a5e', hunter: '#b5502e', fisher: '#3f8fbf'
  };

  export function drawWolf(px, py) {
    ctx.fillStyle = '#6b6f73';
    ctx.beginPath();
    ctx.moveTo(px - 5, py + 3); ctx.lineTo(px - 4, py - 1); ctx.lineTo(px - 1.5, py - 3.2);
    ctx.lineTo(px + 2, py - 2.6); ctx.lineTo(px + 5, py - .5); ctx.lineTo(px + 4.6, py + 3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#54585b';
    ctx.beginPath(); ctx.moveTo(px - 2.2, py - 3); ctx.lineTo(px - 3.2, py - 5.4); ctx.lineTo(px - .8, py - 3.6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px + .6, py - 3.2); ctx.lineTo(px + .2, py - 5.4); ctx.lineTo(px + 2.4, py - 3.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4d5154';
    ctx.beginPath(); ctx.moveTo(px + 4.6, py - .2); ctx.lineTo(px + 6.6, py + .6); ctx.lineTo(px + 4.4, py + 1.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b6f73';
    ctx.beginPath(); ctx.moveTo(px - 4.6, py + 1); ctx.lineTo(px - 7.2, py - 1.4); ctx.lineTo(px - 5.6, py + 2.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3f4245';
    ctx.fillRect(px - 3.4, py + 2.6, 1, 2.2);
    ctx.fillRect(px + 2.6, py + 2.6, 1, 2.2);
  }

  export function drawChicken(px, py) {
    ctx.save(); ctx.translate(px, py); ctx.scale(.62, .62);
    ctx.fillStyle = '#f2ede0';
    ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(2.6, -2.2, 1.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d94a3a';
    ctx.beginPath(); ctx.arc(2.4, -3.6, .8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8912b';
    ctx.beginPath();
    ctx.moveTo(3.9, -2.2); ctx.lineTo(5.2, -1.7); ctx.lineTo(3.9, -1.2);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(-.6, 2.2, 1.2, 1.6);
    ctx.restore();
  }

  export function unitClothColor(u) {
    const city = u.city != null ? cityOf(u) : null;
    return city ? cityColor(city) : (SPECIES[u.race] || SPECIES.human).coat;
  }

  export function drawHumanoid(px, py, race, skinColor, coatColor) {
    if (race === 'elf') {
      ctx.fillStyle = skinColor; ctx.beginPath(); ctx.arc(px, py - 2, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - 3, py - 3); ctx.lineTo(px - 5.5, py - 4.6); ctx.lineTo(px - 2.6, py - 1.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px + 3, py - 3); ctx.lineTo(px + 5.5, py - 4.6); ctx.lineTo(px + 2.6, py - 1.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = coatColor; ctx.fillRect(px - 3, py + 1, 6, 7);
    } else if (race === 'dwarf') {
      ctx.fillStyle = skinColor; ctx.beginPath(); ctx.arc(px, py - 1, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = coatColor; ctx.fillRect(px - 5, py + 2, 10, 5);
      ctx.fillStyle = '#ddd4c0'; ctx.fillRect(px - 2.5, py + .5, 5, 3);
    } else if (race === 'orc') {
      ctx.fillStyle = skinColor; ctx.beginPath(); ctx.arc(px, py - 2, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = coatColor; ctx.fillRect(px - 5, py + 1.5, 10, 7);
      ctx.fillStyle = '#f4f1e6'; ctx.fillRect(px - 2.6, py - .5, 1.3, 2); ctx.fillRect(px + 1.3, py - .5, 1.3, 2);
    } else {
      ctx.fillStyle = skinColor; ctx.beginPath(); ctx.arc(px, py - 2, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = coatColor; ctx.fillRect(px - 4, py + 1, 8, 6);
    }
  }

  function lowDetailUnitColor(u) {
    if (u.type === 'ship') return '#d9e3e8';
    if (u.species === 'wolf') return '#8a8f92';
    if (u.species === 'chicken') return '#e8d9a8';
    return (SPECIES[u.race] || SPECIES.human).color;
  }
  export function drawEntities(left, right, top, bottom) {
    const now = performance.now();
    const margin = 3;
    const tLeft = left / TILE, tRight = right / TILE, tTop = top / TILE, tBottom = bottom / TILE;
    // Three-tier LOD by zoom, mirroring drawTerrain's blocky/simplified/full
    // bands (see disasters-terrain-render.js) instead of the old on/off
    // switch. Far enough out, individual buildings and units are sub-pixel
    // and just cost frame time — collapse each city to a single dot and
    // units to flat squares. A new middle band (mediumDetail) keeps real
    // shapes recognizable but drops the per-unit extras (shadow, job accent
    // dot, infection pulse) that only read clearly once zoomed in anyway —
    // this is the band a screen full of 200-300 visible units spends most
    // of its time in, so it's the one worth trimming.
    const lowDetail = session.view.zoom < LOD_BLOCK_ZOOM;
    const mediumDetail = !lowDetail && session.view.zoom < LOD_FULL_ZOOM;
    // Per-frame O(1) leader lookup instead of the old state.cities.find()
    // done once per non-royal unit — with N visible units and M cities that
    // was O(N*M) every single frame just to check "is this unit a leader".
    let leaderCities = null;
    if (!lowDetail) {
      leaderCities = new Map();
      for (const c of state.cities) if (c.leaderId != null) leaderCities.set(c.leaderId, c);
    }
    for (const c of state.cities) {
      const fLeft = c.footMinX ?? c.x, fRight = c.footMaxX ?? c.x;
      const fTop = c.footMinY ?? c.y, fBottom = c.footMaxY ?? c.y;
      if (fRight < tLeft - margin || fLeft > tRight + margin || fBottom < tTop - margin || fTop > tBottom + margin) continue;
      const px = c.x * TILE, py = c.y * TILE;
      if (lowDetail) {
        ctx.fillStyle = territoryColor(c.kingdomId || c.id);
        ctx.beginPath(); ctx.arc(px, py, c.isCapital ? 4 : 2.6, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const info = cityLevel(c.pop), speciesInfo = SPECIES[c.race] || SPECIES.human;
      // Medium band: keep the district ring + civic center (they carry the
      // silhouette that makes a city read as a city) but skip the footprint
      // dirt patches and in-progress scaffold — fine detail that's
      // indistinguishable from a normal house at this zoom anyway.
      if (!mediumDetail) drawCityFootprint(c);
      drawCityDistrict(c, px, py, info);
      if (!mediumDetail) drawConstructionSite(c, px, py, info);
      drawCivicCenter(c, px, py, info, speciesInfo);
      if (session.view.zoom >= .75) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui'; ctx.textBaseline = 'alphabetic';
        const kingdomForLabel = (session.overlay === 'kingdom' || session.overlay === 'civilization')
          ? state.kingdoms.find(k => k.id === c.kingdomId) : null;
        const labelName = kingdomForLabel ? kingdomForLabel.name : c.name;
        const labelText = `${labelName} · ${c.pop}`;
        const iconSize = 10, gap = 3;
        const textWidth = ctx.measureText(labelText).width;
        const totalWidth = iconSize + gap + textWidth;
        const startX = px - totalWidth / 2;
        const labelY = py + 25;
        if (c.isCapital) {
          if (session.overlay === 'kingdom') {
            drawKingdomGlyph(ctx, startX + iconSize / 2, labelY - iconSize / 2 - 1, iconSize);
          } else if (session.overlay === 'civilization') {
            drawCivGlyph(ctx, startX + iconSize / 2, labelY - iconSize / 2 - 1, iconSize);
          } else {
            drawCapitalGlyph(ctx, startX + iconSize / 2, labelY - iconSize / 2 - 1, iconSize);
          }
        } else if (session.overlay === 'kingdom') {
          ctx.textAlign = 'left'; ctx.fillText('🏳️', startX, labelY);
        } else if (session.overlay === 'civilization' && c.kingdomId) {
          drawCivGlyph(ctx, startX + iconSize / 2, labelY - iconSize / 2 - 1, iconSize);
        } else {
          drawCityGlyph(ctx, startX + iconSize / 2, labelY - iconSize / 2 - 1, iconSize);
        }
        ctx.textAlign = 'left';
        ctx.fillText(labelText, startX + iconSize + gap, labelY);
      }
    }
    if (lowDetail) {
      // Same idea as the blocky terrain: don't skip creatures entirely,
      // just collapse each one to a single flat-colored pixel-ish dot
      // sized in world space so it stays ~1px on screen at any zoom.
      // Floor raised from 1.1 to 2.2 — at 1.1 world-px the on-screen size
      // works out to ~1 physical pixel, which is functionally invisible
      // against the blocky terrain LOD it's drawn over. 2.2 keeps it a
      // visible little square at any zoom without adding real draw cost.
      const r = Math.max(2.2, 1 / session.view.zoom);
      for (const u of state.units) {
        if (u.x < tLeft - margin || u.x > tRight + margin || u.y < tTop - margin || u.y > tBottom + margin) continue;
        ctx.fillStyle = lowDetailUnitColor(u);
        ctx.fillRect(u.x * TILE - r / 2, u.y * TILE - r / 2, r, r);
      }
      return;
    }
    for (const u of state.units) {
      if (u.x < tLeft - margin || u.x > tRight + margin || u.y < tTop - margin || u.y > tBottom + margin) continue;
      // Bob is driven by actual distance walked (walkPhase, tiles), not the
      // wall clock. Previously it used performance.now() directly, so every
      // unit bounced at a fixed real-time rate no matter how fast (or
      // whether) it was actually moving — at 1x game speed a unit would
      // visibly bob in place while barely sliding forward, and only at 10x
      // did the sliding catch up enough to look like real walking. Tying
      // the bounce to distance covered keeps bob and movement in sync at
      // any game speed, and idle units (not currently walking) hold still
      // instead of jittering.
      const bob = u.moveTarget ? Math.sin((u.walkPhase || 0) * 6.8 + u.id * 1.7) * 1.1 : 0;
      const px = u.x * TILE, py = u.y * TILE + bob;
      if (u.type === 'ship') {
        // No ground shadow (it's on water, not standing on a tile) — just
        // the hull/sail glyph and, if selected, the usual ring below.
        drawShipGlyph(px, py, u.heading || 0, u.role);
        if (selected && selected.type === 'unit' && selected.value.id === u.id) {
          ctx.strokeStyle = '#fff3a1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke();
        }
        continue;
      }
      const speciesInfo = SPECIES[u.race] || SPECIES.human;
      const entityShadowLevel = mediumDetail ? 0 : (GRAPHICS_PRESETS[session.graphicsQuality]?.entityShadows ?? 2);
      if (entityShadowLevel > 0) {
        ctx.fillStyle = entityShadowLevel >= 3 ? 'rgba(8,10,8,.38)' : 'rgba(10,14,10,.28)';
        ctx.beginPath();
        ctx.ellipse(px + (entityShadowLevel >= 3 ? 1 : 0), u.y * TILE + 6,
          entityShadowLevel >= 3 ? 4.5 : 4, entityShadowLevel >= 3 ? 1.8 : 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (u.type === 'human') {
        drawHumanoid(px, py, u.race, speciesInfo.color, unitClothColor(u));
        // A tiny accent dot names the job at a glance without needing a
        // label — its own color per job (farmer green, woodcutter brown,
        // etc.). Skipped in the medium band: at that zoom it's a couple
        // pixels and unreadable, so it's pure draw cost with no payoff.
        const accent = !mediumDetail && JOB_ACCENT[u.job];
        if (accent) {
          ctx.fillStyle = accent;
          ctx.beginPath(); ctx.arc(px + 4, py - 4, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      } else if (u.species === 'chicken') {
        drawChicken(px, py);
      } else if (u.species === 'wolf') {
        drawWolf(px, py);
      } else {
        ctx.fillStyle = '#d9e3e8'; ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 5, py + 4); ctx.lineTo(px - 5, py + 4); ctx.closePath(); ctx.fill();
      }
      // Infection pulse and the leader crown both stay in the medium band
      // (they're meaningful state, not decoration) but now use the O(1)
      // leaderCities map built once above instead of a per-unit city scan.
      if (u.infected) {
        const pulse = .6 + Math.sin(now / 180 + u.id) * .4;
        ctx.fillStyle = `rgba(126,224,106,${pulse})`; ctx.beginPath(); ctx.arc(px, py - 9, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      if (u.royalRole === 'King') {
        drawCrownGlyph(ctx, px, py - 9, 'gold', 11);
      } else {
        const homeCity = leaderCities.get(u.id);
        if (homeCity) {
          drawCrownGlyph(ctx, px, py - 9, homeCity.isCapital ? 'gold' : 'silver', 11);
        }
      }
      if (selected && selected.type === 'unit' && selected.value.id === u.id) {
        ctx.strokeStyle = '#fff3a1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  export function drawDisasters() {
    for (const d of state.disasters) {
      if (d.type !== 'tornado') continue;
      const px = d.x * TILE, py = d.y * TILE;
      const spin = (performance.now() / 120) % (Math.PI * 2);
      ctx.strokeStyle = '#c9d6e0cc'; ctx.lineWidth = 2;
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        ctx.arc(px, py - ring * 3, 6 + ring * 5, spin + ring, spin + ring + Math.PI * 1.4);
        ctx.stroke();
      }
    }
    const now = performance.now();
    for (const f of state.fx) {
      const t = clamp((now - f.start) / f.duration, 0, 1);
      const px = f.x * TILE, py = f.y * TILE;
      if (f.type === 'boltFlash') {
        ctx.strokeStyle = `rgba(255,255,255,${(1 - t) * .9})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let cx = px, cy = py - 60;
        ctx.moveTo(cx, cy);
        for (let i = 0; i < 5; i++) { cx += rand(-6, 6); cy += 12; ctx.lineTo(cx, cy); }
        ctx.stroke();
      } else if (f.type === 'shockwave') {
        const r = f.maxRadius * TILE * t;
        ctx.strokeStyle = `rgba(255,180,110,${(1 - t) * .85})`;
        ctx.lineWidth = 4 * (1 - t) + 1;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
      } else if (f.type === 'supplyLine') {
        const fx1 = f.fromX * TILE, fy1 = f.fromY * TILE;
        const fx2 = f.toX * TILE, fy2 = f.toY * TILE;
        const rgb = f.resource === 'food' ? '138,214,90' : f.resource === 'wood' ? '196,146,84' : '162,168,174';
        const fade = t < .15 ? t / .15 : t > .85 ? (1 - t) / .15 : 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = `rgba(${rgb},${fade * .5})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(fx1, fy1); ctx.lineTo(fx2, fy2); ctx.stroke();
        ctx.setLineDash([]);
        const dotX = fx1 + (fx2 - fx1) * t, dotY = fy1 + (fy2 - fy1) * t;
        ctx.fillStyle = `rgba(${rgb},${fade})`;
        ctx.beginPath(); ctx.arc(dotX, dotY, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (state.fx.length) state.fx = state.fx.filter(f => now - f.start < f.duration);
  }
