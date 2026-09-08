// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

// Small chunky "game-icon" SVGs used in place of emoji for resources and
// rank (crown) indicators, so the look matches a painted pixel-art palette
// instead of the platform's emoji font. Everything renders inline (same
// call sites that used to drop in an emoji character) and accepts a size
// in px so it can match whatever text it sits next to.

function svg(inner, size, viewBox = '0 0 24 24') {
  return `<svg class="icon-inline icon-inline--auto" viewBox="${viewBox}" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;
}

// A little 3D-look ingot: a sloped top face + a front face, used for the
// three "bar" resources (gold, silver, iron).
function ingot({ top, front, outline, shine }, size) {
  return svg(`
    <polygon points="7,4 17,4 19,7 5,7" fill="${top}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/>
    <polygon points="5,7 19,7 21,17 3,17" fill="${front}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/>
    <polygon points="6.4,8.6 17.6,8.6 18.4,11 5.6,11" fill="${shine}" opacity=".55"/>
  `, size);
}

const INGOT_PALETTES = {
  gold: { top: '#ffe27a', front: '#e8a317', outline: '#7a4a06', shine: '#fff6cf' },
  silver: { top: '#f3f6f8', front: '#b7c1c9', outline: '#4d565d', shine: '#ffffff' },
  iron: { top: '#9fb0b8', front: '#5c6b73', outline: '#263136', shine: '#c9d6db' },
};

function stoneIcon(size) {
  return svg(`
    <path d="M4 15 L6 9 L11 6 L17 7 L21 12 L19 17 L8 18 Z" fill="#9aa3ab" stroke="#3f474d" stroke-width="1" stroke-linejoin="round"/>
    <path d="M6 9 L11 6 L14 9 L10 12 Z" fill="#c3ccd2" opacity=".75"/>
    <path d="M14 13 L19 12 L19 17 L10 17 Z" fill="#6d767c" opacity=".8"/>
  `, size);
}

function woodIcon(size) {
  return svg(`
    <rect x="2" y="8" width="20" height="8" rx="1.5" fill="#a9702f" stroke="#5c3a17" stroke-width="1"/>
    <rect x="2.6" y="8.6" width="18.8" height="2.2" rx="1" fill="#c98b46"/>
    <ellipse cx="4.2" cy="12" rx="2.2" ry="4" fill="#e8c99a" stroke="#5c3a17" stroke-width="1"/>
    <circle cx="4.2" cy="12" r="1.1" fill="#a9702f"/>
    <ellipse cx="19.8" cy="12" rx="2.2" ry="4" fill="#e8c99a" stroke="#5c3a17" stroke-width="1"/>
    <circle cx="19.8" cy="12" r="1.1" fill="#a9702f"/>
  `, size);
}

function foodIcon(size) {
  return svg(`
    <path d="M3 15 C3 9 7 6 12 6 C17 6 21 9 21 15 C21 17.5 17 19 12 19 C7 19 3 17.5 3 15 Z" fill="#d98c3d" stroke="#7a4718" stroke-width="1" stroke-linejoin="round"/>
    <path d="M7 10 C8.5 8.5 10 8 12 8 C14 8 15.5 8.5 17 10" fill="none" stroke="#7a4718" stroke-width="1" stroke-linecap="round"/>
    <path d="M6 14 C8 12.7 10 12 12 12 C14 12 16 12.7 18 14" fill="none" stroke="#7a4718" stroke-width="1" stroke-linecap="round" opacity=".6"/>
  `, size);
}

/**
 * Canvas version of the capital-city badge (castle + flag) — for drawing
 * next to a capital city's own name label on the map, as distinct from
 * drawKingdomGlyph (the kingdom/territory as a whole) and drawCrownGlyph
 * (a person's rank). Centered on (cx, cy).
 */
export function drawCapitalGlyph(ctx, cx, cy, size = 11) {
  const wall = '#e8ddc2', wallShade = '#c9bb96', outline = '#5c4a22', flag = '#d1273d';
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1;
  ctx.fillStyle = wall; ctx.strokeStyle = outline;
  ctx.beginPath(); ctx.rect(4, 12, 16, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = wallShade; ctx.fillRect(4, 12, 16, 2.4);
  ctx.fillStyle = wall;
  ctx.beginPath(); ctx.rect(5, 8, 3, 4.4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.rect(16, 8, 3, 4.4); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.rect(10.2, 6.5, 3.6, 5.9); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, 3.2); ctx.lineTo(12, 6.5); ctx.stroke();
  ctx.fillStyle = flag; ctx.lineWidth = .7;
  ctx.beginPath(); ctx.moveTo(12, 3.2); ctx.lineTo(16, 4.8); ctx.lineTo(12, 6.2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = outline; ctx.globalAlpha = .85;
  ctx.fillRect(9.6, 15.5, 4.8, 4.5);
  ctx.restore();
}

/**
 * Canvas version of the plain-city badge — pairs with drawCapitalGlyph so
 * a non-capital city's map label never reuses the crown shape reserved
 * for a person's rank.
 */
export function drawCityGlyph(ctx, cx, cy, size = 11) {
  const wall = '#dfe6ec', wallShade = '#b7c1c9', outline = '#4d565d';
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1;
  ctx.fillStyle = wall; ctx.strokeStyle = outline;
  ctx.beginPath(); ctx.rect(5, 12, 14, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = wallShade; ctx.fillRect(5, 12, 14, 2.2);
  ctx.fillStyle = wall; ctx.strokeStyle = outline;
  ctx.beginPath(); ctx.moveTo(12, 6.5); ctx.lineTo(18, 12); ctx.lineTo(6, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = outline; ctx.globalAlpha = .8;
  ctx.fillRect(10, 15, 4, 5);
  ctx.restore();
}

/**
 * Canvas version of the civilization badge (temple/pediment glyph) — for
 * drawing next to a city's name label on the map when the "เขตอารยธรรม"
 * (civilization) overlay is active, so that mode reads as clearly
 * civilization-flavored rather than reusing the plain city/capital
 * castle badges. Mirrors the same pediment-and-columns shape as the DOM
 * civIcon()/civImageHTML() so the map and panels stay visually
 * consistent. Centered on (cx, cy).
 */
export function drawCivGlyph(ctx, cx, cy, size = 11) {
  const roof = '#e8ddc2', roofShade = '#c9bb96', outline = '#5c4a22';
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1.6;
  ctx.fillStyle = roof; ctx.strokeStyle = outline;
  ctx.beginPath(); ctx.moveTo(12, 3); ctx.lineTo(21, 8); ctx.lineTo(3, 8); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = roofShade; ctx.globalAlpha = .7;
  ctx.beginPath(); ctx.moveTo(12, 3); ctx.lineTo(21, 8); ctx.lineTo(15, 8); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = outline;
  ctx.beginPath(); ctx.moveTo(4, 20); ctx.lineTo(20, 20); ctx.stroke();
  [6, 10, 14, 18].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 18); ctx.stroke(); });
  ctx.restore();
}

/**
 * Canvas version of the kingdom/territory crest badge — for drawing next
 * to a kingdom's name label on the map (kingdom-overlay mode), as distinct
 * from drawCapitalGlyph/drawCityGlyph (a single place) and drawCrownGlyph
 * (a person's rank). Centered on (cx, cy).
 */
export function drawKingdomGlyph(ctx, cx, cy, size = 11) {
  const base = '#f6c343', base2 = '#c8890f', outline = '#7a4a06', ribbon = '#8a1f2b';
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineWidth = 1;
  ctx.fillStyle = base; ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.moveTo(12, 3); ctx.lineTo(19, 5.6); ctx.lineTo(19, 11.5);
  ctx.bezierCurveTo(19, 16, 16, 19.3, 12, 21);
  ctx.bezierCurveTo(8, 19.3, 5, 16, 5, 11.5);
  ctx.lineTo(5, 5.6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = base2; ctx.globalAlpha = .55;
  ctx.beginPath();
  ctx.moveTo(12, 3); ctx.lineTo(19, 5.6); ctx.lineTo(19, 11.5);
  ctx.bezierCurveTo(19, 16, 16, 19.3, 12, 21); ctx.closePath();
  ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = ribbon; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(9, 14.4); ctx.lineTo(9, 10); ctx.lineTo(12, 12); ctx.lineTo(15, 10); ctx.lineTo(15, 14.4);
  ctx.stroke();
  ctx.fillStyle = ribbon;
  ctx.beginPath(); ctx.arc(12, 9, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * Canvas version of the crown, for drawing directly on the game map
 * (above a king/leader's sprite, or next to a capital's name label)
 * instead of the platform's 👑 emoji glyph. Centered on (cx, cy).
 */
export function drawCrownGlyph(ctx, cx, cy, kind = 'gold', size = 11) {
  const isGold = kind !== 'silver';
  const base = isGold ? '#f6c343' : '#dfe6ec';
  const base2 = isGold ? '#c8890f' : '#a9b4bd';
  const outline = isGold ? '#7a4a06' : '#4d565d';
  const gem = isGold ? '#d1273d' : '#2f7fd1';
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, 18); ctx.lineTo(4, 10); ctx.lineTo(8.5, 14); ctx.lineTo(12, 7);
  ctx.lineTo(15.5, 14); ctx.lineTo(20, 10); ctx.lineTo(20, 18); ctx.closePath();
  ctx.fillStyle = base; ctx.fill(); ctx.strokeStyle = outline; ctx.stroke();
  ctx.fillStyle = base2;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(4, 17.3, 16, 3.2, 1) : ctx.rect(4, 17.3, 16, 3.2);
  ctx.fill(); ctx.strokeStyle = outline; ctx.stroke();
  ctx.fillStyle = gem;
  ctx.beginPath(); ctx.arc(12, 14.6, 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = outline; ctx.lineWidth = .6; ctx.stroke();
  ctx.restore();
}

/**
 * resourceIcon('food' | 'wood' | 'stone' | 'iron' | 'gold' | 'silver', size?)
 * Drop-in replacement for the 🌾 🪵 🪨 🔩 💰/🪙 emoji used across the UI.
 */
export function resourceIcon(key, size = 18) {
  switch (key) {
    case 'food': return foodIcon(size);
    case 'wood': return woodIcon(size);
    case 'stone': return stoneIcon(size);
    case 'iron': return ingot(INGOT_PALETTES.iron, size);
    case 'silver': return ingot(INGOT_PALETTES.silver, size);
    case 'gold':
    default: return ingot(INGOT_PALETTES.gold, size);
  }
}

/**
 * cityIcon(size?)
 * Small plain settlement badge for a CITY that is NOT the capital — pairs
 * with capitalIcon() so a place-level marker never reuses the crown shape
 * that crownIcon() uses for a PERSON's rank.
 */
export function cityIcon(size = 18) {
  const wall = '#dfe6ec', wallShade = '#b7c1c9', outline = '#4d565d';
  return svg(`
    <rect x="5" y="12" width="14" height="8" fill="${wall}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/>
    <rect x="5" y="12" width="14" height="2.2" fill="${wallShade}"/>
    <path d="M12 6.5 L18 12 L6 12 Z" fill="${wall}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/>
    <rect x="10" y="15" width="4" height="5" fill="${outline}" opacity=".8"/>
  `, size);
}

/**
 * capitalIcon(size?)
 * Small castle/tower badge — marks a CITY as the capital (a place), as
 * distinct from crownIcon which marks a PERSON as a ruler. Used anywhere
 * a city name needs a "this one is the capital" flag (city panel titles,
 * city lists, the "governed city" row).
 */
export function capitalIcon(size = 18) {
  const wall = '#e8ddc2', wallShade = '#c9bb96', outline = '#5c4a22', flag = '#d1273d';
  return svg(`
    <rect x="4" y="12" width="16" height="8" fill="${wall}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/>
    <rect x="4" y="12" width="16" height="2.4" fill="${wallShade}"/>
    <rect x="5" y="8" width="3" height="4.4" fill="${wall}" stroke="${outline}" stroke-width="1"/>
    <rect x="16" y="8" width="3" height="4.4" fill="${wall}" stroke="${outline}" stroke-width="1"/>
    <rect x="10.2" y="6.5" width="3.6" height="5.9" fill="${wall}" stroke="${outline}" stroke-width="1"/>
    <path d="M12 3.2 L12 6.5" stroke="${outline}" stroke-width="1"/>
    <path d="M12 3.2 L16 4.8 L12 6.2 Z" fill="${flag}" stroke="${outline}" stroke-width=".7" stroke-linejoin="round"/>
    <rect x="9.6" y="15.5" width="4.8" height="4.5" fill="${outline}" opacity=".85"/>
  `, size);
}

/**
 * kingdomIcon(size?)
 * Crest/shield badge — marks a KINGDOM or TERRITORY (the whole realm), as
 * distinct from crownIcon (a person's rank) and capitalIcon (a single
 * city). Used for "ดูอาณาจักร" links, the kingdom panel title, and
 * "ruled kingdom" references.
 */
export function kingdomIcon(size = 18) {
  const base = '#f6c343', base2 = '#c8890f', outline = '#7a4a06', ribbon = '#8a1f2b';
  return svg(`
    <path d="M12 3 L19 5.6 L19 11.5 C19 16 16 19.3 12 21 C8 19.3 5 16 5 11.5 L5 5.6 Z"
      fill="${base}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M12 3 L19 5.6 L19 11.5 C19 16 16 19.3 12 21 Z" fill="${base2}" opacity=".55"/>
    <path d="M9 14.4 L9 10 L12 12 L15 10 L15 14.4" fill="none" stroke="${ribbon}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="9" r="1.2" fill="${ribbon}"/>
  `, size);
}

/**
 * crownIcon('gold' | 'silver', size?)
 * Gold crown = capital city / the reigning king.
 * Silver crown = the leader of a city that is not the capital.
 */
export function crownIcon(kind = 'gold', size = 18) {
  const isGold = kind !== 'silver';
  const base = isGold ? '#f6c343' : '#dfe6ec';
  const base2 = isGold ? '#c8890f' : '#a9b4bd';
  const outline = isGold ? '#7a4a06' : '#4d565d';
  const gem = isGold ? '#d1273d' : '#2f7fd1';
  const gemLight = isGold ? '#ff5d70' : '#6fb3ff';
  return svg(`
    <path d="M4 18 L4 10 L8.5 14 L12 7 L15.5 14 L20 10 L20 18 Z" fill="${base}" stroke="${outline}" stroke-width="1" stroke-linejoin="round"/>
    <rect x="4" y="17.3" width="16" height="3.2" rx="1" fill="${base2}" stroke="${outline}" stroke-width="1"/>
    <circle cx="4" cy="10" r="1.15" fill="${base}" stroke="${outline}" stroke-width=".7"/>
    <circle cx="12" cy="7" r="1.15" fill="${base}" stroke="${outline}" stroke-width=".7"/>
    <circle cx="20" cy="10" r="1.15" fill="${base}" stroke="${outline}" stroke-width=".7"/>
    <circle cx="12" cy="14.6" r="1.7" fill="${gem}" stroke="${outline}" stroke-width=".6"/>
    <circle cx="11.6" cy="14.1" r=".55" fill="${gemLight}"/>
  `, size);
}

/**
 * civIcon(size?)
 * Outline temple glyph — pediment roof + four columns, the same shape as
 * the "เขตอารยธรรม" (civilization territory) overlay button in index.html.
 * Drop-in replacement for the platform's 🏛️ emoji wherever a kingdom's
 * civilization/empire tier, a city's development stage, or a government
 * building needs an icon (stat cards, list items, panel titles, tooltips).
 * Uses currentColor so it inherits whatever ink color it's dropped into.
 */
export function civIcon(size = 18) {
  return `<svg class="icon-inline" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 3 21 8 3 8"/><line x1="4" y1="20" x2="20" y2="20"/><line x1="6" y1="10" x2="6" y2="18"/><line x1="10" y1="10" x2="10" y2="18"/><line x1="14" y1="10" x2="14" y2="18"/><line x1="18" y1="10" x2="18" y2="18"/></svg>`;
}

/**
 * civImageHTML(sizePx?)
 * Same drop-in-artwork pattern as cultureSymbolHTML() in culture.js, but
 * with an extra middle fallback: tries images/civilization/temple.png
 * first (see images/civilization/README.txt — drop dedicated art there
 * and it's picked up with no code changes), and if that 404s, reuses the
 * real artwork already sitting at images/culture/level-1.png instead of
 * immediately dropping to the flat civIcon() SVG — so this shows an
 * actual picture as soon as *either* file exists, not just the dedicated
 * one. Only falls back to the SVG (via .civ-symbol--fallback in
 * main.css) if both images are missing.
 */
export function civImageHTML(sizePx = 18) {
  return `<span class="civ-symbol" style="--civ-symbol-size:${sizePx}px"><img class="civ-symbol-img" src="images/civilization/temple.png" alt="civilization" onerror="this.onerror=function(){this.parentElement.classList.add('civ-symbol--fallback')};this.src='images/culture/level-1.png'"><span class="civ-symbol-fallback">${civIcon(sizePx)}</span></span>`;
}

// ---------------------------------------------------------------------
// Control-bar / settings icons — plain outline or flat-fill line icons,
// matching the style already hand-drawn inline for the settings/events/
// dashboard toolbar buttons in index.html, used to replace the emoji
// glyphs (👆 ⏸ 💾 ↥ ✦ ⚙ ⚡ 🚀) that were still standing in for the rest
// of the control bar and the settings panel.
// ---------------------------------------------------------------------
const CTRL_ICON_PATHS = {
  // Select/pointer tool (was 👆) — solid cursor-arrow.
  pointer: { fill: true, d: '<path d="M5 3l14 8-6 1.4-2.6 6.6z"/>' },
  // Pause / stopped time (was ⏸) — two solid bars.
  pause: { fill: true, d: '<rect x="6.5" y="5" width="3.4" height="14" rx="1"/><rect x="14.1" y="5" width="3.4" height="14" rx="1"/>' },
  // Save world (was 💾) — outline floppy disk.
  save: { fill: false, d: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4"/><rect x="8" y="14" width="8" height="6"/>' },
  // Load world (was ↥) — arrow rising out of a tray.
  load: { fill: false, d: '<path d="M12 14V3"/><path d="M8 8l4-5 4 5"/><path d="M4 19h16"/>' },
  // New world (was ✦) — four-point sparkle.
  sparkle: { fill: true, d: '<path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/>' },
  // Settings (was ⚙) — same three-slider glyph as #settings-btn in index.html.
  gear: { fill: false, d: '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="15" cy="6" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="9" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="17" cy="18" r="2" fill="currentColor" stroke="none"/>' },
  // Fast-forward / turbo speed (was ⚡ on the 50× option) — same bolt as the lightning disaster tool.
  bolt: { fill: true, d: '<polygon points="13 2 4 14 11 14 9 22 20 9 13 9"/>' },
  // Supersonic speed (was 🚀 on the 100× option) — simple rocket silhouette.
  rocket: { fill: true, d: '<polygon points="12 2 15.2 11 8.8 11"/><rect x="8.8" y="11" width="6.4" height="4.4"/><polygon points="8.8 13.5 5.8 17.5 8.8 16"/><polygon points="15.2 13.5 18.2 17.5 15.2 16"/><polygon points="10 15.4 12 19.5 14 15.4"/><circle cx="12" cy="7.6" r="1.2" fill="var(--wood,#241a12)"/>' },
};

/**
 * ctrlIcon('pointer' | 'pause' | 'save' | 'load' | 'sparkle' | 'gear' |
 *   'bolt' | 'rocket', size?)
 * Drop-in replacement for the old emoji glyphs on control-bar buttons and
 * in the settings panel. Renders inline via .icon-inline (same baseline
 * alignment as the resource/crown icons above) at the given size.
 */
export function ctrlIcon(name, size = 18) {
  const def = CTRL_ICON_PATHS[name] || CTRL_ICON_PATHS.gear;
  const style = def.fill
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg class="icon-inline" viewBox="0 0 24 24" width="${size}" height="${size}" ${style} aria-hidden="true">${def.d}</svg>`;
}

/**
 * ctrlIconTi(name) — same icon set as ctrlIcon, but bare (no width/height/
 * class attributes) for dropping straight into a .tools button, which
 * already sizes any svg.ti child via CSS (see .tools button svg.ti in
 * main.css) exactly like the other hand-drawn tool icons in index.html.
 */
export function ctrlIconTi(name) {
  const def = CTRL_ICON_PATHS[name] || CTRL_ICON_PATHS.gear;
  const style = def.fill
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg class="ti" viewBox="0 0 24 24" ${style} aria-hidden="true">${def.d}</svg>`;
}
