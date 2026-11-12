import * as THREE from 'three';
import { mat } from '../render/build.js';
import { TAU } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { PULSE, STONE } from './parts.js';
import { MOSS, MOSS2, METAL, Part, motes, rock, curve, moss, fern } from './curiokit.js';

// What lies about the shore of a wooded island in the Great Lake, found only on foot among
// the spruces: what the water has kept and given back. Things washed up, moored, drowned
// and come back; never a creature, never anyone. Built as the forest's are (curios.js):
// each kind takes (k, pal, P, R, fx) and returns { light, height, span, update? }.
//
// The kinds, and the depth that first has them:
export const CURIOS = [
  ['buoy', 0], ['nets', 0], ['jar', 0], ['prow', 0], ['sounding', 0],
  ['echoshell', 3], ['tidemark', 3],
  ['lens', 4], ['mooring', 4],
  ['keptice', 5],
];

export const INFO = {
  buoy: ['KBY', 'Lantern buoy', ['Buoy', 'Lantern', 'Seamark', 'Warning'], () => 'A lantern buoy hauled up on the shingle long ago, its paint gone to rust; its lamp still gives its three flashes, and waits, and gives them again, to a lake with nobody on it.'],
  nets: ['KFL', 'Drying nets', ['Nets', 'Floats', 'Catch', 'Line'], (P) => `A net hung to dry between two posts of driftwood, ${Math.min(7, P.n - 2) + 3} glass floats on it; a light goes along them from one to the next, slowly, like a swell passing under.`],
  jar: ['XJR', 'Jar of lake light', ['Jar', 'Vessel', 'Keeping', 'Draught'], () => 'A great glass jar in a wicker jacket, stoppered, set on a stone and half full of the lake; the water in it glows, and rises and falls with a tide the lake outside does not have.'],
  prow: ['KPR', 'Prow of light', ['Prow', 'Boat', 'Hull', 'Keel'], () => 'The bow of a clinker boat drawn up on a stone, a meter of its planks and no more; the rest of it is there in lines of light, rib by rib, as far as the stern.'],
  sounding: ['KSL', 'Sounding line', ['Line', 'Lead', 'Sounding', 'Depth'], () => 'A lead line hanging from three driftwood poles, its weight a hand over a pool of dark water and never touching it; the line leans and swings as if a current ran here, under no water at all.'],
  echoshell: ['KSH', 'Echo shell', ['Shell', 'Echo', 'Whorl', 'Hollow'], () => 'A spiral shell as large as a rowing boat’s stern, lying on its side among the stones; out of its mouth come rings of light, each fainter than the last, as an echo comes back across water.'],
  tidemark: ['KTM', 'Tide stone', ['Stone', 'Tide Mark', 'Gauge', 'Level'], (P) => `A standing stone banded with ${5 + (P.n % 4)} pale lines where the lake once stood; a skin of light goes about it from one line to the next, as the water did, in no order the scanner can find.`],
  lens: ['KLS', 'Lighthouse lens', ['Lens', 'Lantern', 'Lamp', 'Light'], () => 'A lighthouse lens, rings of glass in a brass frame, set on a boulder with no tower under it; it turns, and its lamp burns, and its two beams go out over the lake into the fog.'],
  mooring: ['KMR', 'Mooring post', ['Post', 'Mooring', 'Rope', 'Hawser'], () => 'An old mooring post with a rope made fast to it; the rope goes up and out over the water and ends in the air in a little light, and it slackens and draws taut, as if something out there rode on it.'],
  keptice: ['XIC', 'Kept ice', ['Ice', 'Floe', 'Slab', 'Keeping'], () => 'Slabs of lake ice pushed up on the shore in a season long gone and never melted; in the largest, a lantern frozen in, still alight, and cracks of light that open in it and close again.'],
};

// ------------------------------------------------------------------ building
const DRIFT = 0x8b857a, WOOD = 0x4a4036, ROPE = 0x6f6552, CORD = 0x37342d, IRON = 0x3c3a38, BRASS = 0x7d6a42, POOL = 0x0b1216, ICE = 0xbcd2dc;
const V = (a) => new THREE.Vector3(...a);
const smooth = (a, b, v) => { const x = Math.min(1, Math.max(0, (v - a) / (b - a))); return x * x * (3 - 2 * x); };

// shingle: flat pebbles of the shore about something
function shingle(b, r, R, n = 10, cx = 0, cz = 0) {
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = r * (0.3 + R() * 0.8), s = 0.08 + R() * 0.14;
    b.add(rock(s, i * 5 + 11, 0.3), mat(cx + Math.cos(a) * d, s * 0.12, cz + Math.sin(a) * d, 0, R() * TAU, 0, 1.4, 0.5, 1.1), [STONE[2], STONE[3], 0x4a4944, 0x5c5952][i % 4], 0, { flat: true });
  }
}

// the vertices Builder.tube would write for these points, in its order (to move a rope)
function tubeVerts(points, r, seg, out) {
  const n = points.length, up = new THREE.Vector3(0, 1, 0), rings = [];
  const t = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    t.subVectors(b, a).normalize();
    side.crossVectors(t, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    nrm.crossVectors(side, t).normalize();
    const ring = [];
    for (let k = 0; k < seg; k++) { const ang = (k / seg) * TAU; ring.push(p.clone().addScaledVector(side, Math.cos(ang) * r).addScaledVector(nrm, Math.sin(ang) * r)); }
    rings.push(ring);
  }
  let o = 0;
  const put = (v) => { out[o++] = v.x; out[o++] = v.y; out[o++] = v.z; };
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % seg], c = rings[i + 1][(k + 1) % seg], d = rings[i + 1][k];
      put(a); put(d); put(c); put(a); put(c); put(b);
    }
  }
}

export const KINDS = {
  buoy(k, pal, P, R, fx) {
    // a lantern buoy hauled ashore, leaning in the shingle, its lamp still giving its flashes
    const paint = mixHex(0x6b2e28, pal.dark, 0.35), band = mixHex(0xc9c2b0, pal.dark, 0.35), iron = mixHex(IRON, pal.dark, 0.2);
    const by = new Part(k.group, -0.35, 0.02, 0);
    by.group.rotation.z = -0.42;
    const b = by.body;
    b.cyl(0.72, 0.58, 0.75, 14, mat(0, 0.375, 0), paint);
    b.cone(0.58, 0.45, 14, mat(0, -0.22, 0, Math.PI, 0, 0), paint);
    b.cyl(0.74, 0.74, 0.14, 14, mat(0, 0.6, 0), band);
    b.cyl(0.46, 0.72, 0.14, 14, mat(0, 0.82, 0), paint);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.4; curve(b, [[Math.cos(a) * 0.42, 0.85, Math.sin(a) * 0.42], [Math.cos(a) * 0.14, 1.95, Math.sin(a) * 0.14]], 0.03, iron); }
    b.torus(0.32, 0.022, 4, 16, mat(0, 1.25, 0, Math.PI / 2, 0, 0), iron);
    b.torus(0.22, 0.022, 4, 16, mat(0, 1.62, 0, Math.PI / 2, 0, 0), iron);
    b.cyl(0.17, 0.17, 0.05, 10, mat(0, 1.96, 0), iron);
    b.cyl(0.11, 0.11, 0.24, 8, mat(0, 2.1, 0), mixHex(0x2c3a40, pal.light, 0.12));
    b.cone(0.16, 0.13, 10, mat(0, 2.29, 0), iron);
    b.sphere(0.035, 6, 4, mat(0, 2.38, 0), iron);
    // rust runs and the old weed line on the float
    for (let i = 0; i < 6; i++) { const a = R() * TAU; b.box(0.05, 0.3, 0.02, mat(Math.cos(a) * 0.71, 0.32, Math.sin(a) * 0.71, 0, -a + Math.PI / 2, 0), mixHex(0x5a3a22, pal.dark, 0.3)); }
    b.cyl(0.725, 0.65, 0.12, 14, mat(0, 0.1, 0), mixHex(0x2e3a28, pal.dark, 0.3));
    // the lamp, on its character: three flashes, then dark
    const lamp = new Part(by.group, 0, 2.1, 0);
    lamp.lit.cyl(0.118, 0.118, 0.25, 8, null, mixHex(pal.light, 0xffffff, 0.3), 1.4);
    lamp.glow.sphere(0.5, 10, 6, null, mixHex(pal.light, 0xffffff, 0.2), 0.35);
    lamp.glow.sphere(0.22, 8, 5, null, mixHex(pal.light, 0xffffff, 0.5), 0.6);
    k.parts.push(by, lamp);
    // its chain, run out over the stones to a sinker
    const path = [V([-0.86, 0.34, 0]), V([-1.0, 0.06, 0.35]), V([-0.85, 0.05, 0.85]), V([-0.45, 0.05, 1.1])];
    const pts = [];
    for (let i = 0; i < path.length - 1; i++) { const L = path[i].distanceTo(path[i + 1]), m = Math.max(1, Math.round(L / 0.11)); for (let j = 0; j < m; j++) pts.push(path[i].clone().lerp(path[i + 1], j / m)); }
    const n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    pts.forEach((p, i) => {
      const d = (pts[i + 1] || path[path.length - 1]).clone().sub(p).normalize();
      n1.crossVectors(d, up); if (n1.lengthSq() < 1e-6) n1.set(0, 0, 1); n1.normalize();
      n2.crossVectors(d, n1).normalize();
      const m = new THREE.Matrix4().makeBasis(d, i % 2 ? n1 : n2, i % 2 ? n2 : n1.clone().negate());
      m.multiply(new THREE.Matrix4().makeScale(1.5, 1, 1));
      m.setPosition(p);
      k.body.add(new THREE.TorusGeometry(0.055, 0.016, 4, 8), m, iron);
    });
    k.body.box(0.42, 0.28, 0.42, mat(-0.3, 0.1, 1.15, 0.1, 0.5, 0.05), STONE[3]);
    shingle(k.body, 1.5, R, 14);
    fern(k.body, 1.0, -0.9, 0.9, R);
    return { light: [0.5, 1.94, 0], height: 2.3, span: 1.3, update(t) {
      const ph = t % 9;
      lamp.group.visible = ph < 0.4 || (ph > 1.1 && ph < 1.5) || (ph > 2.2 && ph < 2.6);
    } };
  },
  nets(k, pal, P, R, fx) {
    // a net hung to dry between two driftwood posts, glass floats along its line, a light
    // passing along them like a swell
    const b = k.body, cord = mixHex(CORD, pal.dark, 0.2);
    const top = (x) => 2.3 - 0.28 * (1 - (x / 1.6) ** 2);
    for (const s of [-1, 1]) curve(b, [[s * 1.6, -0.1, 0], [s * 1.62, 1.2, 0.04], [s * 1.58, 2.5, 0]], 0.07, DRIFT);
    const line = [];
    for (let i = 0; i <= 12; i++) { const x = -1.6 + (i / 12) * 3.2; line.push([x, top(x) + 0.02, 0]); }
    curve(b, line, 0.02, ROPE);
    for (const s of [-1, 1]) b.torus(0.085, 0.022, 4, 10, mat(s * 1.6, 2.32, 0, Math.PI / 2, 0, 0), ROPE);
    // the net, on a pivot near its line so that it can stir
    const PY = 2.1, net = new Part(k.group, 0, PY, 0);
    const NI = 10, NJ = 6, pt = (i, j) => {
      const u = i / NI, x = -1.45 + 2.9 * u, hang = 1.5 + 0.25 * Math.sin(Math.PI * u);
      return [x, top(x) - PY - hang * (j / NJ), 0.14 * Math.sin(Math.PI * u) * (j / NJ) ** 1.2 + Math.sin(i * 1.7 + j * 2.3) * 0.02 * (j / NJ)];
    };
    for (let i = 0; i <= NI; i++) net.body.tube(Array.from({ length: NJ + 1 }, (_, j) => V(pt(i, j))), 0.012, 3, cord);
    for (let j = 1; j <= NJ; j++) net.body.tube(Array.from({ length: NI + 1 }, (_, i) => V(pt(i, j))), j === NJ ? 0.022 : 0.012, 3, j === NJ ? ROPE : cord);
    // the floats: along the line, and a few caught down in the net
    const nf = Math.min(7, P.n - 2), spots = [];
    for (let f = 0; f < nf; f++) { const u = (f + 0.5) / nf, x = -1.45 + 2.9 * u; spots.push([x, top(x) - PY - 0.14, 0.05, u]); }
    for (let f = 0; f < 3; f++) { const i = 2 + Math.floor(R() * 7), j = 2 + Math.floor(R() * 3), p = pt(i, j); spots.push([p[0], p[1], p[2] + 0.09, i / NI]); }
    const halos = [];
    spots.forEach(([x, y, z, u], i) => {
      const r = 0.09 + R() * 0.04;
      net.lit.sphere(r, 10, 7, mat(x, y, z), i % 3 === 1 ? mixHex(pal.second, 0xffffff, 0.2) : mixHex(pal.light, 0x9fd0dc, 0.3), i % 4 === 0 ? PULSE : 1.2);
      net.body.torus(r * 0.9, 0.008, 3, 10, mat(x, y, z, 0, 0.3 + i, 0), cord);
      const h = new Part(net.group, x, y, z);
      h.glow.sphere(0.3, 8, 6, null, mixHex(pal.light, 0xffffff, 0.2), 0.35);
      halos.push({ h, u });
    });
    k.parts.push(net, ...halos.map((x) => x.h));
    // two floats come loose in the stones, and a coil of line
    for (let i = 0; i < 2; i++) k.lit.sphere(0.11, 8, 6, mat(0.7 + i * 0.28, 0.08, 0.7 - i * 0.1), pal.light, 1.1);
    for (let m = 0; m < 3; m++) b.torus(0.28 - m * 0.05, 0.025, 4, 16, mat(-0.8, 0.03 + m * 0.045, 0.7, Math.PI / 2, 0, 0), ROPE);
    shingle(b, 1.6, R, 10);
    moss(b, 1.8, R, 4);
    return { light: [0, 1.5, 0], height: 2.6, span: 1.7, update(t) {
      net.group.rotation.x = Math.sin(t * 0.6) * 0.045 + Math.sin(t * 0.23) * 0.02;
      for (const { h, u } of halos) h.group.scale.setScalar(0.55 + 0.75 * Math.max(0, Math.sin(t * 0.9 - u * 6)) ** 2);
    } };
  },
  jar(k, pal, P, R, fx) {
    // a great jar of the lake's own water, glowing, rising and falling with its own tide
    const J = 1.3, y0 = 0.33;
    k.body.add(rock(0.75, 3, 0.2, 1), mat(0, 0.1, 0, 0, 0, 0, 1.15, 0.35, 1.0), STONE[2], 0, { flat: true });
    const prof = [[0, 0], [0.3, 0.01], [0.4, 0.08], [0.45, 0.25], [0.44, 0.42], [0.38, 0.58], [0.24, 0.72], [0.11, 0.8], [0.09, 0.86], [0.09, 0.98], [0.115, 1.0]];
    const lathe = (pp, s = J) => new THREE.LatheGeometry(pp.map(([r, y]) => new THREE.Vector2(r * s, y * s)), 20);
    const glass = mixHex(0xcfe8f0, pal.light, 0.3);
    k.glow.add(lathe(prof), mat(0, y0, 0), glass, 0.16);
    // its wicker jacket
    const w1 = mixHex(0x6a5a3e, pal.dark, 0.25), w2 = mixHex(0x58492f, pal.dark, 0.3);
    k.body.add(new THREE.CylinderGeometry(0.47 * J, 0.37 * J, 0.32 * J, 16, 4, true), mat(0, y0 + 0.16 * J, 0), (x, y) => (Math.floor((y + 1) * 40) % 2 ? w1 : w2), 0, { flat: true });
    k.body.cyl(0.37 * J, 0.37 * J, 0.03, 16, mat(0, y0 + 0.01, 0), w2);
    for (let i = 0; i < 2; i++) k.body.torus(0.12 * J, 0.02, 4, 12, mat(Math.cos(i * Math.PI) * 0.46 * J, y0 + 0.33 * J, Math.sin(i * Math.PI) * 0.46 * J, 0, i * Math.PI + Math.PI / 2, 0), w1);
    // stopper and twine
    k.body.cyl(0.085 * J, 0.075 * J, 0.12 * J, 8, mat(0, y0 + 1.0 * J, 0), 0x7a6048);
    k.body.torus(0.1 * J, 0.012, 3, 10, mat(0, y0 + 0.9 * J, 0, Math.PI / 2, 0, 0), ROPE);
    // the water in it, lit, and its surface brighter
    const water = new Part(k.group, 0, y0, 0);
    const wp = [[0, 0.015], [0.28, 0.02], [0.37, 0.08], [0.42, 0.25], [0.41, 0.42], [0.405, 0.45], [0, 0.45]];
    water.lit.add(lathe(wp), null, mixHex(pal.light, 0x0d2230, 0.45), 1.3);
    water.glow.add(new THREE.CircleGeometry(0.4 * J, 20), mat(0, 0.452 * J, 0, -Math.PI / 2, 0, 0), mixHex(pal.light, 0xffffff, 0.2), 0.7);
    k.glow.sphere(0.9, 12, 8, mat(0, y0 + 0.35 * J, 0), pal.light, 0.12);
    k.parts.push(water);
    const glints = motes(k.group, 28, mixHex(pal.light, 0xffffff, 0.5), 0.05, fx, 0.8);
    // a smaller jar lying beside it, empty
    k.glow.add(lathe(prof, 0.45), mat(0.95, 0.21, 0.45, 0, 0.6, Math.PI / 2), glass, 0.12);
    shingle(k.body, 1.3, R, 8);
    moss(k.body, 1.3, R, 4);
    return { light: [0, y0 + 0.35 * J, 0], height: 1.75, span: 0.9, update(t) {
      const lv = 0.94 + 0.12 * Math.sin(t * 0.21) + 0.03 * Math.sin(t * 0.77);
      water.group.scale.y = lv;
      for (let i = 0; i < 28; i++) {
        const a = i * 2.4 + t * 0.3 * (1 + (i % 3) * 0.3), r = (0.08 + (i % 5) * 0.05) * J, h = (0.05 + 0.36 * ((i * 0.618 + t * 0.02) % 1)) * J * lv;
        glints.pos.set([Math.cos(a) * r, y0 + h, Math.sin(a) * r], i * 3);
        glints.alpha[i] = 0.4 + 0.6 * Math.max(0, Math.sin(t * 0.9 + i * 1.3));
      }
      glints.commit();
    } };
  },
  prow(k, pal, P, R, fx) {
    // the bow of a clinker boat drawn up on a stone; the rest of it is lines of light
    const L = 4.5;
    const w = (u) => 0.78 * Math.pow(Math.max(0, 1 - ((u - 0.45) / 0.55) ** 2), 0.55);
    const yg = (u) => 0.68 + 0.38 * u ** 3;
    const yk = (u) => 0.04 + Math.max(0, (u - 0.8) / 0.2) ** 2 * 0.98;
    const sec = (u, ph, s) => [u * L, yk(u) + (yg(u) - yk(u)) * (1 - Math.cos(ph)), s * w(u) * Math.sin(ph)];
    const boat = new Part(k.group, -2.25, -0.12, 0);
    boat.group.rotation.z = 0.1;
    const b = boat.body, plank = [mixHex(0x4a4036, pal.dark, 0.2), mixHex(0x5a4c3e, pal.dark, 0.2)];
    // the planks that are left: five strakes a side, broken off at their own lengths
    for (const s of [-1, 1]) {
      for (let j = 0; j < 5; j++) {
        const p0 = (j / 5) * (Math.PI / 2), p1 = ((j + 1) / 5) * (Math.PI / 2), u0 = 0.7 + R() * 0.12, col = plank[j % 2];
        for (let q = 0; q < 8; q++) {
          const ua = u0 + (1 - u0) * (q / 8), ub = u0 + (1 - u0) * ((q + 1) / 8);
          const A = sec(ua, p0, s), B = sec(ub, p0, s), C = sec(ub, p1 + 0.03, s), D = sec(ua, p1 + 0.03, s);
          b.quad(A, B, C, D, col);
          b.quad(A, D, C, B, col);
        }
      }
      curve(b, Array.from({ length: 7 }, (_, q) => sec(0.8 + 0.2 * (q / 6), Math.PI / 2, s)), 0.03, WOOD);
    }
    const stem = Array.from({ length: 7 }, (_, q) => { const u = 0.78 + 0.22 * (q / 6); return [u * L, yk(u), 0]; });
    stem.push([L + 0.03, yg(1) + 0.15, 0]);
    curve(b, stem, 0.05, WOOD);
    { const u = 0.84, h = yk(u) + 0.7 * (yg(u) - yk(u)); b.box(0.18, 0.04, 2 * w(u) * 0.93, mat(u * L, h, 0), plank[1]); }
    // the rest, in light: ribs, gunwales, keel and the chines between
    const ghost = mixHex(pal.light, 0xffffff, 0.25);
    for (let i = 0; i < 10; i++) {
      const u = 0.02 + i * 0.084;
      boat.glow.tube(Array.from({ length: 9 }, (_, q) => { const ph = (q / 8 - 0.5) * Math.PI; return V(sec(u, Math.abs(ph), Math.sign(ph) || 1)); }), 0.014, 3, ghost, 0.8);
    }
    for (const s of [-1, 1]) {
      boat.glow.tube(Array.from({ length: 18 }, (_, q) => V(sec((q / 17) * 0.86, Math.PI / 2, s))), 0.016, 3, ghost, 0.9);
      boat.glow.tube(Array.from({ length: 18 }, (_, q) => V(sec((q / 17) * 0.8, Math.PI / 4, s))), 0.01, 3, ghost, 0.4);
    }
    boat.glow.tube(Array.from({ length: 18 }, (_, q) => V(sec((q / 17) * 0.8, 0, 1))), 0.018, 3, ghost, 0.9);
    // a brighter rib that goes along it, stern to bow and back, as if it were being remembered
    const sweep = new Part(boat.group);
    sweep.glow.tube(Array.from({ length: 13 }, (_, q) => { const ph = (q / 12 - 0.5) * Math.PI; return V([0, 1 - Math.cos(ph), Math.sin(ph)]); }), 0.025, 4, mixHex(pal.light, 0xffffff, 0.4), 1);
    k.parts.push(boat, sweep);
    // the stone it was drawn up on, an oar beside it
    k.body.add(rock(0.45, 21, 0.3), mat(1.3, 0.05, 0, 0, 0.4, 0, 1.2, 0.55, 1.1), STONE[2], 0, { flat: true });
    curve(k.body, [[-1.4, 0.05, 1.15], [0.9, 0.07, 0.95]], 0.035, DRIFT);
    k.body.box(0.7, 0.03, 0.16, mat(-1.75, 0.04, 1.18, 0, 0.087, 0), DRIFT);
    shingle(k.body, 2.2, R, 16);
    return { light: [0, 0.7, 0], height: 1.6, span: 2.3, update(t) {
      const u = 0.02 + 0.8 * (0.5 - 0.5 * Math.cos(t * 0.35));
      sweep.group.position.set(u * L, yk(u), 0);
      sweep.group.scale.set(1, Math.max(0.01, yg(u) - yk(u)), Math.max(0.01, w(u)));
    } };
  },
  sounding(k, pal, P, R, fx) {
    // a lead line from three driftwood poles, its weight hovering over a pool, swinging in a
    // current that is not there
    const b = k.body, apex = V([0, 2.85, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5, foot = V([Math.cos(a) * 1.05, -0.08, Math.sin(a) * 1.05]);
      const mid = foot.clone().lerp(apex, 0.5).add(V([Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05]));
      const over = apex.clone().add(apex.clone().sub(foot).multiplyScalar(0.07));
      b.tube([foot, mid, apex, over], 0.055, 5, DRIFT);
    }
    b.torus(0.08, 0.035, 4, 10, mat(0, 2.8, 0, Math.PI / 2, 0, 0), ROPE);
    b.cyl(0.07, 0.07, 0.04, 10, mat(0, 2.7, 0, Math.PI / 2, 0, 0), IRON);
    { const a = 0.5, px = Math.cos(a) * 0.53, pz = Math.sin(a) * 0.53; b.torus(0.17, 0.025, 4, 14, mat(px, 1.25, pz, 0, -a, 0.1), ROPE); }
    // the line, from the sheave down to the lead, its marks lit
    const line = new Part(k.group, 0, 2.66, 0);
    curve(line.body, [[0, 0, 0], [0, -1, 0]], 0.012, ROPE);
    [0.12, 0.27, 0.42, 0.57, 0.72, 0.87].forEach((f, i) => line.glow.torus(0.024, 0.009, 3, 8, mat(0, -f, 0, Math.PI / 2, 0, 0), i % 2 ? pal.second : pal.light, 0.9));
    const lead = new Part(k.group);
    const lc = mixHex(0x4a4e52, pal.dark, 0.25);
    lead.body.torus(0.03, 0.01, 3, 8, mat(0, -0.02, 0), lc);
    lead.body.cyl(0.05, 0.085, 0.34, 8, mat(0, -0.2, 0), lc);
    lead.lit.cyl(0.07, 0.07, 0.02, 8, mat(0, -0.375, 0), pal.second, PULSE);
    lead.glow.sphere(0.25, 8, 6, mat(0, -0.38, 0), mixHex(pal.light, 0xffffff, 0.2), 0.3);
    k.parts.push(line, lead);
    // the pool it sounds, ringed with stones
    const cx = 0.42;
    b.cyl(0.6, 0.62, 0.04, 20, mat(cx, 0, 0), POOL);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + R() * 0.3; b.add(rock(0.13 + R() * 0.06, i + 80, 0.3), mat(cx + Math.cos(a) * 0.7, 0.03, Math.sin(a) * 0.7, 0, a, 0, 1.3, 0.6, 1), STONE[(i % 3) + 1], 0, { flat: true }); }
    const rip = motes(k.group, 90, mixHex(pal.light, 0xffffff, 0.3), 0.05, fx, 0.8);
    shingle(b, 1.6, R, 8);
    moss(b, 1.7, R, 4);
    const W = new THREE.Vector3(), dir = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
    return { light: [cx, 0.7, 0], height: 3.1, span: 1.15, update(t) {
      W.set(cx + 0.12 * Math.sin(t * 0.27), 0.95 + 0.1 * Math.sin(t * 0.41 + 1), 0.1 * Math.sin(t * 0.19 + 2));
      dir.subVectors(W, line.group.position);
      const len = dir.length();
      dir.divideScalar(len);
      line.group.quaternion.setFromUnitVectors(DOWN, dir);
      line.group.scale.set(1, len, 1);
      lead.group.position.copy(W);
      lead.group.quaternion.copy(line.group.quaternion);
      for (let m = 0; m < 3; m++) {
        const ph = (t * 0.25 + m / 3) % 1, r = 0.06 + ph * 0.48;
        for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU, j = m * 30 + i; rip.pos.set([W.x + Math.cos(a) * r, 0.04, W.z + Math.sin(a) * r], j * 3); rip.alpha[j] = (1 - ph) * 0.9; }
      }
      rip.commit();
    } };
  },
  echoshell(k, pal, P, R, fx) {
    // a great spiral shell on its side; rings of light come out of its mouth, each fainter
    const n = 56, TH = 4 * Math.PI, gb = Math.log(2.2) / TAU, Dm = 0.36, Rm = 0.42, Hm = 0.6, S = 1.25, tilt = 1.3;
    const zAxis = new THREE.Vector3(0, 0, 1), pts = [], rads = [];
    for (let i = 0; i < n; i++) {
      const th = (TH * i) / (n - 1), f = Math.exp(gb * (th - TH));
      pts.push(V([Dm * f * Math.cos(th), -Hm * f, Dm * f * Math.sin(th)]).multiplyScalar(S).applyAxisAngle(zAxis, tilt));
      rads.push(Rm * f * S * Math.min(1, (i + 1) / 6));
    }
    let lo = Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    pts.forEach((p, i) => { lo = Math.min(lo, p.y - rads[i]); x0 = Math.min(x0, p.x - rads[i]); x1 = Math.max(x1, p.x + rads[i]); z0 = Math.min(z0, p.z - rads[i]); z1 = Math.max(z1, p.z + rads[i]); });
    const off = V([-(x0 + x1) / 2, -lo - 0.1, -(z0 + z1) / 2]);
    pts.forEach((p) => p.add(off));
    const hi = Math.max(...pts.map((p, i) => p.y + rads[i]));
    const cream = mixHex(0xcdbfa6, pal.shellLo, 0.3), umber = mixHex(0x7a6650, pal.dark, 0.3);
    k.body.tube(pts, (u) => rads[Math.round(u * (n - 1))], 12, (u) => (Math.floor(u * 42) % 3 === 0 ? umber : cream));
    // its lip, pearl, and the light inside it
    const M = pts[n - 1], T = M.clone().sub(pts[n - 2]).normalize(), rm = rads[n - 1];
    const q = new THREE.Quaternion().setFromUnitVectors(zAxis, T), one = new THREE.Vector3(1, 1, 1);
    const at = (d) => new THREE.Matrix4().compose(M.clone().addScaledVector(T, d), q, one);
    k.lit.add(new THREE.TorusGeometry(rm * 1.02, 0.05, 6, 24), at(0), mixHex(pal.shellHi, 0xf3ecd6, 0.4), 1.1);
    k.glow.add(new THREE.CircleGeometry(rm * 0.95, 24), at(-0.06), mixHex(pal.light, pal.shellHi, 0.3), 0.75);
    k.glow.add(new THREE.CircleGeometry(rm * 0.75, 20), at(-0.3), pal.second, 0.5);
    // the echo: four rings to a call, each fainter, then quiet
    const N = 36, rings = motes(k.group, 4 * N, mixHex(pal.light, 0xffffff, 0.3), 0.08, fx, 0.85);
    const e1 = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0, 1, 0)).normalize(), e2 = new THREE.Vector3().crossVectors(e1, T).normalize();
    shingle(k.body, 1.7, R, 12);
    moss(k.body, 1.6, R, 4);
    return { light: [M.x, M.y, M.z], height: hi + 0.08, span: Math.max(x1 - x0, z1 - z0) / 2 + 0.2, update(t) {
      const c = t % 11;
      for (let m = 0; m < 4; m++) {
        const age = c - m * 1.1, on = age >= 0 && age < 4, ph = on ? age / 4 : 0, d = ph * 2.2, r = rm * (1 + 0.35 * d);
        const amp = on ? Math.pow(0.62, m) * (1 - ph) * Math.min(1, ph * 8) : 0;
        for (let i = 0; i < N; i++) {
          const a = (i / N) * TAU, j = m * N + i;
          rings.pos.set([M.x + T.x * d + (e1.x * Math.cos(a) + e2.x * Math.sin(a)) * r, M.y + T.y * d + (e1.y * Math.cos(a) + e2.y * Math.sin(a)) * r, M.z + T.z * d + (e1.z * Math.cos(a) + e2.z * Math.sin(a)) * r], j * 3);
          rings.alpha[j] = amp;
        }
      }
      rings.commit();
    } };
  },
  tidemark(k, pal, P, R, fx) {
    // a standing stone banded where the lake once stood; a skin of light visits each line
    const ROWS = 20, H = 2.7, cy = 1.25, n = 5 + (P.n % 4);
    const g = new THREE.BoxGeometry(1, 1, 1, 3, ROWS, 2), pa = g.attributes.position, offs = new Map();
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      if (!offs.has(key)) offs.set(key, [(R() - 0.5) * 0.08, (R() - 0.5) * 0.12]);
      const [ox, oz] = offs.get(key), taper = 1 - 0.28 * (y + 0.5);
      pa.setXYZ(i, (x + ox) * taper, y, z + oz * 0.6);
    }
    // the old lines, chosen rows of the stone, none too near another
    const gaps = Array.from({ length: n }, (_, i) => (i ? 2 : 0));
    for (let u = 16 - 2 * (n - 1); u > 0; u--) gaps[Math.floor(R() * n)]++;
    const rows = [];
    gaps.reduce((r, g) => { rows.push(r + g); return r + g; }, 2);
    const lv = rows.map((r) => cy + H * ((r + 0.5) / ROWS - 0.5)), top = Math.max(...rows);
    const crust = mixHex(0xb8b4a6, pal.shellHi, 0.15), wet = mixHex(STONE[1], pal.dark, 0.2), dry = mixHex(0x4a4c4a, pal.dark, 0.15), lichen = mixHex(0x6a7a4a, MOSS2, 0.4);
    k.body.add(g, mat(0, cy, 0, 0, 0.3, 0, 0.95, H, 0.55), (x, y, z, i) => {
      const r = Math.floor((y + 0.5) * ROWS);
      if (rows.includes(r)) return crust;
      if (r > top + 1 && ((i * 7919) % 13) === 0) return lichen;
      return r <= top ? (r % 2 ? wet : mixHex(wet, dry, 0.2)) : dry;
    }, 0, { flat: true });
    // the skin of water in light, and the line of light about the stone
    const skin = new Part(k.group, 0, lv[0], 0);
    skin.group.rotation.y = 0.3;
    skin.glow.add(new THREE.RingGeometry(0.62, 1.7, 36, 1), mat(0, 0, 0, -Math.PI / 2, 0, 0), mixHex(pal.light, 0x9fd0dc, 0.3), 0.28);
    skin.glow.add(new THREE.RingGeometry(1.66, 1.72, 36, 1), mat(0, 0.005, 0, -Math.PI / 2, 0, 0), mixHex(pal.light, 0xffffff, 0.3), 0.6);
    skin.lit.add(new THREE.TorusGeometry(1, 0.035, 4, 32), mat(0, 0, 0, Math.PI / 2, 0, 0, 0.53, 0.33, 1), mixHex(pal.light, 0xffffff, 0.3), PULSE);
    k.parts.push(skin);
    shingle(k.body, 1.5, R, 14);
    moss(k.body, 1.4, R, 3);
    const order = lv.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return { light: [0, cy, 0], height: 2.7, span: 1.2, update(t) {
      const s = t / 6, idx = Math.floor(s), f = smooth(0, 0.5, s - idx);
      const y = lv[order[idx % n]] + (lv[order[(idx + 1) % n]] - lv[order[idx % n]]) * f;
      skin.group.position.y = y;
      skin.group.scale.x = 1 - 0.28 * ((y - (cy - H / 2)) / H);
    } };
  },
  lens(k, pal, P, R, fx) {
    // a lighthouse lens on a boulder with no tower under it, turning, its beams going out
    const brass = mixHex(BRASS, pal.dark, 0.25), glassC = mixHex(0xcfe8f0, pal.light, 0.4);
    k.body.add(rock(0.85, 41, 0.25, 1), mat(0, 0.28, 0, 0, 0, 0, 1.3, 0.62, 1.1), STONE[2], 0, { flat: true });
    k.body.cyl(0.32, 0.42, 0.32, 8, mat(0, 0.9, 0), brass);
    k.body.cyl(0.5, 0.5, 0.05, 8, mat(0, 1.07, 0), brass);
    const lens = new Part(k.group, 0, 1.1, 0);
    const lb = lens.body;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; lb.box(0.035, 1.3, 0.035, mat(Math.sin(a) * 0.56, 0.64, Math.cos(a) * 0.56, 0, a, 0), brass); }
    for (const [y, r] of [[0.02, 0.55], [0.3, 0.56], [0.9, 0.56]]) lb.torus(r, 0.025, 4, 8, mat(0, y, 0, Math.PI / 2, 0, 0), brass);
    lens.glow.add(new THREE.CylinderGeometry(0.55, 0.55, 0.6, 8, 1, true), mat(0, 0.6, 0), glassC, 0.15);
    for (let m = 0; m < 6; m++) lens.lit.torus(0.52 - m * 0.06, 0.024, 4, 24, mat(0, 0.95 + m * 0.08, 0, Math.PI / 2, 0, 0), glassC, 0.9);
    for (let m = 0; m < 3; m++) lens.lit.torus(0.5 - m * 0.05, 0.024, 4, 24, mat(0, 0.25 - m * 0.08, 0, Math.PI / 2, 0, 0), glassC, 0.9);
    lb.sphere(0.24, 12, 5, mat(0, 1.4, 0), brass, 0, 0, TAU, 0, Math.PI / 2);
    lb.sphere(0.06, 6, 4, mat(0, 1.68, 0), brass);
    lb.cyl(0.02, 0.02, 0.06, 4, mat(0, 1.62, 0), brass);
    // two bullseyes, back to back, and the beams they make
    for (let i = 0; i < 2; i++) {
      const a = ((4 * i + 0.5) / 8) * TAU, x = Math.sin(a) * 0.515, z = Math.cos(a) * 0.515;
      lens.lit.cyl(0.07, 0.07, 0.02, 10, mat(x, 0.6, z, Math.PI / 2, a, 0), glassC, 1.3);
      for (let r = 1; r <= 3; r++) lens.glow.add(new THREE.RingGeometry(r * 0.075, r * 0.075 + 0.014, 20), mat(x * 1.01, 0.6, z * 1.01, 0, a, 0), mixHex(pal.light, 0xffffff, 0.4), 0.7);
      const beam = new THREE.CylinderGeometry(0.9, 0.22, 6, 10, 1, true);
      beam.rotateX(Math.PI / 2);
      beam.translate(0, 0, 3.55);
      lens.glow.add(beam, mat(0, 0.6, 0, 0, a, 0), mixHex(pal.light, 0xffffff, 0.4), 0.12);
    }
    k.parts.push(lens);
    const flame = new Part(k.group, 0, 1.7, 0);
    flame.lit.sphere(0.1, 8, 6, null, mixHex(0xfff1c9, pal.light, 0.4), PULSE);
    flame.glow.sphere(0.36, 10, 6, null, mixHex(0xfff1c9, pal.light, 0.4), 0.45);
    k.parts.push(flame);
    shingle(k.body, 1.8, R, 12);
    moss(k.body, 1.2, R, 4);
    return { light: [0, 1.7, 0], height: 2.8, span: 1.2, update(t) {
      lens.group.rotation.y = t * 0.22;
      flame.group.scale.setScalar(0.92 + 0.08 * Math.sin(t * 5.3) * Math.sin(t * 1.7));
    } };
  },
  mooring(k, pal, P, R, fx) {
    // a mooring post, its rope going up and out into the air to a little light, drawing taut
    // and slackening as if something rode on it out there
    const b = k.body, X = -1.5, wood = mixHex(WOOD, pal.dark, 0.15), iron = mixHex(IRON, pal.dark, 0.2);
    b.cyl(0.2, 0.25, 1.5, 9, mat(X, 0.65, 0), wood);
    b.cyl(0.23, 0.23, 0.08, 9, mat(X, 1.42, 0), iron);
    b.torus(0.235, 0.025, 4, 12, mat(X, 1.18, 0, Math.PI / 2, 0, 0), iron);
    for (let i = 0; i < 3; i++) b.torus(0.25, 0.04, 4, 14, mat(X, 0.86 + i * 0.08, 0, Math.PI / 2 + (i - 1) * 0.18, 0, 0), ROPE);
    b.add(rock(0.09, 5, 0.3), mat(X + 0.25, 0.95, 0.03), ROPE);
    b.cyl(0.14, 0.17, 0.55, 8, mat(X - 0.6, 0.2, -0.55, 0.15, 0, 0.1), wood);
    for (let m = 0; m < 3; m++) b.torus(0.32 - m * 0.05, 0.035, 4, 18, mat(X + 0.4, 0.035 + m * 0.05, 0.65, Math.PI / 2, 0, 0), ROPE);
    // the rope: rewritten every frame
    const NS = 24, SEG = 6, A = V([X + 0.25, 0.95, 0]), E = new THREE.Vector3(), C = new THREE.Vector3(), pts = Array.from({ length: NS }, () => new THREE.Vector3());
    const at = (s, out) => { const a = (1 - s) * (1 - s), c = 2 * s * (1 - s), e = s * s; return out.set(a * A.x + c * C.x + e * E.x, a * A.y + c * C.y + e * E.y, a * A.z + c * C.z + e * E.z); };
    const shape = (t) => {
      const pull = 0.5 + 0.5 * Math.sin(t * 0.31);
      E.set(1.9 + 0.3 * pull, 2.3 + 0.35 * pull, 0.35 * Math.sin(t * 0.13));
      const sag = 0.08 + 0.55 * (1 - pull);
      C.addVectors(A, E).multiplyScalar(0.5);
      C.y -= 2 * sag;
      for (let i = 0; i < NS; i++) at(i / (NS - 1), pts[i]);
    };
    shape(0);
    const rope = new Part(k.group);
    rope.body.tube(pts, 0.035, SEG, (u) => (u < 0.7 ? ROPE : mixHex(ROPE, pal.light, (u - 0.7) / 0.3)), (u) => (u < 0.65 ? 0 : 1.4 * ((u - 0.65) / 0.35) ** 1.5));
    const end = new Part(k.group);
    end.glow.sphere(0.32, 10, 6, null, mixHex(pal.light, 0xffffff, 0.2), 0.5);
    end.glow.sphere(0.12, 8, 5, null, mixHex(pal.light, 0xffffff, 0.5), 0.8);
    k.parts.push(rope, end);
    const drips = motes(k.group, 24, mixHex(pal.light, 0xcfe8f0, 0.5), 0.05, fx, 0.8), dp = new THREE.Vector3();
    const sAt = Array.from({ length: 24 }, (_, i) => 0.25 + 0.7 * ((i * 0.618 + R() * 0.2) % 1));
    shingle(b, 2.0, R, 14);
    moss(b, 1.2, R, 3);
    let mesh = null;
    return { light: [2.05, 2.45, 0], height: 3, span: 2.3, update(t) {
      shape(t);
      if (!mesh) { mesh = rope.group.children[0]; mesh.frustumCulled = false; }
      const pos = mesh.geometry.attributes.position;
      tubeVerts(pts, 0.035, SEG, pos.array);
      pos.needsUpdate = true;
      end.group.position.copy(E);
      for (let i = 0; i < 24; i++) {
        const ph = (t * 0.5 + i * 0.37) % 1;
        at(sAt[i], dp);
        drips.pos.set([dp.x, dp.y * (1 - ph * ph) - 0.04, dp.z], i * 3);
        drips.alpha[i] = 1 - ph;
      }
      drips.commit();
    } };
  },
  keptice(k, pal, P, R, fx) {
    // slabs of lake ice pushed up on the shore that never melted; in the largest a lantern,
    // frozen in and still alight, and cracks of light that open and close
    const iceC = mixHex(ICE, pal.light, 0.35), edge = mixHex(0xe6f2f6, pal.light, 0.2);
    const slab = new Part(k.group, 0.1, 1.0, 0);
    slab.group.rotation.set(-0.12, 0.25, 0.18);
    const outline = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.2 + (R() - 0.5) * 0.3, f = 0.88 + R() * 0.2; outline.push(new THREE.Vector2(Math.cos(a) * 0.85 * f, Math.sin(a) * 1.2 * f)); }
    const shp = new THREE.Shape(outline);
    const ex = new THREE.ExtrudeGeometry(shp, { depth: 0.32, bevelEnabled: false });
    ex.translate(0, 0, -0.16);
    slab.glow.add(ex, null, iceC, 0.22);
    for (const z of [-0.16, 0.16]) slab.lit.tube([...outline, outline[0]].map((p) => V([p.x, p.y, z])), 0.02, 4, edge, 0.9);
    for (const p of outline) slab.lit.tube([V([p.x, p.y, -0.16]), V([p.x, p.y, 0.16])], 0.02, 4, edge, 0.9);
    // the lantern in it, askew as it froze
    const ln = mat(0.05, -0.1, 0, 0, 0.4, 0.35), lm = (x, y, z, rx = 0) => ln.clone().multiply(mat(x, y, z, rx));
    const iron = mixHex(IRON, pal.dark, 0.1);
    slab.body.cyl(0.1, 0.1, 0.04, 8, lm(0, -0.14, 0), iron);
    slab.body.cone(0.1, 0.09, 8, lm(0, 0.165, 0), iron);
    slab.body.torus(0.06, 0.008, 3, 10, lm(0, 0.26, 0), iron);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; slab.body.box(0.012, 0.24, 0.012, lm(Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085), iron); }
    slab.lit.cyl(0.075, 0.075, 0.22, 8, lm(0, 0, 0), mixHex(0xffd27a, pal.light, 0.35), 1.2);
    slab.glow.sphere(0.5, 10, 6, lm(0, 0, 0), mixHex(0xffd27a, pal.light, 0.35), 0.3);
    const flame = new Part(slab.group, 0.05, -0.1, 0);
    flame.glow.sphere(0.07, 8, 5, null, mixHex(0xfff1c9, pal.light, 0.2), 1);
    // bubbles frozen in columns on their way up
    for (const cx of [-0.42, 0.36, 0.55]) { let y = -0.85 + R() * 0.2; for (let i = 0; i < 7 && y < 0.9; i++) { slab.lit.ico(0.014 + R() * 0.016, 0, mat(cx + (R() - 0.5) * 0.05, y, (R() - 0.5) * 0.18), edge, 1.1); y += 0.07 + i * 0.05; } }
    // cracks that run in from the edge and heal
    const cracks = [];
    for (let c = 0; c < 3; c++) {
      const o = outline[(c * 2 + 1) % 6], dirn = o.clone().multiplyScalar(-1).normalize();
      const cr = new Part(slab.group, o.x * 0.95, o.y * 0.95, 0.165);
      const pl = [V([0, 0, 0])];
      let p = new THREE.Vector2(0, 0);
      for (let i = 0; i < 6; i++) { const ang = Math.atan2(dirn.y, dirn.x) + (R() - 0.5) * 1.2; p = p.clone().add(new THREE.Vector2(Math.cos(ang), Math.sin(ang)).multiplyScalar(0.12)); pl.push(V([p.x, p.y, 0])); }
      cr.glow.tube(pl, 0.012, 3, mixHex(pal.light, 0xffffff, 0.4), 1);
      cracks.push(cr);
    }
    k.parts.push(slab, flame, ...cracks);
    // the lesser slabs about it, opaque, with a little light in them
    const top = mixHex(ICE, pal.shellHi, 0.2), low = mixHex(0x56707c, pal.dark, 0.3);
    for (let m = 0; m < 4; m++) {
      const a = (m / 4) * TAU + 0.6 + R() * 0.4, d = 0.95 + R() * 0.35, w = 1.0 + R() * 0.5, h = 0.7 + R() * 0.5;
      k.body.add(new THREE.BoxGeometry(w, h, 0.22, 2, 3, 1), mat(Math.cos(a) * d, h * 0.3, Math.sin(a) * d, 0.5 + R() * 0.4, -a + Math.PI / 2, (R() - 0.5) * 0.6), (x, y) => (y > 0.15 ? top : y > -0.2 ? mixHex(top, low, 0.5) : low), 0.12, { flat: true });
    }
    k.body.cyl(1.7, 1.75, 0.03, 24, mat(0, 0, 0), POOL);
    k.glow.add(new THREE.CircleGeometry(1.2, 24), mat(0, 0.025, 0, -Math.PI / 2, 0, 0), iceC, 0.12);
    const drips = motes(k.group, 24, mixHex(ICE, pal.light, 0.4), 0.04, fx, 0.8);
    const dsrc = Array.from({ length: 24 }, (_, i) => { const a = R() * TAU, r = 0.6 + R() * 0.7; return [Math.cos(a) * r, 0.45 + R() * 0.6, Math.sin(a) * r]; });
    shingle(k.body, 2.0, R, 10);
    return { light: [0.08, 0.9, 0], height: 2.3, span: 1.7, update(t) {
      flame.group.scale.setScalar(0.8 + 0.2 * Math.sin(t * 6.1) * Math.sin(t * 2.3 + 1));
      cracks.forEach((cr, i) => { const s = (t * 0.045 + i * 0.37) % 1; cr.group.scale.setScalar(Math.max(0.001, smooth(0, 0.6, s) * (1 - smooth(0.85, 1, s)))); });
      for (let i = 0; i < 24; i++) { const ph = (t * 0.4 + i * 0.29) % 1, [x, y, z] = dsrc[i]; drips.pos.set([x, y * (1 - ph * ph) + 0.03, z], i * 3); drips.alpha[i] = 1 - ph; }
      drips.commit();
    } };
  },
};
