import * as THREE from 'three';
import { Builder, mat } from '../../render/build.js';
import { glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp, smoothstep } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam } from '../parts.js';

// Artifacts of the water. Five ride or stand in a lake (the origin on its surface, y = 0
// the water), three keep to a river (the origin in its middle, x across it, z along it).
//   buoys         a scatter of buoys, a lamp on each, joined under the water by lines of
//                 light; the lamps blink in turn, passing something along the lines
//   stilthouse    a hut of dark timber on tall piles, one window lit, a jetty and its lamp,
//                 a rowing boat swinging on its line
//   reeds         a ring or a crescent of giant reeds, their seed-heads lit, swaying in
//                 slow waves and leaning away from the ship
//   sunkenbell    the crown and shoulder of an enormous bell breaking the surface at a
//                 tilt; rings of light go out from it over the water, on the rhythm
//   glassfloats   great glass fishing floats in a loose net of rope, a light in each
//   gauge         a staff of stone in mid-river, its marks lit as far up as it reads;
//                 smaller staffs up- and downstream, each reading a little later
//   lanternboats  a flotilla of paper-lantern boats going down the river without end,
//                 from under a lit lamp to under a dark one
//   fishladder    a stair of stone pools climbing the bank, water of light spilling down
//                 it and small lights leaping up it
//
// (The water is drawn solid, so nothing shows through it: what is said to lie "under the
// surface" is laid a hand's breadth over it, dim, and reads as lying in it.)

const TIMBER = [0x2c2622, 0x3d3530];
const WATERC = 0xbcd6de, FOAM = 0xeaf3f5;
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen'];
const numw = (n) => NUMW[n] || String(n);
const frac = (x) => x - Math.floor(x);
const _c = new THREE.Color();

function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}
function finish(out, update) {
  const res = {
    ...out,
    mats: out.fx.map(([m]) => m),
    update(t, beat, c) {
      for (const [m, o] of out.fx) m.uniforms.uOpacity.value = o * (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      if (update) update(t, beat, c);
    },
  };
  // (so that nothing is ever drawn where it was built rather than where it belongs)
  res.update(0, 0, { pulse: 1, reveal: 0, near: 0, shipLocal: V(0, 9999, 9999) });
  return res;
}
// soft points of light: n of them, placed and dimmed by the caller (sz: meters across)
function lights(n, color, fx, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size: 1, additive: true, opacity });
  fx.push([m, opacity]);
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  return { p, pos, sz, al, touch() { g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; } };
}
// a round post from a to c (r0 at a, r1 at c)
function post(b, a, c, r0, r1, seg, color, em = 0) {
  const dv = new THREE.Vector3().subVectors(c, a), len = dv.length();
  if (len < 1e-4) return;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dv.normalize());
  b.cyl(r1, r0, len, seg, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), color, em);
}
// a flat face (three or four corners), wound so that it looks along `hint`
function face(b, p, hint, color, em = 0) {
  const a = p[0], c = p[1], e = p[2];
  const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
  if ((uy * vz - uz * vy) * hint[0] + (uz * vx - ux * vz) * hint[1] + (ux * vy - uy * vx) * hint[2] < 0) p = p.slice().reverse();
  if (p.length === 3) b.tri(p[0], p[1], p[2], color, em);
  else b.quad(p[0], p[1], p[2], p[3], color, em);
}
// a stem standing more or less upright along a path: level rings, so it never twists
function stem(b, pts, rad, seg, color, turn = 0) {
  const n = pts.length, rings = [];
  for (let i = 0; i < n; i++) {
    const r = typeof rad === 'function' ? rad(i / (n - 1)) : rad, ring = [];
    for (let k = 0; k < seg; k++) { const a = turn + (k / seg) * TAU; ring.push([pts[i].x + Math.cos(a) * r, pts[i].y, pts[i].z + Math.sin(a) * r]); }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    const col = typeof color === 'function' ? color((i + 0.5) / (n - 1)) : color;
    for (let k = 0; k < seg; k++) {
      const am = turn + ((k + 0.5) / seg) * TAU, k1 = (k + 1) % seg;
      face(b, [rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]], [Math.cos(am), 0, Math.sin(am)], col);
    }
  }
}
// a pool of light lying on the water, bright at its heart and gone at its edge
function pool(b, x, y, z, r, color, e0, seg = 14) {
  b.add(new THREE.CircleGeometry(1, seg), mat(x, y, z, -Math.PI / 2, 0, 0, r, r, 1), color, (px, py) => Math.max(0.015, e0 * Math.pow(Math.max(0, 1 - Math.hypot(px, py)), 1.5)));
}
// a roof: a ridge over a rectangle (shift 0: a gable; -1 or 1: one slope)
function roof(b, cx, y0, cz, W, D, h, shift, c0, c1) {
  const xl = cx - W / 2, xr = cx + W / 2, xt = cx + (shift * W) / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  const A1 = [xl, y0, z0], A2 = [xr, y0, z0], A3 = [xt, y0 + h, z0], B1 = [xl, y0, z1], B2 = [xr, y0, z1], B3 = [xt, y0 + h, z1];
  face(b, [A1, A3, B3, B1], [-1, 0.3, 0], c0);
  face(b, [A2, A3, B3, B2], [1, 0.3, 0], c1);
  face(b, [A1, A2, A3], [0, 0, -1], c0);
  face(b, [B1, B2, B3], [0, 0, 1], c0);
  face(b, [A1, A2, B2, B1], [0, -1, 0], c0);
}

// Rigid parts merged into one geometry and moved by hand: a whole fleet in one draw call.
// Each part is built about its own origin; set() turns it (yaw, then pitch, then roll),
// scales it and puts it in its place.
class Rig {
  constructor() { this.b = new Builder(); this.parts = []; }
  part(fn) {
    const s = this.b.pos.length / 3;
    fn(this.b);
    this.parts.push({ s, e: this.b.pos.length / 3, m: new Float64Array(12) });
    return this.parts.length - 1;
  }
  build() {
    this.g = this.b.build();
    this.pos = this.g.attributes.position.array;
    this.base = Float32Array.from(this.pos);
    this.em = this.g.attributes.emissive.array;
    return this.g;
  }
  set(i, x, y, z, yaw = 0, pitch = 0, roll = 0, s = 1) {
    const p = this.parts[i], m = p.m, B = this.base, O = this.pos;
    const a = Math.cos(pitch), b = Math.sin(pitch), c = Math.cos(yaw), d = Math.sin(yaw), e = Math.cos(roll), f = Math.sin(roll);
    m[0] = (c * e + d * f * b) * s; m[1] = (d * e * b - c * f) * s; m[2] = a * d * s; m[3] = x;
    m[4] = a * f * s; m[5] = a * e * s; m[6] = -b * s; m[7] = y;
    m[8] = (c * f * b - d * e) * s; m[9] = (d * f + c * e * b) * s; m[10] = a * c * s; m[11] = z;
    for (let v = p.s * 3, n = p.e * 3; v < n; v += 3) {
      const X = B[v], Y = B[v + 1], Z = B[v + 2];
      O[v] = m[0] * X + m[1] * Y + m[2] * Z + x;
      O[v + 1] = m[4] * X + m[5] * Y + m[6] * Z + y;
      O[v + 2] = m[8] * X + m[9] * Y + m[10] * Z + z;
    }
  }
  // where a point of part i is now
  at(i, lx, ly, lz, out, o) {
    const m = this.parts[i].m;
    out[o] = m[0] * lx + m[1] * ly + m[2] * lz + m[3];
    out[o + 1] = m[4] * lx + m[5] * ly + m[6] * lz + m[7];
    out[o + 2] = m[8] * lx + m[9] * ly + m[10] * lz + m[11];
  }
  done() { this.g.attributes.position.needsUpdate = true; }
}

// Triangles of pure light whose brightness is rewritten every frame: every vertex carries
// the number of the thing it belongs to (id) and how far along or out it is (u, 0..1).
class Lit {
  constructor() { this.pos = []; this.col = []; this.id = []; this.u = []; }
  tri(a, b, c, id, ua, ub, uc, color) {
    _c.setHex(color);
    for (const [p, u] of [[a, ua], [b, ub], [c, uc]]) { this.pos.push(p[0], p[1], p[2]); this.col.push(_c.r, _c.g, _c.b); this.id.push(id); this.u.push(u); }
  }
  quad(a, b, c, d, id, u, color) { this.tri(a, b, c, id, u, u, u, color); this.tri(a, c, d, id, u, u, u, color); }
  // a ribbon along a path: lying flat, or (side given) spread along that direction
  ribbon(path, halfW, id, color, side = null) {
    const n = path.length, L = [], Rt = [];
    for (let i = 0; i < n; i++) {
      const p = path[i];
      let s = side;
      if (!s) { const a = path[Math.max(0, i - 1)], c = path[Math.min(n - 1, i + 1)]; s = V(c.z - a.z, 0, a.x - c.x).normalize(); }
      const w = typeof halfW === 'function' ? halfW(i / (n - 1)) : halfW;
      L.push([p.x - s.x * w, p.y - s.y * w, p.z - s.z * w]);
      Rt.push([p.x + s.x * w, p.y + s.y * w, p.z + s.z * w]);
    }
    for (let i = 0; i < n - 1; i++) {
      const u0 = i / (n - 1), u1 = (i + 1) / (n - 1);
      this.tri(L[i], Rt[i], Rt[i + 1], id, u0, u0, u1, color);
      this.tri(L[i], Rt[i + 1], L[i + 1], id, u0, u1, u1, color);
    }
  }
  disc(x, y, z, r, id, color, seg = 14) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU;
      this.tri([x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], id, 0, 1, 1, color);
    }
  }
  // a band between two closed curves (u 0 on the inner, 1 on the outer)
  band(inner, outer, id, color) {
    const n = inner.length;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      this.tri(inner[k], outer[k], outer[k1], id, 0, 1, 1, color);
      this.tri(inner[k], outer[k1], inner[k1], id, 0, 1, 0, color);
    }
  }
  build() {
    const g = new THREE.BufferGeometry(), n = this.id.length;
    const em = new Float32Array(n).fill(0.3);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
    return { g, em, id: this.id, u: this.u, n, touch() { g.attributes.emissive.needsUpdate = true; } };
  }
}

// ------------------------------------------------------------------ buoys
function buoy(b, u, m, kind, A, tone) {
  if (kind === 'can') {
    b.cyl(1.25 * u, 1.25 * u, 2 * u, 8, mat(0, 0.3 * u, 0), STONE[2 + (tone % 2)]);
    b.cyl(1.34 * u, 1.34 * u, 0.4 * u, 8, mat(0, 0.95 * u, 0), RIM);
    for (let j = 0; j < 3; j++) { const a = (j / 3) * TAU + 0.5; post(b, V(Math.cos(a) * 0.95 * u, 1.3 * u, Math.sin(a) * 0.95 * u), V(0, m - 0.1 * u, 0), 0.19 * u, 0.15 * u, 4, RIM); }
  } else if (kind === 'nun') {
    b.cyl(0.4 * u, 1.35 * u, 2.8 * u, 8, mat(0, 0.9 * u, 0), STONE[2 + (tone % 2)]);
    b.cyl(0.84 * u, 0.98 * u, 0.4 * u, 8, mat(0, 1.0 * u, 0), RIM);
    post(b, V(0, 2.2 * u, 0), V(0, m - 0.1 * u, 0), 0.22 * u, 0.17 * u, 5, RIM);
  } else {
    post(b, V(0, -3 * u, 0), V(0, m - 0.1 * u, 0), 0.52 * u, 0.26 * u, 6, STONE[2 + (tone % 2)]);
    b.cyl(1.05 * u, 1.05 * u, 0.9 * u, 8, mat(0, 0.15 * u, 0), STONE[3]);
    b.cyl(0.42 * u, 0.47 * u, 0.6 * u, 6, mat(0, m * 0.62, 0), RIM);
  }
  // its ballast, under the water
  if (kind !== 'spar') b.cone(0.9 * u, 2.4 * u, 6, mat(0, -1.8 * u, 0, Math.PI, 0, 0), STONE[0]);
  // the lamp on its mast, under a hood
  b.cyl(0.6 * u, 0.6 * u, 0.22 * u, 6, mat(0, m, 0), STONE[3]);
  const s = b.pos.length / 3;
  b.ico(0.62 * u, 0, mat(0, m + 0.62 * u, 0), A, 0.3);
  const e = b.pos.length / 3;
  b.cone(0.72 * u, 0.55 * u, 6, mat(0, m + 1.45 * u, 0), RIM);
  return [s, e];
}
function buoys(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]);
  const pale = mixHex(A, 0xffffff, 0.3);
  // where they ride: scattered over an oval of water, none too near another, on no figure
  const ca = Math.cos(P.turn), sa = Math.sin(P.turn), at = [];
  let gap = (P.radius * 1.5) / Math.sqrt(P.n);
  for (let tries = 0; at.length < P.n && tries < 6000; tries++) {
    const a = R() * TAU, r = Math.sqrt(R()) * P.radius;
    const ex = Math.cos(a) * r, ez = Math.sin(a) * r * P.squash;
    const x = ex * ca - ez * sa, z = ex * sa + ez * ca;
    if (tries % 50 === 49) gap *= 0.92;
    if (ctx.ground(x, z) > 0.05 || at.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
    at.push({ x, z });
  }
  while (at.length < 3) { const a = at.length * 2.4; at.push({ x: Math.cos(a) * 5 * S, z: Math.sin(a) * 5 * S }); }
  const N = at.length, dist = (i, j) => Math.hypot(at[i].x - at[j].x, at[i].z - at[j].z);
  // the keeper, where the passing starts; every other is joined to the nearest already
  // joined: a chain that branches and never closes
  const root = Math.floor(R() * N);
  const parent = new Array(N).fill(-1), kids = at.map(() => []), joined = new Array(N).fill(false);
  joined[root] = true;
  for (let k = 1; k < N; k++) {
    let best = Infinity, bi = -1, bj = -1;
    for (let i = 0; i < N; i++) {
      if (joined[i]) continue;
      for (let j = 0; j < N; j++) { if (!joined[j]) continue; const q = dist(i, j); if (q < best) { best = q; bi = i; bj = j; } }
    }
    joined[bi] = true; parent[bi] = bj; kids[bj].push(bi);
  }
  // the order they blink in: along the chain, branch by branch
  const order = [];
  const walk = (i) => {
    order.push(i);
    const k = kids[i];
    for (let q = k.length - 1; q > 0; q--) { const o = Math.floor(R() * (q + 1)); [k[q], k[o]] = [k[o], k[q]]; }
    for (const j of k) walk(j);
  };
  walk(root);
  order.forEach((i, k) => { at[i].when = k; });
  const rig = new Rig();
  at.forEach((p, i) => {
    p.k = (i === root ? 1.5 : R.range(0.8, 1.2)) * S;
    p.m = P.mast * (i === root ? 1.6 : R.range(0.8, 1.2));
    p.w = R.range(0.7, 1.2); p.ph = R() * TAU; p.yaw = R() * TAU;
    rig.part((b) => { p.lamp = buoy(b, p.k, p.m, P.kind, A, i); });
  });
  const group = new THREE.Group(), fx = [];
  const body = new THREE.Mesh(rig.build(), mats.glow);
  body.frustumCulled = false;
  group.add(body);
  // the lines in the water from each to the one it was joined to, and a pool of light under every lamp
  const lit = new Lit();
  at.forEach((p, i) => {
    lit.disc(p.x, 0.2, p.z, 3.4 * p.k, 100 + p.when, A, 12);
    if (i === root) return;
    const o = at[parent[i]], len = dist(i, parent[i]), bow = (R() - 0.5) * 0.3 * len;
    const mx = (o.x + p.x) / 2 - ((p.z - o.z) / len) * bow, mz = (o.z + p.z) / 2 + ((p.x - o.x) / len) * bow;
    const path = [];
    for (let q = 0; q <= 10; q++) { const u = q / 10, a = (1 - u) * (1 - u), c = 2 * u * (1 - u), e = u * u; path.push(V(o.x * a + mx * c + p.x * e, 0.14, o.z * a + mz * c + p.z * e)); }
    lit.ribbon(path, 0.3 * S, p.when, pale);
  });
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.85));
  const halo = lights(N, A, fx, 1);
  at.forEach((p, i) => { halo.sz[i] = 4.6 * p.k; });
  group.add(halo.p);
  const cyc = N + P.rest, env = new Float32Array(N);
  let cx = 0, cz = 0, span = 0;
  for (const p of at) { cx += p.x / N; cz += p.z / N; span = Math.max(span, Math.hypot(p.x, p.z) + 3.4 * p.k); }
  const k0 = at[root];
  return finish({ group, fx, light: V(k0.x, k0.m + 0.6 * k0.k, k0.z), focus: V(cx, 3 * S, cz), span, clear: Math.min(95, span + 6), height: k0.m + 1.8 * k0.k }, (t, beat, c) => {
    const q = (t / P.step) % cyc, near = c.near ?? 0;
    for (let i = 0; i < N; i++) {
      const p = at[i];
      // riding the water, each on its own time
      rig.set(i, p.x, Math.sin(t * p.w + p.ph) * 0.3 * p.k, p.z, p.yaw, Math.sin(t * p.w * 0.8 + p.ph * 2.1) * 0.07, Math.cos(t * p.w * 0.63 + p.ph * 1.3) * 0.07);
      // its turn: the lamp up at once, and down slowly
      const dq = (q - p.when + cyc) % cyc, e = dq < 0.12 ? dq / 0.12 : Math.exp(-(dq - 0.12) * 1.3);
      env[p.when] = e;
      const lv = Math.min(1.45, 0.22 + 0.2 * near + 1.1 * e);
      for (let v = p.lamp[0]; v < p.lamp[1]; v++) rig.em[v] = lv;
      rig.at(i, 0, p.m + 0.62 * p.k, 0, halo.pos, i * 3);
      halo.al[i] = 0.28 + 0.95 * e;
    }
    rig.done();
    rig.g.attributes.emissive.needsUpdate = true;
    halo.touch();
    for (let v = 0; v < L.n; v++) {
      const id = L.id[v], u = L.u[v];
      if (id >= 100) { L.em[v] = Math.max(0.015, (0.16 + 0.7 * env[id - 100]) * Math.pow(Math.max(0, 1 - u), 1.5)); continue; }
      // what is passed along: a spark down the line, arriving as the lamp lights
      const e = (q - (id - 1) + cyc) % cyc;
      L.em[v] = 0.15 + (e < 1.3 ? 0.85 * Math.exp(-(((u - e) / 0.13) ** 2)) : 0);
    }
    L.touch();
  });
}

// ------------------------------------------------------------------ stilt house
function stilthouse(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder();
  const Hp = P.deck, w = P.w, dp = P.d, hw = P.wall, hr = P.roof, jy = 1.4 * S;
  const deckW = w + 3 * S, deckD = dp + 3 * S;
  const stair = P.access === 'stair', run = stair ? (Hp - jy) * 0.72 : 0, Lj = stair ? P.jetty * 0.6 : P.jetty;
  const T = deckW + run + Lj, x0 = -T / 2, xh = x0 + deckW / 2, x1 = x0 + deckW, x2 = T / 2;
  // the deck on its piles, a little splayed, braced
  b.box(deckW, 0.5 * S, deckD, mat(xh, Hp - 0.25 * S, 0), TIMBER[1]);
  for (const q of [-1, 1]) b.box(deckW + 0.6 * S, 0.6 * S, 0.5 * S, mat(xh, Hp - 0.8 * S, q * (deckD / 2 - 0.8 * S)), TIMBER[0]);
  const pile = (ix, iz, y) => {
    const sp = 1.14 - 0.14 * ((y + 6) / (Hp - 0.5 * S + 6));
    return V(xh + ix * (deckW / 2 - 0.8 * S) * sp, y, iz * (deckD / 2 - 0.8 * S) * sp);
  };
  for (let i = 0; i < P.px; i++) for (let j = 0; j < P.pz; j++) {
    const ix = (i / (P.px - 1)) * 2 - 1, iz = (j / (P.pz - 1)) * 2 - 1;
    post(b, pile(ix, iz, -6), pile(ix, iz, Hp - 0.5 * S), 0.46 * S, 0.38 * S, 6, TIMBER[(i + j) % 2]);
    const tm = pile(ix, iz, 0.5 * S);
    b.cyl(0.5 * S, 0.53 * S, 1.1 * S, 6, mat(tm.x, tm.y, tm.z), mixHex(TIMBER[1], RIM, 0.35));
  }
  const yA = 2.4 * S, yB = Hp - 1.6 * S;
  for (const [a, c] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    beam(b, pile(a[0], a[1], yA), pile(c[0], c[1], yB), 0.32 * S, TIMBER[1]);
    beam(b, pile(c[0], c[1], yA), pile(a[0], a[1], yB), 0.32 * S, TIMBER[1]);
  }
  // the hut: four walls, a door to the jetty's side
  b.box(w, hw, dp, mat(xh, Hp + hw / 2, 0), TIMBER[0]);
  b.box(w + 0.3 * S, 0.4 * S, dp + 0.3 * S, mat(xh, Hp + 0.2 * S, 0), TIMBER[1]);
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) b.box(0.45 * S, hw, 0.45 * S, mat(xh + qx * w / 2, Hp + hw / 2, qz * dp / 2), TIMBER[1]);
  const zd = -dp * 0.22;
  b.box(0.2 * S, 2.5 * S, 1.3 * S, mat(xh + w / 2 + 0.06 * S, Hp + 1.25 * S, zd), STONE[0]);
  b.box(0.3 * S, 0.3 * S, 1.9 * S, mat(xh + w / 2 + 0.1 * S, Hp + 2.65 * S, zd), RIM);
  // its one window, lit
  const yw = Hp + hw * 0.58, ww = 1.6 * S, wh = 1.7 * S;
  let Wp, Wn;
  if (P.face === 'jetty') {
    Wn = V(1, 0, 0); Wp = V(xh + w / 2 + 0.08 * S, yw, dp * 0.22);
    b.box(0.16 * S, wh, ww, mat(Wp.x, yw, Wp.z), A, PULSE);
    for (const q of [-1, 1]) {
      b.box(0.3 * S, 0.3 * S, ww + 0.6 * S, mat(Wp.x + 0.04 * S, yw + q * (wh / 2 + 0.15 * S), Wp.z), RIM);
      b.box(0.3 * S, wh, 0.3 * S, mat(Wp.x + 0.04 * S, yw, Wp.z + q * (ww / 2 + 0.15 * S)), RIM);
    }
  } else {
    const q0 = P.face === 'side' ? 1 : -1;
    Wn = V(0, 0, q0); Wp = V(xh + w * 0.12, yw, q0 * (dp / 2 + 0.08 * S));
    b.box(ww, wh, 0.16 * S, mat(Wp.x, yw, Wp.z), A, PULSE);
    for (const q of [-1, 1]) {
      b.box(ww + 0.6 * S, 0.3 * S, 0.3 * S, mat(Wp.x, yw + q * (wh / 2 + 0.15 * S), Wp.z + q0 * 0.04 * S), RIM);
      b.box(0.3 * S, wh, 0.3 * S, mat(Wp.x + q * (ww / 2 + 0.15 * S), yw, Wp.z + q0 * 0.04 * S), RIM);
    }
  }
  // the roof over it, and a stovepipe
  const yr = Hp + hw, ov = 0.9 * S;
  if (P.kind === 'hip') {
    const g = new THREE.ConeGeometry(0.7071, 1, 4);
    g.rotateY(Math.PI / 4);
    b.add(g, mat(xh, yr + hr / 2, 0, 0, 0, 0, w + 2 * ov, hr, dp + 2 * ov), (x, y, z, i) => STONE[1 + ((i / 3) & 1)], 0, { flat: true });
    b.box(0.5 * S, 0.5 * S, 0.5 * S, mat(xh, yr + hr, 0), RIM);
  } else {
    const sh = P.kind === 'shed' ? -1 : 0;
    roof(b, xh, yr, 0, w + 2 * ov, dp + 2 * ov, hr, sh, STONE[1], STONE[2]);
    b.box(0.4 * S, 0.4 * S, dp + 2 * ov + 0.3 * S, mat(xh + (sh * (w + 2 * ov)) / 2, yr + hr, 0), RIM);
  }
  const pipe = V(xh + w * 0.24, yr + hr + 1.7 * S, -dp * 0.2);
  b.box(0.55 * S, hr + 1.7 * S, 0.55 * S, mat(pipe.x, yr + (hr + 1.7 * S) / 2, pipe.z), STONE[3]);
  b.box(0.95 * S, 0.25 * S, 0.95 * S, mat(pipe.x, pipe.y + 0.12 * S, pipe.z), RIM);
  // a rail about the deck, open toward the jetty
  const ry = Hp + 1.1 * S;
  b.box(0.3 * S, 0.3 * S, deckD, mat(x0 + 0.15 * S, ry, 0), TIMBER[1]);
  for (const q of [-1, 1]) {
    b.box(deckW, 0.3 * S, 0.3 * S, mat(xh, ry, q * (deckD / 2 - 0.15 * S)), TIMBER[1]);
    for (const f of [0, 0.5, 1]) b.box(0.3 * S, 1.1 * S, 0.3 * S, mat(x0 + 0.15 * S + f * (deckW - 0.3 * S), Hp + 0.55 * S, q * (deckD / 2 - 0.15 * S)), TIMBER[1]);
  }
  // the way down to the water: a ladder, or a stair
  let xa, zj;
  if (stair) {
    zj = 0; xa = x1 + run - 0.6 * S;
    const ns = Math.ceil((Hp - jy) / (0.75 * S));
    for (let k = 0; k < ns; k++) b.box(run / ns + 0.15 * S, 0.3 * S, 2 * S, mat(x1 + ((k + 0.5) * run) / ns, Hp - ((k + 1) * (Hp - jy)) / ns - 0.15 * S, 0), TIMBER[1]);
    for (const q of [-1, 1]) {
      beam(b, V(x1 - 0.2 * S, Hp - 0.6 * S, q * 1.05 * S), V(x1 + run, jy - 0.4 * S, q * 1.05 * S), 0.4 * S, TIMBER[0]);
      beam(b, V(x1, Hp + 1.1 * S, q * 1.05 * S), V(x1 + run, jy + 1.1 * S, q * 1.05 * S), 0.3 * S, TIMBER[1]);
      for (const f of [0.02, 0.98]) b.box(0.3 * S, 1.3 * S, 0.3 * S, mat(x1 + f * run, Hp - f * (Hp - jy) + 0.5 * S, q * 1.05 * S), TIMBER[1]);
      for (const f of [0.36, 0.7]) post(b, V(x1 + f * run, -6, q * 1.05 * S), V(x1 + f * run, Hp - f * (Hp - jy) - 0.5 * S, q * 1.05 * S), 0.34 * S, 0.3 * S, 5, TIMBER[0]);
    }
  } else {
    zj = zd; xa = x1 + 0.2 * S;
    const nr = Math.floor((Hp - jy) / (0.9 * S));
    const top = (q) => V(x1 + 0.3 * S, Hp + 1.0 * S, zd + q * 0.55 * S), foot = (q) => V(x1 + 1.5 * S, jy, zd + q * 0.55 * S);
    for (const q of [-1, 1]) beam(b, top(q), foot(q), 0.28 * S, TIMBER[1]);
    for (let k = 0; k < nr; k++) { const p = top(0).lerp(foot(0), (k + 1.6) / (nr + 1.6)); b.box(0.25 * S, 0.22 * S, 1.1 * S, mat(p.x, p.y, p.z), TIMBER[1]); }
  }
  // the jetty on its own short piles, and a lamp on a pole at its end
  b.box(x2 - xa, 0.35 * S, 2.6 * S, mat((xa + x2) / 2, jy - 0.17 * S, zj), TIMBER[1]);
  const np = Math.max(2, Math.round((x2 - xa) / (4.5 * S))) + 1, sideL = -P.boatSide;
  const jx = (k) => xa + 0.6 * S + (k * (x2 - xa - 1.2 * S)) / (np - 1);
  for (let k = 0; k < np; k++) for (const q of [-1, 1]) {
    if (k === np - 1 && q === sideL) continue;
    post(b, V(jx(k), -6, zj + q * 1.2 * S), V(jx(k), jy + 0.6 * S, zj + q * 1.2 * S), 0.34 * S, 0.3 * S, 5, TIMBER[0]);
  }
  const xe = jx(np - 1), ze = zj + sideL * 1.2 * S, yl = jy + P.pole;
  post(b, V(xe, -6, ze), V(xe, yl, ze), 0.34 * S, 0.2 * S, 5, TIMBER[0]);
  beam(b, V(xe, yl - 0.3 * S, ze), V(xe + 1.6 * S, yl + 0.3 * S, ze), 0.24 * S, TIMBER[1]);
  const lamp = V(xe + 1.5 * S, yl - 1.25 * S, ze);
  b.box(0.14 * S, 0.9 * S, 0.14 * S, mat(lamp.x, yl - 0.25 * S, ze), RIM);
  b.box(0.9 * S, 1.1 * S, 0.9 * S, mat(lamp.x, lamp.y, ze), A, PULSE);
  b.box(1.2 * S, 0.2 * S, 1.2 * S, mat(lamp.x, lamp.y + 0.65 * S, ze), STONE[3]);
  b.box(1.0 * S, 0.16 * S, 1.0 * S, mat(lamp.x, lamp.y - 0.63 * S, ze), STONE[3]);
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the rowing boat on its line, tied to a pile of the jetty
  const kt = Math.min(np - 2, Math.round((np - 1) * 0.6)), Lr = P.line, Lb = 5.2 * S;
  const pivot = new THREE.Group();
  pivot.position.set(jx(kt), 0, zj + P.boatSide * 1.2 * S);
  const bb = new Builder();
  beam(bb, V(0, jy * 0.75, 0), V(Lr + 0.3 * S, 0.62 * S, 0), 0.13 * S, RIM);
  const hull = new THREE.CylinderGeometry(1, 0.7, 1, 6);
  hull.rotateY(Math.PI / 2);
  bb.add(hull, mat(Lr + Lb / 2, 0.22 * S, 0, 0, 0, 0, Lb / 2, 0.9 * S, 1.05 * S), (x, y) => (y > 0.3 ? mixHex(TIMBER[1], RIM, 0.3) : TIMBER[0]));
  const well = new THREE.CylinderGeometry(1, 1, 1, 6);
  well.rotateY(Math.PI / 2);
  bb.add(well, mat(Lr + Lb / 2, 0.66 * S, 0, 0, 0, 0, Lb / 2 - 0.4 * S, 0.06 * S, 0.72 * S), STONE[0]);
  for (const f of [0.34, 0.62]) bb.box(0.45 * S, 0.16 * S, 1.6 * S, mat(Lr + Lb * f, 0.72 * S, 0), TIMBER[1]);
  for (const q of [-1, 1]) bb.box(4.2 * S, 0.14 * S, 0.2 * S, mat(Lr + Lb * 0.52, 0.86 * S, q * 0.35 * S, 0, q * 0.06, 0), RIM);
  pivot.add(new THREE.Mesh(bb.build(), mats.glow));
  group.add(pivot);
  // the window's light and the lamp's lying on the water
  const gb = new Builder();
  pool(gb, Wp.x + Wn.x * 5.5 * S, 0.2, Wp.z + Wn.z * 5.5 * S, 6.5 * S, A, 0.42);
  pool(gb, lamp.x, 0.22, lamp.z, 4.2 * S, A, 0.5);
  group.add(lightMesh(gb.build(), fx, 0.8));
  // their glow, and a thread of sparks going up from the stovepipe
  const NS = 18, pt = lights(2 + NS, A, fx, 1);
  pt.pos.set([Wp.x + Wn.x * 0.4 * S, Wp.y, Wp.z + Wn.z * 0.4 * S, lamp.x, lamp.y, lamp.z]);
  pt.sz[0] = 7 * S; pt.sz[1] = 4.5 * S;
  const SM = Array.from({ length: NS }, () => ({ ph: R(), v: R.range(0.7, 1.3), r: R() }));
  SM.forEach((s, i) => { pt.sz[2 + i] = (0.7 + s.r * 0.7) * S; });
  group.add(pt.p);
  const base = -P.boatSide * Math.PI / 2, ph1 = R() * TAU, ph2 = R() * TAU;
  const height = pipe.y + 0.3 * S, half = T / 2 + 1.6 * S;
  return finish({
    group, fx, light: V(Wp.x + Wn.x * 1.5 * S, Wp.y, Wp.z + Wn.z * 1.5 * S), focus: V(xh * 0.55, Hp * 0.75, 0), span: half, clear: Math.min(95, half + 6), height,
    solid: height > 25 ? { r: Math.abs(xh) + Math.hypot(deckW, deckD) / 2 + 2, top: height, low: 0 } : undefined,
  }, (t, beat, c) => {
    // the boat swinging at the end of its line, rocking a little
    pivot.rotation.set(Math.sin(t * 0.9 + ph1) * 0.05, base + Math.sin(t * 0.19 + ph1) * 0.42 + Math.sin(t * 0.071 + ph2) * 0.24, 0, 'YXZ');
    pivot.position.y = Math.sin(t * 0.8 + ph2) * 0.1 * S;
    pt.al[0] = 0.55 + 0.6 * (c.near ?? 0);
    pt.al[1] = 0.8;
    for (let i = 0; i < NS; i++) {
      const s = SM[i], u = frac(s.ph + t * 0.045 * s.v);
      pt.pos[6 + i * 3] = pipe.x + Math.sin(u * 5 + s.r * 9 + t * 0.2) * u * 1.4 * S + u * u * 3 * S;
      pt.pos[7 + i * 3] = pipe.y + 0.4 * S + u * 11 * S;
      pt.pos[8 + i * 3] = pipe.z + Math.cos(u * 4 + s.r * 7) * u * 1.2 * S;
      pt.al[2 + i] = 0.5 * (1 - u) * Math.min(1, u * 8);
    }
    pt.touch();
  });
}

// ------------------------------------------------------------------ reeds
function reeds(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder();
  const pale = mixHex(A, 0xffffff, 0.35);
  const n = P.n, H = P.height, a0 = R() * TAU, ring = P.shape === 'ring';
  const RD = [], gb = new Builder();
  let top = 0, span = 0;
  for (let j = 0; j < n; j++) {
    const row = P.rows === 2 ? j % 2 : 0, u = ring ? j / n : j / (n - 1);
    const th = a0 + u * P.arc + (R() - 0.5) * (P.arc / n) * 0.7;
    const rr = P.radius + (row ? 2.8 * S : 0) + (R() - 0.5) * 2.2 * S;
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    // (a ring's heights rise and fall around it; a crescent is tallest at its middle)
    const taper = ring ? 0.84 + 0.16 * Math.sin(th * P.lobes + a0) : 0.5 + 0.5 * Math.pow(Math.sin(Math.PI * u), 0.7);
    const h = H * taper * (0.86 + R() * 0.14) * (row ? 0.8 : 1);
    // how it stands when nothing moves it: leaning out a little, each its own way
    const lo = R.range(0.02, 0.09), lt = R.range(-0.04, 0.04);
    const ox = Math.cos(th) * lo - Math.sin(th) * lt, oz = Math.sin(th) * lo + Math.cos(th) * lt;
    const s = b.pos.length / 3, pts = [V(x, -6, z), V(x, 0, z)];
    for (let k = 1; k <= 6; k++) { const y = (h * k) / 6, f = (y * y) / h; pts.push(V(x + ox * f, y, z + oz * f)); }
    const tone = j % 2;
    stem(b, pts, (q) => (0.42 - 0.26 * q) * S, 4, (q) => mixHex(STONE[1 + tone], STONE[3], q), th);
    const tx = x + ox * h, tz = z + oz * h;
    let hy = h;
    if (P.head === 'cattail') {
      const Lh = clamp(0.15 * h, 2.6 * S, 5 * S);
      hy = h - Lh / 2 - 0.5 * S;
      b.cyl(0.55 * S, 0.62 * S, Lh, 5, mat(tx, hy, tz), A, PULSE);
      b.cone(0.2 * S, 1.6 * S, 4, mat(tx, h + 0.3 * S, tz), RIM);
    } else if (P.head === 'plume') {
      const Lh = clamp(0.2 * h, 3.2 * S, 6.5 * S);
      hy = h - Lh * 0.35;
      b.add(new THREE.IcosahedronGeometry(1, 0), mat(tx, hy, tz, 0, th, 0, 0.8 * S, Lh / 2, 0.8 * S), A, PULSE);
    } else {
      hy = h - 1.6 * S;
      [[3.2, 0.72], [1.6, 0.56], [0.3, 0.42]].forEach(([dy, r]) => b.ico(r * S, 0, mat(tx, h - dy * S, tz), A, PULSE));
    }
    // a blade or two from its foot
    const nl = R.chance(0.45) ? 2 : 1;
    for (let q = 0; q < nl; q++) {
      const la = th + Math.PI * (q ? 1 : 0) + R.range(-1.2, 1.2), hl = h * R.range(0.28, 0.48), reach = hl * R.range(0.35, 0.6);
      const lp = [];
      for (let k = 0; k <= 5; k++) { const f = k / 5, o = reach * Math.pow(f, 1.5); lp.push(V(x + Math.cos(la) * o, 0.3 + hl * Math.sin(f * 2.0), z + Math.sin(la) * o)); }
      stem(b, lp, (f) => (0.34 * Math.pow(Math.max(0, 1 - f), 0.7) + 0.06) * S, 3, (f) => mixHex(STONE[2], RIM, 0.3 * f), la);
    }
    RD.push({ s, e: b.pos.length / 3, x, z, h, th, tx, tz, hy });
    pool(gb, x, 0.2, z, 2.2 * S, A, 0.4, 8);
    top = Math.max(top, h + 1.2 * S);
    span = Math.max(span, Math.hypot(tx, tz) + 3 * S);
  }
  const g = b.build(), pos = g.attributes.position.array, base = Float32Array.from(pos);
  const group = new THREE.Group(), fx = [];
  const mesh = new THREE.Mesh(g, mats.glow);
  mesh.frustumCulled = false;
  group.add(mesh);
  group.add(lightMesh(gb.build(), fx, 0.7));
  // the glow of the heads, and fireflies among the stalks
  const M = P.motes, pt = lights(n + M, pale, fx, 1);
  for (let j = 0; j < n; j++) pt.sz[j] = 3.6 * S;
  const FL = Array.from({ length: M }, (_, i) => {
    const r = RD[Math.floor(R() * n)];
    pt.sz[n + i] = R.range(0.9, 1.5) * S;
    return { x: r.x, z: r.z, y: R.range(1.5, r.h * 0.9), rr: R.range(1.5, 5.5) * S, a: R() * TAU, sp: R.range(0.08, 0.3) * (R.chance(0.5) ? 1 : -1), bl: R.range(0.5, 1.3), ph: R() * TAU };
  });
  group.add(pt.p);
  const w = TAU / P.period, amp = P.sway;
  return finish({ group, fx, light: V(0, H * 0.6, 0), focus: V(0, H * 0.55, 0), span, clear: Math.min(95, span + 6), height: top, solid: { r: P.radius + 5 * S, top, low: 0 } }, (t, beat, c) => {
    const ship = c.shipLocal;
    for (let j = 0; j < n; j++) {
      const r = RD[j], cs = Math.cos(r.th), sn = Math.sin(r.th);
      // the slow waves going round them, and a breath of wind over all
      const ph = P.waves * r.th - t * w, lr = amp * Math.sin(ph), lt = amp * 0.55 * Math.sin(ph + 1.3);
      let lx = cs * lr - sn * lt + 0.03 * Math.sin(t * 0.31 + r.x * 0.05), lz = sn * lr + cs * lt + 0.03 * Math.sin(t * 0.27 + r.z * 0.05 + 1);
      // and away from the ship when it passes close
      if (ship) {
        const dx = r.x - ship.x, dz = r.z - ship.z, dd = Math.hypot(dx, dz) + 1e-3;
        const k = clamp(1 - dd / (38 * S + 20), 0, 1) * clamp(1 - (ship.y - r.h) / 60, 0, 1);
        lx += (dx / dd) * 0.32 * k * k; lz += (dz / dd) * 0.32 * k * k;
      }
      const drop = 0.6 * (lx * lx + lz * lz) / (r.h * r.h);
      for (let v = r.s * 3, e = r.e * 3; v < e; v += 3) {
        const y = base[v + 1];
        if (y <= 0) continue;
        const f = (y * y) / r.h;
        pos[v] = base[v] + lx * f; pos[v + 1] = y - drop * y * y * y; pos[v + 2] = base[v + 2] + lz * f;
      }
      const f = (r.hy * r.hy) / r.h;
      pt.pos[j * 3] = r.tx + lx * f; pt.pos[j * 3 + 1] = r.hy; pt.pos[j * 3 + 2] = r.tz + lz * f;
      pt.al[j] = 0.55 + 0.25 * (c.pulse ?? 1);
    }
    g.attributes.position.needsUpdate = true;
    for (let i = 0; i < M; i++) {
      const m = FL[i], a = m.a + t * m.sp, o = (n + i) * 3;
      pt.pos[o] = m.x + Math.cos(a) * m.rr; pt.pos[o + 1] = m.y + Math.sin(t * 0.3 + m.ph) * 2.2 * S; pt.pos[o + 2] = m.z + Math.sin(a * 1.3) * m.rr;
      pt.al[n + i] = Math.pow(Math.max(0, Math.sin(t * m.bl + m.ph)), 3);
    }
    pt.touch();
  });
}

// ------------------------------------------------------------------ sunken bell
function sunkenbell(d, A, mats, ctx) {
  const P = d.params, S = d.size, bb = new Builder();
  const Rm = P.mouth, Hb = Rm * P.tall, rise = P.rise, sn = Math.sin(P.tilt), cs = Math.cos(P.tilt), vs = 0.13;
  // its profile: a low dome down to the shoulder, then the long waist flaring to the lip
  const prof = (v) => {
    if (v <= vs) return Rm * 0.52 * Math.sqrt(Math.max(0, 1 - (1 - v / vs) ** 2));
    const q = (v - vs) / (1 - vs);
    return Rm * (0.52 + 0.05 * q + 0.43 * q * q * q);
  };
  const VS = [0, 0.012, 0.035, 0.07, 0.1, 0.13, 0.19, 0.26, 0.35, 0.46, 0.6, 0.76, 0.92], SEG = 24;
  for (let i = 0; i < VS.length - 1; i++) {
    const r0 = prof(VS[i]), r1 = prof(VS[i + 1]), y0 = -VS[i] * Hb, y1 = -VS[i + 1] * Hb;
    for (let k = 0; k < SEG; k++) {
      const f0 = (k / SEG) * TAU, f1 = ((k + 1) / SEG) * TAU, fm = (f0 + f1) / 2;
      const col = i < 5 ? STONE[2] : i === 5 ? mixHex(STONE[3], RIM, 0.3) : STONE[1 + ((i + (k >> 2)) % 2)];
      const lo = [[Math.cos(f0) * r1, y1, Math.sin(f0) * r1], [Math.cos(f1) * r1, y1, Math.sin(f1) * r1]];
      const hi = [[Math.cos(f1) * r0, y0, Math.sin(f1) * r0], [Math.cos(f0) * r0, y0, Math.sin(f0) * r0]];
      face(bb, i === 0 ? [lo[0], lo[1], [0, 0, 0]] : [lo[0], lo[1], hi[0], hi[1]], [Math.cos(fm), i < 4 ? 1.5 : 0.2, Math.sin(fm)], col);
    }
  }
  // the wires cast about its shoulder, and between them the band of marks, lit
  const wire = mixHex(STONE[3], RIM, 0.5);
  for (const v of [0.135, 0.175, 0.31]) bb.torus(prof(v) + 0.1 * S, 0.4 * S, 5, SEG, mat(0, -v * Hb, 0, Math.PI / 2, 0, 0), wire);
  const vm = 0.2, rm = prof(vm) + 0.12 * S;
  for (let k = 0; k < P.marks; k++) {
    const f = (k / P.marks) * TAU, tall = (k % P.major === 0 ? 2.5 : 1.5) * S;
    bb.box(0.5 * S, tall, 0.8 * S, mat(Math.cos(f) * rm, -vm * Hb - tall / 2, Math.sin(f) * rm, 0, -f, 0), A, PULSE);
  }
  // its crown: the loops it hung by, and what is left of the beam through them
  bb.cyl(1.5 * S, 2.1 * S, 1.5 * S, 8, mat(0, 0.45 * S, 0), STONE[3]);
  for (let k = 0; k < P.canons; k++) {
    const f = (k / P.canons) * TAU + 0.3;
    bb.torus(1.7 * S, 0.45 * S, 5, 10, mat(Math.cos(f) * 1.9 * S, -0.25 * S, Math.sin(f) * 1.9 * S, 0, -f, 0), STONE[3], 0, Math.PI);
  }
  bb.torus(1.6 * S, 0.5 * S, 5, 14, mat(0, 2.5 * S, 0, 0, P.yoke, 0), wire);
  bb.box(Rm * 0.62, 1.15 * S, 1.15 * S, mat(-Math.sin(P.yoke) * Rm * 0.1, 2.5 * S, -Math.cos(P.yoke) * Rm * 0.1, 0, P.yoke + Math.PI / 2, 0.05), TIMBER[1]);
  const ax = rise * (sn / cs) * 0.5;
  let height = 0;
  for (let i = 0; i < bb.pos.length; i += 3) height = Math.max(height, rise - bb.pos[i] * sn + bb.pos[i + 1] * cs);
  const bell = new THREE.Group();
  bell.position.set(ax, rise, 0);
  bell.rotation.z = -P.tilt;
  bell.add(new THREE.Mesh(bb.build(), mats.glow));
  const group = new THREE.Group(), fx = [];
  group.add(bell);
  // where it breaks the surface
  const wl = [];
  let cx = 0;
  for (let k = 0; k < 32; k++) {
    const f = (k / 32) * TAU, yAt = (v) => rise - prof(v) * Math.cos(f) * sn - v * Hb * cs;
    let v0 = 0, v1 = 0.92;
    for (let q = 1; q <= 61; q++) { if (yAt(q * 0.015) < 0) { v1 = q * 0.015; v0 = v1 - 0.015; break; } }
    for (let q = 0; q < 12; q++) { const m = (v0 + v1) / 2; if (yAt(m) < 0) v1 = m; else v0 = m; }
    const v = (v0 + v1) / 2, r = prof(v);
    wl.push([ax + r * Math.cos(f) * cs - v * Hb * sn, r * Math.sin(f)]);
    cx += wl[k][0] / 32;
  }
  let r0 = Infinity, rw = 0, xmax = -Infinity;
  for (const p of wl) { const q = Math.hypot(p[0] - cx, p[1]); r0 = Math.min(r0, q); rw = Math.max(rw, q); xmax = Math.max(xmax, p[0]); }
  // a pale light in the water all about it, as if the rest of it shone below
  const lit = new Lit(), paleA = mixHex(A, 0xffffff, 0.3);
  lit.band(wl.map((p) => [cx + (p[0] - cx) * 0.97, 0.16, p[1] * 0.97]), wl.map((p) => { const q = Math.hypot(p[0] - cx, p[1]), k = (q + 5 * S) / q; return [cx + (p[0] - cx) * k, 0.16, p[1] * k]; }), 0, paleA);
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.7));
  for (let v = 0; v < L.n; v++) L.em[v] = Math.max(0.015, 0.55 * Math.pow(Math.max(0, 1 - L.u[v]), 1.6));
  // the rings going out from it over the water: one mesh, rewritten
  const nR = P.rings, SR = 56, reach = P.reach;
  const rp = new Float32Array(nR * SR * 18), re = new Float32Array(nR * SR * 6).fill(0.02);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nR * SR * 18).fill(1), 3));
  rg.setAttribute('emissive', new THREE.BufferAttribute(re, 1));
  const rings = lightMesh(rg, fx, 0.9);
  rings.material.uniforms.uTint.value.setHex(paleA);
  group.add(rings);
  const CS = Array.from({ length: SR + 1 }, (_, k) => [Math.cos((k / SR) * TAU), Math.sin((k / SR) * TAU)]);
  const span = Math.max(rw + 6 * S, reach * 0.72);
  return finish({
    group, fx, light: V(xmax + 3 * S, 3 * S, 0), focus: V(cx * 0.5 + ax * 0.5, height * 0.4, 0), span, clear: Math.min(95, reach + 4), height,
    solid: height > 25 ? { r: rw + Math.abs(cx) + 2, top: height, low: 0 } : undefined,
  }, (t, beat) => {
    // it rocks, hardly at all
    bell.rotation.z = -P.tilt + Math.sin(t * 0.17) * 0.012;
    bell.position.y = rise + Math.sin(t * 0.23) * 0.12 * S;
    for (let j = 0; j < nR; j++) {
      // each ring born at the bell on its beat, widening, fading, gone at its reach
      const u = frac(beat / (nR * P.every) + j / nR);
      const r = r0 * 0.85 + (reach - r0 * 0.85) * Math.pow(u, 0.85), wd = (0.35 + 1.5 * u) * S;
      const a = Math.max(0.015, Math.pow(Math.max(0, 1 - u), 1.6) * smoothstep(0, 0.05, u));
      const ri = r - wd, ro = r + wd;
      let o = j * SR * 18;
      for (let k = 0; k < SR; k++) {
        const [c0, s0] = CS[k], [c1, s1] = CS[k + 1];
        const q = [[c0 * ri, s0 * ri], [c0 * ro, s0 * ro], [c1 * ro, s1 * ro], [c0 * ri, s0 * ri], [c1 * ro, s1 * ro], [c1 * ri, s1 * ri]];
        for (const [qx, qz] of q) { rp[o++] = cx + qx; rp[o++] = 0.22; rp[o++] = qz; }
      }
      re.fill(a, j * SR * 6, (j + 1) * SR * 6);
    }
    rg.attributes.position.needsUpdate = true;
    rg.attributes.emissive.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ glass floats
function glassfloats(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]);
  const pale = mixHex(A, 0xffffff, 0.35), rope = TIMBER[0];
  // gathered: each new one set against one already there, as near the middle as it can get
  const F = [{ x: 0, z: 0, r: P.big }];
  const place = (r) => {
    let best = null;
    for (let q = 0; q < 36; q++) {
      const o = F[Math.floor(R() * F.length)], a = R() * TAU, dd = (o.r + r) * (1.08 + R() * P.loose);
      const x = o.x + Math.cos(a) * dd, z = o.z + Math.sin(a) * dd;
      if (F.some((f) => Math.hypot(f.x - x, f.z - z) < (f.r + r) * 1.06)) continue;
      const sc = Math.hypot(x, z);
      if (!best || sc < best.sc) best = { x, z, r, sc };
    }
    if (best) F.push(best);
    return best;
  };
  for (let i = 1; i < P.n; i++) place(R.range(1.5, 3.1) * S);
  const pole = place(0.95 * S) || { x: P.big + 2 * S, z: 0, r: 0.95 * S };
  if (F[F.length - 1] === pole) F.pop();
  const n = F.length;
  let mx = 0, mz = 0;
  for (const f of F) { mx += f.x / n; mz += f.z / n; }
  for (const f of [...F, pole]) { f.x -= mx; f.z -= mz; }
  const all = [...F, pole];
  // the net between them: every float tied to its nearest already tied, and a few lines more where two lie close
  const gapOf = (i, j) => Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) - all[i].r - all[j].r;
  const links = [], tied = [0];
  while (tied.length < all.length) {
    let best = Infinity, bi = -1, bj = -1;
    for (let i = 0; i < all.length; i++) { if (tied.includes(i)) continue; for (const j of tied) { const q = gapOf(i, j); if (q < best) { best = q; bi = i; bj = j; } } }
    tied.push(bi); links.push([bi, bj]);
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (gapOf(i, j) < 1.6 * S && !links.some(([a, c]) => (a === i && c === j) || (a === j && c === i)) && links.length < all.length * 2) links.push([i, j]);
  const rig = new Rig(), glass = new Rig(), gb = new Builder();
  rig.part((b) => {
    for (const [i, j] of links) {
      const p = all[i], q = all[j], dd = Math.hypot(q.x - p.x, q.z - p.z), ux = (q.x - p.x) / dd, uz = (q.z - p.z) / dd;
      const a = V(p.x + ux * p.r * 0.96, Math.min(0.9 * S, 0.3 * p.r), p.z + uz * p.r * 0.96), c = V(q.x - ux * q.r * 0.96, Math.min(0.9 * S, 0.3 * q.r), q.z - uz * q.r * 0.96);
      const m = a.clone().lerp(c, 0.5); m.y = 0.12 * S;
      beam(b, a, m, 0.2 * S, rope); beam(b, m, c, 0.2 * S, rope);
      b.ico(0.34 * S, 0, mat(m.x, 0.3 * S, m.z), pale, 1);
    }
  });
  const E = new THREE.Euler(0, 0, 0, 'YXZ');
  F.forEach((f) => {
    f.yc = f.r * 0.35; f.w = R.range(0.5, 0.9); f.ph = R() * TAU; f.yaw = R() * TAU; f.spin = R.range(0.02, 0.07) * (R.chance(0.5) ? 1 : -1);
    f.part = rig.part((b) => {
      // three loops of rope about it, a knot of light wherever two cross; the light inside
      const nm = [];
      for (let k = 0; k < 3; k++) {
        const e = [R() * TAU, R() * TAU, 0];
        b.torus(f.r * 1.02, 0.17 * S, 3, 16, mat(0, 0, 0, e[0], e[1], e[2]), rope);
        nm.push(V(0, 0, 1).applyEuler(E.set(e[0], e[1], e[2], 'YXZ')));
      }
      for (let k = 0; k < 3; k++) {
        const x = new THREE.Vector3().crossVectors(nm[k], nm[(k + 1) % 3]);
        if (x.lengthSq() < 1e-4) continue;
        x.normalize().multiplyScalar(f.r * 1.03);
        for (const q of [-1, 1]) b.ico(0.3 * S, 0, mat(x.x * q, x.y * q, x.z * q), pale, 1);
      }
      b.ico(f.r * 0.27, 1, mat(0, 0, 0), A, PULSE);
    });
    glass.part((b) => b.sphere(f.r, 14, 9, mat(0, 0, 0), 0xffffff, 1));
    pool(gb, f.x, 0.2, f.z, f.r * 2.1, A, 0.4, 12);
  });
  // the pole that marks the net, a lamp at its tip
  const Lp = P.pole;
  pole.part = rig.part((b) => {
    post(b, V(0, -3 * S, 0), V(0, Lp, 0), 0.32 * S, 0.2 * S, 5, TIMBER[1]);
    b.ico(0.95 * S, 1, mat(0, 0.1 * S, 0), STONE[3]);
    for (const f of [0.45, 0.8]) b.cyl(0.36 * S, 0.36 * S, 0.5 * S, 5, mat(0, Lp * f, 0), RIM);
    b.ico(0.55 * S, 0, mat(0, Lp + 0.4 * S, 0), A, PULSE);
  });
  pool(gb, pole.x, 0.2, pole.z, 3 * S, A, 0.3, 10);
  const raft = new THREE.Group(), group = new THREE.Group(), fx = [];
  const body = new THREE.Mesh(rig.build(), mats.glow);
  body.frustumCulled = false;
  raft.add(body);
  rig.set(0, 0, 0, 0);
  const gm = lightMesh(glass.build(), fx, 0.26, { fresnel: 0.9 });
  gm.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.6));
  raft.add(gm);
  raft.add(lightMesh(gb.build(), fx, 0.75));
  const pt = lights(n + 1, A, fx, 1);
  F.forEach((f, i) => { pt.sz[i] = f.r * 2.9; });
  pt.sz[n] = 3.4 * S;
  raft.add(pt.p);
  group.add(raft);
  let span = 0;
  for (const f of all) span = Math.max(span, Math.hypot(f.x, f.z) + f.r * 2.1);
  span += 2.2 * S;
  const p1 = R() * TAU, p2 = R() * TAU, big = F[0];
  return finish({ group, fx, light: V(big.x, big.r * 0.6, big.z), focus: V(0, P.big * 0.7, 0), span, clear: Math.min(95, span + 6), height: Lp + S }, (t, beat, c) => {
    // the whole of it drifting a little, and turning
    raft.rotation.y = t * P.turn;
    raft.position.set(Math.sin(t * 0.043 + p1) * 2.2 * S, 0, Math.sin(t * 0.031 + p2) * 2.2 * S);
    const near = c.near ?? 0;
    for (let i = 0; i < n; i++) {
      const f = F[i], y = f.yc + Math.sin(t * f.w + f.ph) * 0.2 * S, yaw = f.yaw + t * f.spin;
      const pi = Math.sin(t * f.w * 0.7 + f.ph * 2) * 0.05, ro = Math.cos(t * f.w * 0.55 + f.ph) * 0.05;
      rig.set(f.part, f.x, y, f.z, yaw, pi, ro);
      glass.set(i, f.x, y, f.z, yaw, pi, ro);
      pt.pos[i * 3] = f.x; pt.pos[i * 3 + 1] = y; pt.pos[i * 3 + 2] = f.z;
      pt.al[i] = 0.45 + 0.2 * (c.pulse ?? 1) + 0.4 * near;
    }
    rig.set(pole.part, pole.x, Math.sin(t * 0.8 + p1) * 0.2 * S, pole.z, p2, 0.12 + Math.sin(t * 0.6 + p2) * 0.06, Math.sin(t * 0.47 + p1) * 0.06);
    rig.at(pole.part, 0, Lp + 0.4 * S, 0, pt.pos, n * 3);
    pt.al[n] = 0.8;
    rig.done(); glass.done(); pt.touch();
  });
}

// ------------------------------------------------------------------ gauge
function gauge(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), mb = new Builder(), rig = new Rig(), lit = new Lit();
  const round = P.section === 'round', seg = round ? 10 : 4, rot = round ? 0 : Math.PI / 4, rf = round ? 0.5 : 0.7071;
  const markC = mixHex(RIM, A, 0.55), paleA = mixHex(A, 0xffffff, 0.3);
  const ST = [];
  const staff = (z, k, lag) => {
    const H = P.height * k, w = P.width * Math.pow(k, 0.75), kk = Math.pow(k, 0.6), y1 = 2.2 * S * kk;
    const y0 = Math.min(0, ctx.ground(0, z)) - 6;
    // its foot: a pier pointed up- and downstream alike
    b.add(new THREE.CylinderGeometry(1, 1.12, y1 - y0, 6), mat(0, (y1 + y0) / 2, z, 0, 0, 0, w * 1.05, 1, w * 1.9), STONE[1]);
    b.add(new THREE.CylinderGeometry(1, 1, 0.45 * S * kk, 6), mat(0, y1, z, 0, 0, 0, w * 1.14, 1, w * 2.02), mixHex(STONE[3], RIM, 0.35));
    // the staff, narrowing, under a cap
    const sh = new THREE.CylinderGeometry(0.8 * w * rf, w * rf, H - y1, seg);
    sh.rotateY(rot);
    b.add(sh, mat(0, (H + y1) / 2, z), STONE[2]);
    const cap = new THREE.ConeGeometry(0.8 * w * rf * 1.3, 1.6 * S * kk, seg);
    cap.rotateY(rot);
    b.add(cap, mat(0, H + 0.8 * S * kk, z), mixHex(STONE[3], RIM, 0.4));
    // its marks, like a measuring rod's: every so many a long one
    const ym = y1 + 1.6 * S * kk, gap = P.gap * Math.max(0.62, Math.sqrt(k)), n = Math.max(3, Math.floor((H - 1.4 * S * kk - ym) / gap) + 1);
    const ranges = [], th = 0.44 * S * kk;
    for (let m = 0; m < n; m++) {
      const y = ym + m * gap, wy = w * (1 - (0.2 * (y - y1)) / (H - y1)), major = m % P.major === 0, s = mb.pos.length / 3;
      if (round) mb.cyl(wy / 2 + (major ? 0.5 : 0.24) * S * kk, wy / 2 + (major ? 0.5 : 0.24) * S * kk, major ? th * 1.5 : th, 10, mat(0, y, z), markC, 0.05);
      else {
        const Lm = (major ? 0.92 : 0.5) * wy, off = (wy - Lm) / 2 - 0.03 * wy;
        for (const q of [-1, 1]) {
          mb.box(0.36 * S * kk, major ? th * 1.4 : th, Lm, mat(q * (wy / 2 + 0.1 * S * kk), y, z - q * off), markC, 0.05);
          if (P.faces === 4) mb.box(Lm, major ? th * 1.4 : th, 0.36 * S * kk, mat(q * off, y, z + q * (wy / 2 + 0.1 * S * kk)), markC, 0.05);
        }
      }
      ranges.push([s, mb.pos.length / 3]);
    }
    // the collar that rides at the reading, a lamp at each of its corners
    const cw = w + 1.3 * S * kk;
    const part = rig.part((cb) => {
      if (round) cb.torus(cw / 2, 0.42 * S * kk, 5, 12, mat(0, 0, 0, Math.PI / 2, 0, 0), STONE[3]);
      else for (const q of [-1, 1]) {
        cb.box(cw + 0.5 * S * kk, 0.8 * S * kk, 0.5 * S * kk, mat(0, 0, q * cw / 2), STONE[3]);
        cb.box(0.5 * S * kk, 0.8 * S * kk, cw - 0.5 * S * kk, mat(q * cw / 2, 0, 0), STONE[3]);
      }
      for (let q = 0; q < 4; q++) { const a = (q / 4) * TAU + Math.PI / 4, rr = round ? cw / 2 : cw * 0.7071; cb.box(0.62 * S * kk, 0.62 * S * kk, 0.62 * S * kk, mat(Math.cos(a) * rr, 0.62 * S * kk, Math.sin(a) * rr, 0, Math.PI / 4 - a, 0), A, PULSE); }
    });
    const id = ST.length;
    lit.disc(0, 0.2, z, 3.5 * S * kk + H * 0.12, id, paleA, 14);
    ST.push({ z, H, w, kk, n, gap, ym, ranges, part, lag, off: R.range(-0.07, 0.07), ph: R() * TAU, f: 0.5 });
    return H;
  };
  const H = staff(0, 1, 0);
  const sp = Math.min(P.spacing, 60 / Math.max(P.up, P.down));
  let zmax = 0;
  for (const [cnt, q] of [[P.up, 1], [P.down, -1]]) for (let i = 1; i <= cnt; i++) {
    const z = q * i * sp * (1 + (R() - 0.5) * 0.12);
    staff(z, P.small * Math.pow(0.84, i - 1), i * P.lag);
    zmax = Math.max(zmax, Math.abs(z));
  }
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  const mg = mb.build(), mem = mg.attributes.emissive.array;
  group.add(new THREE.Mesh(mg, mats.glow));
  const collars = new THREE.Mesh(rig.build(), mats.glow);
  collars.frustumCulled = false;
  group.add(collars);
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.8));
  const pt = lights(ST.length * 2, A, fx, 1);
  ST.forEach((s, i) => { pt.sz[i * 2] = pt.sz[i * 2 + 1] = 4.2 * S * s.kk; });
  group.add(pt.p);
  const w0 = TAU / P.period, span = Math.max(zmax + P.width * 2.2, H * 0.35);
  return finish({ group, fx, light: V(P.width, H * 0.5, 0), focus: V(0, H * 0.5, 0), span, clear: 0, height: H + 1.7 * S, solid: { r: P.width * 1.3 + 3, top: H + 1.7 * S, low: 0 } }, (t) => {
    for (let i = 0; i < ST.length; i++) {
      const s = ST[i];
      // the reading: climbing and falling slowly, and reaching the farther staffs later
      const f = clamp(0.52 + 0.3 * Math.sin(t * w0 - s.lag) + 0.1 * Math.sin(t * w0 * 2.3 + s.ph) + s.off, 0.05, 0.98), Lv = f * (s.n - 1);
      s.f = f;
      for (let m = 0; m < s.n; m++) {
        const on = clamp(Lv - m + 1, 0, 1), e = Math.max(0.05, on * (0.7 + 0.7 * clamp(1 - (Lv - m) / 3, 0, 1)));
        const [a, c] = s.ranges[m];
        for (let v = a; v < c; v++) mem[v] = e;
      }
      const y = s.ym + Lv * s.gap + 0.85 * S * s.kk;
      rig.set(s.part, 0, y, s.z);
      for (const q of [0, 1]) { const o = (i * 2 + q) * 3; pt.pos[o] = (q ? 1 : -1) * (s.w / 2 + 1.2 * S * s.kk); pt.pos[o + 1] = y; pt.pos[o + 2] = s.z; pt.al[i * 2 + q] = 0.75; }
    }
    mg.attributes.emissive.needsUpdate = true;
    rig.done(); pt.touch();
    for (let v = 0; v < L.n; v++) L.em[v] = Math.max(0.015, (0.12 + 0.5 * ST[L.id[v]].f) * Math.pow(Math.max(0, 1 - L.u[v]), 1.5));
    L.touch();
  });
}

// ------------------------------------------------------------------ lantern boats
function lanternboats(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder();
  const pale = mixHex(A, 0xffffff, 0.4), n = P.n, Lz = Math.min(P.half, 62);
  const rw = ctx.river ? ctx.river.rw : 30, amp = Math.min(P.sway, rw * 0.3);
  // where they set out and where they go out: a post in the water at each end, a pole bent
  // over the middle of the river from it; a lamp hangs lit from the first, dark from the last
  const hp = P.pole, px = P.side * 3.4 * S;
  const posts = [-1, 1].map((q) => {
    const z = q * (Lz + 2.5 * S), y0 = Math.min(0, ctx.ground(px, z)) - 6;
    post(b, V(px, y0, z), V(px, 4.6 * S, z), 0.8 * S, 0.6 * S, 6, STONE[2]);
    b.cyl(0.72 * S, 0.72 * S, 0.5 * S, 6, mat(px, 4.4 * S, z), mixHex(STONE[3], RIM, 0.4));
    const path = [];
    for (let k = 0; k <= 6; k++) { const s = k / 6; path.push(V(px * (1 - Math.pow(s, 1.6)), 4.6 * S + (hp - 4.6 * S) * (1 - (1 - s) * (1 - s)), z)); }
    b.tube(path, (s) => (0.32 - 0.18 * s) * S, 5, RIM);
    b.box(0.14 * S, 1.6 * S, 0.14 * S, mat(0, hp - 0.8 * S, z), RIM);
    b.box(1.2 * S, 1.5 * S, 1.2 * S, mat(0, hp - 2.3 * S, z), q < 0 ? A : STONE[0], q < 0 ? PULSE : 0);
    b.box(1.5 * S, 0.22 * S, 1.5 * S, mat(0, hp - 1.5 * S, z), STONE[3]);
    b.box(1.3 * S, 0.18 * S, 1.3 * S, mat(0, hp - 3.1 * S, z), STONE[3]);
    return z;
  });
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the boats: a low flat hull pointed at both ends, a box of light on it under a dark lid
  const rig = new Rig(), glow = new Rig();
  glow.part((gb) => pool(gb, 0, 0.2, posts[0], 5 * S, A, 0.5));
  const B = Array.from({ length: n }, (_, i) => {
    const u = R.range(0.85, 1.25) * S, steady = R.chance(0.3);
    rig.part((bb) => {
      bb.add(new THREE.CylinderGeometry(1, 0.78, 1, 6), mat(0, 0.15 * u, 0, 0, 0, 0, 0.85 * u, 0.5 * u, 2 * u), STONE[1 + (i % 2)]);
      bb.add(new THREE.CylinderGeometry(1, 1, 1, 6), mat(0, 0.43 * u, 0, 0, 0, 0, 0.9 * u, 0.08 * u, 2.08 * u), mixHex(STONE[3], RIM, 0.55));
      bb.box(1.15 * u, 0.2 * u, 1.15 * u, mat(0, 0.56 * u, 0), TIMBER[1]);
      bb.box(0.95 * u, 1.25 * u, 0.95 * u, mat(0, 1.28 * u, 0), steady ? pale : A, steady ? 1 : PULSE);
      bb.box(1.25 * u, 0.17 * u, 1.25 * u, mat(0, 1.98 * u, 0), STONE[0]);
    });
    glow.part((gb) => pool(gb, 0, 0, 0, 2.7 * u, A, 0.42, 10));
    return { u, u0: (i + R.range(-0.35, 0.35)) / n, v: P.speed * R.range(0.92, 1.08), xo: R.range(-1, 1) * P.spread, ph: R() * TAU, wy: R.range(0.2, 0.45), ya: R.range(0.2, 0.6) };
  });
  const boats = new THREE.Mesh(rig.build(), mats.glow);
  boats.frustumCulled = false;
  group.add(boats);
  group.add(lightMesh(glow.build(), fx, 0.75));
  glow.set(0, 0, 0, 0);
  const pt = lights(n + 1, A, fx, 1);
  B.forEach((o, i) => { pt.sz[i] = 3.3 * o.u; });
  pt.sz[n] = 5 * S;
  pt.pos.set([0, hp - 2.3 * S, posts[0]], n * 3);
  group.add(pt.p);
  const kx = TAU / P.wave, phm = R() * TAU;
  return finish({ group, fx, light: V(0, hp - 2.3 * S, posts[0]), focus: V(0, 2 * S, 0), span: Lz + 4 * S, clear: 0, height: hp + 0.4 * S }, (t, beat, c) => {
    const near = c.near ?? 0;
    for (let i = 0; i < n; i++) {
      const o = B[i], u = frac(o.u0 + (t * o.v) / (2 * Lz)), z = -Lz + u * 2 * Lz;
      // in a long loose line that winds a little; drawn in to the middle where it begins and ends
      const env = smoothstep(0, 0.12, u) * (1 - smoothstep(0.9, 1, u)), s = smoothstep(0, 0.03, u) * (1 - smoothstep(0.97, 1, u));
      const x = (Math.sin(z * kx + phm) * amp + o.xo + Math.sin(t * 0.13 + o.ph) * 0.8 * S) * env;
      const y = Math.sin(t * 0.9 + o.ph) * 0.1 * o.u;
      const yaw = Math.atan(Math.cos(z * kx + phm) * amp * kx * env) + Math.sin(t * o.wy + o.ph) * o.ya;
      rig.set(i, x, y, z, yaw, Math.sin(t * 0.7 + o.ph * 2) * 0.05, Math.cos(t * 0.6 + o.ph) * 0.06, s);
      glow.set(i + 1, x, 0.2, z, 0, 0, 0, s);
      pt.pos[i * 3] = x; pt.pos[i * 3 + 1] = y + 1.28 * o.u * s; pt.pos[i * 3 + 2] = z;
      pt.al[i] = s * (0.5 + 0.5 * near);
    }
    pt.al[n] = 0.9;
    rig.done(); glow.done(); pt.touch();
  });
}

// ------------------------------------------------------------------ fish ladder
function fishladder(d, A, mats, ctx) {
  const P = d.params, S = d.size, b = new Builder(), lit = new Lit(), fx = [];
  const rw = ctx.river ? ctx.river.rw : 30, sg = P.side, dz = P.dir, n = P.n;
  const wP = P.width, ws = 1.9 * S, pitch = Math.min(P.pitch, 104 / n), Lp = pitch + 0.7 * S;
  const waterC = mixHex(WATERC, A, 0.45), lip = mixHex(STONE[3], RIM, 0.4);
  // the pools: each a little higher and farther along, and a little farther into the bank;
  // none lower than the ground under it. (Kept low enough to fly over when the bank allows.)
  const rise = Math.max(0.8 * S, Math.min(P.rise, (24.5 - 5.8 * S) / (n - 1)));
  const maxStep = wP / 2 - 0.7 * S - ws * 0.55, PL = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), want = sg * (rw - 0.9 * wP + i * P.creep + P.bend * f * f);
    const x = i ? PL[i - 1].x + sg * clamp(sg * (want - PL[i - 1].x), 0, maxStep) : want, z = dz * (i - (n - 1) / 2) * pitch;
    let g0 = Infinity, g1 = -Infinity;
    for (const [qx, qz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) { const g = ctx.ground(x + qx * wP / 2, z + qz * Lp / 2); g0 = Math.min(g0, g); g1 = Math.max(g1, g); }
    const h = Math.max(1.3 * S + i * rise, g1 + 0.9 * S, i ? PL[i - 1].h + 0.55 * rise : 0);
    PL.push({ x, z, h, yb: g0 < 0.1 ? -6 : g0 - 1.5 });
  }
  PL.forEach((p, i) => {
    const { x, z, h } = p, zl = z - dz * (Lp / 2 - 0.35 * S), zu = z + dz * (Lp / 2 - 0.35 * S);
    b.box(wP * 0.82, h - 1.7 * S - p.yb, Lp * 0.82, mat(x, (h - 1.7 * S + p.yb) / 2, z), STONE[i % 2]);
    b.box(wP, 0.5 * S, Lp, mat(x, h - 1.45 * S, z), STONE[2]);
    for (const q of [-1, 1]) {
      b.box(0.7 * S, 1.7 * S, Lp, mat(x + q * (wP / 2 - 0.35 * S), h - 0.85 * S, z), STONE[3]);
      b.box((wP - ws) / 2, 1.7 * S, 0.7 * S, mat(x + q * (ws / 2 + (wP - ws) / 4), h - 0.85 * S, zl), STONE[2]);
    }
    b.box(wP, 1.7 * S, 0.7 * S, mat(x, h - 0.85 * S, zu), STONE[2]);
    b.box(ws, 1.0 * S, 0.7 * S, mat(x, h - 1.2 * S, zl), STONE[2]);
    b.box(ws + 0.3 * S, 0.3 * S, 1.3 * S, mat(x, h - 0.78 * S, zl - dz * 0.5 * S), lip);
    // its water, and what spills from it to the one below (the lowest spills into the river)
    const yw = h - 0.5 * S, ix = wP / 2 - 0.7 * S, iz = Lp / 2 - 0.7 * S;
    lit.quad([x - ix, yw, z - iz], [x + ix, yw, z - iz], [x + ix, yw, z + iz], [x - ix, yw, z + iz], i, 0, waterC);
    const yt = h - 0.6 * S, yf = i ? PL[i - 1].h - 0.5 * S : 0.22, zt = zl - dz * 1.0 * S, path = [];
    for (let k = 0; k <= 4; k++) path.push(V(x, yt + (yf - yt) * (k / 4), zt - dz * 0.7 * S * Math.sqrt(k / 4)));
    lit.ribbon(path, ws * 0.42, n + i, waterC, V(1, 0, 0));
  });
  // the stone it all comes from, at the top: a slot of light, and a spout under it
  const tp = PL[n - 1], zs = tp.z + dz * (Lp / 2 + 0.5 * S), top = tp.h + 4.5 * S;
  b.box(2.6 * S, top - tp.yb, 1.3 * S, mat(tp.x, (top + tp.yb) / 2, zs), STONE[3]);
  b.box(3.1 * S, 0.5 * S, 1.8 * S, mat(tp.x, top + 0.25 * S, zs), lip);
  b.box(0.6 * S, 2.4 * S, 0.24 * S, mat(tp.x, tp.h + 2.5 * S, zs - dz * 0.68 * S), A, PULSE);
  b.box(1.0 * S, 0.3 * S, 1.0 * S, mat(tp.x, tp.h + 0.95 * S, zs - dz * 1.0 * S), lip);
  const src = [];
  for (let k = 0; k <= 3; k++) src.push(V(tp.x, tp.h + 0.9 * S - 1.4 * S * (k / 3), zs - dz * (1.5 * S + 0.4 * S * Math.sqrt(k / 3))));
  lit.ribbon(src, 0.4 * S, 2 * n, waterC, V(1, 0, 0));
  const p0 = PL[0], foot = V(p0.x, 0.21, p0.z - dz * (Lp / 2 + 1.4 * S));
  lit.disc(foot.x, 0.21, foot.z, 3.4 * S, 2 * n + 1, mixHex(FOAM, A, 0.3), 12);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.85));
  // the lights that go up it: out of the river, pool by pool, into the stone
  const st = [V(p0.x - sg * wP * 0.3, 0.3, foot.z - dz * 2.5 * S), ...PL.map((p) => V(p.x, p.h - 0.3 * S, p.z)), V(tp.x, tp.h + 2.5 * S, zs - dz * 0.9 * S)];
  const M = st.length, cyc = M - 1 + 0.5, K = P.leapers;
  const pt = lights(K * 3, mixHex(A, 0xffffff, 0.45), fx, 1);
  for (let k = 0; k < K; k++) { pt.sz[k * 3] = 2.4 * S; pt.sz[k * 3 + 1] = 1.5 * S; pt.sz[k * 3 + 2] = 1.0 * S; }
  group.add(pt.p);
  const flash = new Float32Array(n), mid = PL[Math.floor(n / 2)];
  const half = (n * pitch) / 2 + 3 * S, height = top + 0.5 * S;
  let far = 0;
  const clearings = [];
  PL.forEach((p, i) => { far = Math.max(far, Math.hypot(p.x, p.z) + wP); if (i % 2 === 0 || i === n - 1) clearings.push([p.x, p.z, wP * 0.6 + 6]); });
  return finish({
    group, fx, light: V(tp.x, tp.h + 2.5 * S, zs - dz * 2 * S), focus: V(mid.x, mid.h + 1.5 * S, mid.z), span: half, clear: 0, clearings, height,
    solid: height > 25 ? { r: far, top: height, low: 0 } : undefined,
  }, (t) => {
    flash.fill(0);
    for (let k = 0; k < K; k++) {
      const s = (t * P.rate + (k * cyc) / K) % cyc, m = Math.floor(s), f = s - m;
      for (let j = 0; j < 3; j++) {
        const o = (k * 3 + j) * 3;
        if (m >= M - 1) { pt.al[k * 3 + j] = 0; continue; }
        // waiting in its pool, turning; then the leap to the next
        const a = st[m], c = st[m + 1], e = clamp((f - 0.5) / 0.5 - j * 0.09, 0, 1);
        if (e <= 0) {
          const ang = t * 1.3 + k * 2.1 - j * 0.5;
          pt.pos[o] = a.x + Math.cos(ang) * 0.9 * S; pt.pos[o + 1] = a.y; pt.pos[o + 2] = a.z + Math.sin(ang) * 0.9 * S;
          pt.al[k * 3 + j] = (m === 0 ? Math.min(1, f * 3) : 1) * [0.6, 0.3, 0.15][j];
        } else {
          const hj = 1.5 * S + 0.4 * Math.abs(c.y - a.y);
          pt.pos[o] = a.x + (c.x - a.x) * e; pt.pos[o + 1] = a.y + (c.y - a.y) * e + 4 * hj * e * (1 - e); pt.pos[o + 2] = a.z + (c.z - a.z) * e;
          pt.al[k * 3 + j] = [1, 0.55, 0.3][j];
        }
      }
      if (m >= 1 && m <= n && f < 0.5) flash[m - 1] = Math.max(flash[m - 1], Math.exp(-f * 7));
    }
    pt.touch();
    for (let v = 0; v < L.n; v++) {
      const id = L.id[v], u = L.u[v];
      if (id < n) L.em[v] = 0.3 + 0.55 * flash[id] + 0.06 * Math.sin(t * 0.9 + id * 1.9);
      else if (id <= 2 * n) L.em[v] = 0.28 + 0.5 * (0.5 + 0.5 * Math.sin((u * 2.2 - t * 1.3) * TAU + id * 1.7));
      else L.em[v] = Math.max(0.015, 0.5 * Math.pow(Math.max(0, 1 - u), 1.5));
    }
    L.touch();
  });
}

export const SET = {
  buoys: {
    code: 'BUY', cls: 'Signal buoys', nouns: ['Buoys', 'Relay', 'Moorings', 'Chain', 'Watch', 'Lamps'], place: 'lake',
    kin: ['archipelago', 'murmuration', 'choir'], voice: ['chirp', 'glass'],
    params(R, size) {
      const P = {
        n: R.int(7, 21), radius: R.range(15, 23) * size, squash: R.range(0.55, 1), turn: R.range(0, TAU),
        kind: R.pick(['can', 'nun', 'spar']), mast: R.range(4.5, 8) * size, step: R.pick([0.6, 0.8, 1, 1.25, 1.5]), rest: R.int(2, 5),
      };
      const word = { can: 'drum', nun: 'cone', spar: 'spar' }[P.kind];
      P.text = `${P.n} ${word} buoys riding the lake, a lamp on each; lines of light in the water join each to its nearest, and the lamps blink in turn, one every ${P.step} seconds, as if passing something along.`;
      return P;
    },
    build: buoys,
  },
  stilthouse: {
    code: 'STL', cls: 'Stilt house', nouns: ['House', 'Hut', 'Jetty', 'Lodging', 'Window', 'Stilts'], place: 'lake',
    kin: ['watcher', 'nest', 'temple'], voice: ['breath', 'fm'],
    params(R, size) {
      const P = {
        deck: R.range(9, 15) * size, w: R.range(6.5, 9) * size, d: R.range(5.5, 7.5) * size, wall: R.range(3.8, 4.8) * size, roof: R.range(2.4, 4.6) * size,
        kind: R.pick(['gable', 'gable', 'hip', 'shed']), px: R.int(2, 3), pz: R.int(2, 3), access: R.pick(['ladder', 'stair']),
        jetty: R.range(10, 18) * size, pole: R.range(5, 7.5) * size, face: R.pick(['jetty', 'side', 'far']), boatSide: R.pick([-1, 1]), line: R.range(3.5, 6) * size,
      };
      P.text = `A hut of dark timber ${Math.round(P.deck)} meters over the lake on ${numw(P.px * P.pz).toLowerCase()} piles, a ${P.access} down to a jetty ${Math.round(P.access === 'stair' ? P.jetty * 0.6 : P.jetty)} meters long with a lamp at its end. One window is lit; a rowing boat swings on its line below.`;
      return P;
    },
    build: stilthouse,
  },
  reeds: {
    code: 'RED', cls: 'Giant reeds', nouns: ['Reeds', 'Rushes', 'Reedbed', 'Stand', 'Thicket', 'Sedge'], place: 'lake',
    kin: ['corolla', 'murmuration', 'tree'], voice: ['breath', 'grains'],
    params(R, size) {
      const ring = R.chance(0.45);
      const P = {
        n: R.int(22, 50), radius: R.range(12, 19) * size, shape: ring ? 'ring' : 'crescent', arc: ring ? TAU : R.range(3.2, 4.9),
        height: clamp(R.range(21, 30) * Math.sqrt(size), 20, 36), head: R.pick(['cattail', 'plume', 'bead']), rows: R.chance(0.35) ? 2 : 1,
        waves: R.int(2, 4), lobes: R.int(2, 5), period: R.range(14, 26), sway: R.range(0.06, 0.1), motes: R.int(40, 90),
      };
      const head = { cattail: 'dark clubs', plume: 'plumes', bead: 'strings of three beads' }[P.head];
      P.text = `${P.n} reeds up to ${Math.round(P.height)} meters tall standing in the lake in a ${P.shape} ${Math.round(P.radius * 2)} meters across, their seed-heads (${head}) lit. They sway in ${numw(P.waves).toLowerCase()} slow waves, and lean away from whatever passes close.`;
      return P;
    },
    build: reeds,
  },
  sunkenbell: {
    code: 'BEL', cls: 'Sunken bell', nouns: ['Bell', 'Toll', 'Knell', 'Crown', 'Peal', 'Tocsin'], place: 'lake',
    kin: ['halo', 'tidegate', 'cathedral'], voice: ['whale', 'glass'],
    params(R, size) {
      const mouth = R.range(17, 24) * size;
      const P = {
        mouth, tall: R.range(1.9, 2.4), rise: mouth * R.range(0.55, 0.72), tilt: R.range(0.3, 0.55), marks: R.int(12, 36), major: R.pick([2, 3, 4, 5]),
        canons: R.pick([4, 6]), yoke: R.range(0, Math.PI), rings: R.int(3, 6), every: R.pick([2, 3, 4]), reach: Math.min(62, R.range(38, 52) * size),
      };
      P.text = `The crown and shoulder of a bell ${Math.round(mouth * 2)} meters across at the mouth, sunk in the lake at a tilt of ${Math.round((P.tilt * 180) / Math.PI)} degrees; ${P.marks} marks about its shoulder. A ring of light leaves it every ${numw(P.every).toLowerCase()} beats and is gone ${Math.round(P.reach)} meters out.`;
      return P;
    },
    build: sunkenbell,
  },
  glassfloats: {
    code: 'FLT', cls: 'Glass floats', nouns: ['Floats', 'Net', 'Catch', 'Glass', 'Raft', 'Drift'], place: 'lake',
    kin: ['geode', 'archipelago', 'chandelier'], voice: ['glass', 'grains'],
    params(R, size) {
      const P = {
        n: R.int(5, 13), big: R.range(3.2, 4) * size, loose: R.range(0.1, 0.5), pole: R.range(9, 14) * size,
        turn: R.range(0.008, 0.02) * R.pick([-1, 1]),
      };
      P.text = `${numw(P.n)} glass floats, the greatest ${Math.round(P.big * 2)} meters across, gathered in a ${P.loose > 0.3 ? 'slack' : 'close'} net of dark rope with a marker pole ${Math.round(P.pole)} meters tall; a light in each, and the net's knots are small lights. They drift, and turn.`;
      return P;
    },
    build: glassfloats,
  },
  gauge: {
    code: 'GAG', cls: 'River gauge', nouns: ['Gauge', 'Staff', 'Measure', 'Rod', 'Reading', 'Mark'], place: 'river',
    kin: ['spire', 'spine', 'tidegate'], voice: ['fm', 'chirp'],
    params(R, size) {
      const P = {
        height: R.range(30, 44) * size, width: R.range(2.6, 3.6) * size, section: R.pick(['square', 'square', 'round']), faces: R.pick([2, 4]),
        gap: R.range(1.6, 2.4) * size, major: R.pick([3, 4, 5, 6]), up: R.int(1, 4), down: R.int(1, 4), small: R.range(0.4, 0.5),
        spacing: R.range(14, 20) * size, lag: R.range(0.35, 0.9), period: R.range(24, 46),
      };
      const k = P.up + P.down;
      P.text = `A ${P.section} staff of stone ${Math.round(P.height)} meters tall in mid-river, marked like a measuring rod, every ${['', '', '', 'third', 'fourth', 'fifth', 'sixth'][P.major]} mark a long one; its marks are lit as far up as it reads, and the reading climbs and falls. ${numw(k)} smaller staffs stand up- and downstream, each reading a little later.`;
      return P;
    },
    build: gauge,
  },
  lanternboats: {
    code: 'LBT', cls: 'Lantern flotilla', nouns: ['Flotilla', 'Lanterns', 'Procession', 'Fleet', 'Wake', 'Drift'], place: 'river',
    kin: ['serpent', 'murmuration', 'pyre'], voice: ['breath', 'glass'],
    params(R, size) {
      const P = {
        n: R.int(13, 55), half: Math.min(62, R.range(40, 58) * size), speed: R.range(1.6, 3.2), sway: R.range(2, 6) * size, wave: R.range(45, 90),
        spread: R.range(1.2, 3.2) * size, pole: R.range(8.5, 12) * size, side: R.pick([-1, 1]),
      };
      P.text = `${P.n} paper-lantern boats drifting down the river in a line ${Math.round(P.half * 2)} meters long, a box of light on each. Where the first goes out under a dark lamp, another sets out under a lit one, ${Math.round(P.pole)} meters over the water.`;
      return P;
    },
    build: lanternboats,
  },
  fishladder: {
    code: 'LAD', cls: 'Fish ladder', nouns: ['Ladder', 'Stair', 'Cascade', 'Pools', 'Weir', 'Ascent'], place: 'river',
    kin: ['tidegate', 'helicon', 'serpent'], voice: ['grains', 'chirp'],
    params(R, size) {
      const P = {
        n: R.int(7, 13), width: R.range(5, 7) * size, pitch: R.range(5.2, 7) * size, rise: R.range(1.5, 2.4) * size, creep: R.range(0.3, 1.1) * size,
        bend: R.range(0, 6) * size, side: R.pick([-1, 1]), dir: R.pick([-1, 1]), leapers: R.int(3, 7), rate: R.range(0.28, 0.5),
      };
      P.text = `A stair of ${numw(P.n).toLowerCase()} stone pools climbing the bank beside the river, each ${Math.round(P.width)} meters wide. Water of light spills from each to the next; ${numw(P.leapers).toLowerCase()} small lights leap up it from pool to pool, one after another, against the flow.`;
      return P;
    },
    build: fishladder,
  },
};
