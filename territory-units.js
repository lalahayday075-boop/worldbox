// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// City index/lookups, terrain habitability, forest regrowth, territory claiming, and basic unit movement helpers.
// Part of the World Simulator script split (see index.html for load order).
'use strict';

import { H, W, WALK_SPEED, clamp, logEvent, rand, session, state, tile } from './state.js';
import { addCarry, worldHour } from './ai-simulation.js';
import { cityGridTarget, civGridTarget } from './world.js';

  export let cityIndex = new Map();
  export function rebuildCityIndex() {
    cityIndex.clear();
    for (const c of state.cities) cityIndex.set(c.id, c);
  }
  export function cityOf(u) { return cityIndex.get(u.city) ?? state.cities.find(c => c.id === u.city); }

  export function isHabitable(t) {
    return t && !['water', 'deepWater', 'iceWater', 'mountain', 'snow'].includes(t.terrain);
  }

  export function isWalkable(t) {
    return t && !['water', 'deepWater', 'iceWater', 'mountain', 'snow'].includes(t.terrain);
  }

  // Any tile a ship can actually float on, and (since there's no separate
  // river terrain) also the tile fishing lines can go into.
  export function isWater(t) {
    return t && (t.terrain === 'water' || t.terrain === 'deepWater' || t.terrain === 'iceWater');
  }

  export function isFishable(t) {
    return isWater(t);
  }

  export function isShoreTile(x, y) {
    const t = tile(x, y);
    if (!isHabitable(t)) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isFishable(tile(x + dx, y + dy)));
  }

  export function isCoastalCity(c) {
    for (const idx of (c.claimedTiles || [])) {
      const x = idx % W, y = (idx / W) | 0;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWater(tile(x + dx, y + dy)))) return true;
    }
    return false;
  }

  // Kept as a distinct check from isCoastalCity for other code that reasons
  // about "can fish here" separately from "can dock a sea-trade ship here" —
  // currently identical since isFishable === isWater, but that's what would
  // change if a non-sea water feature (e.g. a lake-only tile) were added back.
  export function isWaterfrontCity(c) {
    for (const idx of (c.claimedTiles || [])) {
      const x = idx % W, y = (idx / W) | 0;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isFishable(tile(x + dx, y + dy)))) return true;
    }
    return false;
  }

  export function isTileReserved(t) {
    return Boolean(t && (t.houseCityId != null || t.buildingCityId != null
      || t.farmCityId != null || t.cityCenterId != null));
  }

  export function fellTree(t, city, reward = 6, carryUnit = null) {
    if (!t) return;
    t.terrain = 'grass';
    t.tree = false;
    t.biome = 'Plains';
    delete t.chopProgress;
    t.clearedAt = state.simTicks || 0;
    t.cutAtMs = performance.now();
    t.minedType = 'wood';
    if (carryUnit) addCarry(carryUnit, 'wood', reward);
    else if (city) city.wood = (city.wood || 0) + reward;
  }

  // Which built mine (see DEVELOPMENT_PROJECTS in cities-kingdoms.js and
  // CULTURE_BUILDING_REQUIREMENT in culture.js) keeps a given ore type from
  // running out once a city has it.
  export const MINE_BUILDING_FOR_ORE = { stone: 'stoneMine', iron: 'ironMine', gold: 'goldMine' };
  export function cityHasMineFor(city, oreKind) {
    const key = MINE_BUILDING_FOR_ORE[oreKind];
    return Boolean(key && city && (city.buildings || {})[key]);
  }

  export function mineOre(t, city, reward = 5, carryUnit = null) {
    if (!t) return;
    const kind = t.ore;
    // Once a city has built the matching mine (Stone/Iron/Gold Mine), this
    // vein no longer gets exhausted — it stays workable indefinitely
    // instead of relying on the slow random regrowth in growOreDeposits().
    // This is the actual fix for ore running out faster than miners can
    // keep up with it.
    if (cityHasMineFor(city, kind)) {
      delete t.chopProgress;
    } else {
      t.ore = null;
      delete t.chopProgress;
      t.clearedAt = state.simTicks || 0;
      t.cutAtMs = performance.now();
      t.minedType = kind;
    }
    if (!city) return;
    if (kind === 'gold') {
      // Gold coin is never physically hauled — it goes straight to the
      // treasury regardless of a miner's backpack, same as before.
      const kingdom = state.kingdoms.find(k => k.id === city.kingdomId);
      if (kingdom) kingdom.gold = (kingdom.gold || 0) + reward;
      city.gold = (city.gold || 0) + reward;
    } else {
      if (carryUnit) addCarry(carryUnit, kind, reward);
      else city[kind] = (city[kind] || 0) + reward;
    }
  }

  export function growForests() {
    const rainBoost = state.weather === 'Rain' ? 2.5 : 1;
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
      const t = state.tiles[y * W + x];
      if (!t || t.terrain !== 'grass' || t.tree || t.fire > 0) continue;
      if (isTileReserved(t)) continue;
      if (t.clearedAt != null && (state.simTicks - t.clearedAt) < 28) continue;
      let forestNeighbors = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const n = tile(x + dx, y + dy);
        if (n && (n.terrain === 'forest' || n.tree)) forestNeighbors++;
      }
      if (!forestNeighbors) continue;
      if (Math.random() < forestNeighbors * .012 * rainBoost) {
        t.terrain = 'forest';
        t.tree = true;
        t.biome = 'Forest';
        t.sproutedAt = state.simTicks || 0;
        delete t.clearedAt;
      }
    }
  }

  export function pickBerries(t, city, reward = 5, carryUnit = null) {
    if (!t) return;
    t.berries = false;
    delete t.chopProgress;
    t.berriesPickedAt = state.simTicks || 0;
    t.cutAtMs = performance.now();
    t.minedType = 'berries';
    if (carryUnit) addCarry(carryUnit, 'food', reward);
    else if (city) city.food = (city.food || 0) + reward;
  }

  export function growOreDeposits() {
    // Was 20 samples / 2% chance / 60h cooldown, which — on top of requiring
    // a mountain-adjacent tile — made veins take a very long time to come
    // back after being mined out. Widened all three so ore actually
    // replenishes at a pace miners can keep up with.
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
      const t = state.tiles[y * W + x];
      if (!t || t.ore || t.tree || (t.terrain !== 'grass' && t.terrain !== 'sand')) continue;
      if (isTileReserved(t)) continue;
      if (t.clearedAt != null && (state.simTicks - t.clearedAt) < 24) continue;
      const nearMountain = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
        .some(([dx, dy]) => tile(x + dx, y + dy)?.terrain === 'mountain');
      if (!nearMountain) continue;
      if (Math.random() < .06) {
        const roll = Math.random();
        t.ore = roll < .08 ? 'gold' : roll < .30 ? 'iron' : 'stone';
      }
    }
  }

  export function growBerries() {
    const windBoost = state.weather === 'Wind' ? 2.5 : 1;
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
      const t = state.tiles[y * W + x];
      if (!t || t.terrain !== 'grass' || t.tree || t.ore || t.berries || t.fire > 0) continue;
      if (isTileReserved(t)) continue;
      if (t.berriesPickedAt != null && (state.simTicks - t.berriesPickedAt) < 40) continue;
      let berryNeighbors = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tile(x + dx, y + dy);
        if (n && n.berries) berryNeighbors++;
      }
      if (Math.random() < (.003 + berryNeighbors * .01) * windBoost) t.berries = true;
    }
  }

  export function rebuildTerritoryGrid() {
    const owner = new Int32Array(W * H).fill(-1);
    const dist = new Int32Array(W * H).fill(9999);
    for (const c of state.cities) {
      if (!c.claimedTiles) continue;
      for (let i = 0; i < c.claimedTiles.length; i++) {
        const idx = c.claimedTiles[i];
        if (owner[idx] === -1) { owner[idx] = c.id; dist[idx] = i; }
      }
    }
    session.territoryGrid = owner; session.territoryDistGrid = dist;
  }

  export function rebuildCivGrid() {
    const owner = new Int32Array(W * H).fill(-1);
    for (const k of state.kingdoms) {
      if (!k.civClaimedTiles) continue;
      for (const idx of k.civClaimedTiles) if (owner[idx] === -1) owner[idx] = k.id;
    }
    session.civGrid = owner;
  }

  export function civFrontierCandidates(kingdom) {
    const candidates = [];
    const seen = new Set(kingdom.civClaimedTiles);
    const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
    for (const idx of kingdom.civClaimedTiles) {
      const x = idx % W, y = (idx / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nidx = ny * W + nx;
        if (seen.has(nidx)) continue;
        seen.add(nidx);
        if (!isHabitable(state.tiles[nidx])) continue;
        if (session.civGrid && session.civGrid[nidx] !== -1 && session.civGrid[nidx] !== kingdom.id) continue;
        if (session.territoryGrid) {
          const ownerCityId = session.territoryGrid[nidx];
          if (ownerCityId !== -1) {
            const ownerCity = state.cities.find(city => city.id === ownerCityId);
            if (ownerCity && ownerCity.kingdomId && ownerCity.kingdomId !== kingdom.id) continue;
          }
        }
        candidates.push(nidx);
      }
    }
    return candidates;
  }

  export function initialCivFloodClaim(cx, cy, capTiles) {
    const startX = clamp(Math.floor(cx), 0, W - 1), startY = clamp(Math.floor(cy), 0, H - 1);
    const startIdx = startY * W + startX;
    const claimed = [startIdx];
    const seen = new Set([startIdx]);
    const frontier = [];
    const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
    const addNeighbors = idx => {
      const x = idx % W, y = (idx / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nidx = ny * W + nx;
        if (seen.has(nidx)) continue;
        seen.add(nidx);
        if (!isHabitable(state.tiles[nidx])) continue;
        if (session.civGrid && session.civGrid[nidx] !== -1) continue;
        frontier.push(nidx);
      }
    };
    addNeighbors(startIdx);
    // Same random-frontier growth as initialCityClaim above, for the same
    // reason — an organic outline instead of a perfect diamond.
    while (claimed.length < capTiles && frontier.length) {
      const i = Math.floor(Math.random() * frontier.length);
      const idx = frontier.splice(i, 1)[0];
      claimed.push(idx);
      addNeighbors(idx);
    }
    return claimed;
  }

  export function paintCivClaimedLive(kingdomId, tiles) {
    if (!session.civGrid || !tiles) return;
    for (const idx of tiles) if (session.civGrid[idx] === -1) session.civGrid[idx] = kingdomId;
  }

  export function growCivilizationTerritory() {
    for (const kingdom of state.kingdoms) {
      const cities = state.cities.filter(c => c.kingdomId === kingdom.id);
      if (!cities.length) continue;
      const capital = cities.find(c => c.isCapital) || cities[0];
      kingdom.civClaimedTiles ||= initialCivFloodClaim(capital.x, capital.y, 1);
      kingdom.civOriginAt ??= worldHour();
      kingdom.nextCivGrowAt ??= 0;
      const target = civGridTarget(kingdom, cities);
      if (kingdom.civClaimedTiles.length >= target) continue;
      if (worldHour() < kingdom.nextCivGrowAt) continue;
      const avgCulture = cities.reduce((sum, c) => sum + (c.cultureLevel || 1), 0) / cities.length;
      kingdom.nextCivGrowAt = worldHour() + clamp(96 - avgCulture * 4, 36, 96);
      const candidates = civFrontierCandidates(kingdom);
      if (!candidates.length) { kingdom.nextCivGrowAt = worldHour() + 96; continue; }
      const owned = new Set(kingdom.civClaimedTiles);
      const idx = pickFrontierTile(candidates, owned, civWallTest(kingdom.id));
      kingdom.civClaimedTiles.push(idx);
      if (session.civGrid) session.civGrid[idx] = kingdom.id;
      kingdom.civLastClaimedAt = performance.now();
      kingdom.civLastClaimedX = idx % W; kingdom.civLastClaimedY = (idx / W) | 0;
    }
  }

  export function rebuildLandRegions() {
    const region = new Int32Array(W * H).fill(-1);
    const stack = [];
    let nextRegion = 0;
    for (let start = 0; start < region.length; start++) {
      if (region[start] !== -1 || !isWalkable(state.tiles[start])) continue;
      region[start] = nextRegion;
      stack.push(start);
      while (stack.length) {
        const idx = stack.pop();
        const x = idx % W, y = (idx / W) | 0;
        const neighborIdx = [
          x + 1 < W ? idx + 1 : -1, x > 0 ? idx - 1 : -1,
          y + 1 < H ? idx + W : -1, y > 0 ? idx - W : -1
        ];
        for (const nidx of neighborIdx) {
          if (nidx === -1 || region[nidx] !== -1 || !isWalkable(state.tiles[nidx])) continue;
          region[nidx] = nextRegion;
          stack.push(nidx);
        }
      }
      nextRegion++;
    }
    session.landRegion = region;
  }
  export function sameLandRegion(idxA, idxB) {
    if (!session.landRegion) return true;
    return session.landRegion[idxA] !== -1 && session.landRegion[idxA] === session.landRegion[idxB];
  }

  export function rebuildWaterRegions() {
    const region = new Int32Array(W * H).fill(-1);
    const stack = [];
    let nextRegion = 0;
    for (let start = 0; start < region.length; start++) {
      if (region[start] !== -1 || !isWater(state.tiles[start])) continue;
      region[start] = nextRegion;
      stack.push(start);
      while (stack.length) {
        const idx = stack.pop();
        const x = idx % W, y = (idx / W) | 0;
        const neighborIdx = [
          x + 1 < W ? idx + 1 : -1, x > 0 ? idx - 1 : -1,
          y + 1 < H ? idx + W : -1, y > 0 ? idx - W : -1
        ];
        for (const nidx of neighborIdx) {
          if (nidx === -1 || region[nidx] !== -1 || !isWater(state.tiles[nidx])) continue;
          region[nidx] = nextRegion;
          stack.push(nidx);
        }
      }
      nextRegion++;
    }
    session.waterRegion = region;
  }
  export function sameWaterRegion(idxA, idxB) {
    if (!session.waterRegion) return false; // no rebuild has happened yet — treat as "not yet known to connect" rather than open, since a false sea route is worse than a route that appears one rebuild late
    return session.waterRegion[idxA] !== -1 && session.waterRegion[idxA] === session.waterRegion[idxB];
  }

  export function frontierCandidates(c) {
    const candidates = [];
    const seen = new Set(c.claimedTiles);
    const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
    for (const idx of c.claimedTiles) {
      const x = idx % W, y = (idx / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nidx = ny * W + nx;
        if (seen.has(nidx)) continue;
        seen.add(nidx);
        if (!isHabitable(state.tiles[nidx])) continue;
        if (session.territoryGrid && session.territoryGrid[nidx] !== -1 && session.territoryGrid[nidx] !== c.id) continue;
        candidates.push(nidx);
      }
    }
    return candidates;
  }

  export function claimerCapacity(c) {
    return Math.max(1, Math.floor((c.pop || 0) / 6));
  }

  // A cell's in-bounds neighbor indices (up to 4).
  function inBoundsNeighbors(idx) {
    const x = idx % W, y = (idx / W) | 0;
    const out = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      out.push(ny * W + nx);
    }
    return out;
  }

  // Whether idx acts as an unclaimable "wall" for pocket-enclosure
  // purposes when city `cityId` is the one expanding: water/mountain/snow
  // (impassable terrain) or land already claimed by a different city
  // (rival or same-kingdom neighbor). Either way it's not ours to expand
  // into, so a gap bordered by it is exactly as sealed as one bordered by
  // our own territory. A tree is deliberately NOT a wall here — a
  // forested tile is ordinary claimable land that happens to have a tree
  // on it right now (fellTree can clear it later), not a permanent
  // boundary like water or another city's ground.
  function cityWallTest(cityId) {
    return idx => {
      const t = state.tiles[idx];
      if (!isHabitable(t)) return true; // water, deepWater, iceWater, mountain, snow
      if (session.territoryGrid) {
        const owner = session.territoryGrid[idx];
        if (owner !== -1 && owner !== cityId) return true;
      }
      return false;
    };
  }

  // Same idea one level up: a wall for kingdom `kingdomId`'s civilization
  // territory is impassable terrain, or ground already claimed by a
  // different kingdom's civilization grid.
  function civWallTest(kingdomId) {
    return idx => {
      const t = state.tiles[idx];
      if (!isHabitable(t)) return true;
      if (session.civGrid) {
        const owner = session.civGrid[idx];
        if (owner !== -1 && owner !== kingdomId) return true;
      }
      return false;
    };
  }

  // A group of cells is "fully enclosed" when every one of its boundary
  // edges (every in-bounds neighbor that isn't itself part of the group)
  // is either already owned or a pocket wall per `wallTest`. Map edges
  // need no special case: inBoundsNeighbors simply omits them, so they
  // never add to `required` in the first place — the same effect as
  // treating the edge itself as a wall.
  function isGroupEnclosed(cells, owned, wallTest) {
    const inGroup = new Set(cells);
    let required = 0, satisfied = 0;
    for (const idx of cells) {
      for (const nidx of inBoundsNeighbors(idx)) {
        if (inGroup.has(nidx)) continue; // internal edge between group cells, not a boundary
        required++;
        if (owned.has(nidx) || wallTest(nidx)) satisfied++;
      }
    }
    return required > 0 && satisfied === required;
  }

  // How large a sealed-off gap is still worth detecting and rushing to
  // close as a "pocket". A gap at or below this size gets auto-filled in
  // (feels like a natural, tight border). Anything bigger is left alone —
  // it stays open, unclaimed space fully surrounded by territory, instead
  // of being forced in like the old 60-tile cap did (which is what made
  // the whole footprint read as one solid blocky square).
  const POCKET_MAX_SIZE = 15;

  // Finds every connected group of reachable-but-unclaimed tiles that is
  // fully sealed off by already-owned land and/or pocket walls (per
  // `wallTest` — water, mountains, another owner's territory, the map
  // edge). Works the same for a city's own territory or a kingdom's
  // civilization territory; the caller just passes the matching wall
  // test. A bounded flood fill from each unvisited pool cell, walking
  // only through open (unowned, non-wall) ground, finds a pocket's true
  // extent even when most of it isn't directly adjacent to already-owned
  // land — e.g. the middle of a wide enclosed clearing, which the
  // single-ring frontier pool alone would never reach. Returns groups
  // sorted smallest-first, since the smallest sealed gaps are both the
  // most urgent to close and the cheapest to finish.
  function findPocketGroups(pool, owned, wallTest) {
    const visited = new Set();
    const groups = [];
    for (const seed of pool) {
      if (visited.has(seed) || owned.has(seed)) continue;
      const region = [seed];
      const regionSet = new Set([seed]);
      const queue = [seed];
      let head = 0, overflowed = false;
      while (head < queue.length && !overflowed) {
        const idx = queue[head++];
        for (const nidx of inBoundsNeighbors(idx)) {
          if (regionSet.has(nidx) || owned.has(nidx)) continue;
          if (wallTest(nidx)) continue;
          regionSet.add(nidx);
          region.push(nidx);
          queue.push(nidx);
          if (region.length > POCKET_MAX_SIZE) { overflowed = true; break; }
        }
      }
      for (const idx of region) visited.add(idx);
      if (overflowed) continue;
      if (isGroupEnclosed(region, owned, wallTest)) groups.push(region);
    }
    groups.sort((a, b) => a.length - b.length);
    return groups;
  }

  // Picks a single tile to claim next. Priority order:
  //   1. A cell from the smallest sealed pocket touching this frontier (at
  //      most POCKET_MAX_SIZE tiles) — picking any one cell is enough,
  //      since the caller adds it to `owned` before the next pick, so the
  //      rest of that same pocket naturally becomes the top-priority pick
  //      again next time and the whole gap gets filled in before anything
  //      else. Bigger sealed gaps are deliberately NOT in this list (see
  //      findPocketGroups/POCKET_MAX_SIZE) — they're left as real holes.
  //   2. Failing that, a plain random pick from the frontier pool. This is
  //      what actually gives territory its shape day-to-day, so it's kept
  //      random on purpose — no bias toward tiles that already have more
  //      owned/wall neighbors, which is what used to pack growth in tight
  //      and produce a blocky, square-ish footprint instead of an organic,
  //      ragged one.
  export function pickFrontierTile(pool, owned, wallTest) {
    const groups = findPocketGroups(pool, owned, wallTest);
    if (groups.length) {
      const group = groups[0];
      const fromPool = group.filter(idx => pool.includes(idx));
      if (fromPool.length) {
        const idx = fromPool[Math.floor(Math.random() * fromPool.length)];
        const i = pool.indexOf(idx);
        return pool.splice(i, 1)[0];
      }
    }
    const i = Math.floor(Math.random() * pool.length);
    return pool.splice(i, 1)[0];
  }

  // How much a city "wants" a given frontier tile: closer tiles score
  // higher (capped), and a tile that's part of a sealed pocket scores
  // much higher still, since closing a gap matters more than a few extra
  // grids of plain proximity. Used both to prioritize a city's own picks
  // indirectly (via findPocketGroups/pickFrontierTile above) and to
  // decide whether it's worth contesting a tile a rival city has already
  // reserved (see planCityClaims).
  export function claimScore(city, idx, isPocket) {
    const x = idx % W, y = (idx / W) | 0;
    const dist = Math.hypot(x + .5 - city.x, y + .5 - city.y);
    let score = clamp(40 - dist, 0, 40);
    if (isPocket) score += 40;
    return score;
  }

  // A rival's reservation is only worth contesting — sending our own
  // claimer after the same tile despite someone already being dispatched
  // — if our claim score clearly beats theirs. This keeps two evenly-
  // matched cities from constantly re-contesting the same handful of
  // border tiles back and forth; whoever holds a clear edge (closer, or
  // it's a pocket only they can see from their own frontier) gets it
  // uncontested, otherwise the earlier reservation stands.
  const CLAIM_CONTEST_MARGIN = 15;

  // --- Claim reservations ---------------------------------------------
  // Prevents two cities (or two claimers from the same city) from being
  // sent to the same frontier tile. Without this, city A and city B could
  // each independently see tile X as free, both dispatch a settler, and
  // whichever arrives second wastes the whole trip. A reservation locks a
  // tile to one city the instant it's handed to a claimer — well before
  // that unit physically arrives — and self-expires so a claimer who dies,
  // gets reassigned, or otherwise never finishes can't lock a tile forever.
  export const CLAIM_RESERVATION_HOURS = 72;

  export function reserveClaimTile(idx, cityId, unitId, score = 0) {
    session.claimReservations.set(idx, { cityId, unitId, score, expiresAt: worldHour() + CLAIM_RESERVATION_HOURS });
  }
  export function releaseClaimTile(idx, cityId) {
    const r = session.claimReservations.get(idx);
    if (r && r.cityId === cityId) session.claimReservations.delete(idx);
  }
  export function releaseCityReservations(cityId) {
    for (const [idx, r] of session.claimReservations) {
      if (r.cityId === cityId) session.claimReservations.delete(idx);
    }
  }
  // True while idx is reserved by anyone (including cityId itself) and
  // that reservation hasn't lapsed. Used to keep a tile out of the
  // candidate pool entirely — reserved-by-self means a claimer is already
  // en route there, reserved-by-other means another city got there first.
  export function isTileReservedActive(idx) {
    const r = session.claimReservations.get(idx);
    if (!r) return false;
    if (r.expiresAt <= worldHour()) { session.claimReservations.delete(idx); return false; }
    return true;
  }

  export function planCityClaims(c) {
    c.claimedTiles ||= [clamp(Math.floor(c.y), 0, H - 1) * W + clamp(Math.floor(c.x), 0, W - 1)];
    const maxTiles = cityGridTarget(c);
    if (c.claimedTiles.length >= maxTiles) return;
    // Drop claimers who died, got reassigned, or otherwise lost their
    // mission — and release whatever tile they had reserved so it isn't
    // locked out waiting for a claimer who's never coming back.
    c.claimerUnitIds = (c.claimerUnitIds || []).filter(id => {
      const u = state.units.find(x => x.id === id);
      const valid = Boolean(u && u.alive && u.claimTarget && u.claimCityId === c.id);
      if (!valid && u && u.claimTileIdx != null) releaseClaimTile(u.claimTileIdx, c.id);
      return valid;
    });
    const capacity = claimerCapacity(c);
    if (c.claimerUnitIds.length >= capacity) return;
    if ((c.claimingBlockedUntil || 0) > worldHour()) return;

    const wallTest = cityWallTest(c.id);
    const owned = new Set(c.claimedTiles);
    const rawCandidates = frontierCandidates(c);
    if (!rawCandidates.length) {
      c.claimingBlockedUntil = worldHour() + 48;
      return;
    }
    // A tile someone else already reserved isn't automatically off-limits
    // — if we clearly want it more (closer, or it closes a pocket only
    // visible from our own frontier) we contest it and send a claimer
    // anyway. Actual ownership is still decided by whoever physically
    // arrives first (see finalizeClaim); this only controls who bothers
    // to try, so two evenly-matched cities don't endlessly re-contest the
    // same border tiles.
    const pocketTiles = new Set(findPocketGroups(rawCandidates, owned, wallTest).flat());
    const candidates = rawCandidates.filter(idx => {
      const r = session.claimReservations.get(idx);
      if (!r) return true;
      if (r.expiresAt <= worldHour()) { session.claimReservations.delete(idx); return true; }
      if (r.cityId === c.id) return false; // already ours, a claimer's en route
      return claimScore(c, idx, pocketTiles.has(idx)) > r.score + CLAIM_CONTEST_MARGIN;
    });
    if (!candidates.length) {
      c.claimingBlockedUntil = worldHour() + 48;
      return;
    }
    c.claimingBlockedUntil = 0;
    const pool = candidates.slice();
    const eligible = u => u.type === 'human' && u.alive && u.city === c.id
      && u.age >= 16 && !u.claimTarget && !u.governorOf && u.royalRole !== 'King';
    while (c.claimerUnitIds.length < capacity && pool.length) {
      const idx = pickFrontierTile(pool, owned, wallTest);
      const x = idx % W, y = (idx / W) | 0;
      // Dedicated claimers go out first — only if none are free does a
      // working resident get pulled off their job for the trip.
      const settler = state.units.find(u => eligible(u) && u.job === 'claimer')
        || state.units.find(eligible);
      if (!settler) break;
      settler.claimTarget = { x: x + .5, y: y + .5 };
      settler.claimCityId = c.id;
      settler.claimTileIdx = idx;
      settler.activity = 'Claiming land';
      c.claimerUnitIds.push(settler.id);
      // Mark this tile as owned-by-us for the rest of this loop (so the
      // next claimer we assign sees it as owned — otherwise a multi-cell
      // pocket gets split across claimers who never coordinate), and
      // reserve it — with our score attached — so no other city (short of
      // a clear contest win) sends anyone else after it.
      owned.add(idx);
      reserveClaimTile(idx, c.id, settler.id, claimScore(c, idx, pocketTiles.has(idx)));
    }
  }

  export function growCityBBox(c, idx) {
    const x = idx % W, y = (idx / W) | 0;
    if (c.footMinX == null) { c.footMinX = c.footMaxX = x; c.footMinY = c.footMaxY = y; return; }
    if (x < c.footMinX) c.footMinX = x; if (x > c.footMaxX) c.footMaxX = x;
    if (y < c.footMinY) c.footMinY = y; if (y > c.footMaxY) c.footMaxY = y;
  }

  export function claimNewResidentQuota(c, amount = 4) {
    if (!c) return 0;
    c.claimedTiles ||= [clamp(Math.floor(c.y), 0, W - 1) * W + clamp(Math.floor(c.x), 0, H - 1)];
    const target = cityGridTarget(c);
    const needed = Math.max(0, Math.min(amount, target - c.claimedTiles.length));
    if (!needed) return 0;

    let added = 0;
    const seen = new Set(c.claimedTiles);
    while (added < needed) {
      // Rebuild the frontier after every claim so the new tile can become
      // the next growth edge and the footprint remains contiguous. Skip
      // anything a claimer unit already has reserved elsewhere, so this
      // instant quota-claim can't grab the same tile out from under someone
      // already walking there.
      const candidates = frontierCandidates(c).filter(idx => !seen.has(idx) && !isTileReservedActive(idx));
      if (!candidates.length) break;
      const idx = pickFrontierTile(candidates, seen, cityWallTest(c.id));
      c.claimedTiles.push(idx); seen.add(idx); added++;
      growCityBBox(c, idx);
      if (session.territoryGrid) {
        session.territoryGrid[idx] = c.id;
        if (session.territoryDistGrid) session.territoryDistGrid[idx] = c.claimedTiles.length - 1;
      }
    }
    return added;
  }

  export function finalizeClaim(city, unit) {
    const x = clamp(Math.floor(unit.claimTarget.x), 0, W - 1);
    const y = clamp(Math.floor(unit.claimTarget.y), 0, H - 1);
    const idx = y * W + x;
    const takenByRival = session.territoryGrid && session.territoryGrid[idx] !== -1 && session.territoryGrid[idx] !== city.id;
    // Belt-and-suspenders cap check: normally a unit whose city hits its
    // grid target gets pulled off 'claimer' (and its claimTarget cleared)
    // the moment assignWorkforce next runs, so it never reaches here. This
    // covers the gap in between — the unit already mid-walk when the cap
    // was crossed — so a city can never end up with more tiles than
    // cityGridTarget() allows.
    const capReached = (city.claimedTiles?.length || 0) >= cityGridTarget(city);
    if (!takenByRival && !capReached) {
      city.claimedTiles ||= [];
      if (!city.claimedTiles.includes(idx)) {
        city.claimedTiles.push(idx);
        growCityBBox(city, idx);
        if (session.territoryGrid) {
          session.territoryGrid[idx] = city.id;
          if (session.territoryDistGrid) session.territoryDistGrid[idx] = city.claimedTiles.length;
        }
        city.lastClaimedAt = performance.now();
        city.lastClaimedX = x; city.lastClaimedY = y;
        if (city.claimedTiles.length % 5 === 0) logEvent(`${city.name} ยึดพื้นที่เพิ่มได้ ${city.claimedTiles.length} กริดแล้ว`, '🚩');
      }
    }
    // Whether the claim succeeded, was beaten by a rival, or bounced off
    // the cap, this tile's reservation (if any) is done being needed.
    releaseClaimTile(idx, city.id);
    city.claimerUnitIds = (city.claimerUnitIds || []).filter(id => id !== unit.id);
    unit.claimTarget = null; unit.claimCityId = null; unit.claimTileIdx = null; unit.activity = 'Socializing';
  }

  export function recomputeCityBBox(c) {
    c.footMinX = c.footMaxX = c.footMinY = c.footMaxY = null;
    for (const idx of (c.claimedTiles || [])) growCityBBox(c, idx);
  }

  export function initialCityClaim(cx, cy, capTiles) {
    const startX = clamp(Math.floor(cx), 0, W - 1), startY = clamp(Math.floor(cy), 0, H - 1);
    const startIdx = startY * W + startX;
    const claimed = [startIdx];
    const seen = new Set([startIdx]);
    const frontier = [];
    const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
    const addNeighbors = idx => {
      const x = idx % W, y = (idx / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nidx = ny * W + nx;
        if (seen.has(nidx)) continue;
        seen.add(nidx);
        if (!isHabitable(state.tiles[nidx])) continue;
        if (session.territoryGrid && session.territoryGrid[nidx] !== -1) continue;
        frontier.push(nidx);
      }
    };
    addNeighbors(startIdx);
    // Random-frontier growth instead of a strict BFS ring: picking a
    // random tile off the frontier each step (rather than walking it in a
    // fixed neighbor order) is what gives even this very first claim a
    // ragged, organic outline instead of a perfect diamond/square.
    while (claimed.length < capTiles && frontier.length) {
      const i = Math.floor(Math.random() * frontier.length);
      const idx = frontier.splice(i, 1)[0];
      claimed.push(idx);
      addNeighbors(idx);
    }
    return claimed;
  }

  export function paintClaimedLive(city) {
    if (!session.territoryGrid || !city.claimedTiles) return;
    for (let i = 0; i < city.claimedTiles.length; i++) {
      const idx = city.claimedTiles[i];
      if (session.territoryGrid[idx] === -1) {
        session.territoryGrid[idx] = city.id;
        if (session.territoryDistGrid) session.territoryDistGrid[idx] = i;
      }
    }
  }
  export function setMoveTarget(u, targetX, targetY, tilesPerSecond = WALK_SPEED) {
    u.moveTarget = { x: targetX, y: targetY };
    u.moveSpeed = tilesPerSecond;
  }

  export const PATH_MAX_NODES = 6000;

  export class PathHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(item) {
      const a = this.items; a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.items, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        while (true) {
          const l = i * 2 + 1, r = i * 2 + 2; let smallest = i;
          if (l < a.length && a[l].f < a[smallest].f) smallest = l;
          if (r < a.length && a[r].f < a[smallest].f) smallest = r;
          if (smallest === i) break;
          [a[smallest], a[i]] = [a[i], a[smallest]]; i = smallest;
        }
      }
      return top;
    }
  }

  export function searchAStar(sx, sy, tx, ty, minX, minY, maxX, maxY) {
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
      if (current.g > (gScore.get(current.idx) ?? Infinity)) continue; // stale entry — a better route to this tile was already found
      if (current.idx === targetIdx) {
        const path = [];
        let cur = targetIdx;
        while (cur !== startIdx) {
          path.push(cur);
          cur = cameFrom.get(cur);
          if (cur == null) return null; // shouldn't happen, but guards against a broken chain
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
        const ntile = state.tiles[nidx];
        if (!isWalkable(ntile)) continue;
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

  export function findPath(startX, startY, targetX, targetY) {
    const sx = clamp(Math.floor(startX), 0, W - 1), sy = clamp(Math.floor(startY), 0, H - 1);
    const tx = clamp(Math.floor(targetX), 0, W - 1), ty = clamp(Math.floor(targetY), 0, H - 1);
    if (sx === tx && sy === ty) return [];
    const startIdx = sy * W + sx, targetIdx = ty * W + tx;
    if (!isWalkable(state.tiles[targetIdx])) return null;
    if (!sameLandRegion(startIdx, targetIdx)) return null;
    const margin = Math.max(8, Math.round(Math.hypot(tx - sx, ty - sy) * .6));
    const boxed = searchAStar(sx, sy, tx, ty,
      Math.max(0, Math.min(sx, tx) - margin), Math.max(0, Math.min(sy, ty) - margin),
      Math.min(W - 1, Math.max(sx, tx) + margin), Math.min(H - 1, Math.max(sy, ty) + margin));
    if (boxed) return boxed;
    return searchAStar(sx, sy, tx, ty, 0, 0, W - 1, H - 1);
  }

  export const PATH_REPATH_COOLDOWN_MS = 600;
  // A* is the most expensive per-unit call in the whole loop, so a single
  // frame can't be allowed to run it for every unit that wants a new route
  // at once (mass migration, a city founding, a war kicking off) — that's
  // what MAX_PATHFINDS_PER_FRAME below caps.
  //
  // But demand for new paths doesn't scale with population alone — it
  // scales with game SPEED too: a unit's move budget in advanceUnits is
  // moveSpeed*dtMs*speed, so at ×100 every unit covers its route ~100×
  // faster in real time, meaning it arrives/rerolls ~100× more often per
  // real second. A flat per-frame cap tuned for ×1-×10 gets vastly
  // outrun by that demand at ×50/×100 — the backlog never drains, and
  // every unit stuck waiting its turn for budget looks frozen for a long
  // stretch (see currentWaypoint returning null with no path yet). Scaling
  // the budget with sqrt(speed) keeps it roughly in proportion to demand
  // without letting a single ×100 frame run hundreds of full-cost searches
  // (sqrt grows the budget much slower than speed itself), and the hard
  // ceiling below still protects the worst case on a slow device.
  export const BASE_PATHFINDS_PER_FRAME = 24;
  export const MAX_PATHFINDS_PER_FRAME_CEILING = 320;
  let pathfindBudget = BASE_PATHFINDS_PER_FRAME;
  export function resetPathfindBudget() {
    const speed = session.speed || 1;
    pathfindBudget = Math.min(MAX_PATHFINDS_PER_FRAME_CEILING, Math.round(BASE_PATHFINDS_PER_FRAME * Math.sqrt(speed)));
  }
  export function ensurePath(u, now) {
    const target = u.moveTarget;
    const changed = u.pathTargetX !== target.x || u.pathTargetY !== target.y;
    if (!changed && u.path) return;
    if (!changed && u.lastPathAttempt && now - u.lastPathAttempt < PATH_REPATH_COOLDOWN_MS) return;
    if (pathfindBudget <= 0) return; // over budget this frame — retry next frame, no cooldown charged
    pathfindBudget--;
    u.pathTargetX = target.x; u.pathTargetY = target.y;
    u.lastPathAttempt = now;
    const raw = findPath(u.x, u.y, target.x, target.y);
    if (raw) {
      const path = raw.slice();
      path.push({ x: target.x, y: target.y });
      u.path = path;
    } else {
      u.path = null; // no route right now — different landmass, sealed off, or the search gave up. The AI will naturally reroll onto a new target on its own schedule; this just stops the unit from marching into a wall meanwhile.
    }
    u.pathIndex = 0;
    u.stuckAnchor = null;
  }

  export function currentWaypoint(u) {
    if (!u.path || u.pathIndex >= u.path.length) return null;
    return u.path[u.pathIndex];
  }

  export const STUCK_CHECK_MS = 1500;
  export const STUCK_MIN_PROGRESS = .15;
  export function checkStuck(u, now) {
    if (!u.stuckAnchor) { u.stuckAnchor = { x: u.x, y: u.y, t: now }; return; }
    if (now - u.stuckAnchor.t < STUCK_CHECK_MS) return;
    if (currentWaypoint(u) && Math.hypot(u.x - u.stuckAnchor.x, u.y - u.stuckAnchor.y) < STUCK_MIN_PROGRESS) {
      u.path = null;
      u.lastPathAttempt = 0;
    }
    u.stuckAnchor = { x: u.x, y: u.y, t: now };
  }

  export function randomHabitableNear(cx, cy, radius, tries = 6) {
    for (let i = 0; i < tries; i++) {
      const x = clamp(cx + rand(-radius, radius), .5, W - .5);
      const y = clamp(cy + rand(-radius, radius), .5, H - .5);
      if (isHabitable(tile(Math.floor(x), Math.floor(y)))) return { x, y };
    }
    return { x: cx, y: cy };
  }

  // A resident's off-duty wandering used to be clamped to their own city's
  // claimedTiles. Now it can land anywhere up to KINGDOM_ROAM_RADIUS grids
  // from ANY claimed tile belonging to ANY city in the same kingdom, so
  // people actually roam the whole kingdom instead of pacing their home
  // town's fence line.
  export const KINGDOM_ROAM_RADIUS = 12;
  export function kingdomRoamAnchor(c) {
    if (!c) return null;
    const kin = c.kingdomId != null ? state.cities.filter(x => x.kingdomId === c.kingdomId) : null;
    const pool = kin && kin.length ? kin : [c];
    const anchorCity = pool[Math.floor(Math.random() * pool.length)];
    const tiles = anchorCity.claimedTiles || [];
    if (tiles.length) {
      const idx = tiles[Math.floor(Math.random() * tiles.length)];
      return { x: idx % W + .5, y: Math.floor(idx / W) + .5 };
    }
    return { x: anchorCity.x, y: anchorCity.y };
  }
  export function kingdomRoamTarget(c) {
    const anchor = kingdomRoamAnchor(c);
    if (!anchor) return { x: c.x, y: c.y };
    return randomHabitableNear(anchor.x, anchor.y, KINGDOM_ROAM_RADIUS, 8);
  }

  export function ensureRoamTarget(u, reroll, label, make) {
    const t = u.roamTarget;
    const arrived = t && u.roamLabel === label && Math.hypot(u.x - t.x, u.y - t.y) < .3;
    if (reroll || !t || u.roamLabel !== label || arrived) { u.roamTarget = make(); u.roamLabel = label; }
    return u.roamTarget;
  }

  export function pickNewbornTile(c, avoid) {
    for (let i = 0; i < 12; i++) {
      const x = clamp(Math.floor(c.x + rand(-1, 1)), 0, W - 1);
      const y = clamp(Math.floor(c.y + rand(-1, 1)), 0, H - 1);
      const key = y * W + x;
      if (avoid.has(key)) continue;
      const t = tile(x, y);
      if (!t || !isHabitable(t)) continue;
      avoid.add(key);
      return { x, y };
    }
    return { x: Math.floor(c.x), y: Math.floor(c.y) };
  }

  export function advanceUnits(dtMs) {
    if (session.speed <= 0) return;
    const now = performance.now();
    resetPathfindBudget(); // one frame's worth of A* searches, scaled with speed (see BASE_PATHFINDS_PER_FRAME)
    for (const u of state.units) {
      if (!u.alive || !u.moveTarget) continue;
      ensurePath(u, now);
      // moveSpeed is tiles-per-second at 1x game speed. (Previously this
      // divided by MS_PER_GAME_HOUR, treating moveSpeed as "tiles per game
      // hour" instead — at 25s/hour that made every unit crawl ~0.01
      // tiles/sec, invisible under the idle bob animation.)
      let budget = (u.moveSpeed || WALK_SPEED) * dtMs * session.speed / 1000; // tiles this unit can cover this frame
      let blocked = false;
      while (budget > 1e-6) {
        const waypoint = currentWaypoint(u);
        if (!waypoint) break; // arrived, or no route right now
        const dx = waypoint.x - u.x, dy = waypoint.y - u.y;
        const distance = Math.hypot(dx, dy);
        if (distance < .02) { u.pathIndex++; continue; }
        const step = Math.min(budget, distance);
        const nx = clamp(u.x + dx / distance * step, .5, W - .5);
        const ny = clamp(u.y + dy / distance * step, .5, H - .5);
        if (!isWalkable(tile(Math.floor(nx), Math.floor(ny)))) { blocked = true; break; }
        u.x = nx; u.y = ny;
        // Distance actually covered this frame, in tiles — drives the walk
        // bob in drawEntities so the bounce is tied to real movement instead
        // of the wall clock (see comment there for why that mattered).
        u.walkPhase = (u.walkPhase || 0) + step;
        budget -= step;
        if (step >= distance - 1e-6) u.pathIndex++;
      }
      if (blocked) {
        u.path = null;
      }
      checkStuck(u, now);
    }
  }

  // --- Spatial hash grid ---------------------------------------------------
