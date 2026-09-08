// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

'use strict';

// Shared game state: canvas/context, constants, the state object, view/tool/pointer globals, and small pure helpers (clamp, rand, id/name generation, tile lookup, noise, event log).
// Part of the World Simulator script split (see index.html for load order).

  export function showModal(overlayId, onClose) {
    document.querySelectorAll('.modal-overlay').forEach(o => { if (o.id !== overlayId) o.classList.add('hidden'); });
    document.querySelector('#' + overlayId)?.classList.remove('hidden');
    const closeBtn = document.querySelector('#modal-close-btn');
    if (!closeBtn) return;
    closeBtn.classList.remove('hidden');
    closeBtn.onclick = onClose;
  }
  export function hideModal(overlayId) {
    document.querySelector('#' + overlayId)?.classList.add('hidden');
    document.querySelector('#modal-close-btn')?.classList.add('hidden');
  }
  // Tapping the dimmed backdrop (not the popup box itself) closes whichever
  // popup is open, same as tapping the corner × button.
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('pointerdown', e => {
      if (e.target === overlay) document.querySelector('#modal-close-btn')?.onclick?.();
    });
  });

  export const canvas = document.querySelector('#game');
  export const ctx = canvas.getContext('2d');
  export const W = 160, H = 100, TILE = 16;
  // Zoom range and level-of-detail thresholds. Below LOD_FULL_ZOOM the
  // terrain drops per-tile ornamentation (waves, foam, tree/ore sprites,
  // shading); below LOD_BLOCK_ZOOM it switches to a single scaled blit of
  // the minimap's 1px-per-tile buffer, i.e. each tile becomes one flat
  // pixel block – cheap to draw and reads clearly at a whole-world view.
  export const MIN_ZOOM = .08, MAX_ZOOM = 5;
  // `let`, not `const` – these two are retuned per graphics-quality preset
  // by setGraphicsQuality below, same live-binding trick as MS_PER_GAME_HOUR.
  export let LOD_FULL_ZOOM = .5, LOD_BLOCK_ZOOM = .18;
  
  // ============================================================
  // GAME TIME SYSTEM (replaces Speed × multiplier)
  // ============================================================
  // gameClock stores gameTimeScale (1 = normal, 10 = 10× faster, 0 = paused)
  // gameTimeDelta is computed per frame: dt * gameTimeScale (in milliseconds)
  // MS_PER_GAME_HOUR is mutable, recalculated by setDayLengthMinutes()
  // ============================================================
  
  export const GAME_TIME_SCALES = {
    pause: 0,
    realTime: 1,
    tenTimes: 10,
    oneMinutePerGameHour: 60,
    custom: 1
  };

  // Per-frame computed game time delta (milliseconds of game time)
  export let gameTimeDelta = 0;

  // Simulation fixed timestep (mutable by setDayLengthMinutes)
  export let MS_PER_GAME_HOUR = 5000; // Default: 1 game day = 2 real minutes at 1× scale
  export const SIM_SUBSTEPS_PER_HOUR = 6;
  export let MS_PER_GAME_SUBSTEP = MS_PER_GAME_HOUR / SIM_SUBSTEPS_PER_HOUR;
  export const MAX_SUBSTEPS_PER_FRAME = 8;
  export const MIN_DAY_LENGTH_MINUTES = 1, MAX_DAY_LENGTH_MINUTES = 60;

  export function setDayLengthMinutes(minutes) {
    const clamped = clamp(Math.round(minutes), MIN_DAY_LENGTH_MINUTES, MAX_DAY_LENGTH_MINUTES);
    state.dayLengthMinutes = clamped;
    // 1 day = 24 hours = clamped * 60000 milliseconds
    MS_PER_GAME_HOUR = (clamped * 60000) / 24;
    MS_PER_GAME_SUBSTEP = MS_PER_GAME_HOUR / SIM_SUBSTEPS_PER_HOUR;
    return clamped;
  }

  export function setGameTimeScale(scale) {
    if (session.gameClock) session.gameClock.gameTimeScale = scale;
  }

  // Graphics presets
  export const GRAPHICS_QUALITY_KEY = 'world-sim-graphics-quality';
  export const GRAPHICS_CUSTOM_KEY = 'world-sim-graphics-custom';
  export const PRESET_ORDER = ['potato', 'minimum', 'low', 'medium', 'high', 'ultra', 'flagship'];
  export const GRAPHICS_PRESETS = {
    potato: { label: 'ประหยัดสุด', dprCap: .75, lodFullZoom: 1.6, lodBlockZoom: .7, weatherFx: false, waterAnim: false, minimapOverlayMs: 2000, terrainDetail: 0, waterDetail: 0, atmosphereDetail: 0, entityShadow: 0 },
    minimum: { label: 'ต่ำสุด', dprCap: 1, lodFullZoom: 1.2, lodBlockZoom: .5, weatherFx: false, waterAnim: false, minimapOverlayMs: 1000, terrainDetail: 0, waterDetail: 0, atmosphereDetail: 0, entityShadow: 0 },
    low: { label: 'ต่ำ', dprCap: 1, lodFullZoom: .9, lodBlockZoom: .38, weatherFx: false, waterAnim: false, minimapOverlayMs: 600, terrainDetail: 0, waterDetail: 0, atmosphereDetail: 0, entityShadow: 0 },
    medium: { label: 'กลาง', dprCap: 1.5, lodFullZoom: .65, lodBlockZoom: .26, weatherFx: true, waterAnim: true, minimapOverlayMs: 250, terrainDetail: 1, waterDetail: 1, atmosphereDetail: 0, entityShadow: 1 },
    high: { label: 'สูง', dprCap: 2, lodFullZoom: .5, lodBlockZoom: .18, weatherFx: true, waterAnim: true, minimapOverlayMs: 60, terrainDetail: 2, waterDetail: 2, atmosphereDetail: 1, entityShadow: 1 },
    ultra: { label: 'สูงสุด', dprCap: 2.5, lodFullZoom: .38, lodBlockZoom: .12, weatherFx: true, waterAnim: true, minimapOverlayMs: 16, terrainDetail: 3, waterDetail: 3, atmosphereDetail: 1, entityShadow: 1 },
    flagship: { label: 'เรือธง', dprCap: 3, lodFullZoom: .3, lodBlockZoom: .1, weatherFx: true, waterAnim: true, minimapOverlayMs: 16, terrainDetail: 3, waterDetail: 3, atmosphereDetail: 2, entityShadow: 2 }
  };
  GRAPHICS_PRESETS.custom = { ...GRAPHICS_PRESETS.ultra, label: 'กำหนดเอง' };

  export function setGraphicsQuality(quality) {
    const key = GRAPHICS_PRESETS[quality] ? quality : 'high';
    const preset = GRAPHICS_PRESETS[key];
    session.graphicsQuality = key;
    session.dprCap = preset.dprCap;
    LOD_FULL_ZOOM = preset.lodFullZoom;
    LOD_BLOCK_ZOOM = preset.lodBlockZoom;
    try { localStorage.setItem(GRAPHICS_QUALITY_KEY, key); } catch (_) { }
    return key;
  }

  export function setGraphicsCustomField(fields) {
    const base = { ...(GRAPHICS_PRESETS[session.graphicsQuality] || GRAPHICS_PRESETS.high), ...fields, label: 'กำหนดเอง' };
    GRAPHICS_PRESETS.custom = base;
    session.graphicsQuality = 'custom';
    session.dprCap = base.dprCap;
    LOD_FULL_ZOOM = base.lodFullZoom;
    LOD_BLOCK_ZOOM = base.lodBlockZoom;
    try {
      localStorage.setItem(GRAPHICS_QUALITY_KEY, 'custom');
      localStorage.setItem(GRAPHICS_CUSTOM_KEY, JSON.stringify(base));
    } catch (_) { }
    return base;
  }

  export function loadGraphicsQuality() {
    let saved = null;
    try { saved = localStorage.getItem(GRAPHICS_QUALITY_KEY); } catch (_) { }
    const autoDetected = !saved;
    if (autoDetected) saved = detectDeviceTier();
    if (saved === 'custom') {
      try {
        const storedCustom = JSON.parse(localStorage.getItem(GRAPHICS_CUSTOM_KEY));
        if (storedCustom) GRAPHICS_PRESETS.custom = { ...GRAPHICS_PRESETS.ultra, ...storedCustom, label: 'กำหนดเอง' };
      } catch (_) { }
    }
    const quality = setGraphicsQuality(saved || 'high');
    return { quality, autoDetected };
  }

  export function detectDeviceTier() {
    let score = 0;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory;
    if (cores <= 2) score -= 2; else if (cores <= 4) score -= 1; else if (cores >= 8) score += 1;
    if (mem != null) {
      if (mem <= 2) score -= 2; else if (mem <= 4) score -= 1; else if (mem >= 8) score += 1;
    }
    try {
      const probe = document.createElement('canvas');
      probe.width = 300; probe.height = 300;
      const pctx = probe.getContext('2d');
      const t0 = performance.now();
      for (let i = 0; i < 4000; i++) {
        pctx.fillStyle = i % 2 ? '#335577' : '#557733';
        pctx.fillRect((i * 7) % 300, (i * 13) % 300, 10, 10);
      }
      const elapsed = performance.now() - t0;
      if (elapsed > 30) score -= 2; else if (elapsed > 14) score -= 1; else if (elapsed < 4) score += 1;
    } catch (_) { }
    const idx = clamp(3 + score, 0, PRESET_ORDER.length - 1);
    return PRESET_ORDER[idx];
  }

  export const AUTO_QUALITY_KEY = 'world-sim-auto-quality';
  export function setAutoQuality(on) {
    session.autoQualityEnabled = !!on;
    try { localStorage.setItem(AUTO_QUALITY_KEY, on ? '1' : '0'); } catch (_) { }
    return session.autoQualityEnabled;
  }
  export function loadAutoQuality() {
    let saved = true;
    try {
      const raw = localStorage.getItem(AUTO_QUALITY_KEY);
      if (raw !== null) saved = raw === '1';
    } catch (_) { }
    setAutoQuality(saved);
  }

  export const FPS_CAP_KEY = 'world-sim-fps-cap';
  export const SHOW_FPS_KEY = 'world-sim-show-fps';
  export const FPS_CAP_OPTIONS = [0, 30, 60, 120];
  export function setFpsCap(fps) {
    const val = FPS_CAP_OPTIONS.includes(fps) ? fps : 0;
    session.fpsCap = val;
    try { localStorage.setItem(FPS_CAP_KEY, String(val)); } catch (_) { }
    return val;
  }
  export function setShowFps(on) {
    session.showFps = !!on;
    try { localStorage.setItem(SHOW_FPS_KEY, on ? '1' : '0'); } catch (_) { }
    return session.showFps;
  }
  export function loadFpsSettings() {
    let savedCap = 0, savedShow = false;
    try { savedCap = Number(localStorage.getItem(FPS_CAP_KEY)) || 0; } catch (_) { }
    try { savedShow = localStorage.getItem(SHOW_FPS_KEY) === '1'; } catch (_) { }
    setFpsCap(savedCap);
    setShowFps(savedShow);
  }

  // Movement speeds (tiles per real second at normal game time)
  export const WALK_SPEED = .7;
  export const SHUFFLE_SPEED = .16;
  export const CLAIM_SPEED = .4;
  export const DELIVER_SPEED = .55;
  export const WORK_COMMUTE_SPEED = .5;
  export const HUNT_SPEED = .85;
  export const CITY_WANDER_SPEED = .5;
  export const NO_CITY_ROAM_SPEED = .6;
  export const ROYAL_STROLL_SPEED = .28;
  export const COURT_STROLL_SPEED = .35;
  export const ANIMAL_WANDER_SPEED = .45;
  export const ANIMAL_FLEE_SPEED = .75;
  export const OUTER_WATER_GRIDS = 12;
  
  export const SAVE_KEY = 'world-sim-save-v6';
  export const SAVE_SLOT_COUNT = 6;
  export const SAVE_SLOTS_INDEX_KEY = 'world-sim-save-index-v1';
  export const saveSlotKey = (i) => `world-sim-save-slot-${i}-v1`;
  export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  export const MONTHS = [
    'Thawglow', 'Bloomrise', 'Verdanth',
    'Suncrown', 'Emberpeak', 'Goldmere',
    'Duskfall', 'Ashwane', 'Harvestmoon',
    'Frostgate', 'Snowveil', 'Starfall'
  ];
  export const DAYS_PER_MONTH = 30;
  export const MONTHS_PER_YEAR = MONTHS.length;
  export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
  export const monthLabel = (month) => `${month} · ${MONTHS[(month - 1 + MONTHS_PER_YEAR) % MONTHS_PER_YEAR]}`;

  export const JOBS = ['farmer', 'forager', 'hunter', 'fisher', 'woodcutter', 'miner', 'builder'];
  export const HUNTER_CULTURE_LEVEL = 3;
  export const FISHER_CULTURE_LEVEL = 14;
  export const FISHING_DOCK_CULTURE_LEVEL = 27;
  export const SPEAR_CULTURE_LEVEL = 2;
  export const AXE_CULTURE_LEVEL = 5;
  export const DIGGING_SITE_CULTURE_LEVEL = 7;
  export const STONE_SPEAR_CULTURE_LEVEL = 9;
  export const STONE_AXE_CULTURE_LEVEL = 15;
  export const STONE_HOE_CULTURE_LEVEL = 16;
  export const QUARRY_SITE_CULTURE_LEVEL = 18;
  export const STONE_MINE_CULTURE_LEVEL = 29;
  export const IRON_MINE_CULTURE_LEVEL = 30;
  export const GOLD_MINE_CULTURE_LEVEL = 31;
  export const WINDMILL_MAX_COUNT = 2;
  export const FARMER_JOB_CAP = 8;
  export const MARKET_MAX_COUNT = 2;
  export const PALACE_CULTURE_LEVEL = 21;
  export const HOUSE2_CULTURE_LEVEL = 23;
  export const HOUSE2_CAPACITY_PER_HOUSE = 4;
  export const STARTER_HOUSING_CAPACITY = 6;
  export const HOUSE_CAPACITY_PER_HOUSE = 4;
  export const WINDMILL2_CULTURE_LEVEL = 26;
  export const WINDMILL_MAX_COUNT_2 = 4;
  export const FARMER_JOB_CAP_2 = 20;
  export const MARKET2_CULTURE_LEVEL = 28;
  export const MARKET_MAX_COUNT_2 = 3;
  export const HOUSE_MILESTONES = [];
  export const CITY_BUILD_PLANS = {
    townHall: { label: 'ศาลากลาง', cost: { wood: 18, stone: 8 }, needed: 26 },
    house: { label: 'บ้าน', cost: { wood: 10, stone: 2 }, needed: 12 },
    farm: { label: 'กังหันลม', cost: { wood: 8, stone: 3 }, needed: 16 },
    palace: { label: 'พระบรมมหาราชวัง', cost: { wood: 90, stone: 70 }, needed: 90 }
  };
  export const SPECIES = {
    human: { label: 'Human', icon: '🧍', color: '#f3d08b', coat: '#426c9e', affinity: 'grass' },
    elf: { label: 'Elf', icon: '🧝', color: '#b8f0bd', coat: '#398b66', affinity: 'forest' },
    dwarf: { label: 'Dwarf', icon: '🧔', color: '#e3b77d', coat: '#7c5740', affinity: 'mountain' },
    orc: { label: 'Orc', icon: '👹', color: '#d49583', coat: '#75414b', affinity: 'grass' }
  };
  export const TERRAIN = {
    deepWater: '#245f91', water: '#378bc0', iceWater: '#bfe3ea', sand: '#d8bd78', grass: '#80b85f',
    forest: '#418b51', mountain: '#898b8b', snow: '#e4ebee', ash: '#4a4038', lava: '#c9440c', crater: '#3a322b'
  };

  export const state = {
    version: 8, seed: 0, year: 1, month: 1, day: 1, hour: 6, hourFrac: 0, season: 'Spring', weather: 'Clear', dayLengthMinutes: 2,
    tiles: [], units: [], cities: [], nextId: 1, nextWorldEventAt: 48,
    events: [], kingdoms: [], disasters: [], fx: [], territoryGridHour: -1,
    kingdom: { name: 'Dawn Kingdom', gold: 100, food: 300, wood: 100, stone: 50, iron: 10 }
  };

  export const session = {
    dpr: 1,
    graphicsQuality: 'high', dprCap: 2,
    minimapOverlayCanvas: null, minimapOverlayMode: null, minimapOverlayAt: 0,
    view: { x: W * TILE / 2, y: H * TILE / 2, zoom: 1 },
    tool: 'select', overlay: 'none',
    // Game Clock (replaces speed multiplier)
    gameClock: { gameTimeScale: 1 },
    // Backward compat: still used for pathfind budget scaling
    speed: 1,
    brush: 1, lastTime: performance.now(), simAccumulator: 0,
    activeCategory: null,
    pointer: { down: false, moved: false, paint: false, x: 0, y: 0, id: null },
    toastTimer: 0,
    fpsCap: 0, showFps: false,
    autoQualityEnabled: true,
    lastFrameAt: 0, fpsSmoothed: 0, fpsSampleAt: 0, fpsFrameCount: 0,
    lowFpsStreak: 0, lastAutoDowngradeAt: 0,
    territoryGrid: null, territoryDistGrid: null,
    claimReservations: new Map(),
    civGrid: null, landRegion: null, waterRegion: null,
    hoverTile: null,
    minimapCanvas: null, minimapCtx: null, minimapTerrain: null, minimapDirty: true, minimapRebuildAt: 0
  };

  export const PAINT_TOOLS = ['tree', 'water', 'water_ice', 'mountain', 'mountain_snow', 'ore_stone', 'ore_iron', 'ore_gold', 'berries', 'fire', 'erase'];

  export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  export const rand = (a, b) => a + Math.random() * (b - a);
  export const makeId = () => state.nextId++;
  export const tile = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? null : state.tiles[y * W + x];
  export const tileAtPoint = (p) => tile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));

  export function logEvent(text, icon = '•') {
    state.events.unshift({ text, icon, year: state.year, month: state.month, day: state.day, hour: state.hour });
    state.events = state.events.slice(0, 32);
  }

  export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  export function latticeNoise(ix, iy, seed) {
    const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * .000013) * 43758.5453;
    return n - Math.floor(n);
  }

  export function valueNoise(x, y, scale, seed) {
    const gx = x / scale, gy = y / scale;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const smoothX = tx * tx * (3 - 2 * tx), smoothY = ty * ty * (3 - 2 * ty);
    const a = latticeNoise(x0, y0, seed), b = latticeNoise(x0 + 1, y0, seed);
    const c = latticeNoise(x0, y0 + 1, seed), d = latticeNoise(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * smoothX) * (1 - smoothY) + (c + (d - c) * smoothX) * smoothY;
  }
