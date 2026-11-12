import * as DESERT from './curios_desert.js';
import * as LAKE from './curios_lake.js';

// The reaches' own things about a clearing (terrain.js: the Grey Waste, the Great Lake),
// each a set as curios.js's own: { CURIOS, INFO, KINDS }.
//   curios_desert.js   about a clearing out in the Grey Waste
//   curios_lake.js     on an island of the Great Lake
export const REACH_CURIOS = {
  desert: { CURIOS: DESERT.CURIOS, INFO: DESERT.INFO, KINDS: DESERT.KINDS },
  greatlake: { CURIOS: LAKE.CURIOS, INFO: LAKE.INFO, KINDS: LAKE.KINDS },
};
