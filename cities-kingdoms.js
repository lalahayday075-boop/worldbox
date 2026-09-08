// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// City growth and kingdom management: settlement upkeep, kingdom founding/succession, resource sharing, royal family, and city development (construction, farms).
// Part of the World Simulator script split (see index.html for load order).
'use strict';

import { CITY_BUILD_PLANS, FARMER_JOB_CAP, FARMER_JOB_CAP_2, FISHER_CULTURE_LEVEL, H, HOUSE2_CAPACITY_PER_HOUSE, HOUSE2_CULTURE_LEVEL, HUNTER_CULTURE_LEVEL, MARKET2_CULTURE_LEVEL, MARKET_MAX_COUNT, MARKET_MAX_COUNT_2, SPECIES, W, WINDMILL2_CULTURE_LEVEL, clamp, latticeNoise, logEvent, makeId, session, state } from './state.js';
import { resourceNeed, worldHour } from './ai-simulation.js';
import { assignKingdomColor } from './buildings-render.js';
import { KINGDOM_TIERS, computeCultureIdentity, computeKingdomTier } from './civilization.js';
import { cityDevelopmentStage, computeCitySpecialization, meetsCultureRequirement, updateCityCulture } from './culture.js';
import { generateCityName, generateDynastyName, generateKingdomName, royalDisplayName } from './names.js';
import { fellTree, initialCityClaim, initialCivFloodClaim, isCoastalCity, isShoreTile, isWaterfrontCity, paintCivClaimedLive, paintClaimedLive, recomputeCityBBox, releaseCityReservations, releaseClaimTile, sameLandRegion } from './territory-units.js';
import { showToast } from './ui.js';
import { cityGridTarget, cityLevel, ensureBuilder, ensureResourceWorkers, nextCityConstruction } from './world.js';
import { cityIcon, crownIcon, kingdomIcon, resourceIcon } from './icons.js';

  // --- Disaster damage --------------------------------------------------
  // Buildings a disaster is allowed to knock down. Deliberately excludes
  // townHallBuilt/palaceBuilt (milestone flags elsewhere on the city, not
  // part of this counter object) so a bad-luck disaster can never undo a
  // capital's royal-system eligibility or brick city progression — only
  // the repeatable capacity/service buildings tracked in c.buildings.
  export const DISASTER_TARGETABLE_BUILDINGS = ['market', 'granary', 'woodStore', 'oreStore', 'workshop', 'barracks', 'tavern', 'temple', 'school', 'library', 'port', 'townCenter', 'plaza', 'fort', 'fishingDock', 'stoneMine', 'ironMine', 'goldMine'];
  // Finds which (if any) city currently claims a given tile index — used
  // by disasters-terrain-render.js to know whether a struck tile is inside
  // a city's territory and should also damage that city, not just terrain.
  export function cityClaimingTile(idx) {
    for (const c of state.cities) if ((c.claimedTiles || []).includes(idx)) return c;
    return null;
  }
  // Knocks down `hits` random present buildings in c.buildings (one at a
  // time, re-rolling among what's left standing) and dents happiness to
  // match. Returns the building keys actually destroyed (may be shorter
  // than `hits` if the city runs out of buildings to lose). Silent no-op
  // (returns []) on a city with nothing destructible — small/new
  // settlements without service buildings yet just take the happiness hit
  // from whatever direct casualty/resource logic the disaster already did.
  export function damageCityBuildings(c, hits = 1) {
    if (!c.buildings) return [];
    let present = DISASTER_TARGETABLE_BUILDINGS.filter(k => (c.buildings[k] || 0) > 0);
    const destroyed = [];
    for (let i = 0; i < hits && present.length; i++) {
      const key = present[Math.floor(Math.random() * present.length)];
      c.buildings[key]--;
      destroyed.push(key);
      present = DISASTER_TARGETABLE_BUILDINGS.filter(k => (c.buildings[k] || 0) > 0);
    }
    if (destroyed.length) c.happiness = clamp((c.happiness || 50) - 6 * destroyed.length, 0, 100);
    return destroyed;
  }
  export function buildingLabel(key) {
    return DEVELOPMENT_PROJECTS[key]?.label || key;
  }

  export function countBerryTiles(c) {
    let count = 0;
    for (const idx of c.claimedTiles || []) {
      const t = state.tiles[idx];
      if (t && t.berries) count++;
    }
    return count;
  }
  export function countHuntableAnimals(c) {
    const homeIdx = Math.floor(c.y) * W + Math.floor(c.x);
    let count = 0;
    for (const a of state.units) {
      if (a.type === 'animal' && a.alive && sameLandRegion(Math.floor(a.y) * W + Math.floor(a.x), homeIdx)) count++;
    }
    return count;
  }
  export function countShoreTiles(c) {
    let count = 0;
    for (const idx of c.claimedTiles || []) {
      const x = idx % W, y = Math.floor(idx / W);
      if (isShoreTile(x, y)) count++;
    }
    return count;
  }

  export function desiredJobCounts(c) {
    const pop = c.pop || 0;
    const need = resourceNeed(c, 'food');
    const foodRatio = need > 0 ? (c.food || 0) / need : 1;
    const foodShare = clamp(.65 - foodRatio * .5, .15, .65);
    const foodWorkers = Math.round(pop * foodShare);
    const berries = countBerryTiles(c);
    const animals = countHuntableAnimals(c);
    const forager = Math.min(Math.round(foodWorkers * .35), berries, Math.ceil(pop * .3));
    const hunter = (c.cultureLevel || 1) >= HUNTER_CULTURE_LEVEL
      ? Math.min(Math.round(foodWorkers * .25), animals, Math.ceil(pop * .2)) : 0;
    const shores = countShoreTiles(c);
    const fisher = isWaterfrontCity(c) && (c.cultureLevel || 1) >= FISHER_CULTURE_LEVEL
      ? Math.min(Math.round(foodWorkers * .25), shores, Math.ceil(pop * .2)) : 0;
    const farmer = Math.min(Math.max(0, foodWorkers - forager - hunter - fisher), farmerJobCap(c));
    const rest = Math.max(0, pop - farmer - forager - hunter - fisher);
    return {
      farmer, forager, hunter, fisher,
      woodcutter: Math.round(rest * .4),
      miner: Math.round(rest * .35),
      builder: Math.round(rest * .25)
    };
  }

  export function farmerJobCap(c) {
    return (c.cultureLevel || 1) >= WINDMILL2_CULTURE_LEVEL ? FARMER_JOB_CAP_2 : FARMER_JOB_CAP;
  }

  export function currentJobCounts(localHumans) {
    const counts = {};
    for (const u of localHumans) if (u.job) counts[u.job] = (counts[u.job] || 0) + 1;
    return counts;
  }

  export function mostNeededJob(desired, counts) {
    let bestJob = 'farmer', bestGap = -Infinity;
    for (const job of Object.keys(desired)) {
      const gap = desired[job] - (counts[job] || 0);
      if (gap > bestGap) { bestGap = gap; bestJob = job; }
    }
    return bestJob;
  }

  export function mostOversuppliedNonFoodJob(desired, counts, c) {
    const candidates = ['woodcutter', 'miner'].concat(c.project ? [] : ['builder']);
    let bestJob = null, bestGap = 0;
    for (const job of candidates) {
      const gap = (counts[job] || 0) - desired[job];
      if (gap > bestGap) { bestGap = gap; bestJob = job; }
    }
    return bestJob;
  }

  export function assignWorkforce(c, localHumans, gridFull) {
    const desired = desiredJobCounts(c);
    const counts = currentJobCounts(localHumans);
    for (const u of localHumans) {
      if (!u.job) {
        u.job = gridFull ? mostNeededJob(desired, counts) : 'claimer';
      } else if (u.job === 'claimer' && gridFull) {
        u.job = mostNeededJob(desired, counts);
        // Grid cap was hit while this unit was already walking out to claim
        // a tile — drop the mission now instead of letting runHumanAI's
        // claimTarget branch (which doesn't check job) walk them the rest
        // of the way and finalize an over-cap claim anyway.
        if (u.claimTileIdx != null && u.claimCityId != null) releaseClaimTile(u.claimTileIdx, u.claimCityId);
        u.claimTarget = null; u.claimCityId = null; u.claimTileIdx = null;
      } else {
        continue;
      }
      if (u.job !== 'claimer') { counts[u.job] = (counts[u.job] || 0) + 1; u.jobAssignedAt = worldHour(); u.homeJob = u.job; }
    }
    // Cached for chooseActivity/pickHelperJob in ai-simulation.js, so a
    // worker whose own stockpile is full can pick the most understaffed
    // job to go help with without re-scanning every tile on every tick.
    c._desiredJobs = desired;
    c._jobCounts = counts;
    if (!gridFull) return;
    const need = resourceNeed(c, 'food');
    const foodRatio = need > 0 ? (c.food || 0) / need : 1;
    if (foodRatio >= .35) return;
    const foodDesired = { farmer: desired.farmer, forager: desired.forager, hunter: desired.hunter, fisher: desired.fisher };
    const shortJob = mostNeededJob(foodDesired, counts);
    if ((foodDesired[shortJob] || 0) <= (counts[shortJob] || 0)) return;
    const fromJob = mostOversuppliedNonFoodJob(desired, counts, c);
    if (!fromJob) return;
    const worker = localHumans.find(u => u.job === fromJob && (worldHour() - (u.jobAssignedAt || 0)) > 12);
    if (!worker) return;
    worker.job = shortJob;
    // A real retraining, not a temporary help-out — update homeJob too, or
    // chooseActivity's "own stock ran low, go home" logic would immediately
    // pull them back to fromJob once it's no longer oversupplied.
    worker.homeJob = shortJob;
    worker.jobAssignedAt = worldHour();
  }

  // Settlements are emergent: five nearby living people are enough to start a camp.
  export function updateSettlements() {
    const humans = state.units.filter(u => u.type === 'human' && u.alive);
    for (const c of state.cities) c.pop = 0;
    for (const u of humans) {
      if (u.everHadCity) {
        const home = state.cities.find(c => c.id === u.city);
        if (home) home.pop++;
        continue;
      }
      let owner = null;
      if (session.territoryGrid) {
        const tx = clamp(Math.floor(u.x), 0, W - 1), ty = clamp(Math.floor(u.y), 0, H - 1);
        const ownerId = session.territoryGrid[ty * W + tx];
        if (ownerId !== -1) {
          const claimed = state.cities.find(c => c.id === ownerId && c.race === (u.race || 'human'));
          if (claimed) owner = claimed;
        }
      }
      if (owner) { u.city = owner.id; u.everHadCity = true; owner.pop++; }
      else { u.city = null; u.homelessSince ??= state.simTicks || 0; }
    }
    const unassigned = humans.filter(h => h.city == null && !h.everHadCity);
    const visited = new Set();
    for (const starter of unassigned) {
      if (visited.has(starter.id)) continue;
      const group = [], queue = [starter];
      visited.add(starter.id);
      while (queue.length) {
        const current = queue.shift();
        group.push(current);
        for (const candidate of unassigned) {
          if (visited.has(candidate.id) || candidate.race !== starter.race) continue;
          if (Math.hypot(candidate.x - current.x, candidate.y - current.y) <= 10) {
            visited.add(candidate.id);
            queue.push(candidate);
          }
        }
      }
      if (group.length < 2) continue;
      if (group.length < 5) {
        const oldestHomelessSince = Math.min(...group.map(u => u.homelessSince ?? (state.simTicks || 0)));
        const homelessHours = (state.simTicks || 0) - oldestHomelessSince;
        const requiredHours = (5 - group.length) * 48; // 4→48h(~2d), 3→96h(~4d), 2→144h(~6d)
        if (homelessHours < requiredHours) continue;
      }
      const x = group.reduce((sum, u) => sum + u.x, 0) / group.length;
      const y = group.reduce((sum, u) => sum + u.y, 0) / group.length;
      if (session.territoryGrid) {
        const cx = clamp(Math.floor(x), 0, W - 1), cy = clamp(Math.floor(y), 0, H - 1);
        if (session.territoryGrid[cy * W + cx] !== -1) continue;
      }
      const c = {
        id: makeId(), name: generateCityName(group[0].race || 'human'),
        race: group[0].race || 'human', x, y, pop: 0, food: 120, wood: 50, stone: 20, iron: 0, level: 1,
        houses: 0, prosperity: 50, buildProgress: 0, leaderId: null,
        kingdomId: null, isCapital: true, nextExpansionAt: 0,
        buildings: { market: 0, granary: 0, woodStore: 0, oreStore: 0, workshop: 0, barracks: 0, tavern: 0, temple: 0, school: 0, library: 0, port: 0 },
        project: null, projectProgress: 0, culture: 0, cultureLevel: 1, cultureProgress: 0, health: 80,
        townHallBuilt: false, palaceBuilt: false, farmAreas: 0, farmTiles: [], farmCenters: [],
        claimedTiles: initialCityClaim(x, y, Math.max(4, group.length * 4)),
        claimerUnitIds: [], lastClaimedAt: -9999, lastClaimedX: null, lastClaimedY: null,
        claimingBlockedUntil: 0
      };
      state.cities.push(c);
      recomputeCityBBox(c);
      paintClaimedLive(c);
      for (const u of group) { u.city = c.id; u.everHadCity = true; c.pop++; }
      const speciesInfo = SPECIES[c.race] || SPECIES.human;
      const kingdom = {
        id: makeId(), name: generateKingdomName(c.race), race: c.race, dynastyName: generateDynastyName(c.race),
        cities: [c.id], population: c.pop, gold: 100, happiness: 70,
        capitalCityId: c.id, kingId: null, royalFamily: [], royalSystemReady: false,
        royalExpansionSent: false,
        civClaimedTiles: initialCivFloodClaim(x, y, Math.max(2, Math.floor(group.length / 3))),
        civOriginAt: worldHour(), nextCivGrowAt: 0
      };
      c.kingdomId = kingdom.id;
      state.kingdoms.push(kingdom);
      paintCivClaimedLive(kingdom.id, kingdom.civClaimedTiles);
      assignKingdomColor(kingdom);
      logEvent(`${c.name} (${speciesInfo.label}) ก่อตั้งขึ้นจากประชากร ${group.length} คน`, cityIcon(16));
      showToast(`${c.name} ก่อตั้งขึ้นจากประชากร ${group.length} คน`);
      logEvent(`${kingdom.name} ถือกำเนิดขึ้น`, kingdomIcon(16));
    }
    for (const c of state.cities) {
      const info = cityLevel(c.pop);
      c.level = info.level;
      c.houses ??= 0;
      c.prosperity = clamp((c.food / Math.max(1, c.pop) * 20) + 30, 0, 100);
      const localHumans = humans.filter(h => h.city === c.id);
      const governor = state.units.find(u => u.governorOf === c.id && u.alive);
      const kingdom = state.kingdoms?.find(k => k.id === c.kingdomId);
      const king = kingdom && state.units.find(u => u.id === kingdom.kingId && u.alive);
      const electedLeader = localHumans.slice().sort((a, b) => (b.traits?.intelligence || 0) - (a.traits?.intelligence || 0))[0];
      const leader = c.isCapital ? (king || electedLeader) : (governor || electedLeader);
      c.leaderId = leader?.id || null;
      const gridFull = (c.claimedTiles || []).length >= cityGridTarget(c);
      assignWorkforce(c, localHumans, gridFull);
    }
    updateKingdoms();
  }

  export const WAGE_PER_WORKER_PER_DAY = 0.12;
  export const WAGE_INTERVAL_HOURS = 24;
  export function payWages(kingdom, cities) {
    kingdom.nextWageAt ??= 0;
    if (worldHour() < kingdom.nextWageAt) return;
    kingdom.nextWageAt = worldHour() + WAGE_INTERVAL_HOURS;
    const workers = state.units.filter(u => u.alive && u.job && u.job !== 'claimer'
      && u.royalRole !== 'King' && cities.some(c => c.id === u.city));
    const bill = workers.length * WAGE_PER_WORKER_PER_DAY;
    kingdom.wageBill = bill;
    if (bill <= 0) { kingdom.wagesUnpaid = false; return; }
    if (kingdom.gold >= bill) {
      kingdom.gold -= bill;
      kingdom.wagesUnpaid = false;
    } else {
      const shortfall = bill - kingdom.gold;
      kingdom.gold = 0;
      kingdom.wagesUnpaid = true;
      const happinessHit = clamp((shortfall / bill) * 15, 3, 15);
      for (const c of cities) c.happiness = clamp((c.happiness ?? 50) - happinessHit, 0, 100);
      logEvent(`${kingdom.name} คลังไม่พอจ่ายค่าจ้างวันนี้ — ประชาชนไม่พอใจ`, '💸');
    }
  }

  export function updateKingdoms() {
    state.kingdoms ||= [];
    for (const kingdom of state.kingdoms) {
      kingdom.royalFamily ||= [];
      kingdom.royalSystemReady = Boolean(kingdom.royalSystemReady);
      const cities = state.cities.filter(c => c.kingdomId === kingdom.id);
      kingdom.cities = cities.map(c => c.id);
      kingdom.population = cities.reduce((sum, c) => sum + c.pop, 0);
      kingdom.happiness = cities.length ? cities.reduce((sum, c) => sum + (c.happiness || 50), 0) / cities.length : 70;
      kingdom.gold ||= 0;
      const prevTierKey = kingdom.tier?.key;
      kingdom.tier = computeKingdomTier(kingdom, cities);
      if (prevTierKey && prevTierKey !== kingdom.tier.key
        && KINGDOM_TIERS.findIndex(t => t.key === kingdom.tier.key) > KINGDOM_TIERS.findIndex(t => t.key === prevTierKey)) {
        logEvent(`${kingdom.name} เลื่อนขั้นเป็น ${kingdom.tier.thai} (${kingdom.tier.label})`, kingdom.tier.icon);
        showToast(`${kingdom.tier.icon} ${kingdom.name} กลายเป็น ${kingdom.tier.label}!`);
      }
      payWages(kingdom, cities);
      const capital = state.cities.find(c => c.id === kingdom.capitalCityId) || cities[0];
      if (capital) {
        kingdom.capitalCityId = capital.id;
        capital.isCapital = true;
        if (kingdom.population < 50 || !capital.palaceBuilt) {
          kingdom.royalSystemReady = false;
          const prematureKing = state.units.find(u => u.id === kingdom.kingId && u.alive);
          if (prematureKing && prematureKing.royalRole === 'King') {
            prematureKing.royalRole = null;
            prematureKing.kingdomId = null;
          }
          kingdom.kingId = null;
        }
        const king = state.units.find(u => u.id === kingdom.kingId && u.alive);
        if (king) capital.leaderId = king.id;
        if (!kingdom.royalSystemReady && capital.pop >= 50 && capital.palaceBuilt) {
          appointRoyalFamily(kingdom, capital);
          kingdom.royalSystemReady = Boolean(kingdom.kingId);
          if (kingdom.royalSystemReady) {
            logEvent(`${kingdom.name} เริ่มระบบอาณาจักรหลังสร้างพระบรมมหาราชวัง พระราชาประจำเมืองหลวง`, kingdomIcon(16));
            showToast(`${kingdom.name} เริ่มระบบอาณาจักรและแต่งตั้งพระราชาแล้ว`);
          }
        }
        updateRoyalSuccession(kingdom, capital);
      }
    }
  }

  export function removeAbandonedCities() {
    for (const c of state.cities.slice()) {
      if (c.pop > 0) { c.emptyHours = 0; continue; }
      c.emptyHours = (c.emptyHours || 0) + 1;
      if (c.emptyHours < 48) continue;
      state.cities = state.cities.filter(x => x !== c);
      releaseCityReservations(c.id);
      logEvent(`${c.name} ถูกทิ้งร้าง ไม่มีผู้อยู่อาศัยเหลืออยู่`, '🏚️');
      if (c.parentCityId) {
        const parent = state.cities.find(x => x.id === c.parentCityId);
        if (parent) {
          parent.splitStage = Math.max(0, (parent.splitStage || 0) - 1);
          logEvent(`${parent.name} สูญเสียถิ่นฐานใหม่ ${c.name} ต้องเริ่มขยายเมืองใหม่อีกครั้ง`, '🔁');
        }
      }
      if (c.kingdomId) {
        const kingdom = state.kingdoms.find(k => k.id === c.kingdomId);
        if (kingdom && !state.cities.some(x => x.kingdomId === kingdom.id)) collapseKingdom(kingdom);
      }
    }
  }

  export function collapseKingdom(kingdom) {
    state.kingdoms = state.kingdoms.filter(k => k !== kingdom);
    logEvent(`${kingdom.name} ล่มสลาย ไม่มีเมืองเหลืออยู่แล้ว`, '💀');
    showToast(`💀 ${kingdom.name} ล่มสลายแล้ว`);
  }

  export const KINGDOM_SUPPLY_RULES = {
    food: { reserve: 60, needThreshold: 30, label: 'อาหาร' },
    wood: { reserve: 40, needThreshold: 20, label: 'ไม้' },
    stone: { reserve: 25, needThreshold: 12, label: 'หิน' }
  };
  export function shareKingdomResources() {
    const byKingdom = new Map();
    for (const c of state.cities) {
      if (!c.kingdomId) continue;
      if (!byKingdom.has(c.kingdomId)) byKingdom.set(c.kingdomId, []);
      byKingdom.get(c.kingdomId).push(c);
    }
    for (const cities of byKingdom.values()) {
      if (cities.length < 2) continue;
      for (const res of Object.keys(KINGDOM_SUPPLY_RULES)) {
        const { reserve, needThreshold, label } = KINGDOM_SUPPLY_RULES[res];
        const richest = cities.reduce((a, b) => (b[res] || 0) > (a[res] || 0) ? b : a);
        const neediest = cities.reduce((a, b) => (b[res] || 0) < (a[res] || 0) ? b : a);
        if (richest === neediest) continue;
        const surplus = (richest[res] || 0) - reserve;
        const deficit = needThreshold - (neediest[res] || 0);
        if (surplus <= 5 || deficit <= 0) continue;
        // Capped both by how much can be spared and how much is actually
        // needed, so a single tick never drains one city to fill another.
        const amount = Math.min(surplus * .2, deficit + 10, 20);
        if (amount < .5) continue;
        richest[res] -= amount;
        neediest[res] = (neediest[res] || 0) + amount;
        state.fx.push({
          type: 'supplyLine', resource: res,
          fromX: richest.x, fromY: richest.y, toX: neediest.x, toY: neediest.y,
          start: performance.now(), duration: 2400
        });
        if (Math.random() < .2) {
          logEvent(`${richest.name} ส่ง${label}ไปช่วย ${neediest.name} ในอาณาจักรเดียวกัน`, '📦');
        }
      }
    }
  }

  export function appointRoyalFamily(kingdom, capital) {
    const residents = state.units.filter(u => u.type === 'human' && u.alive && u.city === capital.id)
      .sort((a, b) => (b.traits?.intelligence || 0) - (a.traits?.intelligence || 0));
    if (!residents.length) return;
    const roles = ['King', 'Prince', 'Princess'];
    for (let i = 0; i < Math.min(roles.length, residents.length); i++) {
      const member = residents[i];
      member.kingdomId = kingdom.id;
      member.royalRole = roles[i];
      member.houseName = kingdom.dynastyName;
      member.homeCapitalId = capital.id;
      if (roles[i] === 'King') kingdom.kingId = member.id;
      kingdom.royalFamily.push(member.id);
    }
    capital.leaderId = kingdom.kingId;
    logEvent(`${capital.name} ถูกแต่งตั้งเป็นเมืองหลวง และ ${royalDisplayName(residents[0])} ขึ้นครองราชย์`, crownIcon('gold', 16));
  }

  export function assignGovernor(kingdom, city) {
    if (!kingdom || !city || city.isCapital) return null;
    const governor = state.units.find(u => u.type === 'human' && u.alive
      && u.kingdomId === kingdom.id && u.royalRole && u.royalRole !== 'King' && !u.governorOf);
    if (!governor) return null;
    governor.city = city.id; governor.governorOf = city.id;
    governor.x = city.x; governor.y = city.y; governor.activity = 'Governing city';
    city.leaderId = governor.id;
    logEvent(`${governor.name} ถูกส่งไปเป็นเจ้าเมือง ${city.name}`, '🛡️');
    return governor;
  }

  export const DEVELOPMENT_PROJECTS = {
    granary: { label: 'ยุ้งฉาง', minPop: 8, cost: { wood: 28, stone: 6 }, needed: 28 },
    woodStore: { label: 'ยุ้งไม้', minPop: 6, cost: { wood: 16, stone: 4 }, needed: 20 },
    oreStore: { label: 'โรงเก็บแร่', minPop: 6, cost: { wood: 18, stone: 8 }, needed: 24 },
    market: { label: 'Market', minPop: 10, cost: { wood: 24, stone: 10 }, needed: 32 },
    workshop: { label: 'Workshop', minPop: 15, cost: { wood: 26, stone: 14 }, needed: 34 },
    barracks: { label: 'Barracks', minPop: 20, cost: { wood: 20, stone: 28 }, needed: 38 },
    tavern: { label: 'Tavern', minPop: 25, cost: { wood: 22, stone: 10 }, needed: 30 },
    temple: { label: 'Temple', minPop: 30, cost: { wood: 18, stone: 24 }, needed: 45 },
    school: { label: 'School', minPop: 25, cost: { wood: 30, stone: 12 }, needed: 40 },
    library: { label: 'Library', minPop: 35, cost: { wood: 26, stone: 22 }, needed: 48 },
    townCenter: { label: 'Town Center', minPop: 18, cost: { wood: 30, stone: 16 }, needed: 36 },
    plaza: { label: 'Plaza', minPop: 20, cost: { wood: 16, stone: 20 }, needed: 30 },
    fort: { label: 'Fort', minPop: 28, cost: { wood: 24, stone: 40 }, needed: 50 },
    port: { label: 'Port', minPop: 30, cost: { wood: 34, stone: 20 }, needed: 46 },
    fishingDock: { label: 'Fishing Dock', minPop: 14, cost: { wood: 20, stone: 6 }, needed: 24 },
    // Late-game mine buildings: expensive one-off structures, gated behind
    // their own culture levels (see CULTURE_BUILDING_REQUIREMENT in
    // culture.js). Once built, the matching ore never runs out again — see
    // mineOre() in territory-units.js for the actual fix.
    stoneMine: { label: 'เหมืองหิน', minPop: 20, cost: { wood: 30, stone: 40 }, needed: 55 },
    ironMine: { label: 'เหมืองเหล็ก', minPop: 25, cost: { wood: 30, stone: 40, iron: 15 }, needed: 60 },
    goldMine: { label: 'เหมืองทอง', minPop: 30, cost: { wood: 35, stone: 50, iron: 25 }, needed: 65 }
  };
  export const COASTAL_ONLY_BUILDINGS = new Set(['port', 'fishingDock']);

  export const STORAGE_BUILDINGS = {
    granary: { resource: 'food', capacityPer: 100, maxCount: 4 },
    woodStore: { resource: 'wood', capacityPer: 120, maxCount: 4 },
    oreStore: { resource: 'stone', capacityPer: 90, maxCount: 4 }
  };
  export const STORAGE_BUILDINGS_ENABLED = true;

  export function resourceCapacity(c, resource) {
    const buildings = c.buildings || {};
    if (resource === 'food') {
      return 140 + (c.pop || 0) * 8 + (c.farmAreas || 0) * 45
        + (buildings.granary || 0) * STORAGE_BUILDINGS.granary.capacityPer;
    }
    if (resource === 'wood') return 80 + (buildings.woodStore || 0) * STORAGE_BUILDINGS.woodStore.capacityPer;
    if (resource === 'stone') return 60 + (buildings.oreStore || 0) * STORAGE_BUILDINGS.oreStore.capacityPer;
    if (resource === 'iron') return 40 + (buildings.oreStore || 0) * STORAGE_BUILDINGS.oreStore.capacityPer;
    return Infinity;
  }

  // Repeating service buildings scale with population. Landmark buildings
  // remain unique, while capacity buildings grow only when the settlement
  // actually needs them. This prevents both empty spam-buildings and the
  // old problem where a city stopped developing after its first copy.
  export const STORAGE_POP_STEP = 40;
  export function desiredStorageCount(c, key) {
    if (!STORAGE_BUILDINGS_ENABLED) return 0;
    const info = STORAGE_BUILDINGS[key];
    if (!info) return 0;
    const pop = c.pop || 0;
    const target = pop < 8 ? 0 : 1 + Math.floor(pop / STORAGE_POP_STEP);
    return Math.min(target, info.maxCount || 6);
  }
  export function needsMoreStorage(c, key) {
    if (!STORAGE_BUILDINGS_ENABLED) return false;
    const count = (c.buildings || {})[key] || 0;
    return count < desiredStorageCount(c, key);
  }

  export function marketMaxCount(c) {
    return (c.cultureLevel || 1) >= MARKET2_CULTURE_LEVEL ? MARKET_MAX_COUNT_2 : MARKET_MAX_COUNT;
  }
  export function desiredMarketCount(c) {
    const pop = c.pop || 0;
    if (pop < 12) return 0;
    return Math.min(marketMaxCount(c), 1 + Math.floor(pop / 60));
  }

  export const POP_SCALING_BUILDINGS = {
    workshop: { minPop: 15, step: 45, max: 3 },
    barracks: { minPop: 25, step: 70, max: 4 },
    tavern: { minPop: 30, step: 80, max: 3 },
    temple: { minPop: 40, step: 100, max: 3 },
    school: { minPop: 30, step: 90, max: 3 },
    library: { minPop: 60, step: 150, max: 2 },
    plaza: { minPop: 35, step: 120, max: 3 },
    fort: { minPop: 60, step: 180, max: 3 },
    townCenter: { minPop: 25, step: 150, max: 2 },
  };

  export function desiredPopulationBuildingCount(c, key) {
    const rule = POP_SCALING_BUILDINGS[key];
    if (!rule) return 0;
    const pop = c.pop || 0;
    if (pop < rule.minPop) return 0;
    return Math.min(rule.max, Math.max(1, 1 + Math.floor((pop - rule.minPop) / rule.step)));
  }
  export function needsMoreMarket(c) {
    return (c.buildings.market || 0) < desiredMarketCount(c);
  }

  // Farmland is never allowed to crowd the town hall — each windmill sits a
  // short buffer away from the civic centre.
  export const FARM_MIN_DIST_FROM_HALL = 3;
  export const FARM_SLOT_SEED = 5 * 7919;

  export function findFarmSite(c) {
    const cx = Math.floor(c.x), cy = Math.floor(c.y);
    const claimed = new Set(c.claimedTiles || []);
    const candidates = [];
    for (const idx of (c.claimedTiles || [])) {
      const x = idx % W, y = Math.floor(idx / W);
      if (Math.hypot(x - cx, y - cy) < FARM_MIN_DIST_FROM_HALL) continue;
      let ok = true;
      const block = [];
      for (let dy = -1; dy <= 1 && ok; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) { ok = false; break; }
          const nidx = ny * W + nx;
          if (!claimed.has(nidx)) { ok = false; break; }
          const t = state.tiles[nidx];
          if (!t || (t.terrain !== 'grass' && t.terrain !== 'sand') || t.farmCityId || t.houseCityId || t.buildingCityId || t.ore || t.berries) { ok = false; break; }
          block.push(nidx);
        }
      }
      if (ok) candidates.push({ x, y, block });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => latticeNoise(a.x, a.y, state.seed + c.id * 104729 + FARM_SLOT_SEED)
      - latticeNoise(b.x, b.y, state.seed + c.id * 104729 + FARM_SLOT_SEED));
    return candidates[0];
  }

  export function placeFarmUnit(c) {
    const site = findFarmSite(c);
    if (!site) return false;
    c.farmCenters ||= []; c.farmTiles ||= [];
    const centerIdx = site.y * W + site.x;
    for (const idx of site.block) {
      const t = state.tiles[idx];
      t.farmCityId = c.id;
      if (idx !== centerIdx) c.farmTiles.push(idx);
    }
    c.farmCenters.push({ x: site.x + .5, y: site.y + .5 });
    return true;
  }

  export function updateCityDevelopment(c) {
    c.buildings ||= { market: 0, granary: 0, woodStore: 0, oreStore: 0, workshop: 0, barracks: 0, tavern: 0, temple: 0, school: 0, library: 0, port: 0, townCenter: 0, plaza: 0, fort: 0, fishingDock: 0, stoneMine: 0, ironMine: 0, goldMine: 0 };
    c.buildings.woodStore ??= 0;
    c.buildings.oreStore ??= 0;
    c.buildings.school ??= 0;
    c.buildings.library ??= 0;
    c.buildings.port ??= 0;
    c.buildings.townCenter ??= 0;
    c.buildings.plaza ??= 0;
    c.buildings.fort ??= 0;
    c.buildings.fishingDock ??= 0;
    c.buildings.stoneMine ??= 0;
    c.buildings.ironMine ??= 0;
    c.buildings.goldMine ??= 0;
    c.projectProgress ||= 0;
    c.culture ||= 0; c.cultureLevel ||= 1; c.cultureProgress ||= 0; c.health ||= 80;
    c.townHallBuilt ??= false;
    c.palaceBuilt ??= false;
    c.farmAreas ??= 0;
    c.farmTiles ||= [];
    c.farmCenters ||= [];
    const centerTile = state.tiles[clamp(Math.floor(c.y), 0, H - 1) * W + clamp(Math.floor(c.x), 0, W - 1)];
    if (centerTile) centerTile.cityCenterId = c.id;
    const kingdom = state.kingdoms.find(k => k.id === c.kingdomId);
    if (!c.project) {
      for (const u of state.units) {
        if (u.city === c.id && u.alive && u.job === 'builder') { u.job = null; u.homeJob = null; }
      }
      const milestone = nextCityConstruction(c);
      if (milestone) {
        c.project = milestone;
        c.projectProgress = 0;
        logEvent(`${c.name} เริ่มก่อสร้าง${CITY_BUILD_PLANS[milestone].label}`, '🏗️');
      } else {
        const choices = c.isCapital
          ? ['woodStore', 'oreStore', 'granary', 'market', 'townCenter', 'plaza', 'workshop', 'temple', 'barracks', 'fort', 'tavern', 'school', 'library', 'port', 'fishingDock', 'stoneMine', 'ironMine', 'goldMine']
          : ['woodStore', 'oreStore', 'market', 'townCenter', 'plaza', 'granary', 'workshop', 'barracks', 'fort', 'tavern', 'temple', 'school', 'library', 'port', 'fishingDock', 'stoneMine', 'ironMine', 'goldMine'];
        const buildingStillNeeded = type => type === 'market' ? needsMoreMarket(c)
          : STORAGE_BUILDINGS[type] ? needsMoreStorage(c, type)
          : POP_SCALING_BUILDINGS[type] ? (c.buildings[type] || 0) < desiredPopulationBuildingCount(c, type)
          : !c.buildings[type];
        // A port needs real sea/lake access to ever be useful; a fishing
        // dock only needs a shoreline to stand on.
        const waterAccessOk = type => type === 'port' ? isCoastalCity(c)
          : type === 'fishingDock' ? isWaterfrontCity(c) : true;
        const next = choices.find(type => buildingStillNeeded(type) && c.pop >= DEVELOPMENT_PROJECTS[type].minPop
          && meetsCultureRequirement(c, type) && (!COASTAL_ONLY_BUILDINGS.has(type) || waterAccessOk(type)));
        if (next) { c.project = next; c.projectProgress = 0; }
      }
    }
    if (c.project) {
      const plan = CITY_BUILD_PLANS[c.project] || DEVELOPMENT_PROJECTS[c.project];
      ensureBuilder(c);
      ensureResourceWorkers(c);
      const builders = state.units.filter(u => u.city === c.id && u.alive && u.job === 'builder').length;
      const needsClearing = c.project === 'townHall' && centerTile
        && (centerTile.terrain === 'forest' || centerTile.tree);
      if (needsClearing) {
        centerTile.chopProgress = (centerTile.chopProgress || 0) + .5 + builders * .35;
        if (!c.clearingAnnounced) {
          logEvent(`${c.name} เริ่มแผ้วถางป่ากลางเมืองก่อนลงมือสร้างศาลากลาง`, '🪓');
          c.clearingAnnounced = true;
        }
        if (centerTile.chopProgress >= 4) {
          fellTree(centerTile, c);
          logEvent(`${c.name} เคลียพื้นที่เสร็จแล้ว เริ่มก่อสร้างศาลากลางได้จริง`, '✅');
        }
      } else {
      const wageSlowdown = kingdom && kingdom.wagesUnpaid ? .5 : 1;
      c.projectProgress += (.3 + builders * .45) * wageSlowdown;
      if (c.projectProgress >= plan.needed
        && Object.entries(plan.cost).every(([resource, amount]) => (c[resource] || 0) >= amount)
        && (c.project !== 'farm' || placeFarmUnit(c))) {
        for (const [resource, amount] of Object.entries(plan.cost)) c[resource] -= amount;
        logEvent(`${c.name} สร้าง${plan.label}สำเร็จ`, '🏗️');
        showToast(`${c.name} สร้าง${plan.label}แล้ว`);
        if (c.project === 'townHall') c.townHallBuilt = true;
        else if (c.project === 'house') c.houses = (c.houses || 0) + 1;
        else if (c.project === 'farm') {
          c.farmAreas = (c.farmAreas || 0) + 1;
        } else if (c.project === 'palace') {
          c.palaceBuilt = true;
          if (c.isCapital) {
            logEvent(`${c.name} สร้างพระบรมมหาราชวังสำเร็จ — รอการสถาปนาระบบอาณาจักร`, kingdomIcon(16));
          }
        } else {
          c.buildings[c.project] = (c.buildings[c.project] || 0) + 1;
        }
        c.project = null; c.projectProgress = 0;
      }
      }
    }
    const houseCapacityPer = (c.cultureLevel || 1) >= HOUSE2_CULTURE_LEVEL ? HOUSE2_CAPACITY_PER_HOUSE : 4;
    c.housingCapacity = 6 + (c.houses || 0) * houseCapacityPer;
    // Granaries are food infrastructure, not homes. Keeping them out of
    // housing capacity makes population pressure visible and predictable.
    c.foodCapacity = resourceCapacity(c, 'food');
    c.woodCapacity = resourceCapacity(c, 'wood');
    c.stoneCapacity = resourceCapacity(c, 'stone');
    c.ironCapacity = resourceCapacity(c, 'iron');
    c.food = clamp(c.food, 0, c.foodCapacity);
    c.wood = clamp(c.wood, 0, c.woodCapacity);
    c.stone = clamp(c.stone, 0, c.stoneCapacity);
    c.iron = clamp(c.iron || 0, 0, c.ironCapacity);
    const foodSecurity = clamp(c.food / Math.max(1, c.pop * 8), 0, 1);
    const housingRatio = c.housingCapacity / Math.max(1, c.pop);
    const housingSecurity = clamp(housingRatio, 0, 1);
    const overcrowdingPenalty = Math.max(0, 1 - housingRatio) * 28;
    c.health = clamp(45 + foodSecurity * 38 + housingSecurity * 17, 0, 100);
    c.happiness = clamp(34 + foodSecurity * 38 + housingSecurity * 18
      + (c.buildings.market ? 7 : 0) + (c.buildings.temple ? 8 : 0) + (c.buildings.tavern ? 6 : 0)
      + (c.buildings.school ? 5 : 0) + (c.buildings.library ? 6 : 0)
      // Culture Lv25 "จัตุรัสสาธารณะ" (Plaza): the plaza reads as the
      // city's landmark and lifts happiness on its own once built.
      + (c.buildings.plaza ? 8 : 0)
      + ((c.cultureLevel || 1) >= HOUSE2_CULTURE_LEVEL ? 5 : 0)
      + Math.min((c.cultureLevel || 1) - 1, 9) * .7
      - overcrowdingPenalty
      - (c.project ? 2 : 0), 0, 100);
    updateCityCulture(c);
    c.developmentStage = cityDevelopmentStage(c);
    c.specialization = computeCitySpecialization(c);
    c.cultureIdentity = computeCultureIdentity(c);
    if (kingdom) {
      if (c.buildings.market) {
        const cultureTradeBonus = 1 + Math.min((c.cultureLevel || 1) - 1, 9) * .05;
        const marketIncome = (.05 + c.pop * .002) * cultureTradeBonus;
        kingdom.gold = (kingdom.gold || 0) + marketIncome;
        c.gold = (c.gold || 0) + marketIncome;
      }
    }
  }

  export function runWorldEvents() {
    if (worldHour() < (state.nextWorldEventAt || 0) || !state.cities.length) return;
    state.nextWorldEventAt = worldHour() + 48;
    const city = state.cities[Math.floor(Math.random() * state.cities.length)];
    const roll = Math.random();
    if (roll < .24) {
      const reward = 18 + city.pop * 1.5;
      city.food = Math.min(city.foodCapacity || 220, city.food + reward);
      city.happiness = clamp((city.happiness || 50) + 10, 0, 100);
      logEvent(`เทศกาลเก็บเกี่ยวที่ ${city.name} เพิ่มเสบียงและความสุข`, '🎉');
    } else if (roll < .48) {
      const loss = Math.min(city.food, 20 + city.pop * .8);
      city.food -= loss; city.happiness = clamp((city.happiness || 50) - 8, 0, 100);
      logEvent(`ภัยแล้งกระทบ ${city.name} สูญเสียอาหาร ${loss.toFixed(0)}`, '☀️');
    } else if (roll < .64 && city.kingdomId) {
      const kingdom = state.kingdoms.find(k => k.id === city.kingdomId);
      const loss = Math.min(city.wood, 8 + city.pop * .25);
      city.wood -= loss; if (kingdom) kingdom.gold = Math.max(0, (kingdom.gold || 0) - 6);
      city.happiness = clamp((city.happiness || 50) - 5, 0, 100);
      logEvent(`โจรเร่ร่อนบุกเส้นทางใกล้ ${city.name}`, '⚔️');
    } else {
      city.food = Math.min(city.foodCapacity || 220, city.food + 10 + city.pop);
      logEvent(`${city.name} มีการค้าขายและเก็บเกี่ยวได้ดี`, resourceIcon('food', 16));
    }
  }

  export function updateRoyalSuccession(kingdom, capital) {
    if (!kingdom.royalSystemReady || state.units.some(u => u.id === kingdom.kingId && u.alive)) return;
    const candidate = state.units
      .filter(u => u.alive && kingdom.royalFamily.includes(u.id) && u.royalRole !== 'King')
      .sort((a, b) => (a.royalRole === 'Prince' ? -1 : 1) - (b.royalRole === 'Prince' ? -1 : 1)
        || (b.traits?.intelligence || 0) - (a.traits?.intelligence || 0))[0]
      || state.units.filter(u => u.alive && u.type === 'human' && u.city === capital?.id)
        .sort((a, b) => (b.traits?.intelligence || 0) - (a.traits?.intelligence || 0))[0];
    if (!candidate || !capital) return;
    if (candidate.governorOf) {
      const oldCity = state.cities.find(c => c.id === candidate.governorOf);
      if (oldCity) oldCity.leaderId = null;
      candidate.governorOf = null;
    }
    candidate.royalRole = 'King'; candidate.houseName = kingdom.dynastyName; candidate.homeCapitalId = capital.id;
    candidate.city = capital.id; candidate.x = capital.x; candidate.y = capital.y;
    kingdom.kingId = candidate.id;
    logEvent(`${royalDisplayName(candidate)} ขึ้นครองราชย์ที่ ${capital.name}`, crownIcon('gold', 16));
  }

