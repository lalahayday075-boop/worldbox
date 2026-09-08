// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// World generation and setup: canvas resize, world/map generation, spawning humans and animals, and basic per-city numeric thresholds (level, house/farm requirements).
// Part of the World Simulator script split (see index.html for load order).
'use strict';

import { FISHER_CULTURE_LEVEL, H, HOUSE_CAPACITY_PER_HOUSE, HOUSE2_CAPACITY_PER_HOUSE, HOUSE2_CULTURE_LEVEL, HOUSE_MILESTONES, HUNTER_CULTURE_LEVEL, PALACE_CULTURE_LEVEL, STARTER_HOUSING_CAPACITY, SPECIES, TILE, W, WINDMILL2_CULTURE_LEVEL, WINDMILL_MAX_COUNT, WINDMILL_MAX_COUNT_2, canvas, clamp, ctx, logEvent, makeId, rand, session, state, tile, valueNoise } from './state.js';
import { runAnimalAI, runHumanAI } from './ai-simulation.js';
import { updateSettlements } from './cities-kingdoms.js';
import { clampCamera } from './disasters-terrain-render.js';
import { generatePersonName } from './names.js';
import { cityOf, isHabitable, isTileReserved, isWaterfrontCity } from './territory-units.js';
import { closePanel, showToast, updateUI } from './ui.js';

  export function resize() {
    session.dpr = Math.min(window.devicePixelRatio || 1, session.dprCap ?? 2);
    canvas.width = Math.floor(innerWidth * session.dpr);
    canvas.height = Math.floor(innerHeight * session.dpr);
    // Display size is handled entirely by CSS (#app,#game{width:100%;height:100%}
    // in main.css) — only the backing-store resolution needs setting here.
    ctx.setTransform(session.dpr, 0, 0, session.dpr, 0, 0);
    clampCamera();
  }
  addEventListener('resize', resize);

  export function makeWorld(seed = Math.floor(Math.random() * 0xFFFFFFFF), options = {}) {
    const { seaLevel = 0, temperature: temperatureBias = 0, moisture: moistureBias = 0 } = options;
    state.seed = seed >>> 0;
    state.mapOptions = { seaLevel, temperature: temperatureBias, moisture: moistureBias };
    state.year = 1; state.month = 1; state.day = 1; state.hour = 6; state.season = 'Spring'; state.weather = 'Clear';
    state.tiles = [];
    state.units = []; state.cities = []; state.kingdoms = []; state.events = []; state.nextId = 1; state.nextWorldEventAt = 48;
    state.disasters = []; state.territoryGridHour = -1;
    state.fx = []; state.simTicks = 0;
    state.seaTradeRoutes = [];
    session.territoryGrid = null; session.territoryDistGrid = null; session.civGrid = null; session.landRegion = null; session.waterRegion = null;
    session.claimReservations = new Map();
    const rawElevations = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Multi-scale value noise keeps continents coherent instead of making
        // every tile an unrelated random square.
        const continent = valueNoise(x, y, 46, state.seed);
        const regional = valueNoise(x + 17, y - 9, 20, state.seed + 41);
        const detail = valueNoise(x - 8, y + 13, 9, state.seed + 97);
        const edge = Math.min(1, Math.min(x, W - 1 - x) / 12, Math.min(y, H - 1 - y) / 10);
        const elevation = continent * .58 + regional * .27 + detail * .1 + edge * .08;
        const moisture = clamp(valueNoise(x + 90, y - 40, 34, state.seed + 233) * .7
          + valueNoise(x, y, 11, state.seed + 281) * .2 + .1 + moistureBias * .2, 0, 1);
        const latitude = 1 - Math.abs(y / (H - 1) - .5) * 2;
        const temperature = clamp(latitude * .8 + valueNoise(x + 200, y + 200, 40, state.seed + 613) * .25
          + temperatureBias * .2, 0, 1);
        rawElevations.push(elevation);
        state.tiles.push({ x, y, terrain: 'grass', biome: 'Plains', tree: false, ore: null, berries: false, fire: 0,
          fertility: clamp(.45 + moisture * .35, 0, 1), moisture, elevation, temperature, food: 1 });
      }
    }
    // Normalize each generated world so every seed gets a readable balance
    // of ocean, coast, plains and highlands.
    const minElevation = Math.min(...rawElevations), maxElevation = Math.max(...rawElevations);
    state.tiles.forEach((t, i) => {
      const normalized = (rawElevations[i] - minElevation) / Math.max(.001, maxElevation - minElevation);
      // Subtracting the bias makes more tiles fall under the water
      // thresholds below (raising sea level); adding it exposes more land.
      t.elevation = clamp(normalized - seaLevel * .15, 0, 1);
      // Real lapse rate: every step up the mountain trims a bit more warmth,
      // same reason snowcaps exist even on tropical volcanoes.
      t.temperature = clamp(t.temperature - Math.max(0, t.elevation - .34) * .5, 0, 1);
      const slopeWetting = clamp((t.elevation - .34) * 1.3, 0, .22) * clamp(1 - (t.elevation - .68) / .3, 0, 1);
      const peakDryOut = t.elevation > .8 ? (t.elevation - .8) * .9 : 0;
      t.moisture = clamp(t.moisture + slopeWetting - peakDryOut, 0, 1);
      const cold = t.temperature < .28, hot = t.temperature > .68;
      if (t.elevation < .22) t.terrain = 'deepWater';
      else if (t.elevation < .34) t.terrain = 'water';
      else if (t.elevation > .84 || (cold && t.elevation > .55)) t.terrain = 'snow';
      else if (t.elevation > .70) t.terrain = 'mountain';
      else if (cold && t.moisture < .55) t.terrain = 'snow';
      else if (t.elevation < .41 && (hot || t.moisture < .3)) t.terrain = 'sand';
      else if (t.moisture > (hot ? .52 : .63)) t.terrain = 'forest';
      else t.terrain = 'grass';
      t.tree = t.terrain === 'forest';
      t.biome = t.terrain === 'sand' ? (t.moisture > .55 ? 'Savanna' : 'Desert')
        : t.terrain === 'forest' ? (hot && t.moisture > .68 ? 'Jungle' : 'Forest')
        : t.terrain === 'snow' ? 'Tundra' : ['water', 'deepWater', 'iceWater'].includes(t.terrain) ? 'Ocean'
        : hot ? 'Savanna' : 'Plains';
      // Fertility now reflects real growing conditions: wet + temperate soil
      // is richest, while frozen or parched ground struggles to feed anyone.
      t.fertility = clamp(.2 + t.moisture * .4 + (1 - Math.abs(t.temperature - .55)) * .35, 0, 1);
      t.food = t.terrain === 'grass' || t.tree ? 1 : 0;
    });
    for (const t of state.tiles) {
      if (t.terrain !== 'grass') continue;
      const nearForest = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
        .some(([dx, dy]) => tile(t.x + dx, t.y + dy)?.terrain === 'forest');
      if (nearForest) continue;
      const scatterRoll = valueNoise(t.x + 321, t.y - 77, 6, state.seed + 919);
      const chance = clamp((t.moisture - .3) * .5, 0, .16);
      if (scatterRoll < chance) t.tree = true;
    }
    for (const t of state.tiles) {
      if (t.tree || (t.terrain !== 'grass' && t.terrain !== 'sand')) continue;
      const nearMountain = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
        .some(([dx, dy]) => tile(t.x + dx, t.y + dy)?.terrain === 'mountain');
      const stoneRoll = valueNoise(t.x - 55, t.y + 61, 7, state.seed + 1471);
      const ironRoll = valueNoise(t.x + 91, t.y + 18, 6, state.seed + 3877);
      const goldRoll = valueNoise(t.x + 133, t.y - 27, 5, state.seed + 2203);
      if (nearMountain && stoneRoll > .62) t.ore = 'stone';
      else if (!nearMountain && stoneRoll > .94) t.ore = 'stone';
      if (!t.ore && nearMountain && ironRoll > .90) t.ore = 'iron';
      if (!t.ore && nearMountain && goldRoll > .95) t.ore = 'gold';
    }
    for (const t of state.tiles) {
      if (t.terrain !== 'grass' || t.tree || t.ore) continue;
      const berryRoll = valueNoise(t.x + 47, t.y + 205, 8, state.seed + 3301);
      if (berryRoll > .90) t.berries = true;
    }
    ensureMinimumDensity();
    populateWildlife();
    session.view = { x: W * TILE / 2, y: H * TILE / 2, zoom: 1 };
    session.minimapDirty = true;
    closePanel();
    updateUI();
    logEvent('โลกใหม่ถูกสร้างขึ้นพร้อมระบบนิเวศที่ยังไม่ถูกรบกวน', '🌍');
    showToast('สร้างโลกใหม่แล้ว — โลกนี้ยังไม่มีสิ่งมีชีวิต');
  }

  export function ensureMinimumDensity() {
    const cellTiles = (cx0, cy0, size) => {
      const list = [];
      for (let y = cy0; y < Math.min(H, cy0 + size); y++) {
        for (let x = cx0; x < Math.min(W, cx0 + size); x++) list.push(state.tiles[y * W + x]);
      }
      return list;
    };
    const pickEligible = (cellList, predicate) => {
      const candidates = cellList.filter(predicate);
      return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    };
    const TREE_BERRY_STEP = 3, ORE_STEP = 6;
    for (let cy0 = 0; cy0 < H; cy0 += TREE_BERRY_STEP) {
      for (let cx0 = 0; cx0 < W; cx0 += TREE_BERRY_STEP) {
        const cell = cellTiles(cx0, cy0, TREE_BERRY_STEP);
        if (!cell.some(t => t.tree)) {
          const pick = pickEligible(cell, t => t.terrain === 'grass' && !t.ore && !t.berries);
          if (pick) pick.tree = true;
        }
        if (!cell.some(t => t.berries)) {
          const pick = pickEligible(cell, t => t.terrain === 'grass' && !t.tree && !t.ore);
          if (pick) pick.berries = true;
        }
      }
    }
    for (let cy0 = 0; cy0 < H; cy0 += ORE_STEP) {
      for (let cx0 = 0; cx0 < W; cx0 += ORE_STEP) {
        const cell = cellTiles(cx0, cy0, ORE_STEP);
        if (!cell.some(t => t.ore === 'stone')) {
          const pick = pickEligible(cell, t => (t.terrain === 'grass' || t.terrain === 'sand') && !t.tree && !t.berries && !t.ore);
          if (pick) pick.ore = 'stone';
        }
        if (!cell.some(t => t.ore === 'iron')) {
          const pick = pickEligible(cell, t => (t.terrain === 'grass' || t.terrain === 'sand') && !t.tree && !t.berries && !t.ore);
          if (pick) pick.ore = 'iron';
        }
        if (!cell.some(t => t.ore === 'gold')) {
          const pick = pickEligible(cell, t => (t.terrain === 'grass' || t.terrain === 'sand') && !t.tree && !t.berries && !t.ore);
          if (pick) pick.ore = 'gold';
        }
      }
    }
  }

  export function spawnHuman(x, y, parent = null, species = parent?.race || 'human') {    const t = tile(x, y);
    if (!t || t.terrain === 'water' || t.terrain === 'deepWater' || t.terrain === 'iceWater' || t.terrain === 'mountain' || t.terrain === 'snow') {
      showToast('วาง Human ได้เฉพาะพื้นที่แห้งที่อาศัยได้');
      return null;
    }
    const speciesInfo = SPECIES[species] || SPECIES.human;
    const u = {
      id: makeId(), type: 'human', race: species, x: x + .5, y: y + .5, hp: 100,
      age: parent ? 0 : rand(18, 35), hunger: rand(0, 16), energy: 100,
      happiness: 70, name: generatePersonName(species),
      city: null, home: null, job: null, partner: null, children: [], alive: true, everHadCity: false,
      traits: parent ? {
        strength: clamp(parent.traits.strength + rand(-8, 8), 1, 100),
        intelligence: clamp(parent.traits.intelligence + rand(-8, 8), 1, 100)
      } : { strength: rand(30, 80), intelligence: rand(30, 80) }
    };
    u.prevX = u.x; u.prevY = u.y;
    state.units.push(u);
    updateSettlements();
    // Without this, a freshly placed unit just stands still until the next
    // scheduled simulationStep() decides what it should be doing — up to a
    // few real seconds away at 1x speed — which reads as "placed it and it
    // didn't walk". Running the same per-unit AI decision immediately gives
    // it a moveTarget (and activity) right away, same as any other unit.
    runHumanAI(u, cityOf(u));
    if (!parent) logEvent(`${speciesInfo.label} ปรากฏตัวบนโลก`, speciesInfo.icon);
    return u;
  }

  export function spawnAnimal(x, y, species = null) {
    const t = tile(x, y);
    if (!t || t.terrain === 'water' || t.terrain === 'deepWater' || t.terrain === 'iceWater' || t.terrain === 'mountain' || t.terrain === 'snow') {
      showToast('วาง Animal ได้เฉพาะพื้นที่แห้งที่อาศัยได้');
      return null;
    }
    const u = { id: makeId(), type: 'animal', species, x: x + .5, y: y + .5, hp: 100, age: rand(1, 8), hunger: 0, alive: true };
    u.prevX = u.x; u.prevY = u.y;
    state.units.push(u);
    runAnimalAI(u); // see the comment in spawnHuman — same immediate-walk fix
    if (state.units.filter(x => x.type === 'animal').length === 1) logEvent('ระบบนิเวศเริ่มมีสัตว์ป่า', species === 'chicken' ? '🐔' : '🐺');
    return u;
  }

  export function populateWildlife() {
    for (const t of state.tiles) {
      if (!isHabitable(t)) continue;
      let chance = 0;
      if (t.tree) chance = .025;
      else if (t.berries) chance = .2125;
      else if (t.terrain === 'grass' || t.terrain === 'sand') chance = .0025;
      if (chance && Math.random() < chance) spawnAnimal(t.x, t.y, 'chicken');
    }
  }

  // populateWildlife only ever runs once, at world creation — once hunters
  // pick a spot clean, chickens there never come back. This trickles a
  // small population back in every game hour, same growth pattern as
  // growForests/growBerries, so hunting stays a renewable food source
  // instead of draining out permanently.
  export const WILDLIFE_CAP_DENSITY = .01;
  export function growWildlife() {
    const cap = Math.max(40, Math.floor(W * H * WILDLIFE_CAP_DENSITY));
    if (state.units.filter(u => u.type === 'animal' && u.alive).length >= cap) return;
    for (let i = 0; i < 25; i++) {
      const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
      const t = state.tiles[y * W + x];
      if (!t || !isHabitable(t) || isTileReserved(t)) continue;
      let chance = 0;
      if (t.berries) chance = .05;
      else if (t.tree) chance = .01;
      else if (t.terrain === 'grass' || t.terrain === 'sand') chance = .0015;
      if (chance && Math.random() < chance) spawnAnimal(x, y, 'chicken');
    }
  }

  export function cityLevel(pop) {
    if (pop >= 100) return { level: 4, label: 'City', icon: '🏰' };
    if (pop >= 30) return { level: 3, label: 'Town', icon: '🏯' };
    if (pop >= 10) return { level: 2, label: 'Village', icon: '🏠' };
    return { level: 1, label: 'Camp', icon: '⛺' };
  }

  export function houseCapacityPer(c) {
    return (c?.cultureLevel || 1) >= HOUSE2_CULTURE_LEVEL
      ? HOUSE2_CAPACITY_PER_HOUSE : HOUSE_CAPACITY_PER_HOUSE;
  }

  export function housingCapacityFor(c) {
    return STARTER_HOUSING_CAPACITY + (c?.houses || 0) * houseCapacityPer(c);
  }

  export function requiredHouses(pop, c = null) {
    const capacityPerHouse = houseCapacityPer(c);
    return Math.max(0, Math.ceil(((pop || 0) - STARTER_HOUSING_CAPACITY) / capacityPerHouse));
  }

  export function requiredFarms(c) {
    const pop = c?.pop || 0;
    if (pop < 8) return 0;
    // Roughly one farm district per 20 residents, with technology raising
    // the maximum. Food demand therefore grows with population instead of
    // waiting for arbitrary milestone jumps.
    return Math.min(windmillMaxCount(c), Math.max(1, Math.ceil(pop / 20)));
  }
  export function windmillMaxCount(c) {
    return (c?.cultureLevel || 1) >= WINDMILL2_CULTURE_LEVEL ? WINDMILL_MAX_COUNT_2 : WINDMILL_MAX_COUNT;
  }

  export function cityGridTarget(c) {
    const cap = c.isCapital ? 400 : 300;
    return Math.min(cap, Math.max(4, (c.pop || 0) * 4));
  }

  export function civGridTarget(kingdom, cities) {
    let total = 0;
    for (const c of cities) {
      const cultureLv = c.cultureLevel || 1;
      const cap = c.isCapital ? 2600 : 1800;
      total += Math.min(cap, Math.max(10, Math.round((c.claimedTiles?.length || 4) * 1.5 + cultureLv * 70)));
    }
    return total;
  }

  export function nextCityConstruction(c) {
    if (!c.townHallBuilt && c.pop >= 3) return 'townHall';
    if (!c.townHallBuilt) return null;
    if ((c.houses || 0) < requiredHouses(c.pop)) return 'house';
    if (c.isCapital && c.pop >= 50 && !c.palaceBuilt && (c.cultureLevel || 1) >= PALACE_CULTURE_LEVEL) return 'palace';
    if ((c.farmAreas || 0) < requiredFarms(c)) return 'farm';
    return null;
  }

  export function builderCapacity(c) {
    return Math.max(1, Math.floor((c.pop || 0) / 15));
  }

  export function ensureBuilder(c) {
    if (!c.project) return;
    const residents = state.units.filter(u => u.type === 'human' && u.alive && u.city === c.id);
    const capacity = builderCapacity(c);
    const crew = residents.filter(u => u.job === 'builder');
    if (crew.length >= capacity) return;
    const tiers = [
      residents.filter(u => u.royalRole !== 'King' && u.job !== 'claimer' && u.job !== 'builder'),
      residents.filter(u => u.royalRole !== 'King' && u.job !== 'builder')
    ];
    for (const tier of tiers) {
      for (const worker of tier) {
        if (crew.length >= capacity) return;
        if (worker.job === 'builder') continue;
        worker.job = 'builder';
        crew.push(worker);
      }
    }
  }

  export function ensureResourceWorkers(c) {
    const residents = state.units.filter(u => u.type === 'human' && u.alive && u.city === c.id);
    const assign = (job, avoid = []) => {
      if (residents.some(u => u.job === job)) return;
      const worker = residents.find(u => !avoid.includes(u.job) && u.job !== 'claimer' && u.royalRole !== 'King');
      if (worker) { worker.job = job; worker.homeJob = job; }
    };
    assign('woodcutter', ['builder', 'miner']);
    assign('miner', ['builder', 'woodcutter']);
    if ((c.farmAreas || 0) > 0) {
      assign('farmer', ['builder', 'miner', 'woodcutter', 'forager', 'hunter']);
    } else {
      assign('forager', ['builder', 'miner', 'woodcutter', 'hunter']);
      if ((c.cultureLevel || 1) >= HUNTER_CULTURE_LEVEL) {
        assign('hunter', ['builder', 'miner', 'woodcutter', 'forager']);
      }
    }
    if (isWaterfrontCity(c) && (c.cultureLevel || 1) >= FISHER_CULTURE_LEVEL) {
      assign('fisher', ['builder', 'miner', 'woodcutter', 'forager', 'hunter']);
    }
  }

