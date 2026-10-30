import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { STONE, PULSE, beam } from './parts.js';

// What stands in the turned stands: wild artifacts found only among the gold birches
// (generate.js draws from these when one rises in a stand), built like the forest's (dark
// stone, pale rims, the artifact's one light on its pulse), in the season's colors.
//   leafstorm    a column of leaves held turning in the air, a ring of stones at its foot
//   lanternbirch a pale birch, bare, hung with lanterns that sway
//   amber        a great drop of amber on a knot of roots, something dark held in it
//   birches      a ring of white trunks leaning in, leaves falling only inside it
//   hearth       a cold fire: a ring of stones, a pale gold flame, embers going up
//   goldleaf     one leaf of gold as tall as the trees, standing on its stem, its veins lit

const BARK = 0xe4dfd3, MARK = 0x2a2622, LEAF = [0xf2c14e, 0xe0952f, 0xc4612a, 0xf5dc8a, 0xa8452a];

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
    mats: [...out.fx.map(([m]) => m), ...(out.own || [])],
    update(t, beat, c) {
      for (const [m, o] of out.fx) m.uniforms.uOpacity.value = o * (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      if (update) update(t, beat, c);
    },
  };
}
const stone = (r, seed) => { const g = new THREE.IcosahedronGeometry(r, 0); roughen(g, r * 0.3, seed); return g; };

// a birch trunk from (x, y0, z), h tall, leaning (lx, lz): white, its dark marks across it
function trunk(b, x, y0, z, h, r, lx, lz, R) {
  const top = new THREE.Vector3(x + lx * h, y0 + h, z + lz * h);
  beam(b, new THREE.Vector3(x, y0 - 1, z), top, r * 2, BARK);
  for (let i = 0; i < Math.floor(h / 2.2); i++) {
    const f = (i + 0.5 + R() * 0.3) / Math.floor(h / 2.2), y = y0 + f * h;
    b.box(r * 2.15, 0.22 + R() * 0.3, r * (0.6 + R() * 1.2), mat(x + lx * f * h, y, z + lz * f * h, 0, R() * TAU, 0), MARK);
  }
  return top;
}

// leaves: an instanced flat leaf, each its own color of the season
function leafMesh(n, size, own) {
  const b = new Builder();
  b.tri([0, 0, -0.5], [0.32, 0, 0], [0, 0, 0.55], 0xffffff);
  b.tri([0, 0, -0.5], [0, 0, 0.55], [-0.32, 0, 0], 0xffffff);
  const m = own(worldMaterial({ unique: true, side: THREE.DoubleSide }));
  const mesh = new THREE.InstancedMesh(b.build(), m, n);
  mesh.frustumCulled = false;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c.setHex(LEAF[i % LEAF.length]));
  mesh.userData.size = size;
  return mesh;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function setLeaf(mesh, i, x, y, z, rx, ry, rz, s) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
  mesh.setMatrixAt(i, _m);
}

// ------------------------------------------------------------------ leaf storm
function leafstorm(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, H = P.height, own = [];
  for (let i = 0; i < P.stones; i++) {
    const a = (i / P.stones) * TAU, r = P.radius * 1.25, x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.add(stone(1.6 * S, i + 3), mat(x, ctx.ground(x, z) + 0.6 * S, z, 0, a, 0, 1, 1.8, 0.8), STONE[i % 4], 0, { flat: true });
    b.box(0.5 * S, 0.5 * S, 0.5 * S, mat(x * 0.92, ctx.ground(x, z) + 2.4 * S, z * 0.92, 0, a, 0), A, PULSE);
  }
  const leaves = leafMesh(P.n, 1.1 * S, (m) => { own.push(m); return m; });
  const L = Array.from({ length: P.n }, (_, i) => ({ u: (i + R()) / P.n, ph: R() * TAU, r: R(), sp: 0.7 + R() * 0.6 }));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(leaves);
  const gb = new Builder();
  gb.ico(1.4 * S, 1, mat(0, H * 0.45, 0), mixHex(A, 0xffffff, 0.4), 1);
  const fx = [];
  group.add(lightMesh(gb.build(), fx, 0.9));
  return finish({ group, fx, own, light: new THREE.Vector3(0, H * 0.45, 0), focus: new THREE.Vector3(0, H * 0.45, 0), span: P.radius * 1.4 + 4, clear: P.radius * 1.4 + 9, height: H }, (t) => {
    for (let i = 0; i < P.n; i++) {
      const l = L[i], u = (l.u + t * 0.012 * l.sp) % 1, y = u * H, a = u * P.turns * TAU + t * 0.5 * (1.4 - u) * l.sp + l.ph;
      const r = P.radius * (0.25 + 0.85 * u) * (0.8 + 0.4 * l.r) + Math.sin(t * 2 + l.ph) * 0.8;
      setLeaf(leaves, i, Math.cos(a) * r, y + Math.sin(t * 1.7 + l.ph) * 0.6, Math.sin(a) * r, t * 1.3 * l.sp + l.ph, -a, Math.sin(t * 2.1 + l.ph), leaves.userData.size * (0.8 + 0.5 * l.r));
    }
    leaves.instanceMatrix.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ lantern birch
function lanterns(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, H = P.height;
  const tops = [];
  const top = trunk(b, 0, ctx.ground(0, 0), 0, H * 0.55, 0.7 * S, 0.02, 0.01, R);
  // bare branches, forking three times, each tip a place to hang a light
  const grow = (from, dir, len, r, k) => {
    const to = from.clone().addScaledVector(dir, len);
    beam(b, from, to, r * 2, BARK);
    if (k === 0) { tops.push(to); return; }
    for (let j = 0; j < 2 + (k > 1 ? 1 : 0); j++) {
      const nd = dir.clone().add(new THREE.Vector3((R() - 0.5) * 1.3, 0.3 + R() * 0.4, (R() - 0.5) * 1.3)).normalize();
      grow(to, nd, len * (0.62 + R() * 0.15), r * 0.62, k - 1);
    }
  };
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + R(); grow(top.clone().add(new THREE.Vector3(0, -H * 0.08 * i, 0)), new THREE.Vector3(Math.cos(a) * 0.8, 0.9, Math.sin(a) * 0.8).normalize(), H * 0.22, 0.42 * S, 3); }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the lanterns: a cord, a small frame, a light; each on its own pendulum
  const hang = [];
  for (let i = 0; i < Math.min(P.n, tops.length); i++) {
    const at = tops[Math.floor((i * tops.length) / Math.min(P.n, tops.length))], cord = (1.5 + R() * 2.5) * S;
    const g = new THREE.Group();
    g.position.copy(at);
    const lb = new Builder();
    lb.box(0.06 * S, cord, 0.06 * S, mat(0, -cord / 2, 0), MARK);
    lb.box(0.9 * S, 0.12 * S, 0.9 * S, mat(0, -cord, 0), MARK);
    lb.box(0.9 * S, 0.12 * S, 0.9 * S, mat(0, -cord - 1.3 * S, 0), MARK);
    lb.box(0.7 * S, 1.2 * S, 0.7 * S, mat(0, -cord - 0.65 * S, 0), [A, LEAF[3], LEAF[0]][i % 3], PULSE);
    g.add(new THREE.Mesh(lb.build(), mats.glow));
    group.add(g);
    hang.push({ g, ph: R() * TAU, k: 0.6 + R() * 0.6 });
  }
  return finish({ group, fx: [], light: new THREE.Vector3(0, H * 0.7, 0), focus: new THREE.Vector3(0, H * 0.55, 0), span: H * 0.5, clear: H * 0.45 + 6, height: H }, (t) => {
    for (const h of hang) { h.g.rotation.x = Math.sin(t * 0.9 * h.k + h.ph) * 0.12; h.g.rotation.z = Math.cos(t * 0.7 * h.k + h.ph) * 0.12; }
  });
}

// ------------------------------------------------------------------ amber
function amber(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, Rd = P.radius;
  // the knot of roots it sits in
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + R() * 0.3;
    beam(b, new THREE.Vector3(Math.cos(a) * Rd * 1.3, ctx.ground(Math.cos(a) * Rd * 1.3, Math.sin(a) * Rd * 1.3) - 0.5, Math.sin(a) * Rd * 1.3), new THREE.Vector3(Math.cos(a) * Rd * 0.3, Rd * 0.55, Math.sin(a) * Rd * 0.3), 1.4 * S, STONE[i % 4]);
  }
  const cy = Rd * 1.25;
  // what it holds, dark against its light
  if (P.holds === 'tree') {
    b.cyl(0.25 * S, 0.35 * S, Rd * 0.5, 5, mat(0, cy - Rd * 0.35, 0), MARK);
    for (let i = 0; i < 4; i++) b.cone(Rd * (0.42 - i * 0.08), Rd * 0.35, 7, mat(0, cy - Rd * 0.15 + i * Rd * 0.18, 0), 0x1d2a24);
  } else if (P.holds === 'moth') {
    b.cone(0.3 * S, Rd * 0.5, 5, mat(0, cy, 0, Math.PI / 2, 0, 0), MARK);
    for (const s of [-1, 1]) { b.tri([0, cy, 0.2 * Rd], [s * Rd * 0.6, cy + Rd * 0.3, 0], [s * Rd * 0.45, cy - Rd * 0.15, -0.2 * Rd], 0x2c2420); b.tri([0, cy, -0.1 * Rd], [s * Rd * 0.45, cy - Rd * 0.15, -0.2 * Rd], [s * Rd * 0.3, cy - Rd * 0.4, -0.25 * Rd], 0x2c2420); }
  } else {
    // a key, older than the Codex
    b.box(0.3 * S, Rd * 0.9, 0.3 * S, mat(0, cy, 0), MARK);
    b.add(new THREE.TorusGeometry(Rd * 0.2, 0.13 * S, 4, 12), mat(0, cy + Rd * 0.55, 0), MARK);
    b.box(Rd * 0.25, 0.25 * S, 0.3 * S, mat(Rd * 0.12, cy - Rd * 0.38, 0), MARK);
    b.box(Rd * 0.18, 0.25 * S, 0.3 * S, mat(Rd * 0.09, cy - Rd * 0.22, 0), MARK);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the drop itself: warm light, clearest at its edges
  const fx = [];
  const g = new THREE.IcosahedronGeometry(Rd, 3);
  g.scale(1, 1.22, 1);
  const p = g.attributes.position, n = p.count;
  for (let i = 0; i < n; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) * (1 + p.getY(i) / (Rd * 2.2)));
  const col = new Float32Array(n * 3), em = new Float32Array(n), c = new THREE.Color();
  for (let i = 0; i < n; i++) { c.setHex(mixHex(0xe09a2c, 0xffd27a, (p.getY(i) / Rd + 1) / 2)); col.set([c.r, c.g, c.b], i * 3); em[i] = 1; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  g.translate(0, cy, 0);
  group.add(lightMesh(g, fx, 0.42, { fresnel: 0.85 }));
  const drift = new THREE.Group();
  const gb = new Builder();
  for (let i = 0; i < 9; i++) { const a = R() * TAU, r = R() * Rd * 0.75; gb.ico(0.18 * S, 0, mat(Math.cos(a) * r, cy + (R() - 0.5) * Rd * 1.4, Math.sin(a) * r), 0xfff1c9, 1); }
  drift.add(lightMesh(gb.build(), fx, 0.8));
  group.add(drift);
  return finish({ group, fx, light: new THREE.Vector3(0, cy, 0), focus: new THREE.Vector3(0, cy, 0), span: Rd * 1.6, clear: Rd * 1.6 + 7, height: cy + Rd * 1.4, solid: { r: Rd * 1.1, top: cy + Rd * 1.4, low: 0 } }, (t) => {
    drift.rotation.y = t * 0.05;
  });
}

// ------------------------------------------------------------------ birch ring
function birches(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, Rr = P.radius, own = [];
  for (let i = 0; i < P.n; i++) {
    const a = (i / P.n) * TAU, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr, h = P.height * (0.75 + R() * 0.35);
    trunk(b, x, ctx.ground(x, z), z, h, 0.65 * S, -Math.cos(a) * P.lean, -Math.sin(a) * P.lean, R);
  }
  // inside, low, a ring of marks in the leaf litter
  const gb = new Builder();
  for (let i = 0; i < P.n * 3; i++) { const a = (i / (P.n * 3)) * TAU; gb.box(0.35 * S, 0.1, 0.9 * S, mat(Math.cos(a) * Rr * 0.55, ctx.ground(Math.cos(a) * Rr * 0.55, Math.sin(a) * Rr * 0.55) + 0.2, Math.sin(a) * Rr * 0.55, 0, -a, 0), A, 0.9); }
  gb.ico(1.2 * S, 1, mat(0, P.height * 0.45, 0), mixHex(A, 0xffffff, 0.5), 1);
  const leaves = leafMesh(P.leaves, 0.8 * S, (m) => { own.push(m); return m; });
  const L = Array.from({ length: P.leaves }, () => ({ a: R() * TAU, r: R() * Rr * 0.8, ph: R(), sp: 0.6 + R() * 0.7, sw: R() * TAU }));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(leaves);
  const fx = [];
  group.add(lightMesh(gb.build(), fx, 0.85));
  return finish({ group, fx, own, light: new THREE.Vector3(0, P.height * 0.45, 0), focus: new THREE.Vector3(0, P.height * 0.4, 0), span: Rr + 4, clear: Rr + 10, height: P.height }, (t) => {
    // leaves falling only inside the ring, swinging as they go
    for (let i = 0; i < P.leaves; i++) {
      const l = L[i], f = (l.ph + t * 0.035 * l.sp) % 1, y = P.height * (1 - f);
      const x = Math.cos(l.a) * l.r + Math.sin(t * 1.4 * l.sp + l.sw) * 2, z = Math.sin(l.a) * l.r + Math.cos(t * 1.1 * l.sp + l.sw) * 1.5;
      setLeaf(leaves, i, x, y + ctx.ground(x, z) * f, z, Math.sin(t * 2.2 + l.sw) * 0.9, t * 0.8 + l.sw, Math.cos(t * 1.7 + l.sw) * 0.7, leaves.userData.size);
    }
    leaves.instanceMatrix.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ cold fire
function hearth(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, H = P.height, Rr = 5 * S;
  for (let i = 0; i < P.stones; i++) {
    const a = (i / P.stones) * TAU, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr;
    b.add(stone(1.3 * S, i + 11), mat(x, ctx.ground(x, z) + 0.5 * S, z, 0, a, 0, 1.2, 0.8, 1), STONE[i % 4], 0, { flat: true });
  }
  // the wood it burns, laid as for any fire, untouched by it
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; beam(b, new THREE.Vector3(Math.cos(a) * Rr * 0.7, ctx.ground(0, 0) + 0.3, Math.sin(a) * Rr * 0.7), new THREE.Vector3(0, ctx.ground(0, 0) + 3 * S, 0), 0.7 * S, 0x3b2f26); }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the flame: tongues of pale gold, each its own flicker
  const fx = [], tongues = [];
  for (let i = 0; i < P.tongues; i++) {
    const fb = new Builder(), h = H * (0.45 + R() * 0.55), r = (1.2 + R() * 1.6) * S;
    fb.cone(r, h, 6, mat(0, h / 2, 0), mixHex(LEAF[i % 2 ? 0 : 3], A, R() * 0.35), 1);
    const m = lightMesh(fb.build(), fx, 0.26, { fresnel: 0.7 });
    const a = R() * TAU, o = R() * 2 * S;
    m.position.set(Math.cos(a) * o, ctx.ground(0, 0) + 1.5 * S, Math.sin(a) * o);
    group.add(m);
    tongues.push({ m, ph: R() * TAU, k: 3 + R() * 4 });
  }
  // embers going up, out of it, a long way
  const pts = 90, pos = new Float32Array(pts * 3), sz = new Float32Array(pts), al = new Float32Array(pts);
  const E = Array.from({ length: pts }, () => ({ ph: R(), a: R() * TAU, r: R() * 3, sp: 0.5 + R() * 0.8 }));
  for (let i = 0; i < pts; i++) { sz[i] = 0.6 + R(); al[i] = 0.6 + R() * 0.4; }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  pg.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const pm = pointsMaterial({ color: mixHex(LEAF[0], 0xffffff, 0.3), size: 0.5 * S, additive: true, opacity: 0.9 });
  fx.push([pm, 0.9]);
  const embers = new THREE.Points(pg, pm);
  embers.layers.set(LAYER_FX);
  embers.frustumCulled = false;
  group.add(embers);
  const base = ctx.ground(0, 0);
  return finish({ group, fx, light: new THREE.Vector3(0, base + H * 0.35, 0), focus: new THREE.Vector3(0, base + H * 0.5, 0), span: Math.max(Rr + 3, H * 0.45), clear: Rr + 12, height: base + H * 2 }, (t) => {
    for (const q of tongues) { const f = 0.75 + 0.25 * Math.sin(t * q.k + q.ph) + 0.1 * Math.sin(t * q.k * 2.7); q.m.scale.set(1 - (f - 0.75) * 0.6, f, 1 - (f - 0.75) * 0.6); q.m.rotation.y = t * 0.3 + q.ph; }
    for (let i = 0; i < pts; i++) {
      const e = E[i], f = (e.ph + t * 0.06 * e.sp) % 1;
      pos[i * 3] = Math.cos(e.a + f * 4) * (e.r + f * 6);
      pos[i * 3 + 1] = base + 2 + f * H * 2.2;
      pos[i * 3 + 2] = Math.sin(e.a + f * 4) * (e.r + f * 6);
    }
    pg.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ gold leaf
function goldleaf(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, H = P.height, W = H * 0.42;
  const base = ctx.ground(0, 0);
  const leaf = new THREE.Group();
  leaf.position.y = base;
  // the stem, into the ground
  b.cyl(0.5 * S, 0.8 * S, H * 0.3, 6, mat(0, H * 0.13, 0), 0x8a6a2a);
  // the blade: an oval coming to a point, serrate, a little cupped; gold, its veins lit
  const blade = (side) => {
    const N = 14;
    for (let i = 0; i < N; i++) {
      const v0 = i / N, v1 = (i + 1) / N;
      const w = (v) => Math.sin(Math.PI * Math.pow(v, 0.85)) * W * 0.5 * (1 + 0.06 * Math.sin(v * 40));
      const y = (v) => H * 0.28 + v * H * 0.72, cup = (v, x) => Math.abs(x) * 0.18;
      const a = [0, y(v0), 0], bb = [side * w(v0), y(v0) + W * 0.08, cup(v0, w(v0))], c = [side * w(v1), y(v1) + W * 0.08, cup(v1, w(v1))], e = [0, y(v1), 0];
      const col = mixHex(LEAF[0], LEAF[1], ((i * 7) % 5) / 8);
      if (side > 0) { b.tri(a, bb, c, col); b.tri(a, c, e, col); } else { b.tri(a, c, bb, col); b.tri(a, e, c, col); }
    }
  };
  blade(1); blade(-1);
  leaf.add(new THREE.Mesh(b.build(), mats.body));
  // the veins: the midrib, and its veins going out at the same angle, alternate
  const gb = new Builder(), y0 = H * 0.3;
  beam(gb, new THREE.Vector3(0, y0, 0.2), new THREE.Vector3(0, H * 0.98, 0.2), 0.25 * S, mixHex(A, 0xffffff, 0.4), 1);
  for (let i = 0; i < P.veins; i++) {
    const v = (i + 1) / (P.veins + 1), y = y0 + v * H * 0.66, side = i % 2 ? 1 : -1, w = Math.sin(Math.PI * Math.pow(v, 0.85)) * W * 0.45;
    beam(gb, new THREE.Vector3(0, y, 0.25), new THREE.Vector3(side * w, y + w * 0.55, 0.25 + w * 0.15), 0.16 * S, mixHex(A, LEAF[3], 0.4), 0.9);
  }
  const fx = [];
  leaf.add(lightMesh(gb.build(), fx, 0.9));
  const group = new THREE.Group();
  group.add(leaf);
  return finish({ group, fx, light: new THREE.Vector3(0, base + H * 0.6, 1), focus: new THREE.Vector3(0, base + H * 0.6, 0), span: Math.max(W, H * 0.4), clear: W * 0.8 + 6, height: base + H, solid: { r: W * 0.5, top: base + H, low: 0 } }, (t) => {
    leaf.rotation.y = t * 0.06 + Math.sin(t * 0.3) * 0.4;
    leaf.rotation.z = Math.sin(t * 0.45) * 0.05;
  });
}

// (the lantern birch by a name of its own: the forest has its own lanterns)
export const AUTUMN = { leafstorm, lanternbirch: lanterns, amber, birches, hearth, goldleaf };
