import { SET as DESERT } from './desert.js';
import { SET as DESERT2 } from './desert2.js';
import { SET as LAKE } from './greatlake.js';
import { SET as LAKE2 } from './greatlake2.js';

// The two reaches' own families (terrain.js: the Grey Waste, the Great Lake), every tier
// of them: each entry carries its tier (tiers.js) and its place, 'desert' or 'greatlake'.
//   desert.js, desert2.js         the Grey Waste's (COMMON to RARE; EPIC to MYTHIC)
//   greatlake.js, greatlake2.js   the Great Lake's
export const REACH_SETS = { ...DESERT, ...DESERT2, ...LAKE, ...LAKE2 };
