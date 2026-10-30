import { fbm2, ridged2, smoothstep, clamp } from '../core/math.js';

// The Fog Belt: an endless taiga on the planet's warm band, where the heat under the
// ice lets a forest grow and the steam it breathes never lifts. Rolling hills, frosted
// ridges, black lakes in the basins, and fog that pools in every low place.
//
// Everything here is a pure function of world position (in meters, as doubles), so the
// same forest stands in the same place for everyone and every session.

export const WATER = -46;           // lake level
export const CANOPY = 31;           // the tall trees' tops above the ground

// The ground before any river is cut into it
function ground(x, z, env) {
  const a = fbm2(x * 0.00062 + 31.7, z * 0.00062 - 12.3, 4);
  let h = (a - 0.5) * 170;
  const r = ridged2(x * 0.0015 + 4.1, z * 0.0015 - 7.7, 3);
  h += r * 42 * smoothstep(0.38, 0.72, a);
  const b = fbm2(x * 0.00105 - 7.1, z * 0.00105 + 3.3, 3);
  h -= smoothstep(0.56, 0.74, b) * 52;
  h += (fbm2(x * 0.011, z * 0.011, 2) - 0.5) * 7;
  return h + lift(x, z, env);
}

export function height(x, z) {
  const env = mountainEnv(x, z);
  return carve(x, z, ground(x, z, env), env);
}

// Rivers, now and then (about one cell in two of a grid RCELL meters on a side has one):
// each from a spring in higher ground, two to four kilometers down to a lake of its own
// at its mouth, meandering as it goes; cut down below the lakes' level so the water
// stands in it. Through low ground it runs between banks; through high ground it is a
// canyon as deep as the ground is high, its walls stepped in ledges, its head a wall
// where the cut begins. They keep out of the mountains.
export const RIVER_BED = WATER - 5;
const RCELL = 4500, RIVER_P = 0.55, RN = 48;
const _rivers = new Map();
const hashCell = (cx, cz, k) => {
  let h = Math.imul(cx * 374761393 + cz * 668265263 + k * 1274126177, 1103515245) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};
// the river of a cell (or null): its course (points, lengths along it), its width at
// each, its lake (x, z, r), its bounds
function riverOf(cx, cz) {
  const key = cx * 100003 + cz;
  if (_rivers.has(key)) return _rivers.get(key);
  let rv = null;
  const H = (k) => hashCell(cx, cz, k);
  if (H(1) < RIVER_P) {
    // the lake: the lowest of a few places in the cell, out of the mountains
    let lake = null;
    for (let i = 0; i < 6; i++) {
      const x = (cx + 0.27 + 0.46 * H(10 + i)) * RCELL, z = (cz + 0.27 + 0.46 * H(20 + i)) * RCELL, env = mountainEnv(x, z);
      if (env > 0.02) continue;
      const h = ground(x, z, env);
      if (!lake || h < lake.h) lake = { x, z, h };
    }
    // the spring: the highest of a few places two to four kilometers off whose whole
    // meandering way down to the lake keeps out of the mountains (where the cut would
    // fade, and a ridge would stand across the river)
    const springs = [];
    if (lake) for (let i = 0; i < 9; i++) {
      const a = H(30 + i) * Math.PI * 2, L = 2200 + 1800 * H(40 + i), x = lake.x + Math.cos(a) * L, z = lake.z + Math.sin(a) * L;
      if (mountainEnv(x, z) < 0.01) springs.push({ x, z, h: ground(x, z, 0) });
    }
    springs.sort((p, q) => q.h - p.h);
    const A1 = 120 + 260 * H(50), f1 = 1.2 + 1.6 * H(51), p1 = H(52) * 6.283, A2 = 40 + 90 * H(53), f2 = 3 + 3 * H(54), p2 = H(55) * 6.283;
    for (const src of springs) {
      for (const tame of [1, 0.45]) {
        // its course: from the spring to the lake, meandering, its width growing
        const dx = lake.x - src.x, dz = lake.z - src.z, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
        const xs = new Float64Array(RN + 1), zs = new Float64Array(RN + 1), acc = new Float64Array(RN + 1);
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, clear = true;
        for (let i = 0; i <= RN && clear; i++) {
          const t = i / RN, off = (A1 * Math.sin(6.283 * f1 * t + p1) + A2 * Math.sin(6.283 * f2 * t + p2)) * Math.sin(Math.PI * t) * tame;
          xs[i] = src.x + dx * t + nx * off; zs[i] = src.z + dz * t + nz * off;
          // (with room for its rim either side)
          clear = mountainEnv(xs[i], zs[i]) < 0.01 && mountainEnv(xs[i] + nx * 220, zs[i] + nz * 220) < 0.04 && mountainEnv(xs[i] - nx * 220, zs[i] - nz * 220) < 0.04;
          if (i) acc[i] = acc[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
          x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]);
        }
        if (!clear) continue;
        const lr = 170 + 150 * H(60), pad = 420;
        rv = { xs, zs, acc, len: acc[RN], rw: 18 + 12 * H(61), lake: { x: lake.x, z: lake.z, r: lr, ph: H(62) * 6.283 },
          x0: Math.min(x0, lake.x - lr) - pad, x1: Math.max(x1, lake.x + lr) + pad, z0: Math.min(z0, lake.z - lr) - pad, z1: Math.max(z1, lake.z + lr) + pad };
        break;
      }
      if (rv) break;
    }
  }
  if (_rivers.size > 600) _rivers.clear();
  _rivers.set(key, rv);
  return rv;
}
const NONE = { d: Infinity, v: Infinity, gx: 1, gz: 0, rw: 20, t: 0, river: null };
// About (x, z), the nearest river's course: how far from its middle (m), which way across
// it (unit, pointing toward (x, z) from the middle; v: signed distance along it), its half
// width at the water there, how far along it (0 at its spring, 1 at its lake).
export function riverAt(x, z) {
  const cx0 = Math.floor(x / RCELL), cz0 = Math.floor(z / RCELL);
  let best = NONE;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const rv = riverOf(cx0 + i, cz0 + j);
    if (!rv || x < rv.x0 || x > rv.x1 || z < rv.z0 || z > rv.z1) continue;
    const { xs, zs } = rv;
    for (let k = 0; k < RN; k++) {
      const ax = xs[k], az = zs[k], bx = xs[k + 1] - ax, bz = zs[k + 1] - az, L2 = bx * bx + bz * bz;
      const u = clamp(((x - ax) * bx + (z - az) * bz) / L2, 0, 1), px = ax + bx * u, pz = az + bz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.d) {
        const l = Math.sqrt(L2), t = (rv.acc[k] + l * u) / rv.len;
        // across: from the middle toward (x, z); on the middle itself, the course's normal
        const gx = d > 1e-3 ? (x - px) / d : -bz / l, gz = d > 1e-3 ? (z - pz) / d : bx / l;
        best = { d, v: d, gx, gz, rw: 7 + (rv.rw - 7) * smoothstep(0, 0.6, t), t, river: rv };
      }
    }
  }
  return best;
}
// the half width of the cut at its rim, for ground h high
const rimOf = (rw, h) => rw + Math.max(0, h - RIVER_BED) / 1.15 + 10;
function carve(x, z, h, env) {
  if (h <= RIVER_BED) return h;
  const R = riverAt(x, z);
  if (!R.river) return h;
  let out = h;
  // its lake: a bowl below the water, its shore a little ragged
  const L = R.river.lake, ld = Math.hypot(x - L.x, z - L.z);
  if (ld < L.r * 1.25 + 90) {
    const a = Math.atan2(z - L.z, x - L.x), r = L.r * (1 + 0.14 * Math.sin(a * 3 + L.ph) + 0.08 * Math.sin(a * 5 - L.ph * 2));
    const bowl = WATER - 9 * (1 - smoothstep(0, r, ld) ** 2);
    out = Math.min(out, ld < r ? bowl : out + (bowl - out) * (1 - smoothstep(r, r + 90, ld)));
  }
  const D = h - RIVER_BED, half = rimOf(R.rw, h);
  if (R.d >= half) return out;
  let to;
  if (R.d <= R.rw) to = RIVER_BED - 1.5 * (1 - R.d / R.rw);
  else {
    // across the wall, from the water's edge (0) to the rim (1): a slope where the ground is
    // low, ledges where it is high
    const u = (R.d - R.rw) / (half - R.rw), steps = 4, s = u * steps, f = Math.floor(s);
    const ledges = (f + smoothstep(0.45, 0.9, s - f)) / steps;
    to = RIVER_BED + D * (smoothstep(0, 1, u) + (ledges - smoothstep(0, 1, u)) * smoothstep(14, 40, D));
  }
  // (at its spring the cut begins: a slope down to the water in low ground, a canyon's
  // head wall in high; and it keeps out of the mountains)
  const k = smoothstep(0, 0.05, R.t) * (1 - smoothstep(0.02, 0.2, env));
  return Math.min(out, h + (Math.min(h, to) - h) * k);
}
// How much of a canyon's wall (x, z) is (0: none, or a low bank; 1: deep in a canyon's
// side), for the rock to show its layers.
export function canyonAt(x, z, h) {
  const R = riverAt(x, z), half = rimOf(R.rw, h + 40);
  return R.d > R.rw && R.d < half ? smoothstep(-30, 0, h) * (1 - smoothstep(0.08, 0.4, mountainEnv(x, z))) : 0;
}

// Rarer still (about a third as often as a turned stand, and larger: a range one to
// three kilometers across with its foothills), mountains: ridged peaks up to some 320
// meters over the forest, rising out of the fog. mountainEnv: how far into a range a
// place is (0 outside, its foothills low, 1 at its heart); mountain: its heart, for
// saying that one is in the mountains.
const mfield = (x, z) => fbm2(x * 0.0004 - 517.3, z * 0.0004 + 333.9, 3);
export function mountainEnv(x, z) {
  return smoothstep(0.62, 0.86, mfield(x, z));
}
export function mountain(x, z) {
  return smoothstep(0.77, 0.84, mfield(x, z));
}
function lift(x, z, env = mountainEnv(x, z)) {
  if (env <= 0) return 0;
  return 330 * env * env * (0.3 + 0.7 * ridged2(x * 0.0016 + 19.3, z * 0.0016 - 41.7, 4));
}

// How thickly the forest grows here, 0..1.
export function forestDensity(x, z, h) {
  if (h < WATER + 1.2) return 0;
  let d = 0.62 + (fbm2(x * 0.0035 + 5.2, z * 0.0035 - 9.4, 3) - 0.5) * 1.5;
  // glades and bogs
  d *= smoothstep(0.2, 0.36, fbm2(x * 0.0082 - 3.3, z * 0.0082 + 11.1, 2));
  // thin near the shore, and on the high frost; none above the treeline (the mountains')
  d *= smoothstep(WATER + 1.2, WATER + 6, h);
  d *= 1 - smoothstep(58, 80, h) * 0.75;
  d *= 1 - smoothstep(150, 215, h);
  // a canyon's walls mostly bare: the rock shows its layers, trees keep to its ledges
  if (d > 0 && h > -40) d *= 1 - 0.7 * canyonAt(x, z, h);
  return clamp(d, 0, 1);
}

// Now and then, a stand gone to autumn: birches turned gold among the dark spruces, the
// ground under them russet with fallen leaves. A smooth field over the world (0 to 1),
// the same for everyone: about one part in twenty of the forest, in stands a few hundred
// meters to a kilometer across, their edges turning over a couple of hundred.
export function autumn(x, z) {
  return smoothstep(0.73, 0.8, fbm2(x * 0.0006 + 211.7, z * 0.0006 - 87.3, 3));
}

// Which kind of tree: 0 spruce, 1 fir, 2 dead snag
export function treeKind(x, z, r) {
  const k = fbm2(x * 0.0027 + 77.3, z * 0.0027 - 41.2, 2);
  if (r < 0.022) return 2;
  if (k < 0.4) return 1;
  return 0;
}

// The tallest thing the ship must clear near (x, z): ground plus canopy.
export function canopyTop(x, z) {
  const h = height(x, z);
  return Math.max(h, WATER) + (h > WATER + 1 ? CANOPY : 0);
}
