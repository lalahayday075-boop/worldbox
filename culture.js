// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

'use strict';

import { FISHING_DOCK_CULTURE_LEVEL, GOLD_MINE_CULTURE_LEVEL, IRON_MINE_CULTURE_LEVEL, STONE_MINE_CULTURE_LEVEL, clamp, logEvent, state } from './state.js';
import { worldHour } from './ai-simulation.js';
import { showToast } from './ui.js';
import { civImageHTML, cityIcon, capitalIcon, resourceIcon } from './icons.js';

  export const CULTURE_LEVELS = [
    { level: 1, name: 'ชุมชนแรกเริ่ม', icon: '🏛️', unlock: 'ศาลากลาง และ บ้าน (Town Hall & House)' },
    { level: 2, name: 'ยุคเครื่องมือแรก', icon: '🔱', unlock: 'หอกไม้ (Wooden Spear)' },
    { level: 3, name: 'ยุคล่าสัตว์', icon: '🏹', unlock: 'อาชีพนักล่าสัตว์ (Hunter)' },
    { level: 4, name: 'ชุมชนตั้งถิ่นฐาน', icon: '🏘️', unlock: 'ยุ้งฉางเก็บอาหาร (Granary)' },
    { level: 5, name: 'ยุคเครื่องมือไม้', icon: '🪓', unlock: 'ขวานไม้ (Wooden Axe)' },
    { level: 6, name: 'ชุมชนสะสมไม้', icon: '🪵', unlock: 'ยุ้งเก็บไม้ (Wood Store)' },
    { level: 7, name: 'ชุมชนป่าไม้', icon: '🌲', unlock: 'ที่ขุดไม้ (Logging Site)' },
    { level: 8, name: 'ชุมชนสะสมแร่', icon: '⛏️', unlock: 'ยุ้งเก็บแร่ (Ore Store)' },
    { level: 9, name: 'ยุคเครื่องมือหิน', icon: '🗡️', unlock: 'หอกหิน (Stone Spear) — ล่าสัตว์ไวขึ้น' },
    { level: 10, name: 'ยุคธนู', icon: '🏹', unlock: 'ธนู (Bow)' },
    { level: 11, name: 'ยุคกังหันลมและไร่นา', icon: '🌬️', unlock: 'กังหันลม (สูงสุด 2 แห่ง), พื้นที่เกษตรถาวร และอาชีพเกษตรกร (สูงสุด 8 คน)' },
    { level: 12, name: 'ชุมชนการค้า', icon: '🏺', unlock: 'ตลาด (สร้างได้สูงสุด 2 แห่ง)' },
    { level: 13, name: 'ยุ้งฉางขั้นสูง', icon: '🌾', unlock: 'ยุ้งฉางอาหาร (2) — สร้างได้สูงสุด 4 แห่ง' },
    { level: 14, name: 'ยุคชาวประมง', icon: '🎣', unlock: 'เบ็ดตกปลา (Fishing Rod) — ปลดล็อคอาชีพชาวประมง' },
    { level: 15, name: 'ยุคเครื่องมือหินคม', icon: '🪓', unlock: 'ขวานหิน (Stone Axe) — ตัดไม้ไวขึ้น' },
    { level: 16, name: 'ยุคจอบหิน', icon: '🌱', unlock: 'จอบหิน (Stone Hoe) — ทำเกษตรไวขึ้น และเก็บเบอร์รี่ไวขึ้น' },
    { level: 17, name: 'คลังไม้ขั้นสูง', icon: '🪵', unlock: 'ยุ้งฉางไม้ (2) — สร้างได้สูงสุด 4 แห่ง' },
    { level: 18, name: 'เหมืองหิน', icon: '⛏️', unlock: 'ที่ขุดหิน (Stone Quarry Site) — ขุดหินไวขึ้น และขุดแร่เหล็กได้' },
    { level: 19, name: 'คลังหินขั้นสูง', icon: '🧱', unlock: 'ยุ้งฉางหิน (2) — สร้างได้สูงสุด 4 แห่ง' },
    { level: 20, name: 'ยุคธนูขั้นสูง', icon: '🏹', unlock: 'ธนู (2) (Bow II)' },
    { level: 21, name: 'ราชวัง', icon: '👑', unlock: 'การสร้างราชวัง และระบบราชวงศ์ (Palace & Royal Dynasty)' },
    { level: 22, name: 'การเขียนและการศึกษา', icon: '📜', unlock: 'โรงเรียน (School) — เพิ่มความสุขให้ชาวเมือง' },
    { level: 23, name: 'ที่อยู่อาศัยขั้นสูง', icon: '🏠', unlock: 'บ้าน (2) (House II) — บ้านดีขึ้น เพิ่มความจุที่พักและความสุข' },
    { level: 24, name: 'คลังปัญญา', icon: '📚', unlock: 'ห้องสมุด (Library) — เพิ่มความสุขให้ชาวเมือง' },
    { level: 25, name: 'จัตุรัสสาธารณะ', icon: '🎪', unlock: 'พลาซ่า (Plaza) — สร้างแลนมาร์กในเมือง เพิ่มความสุข' },
    { level: 26, name: 'กังหันลมขั้นสูง', icon: '🌬️', unlock: 'กังหันลม (2) (Windmill II) — สร้างได้สูงสุด 4 แห่ง และอาชีพเกษตรกร (สูงสุด 20 คน)' },
    { level: 27, name: 'ท่าเทียบเรือประมง', icon: '🚤', unlock: 'ท่าประมง (Fishing Dock) — เรือประมงออกเรือจริง' },
    { level: 28, name: 'ตลาดขั้นสูง', icon: '🏺', unlock: 'ตลาด (2) (Market II) — มีตลาดได้สูงสุด 3 แห่ง' },
    { level: 29, name: 'ยุคเหมืองหิน', icon: '⛏️', unlock: 'เหมืองหิน (Stone Mine) — สร้างแล้วขุดหินได้ไม่มีวันหมด' },
    { level: 30, name: 'ยุคเหมืองเหล็ก', icon: '🔨', unlock: 'เหมืองเหล็ก (Iron Mine) — สร้างแล้วขุดแร่เหล็กได้ไม่มีวันหมด' },
    { level: 31, name: 'ยุคเหมืองทอง', icon: '👑', unlock: 'เหมืองทอง (Gold Mine) — สร้างแล้วขุดแร่ทองได้ไม่มีวันหมด' }
  ];
  export const CULTURE_PROGRESS_PER_LEVEL = 70;
  export const CULTURE_MAX_LEVEL = CULTURE_LEVELS.length;
  export const CULTURE_LEVEL_GROWTH = 0.05;
  export function cultureProgressRequired(level) {
    const lvl = Math.max(1, level || 1);
    return Math.round(CULTURE_PROGRESS_PER_LEVEL * (1 + (lvl - 1) * CULTURE_LEVEL_GROWTH));
  }
  export function cultureCumulativeProgress(level, progress) {
    let total = 0;
    for (let l = 1; l < level; l++) total += cultureProgressRequired(l);
    return total + (progress || 0);
  }
  export function cultureProgressPercent(c) {
    const level = c.cultureLevel || 1;
    const required = cultureProgressRequired(level);
    return clamp(((c.cultureProgress || 0) / required) * 100, 0, 100);
  }

  export function cultureLevelInfo(level) {
    return CULTURE_LEVELS[clamp(Math.floor(level) - 1, 0, CULTURE_MAX_LEVEL - 1)];
  }
  // Kept as an alias — old name, some call sites below/elsewhere still use it.
  export const cultureEraFor = cultureLevelInfo;

  // Renders a civilization-era symbol (the little icon on CULTURE_LEVELS
  // entries). Tries an image at images/culture/level-N.png first — drop
  // artwork there named to match a level's number and it's picked up with
  // no code changes. If that file is missing (404) or images/ doesn't
  // exist at all, onerror flags the wrapper and CSS (.civ-symbol--fallback
  // in main.css) swaps back to the original emoji glyph automatically, so
  // this looks identical to before until real art is added.
  export function cultureSymbolHTML(levelInfo, sizePx = 20) {
    return `<span class="civ-symbol" style="--civ-symbol-size:${sizePx}px"><img class="civ-symbol-img" src="images/culture/level-${levelInfo.level}.png" alt="${levelInfo.name}" onerror="this.parentElement.classList.add('civ-symbol--fallback')"><span class="civ-symbol-fallback">${levelInfo.icon}</span></span>`;
  }

  export const CULTURE_BUILDING_REQUIREMENT = {
    granary: 4, woodStore: 6, oreStore: 8,
    market: 12, townCenter: 13, plaza: 14,
    school: 15, library: 16, barracks: 17, fort: 18, port: 19, fishingDock: FISHING_DOCK_CULTURE_LEVEL,
    stoneMine: STONE_MINE_CULTURE_LEVEL, ironMine: IRON_MINE_CULTURE_LEVEL, goldMine: GOLD_MINE_CULTURE_LEVEL
  };
  export function meetsCultureRequirement(c, buildingKey) {
    const required = CULTURE_BUILDING_REQUIREMENT[buildingKey];
    return !required || (c.cultureLevel || 1) >= required;
  }

  export function cultureGrowthRate(c) {
    const buildings = c.buildings || {};
    let rate = .12; // every settlement drifts forward a little just by existing
    rate += Math.min((c.pop || 0) * .012, 1.4);
    // Civic/cultural buildings each contribute their own flavour.
    if (buildings.temple) rate += .3;
    if (buildings.market) rate += .15;
    if (buildings.tavern) rate += .12;
    if (buildings.school) rate += .35;
    if (buildings.library) rate += .5;
    if (buildings.workshop) rate += .08;
    const happiness = c.happiness ?? 50;
    rate += happiness > 65 ? .18 : happiness < 35 ? -.12 : 0;
    // Food surplus: once a city is comfortably fed, some of its labour can
    // drift toward things that aren't farming.
    const foodRatio = (c.foodCapacity || 0) > 0 ? (c.food || 0) / c.foodCapacity : 0;
    if (foodRatio > .6) rate += .1;
    if (foodRatio < .15) rate -= .3;
    const peakPop = c.culturePeakPop || (c.pop || 0);
    if (peakPop > 12 && (c.pop || 0) < peakPop * .6) rate -= .4;
    // Trade: an active market bringing its kingdom real gold reflects
    // contact with the wider world, not just a full granary.
    const kingdom = state.kingdoms?.find(k => k.id === c.kingdomId);
    if (buildings.market && (kingdom?.gold || 0) > 60) rate += .08;
    const ageHours = Math.max(0, worldHour() - (kingdom?.civOriginAt ?? worldHour()));
    const levelCostFactor = cultureProgressRequired(c.cultureLevel || 1) / CULTURE_PROGRESS_PER_LEVEL;
    rate += Math.min(ageHours / 900, .6) * levelCostFactor;
    const CULTURE_SPEED_MULTIPLIER = 1.6;
    return Math.max(rate, 0) * CULTURE_SPEED_MULTIPLIER;
  }

  export function updateCityCulture(c) {
    c.cultureLevel ||= 1;
    c.cultureProgress ||= 0;
    c.culturePeakPop = Math.max(c.culturePeakPop || 0, c.pop || 0);
    if (c.cultureLevel < CULTURE_MAX_LEVEL) {
      c.cultureProgress += cultureGrowthRate(c);
      if (c.cultureProgress < 0) c.cultureProgress = 0;
      while (c.cultureLevel < CULTURE_MAX_LEVEL) {
        const required = cultureProgressRequired(c.cultureLevel);
        if (c.cultureProgress < required) break;
        c.cultureProgress -= required;
        c.cultureLevel++;
        const lvl = cultureLevelInfo(c.cultureLevel);
        logEvent(`${c.name} ขึ้นสู่ Culture Lv.${c.cultureLevel} — ปลดล็อค${lvl.unlock}`, lvl.icon);
        showToast(`${c.name} Culture Lv.${c.cultureLevel} ${lvl.icon} ปลดล็อค${lvl.unlock}`);
      }
    }
    if (c.cultureLevel >= CULTURE_MAX_LEVEL) c.cultureProgress = Math.min(c.cultureProgress, cultureProgressRequired(CULTURE_MAX_LEVEL) - 1);
    // Legacy flat counter, kept in sync for any older UI/save code that
    // still reads city.culture directly instead of the leveled fields.
    c.culture = cultureCumulativeProgress(c.cultureLevel, c.cultureProgress);
  }

  export const CULTURE_DIFFUSION_RADIUS = 70;
  export const CULTURE_DIFFUSION_INTERVAL = 6;
  export function seaTradeFalloff(c, other) {
    const linked = (state.seaTradeRoutes || []).some(r => !r.broken &&
      ((r.cityAId === c.id && r.cityBId === other.id) || (r.cityBId === c.id && r.cityAId === other.id)));
    return linked ? .6 : 0;
  }
  export function updateCultureDiffusion() {
    if (worldHour() < (state.nextCultureDiffusionAt || 0) || !state.cities.length) return;
    state.nextCultureDiffusionAt = worldHour() + CULTURE_DIFFUSION_INTERVAL;
    const cities = state.cities;
    for (const c of cities) {
      if ((c.cultureLevel || 1) >= CULTURE_MAX_LEVEL) continue;
      let bestGap = 0, bestFalloff = 0;
      for (const other of cities) {
        if (other === c) continue;
        const gap = (other.cultureLevel || 1) - (c.cultureLevel || 1);
        if (gap <= 0) continue;
        let falloff = 0;
        const dist = Math.hypot(other.x - c.x, other.y - c.y);
        if (dist <= CULTURE_DIFFUSION_RADIUS) {
          falloff = clamp(1 - dist / CULTURE_DIFFUSION_RADIUS, 0, 1);
          if (other.kingdomId != null && other.kingdomId === c.kingdomId) falloff *= 1.3;
          if (other.buildings?.market && c.buildings?.market) falloff *= 1.15;
        }
        falloff = Math.max(falloff, seaTradeFalloff(c, other));
        if (falloff <= 0) continue;
        if (gap > bestGap || (gap === bestGap && falloff > bestFalloff)) { bestGap = gap; bestFalloff = falloff; }
      }
      if (bestGap <= 0) continue;
      const required = cultureProgressRequired(c.cultureLevel || 1);
      const catchUpFactor = required / CULTURE_PROGRESS_PER_LEVEL;
      c.cultureProgress = (c.cultureProgress || 0) + Math.min(bestGap, 3) * bestFalloff * catchUpFactor * 2.2;
    }
  }

  export const CITY_DEVELOPMENT_STAGES = [
    { min: 0, name: 'Village', thai: 'หมู่บ้าน', icon: '🏕️' },
    { min: 15, name: 'Settlement', thai: 'ถิ่นฐาน', icon: '🏘️' },
    { min: 40, name: 'Town', thai: 'เมืองเล็ก', icon: cityIcon(18) },
    { min: 90, name: 'City', thai: 'เมือง', icon: civImageHTML(18) },
    { min: 180, name: 'Large City', thai: 'เมืองใหญ่', icon: '🏯' },
    { min: 350, name: 'Metropolis', thai: 'มหานคร', icon: '🌆' }
  ];
  export function cityDevelopmentStage(c) {
    const pop = c.pop || 0;
    let stage = CITY_DEVELOPMENT_STAGES[0];
    for (const s of CITY_DEVELOPMENT_STAGES) { if (pop >= s.min) stage = s; else break; }
    return stage;
  }

  export const CITY_SPECIALIZATIONS = {
    capital: { key: 'capital', label: 'Capital', icon: capitalIcon(18) },
    port: { key: 'port', label: 'Port City', icon: '⚓' },
    military: { key: 'military', label: 'Military City', icon: '🛡️' },
    trade: { key: 'trade', label: 'Trade City', icon: resourceIcon('gold', 18) },
    agricultural: { key: 'agricultural', label: 'Agricultural City', icon: resourceIcon('food', 18) },
    settlement: { key: 'settlement', label: 'Settlement', icon: '🏘️' }
  };
  export function computeCitySpecialization(c) {
    if (c.isCapital) return CITY_SPECIALIZATIONS.capital;
    const b = c.buildings || {};
    const scores = {
      agricultural: (c.farmAreas || 0) * 1 + (b.granary || 0) * 1.5,
      trade: (b.market || 0) * 2.5 + (b.workshop || 0) * 1.2,
      military: (b.barracks || 0) * 2.5 + (b.fort || 0) * 3,
      port: ((b.port || 0) > 0 ? 4 : 0) + (b.fishingDock || 0) * 2
    };
    let best = 'settlement', bestScore = 2; // floor: has to clearly lead before a city earns a label at all
    for (const key of Object.keys(scores)) if (scores[key] > bestScore) { bestScore = scores[key]; best = key; }
    return CITY_SPECIALIZATIONS[best];
  }
