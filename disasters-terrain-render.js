// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// God-tool disasters (lightning, meteor, tornado, volcano, plague) and terrain/minimap rendering.
// Part of the World Simulator script split (see index.html for load order).
'use strict';

import { GRAPHICS_PRESETS, H, LOD_BLOCK_ZOOM, LOD_FULL_ZOOM, OUTER_WATER_GRIDS, TERRAIN, TILE, W, clamp, ctx, latticeNoise, logEvent, rand, session, state, tile } from './state.js';
import { buildSpatialGrid, queryNearbyUnits } from './ai-simulation.js';
import { civTerritoryColor, territoryColor, withAlpha } from './buildings-render.js';
import { buildingLabel, cityClaimingTile, damageCityBuildings } from './cities-kingdoms.js';
import { showToast } from './ui.js';

  export function castLightning(x, y) {
    const t = tile(x, y);
    if (!t) return;
    t.fire = Math.max(t.fire, 16);
    const hit = state.units.find(u => u.alive && Math.floor(u.x) === x && Math.floor(u.y) === y);
    if (hit) { hit.hp -= 70; if (hit.hp <= 0) hit.alive = false; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = tile(x + dx, y + dy);
      if (n && (n.tree || n.terrain === 'forest') && Math.random() < .5) n.fire = 14;
    }
    // A strike landing inside a city's claimed land has a chance to torch
    // one building, same as a real lightning-caused structure fire —
    // small area, low odds, so it's a nuisance rather than something
    // players need to actively defend cities against every strike.
    const struckCity = cityClaimingTile(y * W + x);
    if (struckCity && Math.random() < .3) {
      const [destroyed] = damageCityBuildings(struckCity, 1);
      if (destroyed) logEvent(`ฟ้าผ่าไหม้ ${buildingLabel(destroyed)} ของ ${struckCity.name} เสียหาย`, '⚡');
    }
    state.flashUntil = performance.now() + 180;
    state.fx.push({ type: 'boltFlash', x: x + .5, y: y + .5, start: performance.now(), duration: 260 });
    logEvent('ฟ้าผ่าลงกลางพื้นที่ ทำให้เกิดไฟไหม้', '⚡');
    showToast('⚡ ฟ้าผ่า!');
  }

  export function castMeteor(x, y) {
    const radius = Math.max(2, session.brush + 1);
    let casualties = 0;
    const scorched = new Set();
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      const distSq = ox * ox + oy * oy;
      if (distSq > radius * radius) continue;
      const tx = x + ox, ty = y + oy;
      const target = tile(tx, ty);
      if (!target) continue;
      // Water just splashes (fire/scorch make no sense mid-ocean) — a real
      // crater only forms on ground, same exclusion volcano lava already
      // uses for spreading onto deep water.
      if (target.terrain === 'water' || target.terrain === 'deepWater' || target.terrain === 'iceWater') {
        scorched.add(ty * W + tx);
        continue;
      }
      const dist = Math.sqrt(distSq);
      // 1 at the impact center, fading to 0 at the crater's rim — drives
      // both the bowl-shaped render (see drawTerrainFull) and how long
      // this exact spot takes to heal. Only remember the terrain that was
      // here before it's *first* turned into crater, so a second meteor
      // landing on an already-cratered tile doesn't forget what it should
      // eventually regrow back into.
      const depth = clamp(1 - dist / radius, 0, 1);
      if (target.terrain !== 'crater') target.preCraterTerrain = target.terrain;
      target.terrain = 'crater'; target.tree = false; target.volcano = false;
      // Overlapping meteors: take the deepest hit this tile has ever seen
      // (not additive — two overlapping mid-strength hits shouldn't outdo
      // one direct hit) and let the *freshest* impact reset the recovery
      // clock, so a second meteor keeps the crater alive rather than two
      // independent timers fighting over the same tile.
      target.craterDepth = Math.max(target.craterDepth || 0, depth);
      target.craterAge = 0;
      target.craterRecoverHours = 60 + Math.floor(rand(0, 60)); // ~2.5–5 in-game days
      target.fire = depth > .35 ? 10 : 0;
      scorched.add(ty * W + tx);
    }
    for (const u of state.units) {
      if (!u.alive) continue;
      const dx = u.x - (x + .5), dy = u.y - (y + .5);
      if (dx * dx + dy * dy <= radius * radius) { u.alive = false; casualties++; }
    }
    for (const c of state.cities) {
      const tilesHit = (c.claimedTiles || []).filter(idx => scorched.has(idx)).length;
      if (tilesHit) {
        c.food = Math.max(0, c.food - 40); c.wood = Math.max(0, c.wood - 20);
        c.happiness = clamp((c.happiness || 50) - 25, 0, 100);
        // Building damage scales with how much of the city's own land the
        // impact actually covered — a glancing hit on the edge of a city's
        // territory shouldn't flatten it as hard as a direct hit on the
        // town center. Capped at 3 so one meteor can't ever wipe a city's
        // entire building roster outright.
        const hits = Math.min(3, 1 + Math.floor(tilesHit / 6));
        const destroyed = damageCityBuildings(c, hits);
        if (destroyed.length) logEvent(`อุกกาบาตทำลาย ${destroyed.map(buildingLabel).join(', ')} ของ ${c.name}`, '☄️');
      }
    }
    state.flashUntil = performance.now() + 140;
    state.fx.push({ type: 'shockwave', x: x + .5, y: y + .5, start: performance.now(), duration: 700, maxRadius: radius * 2.4 });
    logEvent(`อุกกาบาตพุ่งชนพื้นโลก มีผู้เสียชีวิต ${casualties} ราย`, '☄️');
    showToast('☄️ อุกกาบาตตก!');
  }

  export function spawnTornado(x, y) {
    state.disasters.push({ type: 'tornado', x: x + .5, y: y + .5, dx: rand(-1, 1), dy: rand(-1, 1), life: 26, radius: 2.2 });
    logEvent('พายุทอร์นาโดก่อตัวขึ้น', '🌪️');
    showToast('🌪️ ทอร์นาโดก่อตัว!');
  }

  export function igniteVolcano(x, y) {
    const t = tile(x, y);
    if (!t || t.terrain === 'water' || t.terrain === 'deepWater' || t.terrain === 'iceWater') { showToast('วางภูเขาไฟได้เฉพาะพื้นดิน'); return; }
    t.terrain = 'mountain'; t.tree = false; t.volcano = true; t.eruptIn = 20 + Math.floor(rand(0, 20));
    logEvent('ภูเขาไฟลูกใหม่ถือกำเนิดขึ้น', '🌋');
    showToast('🌋 เกิดภูเขาไฟใหม่!');
  }

  export function castPlague(x, y) {
    const nearby = state.units.filter(u => u.alive && !u.infected && Math.hypot(u.x - (x + .5), u.y - (y + .5)) < 2.5);
    if (!nearby.length) { showToast('ไม่มีสิ่งมีชีวิตในบริเวณนี้ให้แพร่เชื้อ'); return; }
    for (const u of nearby) { u.infected = true; u.infectedTimer = 30 + Math.floor(rand(0, 20)); }
    logEvent('โรคระบาดเริ่มแพร่กระจายในพื้นที่', '🦠');
    showToast('🦠 ปล่อยโรคระบาด!');
  }

  export function spreadPlague() {
    const infected = state.units.filter(u => u.alive && u.infected);
    if (!infected.length) return;
    buildSpatialGrid();
    for (const source of infected) {
      for (const u of queryNearbyUnits(source.x, source.y, 1.6)) {
        if (!u.alive || u.infected) continue;
        if (Math.hypot(u.x - source.x, u.y - source.y) < 1.6 && Math.random() < .04) {
          u.infected = true; u.infectedTimer = 30 + Math.floor(rand(0, 20));
        }
      }
    }
    for (const c of state.cities) {
      const sick = infected.filter(u => u.city === c.id).length;
      if (sick > 0) c.happiness = clamp((c.happiness || 50) - sick * .4, 0, 100);
    }
  }

  export function updateDisasters(frac = 1) {
    for (const d of state.disasters) {
      if (d.type !== 'tornado') continue;
      d.life -= frac;
      // Random walk + step size scaled by frac so a full in-game hour's
      // worth of substeps (frac summing to 1) covers the same distance
      // and turning as the old once-per-hour jump — but spread smoothly
      // across every frame instead of one big teleport, so it visibly
      // glides like everything else in the sim instead of appearing frozen.
      d.dx += rand(-.4, .4) * frac; d.dy += rand(-.4, .4) * frac;
      const speed = Math.hypot(d.dx, d.dy) || 1;
      d.x = clamp(d.x + (d.dx / speed) * 1.4 * frac, .5, W - .5);
      d.y = clamp(d.y + (d.dy / speed) * 1.4 * frac, .5, H - .5);
      for (const u of state.units) {
        if (!u.alive) continue;
        if (Math.hypot(u.x - d.x, u.y - d.y) < d.radius) {
          u.x = clamp(u.x + rand(-2, 2) * frac, .5, W - .5); u.y = clamp(u.y + rand(-2, 2) * frac, .5, H - .5);
          u.hp -= 6 * frac; if (u.hp <= 0) u.alive = false;
        }
      }
      const t = tile(Math.floor(d.x), Math.floor(d.y));
      if (t && (t.tree || t.terrain === 'forest') && Math.random() < .3 * frac) { t.terrain = 'grass'; t.tree = false; }
      // Building damage while the funnel is actually sitting over a city's
      // land — gated by a cooldown (game-hours) rather than a flat
      // per-substep chance, so a slow-moving tornado parked over one city
      // can't shred its whole building roster in a single in-game hour.
      d.buildingCooldown = (d.buildingCooldown || 0) - frac;
      if (d.buildingCooldown <= 0) {
        const overCity = cityClaimingTile(Math.floor(d.y) * W + Math.floor(d.x));
        if (overCity && Math.random() < .35) {
          const [destroyed] = damageCityBuildings(overCity, 1);
          if (destroyed) logEvent(`ทอร์นาโดพัดถล่ม ${buildingLabel(destroyed)} ของ ${overCity.name} เสียหาย`, '🌪️');
        }
        d.buildingCooldown = 6; // game-hours before this tornado can hit a city again
      }
    }
    state.disasters = state.disasters.filter(d => d.life > 0);
  }

  // A meteor crater isn't permanent — it heals back into whatever terrain
  // was there before over craterRecoverHours in-game hours (set per-tile
  // when the meteor hit, ~2.5–5 days). Called once per in-game hour,
  // alongside updateVolcanoes(). Depth (and so the bowl-shaped render in
  // drawTerrainFull) holds steady for the first half of that time, then
  // visibly fills back in over the second half, so recovery reads as a
  // gradual heal rather than an instant pop from crater to grass.
  export function recoverCraters() {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tile(x, y);
      if (!t || t.terrain !== 'crater') continue;
      t.craterAge = (t.craterAge || 0) + 1;
      const recoverAt = t.craterRecoverHours || 80;
      if (t.craterAge >= recoverAt) {
        t.terrain = t.preCraterTerrain || 'grass';
        t.craterDepth = 0; t.craterAge = 0; t.craterRecoverHours = 0; t.preCraterTerrain = null;
      }
    }
  }

  export function updateVolcanoes() {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tile(x, y);
      if (!t) continue;
      if (t.volcano) {
        t.eruptIn--;
        if (t.eruptIn <= 0) {
          t.eruptIn = 30 + Math.floor(rand(0, 30));
          const buriedCities = new Set();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const nx = x + dx, ny = y + dy;
            const n = tile(nx, ny);
            if (n && !n.volcano && n.terrain !== 'deepWater' && Math.random() < .55) {
              n.terrain = 'lava'; n.tree = false; n.fire = 0; n.lavaAge = 0;
              const owner = cityClaimingTile(ny * W + nx);
              if (owner) buriedCities.add(owner);
            }
          }
          for (const u of state.units) {
            if (u.alive && Math.hypot(u.x - (x + .5), u.y - (y + .5)) < 2.5) { u.hp -= 40; if (u.hp <= 0) u.alive = false; }
          }
          // Lava is the most destructive terrain effect in the game, so
          // it always hits buildings, and harder (2) than any other
          // disaster, for any city whose land it actually buried.
          for (const c of buriedCities) {
            const destroyed = damageCityBuildings(c, 2);
            if (destroyed.length) logEvent(`ลาวาถล่ม ${destroyed.map(buildingLabel).join(', ')} ของ ${c.name} พังเสียหาย`, '🌋');
          }
          logEvent('ภูเขาไฟปะทุ ลาวาไหลปกคลุมพื้นที่โดยรอบ', '🌋');
        }
      } else if (t.terrain === 'lava') {
        t.lavaAge = (t.lavaAge || 0) + 1;
        if (t.lavaAge > 40) { t.terrain = 'ash'; t.lavaAge = 0; }
      }
    }
  }

  export function spreadFire() {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tile(x, y);
      if (!t || t.fire <= 0) continue;
      t.fire--;
      if (Math.random() < .16) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = tile(x + dx, y + dy);
          if (n && (n.tree || n.terrain === 'forest') && Math.random() < .32) n.fire = 14;
        }
      }
      if (t.fire > 8) { t.terrain = 'grass'; t.tree = false; }
    }
  }

  export function clampCamera() {
    const halfW = innerWidth / (2 * session.view.zoom), halfH = innerHeight / (2 * session.view.zoom);
    const pad = OUTER_WATER_GRIDS * TILE;
    const minX = -pad, maxX = W * TILE + pad, minY = -pad, maxY = H * TILE + pad;
    session.view.x = halfW >= (maxX - minX) / 2 ? (minX + maxX) / 2 : clamp(session.view.x, minX + halfW, maxX - halfW);
    session.view.y = halfH >= (maxY - minY) / 2 ? (minY + maxY) / 2 : clamp(session.view.y, minY + halfH, maxY - halfH);
  }
  export function screenToWorld(sx, sy) {
    return { x: (sx - innerWidth / 2) / session.view.zoom + session.view.x, y: (sy - innerHeight / 2) / session.view.zoom + session.view.y };
  }

  export function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  export function buildMinimapTerrain() {
    if (!session.minimapTerrain) {
      session.minimapTerrain = document.createElement('canvas');
      session.minimapTerrain.width = W; session.minimapTerrain.height = H;
    }
    const mctx = session.minimapTerrain.getContext('2d');
    const img = mctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = state.tiles[y * W + x];
      const [r, g, b] = hexToRgb((t?.volcano ? TERRAIN.lava : TERRAIN[t?.terrain]) || TERRAIN.grass);
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    mctx.putImageData(img, 0, 0);
    session.minimapDirty = false;
  }
  // Shared by the minimap and the far-zoom blocky terrain LOD — both just
  // want a 1px-per-tile buffer that's reasonably current.
  export function ensureMinimapTerrain(now) {
    if (!session.minimapTerrain || session.minimapDirty || now - session.minimapRebuildAt > 5000) {
      buildMinimapTerrain();
      session.minimapRebuildAt = now;
    }
  }
  // The territory-overlay layer (one pass over every claimed tile, with a
  // neighbor lookup per tile to find edges) used to run in full every
  // single frame just because drawMinimap does — even though territory
  // ownership only actually changes a few times a second at most. It's
  // now rendered onto its own small offscreen canvas that's only rebuilt
  // when the overlay mode changes or minimapOverlayMs (graphics-quality
  // dependent) has elapsed; drawMinimap just stamps that cached image on
  // top of the terrain every frame, which is a single cheap drawImage.
  function ensureMinimapOverlay(w, h, now) {
    if (session.overlay === 'none') { session.minimapOverlayCanvas = null; session.minimapOverlayMode = 'none'; return; }
    const interval = GRAPHICS_PRESETS[session.graphicsQuality]?.minimapOverlayMs ?? 200;
    const sizeStale = !session.minimapOverlayCanvas || session.minimapOverlayCanvas.width !== w || session.minimapOverlayCanvas.height !== h;
    const modeChanged = session.minimapOverlayMode !== session.overlay;
    if (!sizeStale && !modeChanged && now - session.minimapOverlayAt < interval) return;
    if (sizeStale) {
      session.minimapOverlayCanvas = document.createElement('canvas');
      session.minimapOverlayCanvas.width = w; session.minimapOverlayCanvas.height = h;
    }
    const octx = session.minimapOverlayCanvas.getContext('2d');
    octx.clearRect(0, 0, w, h);
    const owners = new Map();
    if (session.overlay === 'civilization') {
      for (const k of state.kingdoms) {
        const key = `civ:${k.id}`;
        const color = civTerritoryColor(k.id);
        for (const idx of (k.civClaimedTiles || [])) {
          if (!owners.has(idx)) owners.set(idx, { key, color });
        }
      }
    } else {
      for (const c of state.cities) {
        if (session.overlay === 'kingdom' && !c.kingdomId) continue;
        const key = session.overlay === 'kingdom' ? `kingdom:${c.kingdomId}` : `city:${c.id}`;
        const color = territoryColor(c.kingdomId || c.id);
        for (const idx of (c.claimedTiles || [])) {
          if (!owners.has(idx)) owners.set(idx, { key, color });
        }
      }
    }
    for (const [idx, owner] of owners) {
      const x = idx % W, y = Math.floor(idx / W);
      const t = tile(x, y);
      if (t && t.terrain === 'deepWater') continue;
      const left = owners.get(idx - 1), top = owners.get(idx - W);
      const right = owners.get(idx + 1), bottom = owners.get(idx + W);
      const isEdge = x === 0 || y === 0 || x === W - 1 || y === H - 1
        || !left || left.key !== owner.key || !top || top.key !== owner.key
        || !right || right.key !== owner.key || !bottom || bottom.key !== owner.key;
      if (isEdge) {
        octx.fillStyle = 'rgba(10, 14, 10, 0.9)';
        octx.fillRect(x, y, 1, 1);
        octx.fillStyle = withAlpha(owner.color, 0.95);
        octx.fillRect(x, y, 1, 1);
      } else {
        octx.fillStyle = withAlpha(owner.color, 0.55);
        octx.fillRect(x, y, 1, 1);
      }
    }
    session.minimapOverlayMode = session.overlay;
    session.minimapOverlayAt = now;
  }
  export function drawMinimap(now) {
    if (!session.minimapCanvas) return;
    ensureMinimapTerrain(now);
    const w = session.minimapCanvas.width, h = session.minimapCanvas.height;
    session.minimapCtx.imageSmoothingEnabled = false;
    session.minimapCtx.clearRect(0, 0, w, h);
    session.minimapCtx.drawImage(session.minimapTerrain, 0, 0, w, h);
    ensureMinimapOverlay(w, h, now);
    if (session.minimapOverlayCanvas) session.minimapCtx.drawImage(session.minimapOverlayCanvas, 0, 0);
    for (const c of state.cities) {
      session.minimapCtx.fillStyle = session.overlay === 'civilization' ? civTerritoryColor(c.kingdomId ?? c.id) : territoryColor(c.kingdomId || c.id);
      session.minimapCtx.beginPath();
      session.minimapCtx.arc((c.x / W) * w, (c.y / H) * h, c.isCapital ? 2.2 : 1.4, 0, Math.PI * 2);
      session.minimapCtx.fill();
    }
    const vw = Math.min(innerWidth / session.view.zoom / TILE, W), vh = Math.min(innerHeight / session.view.zoom / TILE, H);
    const vx = (session.view.x / TILE - vw / 2) / W * w, vy = (session.view.y / TILE - vh / 2) / H * h;
    session.minimapCtx.strokeStyle = '#ffcf5c'; session.minimapCtx.lineWidth = 1.2;
    session.minimapCtx.strokeRect(vx, vy, (vw / W) * w, (vh / H) * h);
  }

  export function drawOuterWaterBorder(left, right, top, bottom) {
    ctx.fillStyle = TERRAIN.deepWater;
    ctx.fillRect(left, top, right - left, bottom - top);
  }

  // Level-of-detail dispatch. Zoomed in (or at normal view) renders full
  // per-tile ornamentation as before; the middle band drops that
  // ornamentation for flat tile colors; far enough out it stops looping
  // tiles altogether and blits the minimap's 1px-per-tile buffer scaled
  // up with no smoothing, so each tile reads as one solid pixel block.
  export function drawTerrain(left, right, top, bottom) {
    if (session.view.zoom < LOD_BLOCK_ZOOM) { drawTerrainBlocky(); return; }
    if (session.view.zoom < LOD_FULL_ZOOM) { drawTerrainSimplified(left, right, top, bottom); return; }
    drawTerrainFull(left, right, top, bottom);
  }

  export function drawTerrainBlocky() {
    ensureMinimapTerrain(performance.now());
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(session.minimapTerrain, 0, 0, W, H, 0, 0, W * TILE, H * TILE);
    ctx.imageSmoothingEnabled = smooth;
  }

  export function drawTerrainSimplified(left, right, top, bottom) {
    const sx = Math.max(0, Math.floor(left / TILE) - 1), ex = Math.min(W, Math.ceil(right / TILE) + 1);
    const sy = Math.max(0, Math.floor(top / TILE) - 1), ey = Math.min(H, Math.ceil(bottom / TILE) + 1);
    for (let y = sy; y < ey; y++) for (let x = sx; x < ex; x++) {
      const t = tile(x, y), px = x * TILE, py = y * TILE;
      ctx.fillStyle = (t.terrain === 'forest' ? TERRAIN.forest : TERRAIN[t.terrain]) || TERRAIN.grass;
      ctx.fillRect(px, py, TILE + .35, TILE + .35);
      if (t.tree && t.terrain !== 'forest') { ctx.fillStyle = 'rgba(30,60,35,.35)'; ctx.fillRect(px, py, TILE + .35, TILE + .35); }
      if (t.volcano) { ctx.fillStyle = TERRAIN.lava; ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8); }
      else if (t.fire > 0) { ctx.fillStyle = 'rgba(255,120,30,.55)'; ctx.fillRect(px, py, TILE + .35, TILE + .35); }
    }
  }

  function drawTerrainFull(left, right, top, bottom) {
    const sx = Math.max(0, Math.floor(left / TILE) - 1), ex = Math.min(W, Math.ceil(right / TILE) + 1);
    const sy = Math.max(0, Math.floor(top / TILE) - 1), ey = Math.min(H, Math.ceil(bottom / TILE) + 1);
    const now = performance.now();
    const waterPhase = now / 900;
    const firePhase = now / 140;
    const gfx = GRAPHICS_PRESETS[session.graphicsQuality] || GRAPHICS_PRESETS.high;
    const waterAnimOn = gfx.waterAnim ?? true;
    const terrainDetail = gfx.terrainDetail ?? 0;
    const waterDetail = gfx.waterDetail ?? 0;
    for (let y = sy; y < ey; y++) for (let x = sx; x < ex; x++) {
      const t = tile(x, y), px = x * TILE, py = y * TILE;
      ctx.fillStyle = (t.terrain === 'forest' ? TERRAIN.grass : TERRAIN[t.terrain]) || TERRAIN.grass;
      ctx.fillRect(px, py, TILE + .35, TILE + .35);
      if (terrainDetail >= 2 && t.terrain !== 'water' && t.terrain !== 'deepWater' && t.terrain !== 'iceWater') {
        const grain = latticeNoise(x + 151, y + 311, state.seed);
        const grain2 = latticeNoise(x + 271, y + 91, state.seed);
        ctx.fillStyle = grain > .52 ? 'rgba(255,255,255,.055)' : 'rgba(30,20,10,.045)';
        ctx.fillRect(px + 2 + grain2 * 8, py + 3 + grain * 8, 1, 1);
        if (terrainDetail >= 3) ctx.fillRect(px + 10 + grain * 3, py + 11 + grain2 * 3, .8, .8);
      }
      if (t.terrain !== 'water' && t.terrain !== 'deepWater' && t.terrain !== 'iceWater') {
        const west = tile(x - 1, y)?.elevation ?? t.elevation, north = tile(x, y - 1)?.elevation ?? t.elevation;
        const east = tile(x + 1, y)?.elevation ?? t.elevation, south = tile(x, y + 1)?.elevation ?? t.elevation;
        const relief = clamp(((west - east) + (north - south) * .7) * 2.2, -.16, .16);
        if (relief > .01) { ctx.fillStyle = `rgba(255,255,255,${relief})`; ctx.fillRect(px, py, TILE + .35, TILE + .35); }
        else if (relief < -.01) { ctx.fillStyle = `rgba(20,15,10,${-relief})`; ctx.fillRect(px, py, TILE + .35, TILE + .35); }
      }
      if (t.terrain === 'water' || t.terrain === 'deepWater') {
        if (!waterAnimOn) continue;
        const seed = latticeNoise(x, y, state.seed) * Math.PI * 2;
        ctx.strokeStyle = '#b8e4ed55'; ctx.lineWidth = 1;
        ctx.beginPath();
        const bob = Math.sin(waterPhase + seed) * 1.4;
        ctx.moveTo(px + 3, py + 6 + bob);
        ctx.quadraticCurveTo(px + 8, py + 3 + bob, px + 13, py + 6 + bob);
        ctx.stroke();
        if (waterDetail >= 2) {
          ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = .7;
          ctx.beginPath();
          const glint = Math.sin(waterPhase * 1.7 + seed * 2.3) * 1.2;
          ctx.moveTo(px + 4, py + 9 + glint); ctx.lineTo(px + 8, py + 9.4 + glint); ctx.stroke();
        }
        const bob2 = Math.sin(waterPhase * .8 + seed + 2.1) * 1.1;
        ctx.strokeStyle = '#8fd2e433';
        ctx.beginPath();
        ctx.moveTo(px + 1, py + 11 + bob2);
        ctx.quadraticCurveTo(px + 8, py + 9 + bob2, px + 15, py + 11 + bob2);
        ctx.stroke();
        // Foam where water meets dry land — a quick 4-neighbour check keeps
        // this cheap while making coastlines read clearly against the sea.
        let coastal = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = tile(x + dx, y + dy);
          if (n && n.terrain !== 'water' && n.terrain !== 'deepWater' && n.terrain !== 'iceWater') { coastal = true; break; }
        }
        if (coastal) {
          const foamPulse = .5 + Math.sin(waterPhase * 1.6 + seed) * .3;
          ctx.strokeStyle = `rgba(255,255,255,${.35 + foamPulse * .25})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + 15, py + 1);
          ctx.lineTo(px + 15, py + 15); ctx.lineTo(px + 1, py + 15); ctx.closePath(); ctx.stroke();
        }
      } else if (t.terrain === 'iceWater') {
        // Frozen surface: static frost cracks instead of the bobbing wave
        // lines used for liquid water — ice doesn't animate.
        const seed = latticeNoise(x, y, state.seed) * Math.PI * 2;
        ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 2, py + 3 + Math.sin(seed) * 2);
        ctx.lineTo(px + 8, py + 9 + Math.cos(seed) * 2);
        ctx.lineTo(px + 5, py + 14);
        ctx.moveTo(px + 8, py + 9 + Math.cos(seed) * 2);
        ctx.lineTo(px + 14, py + 6);
        ctx.stroke();
      } else if (t.terrain === 'forest' || t.tree) {
        const seedA = latticeNoise(x + 40, y + 40, state.seed);
        const seedB = latticeNoise(x + 91, y + 17, state.seed);
        const seedC = latticeNoise(x + 5, y + 63, state.seed);
        const seedD = latticeNoise(x + 23, y + 88, state.seed);
        const offX = (seedB - .5) * 6.5, offY = (seedC - .5) * 4.5;
        let scale = .6 + Math.pow(seedD, 1.6) * 1.75;
        // A newly-regrown sapling starts small and fills out over the
        // following ticks rather than popping in at full size.
        if (t.sproutedAt != null) {
          const age = (state.simTicks || 0) - t.sproutedAt;
          scale *= clamp(age / 9, .28, 1);
        }
        // A tree actively being chopped sways under the axe.
        let wobble = 0;
        if (t.chopProgress > 0) {
          wobble = Math.sin(now / 85 + x * 3.1 + y * 1.7) * Math.min(1, t.chopProgress / 4) * 2.4;
        }
        const cx = px + 8 + offX + wobble, cy = py + 8 + offY;
        const lean = (seedA - .5) * 2.6 + wobble * .6;
        const conifer = seedA > .5;
        const dark = seedA > .78 || seedA < .22;
        if (conifer) {
          ctx.fillStyle = dark ? '#20452f' : '#2a6844';
          ctx.beginPath();
          ctx.moveTo(cx + lean * .3, cy - 6.2 * scale);
          ctx.lineTo(cx - 4.4 * scale + lean, cy + 4.4 * scale);
          ctx.lineTo(cx + 4.4 * scale + lean, cy + 4.4 * scale);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = dark ? '#5c9a52' : '#6ea95a';
          ctx.beginPath();
          ctx.moveTo(cx + lean * .5, cy - 3.4 * scale);
          ctx.lineTo(cx - 3 * scale + lean, cy + 1.8 * scale);
          ctx.lineTo(cx + 3 * scale + lean, cy + 1.8 * scale);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = dark ? '#3c6b3f' : '#458049';
          ctx.beginPath(); ctx.arc(cx + lean, cy - 1.4 * scale, 3.1 * scale, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = dark ? '#5c9a52' : '#6ea95a';
          ctx.beginPath(); ctx.arc(cx - 1.6 * scale + lean, cy + .6 * scale, 2.1 * scale, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 1.9 * scale + lean, cy + .3 * scale, 1.9 * scale, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#4b3524';
        ctx.fillRect(cx - .8 + lean * .2, cy + 3.4 * scale, 1.6, 2.4 * scale);
      } else if (t.ore) {
        const seedA = latticeNoise(x + 61, y + 14, state.seed);
        const seedB = latticeNoise(x + 8, y + 71, state.seed);
        const offX = (seedB - .5) * 5, offY = (seedA - .5) * 3;
        let wobble = 0;
        if (t.chopProgress > 0) {
          wobble = Math.sin(now / 80 + x * 2.6 + y * 1.3) * Math.min(1, t.chopProgress / 4) * 1.6;
        }
        const cx = px + 8 + offX + wobble, cy = py + 9 + offY;
        const gold = t.ore === 'gold', iron = t.ore === 'iron';
        ctx.fillStyle = gold ? '#8a7a52' : iron ? '#6b4030' : '#7d7d7d';
        ctx.beginPath();
        ctx.moveTo(cx - 4.5, cy + 3); ctx.lineTo(cx - 2.5, cy - 3.5); ctx.lineTo(cx + 1.5, cy - 4.2);
        ctx.lineTo(cx + 4.6, cy - .5); ctx.lineTo(cx + 3, cy + 3.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = gold ? '#c7a94a' : iron ? '#9c5b41' : '#a8a8a8';
        ctx.beginPath();
        ctx.moveTo(cx - 2.5, cy - 3.5); ctx.lineTo(cx + .3, cy - 4.6); ctx.lineTo(cx + 1.6, cy - 1.2);
        ctx.lineTo(cx - .6, cy - .3); ctx.closePath(); ctx.fill();
        if (gold) {
          // A couple of bright flecks are the only thing telling a gold
          // vein apart from an ordinary boulder at a glance.
          ctx.fillStyle = '#ffd85c';
          ctx.beginPath(); ctx.arc(cx - .8, cy - 1.6, .8, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 1.6, cy + .4, .6, 0, Math.PI * 2); ctx.fill();
        } else if (iron) {
          ctx.fillStyle = '#c76b3f';
          ctx.beginPath(); ctx.arc(cx - .6, cy - 1.4, .7, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 1.5, cy + .6, .55, 0, Math.PI * 2); ctx.fill();
        }
      } else if (t.berries) {
        const seedA = latticeNoise(x + 33, y + 90, state.seed);
        const seedB = latticeNoise(x + 77, y + 4, state.seed);
        const offX = (seedB - .5) * 5, offY = (seedA - .5) * 3;
        let wobble = 0;
        if (t.chopProgress > 0) {
          wobble = Math.sin(now / 75 + x * 2.2 + y * 1.9) * Math.min(1, t.chopProgress / 3) * 1.4;
        }
        const cx = px + 8 + offX + wobble, cy = py + 9 + offY;
        ctx.fillStyle = '#3d6b3a';
        ctx.beginPath(); ctx.arc(cx, cy, 3.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4f8a49';
        ctx.beginPath(); ctx.arc(cx - 1.9, cy + .9, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 2.1, cy + .6, 2.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c23a5e';
        ctx.beginPath(); ctx.arc(cx - 1.4, cy - .7, .8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 1.6, cy - 1.2, .8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + .2, cy + 1.3, .8, 0, Math.PI * 2); ctx.fill();
      } else if (t.terrain === 'mountain' || t.terrain === 'snow') {
        const jitter = latticeNoise(x + 80, y + 80, state.seed);
        ctx.fillStyle = t.terrain === 'snow' ? '#fff' : (jitter > .5 ? '#63696b' : '#5b6062');
        ctx.beginPath(); ctx.moveTo(px + 2, py + 13); ctx.lineTo(px + 8, py + 3); ctx.lineTo(px + 14, py + 13); ctx.closePath(); ctx.fill();
        ctx.fillStyle = t.terrain === 'snow' ? '#b8c8cb' : '#717474';
        ctx.beginPath(); ctx.moveTo(px + 8, py + 3); ctx.lineTo(px + 11, py + 9); ctx.lineTo(px + 8, py + 8); ctx.lineTo(px + 5, py + 9); ctx.closePath(); ctx.fill();
      } else if (t.terrain === 'lava') {
        const glow = .6 + Math.sin(firePhase * .5 + x * .7 + y * .3) * .35;
        ctx.fillStyle = `rgba(255,154,60,${glow})`; ctx.beginPath(); ctx.arc(px + 5, py + 9, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(px + 11, py + 6, 2, 0, Math.PI * 2); ctx.fill();
      } else if (t.terrain === 'ash') {
        ctx.strokeStyle = '#2c241f88'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + 3, py + 4); ctx.lineTo(px + 8, py + 11); ctx.lineTo(px + 13, py + 5); ctx.stroke();
      } else if (t.terrain === 'crater') {
        // A real bowl, not a flat scorch mark: craterDepth (1 = impact
        // center, 0 = rim) drives how dark/sunken this exact tile looks,
        // so one meteor's blast radius reads as an actual pit with a
        // lighter raised rim — and overlapping meteors (which take the
        // max depth per tile in castMeteor) blend into one continuous
        // crater instead of two separate marks fighting for the same
        // ground. As it heals (second half of craterRecoverHours) the
        // whole thing visibly shallows back toward the rim tone before
        // flipping back to real terrain in recoverCraters().
        const recoverAt = t.craterRecoverHours || 80;
        const healFrac = clamp(((t.craterAge || 0) / recoverAt - .5) * 2, 0, 1); // 0 for first half of life, 0→1 over the second half
        const depth = (t.craterDepth ?? 1) * (1 - healFrac);
        const rim = [107, 90, 66], center = [42, 33, 26];
        const r = rim[0] + (center[0] - rim[0]) * depth, g = rim[1] + (center[1] - rim[1]) * depth, b = rim[2] + (center[2] - rim[2]) * depth;
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(px, py, TILE + .35, TILE + .35);
        ctx.fillStyle = `rgba(0,0,0,${.28 * depth})`;
        ctx.beginPath(); ctx.arc(px + 8, py + 8.5, 2.2 + depth * 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(150,128,98,${.5 * depth})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px + 8, py + 8, 6.6, .15 * Math.PI, 1.35 * Math.PI); ctx.stroke();
      } else if ((t.terrain === 'grass' || t.terrain === 'sand') && session.view.zoom >= 1.3) {
        // Fine blade/grain texture only shows up once zoomed in enough to
        // matter, so it never costs anything at the map-wide view.
        ctx.strokeStyle = t.terrain === 'grass' ? '#6ea25355' : '#c7a95f55';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const bx = latticeNoise(x * 3 + i, y * 3 + i, state.seed);
          const by = latticeNoise(x * 3 + i + 5, y * 3 + i + 5, state.seed);
          const gx = px + 2 + bx * 12, gy = py + 3 + by * 10;
          ctx.beginPath(); ctx.moveTo(gx, gy + 3); ctx.lineTo(gx + (bx - .5) * 2, gy - 2); ctx.stroke();
        }
      }
      if (t.cutAtMs && now - t.cutAtMs < 1100) {
        const age = now - t.cutAtMs, fade = 1 - age / 1100;
        const mined = t.minedType === 'stone' || t.minedType === 'gold';
        ctx.globalAlpha = clamp(fade, 0, 1);
        ctx.fillStyle = mined ? '#6b6b6b' : '#6b4a30';
        ctx.beginPath(); ctx.ellipse(px + 8, py + 10.5, 2.6, 1.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = mined ? '#3a3a3a' : '#3f2c1c'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px + 8, py + 10.5, 1.5, 0, Math.PI * 2); ctx.stroke();
        const chipRise = age / 1100;
        ctx.fillStyle = t.minedType === 'gold' ? '#e0bd5a' : mined ? '#9a9a9a' : '#8a6a45';
        ctx.beginPath(); ctx.arc(px + 5 - chipRise * 3, py + 8 - chipRise * 6, .9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(px + 11 + chipRise * 3, py + 7 - chipRise * 5, .8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (t.volcano) {
        ctx.fillStyle = t.eruptIn < 6 ? '#ff5a2a' : '#cf3d1e';
        ctx.beginPath(); ctx.arc(px + 8, py + 6, 2.6, 0, Math.PI * 2); ctx.fill();
        // Ambient smoke the whole time it's counting down to eruption —
        // without this a freshly placed volcano looks identical to a plain
        // mountain for however long eruptIn takes to reach 0 (up to ~39
        // game hours), which reads as "not doing anything" even though the
        // countdown is ticking underneath. Puff rate/opacity ramps up as
        // eruptIn approaches 0 so it visibly builds toward the eruption.
        const closeness = clamp(1 - (t.eruptIn ?? 20) / 40, 0, 1);
        for (let p = 0; p < 2; p++) {
          const puffSeed = latticeNoise(x + p * 17, y + p * 11, state.seed);
          const cycle = 2200 - closeness * 1000;
          const rise = ((now + puffSeed * cycle) % cycle) / cycle;
          const puffX = px + 8 + Math.sin(rise * 6 + puffSeed * 6) * 2;
          const puffY = py + 3 - rise * 14;
          ctx.globalAlpha = clamp((1 - rise) * (.35 + closeness * .4), 0, .75);
          ctx.fillStyle = closeness > .7 ? '#c9605a' : '#8a8f92';
          ctx.beginPath(); ctx.arc(puffX, puffY, 1.4 + rise * 2.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (t.fire > 0) {
        const flicker = .75 + Math.sin(firePhase + x * 1.3 + y * .7) * .25;
        ctx.globalAlpha = clamp(flicker, .5, 1);
        ctx.fillStyle = '#ff8a22'; ctx.beginPath(); ctx.arc(px + 8, py + 8, 5 * flicker, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(px + 8, py + 7, 2.5 * flicker, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // A couple of embers drift upward and fade — cheap, deterministic
        // per-tile timing so it doesn't need any extra state to track.
        for (let e = 0; e < 2; e++) {
          const emberSeed = latticeNoise(x + e * 13, y + e * 7, state.seed);
          const rise = (now / 500 + emberSeed * 8) % 8;
          ctx.globalAlpha = clamp(1 - rise / 8, 0, 1);
          ctx.fillStyle = '#ffcf82';
          ctx.beginPath(); ctx.arc(px + 5 + emberSeed * 8, py + 8 - rise * 2.2, .9, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    if (session.view.zoom >= 1.35) {
      ctx.strokeStyle = '#17304435'; ctx.lineWidth = .6;
      for (let x = sx; x <= ex; x++) { ctx.beginPath(); ctx.moveTo(x * TILE, sy * TILE); ctx.lineTo(x * TILE, ey * TILE); ctx.stroke(); }
      for (let y = sy; y <= ey; y++) { ctx.beginPath(); ctx.moveTo(sx * TILE, y * TILE); ctx.lineTo(ex * TILE, y * TILE); ctx.stroke(); }
    }
  }

