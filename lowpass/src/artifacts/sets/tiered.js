import { SET as MYTHIC } from './mythic.js';
import { SET as LEGENDARY } from './legendary.js';
import { SET as EPIC } from './epic.js';
import { NEW_FORMS as MYTHIC_FORMS } from '../deepforms5.js';
import { NEW_FORMS as FORMS4 } from '../deepforms4.js';

// deepforms4 holds the EPIC forms and two of the LEGENDARY
const pick = (ids) => Object.fromEntries(ids.filter((k) => FORMS4[k]).map((k) => [k, FORMS4[k]]));
const EPIC_FORMS = pick(['hopf', 'vessel', 'drum']);
const LEGENDARY_FORMS = pick(['seedhead', 'skyloom']);

// The rare tiers' own art (tiers.js): their families at the surface, and their true forms.
//   epic.js, legendary.js, mythic.js     the families (each a SET, as the other sets)
//   ../deepforms4.js, ../deepforms5.js   the forms (each NEW_FORMS, as deepforms2.js)
// by tier: 3 EPIC, 4 LEGENDARY, 5 MYTHIC
export const TIER_SETS = { 3: EPIC, 4: LEGENDARY, 5: MYTHIC };
export const TIER_FORMS = { 3: EPIC_FORMS, 4: LEGENDARY_FORMS, 5: MYTHIC_FORMS };
