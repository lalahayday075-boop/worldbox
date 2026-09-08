// WORLD SIMULATOR — FILE RULES
// 1) Keep this file in the flattened project root/relative path when packaging; never add a second project-folder layer.
// 2) Preserve ES-module import paths and shared-state contracts when editing.
// 3) Keep mobile performance responsive: avoid per-frame allocations/DOM work unless explicitly required.
// 4) Settings with choices must have exactly one visible active option per setting row.
// 5) Keep this header at the top of the file when making future edits.

'use strict';

import { state } from './state.js';

  export const PERSON_NAMES = {
    human: [
      'Aldric', 'Branwen', 'Corin', 'Dara', 'Elias', 'Fenwick', 'Garrick', 'Halden', 'Isolde', 'Joric',
      'Kestrel', 'Liora', 'Merrin', 'Nolan', 'Osric', 'Petra', 'Quinlan', 'Roderic', 'Selene', 'Tobias',
      'Ulric', 'Varric', 'Wynn', 'Yara', 'Zelia', 'Alaric', 'Beatrix', 'Cedric', 'Dorian', 'Edda',
      'Faelan', 'Gwyn', 'Hendrik', 'Idris', 'Jocelyn', 'Kendra', 'Lucan', 'Mabel', 'Nerys', 'Orin',
      'Perrin', 'Quenna', 'Rosalind', 'Stellan', 'Thessaly', 'Ursa', 'Vance', 'Willa', 'Yorick', 'Zara',
      'Aldous', 'Brigid', 'Corvin', 'Delphine', 'Ewan', 'Freya', 'Gideon', 'Hesper', 'Ingrid', 'Jarek',
      'Katrin', 'Leofric', 'Maren', 'Nathaniel', 'Oswin', 'Prisca', 'Rowena', 'Silas', 'Tamsin', 'Uwen'
    ],
    elf: [
      'Aelindra', 'Silvyn', 'Thalorien', 'Galewyn', 'Liriel', 'Miravel', 'Aelric', 'Faelara', 'Ysolwen', 'Caelith',
      'Nymera', 'Orindiel', 'Sylwen', 'Ithariel', 'Faenor', 'Loreleth', 'Amariel', 'Ryelara', 'Thessalin', 'Vaelith',
      'Elowyn', 'Calanthe', 'Erevan', 'Fenlyra', 'Galadwen', 'Halindir', 'Idrisiel', 'Jorwyn', 'Keleth', 'Lunariel',
      'Maevyn', 'Nirien', 'Oralyn', 'Peresil', 'Quenithra', 'Rosendil', 'Sarethiel', 'Talwen', 'Uliriel', 'Vaenor',
      'Ashariel', 'Brelindra', 'Cyrindil', 'Dawnwyn', 'Eirendil', 'Feriel', 'Glimmerin', 'Haelith', 'Isarien', 'Jaelara',
      'Kaelweth', 'Lynthiel', 'Moriel', 'Nerathil', 'Ondriel', 'Praxiel', 'Quilweth', 'Rendiel', 'Serathiel', 'Tirenya'
    ],
    dwarf: [
      'Borgrim', 'Durnak', 'Thokka', 'Balgrun', 'Kazdur', 'Ungrim', 'Norrik', 'Thrainar', 'Drorgan', 'Kragnar',
      'Brammor', 'Fjornik', 'Grudmar', 'Haldrek', 'Korrgan', 'Mundrik', 'Skornath', 'Vundgar', 'Aldrek', 'Brokkin',
      'Durga', 'Emrik', 'Fondra', 'Gundra', 'Halvik', 'Ivora', 'Jorndal', 'Korrin', 'Lundra', 'Morvath',
      'Nordrek', 'Odgrim', 'Rurik', 'Skalda', 'Thundra', 'Uldrik', 'Vorna', 'Wynnrik', 'Yorgun', 'Zaldor',
      'Baldrik', 'Corrag', 'Dregnar', 'Elgrun', 'Frostbeard', 'Gorrim', 'Hilda', 'Ingrun', 'Kolgrim', 'Magra'
    ],
    orc: [
      'Grokash', 'Uzgar', 'Moghul', 'Thragka', 'Snarluk', 'Gulnak', 'Krugor', 'Rokthar', 'Zugrash', 'Vorgun',
      'Drokka', 'Gnashra', 'Hurlok', 'Kronag', 'Murgak', 'Skralth', 'Torgul', 'Uggrash', 'Vragmar', 'Yarkash',
      'Bogrun', 'Charug', 'Dushak', 'Fenrak', 'Gorash', 'Hokgul', 'Ikthar', 'Jomrak', 'Kashna', 'Lugrath',
      'Morzug', 'Nakthar', 'Oghrun', 'Pragka', 'Ruskol', 'Shakur', 'Tolgak', 'Ushnar', 'Varkul', 'Wugash',
      'Akthul', 'Brakor', 'Chugash', 'Drenak', 'Erkul', 'Fugrath', 'Gashnak', 'Harzul', 'Ikron', 'Jagthar'
    ]
  };

  export const DYNASTY_NAMES = {
    human: [
      'House Ashford', 'House Blackwood', 'House Dunmoor', 'House Emberfall', 'House Greywatch',
      'House Hartwell', 'House Ironvale', 'House Kestrelmoor', 'House Lakeshire', 'House Merrowick',
      'House Norwyn', 'House Osgrave', 'House Pendrake', 'House Ravensworth', 'House Stormbrook',
      'House Thornfield', 'House Valemont', 'House Wyndham', 'House Brackenfell', 'House Caldwyn',
      'House Draymoor', 'House Elmsworth', 'House Faircrest', 'House Graymark'
    ],
    elf: [
      'House Silverleaf', 'House Moonshade', 'House Starweaver', 'House Faelindor', 'House Nightbloom',
      'House Sylvaris', 'House Whisperwind', 'House Duskthorn', 'House Dawnglass', 'House Ivywhisper',
      'House Amberlight', 'House Willowmere', 'House Thistledown', 'House Wraithsong', 'House Glimmerfall',
      'House Verdanthil', 'House Lorewhisper', 'House Aeloria', 'House Frostbloom', 'House Rivenshade',
      'House Elenwyth', 'House Cindervale', 'House Halewind', 'House Mistleaf'
    ],
    dwarf: [
      'Clan Ironfist', 'Clan Stonehammer', 'Clan Deepdelve', 'Clan Grimforge', 'Clan Ashenbeard',
      'Clan Coalspine', 'Clan Granitehold', 'Clan Emberfist', 'Clan Ironvein', 'Clan Boulderguard',
      'Clan Steelroot', 'Clan Deepforge', 'Clan Runehammer', 'Clan Blackanvil', 'Clan Ironroot',
      'Clan Mournstone', 'Clan Copperbeard', 'Clan Frosthelm', 'Clan Cragmantle', 'Clan Underhold',
      'Clan Silverdelve', 'Clan Emberforge', 'Clan Stonewright', 'Clan Ironbrow'
    ],
    orc: [
      'Bloodfang Tribe', 'Ironjaw Clan', 'Skullcrusher Tribe', 'Ashenhide Clan', 'Warlord Tribe',
      'Blackfang Clan', 'Ragebound Tribe', 'Savage Clan', 'Grimtusk Tribe', 'Bonecrush Clan',
      'Direfang Tribe', 'Ironhide Clan', 'Doomtusk Tribe', 'Redmaw Clan', 'Skarhide Tribe',
      'Warhowl Clan', 'Grimjaw Tribe', 'Bloodhorn Clan', 'Nightfang Tribe', 'Ashclaw Clan',
      'Skullbane Tribe', 'Ironscar Clan', 'Rustfang Tribe', 'Deathmaw Clan'
    ]
  };

  export function generatePersonName(race) {
    const list = PERSON_NAMES[race] || PERSON_NAMES.human;
    return list[Math.floor(Math.random() * list.length)];
  }

  export function generateDynastyName(race) {
    const list = DYNASTY_NAMES[race] || DYNASTY_NAMES.human;
    const used = new Set((state.kingdoms || []).filter(k => k.race === race).map(k => k.dynastyName));
    const available = list.filter(n => !used.has(n));
    const pool = available.length ? available : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  export function royalDisplayName(u) {
    if (!u) return '';
    return u.houseName ? `${u.name} of ${u.houseName}` : (u.name || '');
  }

  export const NAME_PARTS = {
    human: {
      cityPre: ['Ash', 'Bran', 'Corw', 'Dun', 'Ell', 'Fen', 'Gar', 'Hal', 'Ing', 'Kel', 'Lor', 'Mor', 'Nor', 'Os', 'Pel', 'Rav', 'Sil', 'Thorn', 'Val', 'Wyn',
        'Aud', 'Brack', 'Cald', 'Drav', 'Eld', 'Falk', 'Grev', 'Holt', 'Ivar', 'Jor', 'Kest', 'Lund', 'Marr', 'Nash', 'Orv', 'Prest', 'Roth', 'Stag', 'Tull', 'Wren'],
      citySuf: ['ford', 'ham', 'wick', 'ton', 'burg', 'haven', 'shire', 'field', 'moor', 'dale', 'port', 'crest', 'stead', 'ridge', 'hollow',
        'brook', 'bury', 'mont', 'reach', 'watch', 'gate', 'mere', 'wood', 'vale', 'holm'],
      kingAdj: ['Silver', 'Golden', 'Iron', 'Azure', 'Crimson', 'Emerald', 'Northern', 'Southern', 'Amber', 'United',
        'Radiant', 'Sovereign', 'Ivory', 'Sapphire', 'Eastern', 'Western', 'Highland', 'Ancient', 'Noble', 'Bright'],
      kingNoun: ['Kingdom', 'Realm', 'Dominion', 'Crown', 'Throne', 'March', 'Domain',
        'Commonwealth', 'Union', 'Provinces', 'Empire', 'League']
    },
    elf: {
      cityPre: ['Sil', 'Ela', 'Thal', 'Gal', 'Lir', 'Mira', 'Ael', 'Fael', 'Ysa', 'Cael', 'Nym', 'Ori', 'Syl', 'Ith', 'Faen', 'Lorel', 'Amar', 'Ryel', 'Thessa', 'Vael',
        'Eryn', 'Cala', 'Duna', 'Feri', 'Glim', 'Hale', 'Ivel', 'Jael', 'Kael', 'Lyra', 'Miren', 'Naeva', 'Orweth', 'Pral', 'Quil', 'Reneth', 'Sera', 'Tira', 'Ulwen', 'Vira'],
      citySuf: ['wynn', 'loth', 'iel', 'wood', 'glen', 'mere', 'anor', 'thil', 'vale', 'light',
        'shade', 'spire', 'haven', 'song', 'bloom', 'star', 'wisp', 'dell', 'brier', 'moon',
        'leaf', 'gale', 'wisp', 'thorn', 'welyn'],
      kingAdj: ['Silverleaf', 'Moonlit', 'Starlit', 'Emerald', 'Whispering', 'Twilight', 'Verdant',
        'Silvern', 'Dawnlit', 'Gilded', 'Faewild', 'Hallowed', 'Ethereal', 'Moonveiled', 'Sunlit',
        'Gossamer', 'Amberwood', 'Wildbloom', 'Starbound', 'Everleaf'],
      kingNoun: ['Enclave', 'Grove', 'Realm', 'Dominion', 'Sanctuary', 'Vale', 'Court', 'Circle', 'Wilds', 'Spire', 'Glade', 'Canopy']
    },
    dwarf: {
      cityPre: ['Bor', 'Dur', 'Grim', 'Thok', 'Bal', 'Kaz', 'Ung', 'Norr', 'Thrain', 'Dror', 'Krag', 'Old', 'Bram', 'Fjorn', 'Grud', 'Hald', 'Korr', 'Mund', 'Skorn', 'Vundir',
        'Brok', 'Cor', 'Dreg', 'Emrik', 'Fond', 'Gund', 'Halv', 'Ivor', 'Jorn', 'Korn', 'Lund', 'Morv', 'Nord', 'Odgrim', 'Rurik', 'Skald', 'Thund', 'Uldrik', 'Vorn', 'Wynr'],
      citySuf: ['forge', 'hold', 'kar', 'din', 'gard', 'morn', 'hammer', 'stone', 'delve', 'peak',
        'anvil', 'vault', 'crag', 'shaft', 'mine', 'bastion', 'wall', 'keep', 'gate', 'deep',
        'root', 'beard', 'axe', 'helm', 'ore'],
      kingAdj: ['Ironhold', 'Stonefast', 'Deepforge', 'Granite', 'Ironclad', 'Runic',
        'Bronzeclad', 'Steelheart', 'Mountainborn', 'Emberforged', 'Adamant', 'Grimstone',
        'Frostbound', 'Copperhold', 'Coalfired', 'Underdeep', 'Boulderborn', 'Anvilbound', 'Silverore', 'Deeprooted'],
      kingNoun: ['Hold', 'Clan', 'Dominion', 'Stronghold', 'Bastion', 'Kinship', 'Delving', 'Enclave', 'Vault', 'Mantle', 'Anvilhome', 'Deep']
    },
    orc: {
      cityPre: ['Grok', 'Uzk', 'Mog', 'Thrag', 'Snarl', 'Gul', 'Krug', 'Rok', 'Zug', 'Vor', 'Drok', 'Gnash', 'Hurl', 'Kron', 'Murg', 'Skral', 'Torg', 'Uggr', 'Vrag', 'Yark',
        'Bog', 'Char', 'Dush', 'Fenr', 'Gora', 'Hokg', 'Ikth', 'Jomr', 'Kash', 'Lugr', 'Morz', 'Nakt', 'Oghr', 'Prag', 'Rusk', 'Shak', 'Tolg', 'Ushn', 'Vark', 'Wug'],
      citySuf: ['gash', 'maw', 'skull', 'fang', 'burn', 'pit', 'tusk', 'grot', 'warg', 'spike',
        'claw', 'rend', 'gore', 'thorn', 'ruin', 'crag', 'howl', 'ash', 'bane', 'scar',
        'jaw', 'fist', 'hide', 'wound', 'brand'],
      kingAdj: ['Bloodfang', 'Ironjaw', 'Skullcrusher', 'Dark', 'Ashen', 'Warlord',
        'Blackfang', 'Ragebound', 'Savage', 'Grimtusk', 'Ironhide', 'Bonecrush',
        'Direfang', 'Doomtusk', 'Redmaw', 'Skarhide', 'Warhowl', 'Bloodhorn', 'Nightfang', 'Ashclaw'],
      kingNoun: ['Horde', 'Warband', 'Dominion', 'Clan', 'Warcamp', 'Legion', 'Warhost', 'Tribe', 'Warfront', 'Bloodpact', 'Ruin', 'Scourge']
    }
  };
  export function generateCityName(race) {
    const parts = NAME_PARTS[race] || NAME_PARTS.human;
    const existing = new Set(state.cities.map(c => c.name));
    for (let i = 0; i < 20; i++) {
      const name = parts.cityPre[Math.floor(Math.random() * parts.cityPre.length)]
        + parts.citySuf[Math.floor(Math.random() * parts.citySuf.length)];
      if (!existing.has(name)) return name;
    }
    return `${parts.cityPre[0]}${parts.citySuf[0]} ${state.cities.length + 1}`;
  }
  export function generateKingdomName(race) {
    const parts = NAME_PARTS[race] || NAME_PARTS.human;
    const existing = new Set(state.kingdoms.map(k => k.name));
    for (let i = 0; i < 20; i++) {
      const name = `${parts.kingAdj[Math.floor(Math.random() * parts.kingAdj.length)]} ${parts.kingNoun[Math.floor(Math.random() * parts.kingNoun.length)]}`;
      if (!existing.has(name)) return name;
    }
    return `${parts.kingAdj[0]} ${parts.kingNoun[0]} ${state.kingdoms.length + 1}`;
  }
