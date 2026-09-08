// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// Frame draw loop, on-screen panel UI (unit/city/kingdom/tile details), toasts, tool usage, and save/load.
// Part of the World Simulator script split (see index.html for load order).
'use strict';

import { DAYS_PER_YEAR, FPS_CAP_OPTIONS, GRAPHICS_PRESETS, H, MAX_DAY_LENGTH_MINUTES, MIN_DAY_LENGTH_MINUTES, MS_PER_GAME_HOUR, PAINT_TOOLS, PRESET_ORDER, SAVE_KEY, SAVE_SLOTS_INDEX_KEY, SAVE_SLOT_COUNT, SPECIES, TILE, W, clamp, ctx, hideModal, logEvent, monthLabel, saveSlotKey, session, setAutoQuality, setDayLengthMinutes, setFpsCap, setGraphicsCustomField, setGraphicsQuality, setShowFps, showModal, state, tile } from './state.js';
import { worldHour } from './ai-simulation.js';
import { BUILDING_LABELS, assignKingdomColor, drawDisasters, drawEntities, drawTerritories, findBuildingAt } from './buildings-render.js';
import { appointRoyalFamily, updateSettlements } from './cities-kingdoms.js';
import { CULTURE_LEVELS, CULTURE_MAX_LEVEL, cultureLevelInfo, cultureProgressRequired, cultureSymbolHTML } from './culture.js';
import { castLightning, castMeteor, castPlague, clampCamera, drawMinimap, drawOuterWaterBorder, drawTerrain, igniteVolcano, screenToWorld, spawnTornado } from './disasters-terrain-render.js';
import { makeWorld, resize } from './world.js';
import { royalDisplayName } from './names.js';
import { RESOURCE_LABEL, drawFishingPaths, drawSeaTradeRoutes, spawnCargoShip, updateShipUnits } from './sea-trade.js';
import { capitalIcon, cityIcon, crownIcon, ctrlIcon, kingdomIcon, resourceIcon, civImageHTML } from './icons.js';
import { advanceUnits, cityOf, initialCivFloodClaim, rebuildCivGrid, rebuildTerritoryGrid, recomputeCityBBox } from './territory-units.js';
import { cityGridTarget, cityLevel, civGridTarget, requiredHouses, spawnAnimal, spawnHuman } from './world.js';

  export let selected = null;
  // Lightweight back-navigation for the detail panel (#panel). Buttons inside
  // a panel that drill into another entity (e.g. "ดูผู้นำ" from a city into
  // that unit's page) push the panel they're leaving via pushPanelHistory();
  // panelHTML() then renders a back button whenever history isn't empty, and
  // panelGoBack() re-invokes whatever opened the previous view. A *fresh*
  // selection (tapping the map, opening save/settings/etc.) should start a
  // new root instead of appending to old history — those call sites reset
  // panelHistory to [] before opening their panel.
  export let panelHistory = [];
  export function pushPanelHistory(fn, arg) { panelHistory.push({ fn, arg }); }
  export function panelGoBack() {
    const prev = panelHistory.pop();
    if (prev) prev.fn(prev.arg); else closePanel();
  }

  export function stepGridValue(c, key, target, dt, unit, msPerStep, now) {
    if (c[key] == null) { c[key] = target; return; } // first appearance: no animation to play catch-up on
    if (c[key] < target) {
      const accKey = key + 'Acc';
      c[accKey] = (c[accKey] || 0) + dt;
      while (c[accKey] >= msPerStep && c[key] < target) {
        c[accKey] -= msPerStep;
        c[key] = Math.min(target, c[key] + unit);
        c[key + 'FlashAt'] = now;
      }
    } else if (c[key] > target) {
      c[key] = target; // shrinking is rare (e.g. after a famine) — snap, nothing to animate
    }
  }
  export function updateCityVisuals(dt) {
    // Same speed handling as advanceUnits/updateShipUnits below: this
    // animates a city's district radius growing toward its target as
    // houses are added, so it needs to track game time, not the wall
    // clock — otherwise it crawls at a fixed real-time rate regardless
    // of 1x/2x/5x/10x, and keeps animating even while paused (speed 0).
    if (session.speed <= 0) return;
    const now = performance.now();
    const scaledDt = dt * session.speed;
    for (const c of state.cities) {
      const houseCount = Math.min(c.houses || 0, Math.max(0, (c.claimedTiles || []).length - 1));
      const targetDistrict = clamp(24 + Math.sqrt(houseCount) * 5, 28, 82);
      stepGridValue(c, 'districtRadiusDisplay', targetDistrict, scaledDt, TILE, 300, now);
    }
  }

  export let uiAccumulator = 999;
  export function draw(dt, now = performance.now()) {
    // Safety net: if the camera (pan/zoom) ever ends up with a
    // non-finite value — e.g. from a divide-by-zero in some future input
    // handler — every canvas draw call below silently no-ops on a NaN
    // transform (no thrown error), leaving a permanently blank map while
    // the simulation keeps ticking. Recovering here means one bad input
    // costs a single frame instead of the rest of the session.
    if (!Number.isFinite(session.view.zoom) || session.view.zoom <= 0
      || !Number.isFinite(session.view.x) || !Number.isFinite(session.view.y)) {
      session.view.zoom = 1; session.view.x = W * TILE / 2; session.view.y = H * TILE / 2;
      clampCamera();
    }
    advanceUnits(dt);
    updateShipUnits(dt);
    updateCityVisuals(dt);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = '#0d141d'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    ctx.translate(innerWidth / 2, innerHeight / 2);
    ctx.scale(session.view.zoom, session.view.zoom);
    ctx.translate(-session.view.x, -session.view.y);
    const left = session.view.x - innerWidth / (2 * session.view.zoom), right = session.view.x + innerWidth / (2 * session.view.zoom);
    const top = session.view.y - innerHeight / (2 * session.view.zoom), bottom = session.view.y + innerHeight / (2 * session.view.zoom);
    drawOuterWaterBorder(left, right, top, bottom);
    drawTerrain(left, right, top, bottom);
    drawTerritories(left, right, top, bottom);
    drawAtmosphere(left, right, top, bottom);
    drawEntities(left, right, top, bottom);
    drawSeaTradeRoutes(now);
    drawFishingPaths();
    drawDisasters();
    if (selected && selected.type === 'tile') {
      ctx.strokeStyle = '#fff3a1'; ctx.lineWidth = 2;
      ctx.strokeRect(selected.x * TILE + 1, selected.y * TILE + 1, TILE - 2, TILE - 2);
    }
    if (session.hoverTile && PAINT_TOOLS.includes(session.tool)) {
      ctx.strokeStyle = 'rgba(255,207,92,.85)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((session.hoverTile.x + .5) * TILE, (session.hoverTile.y + .5) * TILE, (session.brush - .5) * TILE, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (session.showFps) updateFpsBadge();
    uiAccumulator += dt;
    if (uiAccumulator >= 160) { uiAccumulator = 0; updateUI(); }
    drawMinimap(now);
  }

  // FPS readout, now a small HTML pill docked at the top of .right-dock
  // (see index.html/main.css: #fps-counter / .fps-badge) instead of a
  // canvas draw at screen (10,10) — that spot sat directly under the
  // date/stats topbar and got visually covered by it. Shows the rolling
  // 1×/sec sample from session.fpsSmoothed (see loop() in main.js) rather
  // than an instantaneous per-frame value, which would be unreadable jitter.
  export function updateFpsBadge() {
    const el = document.querySelector('#fps-counter');
    if (!el) return;
    if (!session.showFps) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const fps = Math.round(session.fpsSmoothed);
    el.textContent = `${fps} FPS`;
    el.style.color = fps >= 50 ? '#8ee89a' : fps >= 30 ? '#ffcf5c' : '#ff8a7a';
  }

  export function currentSmoothHour() {
    // state.hourFrac already holds the fractional progress accumulated by
    // completed substeps toward the next whole hour; session.simAccumulator
    // holds real time not yet consumed into a substep. Both need folding in
    // for a jitter-free continuous clock/daylight value.
    const pending = session.speed > 0 ? session.simAccumulator / MS_PER_GAME_HOUR : 0;
    return state.hour + (state.hourFrac || 0) + pending;
  }

  export function drawAtmosphere(left, right, top, bottom) {
    const daylight = clamp(Math.sin(((currentSmoothHour() - 6) / 24) * Math.PI * 2) * .5 + .5, 0, 1);
    const nightAlpha = (1 - daylight) * .48;
    if (nightAlpha > .01) {
      ctx.fillStyle = `rgba(8, 19, 52, ${nightAlpha})`;
      ctx.fillRect(left, top, right - left, bottom - top);
    }
    // Rain/wind particle strokes are pure ambience — cheap individually
    // but drawn across the whole visible area every frame, so Low quality
    // (see GRAPHICS_PRESETS) skips them and keeps just the darkness/flash
    // overlays below, which are two flat fillRects regardless of weather.
    const gfx = GRAPHICS_PRESETS[session.graphicsQuality] || GRAPHICS_PRESETS.high;
    const weatherFxOn = gfx.weatherFx ?? true;
    if ((gfx.atmosphereDetail ?? 0) >= 2) {
      const haze = ctx.createLinearGradient(left, top, right, bottom);
      haze.addColorStop(0, 'rgba(255,245,210,.045)');
      haze.addColorStop(.5, 'rgba(255,255,255,0)');
      haze.addColorStop(1, 'rgba(30,25,60,.06)');
      ctx.fillStyle = haze;
      ctx.fillRect(left, top, right - left, bottom - top);
    }
    if (state.weather === 'Rain' && weatherFxOn) {
      ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
      ctx.strokeStyle = '#b7eaff55'; ctx.lineWidth = 1;
      const offset = (state.day * 17 + state.hour * 23) % 32;
      for (let x = left - 40; x < right + 40; x += 32) {
        ctx.beginPath(); ctx.moveTo(x + offset, top); ctx.lineTo(x - 18 + offset, bottom); ctx.stroke();
      }
      ctx.restore();
    } else if (state.weather === 'Wind' && weatherFxOn) {
      // Light streaking dust/leaf motes drifting sideways — much sparser
      // than rain so it reads as breezy rather than stormy.
      ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
      const now = performance.now();
      const scrollX = (now / 14) % 60;
      ctx.strokeStyle = '#e7d9a655'; ctx.lineWidth = 1;
      for (let y = Math.floor(top / 48) * 48; y < bottom + 48; y += 48) {
        for (let x = left - 60; x < right + 60; x += 60) {
          const wx = x + scrollX, wy = y + Math.sin((x + now / 400) * .05) * 6;
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx - 14, wy + 2); ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (state.flashUntil && performance.now() < state.flashUntil) {
      const remain = clamp((state.flashUntil - performance.now()) / 180, 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${remain * .35})`;
      ctx.fillRect(left, top, right - left, bottom - top);
    }
  }

  export const ui = {
    pop: document.querySelector('#pop'), animals: document.querySelector('#animals'),
    cities: document.querySelector('#cities'), kingdoms: document.querySelector('#kingdoms'),
    date: document.querySelector('#date')
  };
  export function updateUI() {
    ui.pop.textContent = state.units.filter(u => u.type === 'human').length;
    ui.animals.textContent = state.units.filter(u => u.type === 'animal').length;
    ui.cities.textContent = state.cities.length;
    ui.kingdoms.textContent = state.kingdoms?.length || 0;
    const smoothHour = currentSmoothHour(), hh = Math.floor(smoothHour) % 24, mm = Math.floor((smoothHour % 1) * 60);
    ui.date.textContent = `Year ${state.year} • ${monthLabel(state.month || 1)} • ${state.season} • Day ${state.day} • ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${state.weather}`;
  }

  export function selectAt(sx, sy) {
    panelHistory = []; // a fresh tap on the map starts a new navigation root
    const p = screenToWorld(sx, sy), x = Math.floor(p.x / TILE), y = Math.floor(p.y / TILE);
    const unit = state.units.map(u => ({ u, distance: Math.hypot(u.x - (x + .5), u.y - (y + .5)) }))
      .filter(item => item.distance < .8).sort((a, b) => a.distance - b.distance)[0];
    const city = state.cities.map(c => ({ c, distance: Math.hypot(c.x - (x + .5), c.y - (y + .5)) }))
      .filter(item => item.distance < 1.4).sort((a, b) => a.distance - b.distance)[0];
    const kingdomOfCity = city && (session.overlay === 'kingdom' || session.overlay === 'civilization')
      ? state.kingdoms?.find(k => k.id === city.c.kingdomId) : null;
    if (kingdomOfCity && session.overlay === 'kingdom') {
      selected = { type: 'kingdom', value: kingdomOfCity }; showKingdom(kingdomOfCity);
    } else if (kingdomOfCity && session.overlay === 'civilization') {
      selected = { type: 'civilization', value: kingdomOfCity }; showCivilization(kingdomOfCity);
    } else if (city) {
      selected = { type: 'city', value: city.c }; showCity(city.c);
    } else if (unit) {
      selected = { type: 'unit', value: unit.u }; showUnit(unit.u);
    }
    else { selected = { type: 'tile', x, y }; showTile(tile(x, y), x, y); }
  }
  export function panelHTML(title, body) {
    const panel = document.querySelector('#panel');
    const backBtn = panelHistory.length ? `<button type="button" class="panel-back-btn" data-panel-back aria-label="ย้อนกลับ">←</button>` : '';
    panel.innerHTML = `<h3>${backBtn}<span>${title}</span></h3><div class="panel-body">${body}</div>`;
    showModal('panel-overlay', closePanel);
    // Re-trigger the entrance animation on every update (not just first open)
    // so switching between a unit/city/tile always feels intentional.
    panel.style.animation = 'none'; panel.offsetHeight; panel.style.animation = '';
    if (panelHistory.length) document.querySelector('[data-panel-back]').onclick = panelGoBack;
  }
  export function statBar(label, value, max = 100) {
    const pct = clamp((value / max) * 100, 0, 100);
    const display = max === 100 ? `${value.toFixed ? value.toFixed(0) : value}%` : `${value.toFixed ? value.toFixed(0) : value}/${max}`;
    return `<p class="stat-label">${label} <span class="subtle">${display}</span></p>
      <div class="stat-bar"><i style="--pct:${pct}%"></i></div>`;
  }
  export function showShip(u) {
    if (u.role === 'fishing') {
      const home = state.cities.find(c => c.id === u.homeCityId);
      const sailing = Boolean(u.shipPath && u.shipPath.length >= 2);
      panelHTML('🎣 เรือประมง', `
        <div class="section">
          <p class="kv"><span>เมืองต้นสังกัด <b>${home?.name || '?'}</b></span></p>
        </div>
        <div class="section">
          <p class="section-title">สถานะ</p>
          ${statBar('สภาพเรือ', u.hp, 100)}
        </div>
        <div class="section">
          <p>${sailing
            ? `มีท่าเรือประมงแล้ว — เรือแล่นออกไปยังแหล่งจับปลากลางทะเลจริงแล้ววนกลับมาส่งเมือง ${home?.name || ''}`
            : 'จอดหาปลาอยู่ที่ท่าเทียบเรือใกล้ชายฝั่ง และนำอาหารกลับมาส่งเมืองบ้านเกิดเป็นระยะ'}</p>
          ${!sailing ? '<p class="subtle">สร้างท่าเรือประมง (Culture Lv.27) เพื่อให้เรือแล่นออกทะเลจริงและจับปลาได้มากขึ้น</p>' : ''}
        </div>`);
      return;
    }
    const route = (state.seaTradeRoutes || []).find(r => r.id === u.routeId);
    const cityA = route && state.cities.find(c => c.id === route.cityAId);
    const cityB = route && state.cities.find(c => c.id === route.cityBId);
    const headingTo = u.pathDir === 1 ? cityB : cityA;
    if (u.role === 'transport') {
      panelHTML('🛳️ เรือขนส่งประชากร', `
        <div class="section">
          <p class="kv"><span>เส้นทาง <b>${cityA?.name || '?'} ↔ ${cityB?.name || '?'}</b></span></p>
          <p class="kv"><span>กำลังมุ่งหน้าไปยัง <b>${headingTo?.name || '?'}</b></span></p>
        </div>
        <div class="section">
          <p class="section-title">สถานะ</p>
          ${statBar('สภาพเรือ', u.hp, 100)}
        </div>
        <div class="section">
          <p>${(u.passengers || []).length ? `กำลังขนผู้อพยพ ${u.passengers.length} คน` : 'เที่ยวเปล่า — จะรับผู้อพยพจากเมืองที่แออัดในเที่ยวถัดไป'}</p>
        </div>`);
      return;
    }
    panelHTML('🚢 เรือสินค้า', `
      <div class="section">
        <p class="kv"><span>เส้นทาง <b>${cityA?.name || '?'} ↔ ${cityB?.name || '?'}</b></span></p>
        <p class="kv"><span>กำลังมุ่งหน้าไปยัง <b>${headingTo?.name || '?'}</b></span></p>
      </div>
      <div class="section">
        <p class="section-title">สถานะ</p>
        ${statBar('สภาพเรือ', u.hp, 100)}
      </div>
      <div class="section">
        <p>${u.cargo ? `กำลังขน${RESOURCE_LABEL[u.cargo.resource]} ${Math.round(u.cargo.amount)} หน่วย` : 'ระวางว่าง'}</p>
      </div>`);
  }
  export function showUnit(u) {
    if (u.type === 'ship') { showShip(u); return; }
    const speciesInfo = SPECIES[u.race] || (u.type === 'human' ? SPECIES.human
      : u.species === 'chicken' ? { icon: '🐔', label: 'Chicken' }
      : u.species === 'wolf' ? { icon: '🐺', label: 'Wolf' } : { icon: '🐾', label: 'Animal' });
    // If this unit rules something (city leader/governor, or a kingdom's
    // king), surface a way back to that page instead of a dead end.
    const governedCity = state.cities.find(c => c.leaderId === u.id);
    const ruledKingdom = state.kingdoms?.find(k => k.kingId === u.id);
    panelHTML(`${speciesInfo.icon} ${royalDisplayName(u) || speciesInfo.label}`, `
      <div class="section">
        <p class="kv"><span>Species <b>${speciesInfo.label}</b></span><span>Age <b>${u.age.toFixed(1)}</b></span>
          <span>Job <b>${u.job || 'Wanderer'}</b></span></p>
        <p class="kv"><span>Role <b>${u.royalRole || (u.governorOf ? 'Governor' : 'Citizen')}</b></span>
          <span>Settlement <b>${cityOf(u)?.name || 'ไม่มี'}</b></span></p>
      </div>
      <div class="section">
        <p class="section-title">สถานะ</p>
        ${statBar('HP', u.hp, 100)}
        ${statBar('Hunger', u.hunger, 100)}
        ${u.energy != null ? statBar('Energy', u.energy, 100) : ''}
      </div>
      <div class="section">
        <p>Activity: ${u.activity || 'Observing'}</p>
        ${u.infected ? '<p>🦠 ติดเชื้อโรคระบาด</p>' : ''}
      </div>
      ${(governedCity || ruledKingdom) ? `
      <div class="section">
        <p class="section-title">การปกครอง</p>
        ${governedCity ? `
        <div class="save-slot-row">
          <div class="save-slot-info">
            <b>${governedCity.isCapital ? capitalIcon(16) : cityIcon(16)} ${governedCity.name}</b>
            <span class="subtle">เมืองที่ปกครอง</span>
          </div>
          <div class="save-slot-btns"><button type="button" class="save-slot-btn" data-view-city>ดูเมือง</button></div>
        </div>` : ''}
        ${ruledKingdom ? `
        <div class="save-slot-row">
          <div class="save-slot-info">
            <b>${kingdomIcon(16)} ${ruledKingdom.name}</b>
            <span class="subtle">อาณาจักรที่ปกครอง</span>
          </div>
          <div class="save-slot-btns"><button type="button" class="save-slot-btn" data-view-kingdom>ดูอาณาจักร</button></div>
        </div>` : ''}
      </div>` : ''}`);
    if (governedCity) document.querySelector('[data-view-city]')?.addEventListener('click', () => {
      pushPanelHistory(showUnit, u);
      selected = { type: 'city', value: governedCity };
      showCity(governedCity);
    });
    if (ruledKingdom) document.querySelector('[data-view-kingdom]')?.addEventListener('click', () => {
      pushPanelHistory(showUnit, u);
      selected = { type: 'kingdom', value: ruledKingdom };
      showKingdom(ruledKingdom);
    });
  }
  export function showCity(c) {
    const info = cityLevel(c.pop);
    const speciesInfo = SPECIES[c.race] || SPECIES.human;
    const kingdom = state.kingdoms?.find(k => k.id === c.kingdomId);
    const leader = state.units.find(u => u.id === c.leaderId);
    const royals = kingdom ? kingdom.royalFamily.map(id => state.units.find(u => u.id === id)?.name).filter(Boolean) : [];
    const royalNote = c.isCapital
      ? (kingdom?.royalSystemReady ? `${capitalIcon(15)} เมืองหลวง — พระราชาและราชวงศ์ประจำอยู่ที่นี่`
        : c.palaceBuilt ? `${capitalIcon(15)} พระบรมมหาราชวังเสร็จแล้ว — รอระบบราชาเริ่มทำงาน` : `${civImageHTML(15)} เมืองหลวงเริ่มต้น — ต้องสร้างศาลากลาง บ้าน และพระบรมมหาราชวังตามลำดับ`)
      : leader?.governorOf === c.id ? '🛡️ เจ้าเมืองคือสมาชิกพระบรมวงศานุวงศ์'
        : leader ? '🌟 ยังไม่มีเจ้าเมืองที่ทางการแต่งตั้ง — ปกครองชั่วคราวโดยผู้นำที่ได้รับเลือก' : 'กำลังเลือกเจ้าเมือง';
    // Ships that belong to this city: fishing/patrol boats moor via
    // homeCityId, while cargo/transport ships are tied to a trade route
    // that has this city on one end.
    const cityShips = state.units.filter(u => u.type === 'ship' && u.alive && (
      u.homeCityId === c.id ||
      (u.routeId != null && state.seaTradeRoutes?.some(r => r.id === u.routeId && (r.cityAId === c.id || r.cityBId === c.id)))
    ));
    const SHIP_ROLE_LABEL = { fishing: '🎣 เรือประมง', cargo: '🚢 เรือสินค้า', transport: '🛳️ เรือขนส่งประชากร' };
    panelHTML(`${c.isCapital ? capitalIcon(18) : cityIcon(18)} ${c.name}`, `
      <div class="section">
        <p class="kv"><span>${info.label} <b>Pop ${c.pop}</b></span><span>Species <b>${speciesInfo.label}</b></span></p>
        <p class="kv"><span>บ้าน <b>${c.houses || 0}</b></span><span>ที่อยู่อาศัย <b>${c.pop}/${c.housingCapacity || 6}</b></span>
          <span>เขตเมือง <b>${(c.claimedTiles || []).length}/${cityGridTarget(c)}</b></span></p>
        <p class="kv"><span>${resourceIcon('gold', 15)} Gold <b>${(c.gold || 0).toFixed(0)}</b></span><span>${resourceIcon('food', 15)} Food <b>${c.food.toFixed(0)}/${(c.foodCapacity ?? c.food).toFixed(0)}</b></span><span>${resourceIcon('wood', 15)} Wood <b>${c.wood.toFixed(0)}/${(c.woodCapacity ?? c.wood).toFixed(0)}</b></span>
          <span>${resourceIcon('stone', 15)} Stone <b>${c.stone.toFixed(0)}/${(c.stoneCapacity ?? c.stone).toFixed(0)}</b></span></p>
        <p class="kv"><span>${resourceIcon('iron', 15)} Iron <b>${(c.iron || 0).toFixed(0)}/${(c.ironCapacity ?? c.iron ?? 0).toFixed(0)}</b></span></p>
      </div>
      <div class="section">
        <p class="section-title">สถานะเมือง</p>
        ${statBar('Prosperity', c.prosperity || 0)}
        ${statBar('Health', c.health || 0)}
        ${statBar('Happiness', c.happiness || 0)}
      </div>
      <div class="section">
        <p class="section-title">การปกครอง</p>
        <div class="save-slot-row">
          <div class="save-slot-info">
            <b>${leader ? `${leader.royalRole === 'King' ? crownIcon('gold', 16) : crownIcon('silver', 16)} ${royalDisplayName(leader)}` : 'กำลังเลือกผู้นำ'}</b>
            <span class="subtle">ผู้นำเมือง</span>
          </div>
          ${leader ? '<div class="save-slot-btns"><button type="button" class="save-slot-btn" data-view-leader>ดูผู้นำ</button></div>' : ''}
        </div>
        ${kingdom ? `
        <div class="save-slot-row">
          <div class="save-slot-info">
            <b>${kingdom.name}</b>
            <span class="subtle"><span class="city-kingdom-gold">Gold ${(kingdom.gold || 0).toFixed(0)}</span>${kingdom.wagesUnpaid ? ' ⚠️ ค่าจ้างค้างจ่าย' : ''}</span>
          </div>
          <div class="save-slot-btns">
            <button type="button" class="save-slot-btn" data-view-kingdom>ดูอาณาจักร</button>
            <button type="button" class="save-slot-btn" data-view-civ>ดูอารยธรรม</button>
          </div>
        </div>` : `<p>Kingdom: ยังไม่ก่อตั้ง</p>`}
        <p>${royalNote}</p>
        ${c.isCapital && royals.length ? `<p>Royal family: ${royals.join(', ')}</p>` : ''}
        <div class="save-slot-row">
          <div class="save-slot-info"><b>เหตุการณ์ที่เกี่ยวข้อง</b></div>
          <div class="save-slot-btns">
            <button type="button" class="save-slot-btn" data-view-history>ดูประวัติศาสตร์</button>
          </div>
        </div>
      </div>
      ${cityShips.length ? `
      <div class="section">
        <p class="section-title">เรือของเมือง (${cityShips.length})</p>
        ${cityShips.map(u => `
          <div class="save-slot-row">
            <div class="save-slot-info">
              <b>${SHIP_ROLE_LABEL[u.role] || '⛵ เรือ'}</b>
              <span class="subtle">สภาพเรือ ${Math.round(u.hp)}%${u.cargo ? ` · กำลังขน${RESOURCE_LABEL[u.cargo.resource]}` : ''}</span>
            </div>
            <div class="save-slot-btns">
              <button type="button" class="save-slot-btn" data-view-ship="${u.id}">ดู</button>
            </div>
          </div>
        `).join('')}
      </div>` : ''}`);
    if (leader) document.querySelector('[data-view-leader]')?.addEventListener('click', () => {
      pushPanelHistory(showCity, c);
      selected = { type: 'unit', value: leader };
      showUnit(leader);
    });
    if (kingdom) document.querySelector('[data-view-kingdom]')?.addEventListener('click', () => {
      pushPanelHistory(showCity, c);
      selected = { type: 'kingdom', value: kingdom };
      showKingdom(kingdom);
    });
    if (kingdom) document.querySelector('[data-view-civ]')?.addEventListener('click', () => {
      pushPanelHistory(showCity, c);
      selected = { type: 'civilization', value: kingdom };
      showCivilization(kingdom);
    });
    document.querySelector('[data-view-history]')?.addEventListener('click', () => {
      showEvents(c.name, `📜 ประวัติศาสตร์ ${c.name}`, { fn: showCity, arg: c });
    });
    document.querySelectorAll('[data-view-ship]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = state.units.find(unit => String(unit.id) === String(btn.dataset.viewShip) && unit.alive);
        if (!u) return;
        pushPanelHistory(showCity, c);
        selected = { type: 'unit', value: u };
        showShip(u);
      });
    });
  }
  export function showCivilization(kingdom) {
    const cities = state.cities.filter(c => c.kingdomId === kingdom.id);
    const capital = state.cities.find(c => c.id === kingdom.capitalCityId) || cities[0];
    const cultureLevel = capital?.cultureLevel || 1;
    const cultureLv = cultureLevelInfo(cultureLevel);
    const nextCultureLv = CULTURE_LEVELS.find(e => e.level > cultureLevel);
    const ageHours = Math.max(0, worldHour() - (kingdom.civOriginAt ?? worldHour()));
    const ageDays = Math.floor(ageHours / 24);
    const ageYears = Math.floor(ageDays / DAYS_PER_YEAR), ageDaysRem = ageDays % DAYS_PER_YEAR;
    const target = civGridTarget(kingdom, cities);
    const progress = Math.floor(capital?.cultureProgress || 0);
    const required = cultureProgressRequired(capital?.cultureLevel || 1);
    const progressPct = Math.round(clamp(required ? (progress / required) * 100 : 0, 0, 100));
    panelHTML(`${civImageHTML(28)} ${kingdom.name}`, `
      <div class="civ-hero">
        <div class="civ-hero-icon">${cultureSymbolHTML(cultureLv, 44)}</div>
        <div class="civ-hero-info">
          <div class="civ-hero-level">Lv.${cultureLevel}<span class="subtle">/${CULTURE_MAX_LEVEL}</span></div>
          <div class="civ-hero-sub">${capital ? `เมืองหลวง: ${capital.name}` : 'ยังไม่มีเมืองหลวง'}</div>
        </div>
      </div>
      <div class="civ-stats-row">
        <div class="civ-stat"><span class="civ-stat-label">อายุ</span><span class="civ-stat-value">${ageYears} ปี ${ageDaysRem} วัน</span></div>
        <div class="civ-stat"><span class="civ-stat-label">เขตอารยธรรม</span><span class="civ-stat-value">${(kingdom.civClaimedTiles || []).length}/${target}</span></div>
      </div>
      <div class="section">
        <p class="section-title">ความก้าวหน้าวัฒนธรรม</p>
        <p class="civ-progress-caption"><span>สู่ Lv.${cultureLevel + 1}</span><span>${progressPct}%</span></p>
        <div class="stat-bar"><i style="--pct:${progressPct}%"></i></div>
        <div class="civ-unlock-box current"><p><b>ปลดล็อคแล้ว</b> · ${cultureLv.unlock}</p></div>
        ${nextCultureLv
          ? `<div class="civ-unlock-box next"><p><b>เลเวลถัดไป (Lv.${nextCultureLv.level})</b> · ${nextCultureLv.unlock}</p></div>`
          : '<p class="subtle subtle--center">พัฒนาทางวัฒนธรรมถึงขั้นสูงสุดแล้ว</p>'}
      </div>
      <button type="button" class="civ-cta-btn" data-view-kingdom>${kingdomIcon(16)} ดูอาณาจักร ${kingdom.name}</button>`);
    document.querySelector('[data-view-kingdom]')?.addEventListener('click', () => {
      selected = { type: 'kingdom', value: kingdom };
      showKingdom(kingdom);
    });
  }
  export function showKingdom(kingdom) {
    const cities = state.cities.filter(c => c.kingdomId === kingdom.id);
    const capital = state.cities.find(c => c.id === kingdom.capitalCityId) || cities[0];
    const king = state.units.find(u => u.id === kingdom.kingId && u.alive);
    const capitalLeader = capital ? state.units.find(u => u.id === capital.leaderId) : null;
    const royals = (kingdom.royalFamily || []).map(id => state.units.find(x => x.id === id && x.alive)).filter(Boolean);
    const speciesInfo = SPECIES[kingdom.race] || SPECIES.human;
    const totalFood = cities.reduce((sum, c) => sum + c.food, 0);
    const totalWood = cities.reduce((sum, c) => sum + c.wood, 0);
    const totalStone = cities.reduce((sum, c) => sum + c.stone, 0);
    const totalIron = cities.reduce((sum, c) => sum + (c.iron || 0), 0);
    const totalFoodCap = cities.reduce((sum, c) => sum + (c.foodCapacity ?? c.food), 0);
    const totalWoodCap = cities.reduce((sum, c) => sum + (c.woodCapacity ?? c.wood), 0);
    const totalStoneCap = cities.reduce((sum, c) => sum + (c.stoneCapacity ?? c.stone), 0);
    const totalIronCap = cities.reduce((sum, c) => sum + (c.ironCapacity ?? c.iron ?? 0), 0);
    // Civilization identity for this kingdom — same figures shown in the
    // dedicated "เขตอารยธรรม" panel (showCivilization), surfaced here too
    // so the kingdom page doesn't require switching overlays to see them.
    const civCultureLevel = capital?.cultureLevel || 1;
    const civCultureLv = cultureLevelInfo(civCultureLevel);
    panelHTML(`${kingdomIcon(18)} ${kingdom.name}`, `
      <div class="section">
        <p class="kv"><span>Species <b>${speciesInfo.label}</b></span><span>เมือง <b>${cities.length}</b></span>
          <span>ประชากรรวม <b>${kingdom.population || 0}</b></span></p>
        <p class="kv"><span>${resourceIcon('gold', 15)} Gold <b>${(kingdom.gold || 0).toFixed(0)}</b></span><span>${resourceIcon('food', 15)} Food <b>${totalFood.toFixed(0)}/${totalFoodCap.toFixed(0)}</b></span><span>${resourceIcon('wood', 15)} Wood <b>${totalWood.toFixed(0)}/${totalWoodCap.toFixed(0)}</b></span>
          <span>${resourceIcon('stone', 15)} Stone <b>${totalStone.toFixed(0)}/${totalStoneCap.toFixed(0)}</b></span></p>
        <p class="kv"><span>${resourceIcon('iron', 15)} Iron <b>${totalIron.toFixed(0)}/${totalIronCap.toFixed(0)}</b></span></p>
      </div>
      <div class="section">
        <p class="section-title">สถานะอาณาจักร</p>
        ${statBar('Happiness', kingdom.happiness || 0)}
        ${kingdom.wagesUnpaid ? '<p class="subtle">⚠️ ค่าจ้างค้างจ่าย</p>' : ''}
      </div>
      <div class="section">
        <p class="section-title">ราชวงศ์</p>
        <p>เมืองหลวง: ${capital ? capital.name : 'ไม่มี'}</p>
        <div class="save-slot-row">
          <div class="save-slot-info">
            <b>${king ? `${crownIcon('gold', 16)} ${royalDisplayName(king)}`
              : kingdom.royalSystemReady ? `${crownIcon('gold', 16)} ระหว่างสืบราชสมบัติ`
                : capitalLeader ? `${crownIcon('gold', 16)} ${royalDisplayName(capitalLeader)}` : 'ยังไม่มีผู้นำ'}</b>
            <span class="subtle">ผู้นำ</span>
          </div>
          ${(king || capitalLeader) ? '<div class="save-slot-btns"><button type="button" class="save-slot-btn" data-view-ruler>ดูผู้นำ</button></div>' : ''}
        </div>
        ${royals.map(u => `
          <div class="save-slot-row">
            <div class="save-slot-info">
              <b>${u.royalRole === 'King' ? crownIcon('gold', 15) : '👤'} ${royalDisplayName(u)}</b>
              <span class="subtle">${u.royalRole || 'สมาชิกราชวงศ์'}</span>
            </div>
            <div class="save-slot-btns">
              <button type="button" class="save-slot-btn" data-view-royal="${u.id}">ดู</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="section">
        <p class="section-title">อารยธรรม</p>
        <div class="save-slot-row">
          <div class="save-slot-info">
            <b>${cultureSymbolHTML(civCultureLv, 16)} อารยธรรมแห่ง ${kingdom.name}</b>
            <span class="subtle">Culture Lv.${civCultureLevel}/${CULTURE_MAX_LEVEL} · ${civCultureLv.name}</span>
          </div>
          <div class="save-slot-btns">
            <button type="button" class="save-slot-btn" data-view-civ>ดูอารยธรรม</button>
          </div>
        </div>
        <div class="save-slot-row">
          <div class="save-slot-info"><b>เหตุการณ์ที่เกี่ยวข้อง</b></div>
          <div class="save-slot-btns">
            <button type="button" class="save-slot-btn" data-view-history>ดูประวัติศาสตร์</button>
          </div>
        </div>
      </div>
      <div class="section">
        <p class="section-title">เมืองในอาณาจักร</p>
        ${cities.map(c => `
          <div class="save-slot-row">
            <div class="save-slot-info">
              <b>${c.isCapital ? capitalIcon(16) : cityIcon(16)} ${c.name}</b>
              <span class="subtle">Pop ${c.pop} · เขตเมือง ${(c.claimedTiles || []).length} ไร่</span>
            </div>
            <div class="save-slot-btns">
              <button type="button" class="save-slot-btn" data-view-city="${c.id}">ดูเขตเมือง</button>
            </div>
          </div>
        `).join('') || '<p class="subtle">ไม่มีเมืองเหลืออยู่</p>'}
      </div>`);
    document.querySelector('[data-view-civ]')?.addEventListener('click', () => {
      pushPanelHistory(showKingdom, kingdom);
      selected = { type: 'civilization', value: kingdom };
      showCivilization(kingdom);
    });
    document.querySelector('[data-view-history]')?.addEventListener('click', () => {
      showEvents(kingdom.name, `📜 ประวัติศาสตร์ ${kingdom.name}`, { fn: showKingdom, arg: kingdom });
    });
    const ruler = king || capitalLeader;
    document.querySelector('[data-view-ruler]')?.addEventListener('click', () => {
      if (!ruler) return;
      pushPanelHistory(showKingdom, kingdom);
      selected = { type: 'unit', value: ruler };
      showUnit(ruler);
    });
    document.querySelectorAll('[data-view-royal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = state.units.find(unit => String(unit.id) === String(btn.dataset.viewRoyal) && unit.alive);
        if (!u) return;
        pushPanelHistory(showKingdom, kingdom);
        selected = { type: 'unit', value: u };
        showUnit(u);
      });
    });
    document.querySelectorAll('[data-view-city]').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = state.cities.find(city => String(city.id) === String(btn.dataset.viewCity));
        if (!c) return;
        pushPanelHistory(showKingdom, kingdom);
        selected = { type: 'city', value: c };
        showCity(c);
      });
    });
  }
  export function showTile(t, x, y) {
    if (!t) return;
    const idx = y * W + x;
    const climate = t.temperature == null ? '' : t.temperature > .68 ? 'ร้อน' : t.temperature < .28 ? 'หนาว' : 'อบอุ่น';
    // A tile is rarely just bare ground — houses, buildings, farmland,
    // trees, ore, and berry bushes all live on top of it. Show whatever is
    // actually there instead of always reporting generic terrain info.
    let title = 'พื้นดิน', occupantHTML = '';
    if (t.houseCityId != null) {
      const owner = state.cities.find(c => c.id === t.houseCityId);
      title = '🏠 บ้าน';
      occupantHTML = `<p>บ้านของเมือง <b>${owner?.name || '—'}</b></p>`;
    } else if (t.buildingCityId != null) {
      const owner = state.cities.find(c => c.id === t.buildingCityId);
      const found = owner && findBuildingAt(owner, idx);
      const label = found ? (BUILDING_LABELS[found.key] || found.key) : 'อาคาร';
      title = `${civImageHTML(16)} ${label}`;
      occupantHTML = `<p>${label} ของเมือง <b>${owner?.name || '—'}</b></p>`;
    } else if (t.farmCityId != null) {
      const owner = state.cities.find(c => c.id === t.farmCityId);
      title = `${resourceIcon('food', 18)} พื้นที่เกษตร`;
      occupantHTML = `<p>แปลงเกษตรของเมือง <b>${owner?.name || '—'}</b></p>`;
    } else if (t.ore) {
      const oreLabel = t.ore === 'gold' ? `${resourceIcon('gold', 15)} ทอง` : t.ore === 'iron' ? `${resourceIcon('iron', 15)} เหล็ก` : `${resourceIcon('stone', 15)} หิน`;
      title = `⛏️ แหล่งแร่`;
      occupantHTML = `<p>แร่ชนิด: ${oreLabel}</p>`;
    } else if (t.berries) {
      title = '🍓 พุ่มเบอร์รี่';
      occupantHTML = `<p>พุ่มเบอร์รี่ พร้อมให้เก็บเกี่ยว</p>`;
    } else if (t.tree || t.terrain === 'forest') {
      title = '🌲 ต้นไม้';
      occupantHTML = `<p>ต้นไม้ ตัดเพื่อเก็บไม้ได้</p>`;
    }
    panelHTML(title, `${occupantHTML}<p>Terrain: ${t.terrain} · Biome: ${t.biome || 'Plains'}</p><p>Fertility: ${(t.fertility * 100).toFixed(0)}% · Fire: ${t.fire}</p>
      ${t.volcano ? `<p>🌋 ภูเขาไฟ — จะปะทุใน ${t.eruptIn} ชั่วโมง</p>` : ''}
      <p class="subtle">พิกัด ${x}, ${y} · ความสูง ${(t.elevation * 100).toFixed(0)}% ${climate ? `· ภูมิอากาศ ${climate}` : ''}</p>`);
  }
  export function showEvents(filterText = null, title = '📜 ประวัติโลก', backTo = null) {
    if (!backTo) panelHistory = [];
    const allEvents = state.events?.length ? state.events : [];
    const events = filterText ? allEvents.filter(e => e.text.includes(filterText)) : allEvents;
    const list = events.length ? events : [{ icon: '🌍', text: filterText ? `ยังไม่มีเหตุการณ์ที่เกี่ยวกับ ${filterText}` : 'ยังไม่มีเหตุการณ์ — ลองวางสิ่งมีชีวิตเพื่อเริ่มประวัติศาสตร์' }];
    if (backTo) pushPanelHistory(backTo.fn, backTo.arg);
    panelHTML(title, list.slice(0, 14).map(e =>
      `<p><b>${e.icon}</b> ${e.text}<br><span class="subtle">Year ${e.year || 1} · ${monthLabel(e.month || 1)} · Day ${e.day || 1} · ${String(e.hour ?? 6).padStart(2, '0')}:00</span></p>`
    ).join(''));
  }
  export function closePanel() { hideModal('panel-overlay'); selected = null; panelHistory = []; }
  export function showToast(message) {
    const el = document.querySelector('#toast');
    // innerHTML, not textContent: kingdom-tier-up toasts (cities-kingdoms.js)
    // pass an inline-SVG icon string from icons.js (kingdomIcon/capitalIcon/
    // civImageHTML) baked right into the message, same as every panel/
    // dashboard string elsewhere in the codebase. textContent printed that
    // markup as literal text instead of rendering it — every other toast
    // message here is a plain emoji/string, so this is safe.
    el.innerHTML = message; el.classList.add('show');
    clearTimeout(session.toastTimer); session.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  export function useTool(sx, sy) {
    const p = screenToWorld(sx, sy), x = Math.floor(p.x / TILE), y = Math.floor(p.y / TILE);
    const t = tile(x, y);
    if (!t) return;
    if (session.tool === 'select') { selectAt(sx, sy); return; }
    if (['human', 'elf', 'dwarf', 'orc'].includes(session.tool)) spawnHuman(x, y, null, session.tool);
    else if (session.tool === 'wolf') spawnAnimal(x, y, 'wolf');
    else if (session.tool === 'chicken') spawnAnimal(x, y, 'chicken');
    else if (session.tool === 'lightning') castLightning(x, y);
    else if (session.tool === 'meteor') castMeteor(x, y);
    else if (session.tool === 'tornado') spawnTornado(x, y);
    else if (session.tool === 'volcano') igniteVolcano(x, y);
    else if (session.tool === 'plague') castPlague(x, y);
    else if (['tree', 'water', 'water_ice', 'mountain', 'mountain_snow', 'ore_stone', 'ore_iron', 'ore_gold', 'berries', 'fire', 'erase'].includes(session.tool)) {
      for (let oy = -session.brush + 1; oy < session.brush; oy++) for (let ox = -session.brush + 1; ox < session.brush; ox++) {
        if (ox * ox + oy * oy > session.brush * session.brush) continue;
        const target = tile(x + ox, y + oy);
        if (!target) continue;
        if (session.tool === 'tree') { target.terrain = 'forest'; target.tree = true; target.ore = null; target.berries = false; }
        if (session.tool === 'water') { target.terrain = 'water'; target.tree = false; target.ore = null; target.berries = false; target.fire = 0; }
        if (session.tool === 'water_ice') { target.terrain = 'iceWater'; target.tree = false; target.ore = null; target.berries = false; target.fire = 0; }
        if (session.tool === 'mountain') { target.terrain = 'mountain'; target.tree = false; target.ore = null; target.berries = false; target.fire = 0; }
        if (session.tool === 'mountain_snow') { target.terrain = 'snow'; target.tree = false; target.ore = null; target.berries = false; target.fire = 0; }
        // The old single "เสกแร่" tool always dropped stone. It's now three
        // buttons — one per ore kind — reusing the same หิน/เหล็ก/ทอง icons
        // already used for these resources in the dashboard.
        if (session.tool === 'ore_stone') { target.tree = false; target.berries = false; target.ore = 'stone'; }
        if (session.tool === 'ore_iron') { target.tree = false; target.berries = false; target.ore = 'iron'; }
        if (session.tool === 'ore_gold') { target.tree = false; target.berries = false; target.ore = 'gold'; }
        if (session.tool === 'berries') { target.tree = false; target.ore = null; target.berries = true; }
        if (session.tool === 'fire') target.fire = 14;
        if (session.tool === 'erase') { target.terrain = 'grass'; target.tree = false; target.ore = null; target.berries = false; target.fire = 0; target.volcano = false; }
      }
      session.minimapDirty = true;
    }
    if (PAINT_TOOLS.includes(session.tool)) selected = { type: 'tile', x, y };
  }

  export function setTool(next) {
    const changed = next !== session.tool;
    session.tool = next;
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === session.tool));
    if (session.tool !== 'select') closePanel();
    document.querySelector('.brush-control').classList.toggle('hidden', !PAINT_TOOLS.includes(session.tool));
    // Tool buttons only show an emoji now (no text label), so announce
    // which tool just became active via the toast instead.
    if (changed) {
      const btn = document.querySelector(`.tools [data-tool="${session.tool}"]`);
      if (btn) showToast(btn.dataset.label || session.tool);
    }
  }

  export function updateToolGroups() {
    const visibleGroup = session.activeCategory || 'normal';
    document.querySelectorAll('.tools [data-group]').forEach(b => {
      b.classList.toggle('tool-group-visible', b.dataset.group === visibleGroup);
    });
    document.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === session.activeCategory));
    const activeToolBtn = document.querySelector(`.tools [data-tool="${session.tool}"]`);
    if (activeToolBtn && activeToolBtn.dataset.group !== visibleGroup) setTool('select');
  }

  export function setCategory(next) {
    session.activeCategory = session.activeCategory === next ? null : next;
    updateToolGroups();
  }

  export function showNewWorldPanel() {
    panelHistory = [];
    const randomSeed = () => Math.floor(Math.random() * 0xFFFFFFFF);
    panelHTML(`${ctrlIcon('sparkle', 20)} สร้างโลกใหม่`, `
      <div class="section">
        <p class="section-title">Seed</p>
        <div class="newworld-row">
          <input id="nw-seed" type="number" min="0" max="4294967295" step="1" value="${state.seed || 0}">
          <button id="nw-dice" type="button" title="สุ่ม seed">🎲</button>
        </div>
        <p class="subtle">Seed เดียวกัน + ค่าด้านล่างเดียวกัน = แผนที่เดิมเป๊ะทุกครั้ง</p>
      </div>
      <div class="section">
        <p class="section-title">ระดับน้ำทะเล</p>
        <input id="nw-sea" class="newworld-slider" type="range" min="-10" max="10" step="1" value="0">
        <p class="kv"><span>แล้ง ผืนดินเยอะ</span><span>ท่วม เป็นเกาะเยอะ</span></p>
      </div>
      <div class="section">
        <p class="section-title">สภาพอากาศ</p>
        <input id="nw-temp" class="newworld-slider" type="range" min="-10" max="10" step="1" value="0">
        <p class="kv"><span>หนาว น้ำแข็งเยอะ</span><span>ร้อน ทะเลทราย/ป่าดิบเยอะ</span></p>
      </div>
      <div class="section">
        <p class="section-title">ความชื้น</p>
        <input id="nw-moist" class="newworld-slider" type="range" min="-10" max="10" step="1" value="0">
        <p class="kv"><span>แห้งแล้ง</span><span>ชุ่มชื้น ป่าเยอะ</span></p>
      </div>
      <div class="section newworld-actions">
        <button id="nw-random-all" type="button">🎲 สุ่มทั้งหมด</button>
        <button id="nw-create" type="button" class="danger">${ctrlIcon('sparkle', 15)} สร้างโลกนี้</button>
      </div>`);
    const seedInput = document.querySelector('#nw-seed');
    const sliders = { sea: document.querySelector('#nw-sea'), temp: document.querySelector('#nw-temp'), moist: document.querySelector('#nw-moist') };
    document.querySelector('#nw-dice').onclick = () => { seedInput.value = randomSeed(); };
    document.querySelector('#nw-random-all').onclick = () => {
      seedInput.value = randomSeed();
      for (const key in sliders) sliders[key].value = Math.floor(Math.random() * 21) - 10;
    };
    document.querySelector('#nw-create').onclick = () => {
      if (!confirm('สร้างโลกใหม่? โลกที่ยังไม่ได้บันทึกจะหายไป')) return;
      const seed = Number(seedInput.value) || 0;
      makeWorld(seed, {
        seaLevel: Number(sliders.sea.value) / 10,
        temperature: Number(sliders.temp.value) / 10,
        moisture: Number(sliders.moist.value) / 10,
      });
      closePanel();
    };
  }
  // Unified settings panel: game speed (including the 100× "supersonic"
  // option), day length, and graphics quality all live here together —
  // graphics used to have its own separate toolbar button/panel, and speed
  // was only reachable via the quick bottom-toolbar buttons (which top out
  // at 10×); both are now reached through this one ⚙ entry point.
  export function showSettingsPanel() {
    panelHistory = [];
    const speedOptions = [
      { v: 0, label: `${ctrlIcon('pause', 15)} หยุด` }, { v: 1, label: '1×' }, { v: 2, label: '2×' },
      { v: 5, label: '5×' }, { v: 10, label: '10×' }, { v: 50, label: `${ctrlIcon('bolt', 15)} 50×` }, { v: 100, label: `${ctrlIcon('rocket', 15)} ซูเปอร์โซนิก 100×` },
    ];
    const speedButtons = speedOptions.map(o =>
      `<button data-settings-speed="${o.v}" class="${session.speed === o.v ? 'active' : ''}" type="button">${o.label}</button>`).join('');
    // Same wrapping button-row styling as the "กำหนดเอง" rows below (see
    // .gfx-row-buttons in main.css) so this reads as one family of
    // controls, though this row stands alone rather than sitting under a
    // shared label column. The first button, "กำหนดเอง", re-activates
    // whichever custom mix is already stored (see setGraphicsCustomField),
    // same as clicking any other preset button here just with a mixed
    // bundle instead of a single tier's.
    const presetKeys = PRESET_ORDER;
    const gqOptions = `<button data-gq="custom" class="${session.graphicsQuality === 'custom' ? 'active' : ''}" type="button">กำหนดเอง</button>` +
      presetKeys.map(key =>
        `<button data-gq="${key}" class="${session.graphicsQuality === key ? 'active' : ''}" type="button">${GRAPHICS_PRESETS[key].label}</button>`).join('');
    // "กำหนดเอง" (custom): same underlying fields as the presets above, but
    // adjustable one at a time. Picking a whole preset above re-syncs every
    // row here to match it (see refreshGraphicsRows); touching a row here
    // switches quality to 'custom' instead, mixing values from different
    // presets as the player likes.
    //
    // Each row is its own heading + wrapping button group (see
    // .gfx-row / .gfx-row-label / .gfx-row-buttons in main.css) stacked
    // one under another, so a row's options simply wrap onto a second
    // line on narrow screens instead of running off the edge — no more
    // fixed-column grid that needed horizontal scrolling to reach the
    // last option.
    const curGfx = GRAPHICS_PRESETS[session.graphicsQuality] || GRAPHICS_PRESETS.high;
    const dprOptions = [{ v: .75, label: 'ประหยัดสุด' }, { v: 1, label: 'ต่ำ' }, { v: 1.5, label: 'กลาง' }, { v: 2, label: 'สูง' }, { v: 2.5, label: 'สูงสุด' }, { v: 3, label: 'เรือธง' }];
    const onOff = (name, curValue) => [false, true].map(v => ({ attr: `data-custom-${name}="${v}"`, active: curValue === v, text: v ? 'เปิด' : 'ปิด' }));
    const gfxRows = [
      { label: 'ความละเอียดจอ', buttons: dprOptions.map(o => ({ attr: `data-custom-dpr="${o.v}"`, active: curGfx.dprCap === o.v, text: o.label })) },
      {
        label: 'รายละเอียดตอนซูมออก', buttons: presetKeys.map(key => {
          const p = GRAPHICS_PRESETS[key];
          return { attr: `data-custom-lod="${key}" data-custom-preset="${key}"`, active: curGfx.lodFullZoom === p.lodFullZoom && curGfx.lodBlockZoom === p.lodBlockZoom, text: p.label };
        })
      },
      { label: 'เอฟเฟกต์ฝน/ลม', buttons: onOff('weather', curGfx.weatherFx) },
      { label: 'คลื่นน้ำ', buttons: onOff('water', curGfx.waterAnim) },
      {
        label: 'ความถี่คำนวณเขตแดนแผนที่ย่อ', buttons: presetKeys.map(key => {
          const p = GRAPHICS_PRESETS[key];
          return { attr: `data-custom-minimap="${p.minimapOverlayMs}" data-custom-preset="${key}"`, active: curGfx.minimapOverlayMs === p.minimapOverlayMs, text: p.label };
        })
      },
      {
        label: 'พื้นผิวดิน (ลายหิน/ทราย)', buttons: presetKeys.map(key => {
          const p = GRAPHICS_PRESETS[key];
          return { attr: `data-custom-terrain="${p.terrainDetail}" data-custom-preset="${key}"`, active: curGfx.terrainDetail === p.terrainDetail, text: p.label };
        })
      },
      {
        label: 'รายละเอียดผิวน้ำ', buttons: presetKeys.map(key => {
          const p = GRAPHICS_PRESETS[key];
          return { attr: `data-custom-waterdetail="${p.waterDetail}" data-custom-preset="${key}"`, active: curGfx.waterDetail === p.waterDetail, text: p.label };
        })
      },
      {
        label: 'หมอก/บรรยากาศ', buttons: presetKeys.map(key => {
          const p = GRAPHICS_PRESETS[key];
          return { attr: `data-custom-atmosphere="${p.atmosphereDetail}" data-custom-preset="${key}"`, active: curGfx.atmosphereDetail === p.atmosphereDetail, text: p.label };
        })
      },
      {
        label: 'เงาตัวละคร/สิ่งปลูกสร้าง', buttons: presetKeys.map(key => {
          const p = GRAPHICS_PRESETS[key];
          return { attr: `data-custom-entityshadow="${p.entityShadows}" data-custom-preset="${key}"`, active: curGfx.entityShadows === p.entityShadows, text: p.label };
        })
      },
    ];
    const fpsOptions = FPS_CAP_OPTIONS.map(v =>
      `<button data-fps-cap="${v}" class="${session.fpsCap === v ? 'active' : ''}" type="button">${v === 0 ? 'ไม่จำกัด' : v + ' FPS'}</button>`).join('');
    const gfxGridHtml = gfxRows.map(row => {
      const btns = row.buttons.map(b =>
        `<button ${b.attr} class="${b.active ? 'active' : ''}" type="button">${b.text}</button>`).join('');
      return `<div class="gfx-row">
        <span class="gfx-row-label">${row.label}</span>
        <div class="gfx-row-buttons">${btns}</div>
      </div>`;
    }).join('');
    panelHTML(`${ctrlIcon('gear', 20)} ตั้งค่า`, `
      <div class="section">
        <p class="section-title">ความเร็วเกม</p>
        <div class="newworld-actions" id="settings-speed-buttons">${speedButtons}</div>
        <p class="subtle">ซูเปอร์โซนิก 100× ใช้ข้ามช่วงเวลาที่ไม่มีอะไรเกิดขึ้นได้เร็วมาก แต่อาจกระตุกบนเครื่องที่ไม่แรงพอ</p>
      </div>
      <div class="section">
        <p class="section-title">1 วันในเกม = กี่นาทีจริง</p>
        <div class="newworld-row">
          <input id="ts-day-minutes" class="flex-1" type="range" min="${MIN_DAY_LENGTH_MINUTES}" max="${MAX_DAY_LENGTH_MINUTES}" step="1" value="${state.dayLengthMinutes ?? 2}">
          <b id="ts-day-minutes-value">${state.dayLengthMinutes ?? 2} นาที</b>
        </div>
        <p class="subtle">ปรับได้ตลอดเวลา มีผลทันทีโดยไม่รีเซ็ตเวลาปัจจุบัน (นาทีจริงต่อวัน ที่ความเร็ว 1×)</p>
      </div>
      <div class="section">
        <p class="section-title">คุณภาพกราฟิก</p>
        <p class="subtle">ตั้งแต่ประหยัดสุด (เครื่องล่างมากๆ) ถึงเรือธง</p>
        <div class="gfx-row-buttons" id="gq-buttons">${gqOptions}</div>
      </div>
      <div class="section">
        <p class="section-title">กำหนดเอง</p>
        <p class="subtle">ปรับแยกทีละอย่างได้ตามใจ — เลือกพรีเซ็ตด้านบนจะซิงก์ค่าพวกนี้ให้อัตโนมัติ มีผลทันที ไม่ต้องรีสตาร์ทเกม</p>
        <div class="gfx-custom-grid" id="cg-grid">${gfxGridHtml}</div>
      </div>
      <div class="section">
        <p class="section-title">จำกัด FPS</p>
        <div class="newworld-actions" id="fps-cap-buttons">${fpsOptions}</div>
        <p class="subtle">จำกัดเฟรมต่อวินาทีเพื่อประหยัดแบตเตอรี่/ลดความร้อนบนเครื่องมือถือ ไม่มีผลต่อความเร็วเกม</p>
        <div class="settings-toggle-row">
          <button id="fps-show-toggle" class="settings-toggle-btn ${session.showFps ? 'active' : ''}" type="button">${session.showFps ? 'ซ่อนตัวนับ FPS' : 'แสดงตัวนับ FPS'}</button>
          <button id="auto-quality-toggle" class="settings-toggle-btn ${session.autoQualityEnabled ? 'active' : ''}" type="button">${session.autoQualityEnabled ? 'ปิดปรับกราฟิกอัตโนมัติ' : 'เปิดปรับกราฟิกอัตโนมัติเมื่อเฟรมตก'}</button>
        </div>
      </div>`);
    document.querySelectorAll('#settings-speed-buttons [data-settings-speed]').forEach(btn => btn.onclick = () => {
      const next = Number(btn.dataset.settingsSpeed);
      session.speed = next;
      // Keep the bottom-toolbar quick-speed buttons (0/1/2/5/10×) in sync —
      // none of them will show active when 100× is picked here, which is
      // correct since that option only exists in this panel.
      document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('active', Number(x.dataset.speed) === next));
      document.querySelectorAll('#settings-speed-buttons [data-settings-speed]').forEach(b => b.classList.toggle('active', Number(b.dataset.settingsSpeed) === next));
      document.querySelector('#paused-banner')?.classList.toggle('hidden', next !== 0);
      showToast(next === 0 ? 'หยุดเวลา' : `ความเร็ว ${next}×`);
    });
    const slider = document.querySelector('#ts-day-minutes');
    const valueLabel = document.querySelector('#ts-day-minutes-value');
    slider.oninput = () => {
      const applied = setDayLengthMinutes(Number(slider.value));
      valueLabel.textContent = `${applied} นาที`;
    };
    // Re-highlights every button in every graphics row (preset row + all
    // "กำหนดเอง" rows) from whatever bundle is currently active — this is
    // what makes picking a preset "automatically" set the custom controls
    // to match, and what makes touching one custom row deactivate the now-
    // stale preset button.
    const refreshGraphicsRows = () => {
      const curKey = session.graphicsQuality;
      const cur = GRAPHICS_PRESETS[curKey] || GRAPHICS_PRESETS.high;

      // IMPORTANT: one setting row = one active choice. Several presets share
      // the same underlying value (for example potato/minimum/low all use
      // terrainDetail: 0), but the UI must never highlight all matching
      // labels at once. For a normal preset, the active button is therefore
      // the selected preset itself. For custom mode, only the first matching
      // option is highlighted so the row can never show multiple selections.
      document.querySelectorAll('#gq-buttons [data-gq]').forEach(b =>
        b.classList.toggle('active', b.dataset.gq === curKey));

      const markOne = (selector, matches) => {
        const buttons = [...document.querySelectorAll(selector)];
        let marked = false;
        buttons.forEach(b => {
          const hit = !marked && matches(b);
          b.classList.toggle('active', hit);
          if (hit) marked = true;
        });
      };

      // When a named preset is selected, keep every custom row visually
      // synced to that same preset only. This prevents duplicate highlights
      // when multiple presets happen to share a value.
      if (curKey !== 'custom') {
        markOne('#cg-grid [data-custom-dpr]', b => b.dataset.customDpr === String(cur.dprCap));
        markOne('#cg-grid [data-custom-lod]', b => b.dataset.customLod === curKey);
        markOne('#cg-grid [data-custom-minimap]', b => b.dataset.customPreset === curKey);
        markOne('#cg-grid [data-custom-weather]', b => (b.dataset.customWeather === 'true') === cur.weatherFx);
        markOne('#cg-grid [data-custom-water]', b => (b.dataset.customWater === 'true') === cur.waterAnim);
        markOne('#cg-grid [data-custom-terrain]', b => b.dataset.customPreset === curKey);
        markOne('#cg-grid [data-custom-waterdetail]', b => b.dataset.customPreset === curKey);
        markOne('#cg-grid [data-custom-atmosphere]', b => b.dataset.customPreset === curKey);
        markOne('#cg-grid [data-custom-entityshadow]', b => b.dataset.customPreset === curKey);
      } else {
        // Custom mode: values are authoritative, but only the first matching
        // label may be highlighted. The actual preset remains "กำหนดเอง".
        markOne('#cg-grid [data-custom-dpr]', b => Number(b.dataset.customDpr) === cur.dprCap);
        markOne('#cg-grid [data-custom-lod]', b => {
          const p = GRAPHICS_PRESETS[b.dataset.customLod];
          return cur.lodFullZoom === p.lodFullZoom && cur.lodBlockZoom === p.lodBlockZoom;
        });
        markOne('#cg-grid [data-custom-minimap]', b => Number(b.dataset.customMinimap) === cur.minimapOverlayMs);
        markOne('#cg-grid [data-custom-weather]', b => (b.dataset.customWeather === 'true') === cur.weatherFx);
        markOne('#cg-grid [data-custom-water]', b => (b.dataset.customWater === 'true') === cur.waterAnim);
        markOne('#cg-grid [data-custom-terrain]', b => Number(b.dataset.customTerrain) === cur.terrainDetail);
        markOne('#cg-grid [data-custom-waterdetail]', b => Number(b.dataset.customWaterdetail) === cur.waterDetail);
        markOne('#cg-grid [data-custom-atmosphere]', b => Number(b.dataset.customAtmosphere) === cur.atmosphereDetail);
        markOne('#cg-grid [data-custom-entityshadow]', b => Number(b.dataset.customEntityshadow) === cur.entityShadows);
      }
    };
    // The HTML above is built by comparing raw values per button (e.g.
    // terrainDetail === 0), and several presets share the same underlying
    // value — so on first render, before any click fires, multiple labels
    // in a row can end up highlighted at once. Run the same "one row = one
    // active button" logic used by the click handlers right away so the
    // panel opens correctly highlighted too.
    refreshGraphicsRows();
    document.querySelectorAll('#gq-buttons [data-gq]').forEach(btn => btn.onclick = () => {
      const applied = setGraphicsQuality(btn.dataset.gq);
      resize(); // re-applies the DPR cap to the canvas immediately
      refreshGraphicsRows();
      showToast(`คุณภาพกราฟิก: ${GRAPHICS_PRESETS[applied].label}`);
    });
    document.querySelectorAll('#cg-grid [data-custom-dpr]').forEach(btn => btn.onclick = () => {
      setGraphicsCustomField({ dprCap: Number(btn.dataset.customDpr) });
      resize();
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#cg-grid [data-custom-lod]').forEach(btn => btn.onclick = () => {
      const p = GRAPHICS_PRESETS[btn.dataset.customLod];
      setGraphicsCustomField({ lodFullZoom: p.lodFullZoom, lodBlockZoom: p.lodBlockZoom });
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#cg-grid [data-custom-minimap]').forEach(btn => btn.onclick = () => {
      setGraphicsCustomField({ minimapOverlayMs: Number(btn.dataset.customMinimap) });
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#cg-grid [data-custom-weather]').forEach(btn => btn.onclick = () => {
      setGraphicsCustomField({ weatherFx: btn.dataset.customWeather === 'true' });
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#cg-grid [data-custom-water]').forEach(btn => btn.onclick = () => {
      setGraphicsCustomField({ waterAnim: btn.dataset.customWater === 'true' });
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#cg-grid [data-custom-terrain]').forEach(btn => btn.onclick = () => {
      setGraphicsCustomField({ terrainDetail: Number(btn.dataset.customTerrain) });
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#cg-grid [data-custom-waterdetail]').forEach(btn => btn.onclick = () => {
      setGraphicsCustomField({ waterDetail: Number(btn.dataset.customWaterdetail) });
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#cg-grid [data-custom-atmosphere]').forEach(btn => btn.onclick = () => {
      setGraphicsCustomField({ atmosphereDetail: Number(btn.dataset.customAtmosphere) });
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#cg-grid [data-custom-entityshadow]').forEach(btn => btn.onclick = () => {
      setGraphicsCustomField({ entityShadows: Number(btn.dataset.customEntityshadow) });
      refreshGraphicsRows();
      showToast('คุณภาพกราฟิก: กำหนดเอง');
    });
    document.querySelectorAll('#fps-cap-buttons [data-fps-cap]').forEach(btn => btn.onclick = () => {
      const applied = setFpsCap(Number(btn.dataset.fpsCap));
      document.querySelectorAll('#fps-cap-buttons [data-fps-cap]').forEach(b => b.classList.toggle('active', Number(b.dataset.fpsCap) === applied));
      showToast(applied === 0 ? 'FPS: ไม่จำกัด' : `จำกัด FPS: ${applied}`);
    });
    const fpsShowBtn = document.querySelector('#fps-show-toggle');
    fpsShowBtn.onclick = () => {
      const on = setShowFps(!session.showFps);
      fpsShowBtn.classList.toggle('active', on);
      fpsShowBtn.textContent = on ? 'ซ่อนตัวนับ FPS' : 'แสดงตัวนับ FPS';
      showToast(on ? 'แสดงตัวนับ FPS' : 'ซ่อนตัวนับ FPS');
      updateFpsBadge();
    };
    const autoQualityBtn = document.querySelector('#auto-quality-toggle');
    autoQualityBtn.onclick = () => {
      const on = setAutoQuality(!session.autoQualityEnabled);
      autoQualityBtn.classList.toggle('active', on);
      autoQualityBtn.textContent = on ? 'ปิดปรับกราฟิกอัตโนมัติ' : 'เปิดปรับกราฟิกอัตโนมัติเมื่อเฟรมตก';
      showToast(on ? 'เปิดปรับกราฟิกอัตโนมัติเมื่อเฟรมตก' : 'ปิดปรับกราฟิกอัตโนมัติ');
    };
  }
  function formatSavedAt(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  // Reads the 6-slot save index, creating it on first use. If an old
  // single-slot save exists from before this system, it's migrated into
  // slot 1 once so nobody loses their save.
  export function getSaveIndex() {
    let index;
    try { index = JSON.parse(localStorage.getItem(SAVE_SLOTS_INDEX_KEY) || 'null'); } catch (_) { index = null; }
    if (!Array.isArray(index) || index.length !== SAVE_SLOT_COUNT) {
      index = new Array(SAVE_SLOT_COUNT).fill(null);
      const legacyRaw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('world-sim-save-v4') || localStorage.getItem('world-sim-save-v3');
      if (legacyRaw) {
        try {
          const legacy = JSON.parse(legacyRaw);
          localStorage.setItem(saveSlotKey(0), legacyRaw);
          index[0] = { name: 'เซฟเดิม', savedAt: Date.now(), year: legacy.year, month: legacy.month || 1, day: legacy.day, season: legacy.season, dayLengthMinutes: legacy.dayLengthMinutes ?? 10 };
        } catch (_) { /* corrupt legacy save — skip migration */ }
      }
      localStorage.setItem(SAVE_SLOTS_INDEX_KEY, JSON.stringify(index));
    }
    return index;
  }
  export function saveToSlot(slotIndex, name) {
    try {
      localStorage.setItem(saveSlotKey(slotIndex), JSON.stringify(state));
      const index = getSaveIndex();
      index[slotIndex] = { name: name || `เซฟ ${slotIndex + 1}`, savedAt: Date.now(), year: state.year, month: state.month || 1, day: state.day, season: state.season, dayLengthMinutes: state.dayLengthMinutes };
      localStorage.setItem(SAVE_SLOTS_INDEX_KEY, JSON.stringify(index));
      logEvent(`ผู้สร้างโลกบันทึกลงช่อง ${slotIndex + 1}: ${index[slotIndex].name}`, '💾');
      showToast('บันทึกโลกเรียบร้อยแล้ว');
      closePanel();
    } catch (_) {
      showToast('บันทึกไม่ได้: พื้นที่จัดเก็บของเบราว์เซอร์เต็ม');
    }
  }
  export function deleteSlot(slotIndex) {
    const index = getSaveIndex();
    if (!index[slotIndex]) return;
    if (!confirm(`ลบเซฟช่อง ${slotIndex + 1} "${index[slotIndex].name}"? ลบแล้วกู้คืนไม่ได้`)) return;
    localStorage.removeItem(saveSlotKey(slotIndex));
    index[slotIndex] = null;
    localStorage.setItem(SAVE_SLOTS_INDEX_KEY, JSON.stringify(index));
    showToast('ลบเซฟแล้ว');
  }
  function saveSlotRowHTML(slot, i, actionLabel, actionAttr) {
    return `
      <div class="save-slot-row">
        <div class="save-slot-info">
          <b>ช่อง ${i + 1}</b>
          ${slot ? `<span class="subtle">${slot.name} · ${formatSavedAt(slot.savedAt)} · ปี${slot.year} เดือน${slot.month || 1} วัน${slot.day} ${slot.season || ''}</span>` : '<span class="subtle">ว่าง</span>'}
        </div>
        <div class="save-slot-btns">
          ${(slot || actionAttr === 'slot-save') ? `<button type="button" class="save-slot-btn" data-${actionAttr}="${i}">${actionLabel}</button>` : ''}
          ${slot ? `<button type="button" class="save-slot-btn danger" data-slot-delete="${i}">ลบ</button>` : ''}
        </div>
      </div>`;
  }
  export function showSavePanel() {
    panelHistory = [];
    const index = getSaveIndex();
    const defaultName = `ปี ${state.year} เดือน ${state.month || 1} วัน ${state.day} ${state.season}`;
    const rows = index.map((slot, i) => saveSlotRowHTML(slot, i, slot ? 'บันทึกทับ' : 'บันทึก', 'slot-save')).join('');
    panelHTML(`${ctrlIcon('save', 20)} บันทึกโลก`, `
      <div class="section">
        <p class="section-title">ชื่อเซฟ</p>
        <input id="save-name-input" type="text" value="${defaultName}" maxlength="40">
      </div>
      <div class="section">
        <p class="section-title">เลือกช่องบันทึก (6 ช่อง)</p>
        ${rows}
      </div>`);
    document.querySelectorAll('[data-slot-save]').forEach(btn => {
      btn.onclick = () => {
        const slotIndex = Number(btn.dataset.slotSave);
        const occupied = index[slotIndex] != null;
        if (occupied && !confirm(`ช่อง ${slotIndex + 1} มีเซฟ "${index[slotIndex].name}" อยู่แล้ว บันทึกทับเลยไหม?`)) return;
        const name = document.querySelector('#save-name-input').value.trim() || defaultName;
        saveToSlot(slotIndex, name);
      };
    });
    document.querySelectorAll('[data-slot-delete]').forEach(btn => {
      btn.onclick = () => {
        deleteSlot(Number(btn.dataset.slotDelete));
        showSavePanel(); // refresh the list in place
      };
    });
  }
  export function showLoadPanel() {
    panelHistory = [];
    const index = getSaveIndex();
    const rows = index.map((slot, i) => saveSlotRowHTML(slot, i, 'โหลด', 'slot-load')).join('');
    panelHTML(`${ctrlIcon('load', 20)} โหลดโลก`, `<div class="section">${rows}</div>`);
    document.querySelectorAll('[data-slot-load]').forEach(btn => {
      btn.onclick = () => {
        const slotIndex = Number(btn.dataset.slotLoad);
        if (!confirm('โหลดโลกนี้? โลกปัจจุบันที่ยังไม่ได้บันทึกจะหายไป')) return;
        loadFromSlot(slotIndex);
      };
    });
    document.querySelectorAll('[data-slot-delete]').forEach(btn => {
      btn.onclick = () => {
        deleteSlot(Number(btn.dataset.slotDelete));
        showLoadPanel(); // refresh the list in place
      };
    });
  }
  export function loadFromSlot(slotIndex) {
    const raw = localStorage.getItem(saveSlotKey(slotIndex));
    if (!raw) { showToast('ช่องนี้ยังไม่มีเซฟ'); return; }
    applyLoadedRaw(raw);
  }
  function applyLoadedRaw(raw) {
    try {
      const saved = JSON.parse(raw);
      Object.assign(state, saved);
      if (!Array.isArray(state.tiles) || state.tiles.length !== W * H) throw new Error('invalid world');
      state.events ||= [];
      state.kingdoms ||= [];
      state.disasters ||= [];
      state.fx ||= [];
      state.seaTradeRoutes ||= [];
      for (const route of state.seaTradeRoutes) {
        if (route.path?.length >= 2 && !state.units.some(u => u.id === route.shipId && u.type === 'ship')) {
          spawnCargoShip(route);
        }
      }
      state.territoryGridHour = -1;
      session.claimReservations = new Map();
      state.nextWorldEventAt ??= worldHour() + 24;
      state.hour ??= 6; state.month ??= 1; state.weather ||= 'Clear'; state.version = 7; state.simTicks ??= 0;
      setDayLengthMinutes(state.dayLengthMinutes ?? 10);
      for (const t of state.tiles) {
        t.fire ||= 0; t.tree ||= t.terrain === 'forest'; t.ore ??= null; t.berries ??= false; t.fertility ||= .6;
        t.biome ||= t.terrain === 'forest' ? 'Forest' : t.terrain === 'water' ? 'Ocean' : 'Plains';
        t.volcano ||= false; t.lavaAge ||= 0;
        t.temperature ??= clamp(1 - Math.abs(t.y / (H - 1) - .5) * 2, 0, 1);
      }
      for (const u of state.units) {
        if (u.type === 'ship') continue; // ships predate this migration path entirely on old saves; nothing here applies to them
        u.race ||= 'human'; u.traits ||= { strength: 50, intelligence: 50 };
        u.activity ||= 'Observing'; u.governorOf ??= null; u.royalRole ??= null; u.homeCapitalId ??= null;
        u.infected ??= false; u.infectedTimer ??= 0;
        if (u.type === 'animal') u.species ??= null;
        u.huntProgress ??= 0;
        u.everHadCity ??= u.city != null;
      }
      for (const c of state.cities) {
        c.race ||= 'human'; c.houses ??= 0;
        c.prosperity ||= 50;
        c.buildProgress ||= 0; c.nextExpansionAt ||= 0; c.kingdomId ??= null; c.isCapital ||= false;
        c.splitStage ??= 0;
        c.parentCityId ??= null;
        c.buildings ||= { market: 0, granary: 0, workshop: 0, barracks: 0, tavern: 0, temple: 0, school: 0, library: 0, port: 0, townCenter: 0, plaza: 0, fort: 0, fishingDock: 0 };
        for (const building of ['market', 'granary', 'workshop', 'barracks', 'tavern', 'temple', 'school', 'library', 'port', 'townCenter', 'plaza', 'fort', 'fishingDock']) c.buildings[building] ||= 0;
        c.project ??= null; c.projectProgress ||= 0; c.health ||= 80;
        if (c.cultureLevel == null) {
          const flat = c.culture || 0;
          c.cultureLevel = clamp(Math.floor(flat / 100) + 1, 1, CULTURE_MAX_LEVEL);
          c.cultureProgress = clamp(flat - (c.cultureLevel - 1) * 100, 0, 99);
        }
        c.culture ||= 0;
        c.townHallBuilt ??= Boolean(c.houses > 0);
        c.palaceBuilt ??= false; c.farmAreas ??= 0; c.farmTiles ||= []; c.farmCenters ||= [];
        for (const idx of c.farmTiles) if (state.tiles[idx]) state.tiles[idx].farmCityId = c.id;
        c.claimedTiles ||= [clamp(Math.floor(c.y), 0, H - 1) * W + clamp(Math.floor(c.x), 0, W - 1)];
        recomputeCityBBox(c);
        c.claimerUnitIds ||= []; c.lastClaimedAt ??= -9999;
        c.lastClaimedX ??= null; c.lastClaimedY ??= null; c.claimingBlockedUntil ??= 0;
        c.emptyHours ??= 0;
      }
      if (!state.kingdoms.length && !state.cities.some(c => c.isCapital)) {
        const firstCity = state.cities[0];
        if (firstCity) firstCity.isCapital = true;
      }
      for (const k of state.kingdoms) {
        k.color ||= assignKingdomColor(k);
        k.cities ||= []; k.royalFamily ||= []; k.capitalCityId ??= k.cities[0] || null;
        k.kingId ??= k.royalFamily[0] || null;
        k.royalExpansionSent ??= false;
        k.royalSystemReady = Boolean(k.royalSystemReady && k.kingId);
        k.gold ||= 100;
        const kingdomCities = state.cities.filter(c => c.kingdomId === k.id);
        const capital = state.cities.find(c => c.id === k.capitalCityId) || kingdomCities[0];
        if (capital && !k.kingId && capital.pop >= 50 && capital.palaceBuilt) {
          capital.isCapital = true; capital.kingdomId = k.id; k.capitalCityId = capital.id;
          appointRoyalFamily(k, capital);
          k.royalSystemReady = Boolean(k.kingId);
        }
        if (!k.civClaimedTiles) {
          const merged = new Set();
          for (const c of kingdomCities) for (const idx of (c.civClaimedTiles || [])) merged.add(idx);
          if (merged.size) {
            k.civClaimedTiles = [...merged];
            k.civOriginAt = Math.min(...kingdomCities.map(c => c.civOriginAt ?? worldHour()));
          } else if (capital) {
            k.civClaimedTiles = initialCivFloodClaim(capital.x, capital.y, Math.max(2, Math.floor((capital.claimedTiles?.length || 4) / 3)));
            k.civOriginAt = worldHour();
          } else {
            k.civClaimedTiles = []; k.civOriginAt = worldHour();
          }
        }
        k.nextCivGrowAt ??= 0;
        // Legacy per-city fields are meaningless now that territory lives
        // on the kingdom — clear them so they don't linger as stale data.
        for (const c of kingdomCities) {
          delete c.civClaimedTiles; delete c.civOriginAt; delete c.nextCivGrowAt;
          delete c.civLastClaimedAt; delete c.civLastClaimedX; delete c.civLastClaimedY;
        }
      }
      updateSettlements(); rebuildTerritoryGrid(); rebuildCivGrid(); state.territoryGridHour = worldHour();
      session.minimapDirty = true;
      closePanel(); clampCamera(); showToast('โหลดโลกเรียบร้อยแล้ว');
    } catch (_) { showToast('ไฟล์บันทึกเสียหาย จึงโหลดไม่ได้'); }
  }

  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
    const clicked = b.dataset.tool;
    if (clicked === session.tool && clicked !== 'select') {
      // Tapping the tool that's already active cancels it back to Select.
      setTool('select');
    } else {
      setTool(clicked);
    }
  }));
  document.querySelector('#save').onclick = showSavePanel;
  document.querySelector('#load').onclick = showLoadPanel;
  document.querySelector('#events').onclick = () => showEvents();
