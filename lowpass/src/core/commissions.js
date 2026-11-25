import { rng } from './math.js';
import { tierOf, CLEARING } from '../artifacts/tiers.js';

// The Obelisk's commissions (home.js): three a day, the same for every pilot (drawn from
// the day itself, by the clock of the world: UTC), each asking for something brought
// back that day: an artifact of a tier (or rarer) from a kind of place, or the things
// about a clearing. A scan recorded that day that answers one is claimed for its bonus at
// the Obelisk, within reach of its uplink, once by each pilot. A new day, new ones.

const DAY = 86400000;
export const today = (now = Date.now()) => Math.floor(now / DAY);
export const dayStart = (d) => d * DAY;
export const untilTomorrow = (now = Date.now()) => dayStart(today(now) + 1) - now;

const PLACES = [
  ['any', 'in the forest at large', 6], ['mountain', 'on a mountain', 3], ['autumn', 'in a turned stand', 2],
  ['river', 'on a river', 3], ['lake', 'out on a lake', 2], ['desert', 'in the Grey Waste', 1], ['greatlake', 'on the Great Lake', 1],
];
// (how dear each tier asked for is, and how much more a far reach makes it)
const BONUS = { 0: 60, 1: 140, 2: 400, 3: 1200, 4: 4000 };
const REACH = { desert: 2.5, greatlake: 2.5, mountain: 1.3, river: 1.2 };

function pickW(R, list) {
  const sum = list.reduce((s, x) => s + x[2], 0);
  let r = R() * sum;
  for (const x of list) { r -= x[2]; if (r <= 0) return x; }
  return list[list.length - 1];
}

// the day's three: { id, tier, place, words, bonus, clearing }
export function commissionsOf(day = today()) {
  const R = rng((day * 2654435761) >>> 0), out = [], seen = new Set();
  // (three different ones: one that asks what another already asks is drawn again)
  for (let i = 0, tries = 0; out.length < 3 && tries < 40; tries++) {
    const [place, where] = pickW(R, PLACES);
    // one in five, the things about a clearing (not on a lake: a clearing there is an island's)
    if (R() < 0.2 && place !== 'lake' && place !== 'river' && place !== 'mountain') {
      const bonus = Math.round(220 * (REACH[place] || 1) / 10) * 10;
      if (seen.has(`c${place}`)) continue;
      seen.add(`c${place}`);
      out.push({ id: `${day}:${i++}`, clearing: true, place: place === 'any' || place === 'autumn' ? null : place, words: `Something found on foot about a clearing${place === 'desert' ? ' in the Grey Waste' : place === 'greatlake' ? ' on the Great Lake' : ''}`, bonus });
      continue;
    }
    // the tier: mostly an UNCOMMON or a RARE; now and then an EPIC; seldom a LEGENDARY
    const r = R(), tier = r < 0.08 ? 4 : r < 0.3 ? 3 : r < 0.68 ? 2 : r < 0.95 ? 1 : 0;
    // (far reaches ask for less: what stands there is hard enough to come by)
    const t = place === 'desert' || place === 'greatlake' ? Math.min(tier, 2) : tier;
    if (seen.has(`${place}${t}`)) continue;
    seen.add(`${place}${t}`);
    const bonus = Math.round((BONUS[t] * (REACH[place] || 1)) / 10) * 10, name = t ? tierOf(t).name : '';
    out.push({ id: `${day}:${i++}`, tier: t, place, words: `${t ? `${/^[AEIOU]/.test(name) ? 'An' : 'A'} ${name} or rarer` : 'Any artifact'} ${where}`, bonus });
  }
  return out;
}

// does a Codex entry answer a commission (recorded the day it is of)?
export function answers(c, e) {
  if (!e || !e.site || today(e.scannedAt || 0) !== Number(c.id.split(':')[0])) return false;
  if (c.clearing) return !!e.landing && (!c.place || e.place === c.place);
  if (e.landing || e.tier === CLEARING) return false;
  return (e.tier || 0) >= c.tier && (e.place || 'any') === c.place;
}
