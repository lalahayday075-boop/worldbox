// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// Bootstrap: wires up all DOM event listeners (tools, camera, speed, minimap, keyboard) and starts the game loop.
// Part of the World Simulator script split (see index.html for load order).
'use strict';

import { GRAPHICS_PRESETS, H, MAX_ZOOM, MIN_ZOOM, MAX_SUBSTEPS_PER_FRAME, MS_PER_GAME_SUBSTEP, PAINT_TOOLS, PRESET_ORDER, TILE, W, canvas, clamp, gameTimeDelta, loadAutoQuality, loadFpsSettings, loadGraphicsQuality, setGraphicsQuality, session, setGameTimeScale, GAME_TIME_SCALES, state } from './state.js';
import { simulationStep, syncSimIndexes } from './ai-simulation.js';
import { closeDashboard, openWorldDashboard } from './dashboard.js';
import { clampCamera, screenToWorld } from './disasters-terrain-render.js';
import { advanceUnits } from './territory-units.js';
import { closePanel, draw, selectAt, setCategory, setTool, showNewWorldPanel, showSettingsPanel, showToast, updateToolGroups, useTool } from './ui.js';
import { makeWorld, resize } from './world.js';

  document.querySelectorAll('[data-overlay]').forEach(button => button.addEventListener('click', () => {
    session.overlay = button.dataset.overlay;
    document.querySelectorAll('[data-overlay]').forEach(item => item.classList.toggle('active', item.dataset.overlay === session.overlay));
    showToast(session.overlay === 'city' ? 'กำลังแสดงเขตเมือง' : session.overlay === 'kingdom' ? 'กำลังแสดงเขตอาณาจักร' : 'ซ่อนซ้อน');
  }));
  document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    setCategory(button.dataset.category);
  }));
  updateToolGroups();
  setTool(session.tool);
  document.querySelector('#brush').oninput = e => {
    session.brush = Number(e.target.value);
    document.querySelector('#brush-value').textContent = session.brush;
  };
  document.querySelector('#new-world').onclick = () => showNewWorldPanel();
  document.querySelector('#settings-btn').onclick = () => showSettingsPanel();
  document.querySelector('#dashboard-open').onclick = () => openWorldDashboard();

  // Shared zoom step: zoom by `factor` while keeping the given screen
  // point fixed in place. Every input method below (wheel, pinch,
  // buttons, keyboard, double-click/tap) funnels through this one place.
  // Guarded against bad input (e.g. a pinch distance of 0 producing a
  // 0/0 = NaN factor) — an invalid zoom would silently blank the whole
  // canvas every frame afterward (NaN transforms are a no-op, not an
  // error) while the simulation clock keeps ticking underneath it.
  function zoomAt(cx, cy, factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = screenToWorld(cx, cy);
    const nextZoom = clamp(session.view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (!Number.isFinite(nextZoom)) return;
    session.view.zoom = nextZoom;
    const after = screenToWorld(cx, cy);
    if (Number.isFinite(before.x - after.x)) session.view.x += before.x - after.x;
    if (Number.isFinite(before.y - after.y)) session.view.y += before.y - after.y;
    clampCamera();
  }
  function zoomAtCenter(factor) { zoomAt(innerWidth / 2, innerHeight / 2, factor); }

  // Two-finger pinch zoom. The single-pointer pan/paint logic below only
  // ever looks at session.pointer (one tracked touch/mouse), so a second
  // finger touching down is otherwise just ignored — track all active
  // touches separately here and switch into pinch mode once there are two.
  const activeTouches = new Map(); // pointerId -> {x, y}
  let pinchDist = null;
  const MIN_PINCH_DIST = 4; // px — below this, treat the two touch points as coincident and skip the step rather than divide by ~0
  function touchMidpoint() {
    const pts = [...activeTouches.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size >= 2) {
        // A second finger just landed — stop treating the first as a
        // pan/paint drag and start pinch tracking instead. Mark it
        // "moved" too so that when fingers lift afterward, the leftover
        // pointerup for that first finger doesn't read as a stationary
        // tap and pop open the info panel for whatever's underneath it.
        session.pointer.down = false;
        session.pointer.moved = true;
        const pts = [...activeTouches.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchDist = d > MIN_PINCH_DIST ? d : null;
        return;
      }
    }
    session.pointer = { down: true, moved: false, paint: true, x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    if (session.tool !== 'select') useTool(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', e => {
    if (activeTouches.has(e.pointerId)) activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size >= 2) {
      const pts = [...activeTouches.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = touchMidpoint();
      if (pinchDist && dist > MIN_PINCH_DIST) zoomAt(mid.x, mid.y, dist / pinchDist);
      pinchDist = dist > MIN_PINCH_DIST ? dist : null;
      return;
    }
    if (PAINT_TOOLS.includes(session.tool)) {
      const p = screenToWorld(e.clientX, e.clientY);
      session.hoverTile = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
    } else session.hoverTile = null;
    if (!session.pointer.down || session.pointer.id !== e.pointerId) return;
    const dx = e.clientX - session.pointer.x, dy = e.clientY - session.pointer.y;
    if (Math.hypot(dx, dy) > 5) session.pointer.moved = true;
    if (session.tool === 'select' && session.pointer.moved) {
      session.view.x -= dx / session.view.zoom; session.view.y -= dy / session.view.zoom; clampCamera();
    } else if (session.tool !== 'select' && session.pointer.moved && PAINT_TOOLS.includes(session.tool)) {
      useTool(e.clientX, e.clientY);
    }
    session.pointer.x = e.clientX; session.pointer.y = e.clientY;
  });
  canvas.addEventListener('pointerup', e => {
    activeTouches.delete(e.pointerId);
    if (activeTouches.size < 2) pinchDist = null;
    if (session.pointer.id !== e.pointerId) return;
    if (session.tool === 'select' && !session.pointer.moved) selectAt(e.clientX, e.clientY);
    session.pointer.down = false; session.pointer.paint = false;
  });
  canvas.addEventListener('pointercancel', e => {
    activeTouches.delete(e.pointerId);
    if (activeTouches.size < 2) pinchDist = null;
    session.pointer.down = false;
  });
  canvas.addEventListener('pointerleave', () => { session.hoverTile = null; });
  // Mouse wheel and trackpad pinch (trackpad pinch dispatches as a wheel
  // event with a larger deltaY, sometimes with ctrlKey set — either way
  // the sign of deltaY is all that matters here).
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : .87);
  }, { passive: false });
  // Double-click (desktop) / double-tap (mobile browsers report this as
  // dblclick too) zooms in one step centered on that point.
  canvas.addEventListener('dblclick', e => {
    if (session.tool !== 'select') return; // don't fight double-tap-to-paint with a paint tool active
    zoomAt(e.clientX, e.clientY, 1.6);
  });
  canvas.oncontextmenu = e => e.preventDefault();

  // On-screen +/− buttons: works with a mouse click, a tap, a switch/
  // controller mapped to "click", a screen reader's activate action —
  // anything that can press a button, not just wheel/pinch/keyboard.
  document.querySelector('#zoom-in').onclick = () => zoomAtCenter(1.4);
  document.querySelector('#zoom-out').onclick = () => zoomAtCenter(1 / 1.4);

  export const pausedBanner = document.querySelector('#paused-banner');
  
  // REFACTORED: Replace setSpeed() with setGameTime()
  export function setGameTime(scaleKey) {
    const scale = GAME_TIME_SCALES[scaleKey] !== undefined ? GAME_TIME_SCALES[scaleKey] : 1;
    setGameTimeScale(scale);
    document.querySelectorAll('[data-game-time]').forEach(x => x.classList.toggle('active', x.dataset.gameTime === scaleKey));
    pausedBanner.classList.toggle('hidden', scale !== 0);
    const labels = { pause: 'หยุดเวลา', realTime: 'เวลาปกติ', tenTimes: '10×เร็ว', oneMinutePerGameHour: '1 นาที = 1 ชั่วโมง' };
    showToast(labels[scaleKey] || 'เปลี่ยนเวลา');
  }
  
  document.querySelectorAll('[data-game-time]').forEach(b => b.onclick = () => {
    setGameTime(b.dataset.gameTime);
  });

  // Minimap doubles as a jump-to-location control: tap anywhere on it to
  // recenter the main camera there, same idea as any RTS/god-game minimap.
  document.querySelector('#minimap').addEventListener('pointerdown', e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    session.view.x = clamp(fx, 0, 1) * W * TILE; session.view.y = clamp(fy, 0, 1) * H * TILE;
    clampCamera();
  });

  // Keyboard shortcuts — ignored while a text/range input has focus so they
  // never fight with typing or dragging the brush-size slider.
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); setGameTime(session.gameClock.gameTimeScale === 0 ? 'realTime' : 'pause'); }
    else if (e.key === '1') setGameTime('realTime');
    else if (e.key === '2') setGameTime('tenTimes');
    else if (e.key === '3') setGameTime('oneMinutePerGameHour');
    // Both the top-row and numpad +/- keys, and '=' since that's '+'
    // without needing Shift on most keyboard layouts.
    else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { e.preventDefault(); zoomAtCenter(1.2); }
    else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') { e.preventDefault(); zoomAtCenter(1 / 1.2); }
    else if (e.key === '0') { e.preventDefault(); session.view.zoom = 1; clampCamera(); }
    else if (e.key === 'Escape') { closePanel(); closeDashboard(); setTool('select'); }
  });

  export function loop(now) {
    // FPS cap: skip this rAF tick entirely (no sim advance, no draw, no
    // lastTime update) if we're still inside the current frame's time
    // budget. session.lastTime is only ever touched once we actually
    // decide to process a frame below, so dt stays correct — it just
    // naturally comes out larger (e.g. ~33ms at a 30fps cap) instead of
    // whatever the display's native vsync interval is.
    if (session.fpsCap > 0 && now - session.lastFrameAt < 1000 / session.fpsCap) {
      requestAnimationFrame(loop);
      return;
    }
    session.lastFrameAt = now;
    // Rolling FPS readout for the optional on-screen counter (see
    // session.showFps / drawFpsCounter in ui.js) — sampled once/sec so the
    // number is readable instead of jittering every frame.
    session.fpsFrameCount++;
    if (now - session.fpsSampleAt >= 1000) {
      session.fpsSmoothed = session.fpsFrameCount * 1000 / (now - session.fpsSampleAt || 1);
      session.fpsFrameCount = 0;
      session.fpsSampleAt = now;
      // Auto-downgrade: only meaningful when nothing is deliberately
      // throttling frames below the trouble threshold already (an
      // intentional 30fps cap shouldn't be mistaken for the device
      // struggling). Three consecutive bad 1s samples (not just one blip,
      // e.g. a big explosion) before acting, plus a cooldown after each
      // step down, so it settles instead of chain-downgrading every
      // second straight to 'potato' on one rough patch.
      if (session.autoQualityEnabled && (session.fpsCap === 0 || session.fpsCap > 24) && session.fpsSmoothed < 24) {
        session.lowFpsStreak++;
      } else {
        session.lowFpsStreak = 0;
      }
      if (session.lowFpsStreak >= 3 && now - session.lastAutoDowngradeAt > 8000) {
        const curIdx = PRESET_ORDER.indexOf(session.graphicsQuality);
        if (curIdx > 0) {
          const nextKey = PRESET_ORDER[curIdx - 1];
          setGraphicsQuality(nextKey);
          resize();
          showToast(`เฟรมตก ปรับกราฟิกลงอัตโนมัติ: ${GRAPHICS_PRESETS[nextKey].label}`);
          session.lastAutoDowngradeAt = now;
        }
        session.lowFpsStreak = 0;
      }
    }
    
    const dt = Math.min(100, now - session.lastTime); 
    session.lastTime = now;
    
    // REFACTORED: Compute gameTimeDelta from game time scale (not FPS)
    if (session.gameClock.gameTimeScale > 0) {
      // Update game clock
      session.gameClock.realTime += dt;
      gameTimeDelta = dt * session.gameClock.gameTimeScale; // milliseconds of game time
      
      // Accumulate for fixed simulation timestep
      session.simAccumulator += gameTimeDelta;
      
      if (session.simAccumulator >= MS_PER_GAME_SUBSTEP) {
        syncSimIndexes();
        let ran = 0;
        while (session.simAccumulator >= MS_PER_GAME_SUBSTEP && ran < MAX_SUBSTEPS_PER_FRAME) {
          session.simAccumulator -= MS_PER_GAME_SUBSTEP; 
          simulationStep(); 
          ran++;
        }
        // Drop excess backlog to prevent spiral of death
        const maxBacklog = MS_PER_GAME_SUBSTEP * MAX_SUBSTEPS_PER_FRAME;
        if (session.simAccumulator > maxBacklog) session.simAccumulator = maxBacklog;
        state.units = state.units.filter(u => u.alive);
      }
    } else {
      // Paused: only visual animations via gameTimeDelta = 0
      gameTimeDelta = 0;
    }
    
    draw(dt, now);
    requestAnimationFrame(loop);
  }
  
  const gfxLoad = loadGraphicsQuality();
  loadFpsSettings();
  loadAutoQuality();
  session.minimapCanvas = document.querySelector('#minimap');
  session.minimapCtx = session.minimapCanvas.getContext('2d');
  resize();

  // --- Startup sequence -----------------------------------------------
  const WARMUP_TICKS = 60;
  const LOADING_HOLD_MS = 2000;
  const loadingScreen = document.querySelector('#loading-screen');
  const loadingText = document.querySelector('#loading-text');
  requestAnimationFrame(() => {
    makeWorld(0x9E3779B9);
    if (loadingText) loadingText.textContent = 'กำลังปลุกสิ่งมีชีวิต...';
    syncSimIndexes();
    for (let i = 0; i < WARMUP_TICKS; i++) { simulationStep(); advanceUnits(MS_PER_GAME_SUBSTEP); }
    state.units = state.units.filter(u => u.alive);
    draw(0, performance.now());
    setTimeout(() => {
      loadingScreen?.classList.add('fade-out');
      setTimeout(() => loadingScreen?.classList.add('hidden'), 500);
      session.lastTime = performance.now();
      session.lastFrameAt = session.lastTime;
      session.fpsSampleAt = session.lastTime;
      session.simAccumulator = 0;
      requestAnimationFrame(loop);
      if (gfxLoad.autoDetected) {
        showToast(`ตรวจพบสเปกเครื่อง — เริ่มที่คุณภาพกราฟิก: ${GRAPHICS_PRESETS[gfxLoad.quality].label}`);
      }
    }, LOADING_HOLD_MS);
  });
