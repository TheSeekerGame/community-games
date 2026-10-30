import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { glowMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU, clamp, damp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { STONE, RIM, PULSE, beam } from './parts.js';
import { riverAt, WATER } from '../world/terrain.js';

// What stands on the rivers and in the canyons: wild artifacts found nowhere else, and
// worth more for it (RIVER_VALUE). Each is set on the river's middle, at the water,
// turned to it (its x across the river, its z along it), so a bridge spans it and a
// ferry follows it.
//   falls          water falling from a shelf of rock into the river, foam and mist at its
//                  foot, and in the mist a bow of light
//   naturalbridge  a bridge of stone across the river, high enough to fly under; threaded,
//                  its scan is worth more
//   waterwheel     a wheel of stone on the bank, turning in the current, its rim written
//   ferry          a long boat drifting down the river, lanterns at its bow and stern,
//                  nobody aboard
//   drowned        a colonnade standing in the river to its waist, some of it fallen

export const RIVER_VALUE = 2.5;
export const THREADED_VALUE = 1.5;

function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}
function finish(out, update) {
  return {
    ...out,
    mats: out.fx.map(([m]) => m),
    update(t, beat, c) {
      for (const [m, o] of out.fx) m.uniforms.uOpacity.value = o * (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      if (update) update(t, beat, c);
    },
  };
}
const rock = (r, detail, seed, amount = 0.3) => { const g = new THREE.IcosahedronGeometry(r, detail); roughen(g, r * amount, seed); return g; };
const WATERC = 0xbcd6de, FOAM = 0xeaf3f5;
function colored(g, color = 0xffffff, em = 1) {
  const n = g.attributes.position.count, c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(em), 1));
  return g;
}
// soft points of light, for foam and mist (n of them, rewritten by the caller)
function points(n, color, size, fx, opacity = 0.8) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n), al = new Float32Array(n);
  for (let i = 0; i < n; i++) { sz[i] = 0.6 + Math.random() * 0.8; al[i] = 0.5 + Math.random() * 0.5; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  fx.push([m, opacity]);
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  return { p, pos, g };
}

// ------------------------------------------------------------------ falls
function falls(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size;
  const H = P.height, W = P.width, z0 = -((ctx.river ? ctx.river.rw : P.bank) + 4);
  // the shelf it pours from: a block of rock standing on the bank, its lip over the water
  const cliff = rock(1, 2, 31, 0.16);
  cliff.scale(W * 0.85, H * 0.62, 10 * S);
  b.add(cliff, mat(0, H * 0.48, z0 - 6 * S), (x, y, z, i) => STONE[(i >> 3) % 4], 0, { flat: true });
  b.box(W * 1.05, 2.2 * S, 7 * S, mat(0, H, z0 + 1 * S), STONE[2]);
  for (let i = 0; i < 9; i++) { const x = (R() - 0.5) * W * 1.2; b.add(rock(1.8 * S, 0, i + 3), mat(x, 0.4, z0 + 4 * S + R() * 6 * S, R(), R() * TAU, 0, 1.3, 0.7, 1.1), STONE[i % 4], 0, { flat: true }); }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const fx = [];
  // the water: ribbons from the lip down, their light running downward
  const n = P.ribbons, M = 16, per = (M - 1) * 6;
  const pos = new Float32Array(n * per * 3), em = new Float32Array(n * per);
  const sheets = [];
  for (let q = 0; q < n; q++) {
    const x = ((q + 0.5) / n - 0.5) * W * 0.9, w = (W / n) * 0.55, out = (1.2 + R() * 1.2) * S;
    sheets.push({ x, w, out, ph: R() });
    let o = q * per * 3;
    for (let i = 0; i < M - 1; i++) {
      const y0 = H * (1 - i / (M - 1)), y1 = H * (1 - (i + 1) / (M - 1));
      // (it leaves the lip outward and falls in an arc)
      const z = (y) => z0 + 3.2 * S + out * Math.sqrt(1 - y / H) * 2.2;
      for (const [xx, yy] of [[x - w, y0], [x + w, y0], [x + w, y1], [x - w, y0], [x + w, y1], [x - w, y1]]) { pos[o++] = xx; pos[o++] = yy; pos[o++] = z(yy); }
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  wg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  wg.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const water = lightMesh(wg, fx, 0.8);
  water.material.uniforms.uTint.value.setHex(mixHex(WATERC, A, 0.25));
  group.add(water);
  // foam and mist at its foot
  const foam = points(140, FOAM, 1.6 * S, fx, 0.7);
  group.add(foam.p);
  const F = Array.from({ length: 140 }, () => ({ x: (R() - 0.5) * W, ph: R(), v: 0.5 + R(), r: R() }));
  // a bow of light in the mist
  const bow = new THREE.Group();
  [0xd96a6a, 0xd9b86a, 0x8fd18f, 0x6aaad9, 0x9a7ad9].forEach((c, i) => {
    const g = colored(new THREE.TorusGeometry(W * 0.75 + i * 0.9 * S, 0.35 * S, 3, 40, Math.PI), c, 1);
    bow.add(lightMesh(g, fx, 0.18));
  });
  bow.position.set(0, 0, z0 + 10 * S);
  group.add(bow);
  return finish({ group, fx, light: new THREE.Vector3(0, H * 0.4, z0 + 5 * S), focus: new THREE.Vector3(0, H * 0.45, z0 + 4 * S), span: Math.max(W, H * 0.6), clear: W * 0.8 + 8, height: H + 3 * S, solid: { r: W * 0.6, top: H + 2 * S, low: 0 } }, (t) => {
    // the light running down every ribbon, each its own speed
    for (let q = 0; q < n; q++) {
      const s = sheets[q];
      for (let i = 0; i < M - 1; i++) {
        const u = i / (M - 1), a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((u * 6 - t * 2.2) * TAU * 0.5 + s.ph * 9));
        for (let k = 0; k < 6; k++) em[(q * per) + i * 6 + k] = a * (0.4 + 0.6 * u);
      }
    }
    wg.attributes.emissive.needsUpdate = true;
    for (let i = 0; i < 140; i++) {
      const f = F[i], u = (f.ph + t * 0.35 * f.v) % 1;
      foam.pos[i * 3] = f.x + Math.sin(u * 7 + f.r * 9) * 2;
      foam.pos[i * 3 + 1] = 0.5 + Math.sin(u * Math.PI) * (3 + f.r * 5) * S;
      foam.pos[i * 3 + 2] = z0 + 4 * S + u * 14 * S;
    }
    foam.g.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ natural bridge
function naturalbridge(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size;
  const half = Math.max(P.half, ctx.river ? ctx.river.rw + 12 : 0), H = P.height, th = P.thick;
  // lumps of rock along an arch from one bank to the other
  const N = 26, top = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = (u * 2 - 1) * half, y0 = ctx.ground(x, 0);
    const y = y0 + (H - y0) * Math.pow(Math.sin(Math.PI * u), 0.7);
    const r = th * (1 + 0.6 * (1 - Math.sin(Math.PI * u))) * (0.85 + R() * 0.3);
    b.add(rock(r, 1, i + 5, 0.22), mat(x, y, (R() - 0.5) * th * 0.4, R(), R() * TAU, R(), 1.2, 0.85, 1.35), STONE[i % 4], 0, { flat: true });
    if (i % 3 === 1) top.push([x, y + r * 0.8]);
  }
  // moss strands hanging from its underside, and a lamp hung at its height
  const gb = new Builder();
  for (let i = 0; i < 9; i++) { const u = 0.2 + 0.6 * (i / 8), x = (u * 2 - 1) * half, y0 = ctx.ground(x, 0), y = y0 + (H - y0) * Math.pow(Math.sin(Math.PI * u), 0.7) - th; beam(gb, new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y - (3 + R() * 7) * S, 0), 0.12 * S, mixHex(A, 0xffffff, 0.4), 0.7); }
  b.box(0.3 * S, 4 * S, 0.3 * S, mat(0, H - th - 2 * S, 0), RIM);
  b.ico(1.1 * S, 1, mat(0, H - th - 4.6 * S, 0), A, PULSE);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const fx = [];
  group.add(lightMesh(gb.build(), fx, 0.8));
  return finish({
    group, fx, light: new THREE.Vector3(0, H - th - 4.6 * S, 0), focus: new THREE.Vector3(0, H * 0.6, 0), span: half * 1.05, clear: 0, height: H + th,
    solid: { r: half * 0.9, top: H + th, low: H - th * 1.6 },
    // flown under (through the arch's plane, under its crown): a pass
    onShip(p, q) {
      if ((p.z > 0) === (q.z > 0) || Math.abs(p.x) > half * 0.85 || p.y > H - th) return 0;
      return 1;
    },
  });
}

// ------------------------------------------------------------------ waterwheel
function waterwheel(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, Rw = P.radius;
  const x0 = -((ctx.river ? ctx.river.rw : P.bank) - Rw * 0.35), ax = Rw * 0.9;
  // its axle on two piers at the bank's edge
  for (const q of [-1, 1]) { b.box(3 * S, Rw + 3, 3 * S, mat(x0, (Rw + 3) / 2 - 2, q * (ax / 2 + 2 * S)), STONE[q > 0 ? 1 : 2]); }
  b.box(1.2 * S, 1.2 * S, ax + 6 * S, mat(x0, Rw * 0.9, 0), STONE[3]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the wheel: a ring, its spokes and paddles, its rim written with light
  const wheel = new THREE.Group();
  wheel.position.set(x0, Rw * 0.9, 0);
  const wb = new Builder();
  wb.add(new THREE.TorusGeometry(Rw, 0.7 * S, 5, 40), mat(0, 0, 0, 0, Math.PI / 2, 0), STONE[2]);
  wb.add(new THREE.TorusGeometry(Rw * 0.35, 0.6 * S, 5, 20), mat(0, 0, 0, 0, Math.PI / 2, 0), STONE[3]);
  for (let i = 0; i < P.paddles; i++) {
    const a = (i / P.paddles) * TAU, c = Math.cos(a), s = Math.sin(a);
    beam(wb, new THREE.Vector3(0, s * Rw * 0.35, c * Rw * 0.35), new THREE.Vector3(0, s * Rw, c * Rw), 0.6 * S, STONE[1]);
    wb.box(ax * 0.85, 0.35 * S, 2.6 * S, mat(0, s * Rw, c * Rw, -a, 0, 0), STONE[0]);
    wb.box(0.5 * S, 0.5 * S, 0.5 * S, mat(ax * 0.44, s * (Rw + 0.9 * S), c * (Rw + 0.9 * S)), i % 2 ? A : mixHex(A, 0xffffff, 0.4), PULSE);
  }
  wheel.add(new THREE.Mesh(wb.build(), mats.glow));
  group.add(wheel);
  const fx = [];
  const foam = points(80, FOAM, 1.3 * S, fx, 0.6);
  group.add(foam.p);
  const F = Array.from({ length: 80 }, () => ({ ph: R(), r: R(), v: 0.6 + R() }));
  return finish({ group, fx, light: new THREE.Vector3(x0 + ax * 0.5, Rw * 0.9, 0), focus: new THREE.Vector3(x0, Rw * 0.8, 0), span: Rw * 1.4, clear: Rw * 1.2 + 6, height: Rw * 2 + 2, solid: { r: Rw * 1.1, top: Rw * 2, low: 0 } }, (t) => {
    wheel.rotation.x = -t * P.speed;
    for (let i = 0; i < 80; i++) { const f = F[i], u = (f.ph + t * 0.5 * f.v) % 1; foam.pos[i * 3] = x0 + (f.r - 0.5) * ax; foam.pos[i * 3 + 1] = 0.4 + Math.sin(u * Math.PI) * 2 * S; foam.pos[i * 3 + 2] = (u - 0.3) * Rw * 1.6; }
    foam.g.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ ferry
function ferry(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), S = d.size, L = P.length;
  // the hull: long and low, its ends drawn up
  b.box(3.4 * S, 1.4 * S, L * 0.72, mat(0, 0.4, 0), 0x2c2622);
  for (const q of [-1, 1]) {
    b.cone(1.7 * S, L * 0.22, 4, mat(0, 0.9 * S, q * L * 0.45, q * Math.PI / 2 - q * 0.25, Math.PI / 4, 0, 1, 1, 0.55), 0x2c2622);
    b.box(0.25 * S, 7 * S, 0.25 * S, mat(0, 4.5 * S, q * L * 0.38), RIM);
    b.box(1.6 * S, 0.2 * S, 0.2 * S, mat(0, 7.8 * S, q * L * 0.38 + q * 0.6 * S), RIM);
  }
  // a canopy over its middle
  b.box(3.8 * S, 0.25 * S, L * 0.32, mat(0, 3.6 * S, 0), 0x3d3530);
  for (const [x, z] of [[-1.6, -1], [1.6, -1], [-1.6, 1], [1.6, 1]]) b.box(0.18 * S, 2.6 * S, 0.18 * S, mat(x * S, 2.3 * S, z * L * 0.15), RIM);
  const lb = new Builder();
  for (const q of [-1, 1]) {
    lb.box(0.1 * S, 1.2 * S, 0.1 * S, mat(0, 7.1 * S, q * L * 0.38 + q * 1.3 * S), RIM);
    lb.box(0.9 * S, 1.2 * S, 0.9 * S, mat(0, 6.2 * S, q * L * 0.38 + q * 1.3 * S), A, PULSE);
  }
  const boat = new THREE.Group();
  boat.add(new THREE.Mesh(b.build(), mats.body));
  boat.add(new THREE.Mesh(lb.build(), mats.glow));
  const group = new THREE.Group();
  group.add(boat);
  const fx = [];
  const wake = points(60, FOAM, 1.1 * S, fx, 0.55);
  group.add(wake.p);
  const W = Array.from({ length: 60 }, (_, i) => ({ u: i / 60, s: i % 2 ? 1 : -1 }));
  let dir = null;
  return finish({
    group, fx, light: new THREE.Vector3(0, 6.2 * S, L * 0.38), focus: new THREE.Vector3(0, 3 * S, 0), span: L * 0.55, clear: 0, height: 9 * S,
    // it drifts down the river, keeping to its middle
    drift(a, dt, game) {
      const Rv = riverAt(a.x, a.z);
      // (back toward the middle, a little at a time; along it, the way it was going)
      const s = Math.sign(Rv.v) || 1;
      a.x -= s * Rv.gx * Math.min(Rv.d, 3 * dt);
      a.z -= s * Rv.gz * Math.min(Rv.d, 3 * dt);
      let ax = -Rv.gz, az = Rv.gx;
      if (dir && ax * dir[0] + az * dir[1] < 0) { ax = -ax; az = -az; }
      dir = dir ? [damp(dir[0], ax, 1.5, dt), damp(dir[1], az, 1.5, dt)] : [ax, az];
      a.x += dir[0] * P.speed * dt;
      a.z += dir[1] * P.speed * dt;
      a.y = Math.max(game.world.groundAt(a.x, a.z), WATER);
      a.model.group.rotation.y = Math.atan2(dir[0], dir[1]);
    },
  }, (t) => {
    boat.position.y = Math.sin(t * 0.9) * 0.15 * S;
    boat.rotation.z = Math.sin(t * 0.7) * 0.03;
    for (let i = 0; i < 60; i++) { const w = W[i], u = (w.u + t * 0.08) % 1; wake.pos[i * 3] = w.s * (1.8 + u * 7) * S; wake.pos[i * 3 + 1] = 0.3; wake.pos[i * 3 + 2] = -L * 0.45 - u * L * 1.2; }
    wake.g.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ drowned colonnade
function drowned(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, H = P.height;
  const rows = 2, per = P.n, gap = P.gap, w = Math.min(P.width, ctx.river ? ctx.river.rw * 1.3 : P.width);
  for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
    const x = (r ? 1 : -1) * w / 2, z = (i - (per - 1) / 2) * gap, y0 = Math.min(0, ctx.ground(x, z)) - 4;
    const broken = R() < P.fallen;
    const h = broken ? H * (0.25 + R() * 0.35) : H;
    b.cyl(1.5 * S, 1.7 * S, h - y0, 10, mat(x, (h + y0) / 2, z), STONE[(i + r) % 4]);
    if (!broken) {
      b.box(4 * S, 1.2 * S, 4 * S, mat(x, h + 0.6 * S, z), STONE[3]);
      b.box(1 * S, 0.5 * S, 1 * S, mat(x, h + 1.45 * S, z), A, PULSE);
      if (i < per - 1 && R() < 0.6) b.box(1.8 * S, 1.4 * S, gap + 3 * S, mat(x, h + 1.9 * S, z + gap / 2), STONE[2]);
    } else {
      // what fell lies in the water beside it
      b.cyl(1.5 * S, 1.5 * S, H - h, 10, mat(x + (r ? 1 : -1) * (H - h) * 0.4, 0.4, z + (R() - 0.5) * 3, 0, R() * TAU, Math.PI / 2 - 0.15), STONE[(i + r + 1) % 4]);
    }
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // its light under the water, and rings about every foot
  const fx = [];
  const gb = new Builder();
  gb.add(new THREE.CircleGeometry(w * 0.8, 24), mat(0, -0.6, 0, -Math.PI / 2, 0, 0), A, 0.35);
  for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) gb.add(new THREE.RingGeometry(2.1 * S, 2.6 * S, 18), mat((r ? 1 : -1) * w / 2, 0.2, (i - (per - 1) / 2) * gap, -Math.PI / 2, 0, 0), FOAM, 0.6);
  group.add(lightMesh(gb.build(), fx, 0.8));
  const len = per * gap;
  return finish({ group, fx, light: new THREE.Vector3(0, H * 0.6, 0), focus: new THREE.Vector3(0, H * 0.45, 0), span: Math.max(len * 0.55, w), clear: 0, height: H + 3 * S, solid: { r: Math.max(len, w) * 0.55, top: H + 3 * S, low: 0 } });
}

export const RIVER = { falls, naturalbridge, waterwheel, ferry, drowned };
