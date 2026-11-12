import { NEW_FORMS as A } from './deepforms2.js';
import { NEW_FORMS as B } from './deepforms3.js';
import { TIER_FORMS } from './sets/tiered.js';

// More forms of the deep, from files of their own: each brings its code, class, nouns,
// where it belongs, its parameters and its build (deep.js describes with them,
// deepforms.js builds them; tools/check/ARTIFACTS.md says how one is written, and
// tools/check/formtest.mjs checks it).
//   deepforms2   clockwork, fountain, radiolarian, Chladni plate
//   deepforms3   ringed planet, moth, dandelion, storm of pages
export const NEW_FORMS = { ...A, ...B, ...TIER_FORMS[3], ...TIER_FORMS[4], ...TIER_FORMS[5] };
