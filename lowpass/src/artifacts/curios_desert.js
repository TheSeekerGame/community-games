import * as THREE from 'three';
import { mat, mul, roughen } from '../render/build.js';
import { TAU } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { PULSE, STONE } from './parts.js';
import { METAL, Part, motes, rock, curve } from './curiokit.js';

// What lies in the sand about a clearing in the Grey Waste, found only on foot: what the
// desert keeps. Things half buried, scoured, glazed and salted, left by an earlier survey
// or by nobody anyone knows of; small mysteries of sand and glass and wind. The same format
// as the forest's (curios.js): the kinds and the depth that first has them, what the Codex
// says of each, and how each is built (about a person's size, in meters).
export const CURIOS = [
  ['dial', 0], ['bubble', 0], ['ripples', 0], ['saltcairn', 0], ['windharp', 0],
  ['mirage', 3], ['splash', 3],
  ['humstone', 4], ['hourglass', 4],
  ['gnomon', 5],
];

const rings = (P) => 5 + (P.n % 3);
export const INFO = {
  dial: ['ZDL', 'Buried dial', ['Dial', 'Gauge', 'Instrument', 'Reading'], () => 'An instrument of some earlier survey, nearly drowned in a drift; its dial is still lit under the glass, and its needle still hunts back and forth for something to read.'],
  bubble: ['QBL', 'Old air', ['Bubble', 'Breath', 'Sample', 'Vessel'], () => 'A sphere of glass half sunk in the sand, sealed with the air of another century inside; its dust still turns in a draught that is not here, over sand of another color.'],
  ripples: ['ZRP', 'Held ripples', ['Ripples', 'Pattern', 'Field', 'Rings'], (P) => `Wind ripples that run in ${rings(P)} rings about a standing stone instead of across the waste, each broken at the golden angle from the last; light walks out along them.`],
  saltcairn: ['QSC', 'Salt cairn', ['Cairn', 'Stack', 'Waymark', 'Pile'], () => 'Blocks of salt stacked into a cairn as tall as a person, on a floor of salt plates; a light is shut up inside it, and nothing says what the cairn marks.'],
  windharp: ['ZHP', 'Wind harp', ['Harp', 'Frame', 'Strings', 'Chord'], (P) => `A frame of bleached metal like old bones, half buried, strung with ${P.n} wires; when the wind gets up they blur and ring, and the sand goes through them.`],
  mirage: ['QMR', 'Bottled mirage', ['Bottle', 'Mirage', 'Shimmer', 'Keepsake'], () => 'A bottle of dark glass sealed with salt, lying where it was dropped; a mirage of water wavers inside it, and a little of it has got out and wavers in the air above.'],
  splash: ['ZSP', 'Held splash', ['Splash', 'Instant', 'Strike', 'Drop'], (P) => `Where something struck, the sand fused into a dish of black glass, and the splash it threw up has stopped in the air: ${P.n} drops, rocking a finger’s breadth along their arcs.`],
  humstone: ['ZHM', 'Humming stone', ['Stone', 'Hum', 'Hollow', 'Resonator'], (P) => `A stone the wind has hollowed, humming through its ${rings(P)} holes; the sand about it shivers into rings, and keeps them.`],
  hourglass: ['QHG', 'Upward glass', ['Hourglass', 'Measure', 'Interval', 'Glass'], () => 'An hourglass taller than a person, hung in a cradle of metal; its sand falls up, and when all of it has gone up, the glass turns itself over.'],
  gnomon: ['QGN', 'Sundial', ['Gnomon', 'Dial', 'Shadow', 'Hours'], () => 'A sundial of salt and black glass keeping the hours of a sun that is not in the sky; its shadow is a blade of light, and goes round once a minute.'],
};

// ------------------------------------------------------------------ the waste's colors
const SAND = 0xaeaba5, SAND2 = 0xc2bfb8, SANDK = 0x8e8b85, OLDSAND = 0xb6a88e, SALT = 0xe9e6df, GLASS = 0x161a20, BONE = 0xc8c2b5;
const GA = 2.39996; // the golden angle

// a drift of sand heaped over something: a low dome, rough
function drift(b, x, z, rx, rz, h, yaw, seed) {
  const g = new THREE.SphereGeometry(1, 14, 5, 0, TAU, 0, Math.PI / 2);
  roughen(g, 0.12, seed);
  b.add(g, mat(x, -0.03, z, 0, yaw, 0, rx, h, rz), (px, py) => (py > 0.6 ? SAND2 : SAND), 0, { flat: true });
}
// dark wind-polished pebbles scattered on the pale sand
function pebbles(b, r, R, n = 6) {
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = r * (0.55 + R() * 0.45);
    b.add(rock(0.07 + R() * 0.08, i + 90, 0.35), mat(Math.cos(a) * d, 0.02, Math.sin(a) * d, 0, R() * 3, 0, 1, 0.6, 1.2), STONE[1 + (i % 3)], 0, { flat: true });
  }
}
// a matrix turning +y (or +z) onto a direction n, at p
const aim = (p, n, from = new THREE.Vector3(0, 1, 0)) => new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(from, n), new THREE.Vector3(1, 1, 1));
const smooth = (x) => x * x * (3 - 2 * x);

export const KINDS = {
  dial(k, pal, P, R) {
    // an instrument drum tipped on its back in a drift, its dial face up and lit, its
    // needle still hunting
    const b = k.body, hull = mixHex(METAL, SAND, 0.35), tilt = 0.6, M = mat(0, 0.35, 0, tilt, 0, 0);
    const at = (x, y, z, rx = 0, ry = 0, rz = 0) => mul(M, mat(x, y, z, rx, ry, rz));
    b.cyl(0.55, 0.6, 0.5, 16, at(0, -0.25, 0), hull);
    b.torus(0.52, 0.05, 4, 28, at(0, 0, 0, Math.PI / 2, 0, 0), mixHex(METAL, 0xffffff, 0.2));
    k.lit.cyl(0.48, 0.48, 0.02, 24, at(0, 0, 0), mixHex(pal.light, 0xfff1c9, 0.5), 0.9);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, long = i % 6 === 0, r = long ? 0.36 : 0.39;
      b.box(0.018, 0.012, long ? 0.12 : 0.06, at(Math.cos(a) * r, 0.016, Math.sin(a) * r, 0, Math.PI / 2 - a, 0), 0x1a1c20);
    }
    // the glass over the dial: a shallow cap
    k.glow.sphere(1.95, 20, 2, at(0, 0.06 - 1.95, 0), mixHex(0xdfeff4, pal.light, 0.2), 0.14, 0, TAU, 0, 0.249);
    k.lit.sphere(0.05, 6, 4, at(0.4, -0.15, 0.4), pal.second, PULSE);
    const needle = new Part(k.group, 0, 0.35, 0);
    needle.group.rotation.x = tilt;
    needle.body.box(0.03, 0.012, 0.38, mat(0, 0.03, 0.14), 0x16181c);
    needle.body.cyl(0.035, 0.035, 0.03, 8, mat(0, 0.03, 0), 0x16181c);
    needle.lit.box(0.03, 0.014, 0.05, mat(0, 0.03, 0.31), pal.second, 1.4);
    k.parts.push(needle);
    // the drift it has half gone under, sand spilled over its lower edge, a cable, a snapped rod
    drift(b, 0, -0.85, 1.3, 0.7, 0.65, 0, 11);
    drift(b, 0.05, 0.75, 0.9, 0.45, 0.2, 0.3, 12);
    curve(b, [[0.5, 0.15, -0.2], [0.85, 0.02, 0.1], [1.2, -0.04, 0]], 0.025, 0x2a2c30);
    curve(b, [[-0.85, -0.2, 0.35], [-0.98, 0.95, 0.2]], 0.022, hull);
    pebbles(b, 1.4, R);
    return { light: [0, 0.45, 0.15], height: 1.0, span: 1.6, update(t) { needle.group.rotation.y = 0.9 * Math.sin(t * 0.31) + 0.25 * Math.sin(t * 1.7 + 1) + 0.05 * Math.sin(t * 7.3); } };
  },
  bubble(k, pal, P, R, fx) {
    // a glass sphere half sunk, sealed with old air inside, its dust still turning
    const C = 0.55, Rb = 0.85;
    k.glow.sphere(Rb, 22, 14, mat(0, C, 0), mixHex(0xdfeff4, pal.light, 0.2), 0.14);
    k.glow.torus(Rb + 0.005, 0.012, 3, 48, mat(0, C, 0, 0.3, 0.5, 0), mixHex(pal.light, 0xffffff, 0.4), 0.7);
    // the sand sealed in with it, another color, level inside
    k.body.cyl(0.72, 0.72, 0.03, 24, mat(0, 0.12, 0), OLDSAND);
    // a collar of sand glazed where it was set down hot
    k.body.torus(0.82, 0.13, 5, 28, mat(0, 0.04, 0, Math.PI / 2, 0, 0, 1, 1, 0.5), GLASS);
    // its seal on top
    k.body.cyl(0.07, 0.09, 0.12, 8, mat(0, C + Rb + 0.04, 0), mixHex(METAL, SAND, 0.3));
    k.lit.sphere(0.035, 6, 4, mat(0, C + Rb + 0.12, 0), pal.second, PULSE);
    drift(k.body, -0.75, 0.2, 0.75, 0.7, 0.4, 0.4, 21);
    pebbles(k.body, 1.3, R, 5);
    const N = 50, dust = motes(k.group, N, mixHex(0xfff1c9, pal.light, 0.35), 0.05, fx, 0.8);
    return { light: [0, 0.6, 0], height: 1.6, span: 1.5, update(t) {
      for (let i = 0; i < N; i++) {
        const a = i * GA, r = 0.15 + 0.5 * ((i * 0.37) % 1), u = ((t * 0.03 + i * 0.618) % 1) * TAU;
        dust.pos.set([Math.cos(a) * r * Math.cos(u), C + 0.1 + r * 0.7 * Math.sin(u), Math.sin(a) * r * Math.cos(u)], i * 3);
        dust.alpha[i] = 0.5 + 0.5 * Math.sin(t * 0.7 + i);
      }
      dust.commit();
    } };
  },
  ripples(k, pal, P, R, fx) {
    // wind ripples gone round a standing stone in rings, each broken at the golden angle
    // from the last; light walks out along them
    const n = rings(P), r0 = 0.6, dr = 0.3, rMax = r0 + (n - 1) * dr;
    for (let i = 0; i < n; i++) {
      const gap = 0.5 + i * 0.05;
      k.body.add(new THREE.TorusGeometry(r0 + i * dr, 0.09, 3, 44, TAU - gap), mat(0, 0.02, 0, Math.PI / 2, i * GA, 0, 1, 1, 0.55), i % 2 ? SAND2 : mixHex(SAND2, 0xffffff, 0.15));
    }
    k.body.add(rock(0.32, 31, 0.2, 0), mat(0, 0.62, 0, 0.1, R() * TAU, 0.08, 1, 2, 0.85), STONE[1], 0, { flat: true });
    drift(k.body, 0, 0, 0.5, 0.5, 0.16, 0, 32);
    k.lit.ico(0.06, 0, mat(0, 1.3, 0), pal.light, PULSE);
    const W = 2, M = 64, wave = motes(k.group, W * M, mixHex(pal.light, 0xffffff, 0.3), 0.07, fx, 0.8);
    return { light: [0, 0.9, 0], height: 1.4, span: rMax + 0.1, update(t) {
      for (let w = 0; w < W; w++) {
        const ph = (t / 10 + w / W) % 1, rr = 0.45 + ph * (rMax - 0.35);
        const f = (rr - r0) / dr, near = 1 - Math.min(1, Math.abs(f - Math.round(f)) * 3);
        for (let j = 0; j < M; j++) {
          const th = (j / M) * TAU, i = w * M + j;
          wave.pos.set([Math.cos(th) * rr, 0.08, Math.sin(th) * rr], i * 3);
          wave.alpha[i] = Math.sin(ph * Math.PI) * (0.25 + 0.75 * near);
        }
      }
      wave.commit();
    } };
  },
  saltcairn(k, pal, P, R) {
    // a cairn of salt blocks, a light shut inside, on a floor of salt plates
    const tiers = [[5, 0.5, 0.42], [4, 0.42, 0.32], [3, 0.36, 0.22], [2, 0.3, 0.12], [1, 0.27, 0], [1, 0.2, 0]];
    const salts = [SALT, 0xdcd8cf, 0xf2f0ea, 0xcfcac0];
    let y = 0, n = 0;
    tiers.forEach(([c, s, r], ti) => {
      const a0 = R() * TAU;
      for (let i = 0; i < c; i++) {
        const a = a0 + (i / c) * TAU, sz = s * (0.85 + R() * 0.3);
        const m = mat(Math.cos(a) * r + (R() - 0.5) * 0.05, y + sz / 2, Math.sin(a) * r + (R() - 0.5) * 0.05, (R() - 0.5) * 0.25, R() * TAU, (R() - 0.5) * 0.25);
        if (ti === tiers.length - 1) k.lit.box(sz, sz, sz, m, mixHex(SALT, pal.light, 0.45), 1.2);
        else k.body.box(sz, sz, sz, m, salts[n++ % 4]);
      }
      y += s * 0.82;
    });
    k.lit.box(0.3, 0.3, 0.3, mat(0, 0.75, 0, 0, 0.6, 0), pal.light, PULSE);
    // the salt floor: plates with raised rims, small crystals on them
    for (let i = 0; i < 14; i++) {
      const a = i * GA + R() * 0.3, d = 0.8 + Math.sqrt(i / 14) * 0.8, r = 0.22 + R() * 0.16, yaw = R() * TAU;
      k.body.cyl(r, r * 1.05, 0.04, 6, mat(Math.cos(a) * d, 0, Math.sin(a) * d, 0, yaw, 0), mixHex(SALT, SAND, 0.25 + R() * 0.3));
      k.body.torus(r, 0.025, 3, 6, mat(Math.cos(a) * d, 0.02, Math.sin(a) * d, Math.PI / 2, yaw, 0), SALT);
      if (i % 3 === 0) k.body.box(0.09, 0.09, 0.09, mat(Math.cos(a) * d, 0.06, Math.sin(a) * d, 0.3, yaw, 0.2), 0xf4f2ec);
    }
    return { light: [0, 0.8, 0], height: 1.9, span: 2 };
  },
  windharp(k, pal, P, R, fx) {
    // a harp-frame of bleached metal like old bones, half buried, strung with wires that
    // blur and ring when the wind gets up
    const b = k.body, n = P.n;
    const neckY = (x) => { const s = (x + 0.75) / 1.6; return 2.45 - 1.05 * s + 0.22 * Math.sin(Math.PI * s); };
    curve(b, [[-0.8, -0.15, 0], [-0.86, 0.8, 0], [-0.82, 1.7, 0], [-0.75, 2.45, 0]], (u) => 0.075 - 0.025 * u, BONE);
    const neck = [];
    for (let i = 0; i <= 8; i++) { const x = -0.75 + (i / 8) * 1.6; neck.push([x, neckY(x), 0]); }
    neck.push([0.95, 1.3, 0], [0.92, 1.18, 0]);
    curve(b, neck, 0.05, BONE);
    curve(b, [[-0.95, 0.1, 0], [0, 0.2, 0.02], [1.0, 0.1, 0]], 0.1, mixHex(BONE, SANDK, 0.3));
    b.sphere(0.1, 8, 6, mat(-0.75, 2.45, 0), BONE);
    b.sphere(0.12, 8, 6, mat(-0.83, 0.12, 0), BONE);
    k.lit.sphere(0.06, 8, 6, mat(0.92, 1.18, 0), pal.second, PULSE);
    const color = mixHex(pal.light, 0xffffff, 0.35), strings = [], w = 0.008;
    for (let i = 0; i < n; i++) {
      const x = -0.6 + (i * 1.35) / (n - 1), y0 = 0.27, y1 = neckY(x) - 0.04, L = y1 - y0;
      const s = new Part(k.group, x, y0, 0);
      s.glow.quad([0, 0, 0], [w, L / 2, 0], [0, L, 0], [-w, L / 2, 0], color, 0.9);
      s.glow.quad([0, 0, 0], [0, L / 2, w], [0, L, 0], [0, L / 2, -w], color, 0.9);
      k.lit.sphere(0.025, 5, 3, mat(x, y1 + 0.02, 0.05), pal.light, 1);
      strings.push({ s, f: 6 / L + i * 0.37 });
    }
    k.parts.push(...strings.map((x) => x.s));
    drift(b, 0.55, 0.1, 0.7, 0.55, 0.22, 0.2, 41);
    drift(b, -0.85, 0, 0.45, 0.45, 0.3, 0, 42);
    pebbles(b, 1.2, R, 5);
    const N = 40, grit = motes(k.group, N, 0xd9d5cc, 0.035, fx, 0.5);
    return { light: [0, 1.3, 0], height: 2.6, span: 1.3, update(t) {
      const g = Math.min(1, Math.max(0, Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.11 + 2) * 0.5 + 0.3));
      for (const { s, f } of strings) { const v = 1 + g * 5 * Math.abs(Math.sin(t * f)); s.group.scale.set(v, 1, v); }
      for (let i = 0; i < N; i++) {
        const u = (t * 0.35 + i * 0.618) % 1;
        grit.pos.set([-2 + u * 4, 0.1 + ((i * 0.37) % 1) * 1.6 + 0.08 * Math.sin(t * 2 + i), (((i * 0.71) % 1) - 0.5) * 1.2], i * 3);
        grit.alpha[i] = Math.sin(u * Math.PI) * (0.2 + 0.8 * g);
      }
      grit.commit();
    } };
  },
  mirage(k, pal, P, R, fx) {
    // a bottle of dark glass lying half buried, sealed with salt, a mirage of water inside it
    // and a little of it got out, wavering in the air above
    const prof = [[0, -0.75], [0.38, -0.75], [0.45, -0.68], [0.45, 0.45], [0.38, 0.62], [0.2, 0.72], [0.14, 0.78], [0.14, 1.02], [0.17, 1.04], [0.17, 1.08], [0, 1.08]];
    const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
    k.glow.add(lathe, mat(0, 0.3, 0, 0, 0, -Math.PI / 2), mixHex(0x9fb8c0, pal.light, 0.25), 0.18);
    for (const x of [-0.7, 0.45]) k.body.torus(0.45, 0.03, 4, 20, mat(x, 0.3, 0, 0, Math.PI / 2, 0), GLASS);
    k.body.cyl(0.4, 0.4, 0.03, 20, mat(-0.75, 0.3, 0, 0, 0, Math.PI / 2), GLASS);
    k.body.cyl(0.15, 0.15, 0.12, 10, mat(1.08, 0.3, 0, 0, 0, Math.PI / 2), SALT);
    k.body.box(1.3, 0.02, 0.6, mat(-0.1, 0.18, 0), OLDSAND);
    drift(k.body, 0, 0, 1.3, 0.75, 0.22, 0.1, 51);
    // the mirage inside: a band of water, a band of sky, dead snags standing on it, their
    // reflections hanging under
    const scene = new Part(k.group, -0.1, 0.3, 0);
    scene.glow.add(new THREE.PlaneGeometry(1.1, 0.1), mat(0, 0.06, 0), mixHex(pal.light, 0xbfe6ff, 0.4), 0.8);
    scene.glow.add(new THREE.PlaneGeometry(1.1, 0.16), mat(0, 0.2, 0), pal.second, 0.3);
    for (let i = 0; i < 4; i++) {
      const x = -0.4 + i * 0.25 + (R() - 0.5) * 0.08, h = 0.1 + R() * 0.1;
      scene.body.box(0.015, h, 0.015, mat(x, 0.11 + h / 2, 0), 0x2a2c30);
      scene.glow.add(new THREE.PlaneGeometry(0.015, h * 0.8), mat(x, 0.01 - h * 0.4, 0), mixHex(pal.light, 0xbfe6ff, 0.4), 0.4);
    }
    // what got out: a band of shimmering water standing over the bottle, snags hanging from it
    const over = new Part(k.group, 0, 1.15, 0);
    over.glow.add(new THREE.CylinderGeometry(0.7, 0.7, 0.18, 28, 1, true), null, mixHex(pal.light, 0xbfe6ff, 0.4), 0.35);
    over.glow.add(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 28, 1, true), mat(0, 0.13, 0), pal.second, 0.2);
    for (let i = 0; i < 5; i++) { const a = i * GA, h = 0.12 + R() * 0.12; over.glow.box(0.015, h, 0.015, mat(Math.cos(a) * 0.7, -0.09 - h / 2, Math.sin(a) * 0.7), mixHex(pal.light, 0xffffff, 0.3), 0.3); }
    k.parts.push(scene, over);
    return { light: [0, 1.15, 0], height: 1.4, span: 1.4, update(t) {
      scene.group.scale.y = 1 + 0.25 * Math.sin(t * 1.3) * Math.sin(t * 0.37);
      scene.group.position.x = -0.1 + 0.05 * Math.sin(t * 0.2);
      over.group.position.y = 1.15 + 0.08 * Math.sin(t * 0.5);
      over.group.scale.y = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.9 + Math.sin(t * 0.31) * 2));
      over.group.rotation.y = t * 0.05;
    } };
  },
  splash(k, pal, P, R) {
    // a dish of sand fused to black glass where something struck, the splash it threw up
    // stopped in the air, its drops rocking a little along their arcs
    const b = k.body;
    b.torus(1.55, 0.32, 5, 30, mat(0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 0.5), SAND);
    b.torus(1.15, 0.16, 5, 30, mat(0, 0.03, 0, Math.PI / 2, 0, 0, 1, 1, 0.7), GLASS);
    b.cyl(1.15, 1.15, 0.04, 30, mat(0, 0.02, 0), 0x0d1014);
    for (const r of [0.5, 0.8]) k.glow.torus(r, 0.01, 3, 40, mat(0, 0.045, 0, Math.PI / 2, 0, 0), pal.light, 0.25);
    const jet = mixHex(GLASS, pal.shellHi, 0.25);
    b.cyl(0.04, 0.22, 1.2, 10, mat(0, 0.62, 0), jet);
    b.torus(0.28, 0.07, 5, 16, mat(0, 0.06, 0, Math.PI / 2, 0, 0), jet);
    k.lit.sphere(0.1, 10, 8, mat(0, 1.42, 0), mixHex(pal.light, 0xffffff, 0.2), PULSE);
    const drops = [], dc = mixHex(GLASS, pal.shellHi, 0.35);
    for (let i = 0; i < P.n; i++) {
      const a = i * GA + R() * 0.2, H = 0.6 + R() * 0.5, s0 = 0.3 + R() * 0.45, r = 0.06 + R() * 0.03;
      const d = new Part(k.group);
      d.body.sphere(r, 8, 6, mat(0, 0, 0, 0, 0, 0, 1, 1.25, 1), dc);
      drops.push({ d, a, H, s0, i });
    }
    k.parts.push(...drops.map((x) => x.d));
    const place = ({ d, a, H, s0, i }, t) => {
      const s = s0 + 0.04 * Math.sin(t * 0.2 + i), h = 0.25 + 1.0 * s;
      d.group.position.set(Math.cos(a) * h, 0.1 + H * 4 * s * (1 - s), Math.sin(a) * h);
    };
    drops.forEach((x) => place(x, 0));
    return { light: [0, 1.42, 0], height: 1.6, span: 1.9, update(t) { for (const x of drops) place(x, t); } };
  },
  humstone(k, pal, P, R, fx) {
    // a stone the wind has hollowed, humming through its holes; the sand about it shivers
    // into rings
    const SX = 1.1, SY = 1.25, SZ = 0.8, CY = 1.05;
    k.body.add(rock(1, 61, 0.18, 1), mat(0, CY, 0, 0, 0, 0, SX, SY, SZ), mixHex(STONE[3], SANDK, 0.4), 0, { flat: true });
    const m = rings(P);
    for (let j = 0; j < m; j++) {
      const side = j % 2, idx = j >> 1, cnt = side ? m >> 1 : (m + 1) >> 1;
      const az = side * Math.PI + (cnt > 1 ? (idx / (cnt - 1) - 0.5) * 1.3 : 0), el = (idx % 2 ? 0.35 : -0.1) + (R() - 0.5) * 0.15;
      const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
      const p = new THREE.Vector3(SX * dx, CY + SY * dy, SZ * dz), nv = new THREE.Vector3(dx / SX, dy / SY, dz / SZ).normalize();
      k.body.add(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 10), aim(p.clone().addScaledVector(nv, 0.02), nv), 0x08090b);
      k.lit.add(new THREE.TorusGeometry(0.14, 0.03, 4, 14), aim(p.clone().addScaledVector(nv, 0.1), nv, new THREE.Vector3(0, 0, 1)), pal.light, j % 2 ? PULSE : 1);
    }
    pebbles(k.body, 1.75, R, 7);
    const N = 150, lobes = 3 + (P.n % 4), sand = motes(k.group, N, mixHex(0xe8e2d4, pal.light, 0.5), 0.06, fx, 0.85);
    return { light: [0, 1.2, 0.85], height: 2.45, span: 2, update(t) {
      for (let i = 0; i < N; i++) {
        const ring = i % 3, th = (i / N) * TAU * 3 + ring * 0.7, r = 1.2 + ring * 0.3 + 0.1 * Math.cos(lobes * th + ring * Math.PI / lobes + t * 0.04);
        sand.pos.set([Math.cos(th) * r, 0.03 + 0.06 * Math.max(0, Math.sin(t * 5 + i * 1.7)), Math.sin(th) * r], i * 3);
        sand.alpha[i] = 0.45 + 0.55 * Math.max(0, Math.sin(t * 0.6 - ring * 0.9));
      }
      sand.commit();
    } };
  },
  hourglass(k, pal, P, R, fx) {
    // an hourglass in a cradle whose sand falls up; emptied, it turns itself over
    const PY = 1.25, hull = mixHex(METAL, SAND, 0.4), sandC = mixHex(SAND2, pal.second, 0.12);
    for (const s of [-1, 1]) {
      k.body.box(0.12, 1.45, 0.2, mat(s * 0.82, 0.6, 0), hull);
      k.body.box(0.5, 0.08, 0.35, mat(s * 0.82, 0.02, 0), hull);
      k.body.cyl(0.04, 0.04, 0.26, 8, mat(s * 0.69, PY, 0, 0, 0, Math.PI / 2), hull);
      k.lit.cyl(0.07, 0.07, 0.04, 10, mat(s * 0.9, PY, 0, 0, 0, Math.PI / 2), pal.light, PULSE);
    }
    drift(k.body, -1.0, 0.25, 0.45, 0.5, 0.3, 0.3, 71);
    const g = new Part(k.group, 0, PY, 0);
    for (const s of [-1, 1]) g.body.cyl(0.65, 0.65, 0.1, 16, mat(0, s * 0.9, 0), hull);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; g.body.cyl(0.035, 0.035, 1.7, 6, mat(Math.cos(a) * 0.56, 0, Math.sin(a) * 0.56), hull); }
    const prof = [];
    for (let j = 0; j <= 10; j++) { const s = j / 10; prof.push(new THREE.Vector2(0.05 + 0.4 * Math.pow(Math.sin((s * Math.PI) / 2), 0.6), 0.04 + 0.81 * s)); }
    const glassC = mixHex(0xdfeff4, pal.light, 0.2);
    g.glow.add(new THREE.LatheGeometry(prof, 18), null, glassC, 0.16);
    g.glow.add(new THREE.LatheGeometry(prof, 18), mat(0, 0, 0, Math.PI, 0, 0), glassC, 0.16);
    g.glow.cyl(0.05, 0.05, 0.08, 10, null, glassC, 0.16, true);
    g.lit.torus(0.07, 0.02, 4, 12, mat(0, 0, 0, Math.PI / 2, 0, 0), pal.light, 1);
    // the two heaps, each lying against the far end of its bulb, apex toward the neck
    const pileA = new Part(g.group, 0, -0.83, 0), pileB = new Part(g.group, 0, 0.83, 0);
    pileA.body.cone(0.4, 0.5, 14, mat(0, 0.25, 0), sandC);
    pileB.body.cone(0.4, 0.5, 14, mat(0, -0.25, 0, Math.PI, 0, 0), sandC);
    // the stream going up, in whichever bulb is uppermost
    const sA = new Part(g.group), sB = new Part(g.group), sc = mixHex(pal.light, SAND2, 0.4);
    sA.glow.box(0.025, 0.8, 0.025, mat(0, -0.44, 0), sc, 0.9);
    sB.glow.box(0.025, 0.8, 0.025, mat(0, 0.44, 0), sc, 0.9);
    k.parts.push(g, pileA, pileB, sA, sB);
    const N = 24, grains = motes(g.group, N, mixHex(pal.light, 0xffffff, 0.3), 0.04, fx, 0.9);
    const T = 100, TF = 88;
    return { light: [0, PY, 0], height: 2.4, span: 1.5, update(t) {
      const cyc = Math.floor(t / T), tau = t - cyc * T, even = cyc % 2 === 0, flowing = tau < TF;
      const ph = flowing ? tau / TF : 1, turn = flowing ? 0 : smooth((tau - TF) / (T - TF));
      const fA = even ? 1 - ph : ph;
      g.group.rotation.x = Math.PI * ((even ? 0 : 1) + turn);
      pileA.group.scale.setScalar(Math.max(0.03, Math.cbrt(fA)));
      pileB.group.scale.setScalar(Math.max(0.03, Math.cbrt(1 - fA)));
      sA.group.visible = flowing && !even;
      sB.group.visible = flowing && even;
      const sg = even ? 1 : -1;
      for (let i = 0; i < N; i++) {
        const u = (t * 0.8 + i / N) % 1;
        grains.pos.set([Math.sin(i * 2.1) * 0.02, sg * (0.05 + u * 0.75), Math.cos(i * 1.3) * 0.02], i * 3);
        grains.alpha[i] = flowing ? Math.sin(u * Math.PI) : 0;
      }
      grains.commit();
    } };
  },
  gnomon(k, pal, P, R, fx) {
    // a sundial of salt and black glass, keeping the hours of a sun that is not in the sky:
    // its shadow is a blade of light going round once a minute
    const b = k.body;
    b.cyl(1.6, 1.65, 0.14, 40, mat(0, 0.03, 0), mixHex(SALT, SAND, 0.35));
    b.torus(1.6, 0.06, 4, 40, mat(0, 0.1, 0, Math.PI / 2, 0, 0), mixHex(SALT, 0xffffff, 0.2));
    const stones = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; stones.push(a); b.add(rock(0.09, i + 80, 0.3), mat(Math.cos(a) * 1.4, 0.13, Math.sin(a) * 1.4, 0, 0, 0, 1, 0.7, 1), GLASS, 0, { flat: true }); }
    const tri = new THREE.Shape();
    tri.moveTo(0, 0); tri.lineTo(1.25, 0); tri.lineTo(0, 1.95); tri.closePath();
    b.add(new THREE.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false }), mat(0, 0.1, -0.04), GLASS);
    const L = Math.hypot(1.25, 1.95);
    k.lit.box(L, 0.02, 0.1, mat(0.625, 0.1 + 0.975, 0, 0, 0, -Math.atan2(1.95, 1.25)), pal.light, 1);
    k.lit.sphere(0.05, 6, 4, mat(0, 2.07, 0), pal.second, PULSE);
    drift(b, -1.2, -0.8, 0.75, 0.6, 0.3, 0.5, 81);
    const sh = new Part(k.group, 0, 0.115, 0), sc = mixHex(pal.light, 0xfff1c9, 0.3);
    sh.glow.tri([0, 0, 0], [1.5, 0, 0.12], [1.5, 0, -0.12], sc, 0.7);
    sh.glow.tri([0, 0.002, 0], [1.5, 0.002, 0.3], [1.5, 0.002, -0.3], sc, 0.25);
    k.parts.push(sh);
    const hours = motes(k.group, 12, mixHex(pal.light, 0xffffff, 0.3), 0.12, fx, 0.9);
    stones.forEach((a, i) => hours.pos.set([Math.cos(a) * 1.4, 0.28, Math.sin(a) * 1.4], i * 3));
    return { light: [0.4, 0.8, 0], height: 2.2, span: 2.2, update(t) {
      const th = -t * TAU / 60;
      sh.group.rotation.y = th;
      stones.forEach((a, i) => { hours.alpha[i] = 0.15 + 0.85 * Math.pow(Math.max(0, Math.cos(a + th)), 30); });
      hours.commit();
    } };
  },
};
