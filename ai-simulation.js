// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// Spatial hash grid, per-unit AI behavior (humans and animals), and the main simulationStep() tick that drives the whole world forward.
// Part of the World Simulator script split (see index.html for load order).
'use strict';

import { ANIMAL_FLEE_SPEED, ANIMAL_WANDER_SPEED, AXE_CULTURE_LEVEL, CITY_BUILD_PLANS, CITY_WANDER_SPEED, CLAIM_SPEED, COURT_STROLL_SPEED, DAYS_PER_MONTH, DAYS_PER_YEAR, DELIVER_SPEED, DIGGING_SITE_CULTURE_LEVEL, H, HUNT_SPEED, MONTHS, MONTHS_PER_YEAR, NO_CITY_ROAM_SPEED, QUARRY_SITE_CULTURE_LEVEL, ROYAL_STROLL_SPEED, SEASONS, SHUFFLE_SPEED, SIM_SUBSTEPS_PER_HOUR, SPEAR_CULTURE_LEVEL, STONE_AXE_CULTURE_LEVEL, STONE_HOE_CULTURE_LEVEL, STONE_SPEAR_CULTURE_LEVEL, W, WORK_COMMUTE_SPEED, clamp, logEvent, makeId, rand, session, state, tile } from './state.js';
import { buildingSlotPoint } from './buildings-render.js';
import { DEVELOPMENT_PROJECTS, removeAbandonedCities, resourceCapacity, runWorldEvents, shareKingdomResources, updateCityDevelopment, updateKingdoms, updateSettlements } from './cities-kingdoms.js';
import { updateCultureDiffusion } from './culture.js';
import { spreadFire, spreadPlague, recoverCraters, updateDisasters, updateVolcanoes } from './disasters-terrain-render.js';
import { generateCityName } from './names.js';
import { updateSeaTrade } from './sea-trade.js';
import { cityOf, claimNewResidentQuota, ensureRoamTarget, fellTree, finalizeClaim, frontierCandidates, growBerries, growCivilizationTerritory, growForests, growOreDeposits, initialCityClaim, initialCivFloodClaim, isHabitable, isShoreTile, kingdomRoamTarget, mineOre, paintCivClaimedLive, paintClaimedLive, pickBerries, pickNewbornTile, planCityClaims, randomHabitableNear, rebuildCityIndex, rebuildCivGrid, rebuildLandRegions, rebuildTerritoryGrid, rebuildWaterRegions, recomputeCityBBox, releaseClaimTile, sameLandRegion, setMoveTarget } from './territory-units.js';
import { showToast } from './ui.js';
import { growWildlife, spawnHuman } from './world.js';

  export const SPATIAL_CELL = 3;
  export let spatialGrid = new Map();
  export function buildSpatialGrid() {
    spatialGrid.clear();
    for (const u of state.units) {
      if (!u.alive) continue;
      const key = Math.floor(u.x / SPATIAL_CELL) + ',' + Math.floor(u.y / SPATIAL_CELL);
      let bucket = spatialGrid.get(key);
      if (!bucket) { bucket = []; spatialGrid.set(key, bucket); }
      bucket.push(u);
    }
  }
  export function queryNearbyUnits(x, y, radius) {
    const result = [];
    const minCx = Math.floor((x - radius) / SPATIAL_CELL), maxCx = Math.floor((x + radius) / SPATIAL_CELL);
    const minCy = Math.floor((y - radius) / SPATIAL_CELL), maxCy = Math.floor((y + radius) / SPATIAL_CELL);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = spatialGrid.get(cx + ',' + cy);
        if (bucket) for (const u of bucket) result.push(u);
      }
    }
    return result;
  }

  export const RESOURCE_PROJECT_BUFFER = 10; // ~10 of the priciest project's worth of materials kept in reserve
  export const ALL_BUILD_PLANS = { ...CITY_BUILD_PLANS, ...DEVELOPMENT_PROJECTS };
  export function maxProjectCost(resource) {
    let max = 0;
    for (const plan of Object.values(ALL_BUILD_PLANS)) {
      const amount = plan?.cost?.[resource] || 0;
      if (amount > max) max = amount;
    }
    return max;
  }
  export function resourceNeed(c, resource, bufferMult = 1) {
    if (resource === 'food') return Math.min((c.pop || 0) * 8 * bufferMult, resourceCapacity(c, 'food'));
    if (resource === 'wood' || resource === 'stone' || resource === 'iron') {
      return Math.min(maxProjectCost(resource) * RESOURCE_PROJECT_BUFFER, resourceCapacity(c, resource));
    }
    return Infinity;
  }
  export function resourceStockFull(c, resource, bufferMult = 1) {
    return (c[resource] || 0) >= resourceNeed(c, resource, bufferMult);
  }

  export const CARRY_CAPACITY = { wood: 8, stone: 6, iron: 6, food: 10 };
  export const RESOURCE_BY_JOB = { woodcutter: 'wood', miner: 'stone', farmer: 'food', forager: 'food', hunter: 'food', fisher: 'food' };
  export const STORAGE_KEY_FOR_RESOURCE = { food: 'granary', wood: 'woodStore', stone: 'oreStore', iron: 'oreStore' };

  // The activity each production job performs, and the check for "this
  // worker's own stockpile is topped off". Used by chooseActivity below to
  // send a worker to help a short-staffed job — instead of standing idle —
  // once their own resource is full, while remembering their real trade in
  // u.homeJob so they drift back the moment their own stock starts to drop.
  export const JOB_ACTIVITY = { farmer: 'Farming', forager: 'Foraging', hunter: 'Hunting', fisher: 'Fishing', woodcutter: 'Gathering wood', miner: 'Mining stone' };
  export const JOB_STOCK_FULL = {
    farmer: c => resourceStockFull(c, 'food'),
    forager: c => resourceStockFull(c, 'food', 1.3),
    hunter: c => resourceStockFull(c, 'food', 1.6),
    fisher: c => resourceStockFull(c, 'food', 1.3),
    woodcutter: c => resourceStockFull(c, 'wood'),
    miner: c => resourceStockFull(c, 'stone'),
  };
  // Picks the most understaffed production job (other than the worker's own
  // trade) using the same desired/current counts assignWorkforce computes,
  // cached on the city each time it runs so this stays cheap.
  export function pickHelperJob(c, u) {
    const desired = c._desiredJobs, counts = c._jobCounts;
    if (!desired || !counts) return null;
    const home = u.homeJob || u.job;
    let bestJob = null, bestGap = 0;
    for (const job of Object.keys(JOB_ACTIVITY)) {
      if (job === home) continue;
      const gap = (desired[job] || 0) - (counts[job] || 0);
      if (gap > bestGap) { bestGap = gap; bestJob = job; }
    }
    return bestJob;
  }

  export function workRate(c, requiredLevel) {
    return (c.cultureLevel || 1) >= requiredLevel ? 2 : 1;
  }

  export function tieredWorkRate(c, tiers) {
    const lvl = c.cultureLevel || 1;
    let rate = 1;
    for (const [req, r] of tiers) if (lvl >= req) rate = r;
    return rate;
  }
  export const HUNT_RATE_TIERS = [[SPEAR_CULTURE_LEVEL, 2], [STONE_SPEAR_CULTURE_LEVEL, 3]];
  export const CHOP_RATE_TIERS = [[AXE_CULTURE_LEVEL, 2], [STONE_AXE_CULTURE_LEVEL, 3]];
  export const MINE_RATE_TIERS = [[DIGGING_SITE_CULTURE_LEVEL, 2], [QUARRY_SITE_CULTURE_LEVEL, 3]];
  export const FARM_RATE_TIERS = [[STONE_HOE_CULTURE_LEVEL, 2]];
  export const FORAGE_RATE_TIERS = [[STONE_HOE_CULTURE_LEVEL, 2]];

  export function addCarry(u, resource, amount) {
    if (!u || !resource || amount <= 0) return;
    const cap = CARRY_CAPACITY[resource] || 8;
    if ((u.carryAmount || 0) >= cap - .001) return;
    u.carryResource = resource;
    u.carryAmount = Math.min(cap, (u.carryAmount || 0) + amount);
  }

  export function findDeliveryPoint(c, resource, u) {
    const key = STORAGE_KEY_FOR_RESOURCE[resource];
    const count = (c.buildings || {})[key] || 0;
    if (!count) return { x: c.x, y: c.y };
    let best = null, bestD = Infinity;
    for (let i = 0; i < count; i++) {
      const p = buildingSlotPoint(c, key, i);
      const d = Math.hypot(p.x - u.x, p.y - u.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best || { x: c.x, y: c.y };
  }

  export function depositCarry(u, c) {
    const resource = u.carryResource;
    if (resource && c) {
      const capacity = resourceCapacity(c, resource);
      const room = Math.max(0, capacity - (c[resource] || 0));
      const delivered = Math.min(u.carryAmount || 0, room);
      c[resource] = (c[resource] || 0) + delivered;
    }
    u.carryAmount = 0;
    u.carryResource = null;
    u.activity = null; // forces an immediate reroll back into normal work next tick
  }

  export function chooseActivity(u, c) {
    if (!c) return 'Exploring';
    if (u.hunger > 68 && c.food > 0) return 'Eating';
    if (u.job === 'claimer') return 'Scouting land';
    const idle = () => Math.random() < .5 ? 'Socializing' : 'Exploring';
    if (u.job === 'builder') return c.project ? 'Building' : idle();
    if (JOB_ACTIVITY[u.job]) {
      u.homeJob ??= u.job; // the profession this worker keeps coming back to
      // Own stock started running low again — drop whatever help job and
      // go back to the trade this worker actually belongs to.
      if (u.job !== u.homeJob && JOB_STOCK_FULL[u.homeJob] && !JOB_STOCK_FULL[u.homeJob](c)) u.job = u.homeJob;
      if (JOB_STOCK_FULL[u.job](c)) {
        const helper = pickHelperJob(c, u);
        if (helper) { u.job = helper; return JOB_ACTIVITY[helper]; }
        return idle();
      }
      return JOB_ACTIVITY[u.job];
    }
    return idle();
  }

  export function findFarmTile(c) {
    if (!c.farmTiles || !c.farmTiles.length) return null;
    const idx = c.farmTiles[Math.floor(Math.random() * c.farmTiles.length)];
    return { x: idx % W + .5, y: Math.floor(idx / W) + .5 };
  }

  export function reservedTileIndices(kind, excludeUnitId) {
    const activity = { miner: 'Mining stone', forager: 'Foraging', woodcutter: 'Gathering wood', fisher: 'Fishing' }[kind];
    const set = new Set();
    for (const u of state.units) {
      if (!u.alive || u.type !== 'human' || u.job !== kind || u.id === excludeUnitId) continue;
      if (u.activity !== activity || !u.workTarget) continue;
      set.add(Math.floor(u.workTarget.y) * W + Math.floor(u.workTarget.x));
    }
    return set;
  }
  export function reservedAnimalIds(excludeUnitId) {
    const set = new Set();
    for (const u of state.units) {
      if (!u.alive || u.type !== 'human' || u.job !== 'hunter' || u.id === excludeUnitId) continue;
      if (u.activity !== 'Hunting' || u.workTarget?.animalId == null) continue;
      set.add(u.workTarget.animalId);
    }
    return set;
  }

  // Returns false once the tile/resource a unit is currently walking toward
  // has been consumed by someone else (or otherwise stopped existing) —
  // e.g. another miner cleared the ore vein while this unit was still
  // en route. Job kinds whose target can't go stale mid-walk (fisher's
  // shoreline, farmer's field, hunter's live animal — the latter already
  // re-tracks its target every tick in runHumanAI) are always valid here.
  export function workTargetStillValid(u) {
    const wt = u.workTarget;
    if (!wt) return false;
    const kind = u.job;
    if (kind === 'hunter' || kind === 'fisher' || kind === 'farmer') return true;
    const t = tile(Math.floor(wt.x), Math.floor(wt.y));
    if (!t) return false;
    if (kind === 'miner') return Boolean(t.ore);
    if (kind === 'forager') return Boolean(t.berries);
    if (kind === 'woodcutter') return t.terrain === 'forest' || Boolean(t.tree);
    return true;
  }

  export function findWorkTile(c, u) {
    const kind = u.job;
    const tiles = c.claimedTiles || [];
    let best = null;
    if (kind === 'miner') {
      const reserved = reservedTileIndices(kind, u.id);
      const canMineIron = (c.cultureLevel || 1) >= QUARRY_SITE_CULTURE_LEVEL;
      for (const idx of tiles) {
        if (reserved.has(idx)) continue;
        const t = state.tiles[idx];
        if (!t || !t.ore) continue;
        if (t.ore === 'iron' && !canMineIron) continue;
        const score = t.ore === 'gold' ? 3 : t.ore === 'iron' ? 2 : 1;
        if (score > (best?.score ?? -1)) best = { x: t.x + .5, y: t.y + .5, score };
      }
      return best || findDistantResourceTile(c, u);
    }
    if (kind === 'forager') {
      const reserved = reservedTileIndices(kind, u.id);
      for (const idx of tiles) {
        if (reserved.has(idx)) continue;
        const t = state.tiles[idx];
        if (!t || !t.berries) continue;
        best = { x: t.x + .5, y: t.y + .5, score: 1 };
        break;
      }
      return best || findDistantResourceTile(c, u);
    }
    if (kind === 'fisher') {
      const reserved = reservedTileIndices(kind, u.id);
      for (const idx of tiles) {
        if (reserved.has(idx)) continue;
        const x = idx % W, y = Math.floor(idx / W);
        if (!isShoreTile(x, y)) continue;
        best = { x: x + .5, y: y + .5, score: 1 };
        break;
      }
      return best || findDistantResourceTile(c, u);
    }
    if (kind === 'hunter') {
      const claimed = new Set(tiles);
      const reservedAnimals = reservedAnimalIds(u.id);
      const homeIdx = Math.floor(c.y) * W + Math.floor(c.x);
      const maxRadius = Math.hypot(W, H);
      let nearest = null, nearestAny = null;
      for (let radius = 24; ; radius *= 2) {
        let nearestD = Infinity, nearestAnyD = Infinity;
        nearest = null; nearestAny = null;
        for (const a of queryNearbyUnits(c.x, c.y, radius)) {
          if (a.type !== 'animal' || !a.alive || reservedAnimals.has(a.id)) continue;
          const idx = Math.floor(a.y) * W + Math.floor(a.x);
          if (!sameLandRegion(idx, homeIdx)) continue;
          const d = Math.hypot(a.x - c.x, a.y - c.y);
          if (claimed.has(idx) && d < nearestD) { nearestD = d; nearest = a; }
          if (d < nearestAnyD) { nearestAnyD = d; nearestAny = a; }
        }
        if (nearest || nearestAny || radius >= maxRadius) break;
      }
      const target = nearest || nearestAny;
      return target ? { x: target.x, y: target.y, animalId: target.id } : null;
    }
    if (kind === 'woodcutter') {
      const reserved = reservedTileIndices(kind, u.id);
      for (const idx of tiles) {
        if (reserved.has(idx)) continue;
        const t = state.tiles[idx];
        if (!t || !(t.terrain === 'forest' || t.tree)) continue;
        best = { x: t.x + .5, y: t.y + .5, score: 1 };
        break;
      }
      return best || findDistantResourceTile(c, u);
    }
    const sampleSize = Math.min(tiles.length, 20);
    for (let i = 0; i < sampleSize; i++) {
      const idx = tiles[Math.floor(Math.random() * tiles.length)];
      const x = idx % W, y = Math.floor(idx / W);
      const t = tile(x, y);
      if (!t || !isHabitable(t)) continue;
      let score = -1;
      if (kind === 'farmer' && (t.terrain === 'grass' || t.terrain === 'sand')) score = t.fertility;
      if (score > (best?.score ?? -1)) best = { x: x + .5, y: y + .5, score };
    }
    return best;
  }

  export function findDistantResourceTile(c, u) {
    const kind = u.job;
    const reserved = reservedTileIndices(kind, u.id);
    const homeIdx = Math.floor(c.y) * W + Math.floor(c.x);
    let best = null, bestD = Infinity;
    for (let idx = 0; idx < state.tiles.length; idx++) {
      if (session.territoryGrid && session.territoryGrid[idx] !== -1 && session.territoryGrid[idx] !== c.id) continue;
      if (reserved.has(idx)) continue;
      if (!sameLandRegion(idx, homeIdx)) continue;
      const t = state.tiles[idx];
      if (!t) continue;
      let match = false;
      if (kind === 'miner') {
        // Same iron gate as findWorkTile above — an iron vein doesn't count
        // as a match until the city has a Stone Quarry Site (Culture Lv18).
        match = Boolean(t.ore) && (t.ore !== 'iron' || (c.cultureLevel || 1) >= QUARRY_SITE_CULTURE_LEVEL);
      }
      else if (kind === 'forager') match = Boolean(t.berries);
      else if (kind === 'fisher') match = isShoreTile(t.x, t.y);
      else if (kind === 'woodcutter') match = t.terrain === 'forest' || Boolean(t.tree);
      if (!match) continue;
      const d = (t.x - c.x) ** 2 + (t.y - c.y) ** 2;
      if (d < bestD) { bestD = d; best = { x: t.x + .5, y: t.y + .5, score: 1 }; }
    }
    return best;
  }

  export function runHumanAI(u, c) {
    if (u.claimTarget) {
      u.activity = 'Claiming land';
      setMoveTarget(u, u.claimTarget.x, u.claimTarget.y, CLAIM_SPEED);
      if (Math.hypot(u.x - u.claimTarget.x, u.y - u.claimTarget.y) < .35) {
        const targetCity = state.cities.find(x => x.id === u.claimCityId);
        if (targetCity) finalizeClaim(targetCity, u);
        else {
          if (u.claimTileIdx != null && u.claimCityId != null) releaseClaimTile(u.claimTileIdx, u.claimCityId);
          u.claimTarget = null; u.claimCityId = null; u.claimTileIdx = null;
        }
      }
      return;
    }
    const resourceForJob = c && (u.carryResource || RESOURCE_BY_JOB[u.job]);
    if (resourceForJob && (u.carryAmount || 0) > 0) {
      const cap = CARRY_CAPACITY[resourceForJob] || 8;
      const bagFull = (u.carryAmount || 0) >= cap - .001;
      if (bagFull || !u.workTarget) {
        u.activity = 'Delivering';
        const dest = findDeliveryPoint(c, resourceForJob, u);
        setMoveTarget(u, dest.x, dest.y, DELIVER_SPEED);
        if (Math.hypot(u.x - dest.x, u.y - dest.y) < .5) depositCarry(u, c);
        return;
      }
    }
    const reroll = !u.activity || Math.random() < .22;
    if (reroll) u.activity = chooseActivity(u, c);
    if (!c) {
      const t = ensureRoamTarget(u, reroll, 'noCity', () => randomHabitableNear(u.x, u.y, 4));
      setMoveTarget(u, t.x, t.y, NO_CITY_ROAM_SPEED);
      return;
    }
    if (u.royalRole === 'King') {
      const capital = state.cities.find(city => city.id === u.homeCapitalId) || c;
      u.activity = 'Ruling from capital';
      const t = ensureRoamTarget(u, reroll, 'king', () => randomHabitableNear(capital.x, capital.y, 2));
      setMoveTarget(u, t.x, t.y, ROYAL_STROLL_SPEED);
      return;
    }
    if (u.royalRole && !u.governorOf && c.isCapital) {
      u.activity = 'Royal court';
      const t = ensureRoamTarget(u, reroll, 'royalCourt', () => randomHabitableNear(c.x, c.y, 3));
      setMoveTarget(u, t.x, t.y, COURT_STROLL_SPEED);
      return;
    }
    if (u.governorOf) u.activity = 'Governing city';
    let target = null;
    if (JOB_ACTIVITY[u.job] === u.activity) {
      // Invalidate immediately (not on the ~22%/tick reroll) the instant the
      // resource this unit is walking toward is gone — someone else got
      // there first, or it was otherwise depleted. Without this, a unit
      // could keep marching toward (and idling at) an empty tile for
      // several ticks waiting for a reroll to notice.
      if (u.workTarget && !workTargetStillValid(u)) u.workTarget = null;
      if (reroll || !u.workTarget) {
        u.workTarget = u.job === 'farmer' ? (findFarmTile(c) || findWorkTile(c, u)) : findWorkTile(c, u);
      } else if (u.job === 'hunter' && u.workTarget.animalId != null) {
        const animal = state.units.find(a => a.id === u.workTarget.animalId && a.alive);
        if (animal) { u.workTarget.x = animal.x; u.workTarget.y = animal.y; }
        else u.workTarget = findWorkTile(c, u);
      }
      target = u.workTarget;
    }
    if (u.activity === 'Eating' && c.food > 0) {
      c.food = Math.max(0, c.food - 1); u.hunger = Math.max(0, u.hunger - 35);
    } else if (u.activity === 'Building') {
      // Construction progress is resolved centrally in updateCityDevelopment
      // so milestones cannot be bypassed by a builder's personal tick.
      c.buildProgress = (c.buildProgress || 0) + .1;
    } else if (u.activity === 'Farming') {
      const onField = target && Math.hypot(u.x - target.x, u.y - target.y) < .6;
      // Stone Hoe (Culture Lv16) speeds up farming too — see FARM_RATE_TIERS.
      if (onField) addCarry(u, 'food', (.55 + (tile(Math.floor(u.x), Math.floor(u.y))?.fertility || .5) * .5) * tieredWorkRate(c, FARM_RATE_TIERS));
    } else if (u.activity === 'Fishing') {
      const onSpot = target && Math.hypot(u.x - target.x, u.y - target.y) < .6;
      if (onSpot) addCarry(u, 'food', .5);
    }
    if (target) {
      const speed = u.activity === 'Building' ? SHUFFLE_SPEED : u.activity === 'Hunting' ? HUNT_SPEED : WORK_COMMUTE_SPEED;
      setMoveTarget(u, target.x, target.y, speed);
    } else {
      // Off duty (no work target): roam anywhere within KINGDOM_ROAM_RADIUS
      // grids of any claimed tile in the same kingdom, not just this city's
      // own tiles — people visit other towns in their kingdom, not just
      // pace around their home turf.
      const t = ensureRoamTarget(u, reroll, 'cityWander', () => kingdomRoamTarget(c));
      setMoveTarget(u, t.x, t.y, u.activity === 'Building' ? SHUFFLE_SPEED : CITY_WANDER_SPEED);
    }
  }

  export const ANIMAL_FLEE_RADIUS = 4;
  export function nearestHunterWithin(x, y, radius) {
    let nearest = null, nearestD = radius;
    for (const u of queryNearbyUnits(x, y, radius)) {
      if (u.type !== 'human' || !u.alive || u.job !== 'hunter') continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < nearestD) { nearestD = d; nearest = u; }
    }
    return nearest;
  }

  export function runAnimalAI(u) {
    const threat = nearestHunterWithin(u.x, u.y, ANIMAL_FLEE_RADIUS);
    if (threat) {
      u.activity = 'Fleeing';
      const dx = u.x - threat.x, dy = u.y - threat.y;
      const dist = Math.hypot(dx, dy) || 1;
      const t = randomHabitableNear(u.x + (dx / dist) * 6, u.y + (dy / dist) * 6, 2);
      setMoveTarget(u, t.x, t.y, ANIMAL_FLEE_SPEED);
      return;
    }
    const reroll = !u.activity || u.activity === 'Fleeing' || Math.random() < .22;
    if (reroll) u.activity = Math.random() < .5 ? 'Foraging' : 'Wandering';
    const t = ensureRoamTarget(u, reroll, 'animalWander', () => randomHabitableNear(u.x, u.y, 5));
    setMoveTarget(u, t.x, t.y, ANIMAL_WANDER_SPEED);
  }

  export function worldHour() {
    return (((state.year - 1) * MONTHS_PER_YEAR + ((state.month || 1) - 1)) * DAYS_PER_MONTH + (state.day - 1)) * 24 + state.hour;
  }

  export function findOutpostSite(city) {
    const frontier = frontierCandidates(city);
    if (!frontier.length) return null;
    const homeIdx = Math.floor(city.y) * W + Math.floor(city.x);
    const order = frontier.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const idx of order.slice(0, 40)) {
      const fx = idx % W, fy = (idx / W) | 0;
      for (const pushOut of [rand(3, 6), rand(6, 10)]) {
        const angle = Math.random() * Math.PI * 2;
        const x = Math.floor(fx + Math.cos(angle) * pushOut);
        const y = Math.floor(fy + Math.sin(angle) * pushOut);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (!isHabitable(tile(x, y))) continue;
        if (!sameLandRegion(y * W + x, homeIdx)) continue;
        const tooClose = state.cities.some(other => {
          const d = Math.hypot(other.x - (x + .5), other.y - (y + .5));
          const rival = other.kingdomId && other.kingdomId !== city.kingdomId;
          return d < (rival ? 18 : 10);
        });
        if (tooClose) continue;
        if (session.territoryGrid) {
          const ownerId = session.territoryGrid[y * W + x];
          if (ownerId !== -1) continue;
        }
        return { x, y };
      }
    }
    return null;
  }

  export const CITY_SPLIT_MILESTONES = [60, 140, 200];
  export const CITY_SPLIT_SETTLERS = 10;

  export function civilizationAI() {
    for (const city of state.cities) planCityClaims(city);
    for (const city of state.cities.slice()) {
      const kingdom = state.kingdoms.find(k => k.id === city.kingdomId);
      city.splitStage ??= 0;
      const nextMilestone = CITY_SPLIT_MILESTONES[city.splitStage];
      const milestoneReady = nextMilestone !== undefined && city.pop >= nextMilestone;
      if (!city.kingdomId || !milestoneReady) continue;
      if ((city.nextExpansionAt || 0) > worldHour()) continue;
      const royalFounderCandidate = kingdom && state.units.find(u => u.type === 'human' && u.alive
        && u.city === city.id && (u.royalRole === 'Prince' || u.royalRole === 'Princess'));
      const useRoyalFounding = Boolean(kingdom && kingdom.royalSystemReady && !kingdom.royalExpansionSent
        && city.id === kingdom.capitalCityId && royalFounderCandidate);
      const royalFounder = useRoyalFounding ? royalFounderCandidate : null;
      const candidates = state.units.filter(u => u.type === 'human' && u.alive && u.city === city.id && u.age >= 18)
        .sort((a, b) => (b.traits?.intelligence || 0) - (a.traits?.intelligence || 0));
      const settlers = royalFounder
        ? [royalFounder, ...candidates.filter(u => u.id !== royalFounder.id)].slice(0, CITY_SPLIT_SETTLERS)
        : candidates.slice(0, CITY_SPLIT_SETTLERS);
      if (settlers.length < CITY_SPLIT_SETTLERS) continue;
      const site = findOutpostSite(city);
      if (!site) continue;
      city.nextExpansionAt = worldHour() + clamp(24 * 12, 24 * 4, 24 * 20);
      city.splitStage++;
      if (useRoyalFounding) kingdom.royalExpansionSent = true;
      const governor = royalFounder || state.units.find(u => u.type === 'human' && u.alive && u.kingdomId === city.kingdomId
        && u.royalRole && u.royalRole !== 'King' && !u.governorOf);
      const outpost = {
        id: makeId(), name: generateCityName(city.race || 'human'), race: city.race || 'human',
        kingdomId: city.kingdomId, x: site.x + .5, y: site.y + .5, pop: 0,
        food: 70, wood: 30, stone: 10, iron: 0, level: 1, houses: 0, prosperity: 45,
        buildProgress: 0, leaderId: governor?.id || null, nextExpansionAt: 0, isCapital: false,
        buildings: { market: 0, granary: 0, woodStore: 0, oreStore: 0, workshop: 0, barracks: 0, tavern: 0, temple: 0, school: 0, library: 0, port: 0, townCenter: 0, plaza: 0, fort: 0, fishingDock: 0 },
        project: null, projectProgress: 0, culture: 0, cultureLevel: 1, cultureProgress: 0, health: 80,
        townHallBuilt: false, palaceBuilt: false, farmAreas: 0, farmTiles: [], farmCenters: [],
        claimedTiles: initialCityClaim(site.x, site.y, 9),
        claimerUnitIds: [], lastClaimedAt: -9999, lastClaimedX: null, lastClaimedY: null,
        claimingBlockedUntil: 0, parentCityId: city.id
      };
      state.cities.push(outpost);
      recomputeCityBBox(outpost);
      paintClaimedLive(outpost);
      const outpostKingdom = state.kingdoms.find(k => k.id === city.kingdomId);
      if (outpostKingdom) {
        const seed = initialCivFloodClaim(site.x, site.y,
          Math.max(3, Math.min(30, Math.floor((outpostKingdom.civClaimedTiles?.length || 4) * .25))));
        const merged = new Set(outpostKingdom.civClaimedTiles || []);
        for (const idx of seed) merged.add(idx);
        outpostKingdom.civClaimedTiles = [...merged];
        paintCivClaimedLive(outpostKingdom.id, seed);
      }
      for (const settler of settlers) {
        settler.city = outpost.id; settler.x = outpost.x + rand(-.7, .7); settler.y = outpost.y + rand(-.7, .7);
        settler.activity = 'Founding outpost';
      }
      if (governor) {
        governor.city = outpost.id; governor.governorOf = outpost.id;
        governor.x = outpost.x; governor.y = outpost.y; governor.activity = 'Governing city';
        logEvent(useRoyalFounding
          ? `${city.name} ส่งพระบรมวงศานุวงศ์ ${governor.name} ไปก่อตั้ง${outpost.name}ใกล้เคียง`
          : `${city.name} ส่งผู้ตั้งถิ่นฐานไปสร้าง ${outpost.name} นำโดยเจ้าเมือง ${governor.name}`, '🧭');
      } else {
        logEvent(`${city.name} ส่งผู้ตั้งถิ่นฐานไปสร้าง ${outpost.name}`, '🧭');
      }
      showToast(`${city.name} ขยายอาณาเขตไปยัง ${outpost.name}`);
    }
    updateSettlements();
  }

  // One call = one substep = 1/SIM_SUBSTEPS_PER_HOUR of a game hour (see
  // state.js). Per-unit stats and work/build progress scale by `frac` and
  // run every substep so they advance in small, frequent increments
  // instead of one big jump per hour. The once-per-hour systems (weather,
  // world events, culture/trade/kingdom bookkeeping, environment growth)
  // only run when this substep is the one that crosses a whole-hour
  // boundary, so their pacing and balance are unchanged from before.
  // Rebuilding the city-id lookup Map and the unit spatial hash is an O(n)
  // full-population pass each — worth doing once per rendered frame, not
  // once per individual substep. At high speed multipliers a single frame
  // can run several substeps back to back (see MAX_SUBSTEPS_PER_FRAME in
  // state.js), and every one of those used to redo this same rebuild for
  // no benefit — the population barely changes within one frame's worth
  // of substeps. Call this once from main.js's loop() right before the
  // substep loop starts (and once before the startup warm-up ticks).
  export function syncSimIndexes() {
    rebuildCityIndex();
    buildSpatialGrid();
  }
  const SUBSTEP_FRACTION = 1 / SIM_SUBSTEPS_PER_HOUR;
  export function simulationStep() {
    state.simTicks = (state.simTicks || 0) + 1;
    state.hourFrac = (state.hourFrac || 0) + SUBSTEP_FRACTION;
    let crossedHour = false;
    while (state.hourFrac >= 1 - 1e-9) {
      state.hourFrac -= 1;
      crossedHour = true;
      state.hour++;
      if (state.hour >= 24) {
        state.hour = 0; state.day++;
      }
      if (state.day > DAYS_PER_MONTH) {
        state.day = 1; state.month = (state.month || 1) + 1;
        if (state.month > MONTHS_PER_YEAR) { state.month = 1; state.year++; }
        // 3 months per season, in the same order as SEASONS/MONTHS.
        state.season = SEASONS[Math.floor((state.month - 1) / 3) % SEASONS.length];
      }
      if (state.hour % 12 === 0) {
        const weather = ['Clear', 'Clear', 'Rain', 'Wind'];
        const nextWeather = weather[Math.floor(Math.random() * weather.length)];
        if (nextWeather !== state.weather) logEvent(`สภาพอากาศเปลี่ยนเป็น ${nextWeather}`, nextWeather === 'Rain' ? '🌧️' : '☀️');
        state.weather = nextWeather;
      }
    }
    // Tornadoes glide every substep (like unit movement above) instead of
    // jumping once per game hour — otherwise they visibly teleport once
    // every ~5 real seconds and sit frozen in between.
    updateDisasters(SUBSTEP_FRACTION);
    for (const c of state.cities) {
      c.pop = 0;
      c.food = Math.max(0, c.food);
      c.wood = Math.max(0, c.wood);
      c.stone = Math.max(0, c.stone);
    }
    for (const u of state.units) {
      if (!u.alive) continue;
      if (u.type === 'ship') continue;
      u.age += (u.type === 'human' ? .02 : .08) * SUBSTEP_FRACTION;
      u.hunger = Math.min(100, u.hunger + (u.type === 'human' ? 1.8 : 1.1) * SUBSTEP_FRACTION);
      let currentCity = null;
      if (u.type === 'human') {
        u.energy = Math.max(0, u.energy - .8 * SUBSTEP_FRACTION);
        const c = cityOf(u);
        currentCity = c;
        if (c) {
          c.pop++;
          if (u.job === 'woodcutter') {
            const wt = u.workTarget;
            const wtile = wt ? tile(Math.floor(wt.x), Math.floor(wt.y)) : null;
            // Someone else felled this tree while we were still walking over —
            // drop it now instead of marching on to an empty tile.
            if (wt && !(wtile && (wtile.terrain === 'forest' || wtile.tree))) u.workTarget = null;
            const onTarget = wtile && (wtile.terrain === 'forest' || wtile.tree)
              && u.activity === 'Gathering wood' && Math.hypot(u.x - wt.x, u.y - wt.y) < .6;
            if (onTarget) {
              addCarry(u, 'wood', .3 * SUBSTEP_FRACTION);
              // Wooden Axe (Culture Lv5) doubles chop speed, Stone Axe
              // (Culture Lv15) pushes it further still — see CHOP_RATE_TIERS.
              wtile.chopProgress = (wtile.chopProgress || 0) + tieredWorkRate(c, CHOP_RATE_TIERS) * SUBSTEP_FRACTION;
              if (wtile.chopProgress >= 4) { fellTree(wtile, c, 6, u); u.workTarget = null; }
            }
          }
          if (u.job === 'forager') {
            const wt = u.workTarget;
            const wtile = wt ? tile(Math.floor(wt.x), Math.floor(wt.y)) : null;
            // Someone else already picked this bush clean — release it now.
            if (wt && !(wtile && wtile.berries)) u.workTarget = null;
            const onTarget = wtile && wtile.berries
              && u.activity === 'Foraging' && Math.hypot(u.x - wt.x, u.y - wt.y) < .6;
            if (onTarget) {
              // Stone Hoe (Culture Lv16) speeds up berry picking too — see
              // FORAGE_RATE_TIERS.
              wtile.chopProgress = (wtile.chopProgress || 0) + tieredWorkRate(c, FORAGE_RATE_TIERS) * SUBSTEP_FRACTION;
              if (wtile.chopProgress >= 3) { pickBerries(wtile, c, 5, u); u.workTarget = null; }
            }
          }
          if (u.job === 'hunter') {
            const wt = u.workTarget;
            const animal = wt?.animalId != null ? state.units.find(a => a.id === wt.animalId && a.alive) : null;
            const onTarget = animal && u.activity === 'Hunting' && Math.hypot(u.x - animal.x, u.y - animal.y) < .6;
            if (onTarget) {
              u.huntProgress = (u.huntProgress || 0) + tieredWorkRate(c, HUNT_RATE_TIERS) * SUBSTEP_FRACTION;
              if (u.huntProgress >= 5) {
                animal.alive = false;
                addCarry(u, 'food', 6);
                u.huntProgress = 0;
                u.workTarget = null;
              }
            } else {
              u.huntProgress = 0;
            }
          }
          if (u.job === 'miner') {
            const wt = u.workTarget;
            const wtile = wt ? tile(Math.floor(wt.x), Math.floor(wt.y)) : null;
            // Someone else already mined this vein out — release it now.
            if (wt && !(wtile && wtile.ore)) u.workTarget = null;
            const onTarget = wtile && wtile.ore
              && u.activity === 'Mining stone' && Math.hypot(u.x - wt.x, u.y - wt.y) < .6;
            if (onTarget) {
              wtile.chopProgress = (wtile.chopProgress || 0) + tieredWorkRate(c, MINE_RATE_TIERS);
              if (wtile.chopProgress >= 4) {
                const reward = wtile.ore === 'gold' ? 4 : wtile.ore === 'iron' ? 5 : 6;
                mineOre(wtile, c, reward, u);
                u.workTarget = null;
              }
            }
          }
          if (u.job === 'builder') c.wood += .15;
          if (u.hunger > 65 && c.food > 1) { c.food--; u.hunger = Math.max(0, u.hunger - 45); }
          else if (u.hunger > 82) { u.hp -= .8 * SUBSTEP_FRACTION; u.happiness = Math.max(0, u.happiness - .5 * SUBSTEP_FRACTION); }
          if (u.energy < 20) u.energy += 3 * SUBSTEP_FRACTION;
          if (u.age > 65) u.hp -= .08 * SUBSTEP_FRACTION;
          if (u.hp <= 0 || u.age > 95) u.alive = false;
        }
      } else if (u.age > 18) {
        u.hp -= .1 * SUBSTEP_FRACTION;
        if (u.hp <= 0) u.alive = false;
      }
      const underfoot = tile(Math.floor(u.x), Math.floor(u.y));
      if (underfoot?.fire > 0) u.hp -= 8 * SUBSTEP_FRACTION;
      if (underfoot?.terrain === 'lava') u.hp -= 15 * SUBSTEP_FRACTION;
      if (u.infected) {
        // infectedTimer counts down in game-hours (starts at 30), so it
        // must shrink by a fraction of an hour each substep, not a whole
        // hour — otherwise infections resolved 6x too fast.
        u.infectedTimer = (u.infectedTimer ?? 30) - SUBSTEP_FRACTION;
        if (Math.random() < .05 * SUBSTEP_FRACTION) u.hp -= 4;
        if (u.infectedTimer <= 0) { if (Math.random() < .45) u.alive = false; u.infected = false; }
      }
      if (u.hp <= 0) u.alive = false;
      if (u.type === 'human') runHumanAI(u, currentCity);
      else runAnimalAI(u);
    }
    // Everything below this point was, before the substep split, one
    // "per game hour" chunk of world-level logic (courtship, disasters,
    // environment growth, culture/trade/kingdom bookkeeping). It's kept
    // gated to only run on the substep that actually crosses a whole
    // hour boundary, so it still runs exactly as often — and at exactly
    // the same balance — as it did before. Only the per-unit stats above
    // got smoothed out into every substep.
    if (crossedHour) {
      const adults = state.units.filter(u => u.type === 'human' && u.alive && u.age >= 18 && u.age < 45);
      for (const c of state.cities) {
        const local = adults.filter(u => u.city === c.id);
        // Try to form a few couples per hour (not just one) so a small
        // starting population doesn't sit unpaired for dozens of hours —
        // this was the biggest early-game growth bottleneck.
        const singles = local.filter(u => u.partner == null);
        const pairAttempts = Math.min(3, Math.floor(singles.length / 2));
        for (let i = 0; i < pairAttempts; i++) {
          if (Math.random() >= .15) continue;
          const pool = singles.filter(u => u.partner == null);
          if (pool.length < 2) break;
          const a = pool[Math.floor(Math.random() * pool.length)];
          const b = pool[Math.floor(Math.random() * pool.length)];
          if (a === b) continue;
          a.partner = b.id; b.partner = a.id; a.children = []; b.children = a.children;
        }
        // Housing scarcity still slows births, but a brand-new city with
        // no houses yet (default capacity 3) should not be throttled to
        // near-zero — .4 floor instead of .1, and a slightly higher base
        // capacity so the starting population isn't instantly "overcrowded".
        const housingCapacity = Math.max(1, c.housingCapacity || 6);
        const occupancy = c.pop / housingCapacity;
        // Housing controls fertility without creating a game-over condition:
        // under 75% occupancy births are healthy, 75–100% slow down, and
        // overcrowding becomes a strong brake. A tiny emergency floor keeps
        // a struggling settlement recoverable once food/housing improve.
        const housingFactor = occupancy <= .75
          ? 1.15
          : occupancy <= 1 ? 1.15 - (occupancy - .75) * 2.2
          : Math.max(.08, .6 - (occupancy - 1) * 1.6);
        const newbornTiles = new Set();
        for (const p of local.filter(u => u.partner && u.children.length < 5)) {
          if (Math.random() < .02 * clamp((c.happiness || 50) / 70, .5, 1.35) * housingFactor) {
            const site = pickNewbornTile(c, newbornTiles);
            const child = spawnHuman(site.x, site.y, p);
            if (child) {
              child.city = c.id; child.everHadCity = true;
              // spawnHuman already ran the immediate-walk AI call, but at that
              // point child.city wasn't set yet, so it computed a "no city"
              // roam target instead of a proper in-city one. Re-run now that
              // the city is assigned, same fix pattern as spawnHuman itself.
              child.roamTarget = null; child.roamLabel = null; child.activity = null;
              runHumanAI(child, c);
              claimNewResidentQuota(c, 4);
              p.children.push(child.id);
              const partner = state.units.find(x => x.id === p.partner);
              if (partner) partner.children = p.children.slice();
            }
          }
        }
      }
      spreadFire();
      updateVolcanoes();
      recoverCraters();
      growForests();
      growOreDeposits();
      growBerries();
      growWildlife();
      growCivilizationTerritory();
      spreadPlague();
      updateSettlements();
      civilizationAI();
      shareKingdomResources();
      removeAbandonedCities();
      for (const c of state.cities) updateCityDevelopment(c);
      updateCultureDiffusion();
      updateSeaTrade();
      runWorldEvents();
      updateKingdoms();
      // Rebuilding the BFS flood is cheap but not free (whole-map scan), so it
      // only reruns every few in-game hours rather than every single tick.
      if (worldHour() - state.territoryGridHour >= 3) {
        rebuildTerritoryGrid();
        rebuildLandRegions();
        rebuildWaterRegions();
        rebuildCivGrid();
        state.territoryGridHour = worldHour();
      }
    }
  }

