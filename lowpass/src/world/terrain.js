import { fbm2, ridged2, smoothstep, clamp } from '../core/math.js';

// The Fog Belt: an endless taiga on the planet's warm band, where the heat under the
// ice lets a forest grow and the steam it breathes never lifts. Rolling hills, frosted
// ridges, black lakes in the basins, and fog that pools in every low place.
//
// Everything here is a pure function of world position (in meters, as doubles), so the
// same forest stands in the same place for everyone and every session.

export const WATER = -46;           // lake level
export const CANOPY = 31;           // the tall trees' tops above the ground

export function height(x, z) {
  const a = fbm2(x * 0.00062 + 31.7, z * 0.00062 - 12.3, 4);
  let h = (a - 0.5) * 170;
  const r = ridged2(x * 0.0015 + 4.1, z * 0.0015 - 7.7, 3);
  h += r * 42 * smoothstep(0.38, 0.72, a);
  const b = fbm2(x * 0.00105 - 7.1, z * 0.00105 + 3.3, 3);
  h -= smoothstep(0.56, 0.74, b) * 52;
  h += (fbm2(x * 0.011, z * 0.011, 2) - 0.5) * 7;
  const env = mountainEnv(x, z);
  return carve(x, z, h + lift(x, z, env), env);
}

// Rivers: where a slow field, warped so it meanders, crosses its middle, a river runs,
// cut down below the lakes' level so the water stands in it (one every few kilometers on a
// straight line). Through low ground it is a river between banks; through high ground, a
// canyon as deep as the ground is high, its walls stepped in ledges, its rim as wide
// again as it is deep. They keep out of the mountains' hearts, and end in their foothills.
export const RIVER_BED = WATER - 5;
const rfield = (x, z) => {
  const w = (fbm2(x * 0.0009 + 91.3, z * 0.0009 - 17.7, 2) - 0.5) * 0.7;
  return fbm2(x * 0.00042 + 301.1 + w, z * 0.00042 - 155.7 - w, 3) - 0.5;
};
// About (x, z): how far from the river's middle (m), which way across it (the unit
// gradient, pointing to the side where the field is higher), its half width at the water.
export function riverAt(x, z) {
  const v = rfield(x, z), gx = (rfield(x + 2, z) - v) / 2, gz = (rfield(x, z + 2) - v) / 2, g = Math.hypot(gx, gz) || 1e-9;
  return { d: Math.abs(v) / g, v, gx: gx / g, gz: gz / g, rw: 16 + 12 * fbm2(x * 0.004 + 3.1, z * 0.004 - 8.4, 2) };
}
// the half width of the cut at its rim, for ground h high
const rimOf = (rw, h) => rw + Math.max(0, h - RIVER_BED) / 1.15 + 10;
function carve(x, z, h, env) {
  if (h <= RIVER_BED) return h;
  const keep = 1 - smoothstep(0.08, 0.4, env);
  if (keep <= 0) return h;
  const R = riverAt(x, z), D = h - RIVER_BED, half = rimOf(R.rw, h);
  if (R.d >= half) return h;
  let to;
  if (R.d <= R.rw) to = RIVER_BED - 1.5 * (1 - R.d / R.rw);
  else {
    // across the wall, from the water's edge (0) to the rim (1): a slope where the ground is
    // low, ledges where it is high
    const u = (R.d - R.rw) / (half - R.rw), steps = 4, s = u * steps, f = Math.floor(s);
    const ledges = (f + smoothstep(0.45, 0.9, s - f)) / steps;
    to = RIVER_BED + D * (smoothstep(0, 1, u) + (ledges - smoothstep(0, 1, u)) * smoothstep(14, 40, D));
  }
  return h + (Math.min(h, to) - h) * keep;
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
