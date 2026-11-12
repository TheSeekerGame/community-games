import { rng, clamp, TAU } from '../core/math.js';
// (placed on the ground as it was before the reaches: heightBase; terrain.js)
import { heightBase as height, height as heightNow, WATER, mountainEnv, autumn, riverAt, riverOf, RCELL, RN, desertEnv, lakeEnv } from './terrain.js';
import { drawTier, tierOf, CLEARING } from '../artifacts/tiers.js';

// The sites: where the artifacts stand. Nothing is spawned for anyone: every artifact has
// its place, a pure function of the world's seed and its coordinates, the same for every
// ship that comes there, today or in a year. A pilot who gives another the coordinates
// gives them the artifact.
//
// Two kinds of place:
//   - the forest at large: a grid of cells CELL meters on a side, about one in seven
//     holding one site, set where the cell is most itself (on a summit if it has
//     mountains, in a turned stand, out on a lake, else on plain ground away from the
//     rivers);
//   - the rivers: some hold one site down their course, and a few one out on the lake
//     they end in.
// Few enough that each is worth the flight (about four in a hundred square kilometers).
// What a site holds is drawn from its seed: mostly an artifact; now and then life (a herd
// at a shore, a shoal, a flock, an owl by night), a creature that flees, or a clearing to
// land in. An artifact's tier (tiers.js: COMMON to MYTHIC, each rarer by far than the
// last) is drawn here, and its resonance (how many layers lie hidden in it, for those
// attuned: without end, each rarer than the last, and the rarer the tier, the more).

export const WORLD = 'low-pass:2';       // the world's seed (change it, and every site moves)
export const CELL = 2200;
const SITE_P = 0.14;
const RIVER_P = 0.4, LAKE_P = 0.2;     // a river holds a site this often; the lake it ends in
// how far the ship's receiver hears a site's signal, by the gain's level (progress.js)
export const HEAR = [2500, 2900, 3300, 3800, 4400, 5000];
export const FAINT = 9000;            // with nothing in range, the nearest is still heard, faintly, this far

const P_LIFE = 0.17, P_CREATURE = 0.07, P_LANDING = 0.09;
const NO_RES = 0.15;                    // a site has no resonance at all (a common one); else each layer more, as likely as its tier says

// two 32-bit hashes of a string (FNV-1a, two bases): 64 bits to seed a site with
function hash64(str) {
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0; b ^= b >>> 13;
  }
  return [a >>> 0, (b ^ (a >>> 7)) >>> 0];
}
// a site's seed, as a transaction's hash is one: 256 bits, in hex
function seedOf(key) {
  const [a, b] = hash64(`${WORLD}|${key}`), A = rng(a), B = rng(b);
  let h = '0x';
  for (let i = 0; i < 4; i++) h += Math.floor(A() * 4294967296).toString(16).padStart(8, '0') + Math.floor(B() * 4294967296).toString(16).padStart(8, '0');
  return h;
}

// how many layers a site holds
function resonance(R, least = 0, deeper = 0.66) {
  if (!least && R() < NO_RES) return 0;
  let r = Math.max(1, least);
  while (R() < deeper) r++;
  return r;
}

// open water: the lake a few boat-lengths every way
const open = (x, z, r = 22) => height(x, z) < WATER - 2.5 && height(x + r, z) < WATER - 1 && height(x - r, z) < WATER - 1 && height(x, z + r) < WATER - 1 && height(x, z - r) < WATER - 1;
// the highest ground near (x, z): a summit, a ridge
function summit(x, z) {
  let best = [x, z, height(x, z)];
  for (const [step, reach] of [[40, 160], [10, 40]]) {
    const [cx, cz] = best;
    for (let j = -reach; j <= reach; j += step) for (let i = -reach; i <= reach; i += step) {
      const h = height(cx + i, cz + j);
      if (h > best[2]) best = [cx + i, cz + j, h];
    }
  }
  return best;
}
// the flattest dry ground near (x, z)
function flat(x, z) {
  let best = [x, z], score = Infinity;
  for (let j = -120; j <= 120; j += 30) for (let i = -120; i <= 120; i += 30) {
    const cx = x + i, cz = z + j, hs = [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24], [17, 17], [-17, -17]].map(([dx, dz]) => height(cx + dx, cz + dz));
    if (Math.min(...hs) < WATER + 1.5) continue;
    const s = Math.max(...hs) - Math.min(...hs) + Math.hypot(i, j) * 0.01;
    if (s < score) { score = s; best = [cx, cz]; }
  }
  return best;
}
// a shore near (x, z) (ground just over the water), and open water near it; null if none
function shore(x, z) {
  for (let r = 0; r <= 360; r += 40) for (let i = 0; i < (r ? 12 : 1); i++) {
    const a = (i / 12) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, h = height(px, pz);
    if (h > WATER + 0.4 && h < WATER + 3) return [px, pz];
  }
  return null;
}
function water(x, z) {
  for (let r = 0; r <= 360; r += 40) for (let i = 0; i < (r ? 12 : 1); i++) {
    const a = (i / 12) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (open(px, pz, 18)) return [px, pz];
  }
  return null;
}

// what a site holds, from its seed (everything but where it is)
function fill(site, R) {
  const p = site.place;
  const r = R();
  // on plain ground, now and then: a clearing to land in, a creature, life
  if (p === 'any' && r < P_LANDING) {
    site.kind = 'landing';
    [site.x, site.z] = flat(site.x, site.z);
    // (a clearing, as common as an UNCOMMON artifact: clearing())
    return clearing(site);
  }
  if ((p === 'any' || p === 'autumn') && r < P_LANDING + P_CREATURE) {
    site.kind = 'creature';
    site.res = R() < 0.5 ? resonance(R, 1) : 0;
    return site;
  }
  if ((p === 'any' || p === 'lake') && r < P_LANDING + P_CREATURE + P_LIFE) {
    site.kind = 'life';
    site.res = R() < 0.3 ? resonance(R, 1) : 0;
    const want = R();
    const w = p === 'lake' ? [site.x, site.z] : want < 0.35 ? water(site.x, site.z) : null;
    const sh = !w && want < 0.7 ? shore(site.x, site.z) : null;
    if (w) { site.species = 'fish'; [site.x, site.z] = w; }
    else if (sh) { site.species = 'deer'; [site.x, site.z] = sh; }
    else if (R() < 0.28) { site.species = 'owl'; site.night = true; }     // (met by night only)
    else site.species = 'flock';
    if (p === 'lake' && site.species !== 'fish') return null;
    site.place = 'any';
    return site;
  }
  site.kind = 'artifact';
  // its tier (tiers.js): the rarer, the more layers in it
  site.tier = drawTier(R());
  const T = tierOf(site.tier);
  site.res = resonance(R, T.least, T.deeper);
  return site;
}

// A site laid over since by one of the reaches (terrain.js: the Grey Waste, the Great
// Lake) stands where it stood, and is now that reach's own: an artifact of the reach's
// families, whatever it held before (its tier and layers kept, if it was an artifact).
// (a clearing stays one: out in the Waste on the sand as it is; on the Great Lake, on
// the nearest island with flat ground enough to come down on, if there is one near)
function reach(s) {
  if (!s) return s;
  const de = desertEnv(s.x, s.z), le = lakeEnv(s.x, s.z);
  if (de < 0.5 && le < 0.5) return s;
  s.place = de >= 0.5 ? 'desert' : 'greatlake';
  if (s.kind === 'landing') {
    // (on the Waste's edge, where the forest still stands, it is the forest's clearing)
    if (s.place === 'desert') { if (de < 0.9) s.place = 'any'; return s; }
    const at = islandNear(s.x, s.z);
    if (at) { [s.x, s.z] = at; return s; }
  }
  if (s.kind !== 'artifact') {
    const R = rng(hash64(`${WORLD}|${s.key}|reach`)[0]);
    s.kind = 'artifact';
    s.species = undefined;
    s.night = undefined;
    s.tier = drawTier(R());
    const T = tierOf(s.tier);
    s.res = resonance(R, T.least, T.deeper);
  }
  return s;
}

// Clearings: as common as UNCOMMON artifacts (tiers.js: CLEARING). Every site whose seed
// made it one is one; and besides, now and then an artifact out on plain ground, where the
// ground is flat enough to come down on as it is (none of them moved), is a clearing
// instead (more()).
const KEEP_CLEARING = 1, MORE_CLEARINGS = 0.55;
function clearing(s) {
  const R = rng(hash64(`${WORLD}|${s.key}|clearing`)[0]);
  if (R() < KEEP_CLEARING) { s.tier = CLEARING; s.res = 0; return s; }
  s.kind = 'artifact';
  s.tier = drawTier(R());
  const T = tierOf(s.tier);
  s.res = resonance(R, T.least, T.deeper);
  return s;
}
function more(s) {
  if (!s || s.kind !== 'artifact' || s.place !== 'any') return s;
  // (not where the Great Lake lies over it now: it would have to move to an island)
  if (lakeEnv(s.x, s.z) >= 0.5) return s;
  const R = rng(hash64(`${WORLD}|${s.key}|more`)[0]);
  if (R() >= MORE_CLEARINGS) return s;
  const hs = [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24], [17, 17], [-17, -17]].map(([dx, dz]) => height(s.x + dx, s.z + dz));
  if (Math.min(...hs) < WATER + 1.5 || Math.max(...hs) - Math.min(...hs) > 6) return s;
  s.kind = 'landing';
  s.tier = CLEARING;
  s.res = 0;
  return s;
}
// flat dry ground on an island of the Great Lake near (x, z) (the ground as it is now,
// the lake laid over it), or null
function islandNear(x, z) {
  for (let r = 0; r <= 1600; r += 80) for (let i = 0; i < (r ? Math.ceil(r / 40) : 1); i++) {
    const a = (i / Math.max(1, Math.ceil(r / 40))) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const hs = [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [21, 21], [-21, -21]].map(([dx, dz]) => heightNow(px + dx, pz + dz));
    if (Math.min(...hs) > WATER + 2 && Math.max(...hs) - Math.min(...hs) < 5) return [px, pz];
  }
  return null;
}

// The site of a grid cell, or null: a few places in it are looked at, and the first of
// them that is somewhere (a summit, a stand, a lake) is mostly preferred to plain forest.
function gridSite(cx, cz) {
  const key = `g${cx},${cz}`, [a, b] = hash64(`${WORLD}|${key}`), R = rng(a ^ 0x2545f491);
  if (R() > SITE_P) return null;
  let plain = null, special = null;
  for (let i = 0; i < 6 && !special; i++) {
    const x = (cx + 0.08 + 0.84 * R()) * CELL, z = (cz + 0.08 + 0.84 * R()) * CELL;
    const m = mountainEnv(x, z), h = height(x, z);
    if (m > 0.45) { const [sx, sz] = summit(x, z); special = { place: 'mountain', x: sx, z: sz }; continue; }
    // (never in a river's cut: those have their own)
    const rv = riverAt(x, z);
    if (rv.river && rv.d < rv.rw + 140) continue;
    if (open(x, z, 45)) { special = { place: 'lake', x, z }; continue; }
    if (h < WATER + 2) continue;
    if (autumn(x, z) > 0.45 && m < 0.2) { special = { place: 'autumn', x, z }; continue; }
    if (!plain && m < 0.3) plain = { place: 'any', x, z };
  }
  const at = special && (R() < (special.place === 'lake' ? 0.3 : 0.85) || !plain) ? special : plain;
  if (!at) return null;
  return reach(more(fill({ key, seed: seedOf(key), ...at }, rng(b ^ 0x9e3779b9))));
}

// The sites of a river (of the rivers' grid cell): down its course, and on its lake.
function riverSites(cx, cz) {
  const rv = riverOf(cx, cz);
  if (!rv) return [];
  const out = [], [a] = hash64(`${WORLD}|r${cx},${cz}`), R = rng(a);
  const n = R() < RIVER_P ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const t = 0.2 + 0.66 * ((i + 0.25 + 0.5 * R()) / n), f = t * RN, k = Math.min(RN - 1, Math.floor(f)), u = f - k;
    const key = `r${cx},${cz}:${i}`;
    const s = fill({ key, seed: seedOf(key), place: 'river', x: rv.xs[k] + (rv.xs[k + 1] - rv.xs[k]) * u, z: rv.zs[k] + (rv.zs[k + 1] - rv.zs[k]) * u }, rng(hash64(key)[1]));
    if (s) out.push(reach(s));
  }
  // the lake it ends in
  if (R() < LAKE_P && open(rv.lake.x, rv.lake.z, 45)) {
    const key = `l${cx},${cz}`, s = fill({ key, seed: seedOf(key), place: 'lake', x: rv.lake.x, z: rv.lake.z }, rng(hash64(key)[1]));
    if (s) { s.kind = 'artifact'; if (s.res === undefined) s.res = 1; if (s.tier === undefined) s.tier = 0; s.species = undefined; s.place = 'lake'; out.push(reach(s)); }
  }
  return out;
}

const _grid = new Map(), _river = new Map();
const cellKey = (cx, cz) => cx * 200003 + cz;

// The sites within r of (x, z). Cells not yet worked out are worked out a few at a call
// (budget), so the first look around takes a few frames and never one long one; done:
// whether every cell in reach has been.
export function sitesNear(x, z, r, budget = 2) {
  const out = [];
  let done = true;
  const each = (map, size, make, pad) => {
    const x0 = Math.floor((x - r - pad) / size), x1 = Math.floor((x + r + pad) / size), z0 = Math.floor((z - r - pad) / size), z1 = Math.floor((z + r + pad) / size);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = cellKey(cx, cz);
      let s = map.get(k);
      if (s === undefined) {
        if (budget <= 0) { done = false; continue; }
        budget--;
        if (map.size > 4000) map.clear();
        s = make(cx, cz);
        map.set(k, s);
      }
      for (const site of Array.isArray(s) ? s : s ? [s] : []) if ((site.x - x) ** 2 + (site.z - z) ** 2 < r * r) out.push(site);
    }
  };
  each(_grid, CELL, gridSite, 0);
  // (a river's sites lie within its own cell, or a little outside it)
  each(_river, RCELL, riverSites, 4200);
  return { sites: out, done };
}

// A place's code, for telling another pilot where something is: the coordinates, to ten
// meters, in base 36 (N/S, E/W of the origin), short enough to say.
export function placeCode(x, z) {
  const f = (v) => Math.abs(Math.round(v / 10)).toString(36).toUpperCase();
  return `${z < 0 ? 'N' : 'S'}${f(z)}-${x < 0 ? 'W' : 'E'}${f(x)}`;
}
export function placeOf(code) {
  const m = /^([NS])([0-9A-Z]+)-([WE])([0-9A-Z]+)$/.exec(String(code).trim().toUpperCase());
  if (!m) return null;
  const z = parseInt(m[2], 36) * 10 * (m[1] === 'N' ? -1 : 1), x = parseInt(m[4], 36) * 10 * (m[3] === 'W' ? -1 : 1);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}
// A site by its key, worked out again (anyone can: finds.js checks what a find claims)
export function siteByKey(key) {
  let m = /^g(-?\d+),(-?\d+)$/.exec(key);
  if (m) {
    const k = cellKey(+m[1], +m[2]);
    if (!_grid.has(k)) _grid.set(k, gridSite(+m[1], +m[2]));
    return _grid.get(k) || null;
  }
  m = /^[rl](-?\d+),(-?\d+)(:\d)?$/.exec(key);
  if (m) {
    const k = cellKey(+m[1], +m[2]);
    if (!_river.has(k)) _river.set(k, riverSites(+m[1], +m[2]));
    return (_river.get(k) || []).find((s) => s.key === key) || null;
  }
  return null;
}
export const _dev = { gridSite, riverSites, resonance, clamp };
