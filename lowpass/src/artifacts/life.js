import * as THREE from 'three';
import { Builder, mat } from '../render/build.js';
import { worldMaterial, glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { TAU, clamp, damp, angleDelta } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { stratum, roman } from './strata.js';
import { WATER, canopyTop } from '../world/terrain.js';

// Life in the forest: the planet's own animals, met far more often than any artifact and
// scanned the same way, for less. Each kind keeps to its own places:
//   flock  birds turning over the canopy, anywhere; come near and they lift and stream
//          away, slower than the ship, and must be followed to be held in the sights
//   deer   a herd at a lake's shore or in a glade, grazing; come near and they bolt for
//          the trees
//   owl    at night, on a dead spruce standing over the forest, its eyes lit, its head
//          turning to keep the ship in sight
//   fish   over a lake, a shoal leaping, one and then another, rings where they fall back
// From deeper strata (once the scanner reaches them), now and then, their stranger kin:
// birds of glass, stags whose antlers burn, owls with lantern eyes, fish of light, all in
// that stratum's colors. None of them is ever on the leaderboard as more than a wild scan.

export const LIFE = {
  flock: { code: 'FLK', cls: 'Flock', nouns: ['Flock', 'Murmuration', 'Wheel', 'Gathering', 'Drift'], deep: 'birds of glass' },
  deer: { code: 'DER', cls: 'Herd', nouns: ['Herd', 'Grazers', 'Stags', 'Deer'], deep: 'stags with antlers of light' },
  owl: { code: 'OWL', cls: 'Owl', nouns: ['Owl', 'Watcher', 'Night Bird', 'Sentry'], deep: 'an owl with lantern eyes' },
  fish: { code: 'FSH', cls: 'Shoal', nouns: ['Shoal', 'Leapers', 'Silver', 'School'], deep: 'fish of light' },
};
export const LIFE_IDS = Object.keys(LIFE);
export const LIFE_VALUE = 0.5;       // of what a wild scan from its depth is worth

const ADJ = ['Restless', 'Shy', 'Quiet', 'Wary', 'Grey', 'Silver', 'Evening', 'Morning', 'Startled', 'Patient', 'Wandering', 'Watchful'];
const OF = ['of the Fog', 'of the Treetops', 'of the Far Shore', 'of Low Cloud', 'of the Gold Hour', 'of Cold Water'];
const SURFACE = { light: 0xcfe8f0, second: 0xe8c36a, dark: 0x1d2229 };

// d: the descriptor generate.js began; R1, R3: its own randoms
export function describeLife(d, move, R1, R3) {
  const sp = LIFE[move.life] ? move.life : 'flock', S = LIFE[sp], depth = d.depth, st = depth ? stratum(depth) : null;
  const P = { n: sp === 'flock' ? R1.int(24, 44) : sp === 'deer' ? R1.int(4, 8) : sp === 'fish' ? R1.int(5, 9) : 1, seed: R1() };
  d.family = 'life';
  d.species = sp;
  d.params = P;
  d.size = (1 + 0.15 * Math.log2(1 + depth)) * R1.range(0.92, 1.1);
  d.accent = st ? st.light : sp === 'owl' ? 0xffc35a : 0xcfe8f0;
  d.strength = st ? 0.9 : 0.35;
  d.grand = false;
  const noun = R3.pick(S.nouns), r = R3();
  d.name = st ? `The ${st.name} ${noun}` : r < 0.55 ? `The ${R3.pick(ADJ)} ${noun}` : `${R3.pick(ADJ)} ${noun} ${R3.pick(OF)}`;
  d.code = `${depth ? `D${depth}-` : ''}${S.code}-${(move.seed || move.tx).slice(2, 6).toUpperCase()}`;
  d.cls = S.cls;
  d.structure = st ? `Out of Depth ${roman(depth)}: ${S.deep}, in the colors of ${st.title}.` : {
    flock: `${P.n} birds turning over the canopy; come near, and they lift and stream away.`,
    deer: `${P.n} deer at the edge of the trees, grazing; one of them carries antlers.`,
    owl: 'An owl on a dead spruce, over the forest; it turns its head to keep the ship in sight.',
    fish: `A shoal under the lake's skin, leaping one at a time; ${P.n} of them.`,
  }[sp];
  d.hint = { flock: 'Held in the sights while it streams away.', deer: 'Scanned from far enough off, before they bolt.', owl: 'Only at night.', fish: 'Only over the lakes.' }[sp];
  d.origin = st ? `From Depth ${roman(depth)}: life from below, found by this ship alone.` : 'Life of the fog belt, met by this ship alone.';
}

// ------------------------------------------------------------------ the bodies

function flock(d, pal, own) {
  const P = d.params, n = P.n, glow = d.depth > 0, S = 1.5 * d.size;
  const b = new Builder();
  const c = glow ? mixHex(pal.light, 0xffffff, 0.35) : 0x22252c, e = glow ? 1.8 : 0;
  b.cone(0.17, 1.0, 4, mat(0, 0, 0.1, Math.PI / 2, 0, 0), c, e);
  b.tri([0, 0, 0.3], [0, 0, -0.25], [-1.15, 0.35, -0.2], c, e);
  b.tri([0, 0, -0.25], [0, 0, 0.3], [1.15, 0.35, -0.2], c, e);
  const m = own(worldMaterial({ unique: true, side: THREE.DoubleSide }));
  const mesh = new THREE.InstancedMesh(b.build(), m, n);
  mesh.frustumCulled = false;
  const g = new THREE.Group();
  g.add(mesh);
  const R = mulberry(P.seed);
  const bird = Array.from({ length: n }, (_, i) => ({ ph: R() * TAU, r: 7 + R() * 16, h: 6 + R() * 14, w: (0.35 + R() * 0.3) * (R() < 0.5 ? 1 : -1), flap: 8 + R() * 4, p: new THREE.Vector3(), q: new THREE.Vector3(), i }));
  const st = { flee: 0, dir: [0, 1], t: 0 };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
  return {
    group: g, light: new THREE.Vector3(0, 14, 0), focus: new THREE.Vector3(0, 14, 0), span: 28, height: 26, state: st, mats: [m],
    update(t) {
      const k = st.flee;
      for (const B of bird) {
        const th = B.ph + t * B.w * (1 + k * 0.8), rr = B.r * (1 + 0.25 * Math.sin(t * 0.3 + B.ph)) * (1 - 0.35 * k);
        B.q.copy(B.p);
        B.p.set(Math.cos(th) * rr + Math.sin(t * 0.37 + B.i * 0.3) * 4, B.h + 3 * Math.sin(t * 0.7 + B.ph * 2) + k * 6, Math.sin(th) * rr + Math.cos(t * 0.41 + B.i * 0.25) * 4);
        // startled: a ribbon streaming after the lead, along the way it flees
        const tail = (B.i / n) * 30 * k;
        B.p.x -= st.dir[0] * tail; B.p.z -= st.dir[1] * tail;
        const vx = B.p.x - B.q.x, vz = B.p.z - B.q.z, vy = B.p.y - B.q.y;
        _e.set(-Math.atan2(vy, Math.hypot(vx, vz) + 1e-4) * 0.6, Math.atan2(vx, vz), clamp(B.w * -0.6, -0.5, 0.5), 'YXZ');
        _q.setFromEuler(_e);
        const f = Math.sin(t * B.flap * (1 + k * 0.5) + B.ph);
        _s.set(S, S * (0.25 + 0.95 * f), S);
        _m.compose(B.p, _q, _s);
        mesh.setMatrixAt(B.i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    // the flock as a whole: drifting, or fleeing the ship (slower than it) for a while
    drift(a, dt, game) {
      const ship = game.ship, dx = a.x - ship.x, dz = a.z - ship.z, dist = Math.hypot(dx, dz) || 1;
      if (dist < 170 && st.flee < 0.5) { st.flee = 1; st.dir = [dx / dist, dz / dist]; st.t = 22; }
      st.t -= dt;
      if (st.t <= 0) st.flee = damp(st.flee, 0, 0.4, dt);
      else { const want = [dx / dist, dz / dist]; st.dir = [damp(st.dir[0], want[0], 0.5, dt), damp(st.dir[1], want[1], 0.5, dt)]; }
      const v = 2 + 15 * st.flee;
      a.x += st.dir[0] * v * dt;
      a.z += st.dir[1] * v * dt;
      a.y = damp(a.y, canopyTop(a.x, a.z) + 4, 1, dt);
    },
  };
}

function deer(d, pal, own) {
  const P = d.params, n = P.n, glow = d.depth > 0, S = 1.35 * d.size;
  const body = glow ? mixHex(pal.dark, 0xd6dde6, 0.65) : 0x5c4a3b, belly = glow ? 0xe9eef3 : 0x8a7562, leg = glow ? mixHex(pal.dark, 0xb0bac6, 0.5) : 0x3a2f27;
  const horn = glow ? pal.light : 0xd8cfc0, he = glow ? 1.9 : 0;
  const bb = new Builder();
  bb.box(0.55, 0.62, 1.55, mat(0, 1.25, 0), body);
  bb.box(0.5, 0.18, 1.3, mat(0, 0.98, 0), belly);
  bb.box(0.36, 0.3, 0.3, mat(0, 1.3, -0.82), belly);
  for (const [x, z] of [[-0.19, 0.6], [0.19, 0.6], [-0.19, -0.6], [0.19, -0.6]]) bb.box(0.12, 1.0, 0.13, mat(x, 0.5, z), leg);
  const hb = new Builder();
  hb.box(0.24, 0.75, 0.26, mat(0, 0.3, 0.12, -0.45, 0, 0), body);
  hb.box(0.24, 0.26, 0.52, mat(0, 0.66, 0.36), body);
  hb.box(0.2, 0.2, 0.2, mat(0, 0.6, 0.66), leg);
  for (const s of [-1, 1]) hb.box(0.06, 0.2, 0.12, mat(s * 0.15, 0.85, 0.24, 0, 0, s * 0.5), body);
  const ab = new Builder();
  for (const s of [-1, 1]) {
    ab.box(0.05, 0.6, 0.05, mat(s * 0.16, 1.05, 0.25, -0.2, 0, s * 0.35), horn, he);
    ab.box(0.05, 0.4, 0.05, mat(s * 0.3, 1.32, 0.16, 0.4, 0, s * 0.6), horn, he);
    ab.box(0.05, 0.35, 0.05, mat(s * 0.26, 1.35, 0.38, -0.6, 0, s * 0.2), horn, he);
  }
  const m = own(worldMaterial({ unique: true }));
  const bodyG = bb.build(), headG = hb.build(), hornG = ab.build();
  const g = new THREE.Group(), R = mulberry(P.seed);
  const herd = [];
  for (let i = 0; i < n; i++) {
    const dg = new THREE.Group();
    dg.add(new THREE.Mesh(bodyG, m));
    const head = new THREE.Group();
    head.position.set(0, 1.4, 0.72);
    head.add(new THREE.Mesh(headG, m));
    if (i === 0 || (glow && i % 2 === 0)) head.add(new THREE.Mesh(hornG, m));
    dg.add(head);
    dg.scale.setScalar(S * (i === 0 ? 1.15 : 0.9 + R() * 0.15));
    const a = R() * TAU, r = 2 + R() * 9;
    herd.push({ g: dg, head, x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: R() * TAU, graze: R() * 5, ph: R() * TAU, h: 0 });
    g.add(dg);
  }
  const st = { flee: 0, dir: [0, 1], t: 0 };
  const tick = clock();
  return {
    group: g, light: new THREE.Vector3(0, 3, 0), focus: new THREE.Vector3(0, 1.8, 0), span: 14, height: 4, clear: 18, state: st, mats: [m],
    update(t) {
      const dt = tick(t);
      for (const H of herd) {
        // grazing, the head down and up again; fleeing, bounding, the head high
        const down = st.flee > 0.2 ? 0 : (Math.sin(t * 0.4 + H.ph) > 0.1 ? 1 : 0);
        H.head.rotation.x = damp(H.head.rotation.x, down * 0.95, 3, dt);
        const run = st.flee, bound = Math.abs(Math.sin(t * 5.5 + H.ph)) * 0.9 * run;
        const yaw = run > 0.2 ? Math.atan2(st.dir[0], st.dir[1]) + Math.sin(H.ph) * 0.2 : H.yaw + Math.sin(t * 0.05 + H.ph) * 0.5;
        H.g.position.set(H.x, H.h + bound, H.z);
        H.g.rotation.set(Math.cos(t * 5.5 + H.ph) * 0.18 * run, yaw, 0, 'YXZ');
      }
    },
    drift(a, dt, gm) {
      const ship = gm.ship, dx = a.x - ship.x, dz = a.z - ship.z, dist = Math.hypot(dx, dz) || 1;
      if (dist < 150 && st.flee < 0.5) { st.flee = 1; st.dir = [dx / dist, dz / dist]; st.t = 9; }
      st.t -= dt;
      if (st.t <= 0) st.flee = damp(st.flee, 0, 0.6, dt);
      const v = 12 * st.flee;
      a.x += st.dir[0] * v * dt;
      a.z += st.dir[1] * v * dt;
      const w = gm.world;
      a.y = Math.max(w.groundAt(a.x, a.z), WATER);
      for (const H of herd) H.h = Math.max(w.groundAt(a.x + H.x, a.z + H.z), WATER) - a.y;
    },
  };
}

function owl(d, pal, own) {
  const glow = d.depth > 0, S = 1.7 * d.size, H = 24 + d.params.seed * 6;
  const eye = glow ? pal.light : 0xffc35a;
  const b = new Builder();
  // a dead spruce: grey, its branches broken short
  b.cyl(0.18, 0.55, H, 7, mat(0, H / 2, 0), 0x4b4844);
  const R = mulberry(d.params.seed + 3);
  for (let i = 0; i < 9; i++) {
    const y = H * (0.25 + 0.7 * R()), a = R() * TAU, l = 1 + R() * 2.4;
    b.box(0.12, 0.12, l, mat(Math.sin(a) * l * 0.5, y, Math.cos(a) * l * 0.5, -0.25, a, 0), 0x55514c);
  }
  const ob = new Builder();
  const plum = glow ? mixHex(pal.dark, 0xc9d2dc, 0.6) : 0x6f6556, face = glow ? 0xe9eef3 : 0x9a8e7a;
  ob.ico(0.5, 1, mat(0, 0.55, 0, 0, 0, 0, 1, 1.35, 0.9), plum);
  for (const s of [-1, 1]) ob.ico(0.3, 0, mat(s * 0.42, 0.5, -0.05, 0, 0, s * 0.2, 0.5, 1.4, 1), mixHex(plum, 0x000000, 0.25));
  const hb = new Builder();
  hb.ico(0.38, 1, mat(0, 0, 0, 0, 0, 0, 1.15, 0.95, 1), plum);
  hb.box(0.42, 0.3, 0.06, mat(0, 0, 0.33), face);
  for (const s of [-1, 1]) {
    hb.ico(0.075, 0, mat(s * 0.12, 0.03, 0.37), eye, 2.4);
    hb.cone(0.07, 0.24, 4, mat(s * 0.22, 0.33, 0, 0, 0, -s * 0.3), plum);
  }
  hb.cone(0.04, 0.12, 4, mat(0, -0.08, 0.38, Math.PI / 2 + 0.6, 0, 0), 0x3a332b);
  const m = own(worldMaterial({ unique: true }));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(b.build(), m));
  const bird = new THREE.Group();
  bird.position.y = H + 0.15;
  bird.scale.setScalar(S);
  bird.add(new THREE.Mesh(ob.build(), m));
  const head = new THREE.Group();
  head.position.y = 1.2;
  head.add(new THREE.Mesh(hb.build(), m));
  bird.add(head);
  g.add(bird);
  const tick = clock();
  return {
    group: g, light: new THREE.Vector3(0, H + 2.2 * S, 0.3), focus: new THREE.Vector3(0, H + 1.4 * S, 0), span: 7, height: H + 3, clear: 7, mats: [m],
    update(t, beat, c) {
      const dt = tick(t);
      // the head turns to keep the ship in sight (as far as an owl's neck goes), and
      // tips now and then
      const want = c.shipLocal ? clamp(angleDelta(0, Math.atan2(c.shipLocal.x, c.shipLocal.z)), -2.6, 2.6) : 0;
      head.rotation.y = damp(head.rotation.y, want, 2.2, dt);
      head.rotation.z = Math.sin(t * 0.6) > 0.92 ? 0.35 : damp(head.rotation.z, 0, 4, dt);
    },
  };
}

function fish(d, pal, own) {
  const P = d.params, n = P.n, glow = d.depth > 0, S = 2.2 * d.size;
  const b = new Builder();
  const c = glow ? mixHex(pal.light, 0xffffff, 0.3) : 0xb8c4cc, e = glow ? 2 : 0.5;
  b.ico(0.5, 0, mat(0, 0, 0, 0, 0, 0, 0.45, 0.7, 1.7), c, e);
  b.tri([0, 0, -0.75], [0, 0.45, -1.3], [0, -0.45, -1.3], c, e);
  b.tri([0, 0.2, 0.1], [0, 0.55, -0.2], [0, 0.25, -0.5], mixHex(c, 0x000000, 0.3), e);
  const m = own(worldMaterial({ unique: true, side: THREE.DoubleSide }));
  const geo = b.build();
  const g = new THREE.Group(), R = mulberry(P.seed);
  const ringMat = own(glowMaterial({ opacity: 0.7, fog: 0.6, side: THREE.DoubleSide }));
  ringMat.uniforms.uTint.value.setHex(glow ? pal.light : 0xdfeef5);
  const ringGeo = new THREE.RingGeometry(0.85, 1, 32, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const nv = ringGeo.attributes.position.count;
  ringGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3).fill(1), 3));
  ringGeo.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(nv).fill(1), 1));
  const school = [];
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(geo, m);
    f.scale.setScalar(S * (0.8 + R() * 0.4));
    f.visible = false;
    g.add(f);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.layers.set(LAYER_FX);
    ring.visible = false;
    g.add(ring);
    school.push({ f, ring, wait: R() * 4, s: -1, x: 0, z: 0, a: 0, len: 0, h: 0, rt: 9 });
  }
  const tick = clock();
  return {
    group: g, light: new THREE.Vector3(0, 2, 0), focus: new THREE.Vector3(0, 1.5, 0), span: 22, height: 5, mats: [m, ringMat],
    update(t, beat, c) {
      const dt = tick(t);
      for (const F of school) {
        if (F.s < 0) {
          F.wait -= dt;
          if (F.wait <= 0) {
            // a leap: from somewhere in the shoal, a short arc
            const a = R() * TAU, r = R() * 16;
            F.x = Math.cos(a) * r; F.z = Math.sin(a) * r; F.a = R() * TAU; F.len = 4 + R() * 5; F.h = 2 + R() * 2.5; F.s = 0;
            F.rt = 0;
            F.ring.position.set(F.x, 0.15, F.z);
          }
        } else {
          F.s += dt / 1.15;
          if (F.s >= 1) {
            F.s = -1; F.wait = 0.6 + R() * 2.4; F.f.visible = false;
            F.rt = 0;
            F.ring.position.set(F.x + Math.sin(F.a) * F.len, 0.15, F.z + Math.cos(F.a) * F.len);
          } else {
            F.f.visible = true;
            F.f.position.set(F.x + Math.sin(F.a) * F.len * F.s, Math.sin(Math.PI * F.s) * F.h - 0.3, F.z + Math.cos(F.a) * F.len * F.s);
            F.f.rotation.set(-Math.cos(Math.PI * F.s) * 0.9, F.a, Math.sin(t * 9 + F.x) * 0.2, 'YXZ');
          }
        }
        // the ring where it broke the water, going out and gone
        F.rt += dt;
        F.ring.visible = F.rt < 1.6;
        if (F.ring.visible) F.ring.scale.setScalar(0.6 + F.rt * 3.2);
      }
      ringMat.uniforms.uOpacity.value = 0.55 * (c.reveal ?? 1);
    },
  };
}

const BODY = { flock, deer, owl, fish };

export function buildLife(d, A, mats, ctx) {
  const st = d.depth ? stratum(d.depth) : SURFACE;
  const pal = { light: st.light, second: st.second, dark: st.dark };
  const own = (m) => m;
  const out = BODY[d.species](d, pal, own, ctx);
  out.life = true;
  return out;
}

// seconds since the last frame, from the (world's) time a model is given
function clock() {
  let last = null;
  return (t) => { const dt = last === null ? 0 : clamp(t - last, 0, 0.1); last = t; return dt; };
}

// a small seeded random of its own (the shoal's leaps, the herd's places)
function mulberry(seed) {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
