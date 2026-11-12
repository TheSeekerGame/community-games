import * as THREE from 'three';
import { Builder, mat, mul } from '../../render/build.js';
import { glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp, smoothstep } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam } from '../parts.js';

// The Great Lake's own families, COMMON to RARE (the higher tiers: greatlake2.js). A lake
// to the horizon, dark and still, wooded islands in it, fog over it: each stands in it,
// rides on it or hangs over it, the origin on the water's surface (y = 0).
//   drownedgrove   COMMON    dead spruces standing in the lake, bleached grey; a few lights
//                            perch in their branches, and the one that has sat longest
//                            flies to another snag, one after another
//   weir           COMMON    a fish weir of stakes and wattle wound in a spiral, a lamp on a
//                            pole at its heart; lights swim in at its mouth and wind inward,
//                            the lamp brighter for each, and now and then it lets them go
//   chimneys       COMMON    the chimneys of a drowned village standing out of the lake, the
//                            roof ridges just breaking it; smoke of light goes up from one
//                            chimney at a time, and the windows under the water light below it
//   turningisland  UNCOMMON  a perfectly round wooded island cut clean from the lake, turning
//                            once in minutes; the lamp on its edge wakes each post standing
//                            in the water round it as it passes
//   standingwave   UNCOMMON  a ring of the lake standing up in a wall of water that holds a
//                            standing wave: crests rise as others fall, posts stand at the
//                            nodes where it never moves, spray leaves each crest at its height
//   drownedtower   RARE      a round tower standing out of the lake, leaning, its top broken
//                            open, its windows winding up it and on down under the water;
//                            lights come up out of the lake, climb it window by window and
//                            leave by the top into the fog
//   liftedlens     RARE      a lens of the lake's water hanging in the air, drawn up to it by
//                            a climbing thread of water; its face trembles in drum modes and
//                            it rains from its rim back into the lake
//
// (The water is drawn solid: what lies "under the surface" is laid a hand's breadth over
// it, dim, and reads as lying in it.)

const TIMBER = [0x2c2622, 0x3d3530];
const WATERC = 0xbcd6de, WATERD = 0x1c2a31;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen'];
const numw = (n) => NUMW[n] || String(n);
const low = (n) => numw(n).toLowerCase();
const frac = (x) => x - Math.floor(x);
const mod = (a, n) => ((a % n) + n) % n;
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
// soft points of light: n of them, placed, sized (meters across) and dimmed by the caller
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
  return {
    p, pos, sz, al,
    touch(size = false) {
      g.attributes.position.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      if (size) g.attributes.aSize.needsUpdate = true;
    },
  };
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
    const r = rad(i), ring = [];
    for (let k = 0; k < seg; k++) { const a = turn + (k / seg) * TAU; ring.push([pts[i].x + Math.cos(a) * r, pts[i].y, pts[i].z + Math.sin(a) * r]); }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    const col = color(i);
    for (let k = 0; k < seg; k++) {
      const am = turn + ((k + 0.5) / seg) * TAU, k1 = (k + 1) % seg;
      face(b, [rings[i][k], rings[i][k1], rings[i + 1][k1], rings[i + 1][k]], [Math.cos(am), 0, Math.sin(am)], col);
    }
  }
}
// a body of revolution about the y axis from a profile [[r, y, color], ...] (outside out)
function revolve(b, prof, seg) {
  for (let j = 0; j < prof.length - 1; j++) {
    const [r0, y0, col] = prof[j], [r1, y1] = prof[j + 1];
    const nr = y1 - y0, ny = -(r1 - r0);
    for (let k = 0; k < seg; k++) {
      const f0 = (k / seg) * TAU, f1 = ((k + 1) / seg) * TAU, fm = (f0 + f1) / 2;
      const c0 = Math.cos(f0), s0 = Math.sin(f0), c1 = Math.cos(f1), s1 = Math.sin(f1);
      const hint = [Math.cos(fm) * nr, ny, Math.sin(fm) * nr];
      const q = [[c0 * r0, y0, s0 * r0], [c1 * r0, y0, s1 * r0], [c1 * r1, y1, s1 * r1], [c0 * r1, y1, s0 * r1]];
      face(b, r1 < 1e-4 ? [q[0], q[1], [0, y1, 0]] : q, hint, typeof col === 'function' ? col(k) : col);
    }
  }
}
// a roof: a ridge along z over a rectangle W wide (x) and D long, h high, its eaves at y0
function roof(b, cx, y0, cz, W, D, h, c0, c1) {
  const xl = cx - W / 2, xr = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  const A1 = [xl, y0, z0], A2 = [xr, y0, z0], A3 = [cx, y0 + h, z0], B1 = [xl, y0, z1], B2 = [xr, y0, z1], B3 = [cx, y0 + h, z1];
  face(b, [A1, A3, B3, B1], [-1, 0.3, 0], c0);
  face(b, [A2, A3, B3, B2], [1, 0.3, 0], c1);
  face(b, [A1, A2, A3], [0, 0, -1], c0);
  face(b, [B1, B2, B3], [0, 0, 1], c0);
}

// Rigid parts merged into one geometry and moved by hand (as in waters.js): set() turns
// a part (yaw, then pitch, then roll), scales it and puts it in its place.
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
  // a ribbon along a path, spread along `side`
  ribbon(path, halfW, id, color, side) {
    const n = path.length, L = [], Rt = [];
    for (let i = 0; i < n; i++) {
      const p = path[i], w = typeof halfW === 'function' ? halfW(i / (n - 1)) : halfW;
      L.push([p.x - side.x * w, p.y - side.y * w, p.z - side.z * w]);
      Rt.push([p.x + side.x * w, p.y + side.y * w, p.z + side.z * w]);
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
  // a flat ring between radii r0 and r1, cut in seg pieces, each its own id (id0 + k); u 0 inner, 1 outer
  annulus(x, y, z, r0, r1, seg, id0, color) {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const i0 = [x + c0 * r0, y, z + s0 * r0], o0 = [x + c0 * r1, y, z + s0 * r1], o1 = [x + c1 * r1, y, z + s1 * r1], i1 = [x + c1 * r0, y, z + s1 * r0];
      this.tri(i0, o0, o1, id0 + k, 0, 1, 1, color);
      this.tri(i0, o1, i1, id0 + k, 0, 1, 0, color);
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
// emissive of the vertices [s, e) of a built geometry
const setEm = (arr, r, v) => { for (let i = r[0]; i < r[1]; i++) arr[i] = v; };
const range = (b, fn) => { const s = b.pos.length / 3; fn(); return [s, b.pos.length / 3]; };

// ------------------------------------------------------------------ drowned grove
function drownedgrove(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), bb = new Builder(), lit = new Lit();
  const BL = [mixHex(STONE[3], RIM, 0.42), mixHex(STONE[3], RIM, 0.58)], WET = mixHex(STONE[1], RIM, 0.12);
  // where they stand: scattered, none too near another; the tallest nearest the middle
  const at = [];
  let gap = 4.2 * S;
  for (let tries = 0; at.length < P.n && tries < 5000; tries++) {
    if (tries % 60 === 59) gap *= 0.92;
    const a = R() * TAU, r = Math.sqrt(R()) * P.radius;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * P.squash;
    if (at.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
    at.push({ x, z });
  }
  at.sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  const cands = [];
  let top = 0, span = 0;
  at.forEach((p, i) => {
    const fallen = i > 0 && R.chance(0.16);
    const h = P.height * (i === 0 ? 1 : (1 - (0.38 * Math.hypot(p.x, p.z)) / P.radius) * R.range(0.68, 1)) * (fallen ? 0.72 : 1);
    const la = R() * TAU, tl = Math.tan(fallen ? R.range(0.16, 0.3) : R.range(0.01, 0.06));
    const off = (y) => [p.x + Math.cos(la) * tl * Math.max(0, y), p.z + Math.sin(la) * tl * Math.max(0, y)];
    const r0 = R.range(0.55, 0.8) * S * Math.sqrt(h / P.height + 0.3), tone = i % 2;
    // the trunk: wet and dark a little way up from the water, bleached above
    const ys = [-6, 0, 1.3 * S];
    for (let k = 1; k <= 6; k++) ys.push(1.3 * S + ((h - 1.3 * S) * k) / 6);
    const pts = ys.map((y) => { const [x, z] = off(y); return V(x, y, z); });
    stem(b, pts, (k) => Math.max(0.07 * S, r0 * (ys[k] < 0 ? 1.1 : 1 - 0.88 * Math.pow(ys[k] / h, 0.85))), 5, (k) => (k < 2 ? WET : BL[tone]), la);
    // the stubs of its branches, in whorls, drooping; the longest low down
    for (let y = 0.22 * h; y < 0.93 * h; y += R.range(1.4, 2.0) * S) {
      // (always drooping, and only one to a whorl near the top, so no snag ever reads as a cross)
      const nb = y > 0.7 * h ? 1 : R.int(1, 3), [sx, sz] = off(y);
      for (let q = 0; q < nb; q++) {
        const a = R() * TAU, dr = R.range(0.35, 0.7), Ls = (0.5 + 3.2 * Math.pow(1 - y / h, 1.2)) * S * R.range(0.6, 1.1);
        const e = V(sx + Math.cos(a) * Math.cos(dr) * Ls, y - Math.sin(dr) * Ls, sz + Math.sin(a) * Math.cos(dr) * Ls);
        beam(b, V(sx, y, sz), e, (Ls > 2 * S ? 0.2 : 0.15) * S, BL[1 - tone]);
        if (y > 0.42 * h && Ls > 1 * S) cands.push({ x: e.x, y: e.y + 0.5 * S, z: e.z, snag: i });
        span = Math.max(span, Math.hypot(e.x, e.z) + 2 * S);
      }
    }
    // its top: broken off in splinters, or thinning to a spike
    const [tx, tz] = off(h);
    if (R.chance(0.55)) {
      for (let q = 0; q < 3; q++) beam(b, V(tx, h - 0.4 * S, tz), V(tx + R.range(-0.5, 0.5) * S, h + R.range(0.4, 1.5) * S, tz + R.range(-0.5, 0.5) * S), 0.14 * S, BL[tone]);
      top = Math.max(top, h + 1.6 * S);
    } else {
      const [ux, uz] = off(h + 2.2 * S);
      post(b, V(tx, h - 0.1, tz), V(ux, h + 2.2 * S, uz), 0.1 * S, 0.02 * S, 4, BL[tone]);
      top = Math.max(top, h + 2.2 * S);
    }
    cands.push({ x: tx, y: h + 0.4 * S, z: tz, snag: i });
    lit.disc(p.x, 0.18, p.z, 2.8 * S, i, A, 10);
    p.h = h;
  });
  // a few that fell, lying half sunk, the plate of their roots standing up out of the water
  for (let j = 0; j < P.logs; j++) {
    const a = R() * TAU, r = R.range(0.35, 1) * P.radius, x = Math.cos(a) * r, z = Math.sin(a) * r * P.squash, yaw = R() * TAU, L = R.range(7, 12) * S;
    b.cyl(0.45 * S, 0.36 * S, L, 6, mat(x, 0.05 * S, z, 0, yaw, Math.PI / 2), BL[j % 2]);
    const ex = x - Math.cos(yaw) * L * 0.5, ez = z + Math.sin(yaw) * L * 0.5;
    b.cyl(1.5 * S, 1.2 * S, 0.6 * S, 7, mat(ex, 0.4 * S, ez, 0, yaw, Math.PI / 2), WET);
    span = Math.max(span, Math.hypot(x, z) + L / 2 + 1.5 * S);
  }
  // where the lights may perch: the ends of the upper stubs, and the tops
  for (let q = cands.length - 1; q > 0; q--) { const o = Math.floor(R() * (q + 1)); [cands[q], cands[o]] = [cands[o], cands[q]]; }
  const PR = cands.slice(0, Math.max(P.lights + 3, Math.min(P.perches, cands.length)));
  const M = PR.length, K = Math.min(P.lights, M - 2);
  const beadR = PR.map((p) => range(bb, () => bb.ico(0.42 * S, 0, mat(p.x, p.y - 0.4 * S, p.z), A, 0.06)));
  // the order they go in: no light ever flies to a perch that is taken
  const Q = 120, seq = [];
  for (let i = 0; i < Q; i++) {
    const near = seq.slice(-K - 1), wrap = i >= Q - K - 1 ? seq.slice(0, K + 1 - (Q - i)) : [];
    let c = Math.floor(R() * M);
    for (let q = 0; q < 60 && (near.includes(c) || wrap.includes(c)); q++) c = Math.floor(R() * M);
    if (near.includes(c)) c = [...Array(M).keys()].find((x) => !near.includes(x));
    seq.push(c);
  }
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  const bg = bb.build(), bem = bg.attributes.emissive.array;
  group.add(new THREE.Mesh(bg, mats.glow));
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.8));
  const pt = lights(K, mixHex(A, 0xffffff, 0.3), fx, 1);
  pt.sz.fill(3.4 * S);
  group.add(pt.p);
  const FLY = Math.min(3, P.step * 0.6), occ = new Float32Array(M), lit0 = new Float32Array(at.length), t0 = at[0];
  return finish({
    group, fx, light: V(t0.x, t0.h * 0.75, t0.z), focus: V(0, P.height * 0.45, 0), span, clear: Math.min(95, span + 6), height: top,
    solid: { r: P.radius * 0.8, top, low: 0 },
  }, (t) => {
    const st = t / P.step, s = Math.floor(st), f = (st - s) * P.step;
    occ.fill(0.06); lit0.fill(0);
    for (let j = 0; j < K; j++) {
      const to = PR[seq[mod(s - j, Q)]];
      let x = to.x, y = to.y + Math.sin(t * 1.3 + j * 2) * 0.12 * S, z = to.z;
      if (j === 0 && f < FLY) {
        // the oldest leaves its perch and flies to a new one, in a low arc
        const fi = seq[mod(s - K, Q)], fr = PR[fi], e = smoothstep(0, 1, f / FLY), dd = Math.hypot(to.x - fr.x, to.z - fr.z);
        x = fr.x + (to.x - fr.x) * e; z = fr.z + (to.z - fr.z) * e;
        y = fr.y + (to.y - fr.y) * e + Math.sin(Math.PI * e) * (2 * S + 0.2 * dd);
        occ[fi] = Math.max(occ[fi], 0.06 + 1.3 * (1 - e) * (1 - e));
        occ[seq[mod(s, Q)]] = Math.max(occ[seq[mod(s, Q)]], 0.06 + 1.3 * e * e * e);
      } else { occ[seq[mod(s - j, Q)]] = 1.4; lit0[to.snag] += 1; }
      pt.pos[j * 3] = x; pt.pos[j * 3 + 1] = y; pt.pos[j * 3 + 2] = z;
      pt.al[j] = 0.85;
    }
    for (let i = 0; i < M; i++) setEm(bem, beadR[i], occ[i]);
    bg.attributes.emissive.needsUpdate = true;
    pt.touch();
    for (let v = 0; v < L.n; v++) L.em[v] = Math.max(0.015, (0.04 + 0.4 * Math.min(1, lit0[L.id[v]])) * Math.pow(Math.max(0, 1 - L.u[v]), 1.5));
    L.touch();
  });
}

// ------------------------------------------------------------------ spiral weir
function weir(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), lit = new Lit();
  const r0 = 2.8 * S, thM = P.turns * TAU, bs = (P.radius - r0) / thM, pitch = TAU * bs;
  const a0 = R() * TAU, sg = P.dir, WATTLE = mixHex(TIMBER[1], STONE[2], 0.5), BIND = mixHex(TIMBER[1], RIM, 0.45);
  const XZ = (rr, ang) => [rr * Math.cos(a0 + sg * ang), rr * Math.sin(a0 + sg * ang)];
  // the stakes, wound outward from the heart, highest at the heart; wattle woven between
  let th = 0.3, prev = null, k = 0;
  while (th <= thM) {
    const rr = r0 + bs * th, [x, z] = XZ(rr, th);
    const h = P.high + (P.low - P.high) * (th / thM) + (R() - 0.5) * 0.7 * S;
    post(b, V(x, -4, z), V(x, h, z), 0.26 * S, 0.17 * S, 5, TIMBER[k % 2]);
    if (prev) {
      const dx = x - prev.x, dz = z - prev.z, Lw = Math.hypot(dx, dz), wh = Math.min(h, prev.h) * 0.52, yaw = -Math.atan2(dz, dx);
      b.box(Lw, wh + 0.4, 0.22 * S, mat((x + prev.x) / 2, (wh - 0.4) / 2, (z + prev.z) / 2, 0, yaw, 0), k % 2 ? TIMBER[0] : WATTLE);
      b.box(Lw, 0.18 * S, 0.32 * S, mat((x + prev.x) / 2, wh + 0.05, (z + prev.z) / 2, 0, yaw, 0), BIND);
    }
    prev = { x, z, h };
    th += P.gap / Math.hypot(rr, bs);
    k++;
  }
  // a taller stake marks the mouth
  const [mx, mz] = XZ(P.radius + 0.6 * S, thM + 0.08);
  post(b, V(mx, -4, mz), V(mx, P.low + 3.2 * S, mz), 0.32 * S, 0.22 * S, 6, TIMBER[1]);
  b.cone(0.4 * S, 0.9 * S, 6, mat(mx, P.low + 3.65 * S, mz), BIND);
  // the pole at the heart and its lamp
  const Hp = P.pole;
  post(b, V(0, -5, 0), V(0, Hp, 0), 0.5 * S, 0.3 * S, 6, STONE[2]);
  // (the lamp sits on the pole's head in a small cage: nothing crosses the pole)
  b.box(1.5 * S, 0.22 * S, 1.5 * S, mat(0, Hp + 0.05 * S, 0), STONE[3]);
  b.box(1.1 * S, 1.4 * S, 1.1 * S, mat(0, Hp + 0.85 * S, 0), A, PULSE);
  for (let q = 0; q < 4; q++) { const a = (q / 4) * TAU + Math.PI / 4; b.box(0.14 * S, 1.5 * S, 0.14 * S, mat(Math.cos(a) * 0.72 * S, Hp + 0.85 * S, Math.sin(a) * 0.72 * S), TIMBER[1]); }
  b.cone(1.1 * S, 0.9 * S, 4, mat(0, Hp + 2.0 * S, 0, 0, Math.PI / 4, 0), STONE[3]);
  lit.disc(0, 0.18, 0, r0 * 1.3, 0, A, 16);
  // the way in: from the open lake to the mouth, down the corridor between the turns, into the heart
  const rc = (phi) => r0 + bs * (phi - Math.PI), raw = [];
  const m0 = XZ(rc(thM), thM), m1 = XZ(rc(thM - 0.02), thM - 0.02), ml = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]);
  const ux = (m1[0] - m0[0]) / ml, uz = (m1[1] - m0[1]) / ml;
  for (let q = 0; q < 12; q++) raw.push([m0[0] - ux * (12 - q) * S, m0[1] - uz * (12 - q) * S]);
  for (let phi = thM; phi > Math.PI; phi -= 0.4 / Math.max(rc(phi), 1)) raw.push(XZ(rc(phi), phi));
  const rh = r0 * 0.62, phE = Math.PI - 1.4;
  for (let q = 0; q <= 10; q++) { const phi = Math.PI - (q / 10) * 1.4; raw.push(XZ(r0 + (rh - r0) * (q / 10), phi)); }
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const Ltot = cum[cum.length - 1];
  const along = (s, out) => {
    if (s >= Ltot) { const [x, z] = XZ(rh, phE - (s - Ltot) / rh); out[0] = x; out[1] = z; return; }
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const f = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    out[0] = raw[lo][0] + (raw[hi][0] - raw[lo][0]) * f; out[1] = raw[lo][1] + (raw[hi][1] - raw[lo][1]) * f;
  };
  // the fish: in at the mouth one after another, all of them home by three quarters of the cycle
  const Tc = P.period, K = P.fish, vmin = Math.max(P.speed, Ltot / (0.36 * Tc)), Trel = 7;
  const F = Array.from({ length: K }, (_, i) => ({ e: 3 + (i + R() * 0.3) * ((0.4 * Tc) / K), v: vmin * R.range(1, 1.15), ph: R() * TAU }));
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.85));
  const pt = lights(K * 3 + 1, mixHex(A, 0xffffff, 0.4), fx, 1);
  for (let i = 0; i < K; i++) { pt.sz[i * 3] = 2.2 * S; pt.sz[i * 3 + 1] = 1.5 * S; pt.sz[i * 3 + 2] = 1.0 * S; }
  pt.pos.set([0, Hp + 0.85 * S, 0], K * 9);
  group.add(pt.p);
  const o = [0, 0], span = P.radius + 1.5 * S;
  return finish({
    group, fx, light: V(0, Hp + 0.85 * S, 0), focus: V(0, P.high * 0.6, 0), span, clear: Math.min(95, span + 6), height: Hp + 2.5 * S,
    solid: { r: P.radius, top: P.high, low: 0 },
  }, (t) => {
    const tc = mod(t, Tc), rel = tc > Tc - Trel ? (tc - (Tc - Trel)) / Trel : 0;
    let home = 0;
    for (let i = 0; i < K; i++) {
      const fi = F[i], s = (tc - fi.e) * fi.v;
      if (s > Ltot) home++;
      for (let j = 0; j < 3; j++) {
        const sj = s - j * 1.0 * S, w = i * 3 + j;
        if (sj < 0) { pt.al[w] = 0; continue; }
        along(sj, o);
        let x = o[0], z = o[1], y = 0.35 + Math.sin(t * 2.1 + fi.ph) * 0.08;
        let a = [1, 0.5, 0.25][j] * Math.min(1, sj / (6 * S));
        if (rel > 0) { x *= 1 + rel * 1.5; z *= 1 + rel * 1.5; y += rel * rel * 16 * S; a *= 1 - rel; }
        pt.pos[w * 3] = x; pt.pos[w * 3 + 1] = y; pt.pos[w * 3 + 2] = z;
        pt.al[w] = a;
      }
    }
    const g = home / K, flare = rel > 0 ? Math.sin(Math.PI * rel) : 0;
    pt.al[K * 3] = 0.25 + 0.6 * g + 0.6 * flare;
    pt.sz[K * 3] = (4 + 4 * g + 4 * flare) * S;
    pt.touch(true);
    for (let v = 0; v < L.n; v++) L.em[v] = Math.max(0.015, (0.06 + 0.45 * g + 0.4 * flare) * Math.pow(Math.max(0, 1 - L.u[v]), 1.5));
    L.touch();
  });
}

// ------------------------------------------------------------------ drowned village
function chimneys(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), fb = new Builder(), lit = new Lit();
  const CHIM = [mixHex(0x3a2b26, STONE[2], 0.45), mixHex(0x33282a, STONE[1], 0.4)], BAND = mixHex(STONE[3], RIM, 0.3), POT = 0x4a3a33;
  const ROOF = [STONE[1], STONE[2]], RIDGE = mixHex(STONE[3], RIM, 0.35);
  const yaw0 = R() * TAU, cy = Math.cos(yaw0), sy = Math.sin(yaw0);
  const CH = [], H = [];
  let span = 0, top = 0;
  for (let i = 0; i < P.n; i++) {
    const lx = (i - (P.n - 1) / 2) * P.spacing + R.range(-1, 1) * S;
    const lz = (P.rows === 2 ? (i % 2 ? 1 : -1) * P.street : R.range(-1.5, 1.5) * S) + (P.bend * lx * lx) / 100;
    const x = lx * cy - lz * sy, z = lx * sy + lz * cy;
    const hy = Math.PI / 2 - yaw0 + R.range(-0.12, 0.12) + (R.chance(0.2) ? Math.PI / 2 : 0);
    const Mh = mat(x, 0, z, 0, hy, 0);
    const W = R.range(5.5, 7) * S, D = R.range(6.5, 8.5) * S, Hr = W * R.range(0.42, 0.55), hr = R.range(-0.4, 2.4) * S, y0 = hr - Hr;
    const hb = new Builder();
    // the roof, all but its ridge under the water
    roof(hb, 0, y0, 0, W, D, Hr, ROOF[i % 2], ROOF[1 - (i % 2)]);
    if (hr > 0) hb.box(0.35 * S, 0.35 * S, D + 0.2 * S, mat(0, hr, 0), RIDGE);
    // its chimneys
    const nc = R.chance(0.3) ? 2 : 1, first = R.pick([-1, 1]);
    for (let q = 0; q < nc; q++) {
      const cz = (q ? -first : first) * D * R.range(0.15, 0.42), w = R.range(1.3, 2.0) * S, dd = w * R.range(0.8, 1.7);
      const hc = P.chim * R.range(0.62, 1.1), broken = R.chance(0.22);
      const Mc = mat(0, 0, cz, R.range(-0.05, 0.05), 0, R.range(-0.05, 0.05)), Mw = mul(Mh, Mc), cb = new Builder();
      cb.box(w, hc - y0, dd, mat(0, (hc + y0) / 2, 0), CHIM[(i + q) % 2]);
      let src, rg;
      if (!broken) {
        cb.box(w + 0.45 * S, 0.5 * S, dd + 0.45 * S, mat(0, hc - 0.55 * S, 0), BAND);
        const np = dd > 1.35 * w ? 2 : 1;
        for (let p = 0; p < np; p++) {
          const pz = np === 1 ? 0 : (p - 0.5) * dd * 0.5;
          cb.cyl(0.3 * S, 0.36 * S, 1.3 * S, 6, mat(0, hc + 0.65 * S, pz), POT);
        }
        const pz = np === 1 ? 0 : -0.25 * dd;
        rg = range(fb, () => fb.add(new THREE.CircleGeometry(0.26 * S, 6), mul(Mw, mat(0, hc + 1.32 * S, pz, -Math.PI / 2, 0, 0)), A, 0.06));
        src = V(0, hc + 1.3 * S, pz).applyMatrix4(Mw);
        top = Math.max(top, src.y);
      } else {
        // broken: one corner left standing higher than the rest
        cb.box(w * 0.5, 1.5 * S, dd * 0.6, mat(-w * 0.25, hc + 0.75 * S, dd * 0.2, 0, 0, 0.08), CHIM[(i + q + 1) % 2]);
        rg = range(fb, () => fb.box(w * 0.75, 0.08, dd * 0.75, mul(Mw, mat(0, hc + 0.05, 0)), A, 0.06));
        src = V(0, hc + 0.1, 0).applyMatrix4(Mw);
        top = Math.max(top, hc + 1.5 * S);
      }
      hb.merge(cb, Mc);
      CH.push({ src, rg, house: i });
    }
    b.merge(hb, Mh);
    // the windows of the upper floor, under the water off its gable ends
    for (const q of R.chance(0.5) ? [-1, 1] : [R.pick([-1, 1])]) {
      const wx = R.range(-0.2, 0.2) * W, wz = q * (D / 2 + 1.1 * S), hw = 0.75 * S, hd = 1.0 * S;
      const c = [[wx - hw, wz - hd], [wx + hw, wz - hd], [wx + hw, wz + hd], [wx - hw, wz + hd]].map(([px, pz]) => { const v = V(px, 0.14, pz).applyMatrix4(Mh); return [v.x, v.y, v.z]; });
      lit.quad(c[0], c[1], c[2], c[3], i, 0, mixHex(A, 0xffffff, 0.2));
      const cc = V(wx, 0.12, wz).applyMatrix4(Mh);
      lit.disc(cc.x, 0.12, cc.z, 2.6 * S, 100 + i, A, 10);
    }
    H.push({ w: R.range(0.15, 0.4), ph: R() * TAU });
    span = Math.max(span, Math.hypot(x, z) + Math.max(W, D) / 2 + 2.6 * S);
  }
  // the mill's stack at the end of the street, round and tapering, the tallest of them
  if (P.mill) {
    const lx = ((P.n - 1) / 2 * P.spacing + 6 * S) * P.millEnd, lz = (P.bend * lx * lx) / 100;
    const x = lx * cy - lz * sy, z = lx * sy + lz * cy, Hm = P.millH, rAt = (y) => (1.7 - (0.7 * (y + 6)) / (Hm + 6)) * S;
    b.cyl(rAt(Hm), rAt(-6), Hm + 6, 10, mat(x, (Hm - 6) / 2, z), CHIM[1]);
    b.cyl(rAt(Hm) + 0.3 * S, rAt(Hm) + 0.3 * S, 0.8 * S, 10, mat(x, Hm - 0.7 * S, z), BAND);
    for (const f of [0.45, 0.72]) b.cyl(rAt(Hm * f) + 0.12 * S, rAt(Hm * f) + 0.12 * S, 0.4 * S, 10, mat(x, Hm * f, z), BAND);
    const rg = range(fb, () => fb.add(new THREE.CircleGeometry(rAt(Hm) * 0.8, 10), mat(x, Hm + 0.03, z, -Math.PI / 2, 0, 0), A, 0.06));
    CH.push({ src: V(x, Hm, z), rg, house: -1 });
    top = Math.max(top, Hm + 0.3 * S);
    span = Math.max(span, Math.hypot(x, z) + 3 * S);
  }
  const nc = CH.length, order = CH.map((_, i) => i);
  for (let q = nc - 1; q > 0; q--) { const o = Math.floor(R() * (q + 1)); [order[q], order[o]] = [order[o], order[q]]; }
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  const fg = fb.build(), fem = fg.attributes.emissive.array;
  group.add(new THREE.Mesh(fg, mats.glow));
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.8));
  // the smoke: every puff remembers the chimney it left
  const NSm = 40, Lf = P.life, per = P.period, wa = R() * TAU, wx = Math.cos(wa), wz = Math.sin(wa);
  const pt = lights(NSm + 1, mixHex(A, 0xdfe6ea, 0.55), fx, 1);
  const SM = Array.from({ length: NSm }, (_, i) => ({ ph: (i + R() * 0.6) / NSm, r: R() * TAU }));
  pt.sz[NSm] = 4.5 * S;
  group.add(pt.p);
  const env = (tau) => smoothstep(0, 3, tau) * (1 - smoothstep(per - 3.5, per, tau));
  const light0 = CH[order[0]].src;
  return finish({
    group, fx, light: V(light0.x, light0.y, light0.z), focus: V(0, P.chim * 0.5, 0), span, clear: Math.min(95, span + 6), height: top,
    solid: top > 20 ? { r: span * 0.8, top, low: 0 } : undefined,
  }, (t) => {
    const k = Math.floor(t / per), tau = t - k * per, cur = order[mod(k, nc)], e = env(tau);
    for (let c = 0; c < nc; c++) setEm(fem, CH[c].rg, c === cur ? 0.06 + 1.3 * e : 0.06);
    fg.attributes.emissive.needsUpdate = true;
    for (let i = 0; i < NSm; i++) {
      const sm = SM[i], u = frac(t / Lf + sm.ph), te = t - u * Lf, kk = Math.floor(te / per), c = order[mod(kk, nc)];
      const src = CH[c].src, rise = 13 * S * (1 - (1 - u) * (1 - u)), dr = Math.pow(u, 1.4) * 8 * S;
      pt.pos[i * 3] = src.x + wx * dr + Math.sin(u * 7 + sm.r) * u * 1.2 * S;
      pt.pos[i * 3 + 1] = src.y + 0.3 + rise;
      pt.pos[i * 3 + 2] = src.z + wz * dr + Math.cos(u * 5 + sm.r) * u * 1.2 * S;
      pt.sz[i] = (0.9 + 2.6 * u) * S;
      pt.al[i] = 0.55 * Math.min(1, u * 8) * Math.pow(1 - u, 1.2) * env(te - kk * per);
    }
    const s0 = CH[cur].src;
    pt.pos.set([s0.x, s0.y + 0.3, s0.z], NSm * 3);
    pt.al[NSm] = 0.8 * e;
    pt.touch(true);
    const hc = CH[cur].house;
    for (let v = 0; v < L.n; v++) {
      const id = L.id[v], h = id % 100, hs = H[h];
      const lv = 0.05 + 0.1 * (0.5 + 0.5 * Math.sin(t * hs.w + hs.ph)) + (h === hc ? 0.45 * e : 0);
      L.em[v] = id >= 100 ? Math.max(0.015, lv * 0.5 * Math.pow(Math.max(0, 1 - L.u[v]), 1.5)) : lv;
    }
    L.touch();
  });
}

// ------------------------------------------------------------------ turning island
function turningisland(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]);
  const Ri = P.radius, hm = P.mound, sg = P.dir, w = TAU / P.period, rot0 = R() * TAU;
  const PEAT = 0x2a2522, MOSS = [0x26302b, 0x2c3530], SPRUCE = [0x1c2520, 0x222c27], PALE = mixHex(STONE[3], RIM, 0.5);
  // the island: one revolved body, the shore cut sheer, a pale line where it meets the water
  const ib = new Builder(), gb = new Builder();
  const prof = [[Ri * 1.02, -3, PEAT], [Ri * 1.02, 0.05, PALE], [Ri * 1.02, 0.6 * S, PEAT], [Ri, 1.15 * S, (k) => MOSS[k % 2]], [Ri * 0.9, 1.25 * S, (k) => MOSS[(k + 1) % 2]], [Ri * 0.62, 0.55 * hm + 0.6 * S, (k) => MOSS[(k >> 1) % 2]], [Ri * 0.3, 0.9 * hm, MOSS[1]], [0, hm]];
  revolve(ib, prof, 36);
  const ground = (r) => {
    for (let j = 3; j < prof.length - 1; j++) if (r <= prof[j][0] && r >= prof[j + 1][0]) return prof[j + 1][1] + ((prof[j][1] - prof[j + 1][1]) * (r - prof[j + 1][0])) / (prof[j][0] - prof[j + 1][0]);
    return prof[3][1];
  };
  // its spruces, the tallest toward the middle; none where the lamp stands
  const lr = 0.86 * Ri, TR = [];
  let top = 0;
  for (let tries = 0; TR.length < P.trees && tries < 3000; tries++) {
    const a = R() * TAU, r = Math.sqrt(R()) * Ri * 0.8, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - lr, z) < 3.5 * S || TR.some((p) => Math.hypot(p.x - x, p.z - z) < 2.8 * S)) continue;
    TR.push({ x, z, r });
  }
  TR.forEach((p, i) => {
    const h = P.treeH * (1 - (0.35 * p.r) / Ri) * R.range(0.6, 1), y = ground(p.r) - 0.2;
    ib.cyl(0.22 * S, 0.3 * S, 1.6 * S, 5, mat(p.x, y + 0.8 * S, p.z), TIMBER[0]);
    for (let k = 0; k < 4; k++) {
      const hk = h * (0.4 - 0.05 * k), rk = h * (0.21 - 0.04 * k), yb = y + 0.9 * S + k * 0.21 * h;
      ib.cone(rk, hk, 7, mat(p.x, yb + hk / 2, p.z, 0, R() * TAU, 0), SPRUCE[(i + k) % 2]);
      top = Math.max(top, yb + hk);
    }
  });
  // the lamp: a post on its edge, an arm out over the cut, a lamp hung from it
  const ys = ground(lr), LX = Ri * 1.02 + 0.7 * S, LY = ys + 3.8 * S;
  post(ib, V(lr, ys - 0.5, 0), V(lr, ys + 5.2 * S, 0), 0.36 * S, 0.26 * S, 6, STONE[2]);
  beam(ib, V(lr, ys + 4.9 * S, 0), V(LX + 0.3 * S, ys + 5.3 * S, 0), 0.3 * S, STONE[3]);
  ib.box(0.12 * S, 0.9 * S, 0.12 * S, mat(LX, ys + 4.75 * S, 0), RIM);
  ib.box(1.2 * S, 0.2 * S, 1.2 * S, mat(LX, LY + 0.7 * S, 0), STONE[3]);
  ib.box(0.95 * S, 1.2 * S, 0.95 * S, mat(LX, LY, 0), A, PULSE);
  ib.box(1.05 * S, 0.16 * S, 1.05 * S, mat(LX, LY - 0.68 * S, 0), STONE[3]);
  top = Math.max(top, ys + 5.5 * S);
  gb.add(new THREE.CircleGeometry(1, 12), mat(LX, 0.2, 0, -Math.PI / 2, 0, 0, 3.4 * S, 3.4 * S, 1), A, (px, py) => Math.max(0.015, 0.45 * Math.pow(Math.max(0, 1 - Math.hypot(px, py)), 1.5)));
  const island = new THREE.Group(), group = new THREE.Group(), fx = [];
  island.add(new THREE.Mesh(ib.build(), mats.glow));
  island.add(lightMesh(gb.build(), fx, 0.8));
  group.add(island);
  // the posts standing in the water round it, which do not turn
  const b = new Builder(), mb = new Builder(), lit = new Lit();
  const Nm = P.marks, Rm = Ri * 1.02 + P.reach, am = R() * TAU, MK = [];
  for (let k = 0; k < Nm; k++) {
    const a = am + (k / Nm) * TAU, x = Math.cos(a) * Rm, z = Math.sin(a) * Rm, mh = P.markH * (k === 0 ? 1.5 : 1);
    post(b, V(x, -5, z), V(x, mh, z), 0.45 * S, 0.32 * S, 6, STONE[2]);
    b.cyl(0.5 * S, 0.5 * S, 0.3 * S, 6, mat(x, mh * 0.5, z), BAND_OF(RIM));
    b.cone(0.5 * S, 0.8 * S, 6, mat(x, mh + 0.9 * S, z), STONE[3]);
    MK.push({ a, x, z, mh, rg: range(mb, () => mb.box(0.62 * S, 0.5 * S, 0.62 * S, mat(x, mh + 0.25 * S, z, 0, -a, 0), A, 0.08)) });
    lit.disc(x, 0.16, z, 2.2 * S, 200 + k, A, 8);
    top = Math.max(top, mh + 1.3 * S);
  }
  // the cut: a ring of light in the dark water between the island and the lake
  const NG = 72;
  lit.annulus(0, 0.14, 0, Ri * 1.02 + 0.05, Ri * 1.02 + 1.4 * S, NG, 0, mixHex(A, 0xffffff, 0.25));
  group.add(new THREE.Mesh(b.build(), mats.body));
  const mg = mb.build(), mem = mg.attributes.emissive.array;
  group.add(new THREE.Mesh(mg, mats.glow));
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.85));
  const pt = lights(Nm + 1, A, fx, 1);
  MK.forEach((m, k) => { pt.pos.set([m.x, m.mh + 0.25 * S, m.z], k * 3); pt.sz[k] = 3 * S; });
  pt.sz[Nm] = 5 * S;
  group.add(pt.p);
  const segE = new Float32Array(NG), mkE = new Float32Array(Nm), span = Rm + 1.6 * S;
  const passed = (la, a) => mod(sg * (la - a), TAU);
  return finish({
    group, fx, light: V(Math.cos(rot0) * LX, LY, Math.sin(rot0) * LX), focus: V(0, hm + 3 * S, 0), span, clear: Math.min(95, span + 6), height: top,
    solid: { r: Ri, top, low: 0 },
  }, (t) => {
    const la = rot0 + sg * w * t;
    island.rotation.y = -la;
    for (let k = 0; k < Nm; k++) {
      const dl = passed(la, MK[k].a);
      mkE[k] = 0.08 + 1.3 * Math.exp(-dl / 0.55) + 0.5 * Math.exp(-(((TAU - dl) / 0.06) ** 2));
      setEm(mem, MK[k].rg, mkE[k]);
      pt.al[k] = 0.1 + 0.7 * Math.min(1, mkE[k] - 0.08);
    }
    mg.attributes.emissive.needsUpdate = true;
    for (let k = 0; k < NG; k++) { const dl = passed(la, ((k + 0.5) / NG) * TAU); segE[k] = 0.1 + 0.85 * Math.exp(-dl / 0.4) + 0.4 * Math.exp(-(((TAU - dl) / 0.05) ** 2)); }
    for (let v = 0; v < L.n; v++) {
      const id = L.id[v], u = L.u[v];
      L.em[v] = Math.max(0.015, id >= 200 ? 0.45 * Math.min(1, mkE[id - 200]) * Math.pow(Math.max(0, 1 - u), 1.5) : segE[id] * Math.pow(Math.max(0, 1 - u), 1.4));
    }
    L.touch();
    pt.pos.set([Math.cos(la) * LX, LY, Math.sin(la) * LX], Nm * 3);
    pt.al[Nm] = 0.85;
    pt.touch();
  });
}
function BAND_OF(c) { return mixHex(STONE[3], c, 0.35); }

// ------------------------------------------------------------------ standing wave
function standingwave(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]);
  const Rr = P.radius, wd = P.width, H0 = P.still, Am = P.amp * H0, n = P.lobes, om = TAU / P.period;
  // the wall of water: a ring of hump-shaped section, rewritten every frame
  const NS = Math.max(72, n * 16), NQ = 8, nv = NS * NQ * 6;
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), em = new Float32Array(nv).fill(0.02);
  const KI = new Uint16Array(nv), QJ = new Uint8Array(nv);
  const QS = [];
  for (let j = 0; j <= NQ; j++) { const q = -1 + (2 * j) / NQ; QS.push({ q, r: Rr + q * wd, f: Math.pow(Math.cos((q * Math.PI) / 2), 1.6), crest: Math.abs(q) < 0.3 }); }
  const FOAM = mixHex(WATERC, STONE[3], 0.35), WM = mixHex(0x3b5560, STONE[2], 0.3);
  let v = 0;
  for (let k = 0; k < NS; k++) for (let j = 0; j < NQ; j++) {
    for (const [kk, jj] of [[k, j], [k + 1, j], [k + 1, j + 1], [k, j], [k + 1, j + 1], [k, j + 1]]) {
      KI[v] = kk % NS; QJ[v] = jj;
      _c.setHex(QS[jj].crest ? FOAM : mixHex(WATERD, WM, 1 - Math.abs(QS[jj].q)));
      col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
      v++;
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  wg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  wg.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const CS = Array.from({ length: NS }, (_, k) => [Math.cos((k / NS) * TAU), Math.sin((k / NS) * TAU), Math.cos((n * k * TAU) / NS)]);
  const hk = new Float32Array(NS);
  // posts at the nodes, where the water never moves; a needle at the middle
  const b = new Builder(), COL = mixHex(STONE[3], RIM, 0.35);
  for (let k = 0; k < 2 * n; k++) {
    const a = ((k + 0.5) * Math.PI) / n, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr;
    post(b, V(x, -4, z), V(x, H0 + 2.6 * S, z), 0.5 * S, 0.36 * S, 6, STONE[2]);
    b.cyl(0.62 * S, 0.62 * S, 0.3 * S, 6, mat(x, H0 - 0.15, z), COL);
    b.ico(0.55 * S, 0, mat(x, H0 + 3.1 * S, z), A, PULSE);
  }
  const Hn = P.needle;
  b.cyl(2.2 * S, 2.6 * S, 3.5 * S, 10, mat(0, -0.75 * S, 0), STONE[1]);
  b.cyl(2.3 * S, 2.3 * S, 0.3 * S, 10, mat(0, 1.0 * S, 0), COL);
  post(b, V(0, 1 * S, 0), V(0, Hn, 0), 0.75 * S, 0.32 * S, 6, STONE[3]);
  b.ico(0.9 * S, 1, mat(0, Hn + 0.6 * S, 0), A, PULSE);
  // foam lying at its foot, inside and out
  const lit = new Lit(), pale = mixHex(A, 0xffffff, 0.35);
  lit.annulus(0, 0.14, 0, Rr - wd - 1.5 * S, Rr - wd + 0.3, 48, 0, pale);
  lit.annulus(0, 0.14, 0, Rr + wd - 0.3, Rr + wd + 1.8 * S, 48, 100, pale);
  const L = lit.build();
  for (let i = 0; i < L.n; i++) { const u = L.u[i]; L.em[i] = Math.max(0.015, L.id[i] < 100 ? 0.3 * Math.pow(u, 1.5) : 0.3 * Math.pow(1 - u, 1.5)); }
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  const wall = new THREE.Mesh(wg, mats.glow);
  wall.frustumCulled = false;
  group.add(wall);
  group.add(lightMesh(L.g, fx, 0.8));
  // lights riding the crests, spray thrown from each at its height, the needle's flash
  const NA = 2 * n, M = 6, pt = lights(NA + NA * M + 1, pale, fx, 1);
  for (let i = 0; i < NA; i++) pt.sz[i] = 3.2 * S;
  const SP = Array.from({ length: NA * M }, (_, i) => { pt.sz[NA + i] = R.range(0.7, 1.3) * S; return { vr: R.range(-1.5, 1.5), vt: R.range(-1.2, 1.2), vy: R.range(2.5, 5) * Math.sqrt(S), lag: R() * 0.15 }; });
  pt.sz[NA + NA * M] = 6 * S;
  pt.pos.set([0, Hn + 0.6 * S, 0], (NA + NA * M) * 3);
  group.add(pt.p);
  const top = Math.max(Hn + 1.5 * S, H0 + Am), span = Rr + wd + 1.8 * S;
  return finish({
    group, fx, light: V(0, Hn + 0.6 * S, 0), focus: V(0, H0, 0), span, clear: Math.min(95, span + 6), height: top,
    solid: { r: Rr + wd, top: H0 + Am, low: 0 },
  }, (t) => {
    const ct = Math.cos(om * t), en = 0.78 + 0.22 * Math.sin((t * TAU) / P.breath);
    for (let k = 0; k < NS; k++) hk[k] = H0 + Am * en * CS[k][2] * ct;
    for (let i = 0; i < nv; i++) {
      const k = KI[i], Q = QS[QJ[i]], c = CS[k];
      pos[i * 3] = c[0] * Q.r; pos[i * 3 + 1] = Q.f * hk[k] - 0.3; pos[i * 3 + 2] = c[1] * Q.r;
      if (Q.crest) { const s = Math.max(0, c[2] * ct); em[i] = 0.04 + 0.6 * s * s; }
    }
    wg.attributes.position.needsUpdate = true;
    wg.attributes.emissive.needsUpdate = true;
    for (let a = 0; a < NA; a++) {
      const th = (a * Math.PI) / n, sgn = a % 2 ? -1 : 1, ca = Math.cos(th), sa = Math.sin(th), s = sgn * ct;
      pt.pos[a * 3] = ca * Rr; pt.pos[a * 3 + 1] = H0 + Am * en * s + 0.2; pt.pos[a * 3 + 2] = sa * Rr;
      pt.al[a] = 0.12 + 0.85 * Math.pow(Math.max(0, s), 3);
      // the spray: thrown up as the crest stands highest, falling back
      const tau = mod(om * t - (a % 2) * Math.PI, TAU) / om, y0 = H0 + Am * en - 0.3;
      for (let m = 0; m < M; m++) {
        const p = SP[a * M + m], i = NA + a * M + m, tt = tau - p.lag;
        if (tt < 0) { pt.al[i] = 0; continue; }
        const r = Rr + p.vr * tt, lt = p.vt * tt, y = y0 + p.vy * tt - 4.9 * tt * tt;
        pt.pos[i * 3] = ca * r - sa * lt; pt.pos[i * 3 + 1] = Math.max(0.1, y); pt.pos[i * 3 + 2] = sa * r + ca * lt;
        pt.al[i] = y > 0 ? 0.8 * Math.max(0, 1 - tt / 1.4) : 0;
      }
    }
    pt.al[NA + NA * M] = 0.3 + 0.8 * Math.pow(Math.abs(ct), 8);
    pt.touch();
  });
}

// ------------------------------------------------------------------ drowned tower
function drownedtower(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]);
  const H = P.height, Rt = P.radius, wpt = P.perTurn, rise = P.storey / wpt, sg = P.dir, th0 = R() * TAU;
  const rAt = (y) => Rt * (1 - (0.12 * (y + 6)) / (H + 6));
  const tb = new Builder(), wb = new Builder(), lit = new Lit(), top = new Lit();
  const COUR = mixHex(STONE[3], RIM, 0.3), pale = mixHex(A, 0xffffff, 0.3);
  const yTop = H - 3 * S, rT = rAt(yTop), r0 = rAt(0);
  // the shaft, tapering a little, a course of stone every second storey, a batter at the water
  tb.cyl(rT, rAt(-6), yTop + 6, 18, mat(0, (yTop - 6) / 2, 0), STONE[1]);
  for (let y = P.storey * 2; y < yTop - 1.5 * S; y += P.storey * 2) tb.cyl(rAt(y) + 0.25 * S, rAt(y) + 0.25 * S, 0.5 * S, 18, mat(0, y, 0), STONE[3]);
  tb.cyl(r0 + 0.3 * S, r0 + 1.2 * S, 2.4 * S, 18, mat(0, 0.4 * S, 0), STONE[2]);
  // its top, broken open: the wall standing to different heights, gaps where it fell
  const NMr = 18, wdt = 2 * rT * Math.sin(Math.PI / NMr) + 0.1;
  for (let k = 0; k < NMr; k++) {
    if (R.chance(0.25)) continue;
    const a = (k / NMr) * TAU, hgt = R.range(0.6, 1) * (R.chance(0.3) ? 5 : 2.6) * S;
    tb.box(wdt, hgt, 1.1 * S, mat(Math.cos(a) * (rT - 0.55 * S), yTop + hgt / 2, Math.sin(a) * (rT - 0.55 * S), 0, Math.PI / 2 - a, 0), STONE[2 + (k % 2)]);
  }
  tb.cyl(rT - 1.1 * S, rT - 1.1 * S, 0.2, 18, mat(0, yTop + 0.1, 0), STONE[0]);
  top.disc(0, yTop + 0.3, 0, rT - 1.2 * S, 0, pale, 18);
  // its windows, climbing with the stair inside in a spiral; more of them under the water
  const y1 = 2.6 * S, NW = Math.max(6, Math.floor((yTop - 1.8 * S - y1) / rise) + 1), NB = 2 * wpt;
  const ang = (i) => th0 + (sg * i * TAU) / wpt, WN = [];
  for (let i = 0; i < NW; i++) {
    const a = ang(i), y = y1 + i * rise, r = rAt(y), ry = Math.PI / 2 - a, ca = Math.cos(a), sa = Math.sin(a);
    tb.box(1.3 * S, 0.32 * S, 0.6 * S, mat(ca * r, y + 1.0 * S, sa * r, 0, ry, 0), COUR);
    tb.box(1.1 * S, 0.24 * S, 0.6 * S, mat(ca * r, y - 0.95 * S, sa * r, 0, ry, 0), COUR);
    WN.push({ x: ca * (r + 0.7 * S), y, z: sa * (r + 0.7 * S), rg: range(wb, () => wb.box(0.7 * S, 1.6 * S, 0.3 * S, mat(ca * (r + 0.05 * S), y, sa * (r + 0.05 * S), 0, ry, 0), A, 0.05)), base: R.chance(0.15) ? 0.3 : 0.05 });
  }
  for (let i = 1; i <= NB; i++) {
    // seen down through the water: the deeper, the farther out, the larger and the dimmer
    const a = ang(-i), r = r0 + 1.5 * S + i * 0.3 * S, hw = (0.45 + 0.04 * i) * S, hh = (0.9 + 0.08 * i) * S;
    const ca = Math.cos(a), sa = Math.sin(a), tx = -sa, tz = ca;
    const cx = ca * r, cz = sa * r, c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [cx + tx * p * hw + ca * q * hh, 0.15, cz + tz * p * hw + sa * q * hh]);
    lit.quad(c[0], c[1], c[2], c[3], i, 0, pale);
  }
  lit.annulus(0, 0.13, 0, r0 + 0.8 * S, r0 + 4.5 * S, 36, 100, A);
  // stones fallen from the top, lying half sunk about its foot
  let span = r0 + 4.5 * S;
  for (let k = 0; k < P.fallen; k++) {
    const a = R() * TAU, r = r0 + R.range(3, 9) * S, w = R.range(1.6, 3) * S;
    tb.box(w, R.range(1.2, 2) * S, w * R.range(0.6, 1), mat(Math.cos(a) * r, 0.15 * S, Math.sin(a) * r, R.range(-0.3, 0.3), R() * TAU, R.range(-0.3, 0.3)), STONE[2 + (k % 2)]);
    span = Math.max(span, r + w);
  }
  const group = new THREE.Group(), tw = new THREE.Group(), fx = [];
  tw.add(new THREE.Mesh(tb.build(), mats.body));
  const wg = wb.build(), wem = wg.attributes.emissive.array;
  tw.add(new THREE.Mesh(wg, mats.glow));
  const TL = top.build();
  tw.add(lightMesh(TL.g, fx, 0.8));
  // the lights at the windows as they pass, and each leaving by the top
  const NL = P.lights, pt = lights(NW + NL, pale, fx, 1);
  WN.forEach((w, i) => { pt.pos.set([w.x, w.y, w.z], i * 3); pt.sz[i] = 2.8 * S; });
  for (let j = 0; j < NL; j++) pt.sz[NW + j] = 3.2 * S;
  tw.add(pt.p);
  tw.rotation.set(P.lean * Math.sin(P.leanTo), 0, -P.lean * Math.cos(P.leanTo));
  group.add(tw);
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.8));
  const n = NW + NB + 6, s = new Float32Array(NL), height = H + 2.2 * S;
  const mw = WN[Math.floor(NW * 0.6)];
  return finish({
    group, fx, light: V(mw.x, mw.y, mw.z), focus: V(0, H * 0.5, 0), span, clear: Math.min(95, span + 6), height,
    solid: { r: r0 + 1.2 * S, top: H, low: 0 },
  }, (t) => {
    let deep = 0, out = 0;
    for (let j = 0; j < NL; j++) {
      // where each is on the stair, counted in windows (below 0: under the water)
      s[j] = -NB - 1 + frac(t / P.climb + j / NL) * n;
      if (s[j] < 0) deep = Math.max(deep, smoothstep(-NB - 1, -NB + 1, s[j]) * (1 - smoothstep(-1, 0.5, s[j])));
      const e = (s[j] - (NW - 0.5)) / 4.5, o = (NW + j) * 3;
      out = Math.max(out, Math.exp(-(((s[j] - NW) / 1.3) ** 2)));
      if (e > 0) {
        pt.pos[o] = Math.sin(e * 3 + j) * e * 2 * S; pt.pos[o + 1] = yTop + 1 * S + e * 18 * S; pt.pos[o + 2] = Math.cos(e * 2.3 + j) * e * 2 * S;
        pt.al[NW + j] = Math.min(1, e * 6) * (1 - e);
      } else pt.al[NW + j] = 0;
    }
    for (let i = 0; i < NW; i++) {
      let e = 0;
      for (let j = 0; j < NL; j++) e += Math.exp(-(((i - s[j]) / 0.7) ** 2));
      setEm(wem, WN[i].rg, WN[i].base + 1.4 * Math.min(1, e));
      pt.al[i] = 0.75 * Math.min(1, e);
    }
    wg.attributes.emissive.needsUpdate = true;
    pt.touch();
    for (let v = 0; v < L.n; v++) {
      const id = L.id[v];
      if (id >= 100) { L.em[v] = Math.max(0.015, (0.05 + 0.45 * deep) * Math.pow(Math.max(0, 1 - L.u[v]), 1.6)); continue; }
      let e = 0;
      for (let j = 0; j < NL; j++) e += Math.exp(-(((-id - s[j]) / 0.8) ** 2));
      L.em[v] = Math.max(0.015, (0.04 + 0.9 * Math.min(1, e)) * (1 - (0.5 * id) / NB));
    }
    L.touch();
    for (let v = 0; v < TL.n; v++) TL.em[v] = Math.max(0.015, (0.08 + 0.8 * out) * Math.pow(Math.max(0, 1 - TL.u[v]), 1.2));
    TL.touch();
  });
}

// ------------------------------------------------------------------ lifted lens
function liftedlens(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]);
  const Hl = P.lift, Rl = P.radius, Tl = P.thick, NR = 9, NSg = 40, cyc = P.cycle;
  const tt = (rho) => Tl * 0.4 * (1 - rho * rho) + 0.2 * S, tb = (rho) => Tl * 0.6 * (1 - rho * rho) + 0.2 * S;
  const a0 = 0.8 * S, a1 = 1.1 * S, a2 = 1.2 * S, w0 = 1.1, w1 = 1.7, w2 = 2.3, p0 = R() * TAU;
  // the lens: two faces and the rim between, rewritten every frame (i: ring, k: around, s: 0 top, 1 bottom)
  const VI = [];
  const quad = (a, b, c, d) => { VI.push(a, b, c, a, c, d); };
  for (let i = 0; i < NR; i++) for (let k = 0; k < NSg; k++) {
    const k1 = k + 1;
    if (i === 0) { VI.push([0, k, 0], [1, k1, 0], [1, k, 0]); VI.push([0, k, 1], [1, k, 1], [1, k1, 1]); continue; }
    quad([i, k, 0], [i, k1, 0], [i + 1, k1, 0], [i + 1, k, 0]);
    quad([i, k, 1], [i + 1, k, 1], [i + 1, k1, 1], [i, k1, 1]);
  }
  for (let k = 0; k < NSg; k++) VI.push([NR, k, 0], [NR, k + 1, 0], [NR, k + 1, 1], [NR, k, 0], [NR, k + 1, 1], [NR, k, 1]);
  const nv = VI.length, lp = new Float32Array(nv * 3), lc = new Float32Array(nv * 3), le = new Float32Array(nv);
  const WL0 = 0x22343d, WL1 = mixHex(WATERC, STONE[2], 0.45);
  VI.forEach(([i], v) => {
    const rho = i / NR;
    _c.setHex(mixHex(WL0, WL1, 0.15 + 0.6 * rho * rho));
    lc[v * 3] = _c.r; lc[v * 3 + 1] = _c.g; lc[v * 3 + 2] = _c.b;
    le[v] = 0.06 + 0.3 * Math.pow(rho, 4);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  lg.setAttribute('emissive', new THREE.BufferAttribute(le, 1));
  const CSg = Array.from({ length: NSg + 1 }, (_, k) => [Math.cos((k / NSg) * TAU), Math.sin((k / NSg) * TAU), (k / NSg) * TAU]);
  const DZ = new Float32Array((NR + 1) * (NSg + 1));
  // the thread of water it is drawn up by: rings of a tube, rewritten every frame
  const NT = 26, ST = 8, tv = (NT - 1) * ST * 6, tp = new Float32Array(tv * 3), tc = new Float32Array(tv * 3), te = new Float32Array(tv);
  const TI = [];
  for (let i = 0; i < NT - 1; i++) for (let k = 0; k < ST; k++) TI.push([i, k], [i + 1, k], [i + 1, k + 1], [i, k], [i + 1, k + 1], [i, k + 1]);
  _c.setHex(mixHex(WATERC, STONE[3], 0.4));
  for (let v = 0; v < tv; v++) { tc[v * 3] = _c.r; tc[v * 3 + 1] = _c.g; tc[v * 3 + 2] = _c.b; }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  tg.setAttribute('emissive', new THREE.BufferAttribute(te, 1));
  const ring = Array.from({ length: NT }, () => ({ x: 0, y: 0, z: 0, r: 0, e: 0 }));
  const group = new THREE.Group(), fx = [];
  const lens = new THREE.Mesh(lg, mats.glow), thread = new THREE.Mesh(tg, mats.glow);
  lens.frustumCulled = false; thread.frustumCulled = false;
  group.add(lens, thread);
  const sheen = lightMesh(lg, fx, 1.6, { fresnel: 0.9 });
  sheen.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.55));
  group.add(sheen);
  // light on the lake: what it gathers under it, the foot of the thread, the rain's rings
  const lit = new Lit(), pale = mixHex(A, 0xffffff, 0.3), NRn = 48;
  lit.disc(0, 0.17, 0, Rl * 0.55, 1, pale, 20);
  lit.disc(0, 0.19, 0, 4.5 * S, 2, A, 14);
  lit.annulus(0, 0.16, 0, Rl * 0.78, Rl * 1.06, NRn, 100, pale);
  const L = lit.build();
  group.add(lightMesh(L.g, fx, 0.85));
  // the rain from its rim: two points to a drop, head and tail
  const ND = P.drops, DR = Array.from({ length: ND }, () => {
    const rho = R.range(0.82, 0.99), ph = R() * TAU, y0 = Hl - tb(rho), Tf = Math.sqrt((2 * y0) / 9.8);
    return { x: Math.cos(ph) * rho * Rl, z: Math.sin(ph) * rho * Rl, y0, Tf, Tc: Tf + R.range(0.2, 1.6), off: R() * 10, seg: Math.floor(mod(ph, TAU) / TAU * NRn) % NRn, out: R.range(0.2, 0.8) };
  });
  const NM = 14, pt = lights(ND * 2 + NM + 2, pale, fx, 1);
  for (let i = 0; i < ND; i++) { pt.sz[i * 2] = 0.9 * S; pt.sz[i * 2 + 1] = 0.6 * S; }
  for (let i = 0; i < NM; i++) pt.sz[ND * 2 + i] = 1.2 * S;
  pt.sz[ND * 2 + NM] = 7 * S; pt.sz[ND * 2 + NM + 1] = 6 * S;
  group.add(pt.p);
  const segs = new Float32Array(NRn), height = Hl + tt(0) + a0 + 0.3 * S, span = Rl * 1.06 + 1.5 * S;
  return finish({
    group, fx, light: V(0, Hl, 0), focus: V(0, Hl * 0.6, 0), span, clear: Math.min(95, span + 6), height,
    solid: { r: Rl, top: Hl + tt(0), low: Hl - tb(0) },
  }, (t) => {
    // its face: three drum modes, their strengths trading over the cycle, two of them turning slowly
    const g0 = 0.6 + 0.4 * Math.sin((t * TAU) / cyc), g1 = 0.5 + 0.5 * Math.sin((t * TAU) / cyc + 2.1), g2 = 0.5 + 0.5 * Math.sin((t * TAU) / cyc + 4.2);
    const m0 = a0 * g0 * Math.cos(w0 * t), m1 = a1 * 2.6 * g1 * Math.cos(w1 * t), m2 = a2 * 4 * g2 * Math.cos(w2 * t), s1 = t * 0.05 + p0, s2 = -t * 0.03 + p0 * 2;
    for (let i = 0; i <= NR; i++) {
      const rho = i / NR, q = 1 - rho * rho;
      for (let k = 0; k <= NSg; k++) { const ph = CSg[k][2]; DZ[i * (NSg + 1) + k] = q * (m0 + m1 * rho * Math.cos(ph - s1) + m2 * rho * rho * Math.cos(2 * (ph - s2))); }
    }
    for (let v = 0; v < nv; v++) {
      const [i, k, s] = VI[v], rho = i / NR, c = CSg[k], dz = DZ[i * (NSg + 1) + k];
      lp[v * 3] = c[0] * rho * Rl; lp[v * 3 + 1] = Hl + dz + (s ? -tb(rho) : tt(rho)); lp[v * 3 + 2] = c[1] * rho * Rl;
    }
    lg.attributes.position.needsUpdate = true;
    // the thread: pinched in its middle, flared at both ends, swellings climbing it
    const yT = Hl - tb(0) + DZ[0] + 0.5 * S, rt = P.thread, sw = Math.sin(t * 0.4), cw = Math.cos(t * 0.33);
    for (let i = 0; i < NT; i++) {
      const s = i / (NT - 1), wv = Math.sin(TAU * (s * 3.5 - t * 0.45)), rg = ring[i];
      rg.y = -0.3 + (yT + 0.3) * s; rg.x = Math.sin(Math.PI * s) * 0.6 * S * sw; rg.z = Math.sin(Math.PI * s) * 0.5 * S * cw;
      rg.r = rt * (1 + 2.2 * Math.exp(-s * 14) + 1.6 * Math.exp(-(1 - s) * 12)) * (1 + 0.28 * wv);
      rg.e = 0.12 + 0.5 * Math.pow(Math.max(0, wv), 2);
    }
    for (let v = 0; v < tv; v++) {
      const [i, k] = TI[v], rg = ring[i], a = ((k % ST) / ST) * TAU;
      tp[v * 3] = rg.x + Math.cos(a) * rg.r; tp[v * 3 + 1] = rg.y; tp[v * 3 + 2] = rg.z + Math.sin(a) * rg.r;
      te[v] = rg.e;
    }
    tg.attributes.position.needsUpdate = true;
    tg.attributes.emissive.needsUpdate = true;
    // the rain
    segs.fill(0);
    for (let i = 0; i < ND; i++) {
      const p = DR[i], tau = mod(t + p.off, p.Tc);
      if (tau < p.Tf) {
        const y = p.y0 - 4.9 * tau * tau, dy = Math.min(1.5 * S, 9.8 * tau * 0.08), k = 1 + p.out * 0.04 * tau;
        pt.pos.set([p.x * k, y, p.z * k, p.x * k, y + dy, p.z * k], i * 6);
        pt.al[i * 2] = 0.75; pt.al[i * 2 + 1] = 0.35;
      } else {
        pt.al[i * 2] = 0; pt.al[i * 2 + 1] = 0;
        segs[p.seg] += Math.exp(-(tau - p.Tf) * 4);
      }
    }
    // motes climbing about the thread
    for (let i = 0; i < NM; i++) {
      const u = frac(t * 0.07 + i / NM), rg = ring[Math.min(NT - 1, Math.floor(u * (NT - 1)))], a = t * 0.8 + i * 2.4, o = (ND * 2 + i) * 3;
      pt.pos[o] = rg.x + Math.cos(a) * (rg.r + 0.4 * S); pt.pos[o + 1] = rg.y; pt.pos[o + 2] = rg.z + Math.sin(a) * (rg.r + 0.4 * S);
      pt.al[ND * 2 + i] = 0.6 * Math.min(1, u * 8) * Math.min(1, (1 - u) * 8);
    }
    const foc = 0.5 + 0.5 * Math.cos(w0 * t) * g0;
    pt.pos.set([0, yT - 0.6 * S, 0, 0, 0.6, 0], (ND * 2 + NM) * 3);
    pt.al[ND * 2 + NM] = 0.35 + 0.4 * foc; pt.al[ND * 2 + NM + 1] = 0.55;
    pt.touch();
    for (let v = 0; v < L.n; v++) {
      const id = L.id[v], u = L.u[v];
      if (id === 1) L.em[v] = Math.max(0.015, (0.12 + 0.35 * foc) * Math.pow(Math.max(0, 1 - u), 1 + 2 * foc));
      else if (id === 2) L.em[v] = Math.max(0.015, (0.3 + 0.2 * Math.sin(t * 2.8)) * Math.pow(Math.max(0, 1 - u), 2));
      else L.em[v] = Math.max(0.015, (0.08 + 0.5 * Math.min(1, segs[id - 100])) * Math.pow(Math.max(0, 1 - Math.abs(u - 0.5) * 2), 1.2));
    }
    L.touch();
  });
}

export const SET = {
  drownedgrove: {
    code: 'LGV', cls: 'Drowned grove', nouns: ['Snags', 'Grove', 'Stand', 'Perches', 'Deadwood', 'Roost'], place: 'greatlake', tier: 0,
    kin: ['tree', 'watcher', 'murmuration'], voice: ['breath', 'chirp'],
    params(R, size) {
      const P = {
        n: R.int(7, 15), radius: R.range(13, 20) * size, squash: R.range(0.6, 1), height: R.range(18, 28) * size,
        logs: R.int(1, 3), perches: R.int(10, 18), lights: R.int(3, 6), step: R.pick([4, 5, 6, 7]),
      };
      P.text = `${numw(P.n)} dead spruces standing in the lake, bleached grey, the tallest ${Math.round(P.height)} meters; ${low(P.lights)} lights perch in their branches, and every ${P.step} seconds the one that has sat longest leaves its perch and flies to another snag.`;
      return P;
    },
    build: drownedgrove,
  },
  weir: {
    code: 'LWR', cls: 'Spiral weir', nouns: ['Weir', 'Trap', 'Spiral', 'Wattle', 'Stakes', 'Maze'], place: 'greatlake', tier: 0,
    kin: ['nautilus', 'helicon', 'murmuration'], voice: ['grains', 'glass'],
    params(R, size) {
      const P = {
        radius: R.range(13, 18) * size, turns: R.range(1.4, 2.2), dir: R.pick([-1, 1]), gap: R.range(1.3, 1.7) * size,
        low: R.range(3.4, 4.5) * size, high: R.range(6.5, 9) * size, pole: R.range(13, 17) * size,
        fish: R.int(6, 13), speed: R.range(2, 3), period: R.range(75, 110),
      };
      P.text = `A fish weir of stakes and wattle wound ${P.turns > 1.8 ? 'twice' : 'once and a half'} round in a spiral ${Math.round(P.radius * 2)} meters across, a lamp on a pole at its heart. ${numw(P.fish)} lights swim in at its mouth and wind inward, the lamp brighter for each; every ${Math.round(P.period)} seconds it lets them go.`;
      return P;
    },
    build: weir,
  },
  chimneys: {
    code: 'LCH', cls: 'Drowned village', nouns: ['Chimneys', 'Village', 'Hearths', 'Stacks', 'Roofs', 'Parish'], place: 'greatlake', tier: 0,
    kin: ['pyre', 'nest', 'watcher'], voice: ['breath', 'fm'],
    params(R, size) {
      const P = {
        rows: R.pick([1, 2]), street: R.range(5, 6.5) * size, bend: R.range(-1.2, 1.2),
        chim: R.range(7, 12) * size, mill: R.chance(0.5), millH: R.range(18, 25) * size, millEnd: R.pick([-1, 1]),
        period: R.range(18, 32), life: R.range(9, 13),
      };
      // (one row: houses side by side along the street; two: either side of it, staggered)
      P.n = P.rows === 2 ? R.int(5, 8) : R.int(4, 6);
      P.spacing = (P.rows === 2 ? R.range(5.5, 6.8) : R.range(8, 9)) * size;
      P.text = `The chimneys of a drowned village standing out of the lake, ${low(P.n)} roofs' worth, the ridges just breaking the water${P.mill ? `, a mill's stack ${Math.round(P.millH)} meters tall at the end of the street` : ''}. Smoke of light goes up from one chimney at a time, a different one every ${Math.round(P.period)} seconds, and the windows under the water light below it.`;
      return P;
    },
    build: chimneys,
  },
  turningisland: {
    code: 'YIS', cls: 'Turning island', nouns: ['Island', 'Eye', 'Holm', 'Disc', 'Islet', 'Dial'], place: 'greatlake', tier: 1,
    kin: ['archipelago', 'turning', 'armillary'], voice: ['whale', 'breath'],
    params(R, size) {
      const P = {
        radius: R.range(9, 13) * size, mound: R.range(1.8, 3.2) * size, trees: R.int(6, 13), treeH: R.range(14, 19) * size,
        period: R.range(150, 320), dir: R.pick([-1, 1]), marks: R.int(7, 13), reach: R.range(4, 6) * size, markH: R.range(3.5, 5.5) * size,
      };
      P.text = `A round island ${Math.round(P.radius * 2)} meters across with ${low(P.trees)} spruces on it, cut clean from the lake by a ring of dark water and turning once every ${(P.period / 60).toFixed(1)} minutes. The lamp on its edge passes ${low(P.marks)} posts standing in the water round it, and each wakes as it passes.`;
      return P;
    },
    build: turningisland,
  },
  standingwave: {
    code: 'LSW', cls: 'Standing wave', nouns: ['Wave', 'Crown', 'Ring', 'Seiche', 'Swell', 'Node'], place: 'greatlake', tier: 1,
    kin: ['halo', 'choir', 'corolla'], voice: ['fm', 'glass'],
    params(R, size) {
      const P = {
        radius: R.range(11, 15) * size, width: R.range(2.4, 3.2) * size, still: R.range(4.5, 6.5) * size, amp: R.range(0.6, 0.8),
        lobes: R.int(3, 8), period: R.range(7, 12), breath: R.range(50, 80), needle: R.range(15, 21) * size,
      };
      P.text = `A ring of the lake ${Math.round(P.radius * 2)} meters across stands up in a wall of water holding a standing wave: ${low(P.lobes)} crests rise as ${low(P.lobes)} fall, ${Math.round(P.period)} seconds to the swing, and ${low(2 * P.lobes)} posts stand where the water never moves. Spray of light leaves each crest at its height; a needle of stone in the middle flashes at every turn.`;
      return P;
    },
    build: standingwave,
  },
  drownedtower: {
    code: 'LTW', cls: 'Drowned tower', nouns: ['Tower', 'Keep', 'Stair', 'Spiral', 'Climb', 'Ascent'], place: 'greatlake', tier: 2,
    kin: ['spire', 'helicon', 'watcher'], voice: ['whale', 'breath'],
    params(R, size) {
      const P = {
        height: R.range(34, 46) * size, radius: R.range(5, 6.8) * size, storey: R.range(3.6, 4.6) * size, perTurn: R.int(4, 6), dir: R.pick([-1, 1]),
        lean: R.range(0.02, 0.07), leanTo: R.range(0, TAU), lights: R.int(3, 5), climb: R.range(45, 75), fallen: R.int(3, 6),
      };
      P.text = `A round tower of dark stone standing ${Math.round(P.height)} meters out of the lake, leaning ${Math.round((P.lean * 180) / Math.PI)} degrees, its top broken open; its windows wind up it with the stair inside, ${low(P.perTurn)} to a turn, and go on down under the water. ${numw(P.lights)} lights come up out of the lake one after another, climb it window by window, and leave by the broken top into the fog.`;
      return P;
    },
    build: drownedtower,
  },
  liftedlens: {
    code: 'YLN', cls: 'Hanging water', nouns: ['Lens', 'Lift', 'Drum', 'Pane', 'Draught', 'Cistern'], place: 'greatlake', tier: 2,
    kin: ['medusa', 'halo', 'vortex'], voice: ['glass', 'whale'],
    params(R, size) {
      const P = {
        lift: R.range(26, 36) * size, radius: R.range(10, 14) * size, thick: R.range(3.5, 5) * size, thread: R.range(0.6, 1) * size,
        drops: R.int(70, 120), cycle: R.range(50, 80),
      };
      P.text = `A lens of the lake's water ${Math.round(P.radius * 2)} meters across hanging ${Math.round(P.lift)} meters over it, drawn up by a thread of water that swells as it climbs. Its face trembles in three drum modes that trade places over ${Math.round(P.cycle)} seconds, and it rains from its rim back into the lake.`;
      return P;
    },
    build: liftedlens,
  },
};
