// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

import { MS_PER_GAME_HOUR, SPECIES, hideModal, monthLabel, session, showModal, state } from './state.js';
import { computeCultureIdentity, computeKingdomTier } from './civilization.js';
import { CULTURE_MAX_LEVEL, cityDevelopmentStage, computeCitySpecialization, cultureLevelInfo, cultureProgressPercent, cultureProgressRequired, cultureSymbolHTML } from './culture.js';
import { royalDisplayName } from './names.js';
import { RESOURCE_LABEL } from './sea-trade.js';
import { capitalIcon, cityIcon, crownIcon, kingdomIcon, resourceIcon, civImageHTML } from './icons.js';

export let dashboardStack = [];
export let currentDashboard = null;
export let currentTab = 'overview';

// Dashboard types
export const DASHBOARD_TYPES = {
  WORLD: 'world',
  KINGDOM: 'kingdom',
  CITY: 'city',
  PERSON: 'person'
};

export const BUILDING_TAB_ICON_PATHS = {
  house: 'M2 10 L9 3 L16 10 V16 H2 Z M7 16 V11 H11 V16 Z',
  townHall: 'M2 15 H16 V9 H2 Z M1 9 L9 3 L17 9 Z M8 6 H10 V3 H8 Z',
  palace: 'M1 16 H17 V8 H1 Z M9 2 L1 8 H17 Z M3 8 V5 M15 8 V5 M9 8 V4',
  market: 'M2 16 H16 V9 H2 Z M1 9 L9 3 L17 9 Z M5 12 H8 V16 H5 Z M10 12 H13 V16 H10 Z',
  granary: 'M5 16 V6 H13 V16 Z M3 6 L9 1 L15 6 Z M8 9 H10 V12 H8 Z',
  woodStore: 'M2 15 H16 M2 11 H16 M2 7 H16 M2 15 V11 M2 11 V7 M16 15 V11 M16 11 V7 M9 15 V11 M9 11 V7',
  oreStore: 'M2 16 L4 8 L7 12 L9 5 L12 11 L15 16 Z M3 4 H15 V6 H3 Z',
  barracks: 'M2 16 V7 H16 V16 Z M2 7 V4 H5 V7 M7.5 7 V4 H10.5 V7 M13 7 V4 H16 V7',
  tavern: 'M2 16 V8 H16 V16 Z M1 8 L9 3 L17 8 Z M6 10 H10 V14 H6 Z',
  workshop: 'M2 16 V8 H16 V16 Z M1 8 L9 3 L17 8 Z M12 3 V6 M11 1 H13 V3 H11 Z',
  temple: 'M2 16 H16 V14 H2 Z M3 14 V6 H5 V14 M8 14 V6 H10 V14 M13 14 V6 H15 V14 M1 6 L9 2 L17 6 Z',
  school: 'M2 16 H16 V10 H2 Z M1 10 L9 4 L17 10 Z M5 16 V11 H8 V16 Z M9 1 L14 3 L9 5 L4 3 Z',
  library: 'M2 16 V4 H5 V16 Z M6 16 V3 H9 V16 Z M10 16 V5 H13 V16 Z M14 16 V4 H16 V16 Z M1 16 H17',
  port: 'M9 2 V15 M6.5 3 A2.5 2.5 0 1 1 6.4 3 M3 8 H15 M3 8 C3 12 5.5 15 9 16 C12.5 15 15 12 15 8',
  townCenter: 'M3 16 V9 H15 V16 Z M2 16 H16 M9 9 V1 M9 1 L14 4 L9 6.5 Z',
  plaza: 'M2 16 H16 M4 16 C4 11.5 6.2 9 9 9 C11.8 9 14 11.5 14 16 M9 6 V1 M9 6 A1.6 1.6 0 1 1 8.9 6',
  fort: 'M2 16 V7 H4 V4 H6 V7 H8 V4 H10 V7 H12 V4 H14 V7 H16 V16 Z M8 16 V11 H10 V16',
  fishingDock: 'M2 12 H16 M2 12 V16 M16 12 V16 M2 8 C5 4 8 4 9 8 C10 4 13 4 16 8',
  stoneMine: 'M2 16 L6 3 L9 9 L12 3 L16 16 Z M4 16 H14 M6.5 11 H11.5',
  ironMine: 'M2 16 L6 3 L9 9 L12 3 L16 16 Z M4 16 H14 M9 9 V16',
  goldMine: 'M2 16 L6 3 L9 9 L12 3 L16 16 Z M4 16 H14 M9 5 A2 2 0 1 1 8.9 5'
};
export function buildingTabIcon(key, size = 18) {
  const d = BUILDING_TAB_ICON_PATHS[key] || BUILDING_TAB_ICON_PATHS.house;
  return `<svg class="icon-inline" viewBox="0 0 18 18" width="${size}" height="${size}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// Open dashboard with navigation
export function openDashboard(type, data, addToStack = true) {
  if (addToStack && currentDashboard) {
    dashboardStack.push(currentDashboard);
  }
  
  currentDashboard = { type, data };
  currentTab = 'overview';
  renderDashboard();
}

// Navigate back in stack
export function navigateBack() {
  if (dashboardStack.length > 0) {
    currentDashboard = dashboardStack.pop();
    currentTab = 'overview';
    renderDashboard();
  } else {
    closeDashboard();
  }
}

// Navigate to specific breadcrumb level
export function navigateToBreadcrumb(index) {
  if (index === 0) {
    dashboardStack = [];
    currentDashboard = null;
    closeDashboard();
  } else if (index <= dashboardStack.length) {
    currentDashboard = dashboardStack[index - 1];
    dashboardStack = dashboardStack.slice(0, index - 1);
    currentTab = 'overview';
    renderDashboard();
  }
}

// Close dashboard
export function closeDashboard() {
  hideModal('dashboard-overlay');
  currentDashboard = null;
  dashboardStack = [];
  currentTab = 'overview';
}

// Switch tab
export function switchTab(tabName) {
  currentTab = tabName;
  renderDashboard();
}

export function renderDashboard() {
  if (!currentDashboard) return;
  
  const panel = document.querySelector('#dashboard-panel');
  if (!panel) return;
  
  showModal('dashboard-overlay', closeDashboard);
  
  // Build breadcrumb
  const breadcrumb = buildBreadcrumb();
  
  // Build content based on type
  let content = '';
  switch (currentDashboard.type) {
    case DASHBOARD_TYPES.WORLD:
      content = renderWorldDashboard();
      break;
    case DASHBOARD_TYPES.KINGDOM:
      content = renderKingdomDashboard(currentDashboard.data);
      break;
    case DASHBOARD_TYPES.CITY:
      content = renderCityDashboard(currentDashboard.data);
      break;
    case DASHBOARD_TYPES.PERSON:
      content = renderPersonDashboard(currentDashboard.data);
      break;
  }
  
  panel.innerHTML = `
    <div class="dashboard-breadcrumb">${breadcrumb}</div>
    ${content}
  `;
  
  // Attach event listeners
  attachDashboardEvents();
}

export function buildBreadcrumb() {
  const items = [];
  
  // Add stack items
  for (let i = 0; i < dashboardStack.length; i++) {
    const item = dashboardStack[i];
    const icon = getDashboardIcon(item.type);
    const title = getDashboardTitle(item);
    items.push(`
      <div class="breadcrumb-item" onclick="navigateToBreadcrumb(${i + 1})">
        <span>${icon}</span>
        <span>${title}</span>
      </div>
      <span class="breadcrumb-separator">›</span>
    `);
  }
  
  // Add current item
  if (currentDashboard) {
    const icon = getDashboardIcon(currentDashboard.type);
    const title = getDashboardTitle(currentDashboard);
    items.push(`
      <div class="breadcrumb-item active">
        <span>${icon}</span>
        <span>${title}</span>
      </div>
    `);
  }
  
  return items.join('');
}

export function getDashboardIcon(type) {
  switch (type) {
    case DASHBOARD_TYPES.WORLD: return '🌍';
    case DASHBOARD_TYPES.KINGDOM: return kingdomIcon(15);
    case DASHBOARD_TYPES.CITY: return cityIcon(15);
    case DASHBOARD_TYPES.PERSON: return '👤';
    default: return '📊';
  }
}

export function getDashboardTitle(dashboard) {
  if (!dashboard || !dashboard.data) return 'World';
  
  switch (dashboard.type) {
    case DASHBOARD_TYPES.WORLD:
      return 'World';
    case DASHBOARD_TYPES.KINGDOM:
      return dashboard.data.name || 'Kingdom';
    case DASHBOARD_TYPES.CITY:
      return dashboard.data.name || 'City';
    case DASHBOARD_TYPES.PERSON:
      return dashboard.data.name || 'Person';
    default:
      return 'Dashboard';
  }
}

export function renderWorldDashboard() {
  const totalPop = state.units.filter(u => u.type === 'human' && u.alive).length;
  const totalCities = state.cities.length;
  const totalKingdoms = state.kingdoms?.length || 0;
  const totalAnimals = state.units.filter(u => u.type === 'animal').length;
  const totalShips = state.units.filter(u => u.type === 'ship' && u.alive).length;
  const totalBuildings = state.cities.reduce((sum, c) => {
    const b = c.buildings || {};
    return sum + (b.market || 0) + (b.granary || 0) + (b.woodStore || 0) + (b.oreStore || 0)
      + (b.workshop || 0) + (b.barracks || 0) + (b.tavern || 0) + (b.temple || 0) + (c.houses || 0);
  }, 0);
  
  let tabsHTML = `
    <div class="dashboard-tabs">
      <button class="dashboard-tab ${currentTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
      <button class="dashboard-tab ${currentTab === 'kingdoms' ? 'active' : ''}" data-tab="kingdoms">Kingdoms</button>
      <button class="dashboard-tab ${currentTab === 'cities' ? 'active' : ''}" data-tab="cities">Cities</button>
      <button class="dashboard-tab ${currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
    </div>
  `;
  
  let contentHTML = '';
  
  if (currentTab === 'overview') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">World Statistics</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">👥</span>Population</div>
            <div class="stat-card-value">${totalPop}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${cityIcon(16)}</span>Cities</div>
            <div class="stat-card-value">${totalCities}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${kingdomIcon(16)}</span>Kingdoms</div>
            <div class="stat-card-value">${totalKingdoms}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">🐾</span>Animals</div>
            <div class="stat-card-value">${totalAnimals}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">🏗️</span>Buildings</div>
            <div class="stat-card-value">${totalBuildings}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">🗺️</span>Territory</div>
            <div class="stat-card-value">${state.cities.reduce((sum, c) => sum + (c.claimedTiles || []).length, 0)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">🚢</span>Trade Ships</div>
            <div class="stat-card-value">${totalShips}</div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Time & Weather</h3>
        <p>Year ${state.year} • ${monthLabel(state.month || 1)} • ${state.season} • Day ${state.day} • ${(() => { const smoothHour = state.hour + (state.hourFrac || 0) + (session.speed > 0 ? session.simAccumulator / MS_PER_GAME_HOUR : 0); return `${String(Math.floor(smoothHour) % 24).padStart(2, '0')}:${String(Math.floor((smoothHour % 1) * 60)).padStart(2, '0')}`; })()}</p>
        <p>Weather: ${state.weather}</p>
      </div>
    `;
  } else if (currentTab === 'kingdoms') {
    const kingdoms = state.kingdoms || [];
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">All Kingdoms (${kingdoms.length})</h3>
        <div class="dashboard-list">
          ${kingdoms.map(k => {
            const cities = state.cities.filter(c => c.kingdomId === k.id);
            const pop = cities.reduce((sum, c) => sum + (c.pop || 0), 0);
            const avgCulture = cities.length ? cities.reduce((sum, c) => sum + (c.cultureLevel || 1), 0) / cities.length : 1;
            return `
              <div class="dashboard-list-item" onclick="openKingdomFromWorld('${k.id}')">
                <div class="dashboard-list-item-left">
                  <span class="dashboard-list-item-icon">${kingdomIcon(18)}</span>
                  <div>
                    <div class="dashboard-list-item-title">${k.name}</div>
                    <div class="dashboard-list-item-subtitle">${cities.length} cities • Culture Lv.${avgCulture.toFixed(1)}</div>
                  </div>
                </div>
                <div class="dashboard-list-item-right">Pop ${pop}</div>
              </div>
            `;
          }).join('') || '<p class="subtle">ยังไม่มีอาณาจักร</p>'}
        </div>
      </div>
    `;
  } else if (currentTab === 'cities') {
    const cities = [...state.cities].sort((a, b) => (b.pop || 0) - (a.pop || 0));
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">All Cities (${cities.length})</h3>
        <div class="dashboard-list">
          ${cities.map(c => `
            <div class="dashboard-list-item" onclick="openCityFromWorld('${c.id}')">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${c.isCapital ? capitalIcon(18) : cityIcon(18)}</span>
                <div>
                  <div class="dashboard-list-item-title">${c.name}</div>
                  <div class="dashboard-list-item-subtitle">${c.isCapital ? 'Capital' : 'City'} · ${resourceIcon('gold', 13)} ${Math.floor(c.gold || 0)}</div>
                </div>
              </div>
              <div class="dashboard-list-item-right">Pop ${c.pop || 0}</div>
            </div>
          `).join('') || '<p class="subtle">ยังไม่มีเมือง</p>'}
        </div>
      </div>
    `;
  } else if (currentTab === 'history') {
    const events = state.events?.length ? state.events : [];
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">World History</h3>
        <div class="dashboard-list">
          ${events.slice(0, 20).map(e => `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${e.icon || '📜'}</span>
                <div>
                  <div class="dashboard-list-item-title">${e.text}</div>
                  <div class="dashboard-list-item-subtitle">Year ${e.year || 1} • ${monthLabel(e.month || 1)} • Day ${e.day || 1}</div>
                </div>
              </div>
            </div>
          `).join('') || '<p class="subtle">ยังไม่มีเหตุการณ์</p>'}
        </div>
      </div>
    `;
  }
  
  return `
    <div class="dashboard-header">
      <h2 class="dashboard-title">
        <span class="dashboard-title-icon">🌍</span>
        World
      </h2>
    </div>
    ${tabsHTML}
    <div class="dashboard-content">
      ${contentHTML}
    </div>
  `;
}

export function openKingdomFromWorld(kingdomId) {
  const kingdom = state.kingdoms?.find(k => String(k.id) === String(kingdomId));
  if (kingdom) {
    openDashboard(DASHBOARD_TYPES.KINGDOM, kingdom);
  }
}

export function openCityFromWorld(cityId) {
  const city = state.cities.find(c => String(c.id) === String(cityId));
  if (city) {
    openDashboard(DASHBOARD_TYPES.CITY, city);
  }
}

export function openCityFromKingdom(cityId) {
  const city = state.cities.find(c => String(c.id) === String(cityId));
  if (city) {
    openDashboard(DASHBOARD_TYPES.CITY, city);
  }
}

export function openPersonFromCity(personId) {
  const person = state.units.find(u => String(u.id) === String(personId));
  if (person) {
    openDashboard(DASHBOARD_TYPES.PERSON, person);
  }
}

export function attachDashboardEvents() {
  // Tab switching
  document.querySelectorAll('.dashboard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });
}

export function openWorldDashboard() {
  openDashboard(DASHBOARD_TYPES.WORLD, null, false);
}

export function renderKingdomDashboard(kingdom) {
  if (!kingdom) return '';
  
  const cities = state.cities.filter(c => c.kingdomId === kingdom.id);
  const totalPop = cities.reduce((sum, c) => sum + (c.pop || 0), 0);
  const capital = state.cities.find(c => c.id === kingdom.capitalCityId) || cities[0];
  const king = state.units.find(u => u.id === kingdom.kingId && u.alive);
  const capitalLeader = capital ? state.units.find(u => u.id === capital.leaderId) : null;
  const totalTerritory = cities.reduce((sum, c) => sum + (c.claimedTiles || []).length, 0);
  const totalFood = cities.reduce((sum, c) => sum + (c.food || 0), 0);
  const totalWood = cities.reduce((sum, c) => sum + (c.wood || 0), 0);
  const totalStone = cities.reduce((sum, c) => sum + (c.stone || 0), 0);
  const totalIron = cities.reduce((sum, c) => sum + (c.iron || 0), 0);
  const totalFoodCap = cities.reduce((sum, c) => sum + (c.foodCapacity ?? c.food ?? 0), 0);
  const totalWoodCap = cities.reduce((sum, c) => sum + (c.woodCapacity ?? c.wood ?? 0), 0);
  const totalStoneCap = cities.reduce((sum, c) => sum + (c.stoneCapacity ?? c.stone ?? 0), 0);
  const totalIronCap = cities.reduce((sum, c) => sum + (c.ironCapacity ?? c.iron ?? 0), 0);
  const cultureLevels = cities.map(c => c.cultureLevel || 1);
  const cultureMin = cultureLevels.length ? Math.min(...cultureLevels) : 1;
  const cultureMax = cultureLevels.length ? Math.max(...cultureLevels) : 1;
  const capitalCultureLevel = capital ? (capital.cultureLevel || 1) : 1;
  const capitalCultureEra = cultureLevelInfo(capitalCultureLevel);
  const kingdomTier = kingdom.tier || computeKingdomTier(kingdom, cities);
  
  let tabsHTML = `
    <div class="dashboard-tabs">
      <button class="dashboard-tab ${currentTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
      <button class="dashboard-tab ${currentTab === 'cities' ? 'active' : ''}" data-tab="cities">Cities</button>
      <button class="dashboard-tab ${currentTab === 'people' ? 'active' : ''}" data-tab="people">People</button>
      <button class="dashboard-tab ${currentTab === 'economy' ? 'active' : ''}" data-tab="economy">Economy</button>
      <button class="dashboard-tab ${currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
    </div>
  `;
  
  let contentHTML = '';
  
  if (currentTab === 'overview') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Kingdom Statistics</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">👥</span>Population</div>
            <div class="stat-card-value">${totalPop}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${cityIcon(16)}</span>Cities</div>
            <div class="stat-card-value">${cities.length}</div>
          </div>
          <div class="stat-card" title="${kingdomTier.thai} — คำนวณจากเมือง ประชากร พื้นที่ เศรษฐกิจ วัฒนธรรม และการทหารรวมกัน">
            <div class="stat-card-label"><span class="stat-card-icon">${kingdomTier.icon}</span>Tier</div>
            <div class="stat-card-value stat-card-value--sm">${kingdomTier.label}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('gold', 16)}</span>Gold</div>
            <div class="stat-card-value">${Math.floor(kingdom.gold || 0)}${kingdom.wagesUnpaid ? ' <span title="ค่าจ้างค้างจ่าย">⚠️</span>' : ''}</div>
          </div>
          <div class="stat-card" title="${capital ? `Capital: ${capitalCultureEra.icon} ${capitalCultureEra.name}` : ''}">
            <div class="stat-card-label"><span class="stat-card-icon">${cultureSymbolHTML(capitalCultureEra, 18)}</span>Culture</div>
            <div class="stat-card-value">${cultureMin === cultureMax ? `Lv.${cultureMin}` : `Lv.${cultureMin}–${cultureMax}`}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">🗺️</span>Territory</div>
            <div class="stat-card-value">${totalTerritory}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('food', 16)}</span>Food</div>
            <div class="stat-card-value">${Math.floor(totalFood)}<span class="stat-card-value-unit"> / ${Math.floor(totalFoodCap)}</span></div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Status</h3>
        <div class="progress-bar-label">
          <span>Happiness</span>
          <b>${Math.floor(kingdom.happiness || 0)}%</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${kingdom.happiness || 0}%"></div>
        </div>
        
        <div class="progress-bar-label" title="Culture is tracked per city, not per kingdom — this shows the capital's progress specifically.">
          <span>Culture Progress (${capital ? capital.name : 'Capital'})</span>
          <b>${capital ? `${Math.floor(capital.cultureProgress || 0)}/${cultureProgressRequired(capital.cultureLevel || 1)}` : '0'} (${Math.floor(capital ? cultureProgressPercent(capital) : 0)}%)</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${capital ? cultureProgressPercent(capital) : 0}%"></div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Leadership</h3>
        <div class="dashboard-list">
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${civImageHTML(20)}</span>
              <div>
                <div class="dashboard-list-item-title">Capital</div>
                <div class="dashboard-list-item-subtitle">${capital ? capital.name : 'None'}</div>
              </div>
            </div>
            <div class="dashboard-list-item-right">Pop ${capital ? capital.pop : 0}</div>
          </div>
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${crownIcon('gold', 18)}</span>
              <div>
                <div class="dashboard-list-item-title">Leader</div>
                <div class="dashboard-list-item-subtitle">${king ? royalDisplayName(king) : (kingdom.royalSystemReady ? 'Between reigns' : (capitalLeader ? royalDisplayName(capitalLeader) : 'No leader yet'))}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (currentTab === 'cities') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Cities (${cities.length})</h3>
        <div class="dashboard-list">
          ${cities.map(city => {
            const era = cultureLevelInfo(city.cultureLevel || 1);
            return `
            <div class="dashboard-list-item" onclick="openCityFromKingdom('${city.id}')">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${city.isCapital ? capitalIcon(18) : cityIcon(18)}</span>
                <div>
                  <div class="dashboard-list-item-title">${city.name}</div>
                  <div class="dashboard-list-item-subtitle">${city.isCapital ? 'Capital' : 'City'} · ${(city.claimedTiles || []).length} tiles · ${resourceIcon('gold', 13)} ${Math.floor(city.gold || 0)} · ${cultureSymbolHTML(era, 13)} Lv.${city.cultureLevel || 1}</div>
                </div>
              </div>
              <div class="dashboard-list-item-right">Pop ${city.pop || 0}</div>
            </div>
          `;
          }).join('') || '<p class="subtle">ไม่มีเมืองในอาณาจักร</p>'}
        </div>
      </div>
    `;
  } else if (currentTab === 'people') {
    const residents = state.units.filter(u => u.type === 'human' && u.alive && cities.some(c => c.id === u.city));
    const royals = (kingdom.royalFamily || []).map(id => state.units.find(u => u.id === id && u.alive)).filter(Boolean);
    
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Royal Family (${royals.length})</h3>
        <div class="dashboard-list">
          ${royals.map(r => `
            <div class="dashboard-list-item" onclick="openPersonFromKingdom('${r.id}')">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${r.royalRole === 'King' ? crownIcon('gold', 18) : '👤'}</span>
                <div>
                  <div class="dashboard-list-item-title">${royalDisplayName(r)}</div>
                  <div class="dashboard-list-item-subtitle">${r.royalRole || 'Royal'} · Age ${r.age.toFixed(0)}</div>
                </div>
              </div>
              <div class="dashboard-list-item-right">${Math.floor(r.hp)} HP</div>
            </div>
          `).join('') || '<p class="subtle">ยังไม่มีราชวงศ์</p>'}
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">All Citizens (${residents.length})</h3>
        <div class="dashboard-list">
          ${residents.slice(0, 20).map(p => `
            <div class="dashboard-list-item" onclick="openPersonFromKingdom('${p.id}')">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">👤</span>
                <div>
                  <div class="dashboard-list-item-title">${p.name}</div>
                  <div class="dashboard-list-item-subtitle">${p.job || 'Wanderer'} · Age ${p.age.toFixed(0)}</div>
                </div>
              </div>
              <div class="dashboard-list-item-right">${Math.floor(p.hp)} HP</div>
            </div>
          `).join('')}
          ${residents.length > 20 ? `<p class="subtle">และอีก ${residents.length - 20} คน...</p>` : ''}
        </div>
      </div>
    `;
  } else if (currentTab === 'economy') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Resources</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('food', 16)}</span>Food</div>
            <div class="stat-card-value">${Math.floor(totalFood)}<span class="stat-card-value-unit"> / ${Math.floor(totalFoodCap)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('wood', 16)}</span>Wood</div>
            <div class="stat-card-value">${Math.floor(totalWood)}<span class="stat-card-value-unit"> / ${Math.floor(totalWoodCap)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('stone', 16)}</span>Stone</div>
            <div class="stat-card-value">${Math.floor(totalStone)}<span class="stat-card-value-unit"> / ${Math.floor(totalStoneCap)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('iron', 16)}</span>Iron</div>
            <div class="stat-card-value">${Math.floor(totalIron)}<span class="stat-card-value-unit"> / ${Math.floor(totalIronCap)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('gold', 16)}</span>Gold</div>
            <div class="stat-card-value">${Math.floor(kingdom.gold || 0)}${kingdom.wagesUnpaid ? ' <span title="ค่าจ้างค้างจ่าย">⚠️</span>' : ''}</div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">City Breakdown</h3>
        <div class="dashboard-list">
          ${cities.map(c => `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${c.isCapital ? capitalIcon(18) : cityIcon(18)}</span>
                <div>
                  <div class="dashboard-list-item-title">${c.name}</div>
                  <div class="dashboard-list-item-subtitle">${resourceIcon('food', 13)} ${Math.floor(c.food || 0)}/${Math.floor(c.foodCapacity || 0)} · ${resourceIcon('wood', 13)} ${Math.floor(c.wood || 0)}/${Math.floor(c.woodCapacity || 0)} · ${resourceIcon('stone', 13)} ${Math.floor(c.stone || 0)}/${Math.floor(c.stoneCapacity || 0)} · ${resourceIcon('iron', 13)} ${Math.floor(c.iron || 0)}/${Math.floor(c.ironCapacity || 0)}</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (currentTab === 'history') {
    const events = (state.events || []).filter(e => 
      cities.some(c => e.text && e.text.includes(c.name)) || 
      (e.text && e.text.includes(kingdom.name))
    );
    
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Kingdom History</h3>
        <div class="dashboard-list">
          ${events.slice(0, 20).map(e => `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${e.icon || '📜'}</span>
                <div>
                  <div class="dashboard-list-item-title">${e.text}</div>
                  <div class="dashboard-list-item-subtitle">Year ${e.year || 1} · ${monthLabel(e.month || 1)} · Day ${e.day || 1}</div>
                </div>
              </div>
            </div>
          `).join('') || '<p class="subtle">ยังไม่มีเหตุการณ์</p>'}
        </div>
      </div>
    `;
  }
  
  return `
    <div class="dashboard-header">
      <h2 class="dashboard-title">
        <span class="dashboard-title-icon">${kingdomIcon(23)}</span>
        ${kingdom.name}
      </h2>
    </div>
    ${tabsHTML}
    <div class="dashboard-content">
      ${contentHTML}
    </div>
  `;
}

export function renderCityDashboard(city) {
  if (!city) return '';
  
  const kingdom = state.kingdoms?.find(k => k.id === city.kingdomId);
  const residents = state.units.filter(u => u.type === 'human' && u.alive && u.city === city.id);
  const workers = residents.filter(u => u.job && u.job !== 'claimer');
  const unemployed = residents.filter(u => !u.job || u.job === 'claimer');
  const buildings = city.buildings || {};
  const totalBuildings = (buildings.market || 0) + (buildings.granary || 0) + (buildings.woodStore || 0) +
                         (buildings.oreStore || 0) + (buildings.workshop || 0) +
                         (buildings.barracks || 0) + (buildings.tavern || 0) + (buildings.temple || 0) +
                         (buildings.school || 0) + (buildings.library || 0) + (buildings.port || 0) +
                         (buildings.townCenter || 0) + (buildings.plaza || 0) + (buildings.fort || 0) + (buildings.fishingDock || 0) +
                         (buildings.stoneMine || 0) + (buildings.ironMine || 0) + (buildings.goldMine || 0) +
                         (city.houses || 0);
  const cultureEra = cultureLevelInfo(city.cultureLevel || 1);
  const devStage = city.developmentStage || cityDevelopmentStage(city);
  const spec = city.specialization || computeCitySpecialization(city);
  const identity = city.cultureIdentity || computeCultureIdentity(city);
  const nextEra = (city.cultureLevel || 1) < CULTURE_MAX_LEVEL ? cultureLevelInfo((city.cultureLevel || 1) + 1) : null;
  
  let tabsHTML = `
    <div class="dashboard-tabs">
      <button class="dashboard-tab ${currentTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
      <button class="dashboard-tab ${currentTab === 'people' ? 'active' : ''}" data-tab="people">People</button>
      <button class="dashboard-tab ${currentTab === 'economy' ? 'active' : ''}" data-tab="economy">Economy</button>
      <button class="dashboard-tab ${currentTab === 'buildings' ? 'active' : ''}" data-tab="buildings">Buildings</button>
      <button class="dashboard-tab ${currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
    </div>
  `;
  
  let contentHTML = '';
  
  if (currentTab === 'overview') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Civilization</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${cultureSymbolHTML(cultureEra, 18)}</span>Culture</div>
            <div class="stat-card-value">Lv.${city.cultureLevel || 1}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${devStage.icon}</span>Development</div>
            <div class="stat-card-value stat-card-value--sm">${devStage.name}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${spec.icon}</span>Specialization</div>
            <div class="stat-card-value stat-card-value--sm">${spec.label}</div>
          </div>
          ${identity ? `
          <div class="stat-card" title="${identity.thai}">
            <div class="stat-card-label"><span class="stat-card-icon">${identity.icon}</span>Identity</div>
            <div class="stat-card-value stat-card-value--sm">${identity.label}</div>
          </div>` : ''}
        </div>
        <div class="progress-bar-label">
          <span>${cultureSymbolHTML(cultureEra, 16)} ${cultureEra.name}</span>
          <b>${Math.floor(city.cultureProgress || 0)}/${cultureProgressRequired(city.cultureLevel || 1)} (${Math.floor(cultureProgressPercent(city))}%)</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${cultureProgressPercent(city)}%"></div>
        </div>
        <p class="subtle subtle--tight">ปลดล็อค: ${cultureEra.unlock}</p>
        ${nextEra ? `<p class="subtle">🔒 Lv.${nextEra.level}: ${nextEra.unlock}</p>` : `<p class="subtle">${cityIcon(14)} ถึงเลเวลสูงสุดแล้ว</p>`}
      </div>

      <div class="dashboard-section">
        <h3 class="dashboard-section-title">City Statistics</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">👥</span>Population</div>
            <div class="stat-card-value">${city.pop || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">🏠</span>Houses</div>
            <div class="stat-card-value">${city.houses || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">💼</span>Workers</div>
            <div class="stat-card-value">${workers.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">🗺️</span>Territory</div>
            <div class="stat-card-value">${(city.claimedTiles || []).length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">🏗️</span>Buildings</div>
            <div class="stat-card-value">${totalBuildings}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('food', 16)}</span>Farms</div>
            <div class="stat-card-value">${city.farmAreas || 0}</div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Resources</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('food', 16)}</span>Food</div>
            <div class="stat-card-value">${Math.floor(city.food || 0)}<span class="stat-card-value-unit"> / ${Math.floor(city.foodCapacity || 0)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('wood', 16)}</span>Wood</div>
            <div class="stat-card-value">${Math.floor(city.wood || 0)}<span class="stat-card-value-unit"> / ${Math.floor(city.woodCapacity || 0)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('stone', 16)}</span>Stone</div>
            <div class="stat-card-value">${Math.floor(city.stone || 0)}<span class="stat-card-value-unit"> / ${Math.floor(city.stoneCapacity || 0)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('iron', 16)}</span>Iron</div>
            <div class="stat-card-value">${Math.floor(city.iron || 0)}<span class="stat-card-value-unit"> / ${Math.floor(city.ironCapacity || 0)}</span></div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Status</h3>
        <div class="progress-bar-label">
          <span>Happiness</span>
          <b>${Math.floor(city.happiness || 0)}%</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${city.happiness || 0}%"></div>
        </div>
        
        <div class="progress-bar-label">
          <span>Prosperity</span>
          <b>${Math.floor(city.prosperity || 0)}%</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${city.prosperity || 0}%"></div>
        </div>
        
        <div class="progress-bar-label">
          <span>Health</span>
          <b>${Math.floor(city.health || 0)}%</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${city.health || 0}%"></div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Kingdom</h3>
        <p>${kingdom ? `${kingdomIcon(15)} ${kingdom.name} · Culture Lv.${city.cultureLevel || 1}` : 'No kingdom yet'}</p>
        ${city.isCapital ? `<p>${capitalIcon(15)} Capital city</p>` : ''}
      </div>
    `;
  } else if (currentTab === 'people') {
    // Group by job
    const jobGroups = {};
    residents.forEach(r => {
      const job = r.job || 'Unemployed';
      if (!jobGroups[job]) jobGroups[job] = [];
      jobGroups[job].push(r);
    });
    
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Population (${residents.length})</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label">Workers</div>
            <div class="stat-card-value">${workers.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label">Unemployed</div>
            <div class="stat-card-value">${unemployed.length}</div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">By Occupation</h3>
        <div class="dashboard-list">
          ${Object.entries(jobGroups).map(([job, people]) => `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${getJobIcon(job)}</span>
                <div>
                  <div class="dashboard-list-item-title">${job}</div>
                  <div class="dashboard-list-item-subtitle">${people.length} people</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Citizens</h3>
        <div class="dashboard-list">
          ${residents.slice(0, 20).map(p => `
            <div class="dashboard-list-item" onclick="openPersonFromCity('${p.id}')">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${getJobIcon(p.job)}</span>
                <div>
                  <div class="dashboard-list-item-title">${p.name}</div>
                  <div class="dashboard-list-item-subtitle">${p.job || 'Unemployed'} · Age ${p.age.toFixed(0)}</div>
                </div>
              </div>
              <div class="dashboard-list-item-right">${Math.floor(p.hp)} HP</div>
            </div>
          `).join('')}
          ${residents.length > 20 ? `<p class="subtle">และอีก ${residents.length - 20} คน...</p>` : ''}
        </div>
      </div>
    `;
  } else if (currentTab === 'economy') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Resources</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('food', 16)}</span>Food</div>
            <div class="stat-card-value">${Math.floor(city.food || 0)}<span class="stat-card-value-unit"> / ${Math.floor(city.foodCapacity || 0)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('wood', 16)}</span>Wood</div>
            <div class="stat-card-value">${Math.floor(city.wood || 0)}<span class="stat-card-value-unit"> / ${Math.floor(city.woodCapacity || 0)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('stone', 16)}</span>Stone</div>
            <div class="stat-card-value">${Math.floor(city.stone || 0)}<span class="stat-card-value-unit"> / ${Math.floor(city.stoneCapacity || 0)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('iron', 16)}</span>Iron</div>
            <div class="stat-card-value">${Math.floor(city.iron || 0)}<span class="stat-card-value-unit"> / ${Math.floor(city.ironCapacity || 0)}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${resourceIcon('gold', 16)}</span>Gold</div>
            <div class="stat-card-value">${Math.floor(city.gold || 0)}</div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Production Capacity</h3>
        <div class="dashboard-list">
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${resourceIcon('food', 18)}</span>
              <div>
                <div class="dashboard-list-item-title">Farms</div>
                <div class="dashboard-list-item-subtitle">${city.farmAreas || 0} windmills</div>
              </div>
            </div>
          </div>
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${resourceIcon('wood', 18)}</span>
              <div>
                <div class="dashboard-list-item-title">Woodcutters</div>
                <div class="dashboard-list-item-subtitle">${residents.filter(u => u.job === 'woodcutter').length} workers</div>
              </div>
            </div>
          </div>
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">⛏️</span>
              <div>
                <div class="dashboard-list-item-title">Miners</div>
                <div class="dashboard-list-item-subtitle">${residents.filter(u => u.job === 'miner').length} workers</div>
              </div>
            </div>
          </div>
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">🍇</span>
              <div>
                <div class="dashboard-list-item-title">Foragers</div>
                <div class="dashboard-list-item-subtitle">${residents.filter(u => u.job === 'forager').length} workers</div>
              </div>
            </div>
          </div>
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">🏹</span>
              <div>
                <div class="dashboard-list-item-title">Hunters</div>
                <div class="dashboard-list-item-subtitle">${residents.filter(u => u.job === 'hunter').length} workers</div>
              </div>
            </div>
          </div>
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">🎣</span>
              <div>
                <div class="dashboard-list-item-title">Fishers</div>
                <div class="dashboard-list-item-subtitle">${residents.filter(u => u.job === 'fisher').length} workers</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      ${(() => {
        const routes = (state.seaTradeRoutes || []).filter(r => !r.broken && (r.cityAId === city.id || r.cityBId === city.id));
        const fishingBoat = city.fishingBoatId != null && state.units.find(u => u.id === city.fishingBoatId && u.alive);
        if (!routes.length && !fishingBoat) return '';
        return `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Sea Trade</h3>
        <div class="dashboard-list">
          ${fishingBoat ? `
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">🎣</span>
              <div>
                <div class="dashboard-list-item-title">Fishing Boat</div>
                <div class="dashboard-list-item-subtitle">${fishingBoat.shipPath && fishingBoat.shipPath.length >= 2 ? 'แล่นออกทะเลไปแหล่งจับปลา (Fishing Dock)' : 'นำอาหารกลับมาส่งเป็นระยะ'}</div>
              </div>
            </div>
          </div>` : ''}
          ${routes.map(r => {
            const otherId = r.cityAId === city.id ? r.cityBId : r.cityAId;
            const other = state.cities.find(c => c.id === otherId);
            const cargoShip = state.units.find(u => u.id === r.shipId && u.alive);
            const transportShip = r.transportShipId && state.units.find(u => u.id === r.transportShipId && u.alive);
            return `
          <div class="dashboard-list-item" onclick="openCityFromKingdom('${otherId}')">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">⚓</span>
              <div>
                <div class="dashboard-list-item-title">${other ? other.name : '?'}</div>
                <div class="dashboard-list-item-subtitle">🚢 Cargo${cargoShip?.cargo ? ` (${RESOURCE_LABEL[cargoShip.cargo.resource]} ${Math.round(cargoShip.cargo.amount)})` : ''}${transportShip ? ' · 🛳️ Transport' : ''}</div>
              </div>
            </div>
          </div>`;
          }).join('')}
        </div>
      </div>`;
      })()}
    `;
  } else if (currentTab === 'buildings') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Buildings</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('house')}</span>Houses</div>
            <div class="stat-card-value">${city.houses || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('market')}</span>Market</div>
            <div class="stat-card-value">${buildings.market || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('granary')}</span>Granary</div>
            <div class="stat-card-value">${buildings.granary || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('woodStore')}</span>Wood Store</div>
            <div class="stat-card-value">${buildings.woodStore || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('oreStore')}</span>Ore Store</div>
            <div class="stat-card-value">${buildings.oreStore || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('workshop')}</span>Workshop</div>
            <div class="stat-card-value">${buildings.workshop || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('barracks')}</span>Barracks</div>
            <div class="stat-card-value">${buildings.barracks || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('tavern')}</span>Tavern</div>
            <div class="stat-card-value">${buildings.tavern || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('temple')}</span>Temple</div>
            <div class="stat-card-value">${buildings.temple || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('school')}</span>School</div>
            <div class="stat-card-value">${buildings.school || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('library')}</span>Library</div>
            <div class="stat-card-value">${buildings.library || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('townCenter')}</span>Town Center</div>
            <div class="stat-card-value">${buildings.townCenter || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('plaza')}</span>Plaza</div>
            <div class="stat-card-value">${buildings.plaza || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('fort')}</span>Fort</div>
            <div class="stat-card-value">${buildings.fort || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('port')}</span>Port</div>
            <div class="stat-card-value">${buildings.port || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('fishingDock')}</span>Fishing Dock</div>
            <div class="stat-card-value">${buildings.fishingDock || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('stoneMine')}</span>Stone Mine</div>
            <div class="stat-card-value">${buildings.stoneMine || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('ironMine')}</span>Iron Mine</div>
            <div class="stat-card-value">${buildings.ironMine || 0}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-label"><span class="stat-card-icon">${buildingTabIcon('goldMine')}</span>Gold Mine</div>
            <div class="stat-card-value">${buildings.goldMine || 0}</div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Construction Status</h3>
        <div class="dashboard-list">
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${buildingTabIcon('townHall', 20)}</span>
              <div>
                <div class="dashboard-list-item-title">Town Hall</div>
                <div class="dashboard-list-item-subtitle">${city.townHallBuilt ? '✅ Completed' : '🔨 Building...'}</div>
              </div>
            </div>
          </div>
          ${city.isCapital ? `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${buildingTabIcon('palace', 20)}</span>
                <div>
                  <div class="dashboard-list-item-title">Palace</div>
                  <div class="dashboard-list-item-subtitle">${city.palaceBuilt ? '✅ Completed' : '🔨 Building...'}</div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  } else if (currentTab === 'history') {
    const events = (state.events || []).filter(e => e.text && e.text.includes(city.name));
    
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">City History</h3>
        <div class="dashboard-list">
          ${events.slice(0, 20).map(e => `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${e.icon || '📜'}</span>
                <div>
                  <div class="dashboard-list-item-title">${e.text}</div>
                  <div class="dashboard-list-item-subtitle">Year ${e.year || 1} · ${monthLabel(e.month || 1)} · Day ${e.day || 1}</div>
                </div>
              </div>
            </div>
          `).join('') || '<p class="subtle">ยังไม่มีเหตุการณ์</p>'}
        </div>
      </div>
    `;
  }
  
  return `
    <div class="dashboard-header">
      <h2 class="dashboard-title">
        <span class="dashboard-title-icon">${city.isCapital ? capitalIcon(23) : cityIcon(23)}</span>
        ${city.name}
      </h2>
    </div>
    ${tabsHTML}
    <div class="dashboard-content">
      ${contentHTML}
    </div>
  `;
}

export function renderPersonDashboard(person) {
  if (!person) return '';
  
  const city = state.cities.find(c => c.id === person.city);
  const kingdom = city ? state.kingdoms?.find(k => k.id === city.kingdomId) : null;
  const speciesInfo = SPECIES[person.race] || SPECIES.human;
  const partner = person.partner ? state.units.find(u => u.id === person.partner) : null;
  const children = (person.children || []).map(id => state.units.find(u => u.id === id)).filter(Boolean);
  
  let tabsHTML = `
    <div class="dashboard-tabs">
      <button class="dashboard-tab ${currentTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
      <button class="dashboard-tab ${currentTab === 'needs' ? 'active' : ''}" data-tab="needs">Needs</button>
      <button class="dashboard-tab ${currentTab === 'family' ? 'active' : ''}" data-tab="family">Family</button>
      <button class="dashboard-tab ${currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
    </div>
  `;
  
  let contentHTML = '';
  
  if (currentTab === 'overview') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Basic Info</h3>
        <div class="dashboard-list">
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${speciesInfo.icon}</span>
              <div>
                <div class="dashboard-list-item-title">Species</div>
                <div class="dashboard-list-item-subtitle">${speciesInfo.label}</div>
              </div>
            </div>
          </div>
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">🎂</span>
              <div>
                <div class="dashboard-list-item-title">Age</div>
                <div class="dashboard-list-item-subtitle">${person.age.toFixed(1)} years</div>
              </div>
            </div>
          </div>
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${person.alive ? '❤️' : '⚰️'}</span>
              <div>
                <div class="dashboard-list-item-title">Status</div>
                <div class="dashboard-list-item-subtitle">${person.alive ? 'Alive' : 'Dead'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Home</h3>
        <div class="dashboard-list">
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${cityIcon(18)}</span>
              <div>
                <div class="dashboard-list-item-title">City</div>
                <div class="dashboard-list-item-subtitle">${city ? city.name : 'No city'}</div>
              </div>
            </div>
          </div>
          ${kingdom ? `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${kingdomIcon(20)}</span>
                <div>
                  <div class="dashboard-list-item-title">Kingdom</div>
                  <div class="dashboard-list-item-subtitle">${kingdom.name}</div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Job</h3>
        <div class="dashboard-list">
          <div class="dashboard-list-item dashboard-list-item--static">
            <div class="dashboard-list-item-left">
              <span class="dashboard-list-item-icon">${getJobIcon(person.job)}</span>
              <div>
                <div class="dashboard-list-item-title">${person.job || 'Wanderer'}</div>
                <div class="dashboard-list-item-subtitle">${person.royalRole || 'Citizen'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Status</h3>
        <div class="progress-bar-label">
          <span>HP</span>
          <b>${Math.floor(person.hp)}/100</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${person.hp}%"></div>
        </div>
        
        <div class="progress-bar-label">
          <span>Hunger</span>
          <b>${Math.floor(person.hunger)}/100</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${person.hunger}%"></div>
        </div>
        
        ${person.energy != null ? `
          <div class="progress-bar-label">
            <span>Energy</span>
            <b>${Math.floor(person.energy)}/100</b>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="--pct: ${person.energy}%"></div>
          </div>
        ` : ''}
        
        <div class="progress-bar-label">
          <span>Happiness</span>
          <b>${Math.floor(person.happiness || 0)}/100</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${person.happiness || 0}%"></div>
        </div>
      </div>
    `;
  } else if (currentTab === 'needs') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Needs Status</h3>
        
        <div class="progress-bar-label">
          <span>🍖 Hunger</span>
          <b>${Math.floor(person.hunger)}/100</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${person.hunger}%"></div>
        </div>
        <p class="subtle">${person.hunger > 80 ? '⚠️ หิวมาก!' : person.hunger > 50 ? 'เริ่มหิว' : 'อิ่ม'}</p>
        
        <div class="progress-bar-label">
          <span>❤️ HP</span>
          <b>${Math.floor(person.hp)}/100</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${person.hp}%"></div>
        </div>
        <p class="subtle">${person.hp < 30 ? '⚠️ บาดเจ็บสาหัส!' : person.hp < 60 ? 'บาดเจ็บ' : 'สุขภาพดี'}</p>
        
        ${person.energy != null ? `
          <div class="progress-bar-label">
            <span>⚡ Energy</span>
            <b>${Math.floor(person.energy)}/100</b>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="--pct: ${person.energy}%"></div>
          </div>
          <p class="subtle">${person.energy < 30 ? '⚠️ เหนื่อยมาก!' : person.energy < 60 ? 'เริ่มเหนื่อย' : 'มีพลังงาน'}</p>
        ` : ''}
        
        <div class="progress-bar-label">
          <span>😊 Happiness</span>
          <b>${Math.floor(person.happiness || 0)}/100</b>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="--pct: ${person.happiness || 0}%"></div>
        </div>
        <p class="subtle">${(person.happiness || 0) < 30 ? '⚠️ ไม่มีความสุข' : (person.happiness || 0) < 60 ? 'เฉยๆ' : 'มีความสุข'}</p>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Activity</h3>
        <p>${person.activity || 'Observing'}</p>
        ${person.infected ? '<p>🦠 ติดเชื้อโรคระบาด</p>' : ''}
      </div>
    `;
  } else if (currentTab === 'family') {
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Relationships</h3>
        <div class="dashboard-list">
          ${partner ? `
            <div class="dashboard-list-item" onclick="openPartnerFromPerson('${partner.id}')">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">❤️</span>
                <div>
                  <div class="dashboard-list-item-title">${partner.name}</div>
                  <div class="dashboard-list-item-subtitle">Partner · Age ${partner.age.toFixed(0)}</div>
                </div>
              </div>
              <div class="dashboard-list-item-right">${Math.floor(partner.hp)} HP</div>
            </div>
          ` : `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">💔</span>
                <div>
                  <div class="dashboard-list-item-title">Partner</div>
                  <div class="dashboard-list-item-subtitle">Single</div>
                </div>
              </div>
            </div>
          `}
        </div>
      </div>
      
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Children (${children.length})</h3>
        <div class="dashboard-list">
          ${children.length > 0 ? children.map(child => `
            <div class="dashboard-list-item" onclick="openChildFromPerson('${child.id}')">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">👶</span>
                <div>
                  <div class="dashboard-list-item-title">${child.name}</div>
                  <div class="dashboard-list-item-subtitle">Age ${child.age.toFixed(1)} ${child.alive ? '' : '⚰️'}</div>
                </div>
              </div>
              <div class="dashboard-list-item-right">${Math.floor(child.hp)} HP</div>
            </div>
          `).join('') : '<p class="subtle">ยังไม่มีลูก</p>'}
        </div>
      </div>
    `;
  } else if (currentTab === 'history') {
    const events = (state.events || []).filter(e => e.text && e.text.includes(person.name));
    
    contentHTML = `
      <div class="dashboard-section">
        <h3 class="dashboard-section-title">Life History</h3>
        <div class="dashboard-list">
          ${events.length > 0 ? events.slice(0, 20).map(e => `
            <div class="dashboard-list-item dashboard-list-item--static">
              <div class="dashboard-list-item-left">
                <span class="dashboard-list-item-icon">${e.icon || '📜'}</span>
                <div>
                  <div class="dashboard-list-item-title">${e.text}</div>
                  <div class="dashboard-list-item-subtitle">Year ${e.year || 1} · ${monthLabel(e.month || 1)} · Day ${e.day || 1}</div>
                </div>
              </div>
            </div>
          `).join('') : '<p class="subtle">ยังไม่มีเหตุการณ์สำคัญในชีวิต</p>'}
        </div>
      </div>
    `;
  }
  
  return `
    <div class="dashboard-header">
      <h2 class="dashboard-title">
        <span class="dashboard-title-icon">${speciesInfo.icon}</span>
        ${royalDisplayName(person)}
      </h2>
    </div>
    ${tabsHTML}
    <div class="dashboard-content">
      ${contentHTML}
    </div>
  `;
}

export function getJobIcon(job) {
  const icons = {
    'farmer': '🌾',
    'forager': '🍇',
    'hunter': '🏹',
    'fisher': '🎣',
    'woodcutter': '🪓',
    'miner': '⛏️',
    'builder': '🏗️',
    'claimer': '🗺️',
    'soldier': '⚔️',
    'merchant': '🛒',
    'official': civImageHTML(16),
    'Unemployed': '💤'
  };
  return icons[job] || '💼';
}

export function openPersonFromKingdom(personId) {
  const person = state.units.find(u => String(u.id) === String(personId));
  if (person) {
    openDashboard(DASHBOARD_TYPES.PERSON, person);
  }
}

export function openPartnerFromPerson(partnerId) {
  const partner = state.units.find(u => String(u.id) === String(partnerId));
  if (partner) {
    openDashboard(DASHBOARD_TYPES.PERSON, partner);
  }
}

export function openChildFromPerson(childId) {
  const child = state.units.find(u => String(u.id) === String(childId));
  if (child) {
    openDashboard(DASHBOARD_TYPES.PERSON, child);
  }
}
