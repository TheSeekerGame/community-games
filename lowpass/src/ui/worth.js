import { sitesNear, siteByKey } from '../world/sites.js';
import { valueOf } from '../core/progress.js';
import { tierOf } from '../artifacts/tiers.js';

// What a place another pilot found is worth to this one: to help choose whether to make
// the trip. Every site can be worked out again from where it is (sites.js), so this is
// exact, not a guess: its tier, and the DATA a scan of it would bring this pilot, attuned
// as far as they are (the layers they would see), less what they were paid for it before.

const _cache = new Map();

// the site at a place (and of a seed, if given), or null
export function siteAt(x, z, seed = null) {
  const k = `${Math.round(x)},${Math.round(z)},${seed || ''}`;
  if (_cache.has(k)) return _cache.get(k);
  const { sites } = sitesNear(x, z, 90, 1e9);
  let best = null, bd = Infinity;
  for (const s of sites) {
    if (seed && s.seed !== seed) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  if (_cache.size > 500) _cache.clear();
  _cache.set(k, best);
  return best;
}
export const siteOfKey = (key) => siteByKey(key);

// { T (its tier), data (what a scan brings now), recorded, more (more to see than was
// recorded), seen, res } for a site's artifact; null for anything else
export function worthOf(g, site) {
  if (!site || site.kind !== 'artifact') return null;
  const res = site.res || 0, seen = Math.min(g.progress.depth, res), tier = site.tier || 0;
  const v = valueOf({ kind: 'wild', depth: seen, tier, river: site.place === 'river' });
  const rec = g.recorded(site.seed);
  if (!rec) return { T: tierOf(tier), tier, data: v, recorded: false, more: false, seen, res };
  const had = (rec.depth || 0) >= seen;
  return { T: tierOf(tier), tier, data: had ? 0 : Math.max(0, v - valueOf(rec)), recorded: true, more: !had, seen, res };
}

// in words, short: "~1,200 DATA", "+300 DATA MORE", "RECORDED"
export function worthWords(w, fmt) {
  if (!w) return '';
  if (w.recorded && !w.more) return 'RECORDED';
  return w.recorded ? `+${fmt(w.data)} DATA MORE` : `~${fmt(w.data)} DATA`;
}
