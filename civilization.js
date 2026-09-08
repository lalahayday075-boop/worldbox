// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

'use strict';

import { state } from './state.js';
import { civImageHTML, capitalIcon, kingdomIcon, resourceIcon } from './icons.js';

  // --- Culture Identity (per city) -----------------------------------------
  export const CULTURE_IDENTITIES = {
    agrarian: { key: 'agrarian', label: 'Agrarian Culture', thai: 'วัฒนธรรมเกษตรกรรม', icon: resourceIcon('food', 18) },
    commercial: { key: 'commercial', label: 'Commercial Culture', thai: 'วัฒนธรรมพาณิชย์', icon: resourceIcon('gold', 18) },
    militaristic: { key: 'militaristic', label: 'Militaristic Culture', thai: 'วัฒนธรรมนักรบ', icon: '⚔️' },
    maritime: { key: 'maritime', label: 'Maritime Culture', thai: 'วัฒนธรรมทางทะเล', icon: '⚓' },
    scholarly: { key: 'scholarly', label: 'Scholarly Culture', thai: 'วัฒนธรรมนักปราชญ์', icon: '📚' }
  };
  export function computeCultureIdentity(c) {
    const b = c.buildings || {};
    const kingdom = state.kingdoms?.find(k => k.id === c.kingdomId);
    const shipsAtSea = (state.seaTradeRoutes || []).filter(r => !r.broken && (r.cityAId === c.id || r.cityBId === c.id)).length;
    const scores = {
      agrarian: (c.farmAreas || 0) * 1.4 + (b.granary || 0) * 1.2 + Math.min((c.pop || 0) / 20, 3),
      commercial: (b.market || 0) * 2.5 + (b.workshop || 0) * 1 + Math.min((kingdom?.gold || 0) / 80, 3),
      militaristic: (b.barracks || 0) * 2.5 + (b.fort || 0) * 3,
      maritime: ((b.port || 0) > 0 ? 3 : 0) + (b.fishingDock || 0) * 1.5 + shipsAtSea * 1.5,
      scholarly: (b.school || 0) * 2 + (b.library || 0) * 2.5 + Math.min((c.cultureLevel || 1) / 3, 3)
    };
    let best = null, bestScore = 2.2;
    for (const key of Object.keys(scores)) if (scores[key] > bestScore) { bestScore = scores[key]; best = key; }
    return best ? CULTURE_IDENTITIES[best] : null;
  }

  // --- Kingdom Development Tier ---------------------------------------------
  export const KINGDOM_TIERS = [
    { min: 0, key: 'tribe', label: 'Tribe', thai: 'เผ่า', icon: '🔥' },
    { min: 12, key: 'chiefdom', label: 'Chiefdom', thai: 'หัวหน้าเผ่า', icon: '🪶' },
    { min: 28, key: 'kingdom', label: 'Kingdom', thai: 'ราชอาณาจักร', icon: kingdomIcon(18) },
    { min: 50, key: 'greatKingdom', label: 'Great Kingdom', thai: 'มหาอาณาจักร', icon: capitalIcon(18) },
    { min: 75, key: 'empire', label: 'Empire', thai: 'จักรวรรดิ', icon: civImageHTML(18) }
  ];
  export function kingdomTierScore(kingdom, cities) {
    const population = cities.reduce((sum, c) => sum + (c.pop || 0), 0);
    const territory = cities.reduce((sum, c) => sum + (c.claimedTiles || []).length, 0);
    const avgCulture = cities.length ? cities.reduce((sum, c) => sum + (c.cultureLevel || 1), 0) / cities.length : 1;
    const militaryBuildings = cities.reduce((sum, c) => sum
      + (c.buildings?.barracks || 0) * 2 + (c.buildings?.fort || 0) * 3 + (c.buildings?.port || 0), 0);
    return cities.length * 4
      + Math.min(population / 12, 20)
      + Math.min(territory / 120, 12)
      + Math.min((kingdom.gold || 0) / 150, 10)
      + Math.min(avgCulture * 2.8, 32)
      + Math.min(militaryBuildings * 1.5, 12);
  }
  export function computeKingdomTier(kingdom, cities) {
    const score = kingdomTierScore(kingdom, cities);
    let tier = KINGDOM_TIERS[0];
    for (const t of KINGDOM_TIERS) { if (score >= t.min) tier = t; else break; }
    return { key: tier.key, label: tier.label, thai: tier.thai, icon: tier.icon, score };
  }
