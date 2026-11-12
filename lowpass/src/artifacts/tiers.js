// Rarity: every artifact site has a tier, drawn from its seed like everything else about
// it (sites.js), the same for every ship. A tier is its own world of art: the families
// that stand at the surface, the true forms over them, and what gathers about those, all
// its own; and the rarer, the more a scan of it is worth, the farther off it is heard,
// and the higher its light stands over the forest (layers.js), so a pilot told of one
// can find it from far away.
//
//   COMMON      the forest's own: the first families
//   UNCOMMON    the sets (signals, places, waters, heights)
//   RARE        the grandest of both, always grand, and the newest true forms
//   EPIC        families of their own (sets/epic.js), the traces, forms of their own
//   LEGENDARY   families of their own (sets/legendary.js); the marked forms and two more
//   MYTHIC      landmarks (sets/mythic.js), forms of their own: perhaps one pilot in a
//               hundred ever finds one
//
// The tiers' own sets and forms are optional imports: a tier with none yet falls back to
// the one below it.

import { BASE_EXTRA as EXTRA } from './sets/index.js';
import { TIER_SETS, TIER_FORMS } from './sets/tiered.js';
import { REACH_SETS } from './sets/reaches.js';

export const TIERS = [
  { id: 'common', name: 'COMMON', p: 0, value: 1, hear: 1, least: 0, deeper: 0.6, color: '#aebdc4', hex: 0xaebdc4 },
  { id: 'uncommon', name: 'UNCOMMON', p: 0.24, value: 2, hear: 1.15, least: 1, deeper: 0.62, color: '#8fd4a8', hex: 0x8fd4a8 },
  { id: 'rare', name: 'RARE', p: 0.075, value: 5, hear: 1.45, least: 2, deeper: 0.66, color: '#7cc4ff', hex: 0x7cc4ff },
  { id: 'epic', name: 'EPIC', p: 0.02, value: 15, hear: 1.9, least: 3, deeper: 0.7, color: '#b48cff', hex: 0xb48cff },
  { id: 'legendary', name: 'LEGENDARY', p: 0.0025, value: 60, hear: 2.7, least: 4, deeper: 0.74, color: '#ffd27a', hex: 0xffd27a },
  { id: 'mythic', name: 'MYTHIC', p: 0.00025, value: 400, hear: 4, least: 5, deeper: 0.8, color: '#ff9be6', hex: 0xff9be6 },
  // (not an artifact's: a clearing to land in, as common as an UNCOMMON, with its own
  // name and lantern color; never drawn, sites.js says which sites are clearings)
  { id: 'clearing', name: 'CLEARING', p: 0, value: 2, hear: 1.15, least: 0, deeper: 0, color: '#ffb36b', hex: 0xffb36b },
];
export const CLEARING = 6;
export const tierOf = (n) => TIERS[Math.max(0, Math.min(TIERS.length - 1, n | 0))];

// a tier from a uniform draw u in [0, 1): the rarest first
export function drawTier(u) {
  let acc = 0;
  for (let t = TIERS.length - 1; t >= 1; t--) { acc += TIERS[t].p; if (u < acc) return t; }
  return 0;
}

// the first families (generate.js), split: those the RARE tier takes
const RARE = {
  any: ['orrery', 'tesseract', 'beacon', 'arbor', 'lens', 'wreck', 'carillon', 'labyrinth', 'amphitheatre', 'tensegrity', 'belljars', 'heliostat'],
  mountain: ['observatory', 'ice', 'cablecar', 'eyrie'],
  autumn: ['hearth', 'chrysalis', 'fairyring'],
  river: ['drowned', 'naturalbridge', 'lanternboats'],
  lake: ['sunkenbell', 'tesseract'],
};
const RARE_ALL = new Set(Object.values(RARE).flat());
// the newest true forms belong to the RARE tier alone
export const RARE_FORMS = ['clockwork', 'fountain', 'radiolarian', 'chladni', 'planet', 'moth', 'dandelion', 'pages'];
export const LEGENDARY_FORMS = ['tree', 'vortex', 'mobius', 'menger', 'whale'];

// The families a site of a tier may hold, at a place. base: generate.js's own pools by
// place ({ any, mountain, autumn, river, lake } of the first families, and FLOATERS).
export function familiesFor(tier, place, base) {
  // the reaches (terrain.js): their own, of the tier (or the nearest tier below that has
  // any); without any, what the forest at large or a lake would hold
  if (place === 'desert' || place === 'greatlake') {
    for (let t = tier; t >= 0; t--) {
      const own = Object.keys(REACH_SETS).filter((k) => REACH_SETS[k].place === place && (REACH_SETS[k].tier | 0) === t);
      if (own.length) return own;
    }
    return familiesFor(tier, place === 'desert' ? 'any' : 'lake', base);
  }
  const extra = (pl) => Object.keys(EXTRA).filter((k) => EXTRA[k].place === pl && !RARE_ALL.has(k));
  if (tier === 0) {
    const list = (place === 'lake' ? base.floaters : base[place] || base.any).filter((f) => !RARE_ALL.has(f));
    return list.length ? list : base.any.filter((f) => !RARE_ALL.has(f));
  }
  if (tier === 1) {
    const list = extra(place);
    return list.length ? list : familiesFor(0, place, base);
  }
  if (tier === 2) return RARE[place] && RARE[place].length ? RARE[place] : RARE.any;
  // the tiers' own sets: anything stands on any ground; on water only what floats
  const set = TIER_SETS[tier] || {};
  const water = place === 'lake' || place === 'river';
  let list = Object.keys(set).filter((k) => !water || set[k].floats);
  if (tier === 3 && place === 'any') list = [...list, 'trace'];
  if (!list.length) return familiesFor(tier - 1, place, base);
  return list;
}

// The true forms a site's artifact may have, by its tier (null: its family's kin, as
// ever). For the tiers above RARE, their own forms; for RARE, the newest.
export function formsFor(tier) {
  if (tier === 2) return RARE_FORMS;
  if (tier >= 3) {
    const own = Object.keys(TIER_FORMS[tier] || {});
    const list = tier === 4 ? [...LEGENDARY_FORMS, ...own] : own;
    return list.length ? list : formsFor(tier - 1);
  }
  return null;
}
// forms no common or uncommon artifact may have
export const RESERVED_FORMS = () => new Set([...RARE_FORMS, ...LEGENDARY_FORMS, ...[3, 4, 5].flatMap((t) => Object.keys(TIER_FORMS[t] || {}))]);
