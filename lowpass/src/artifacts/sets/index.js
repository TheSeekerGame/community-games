import { SET as SIGNALS } from './signals.js';
import { SET as PLACES } from './places.js';
import { SET as WATERS } from './waters.js';
import { SET as HEIGHTS } from './heights.js';
import { TIER_SETS } from './tiered.js';

// More families of wild artifacts, each set in a file of its own: every family brings its
// code, class, nouns, place, kin (the deep forms it is at heart), voice, parameters and
// build (generate.js and models.js take them from here; tools/check/ARTIFACTS.md says how
// one is written, and tools/check/settest.mjs checks it).
//   signals   instruments of signal and measure, left running (the forest at large)
//   places    places somebody built and left (the forest at large)
//   waters    what stands on the lakes, and three more of the rivers'
//   heights   five more of the mountains', four more of the turned stands'
// (the rare tiers' own families are among them too: tiered.js; BASE_EXTRA, the four sets alone)
export const BASE_EXTRA = { ...SIGNALS, ...PLACES, ...WATERS, ...HEIGHTS };
export const EXTRA = { ...BASE_EXTRA, ...TIER_SETS[3], ...TIER_SETS[4], ...TIER_SETS[5] };
