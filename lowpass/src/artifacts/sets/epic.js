import * as THREE from 'three';
import { Builder, mat } from '../../render/build.js';
import { glowMaterial, pointsMaterial, worldMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { TAU, clamp, hash2 } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam } from '../parts.js';

// The EPIC tier's own families: 40-80 m, one idea each that a pilot will not forget, more
// of them moving than an ordinary family, and the tier's violet beside the accent.
//   pendulumwave  a row of pendulums on a long truss, each swinging once more than the last
//                 in the same time: they fall out of step into snakes and waves and scatter,
//                 swing in two ranks at half time, and come back into one line; a thread of
//                 violet light runs through every bob
//   rippletank    a round tank brimming with light, a bridge over it from which rods dip
//                 into it; their rings cross in bright fans and dark lines, and the fans open
//                 and close as the rods draw apart, or swing as their beats are stepped, as a
//                 listening array turns its ear
//   basins        a stair of stone basins on pillars winding down round a tower; the highest,
//                 fed by a violet thread, tips every few seconds into the next, which tips
//                 only when it has had so many pours, and so on down: a clock that counts in
//                 mixed radix, its lowest basin tipping into the pool once in hours
//   epicycles     circles turning on circles, hung in the air: the last carries a pen of
//                 light drawing a closed figure; each turn it is given one circle more and
//                 comes nearer the figure laid faintly in violet beside it (hangs: floats)
//   quincunx      a wall of stone with pegs through it in a triangle: grains of light fall
//                 down both its faces, left or right at each peg as chance has it, the pegs
//                 lighting as Pascal's triangle, the bins at its foot filling into the bell
//                 curve drawn over them in violet; then they are emptied

const VIOLET = 0xb48cff;
const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-one'];
const numw = (n) => NUMW[n] ?? String(n);
const lower = (s) => s.toLowerCase();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (u) => u * u * (3 - 2 * u);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// a matrix in place: translation, rotation (YXZ), scale
const trs = (m, x, y, z, rx, ry, rz, sx, sy, sz) => m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));

// a mesh of pure light; fx collects [material, its opacity, a factor the update may change]
function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  const f = [m, opacity, 1];
  fx.push(f);
  mesh.userData.fx = f;
  return mesh;
}
// points of light, to be moved: n of them
function lightPoints(n, fx, color, size, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  fx.push([m, opacity, 1]);
  const pts = new THREE.Points(g, m);
  pts.layers.set(LAYER_FX);
  pts.frustumCulled = false;
  const dirty = () => { g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; };
  return { pts, pos, sz, al, g, dirty };
}
// many copies of one part, each moved (and lit) on its own: one draw call
function instanced(geo, material, n, light = false) {
  const im = new THREE.InstancedMesh(geo, material, n);
  im.frustumCulled = false;
  if (light) im.layers.set(LAYER_FX);
  for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.setRGB(1, 1, 1)); }
  return im;
}
function lightInstanced(geo, fx, n, opacity = 1) {
  const m = glowMaterial({ opacity, fog: 0.6, side: THREE.DoubleSide });
  fx.push([m, opacity, 1]);
  return instanced(geo, m, n, true);
}
// quads of light to be rewritten: n of them (white; tint the material)
function quads(n) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 18), col = new Float32Array(n * 18).fill(1), em = new Float32Array(n * 6).fill(1e-4);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return { g, pos, em, n, dirty() { g.attributes.position.needsUpdate = true; g.attributes.emissive.needsUpdate = true; } };
}
// quad k of Q: a ribbon from a to b, w its half-width (a vector); ea, eb its light at each end
function seg(Q, k, ax, ay, az, bx, by, bz, wx, wy, wz, ea, eb) {
  const p = Q.pos, o = k * 18;
  p[o] = ax - wx; p[o + 1] = ay - wy; p[o + 2] = az - wz;
  p[o + 3] = ax + wx; p[o + 4] = ay + wy; p[o + 5] = az + wz;
  p[o + 6] = bx + wx; p[o + 7] = by + wy; p[o + 8] = bz + wz;
  p[o + 9] = ax - wx; p[o + 10] = ay - wy; p[o + 11] = az - wz;
  p[o + 12] = bx + wx; p[o + 13] = by + wy; p[o + 14] = bz + wz;
  p[o + 15] = bx - wx; p[o + 16] = by - wy; p[o + 17] = bz - wz;
  ea = Math.max(1e-4, ea); eb = Math.max(1e-4, eb);
  const e = Q.em, q = k * 6;
  e[q] = ea; e[q + 1] = ea; e[q + 2] = eb; e[q + 3] = ea; e[q + 4] = eb; e[q + 5] = eb;
}
function hideSeg(Q, k) { Q.pos.fill(0, k * 18, k * 18 + 18); Q.em.fill(1e-4, k * 6, k * 6 + 6); }
// a light mesh of quads to be rewritten
function quadMesh(n, fx, color, opacity) {
  const Q = quads(n);
  const mesh = lightMesh(Q.g, fx, opacity);
  mesh.material.uniforms.uTint.value.setHex(color);
  Q.mesh = mesh;
  return Q;
}
function finish(out, fx, extra, update) {
  return {
    ...out,
    clear: Math.min(95, out.span + 6),
    mats: [...fx.map((f) => f[0]), ...extra],
    update(t, beat, c) {
      c = c || {};
      update(t, beat, c);
      const k = (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      for (const f of fx) f[0].uniforms.uOpacity.value = f[1] * f[2] * k;
    },
  };
}

// ------------------------------------------------------------------ pendulumwave
function pendulumwave(d, A, mats, ctx) {
  const P = d.params, S = d.size, n = P.n, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), pale = mixHex(A, 0xffffff, 0.55), vio = mixHex(VIOLET, 0xffffff, 0.15);
  const half = ((n - 1) * P.spacing) / 2, c0 = 3.4 * S, tH = 2.6 * S, bobR = 1.15 * S;
  // each pendulum: its period (T over K, K+1, …), its length as the period asks (squared)
  const X = [], L = [], per = [], gy = [], piv = [], th0 = [];
  for (let k = 0; k < n; k++) {
    X.push(k * P.spacing - half);
    per.push(P.T / (P.K + k));
    L.push(P.longest * Math.pow(P.K / (P.K + k), 2));
    gy.push(ctx.ground(X[k], 0));
  }
  const amp = Math.min(P.amp, 0.6 * L[n - 1]);
  for (let k = 0; k < n; k++) th0.push(Math.asin(amp / L[k]));
  // hung from one level (the bobs in a slope), or stepped (the bobs level, the truss a slope)
  if (P.mode === 'level') { const top = Math.max(...L.map((l, k) => gy[k] + c0 + l)); for (let k = 0; k < n; k++) piv.push(top); }
  else for (let k = 0; k < n; k++) piv.push(gy[k] + c0 + L[k]);
  const b = new Builder();
  // the truss: chords, posts and diagonals, from one end frame to the other
  const xe = [X[0] - 3 * S, X[n - 1] + 3 * S], ye = [piv[0], piv[n - 1]];
  const nodes = [[xe[0], ye[0]], ...X.map((x, k) => [x, piv[k]]), [xe[1], ye[1]]];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i], c = nodes[i + 1];
    beam(b, V3(a[0], a[1], 0), V3(c[0], c[1], 0), 0.9 * S, STONE[2]);
    beam(b, V3(a[0], a[1] + tH, 0), V3(c[0], c[1] + tH, 0), 1.1 * S, STONE[3]);
    if (i % 2) beam(b, V3(a[0], a[1], 0), V3(c[0], c[1] + tH, 0), 0.45 * S, STONE[1]);
    else beam(b, V3(a[0], a[1] + tH, 0), V3(c[0], c[1], 0), 0.45 * S, STONE[1]);
  }
  for (let k = 0; k < n; k++) {
    b.box(0.4 * S, tH, 0.4 * S, mat(X[k], piv[k] + tH / 2, 0), STONE[1]);
    b.box(0.8 * S, 0.5 * S, 0.8 * S, mat(X[k], piv[k] - 0.3 * S, 0), RIM);
    // the floor each swings over: a slab of dark stone, as wide as its swing
    b.box(P.spacing * 0.98, 1.4, 2 * amp + 3.5 * S, mat(X[k], gy[k] - 0.5, 0), k % 2 ? STONE[0] : STONE[1]);
  }
  // the end frames: an A of stone at each end, braced, a violet lamp on top
  for (let q = 0; q < 2; q++) {
    const x = xe[q], top = ye[q] + tH, g0 = ctx.ground(x, 0), h = top - g0, zl = Math.max(4.5 * S, 0.34 * h);
    for (const s of [-1, 1]) {
      const gl = ctx.ground(x, s * zl);
      beam(b, V3(x, gl - 0.8, s * zl), V3(x, top + 0.3 * S, 0), 1.3 * S, STONE[2]);
      b.box(2.6 * S, 1.6, 2.6 * S, mat(x, gl, s * zl), STONE[0]);
    }
    const yb = g0 + h * 0.35, zb = zl * 0.64;
    beam(b, V3(x, yb, -zb), V3(x, yb, zb), 0.8 * S, STONE[3]);
    b.box(2.4 * S, 1.1 * S, 2.4 * S, mat(x, top + 0.7 * S, 0), STONE[3]);
    b.ico(0.9 * S, 1, mat(x, top + 2.1 * S, 0), VIOLET, PULSE);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the wires and the bobs, each swinging on its own
  const instMat = worldMaterial({ unique: true });
  const wb = new Builder();
  wb.box(1, 1, 1, mat(0, -0.5, 0), RIM);
  const wires = instanced(wb.build(), instMat, n);
  const bb = new Builder();
  bb.ico(1, 1, mat(0, 0, 0, 0, 0, 0, bobR, bobR * 0.75, bobR), lit, 1.2);
  bb.cone(0.35 * S, 1.2 * S, 6, mat(0, -bobR * 0.75 - 0.5 * S, 0, Math.PI, 0, 0), RIM);
  const bobs = instanced(bb.build(), instMat, n);
  group.add(wires, bobs);
  // the thread of violet through the bobs (two ribbons, upright and flat), and their trails
  const thread = quadMesh((n - 1) * 2, fx, vio, 0.9);
  group.add(thread.mesh);
  const TR = 7, trail = lightPoints(n * TR, fx, pale, 1.1 * S, 0.8);
  group.add(trail.pts);
  const by = new Float64Array(n), bz = new Float64Array(n);
  const bobAt = (k, t) => { const th = th0[k] * Math.cos((TAU * t) / per[k]); return th; };
  const restY = L.map((l, k) => piv[k] - l), midY = restY.reduce((s, y) => s + y, 0) / n;
  const height = Math.max(...piv) + tH + 3.2 * S;
  return finish({ group, light: V3(0, midY, 0), focus: V3(0, (Math.min(...restY) + Math.max(...piv)) / 2, 0), span: xe[1] + 1.3 * S, height, solid: { r: xe[1] + 1.3 * S, top: height, low: 0 } }, fx, [instMat], (t) => {
    // how near they are to one line (and to two ranks)
    let cx = 0, sx = 0, c2x = 0, c2y = 0;
    for (let k = 0; k < n; k++) { const ph = (TAU * t) / per[k]; cx += Math.cos(ph); sx += Math.sin(ph); c2x += Math.cos(2 * ph); c2y += Math.sin(2 * ph); }
    const coh = Math.hypot(cx, sx) / n, coh2 = Math.hypot(c2x, c2y) / n;
    const glow = 0.3 + 1.2 * Math.pow(coh, 6) + 0.45 * Math.pow(coh2, 10);
    for (let k = 0; k < n; k++) {
      const th = bobAt(k, t);
      wires.setMatrixAt(k, trs(_m, X[k], piv[k], 0, th, 0, 0, 0.14 * S, L[k] - bobR * 0.5, 0.14 * S));
      by[k] = piv[k] - L[k] * Math.cos(th); bz[k] = -L[k] * Math.sin(th);
      bobs.setMatrixAt(k, trs(_m, X[k], by[k], bz[k], th, 0, 0, 1, 1, 1));
      bobs.setColorAt(k, _c.setScalar(0.7 + 1.1 * Math.pow(coh, 6)));
      for (let j = 0; j < TR; j++) {
        const tj = bobAt(k, t - (j + 1) * 0.11), o = (k * TR + j) * 3;
        trail.pos[o] = X[k]; trail.pos[o + 1] = piv[k] - L[k] * Math.cos(tj); trail.pos[o + 2] = -L[k] * Math.sin(tj);
        trail.al[k * TR + j] = 0.55 * Math.pow(1 - j / TR, 2);
      }
    }
    const w = 0.2 * S;
    for (let k = 0; k + 1 < n; k++) {
      const dx = X[k + 1] - X[k], dz = bz[k + 1] - bz[k], l = Math.hypot(dx, dz) || 1;
      seg(thread, k * 2, X[k], by[k], bz[k], X[k + 1], by[k + 1], bz[k + 1], 0, w, 0, glow, glow);
      seg(thread, k * 2 + 1, X[k], by[k], bz[k], X[k + 1], by[k + 1], bz[k + 1], (-dz / l) * w, 0, (dx / l) * w, glow, glow);
    }
    thread.dirty();
    trail.dirty();
    wires.instanceMatrix.needsUpdate = true;
    bobs.instanceMatrix.needsUpdate = true;
    bobs.instanceColor.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ rippletank
function rippletank(d, A, mats, ctx) {
  const P = d.params, S = d.size, Rt = P.radius, ns = P.n, fx = [];
  const pale = mixHex(A, 0xffffff, 0.45), vio = mixHex(VIOLET, 0xffffff, 0.1);
  let hi = -1e9, lo = 1e9;
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; for (const r of [0, Rt * 0.5, Rt + 2 * S]) { const g = ctx.ground(Math.cos(a) * r, Math.sin(a) * r); hi = Math.max(hi, g); lo = Math.min(lo, g); } }
  const yS = hi + 1.1 * S, yW = yS + 0.7 * S, Rw = Rt + 1.3 * S;   // the surface at rest; the wall's top
  const b = new Builder();
  // the tank: a ring wall, its coping, its dark floor under the light
  b.cyl(Rw, Rw + 0.5 * S, yW - (lo - 1.5), 48, mat(0, (yW + lo - 1.5) / 2, 0), STONE[1], 0, true);
  b.cyl(Rt, Rt, yW - (yS - 1.2 * S), 48, mat(0, (yW + yS - 1.2 * S) / 2, 0, 0, 0, 0, -1, 1, 1), STONE[2], 0, true);
  b.add(new THREE.RingGeometry(Rt, Rw, 48, 1), mat(0, yW, 0, -Math.PI / 2, 0, 0), STONE[3]);
  b.add(new THREE.RingGeometry(Rw - 0.35 * S, Rw - 0.1 * S, 48, 1), mat(0, yW + 0.02, 0, -Math.PI / 2, 0, 0), RIM);
  b.add(new THREE.CircleGeometry(Rt, 48), mat(0, yS - 1.2 * S, 0, -Math.PI / 2, 0, 0), STONE[0]);
  // the bridge on two piers, along the line the dippers run on
  const ca = Math.cos(P.beta), sa = Math.sin(P.beta), Ue = Rw + 3 * S;
  const at = (u, y, v = 0) => V3(u * ca - v * sa, y, u * sa + v * ca);
  const base = ctx.ground(0, 0), yB = base + P.bridge, tH = 2.4 * S;
  for (const q of [-1, 1]) {
    const u = q * Ue;
    for (const s of [-1, 1]) {
      const v = s * (2 * S + 0.14 * P.bridge), f = at(u, 0, v), gl = ctx.ground(f.x, f.z);
      beam(b, at(u, gl - 0.8, v), at(u, yB + tH + 0.3 * S, s * 1.2 * S), 1.3 * S, STONE[2]);
      b.box(2.6 * S, 1.6, 2.6 * S, mat(f.x, gl, f.z, 0, -P.beta, 0), STONE[0]);
    }
    const f0 = at(u, 0, 0), g0 = ctx.ground(f0.x, f0.z), yc = g0 + (yB - g0) * 0.4, vc = 2 * S + 0.14 * P.bridge * 0.62;
    beam(b, at(u, yc, -vc), at(u, yc, vc), 0.8 * S, STONE[3]);
    b.box(2.6 * S, 1.2 * S, 3.4 * S, mat(f0.x, yB + tH + 0.8 * S, f0.z, 0, -P.beta, 0), STONE[3]);
    const lp = at(u, yB + tH + 2.2 * S, 0);
    b.ico(0.9 * S, 1, mat(lp.x, lp.y, lp.z), mixHex(A, 0xffffff, 0.3), PULSE);
  }
  const nseg = Math.max(6, Math.round((2 * Ue) / (4.5 * S)));
  for (let i = 0; i < nseg; i++) {
    const u0 = -Ue + (2 * Ue * i) / nseg, u1 = -Ue + (2 * Ue * (i + 1)) / nseg;
    beam(b, at(u0, yB, 0), at(u1, yB, 0), 1 * S, STONE[2]);
    beam(b, at(u0, yB + tH, 0), at(u1, yB + tH, 0), 1.1 * S, STONE[3]);
    if (i % 2) beam(b, at(u0, yB, 0), at(u1, yB + tH, 0), 0.45 * S, STONE[1]);
    else beam(b, at(u0, yB + tH, 0), at(u1, yB, 0), 0.45 * S, STONE[1]);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the surface: a disc of light, raised and lit by the rings going over it
  const NG = 52, sg = new THREE.PlaneGeometry(2 * Rt, 2 * Rt, NG - 1, NG - 1);
  sg.rotateX(-Math.PI / 2);
  const nv = sg.attributes.position.count, sp = sg.attributes.position.array;
  const col = new Float32Array(nv * 3).fill(1), em = new Float32Array(nv).fill(1e-4);
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sg.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const inside = new Uint8Array(nv), vx = new Float32Array(nv), vz = new Float32Array(nv);
  for (let i = 0; i < nv; i++) { vx[i] = sp[i * 3]; vz[i] = sp[i * 3 + 2]; sp[i * 3 + 1] = yS; inside[i] = Math.hypot(vx[i], vz[i]) < Rt - 0.25 * S ? 1 : 0; }
  const surface = lightMesh(sg, fx, 1);
  group.add(surface);
  // the dippers: a carriage under the bridge for each, a rod through it, a violet tip
  const instMat = worldMaterial({ unique: true });
  const cb = new Builder();
  cb.box(2.2 * S, 1.6 * S, 2.2 * S, null, STONE[3]);
  cb.box(2.4 * S, 0.3 * S, 2.4 * S, mat(0, -0.8 * S, 0), RIM);
  const carriages = instanced(cb.build(), instMat, ns);
  const rb = new Builder();
  rb.box(0.3 * S, 1, 0.3 * S, mat(0, 0.5, 0), RIM);
  const rods = instanced(rb.build(), instMat, ns);
  const tb = new Builder();
  tb.ico(0.75 * S, 1, null, VIOLET, 1.4);
  const tips = instanced(tb.build(), instMat, ns);
  group.add(carriages, rods, tips);
  const glow = lightPoints(ns, fx, mixHex(VIOLET, 0xffffff, 0.35), 4 * S, 1);
  group.add(glow.pts);
  const k = TAU / P.lambda, w = TAU / P.wave, cv = new THREE.Color(vio), cp = new THREE.Color(pale);
  const su = new Float64Array(ns), sx = new Float64Array(ns), sz = new Float64Array(ns), sph = new Float64Array(ns);
  const height = yB + tH + 3.2 * S;
  return finish({ group, light: V3(0, yS + 1, 0), focus: V3(0, (yS + yB) / 2, 0), span: Ue + 1.6 * S, height, solid: { r: Rw, top: height, low: 0 } }, fx, [instMat], (t) => {
    // where the dippers are (drawn apart and together), and their beats (stepped one from the next)
    const cyc = 0.5 - 0.5 * Math.cos((TAU * t) / P.cycle);
    const sep = P.lambda * (P.mode === 'steer' ? P.dmid : P.dmin + (P.dmax - P.dmin) * cyc);
    const dph = P.mode === 'spread' ? 0 : Math.PI * 0.9 * Math.sin((TAU * t) / (P.cycle * 1.5) + 0.7);
    for (let j = 0; j < ns; j++) {
      su[j] = (j - (ns - 1) / 2) * sep; sx[j] = su[j] * ca; sz[j] = su[j] * sa; sph[j] = j * dph;
      const tipY = yS + 0.45 * S + 0.45 * S * Math.cos(w * t + sph[j]), p = at(su[j], 0, 0);
      carriages.setMatrixAt(j, trs(_m, p.x, yB - 0.9 * S, p.z, 0, -P.beta, 0, 1, 1, 1));
      rods.setMatrixAt(j, trs(_m, p.x, tipY, p.z, 0, 0, 0, 1, yB - 0.2 * S - tipY, 1));
      tips.setMatrixAt(j, trs(_m, p.x, tipY, p.z, 0, 0, 0, 1, 1, 1));
      glow.pos[j * 3] = p.x; glow.pos[j * 3 + 1] = tipY; glow.pos[j * 3 + 2] = p.z; glow.al[j] = 0.7;
    }
    for (const im of [carriages, rods, tips]) im.instanceMatrix.needsUpdate = true;
    glow.dirty();
    // the rings: each dipper's, falling off with distance; where they add, crests of light
    // over a violet veil; where they cancel, dark
    const cw = Math.cos(w * t), swt = Math.sin(w * t);
    for (let i = 0; i < nv; i++) {
      if (!inside[i]) continue;
      let re = 0, im = 0;
      for (let j = 0; j < ns; j++) {
        const r = Math.hypot(vx[i] - sx[j], vz[i] - sz[j]), a = k * r - sph[j], f = 1 / Math.sqrt(1 + r / (2 * P.lambda));
        re += Math.cos(a) * f; im += Math.sin(a) * f;
      }
      const hn = clamp((re * cw + im * swt) / ns, -1, 1), env = Math.min(1, Math.hypot(re, im) / ns), crest = hn > 0 ? hn * hn : 0;
      sp[i * 3 + 1] = yS + 0.4 * S * hn;
      const m = Math.min(1, crest * 1.4);
      col[i * 3] = cv.r + (cp.r - cv.r) * m; col[i * 3 + 1] = cv.g + (cp.g - cv.g) * m; col[i * 3 + 2] = cv.b + (cp.b - cv.b) * m;
      em[i] = 0.05 + 0.22 * env * env + 0.95 * crest * env;
    }
    sg.attributes.position.needsUpdate = true;
    sg.attributes.color.needsUpdate = true;
    sg.attributes.emissive.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ basins
function basins(d, A, mats, ctx) {
  const P = d.params, S = d.size, L = P.levels, K = P.radix, T0 = P.first, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), pale = mixHex(A, 0xffffff, 0.5), vio = mixHex(VIOLET, 0xffffff, 0.15);
  // the basins, larger as they go down, each set where the last one pours, winding round the tower
  const rb = [], C = [], psi = [];
  for (let i = 0; i < L; i++) rb.push((1.4 + 0.28 * i) * S);
  const poolR = rb[L - 1] + 1.4 * S;
  let x = Math.cos(P.turn) * (rb[0] + 3 * S), z = Math.sin(P.turn) * (rb[0] + 3 * S);
  for (let i = 0; i <= L; i++) {
    C.push([x, z]);
    if (i === L) break;
    const ps = P.turn + P.dir * (Math.PI / 2 + i * P.delta), rn = i + 1 < L ? rb[i + 1] : poolR, st = rb[i] + 0.55 * rn + 0.6 * S;
    psi.push(ps);
    x += Math.cos(ps) * st; z += Math.sin(ps) * st;
  }
  const g = C.map(([cx, cz]) => ctx.ground(cx, cz));
  // the pool at the foot
  let phi = -1e9, plo = 1e9;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, gg = ctx.ground(C[L][0] + Math.cos(a) * (poolR + 0.7 * S), C[L][1] + Math.sin(a) * (poolR + 0.7 * S)); phi = Math.max(phi, gg); plo = Math.min(plo, gg); }
  phi = Math.max(phi, g[L]); plo = Math.min(plo, g[L]);
  const yPw = phi + 0.8 * S, yPs = phi + 0.4 * S;
  // the axles' heights, from the lowest up: each far enough under the last to clear it as it tips
  const Y = new Array(L);
  Y[L - 1] = Math.max(g[L - 1] + 1.3 * rb[L - 1] + 2.2 * S, yPw + 1.3 * rb[L - 1] + 1.5 * S);
  for (let i = L - 2; i >= 0; i--) Y[i] = Math.max(Y[i + 1] + Math.max(P.drop, 1.15 * rb[i] + 0.3 * rb[i + 1] + 0.6 * S), g[i] + 1.3 * rb[i] + 2.2 * S);
  const b = new Builder();
  // the tower, its arm and spout over the highest basin, a violet lamp on it
  const g0 = ctx.ground(0, 0), yT = Y[0] + 6.5 * S, spout = V3(C[0][0], Y[0] + 3.4 * S, C[0][1]);
  b.cyl(2.2 * S, 2.7 * S, 2.6, 8, mat(0, g0 - 0.2, 0), STONE[1]);
  b.cyl(0.9 * S, 1.5 * S, yT - g0 + 1, 8, mat(0, (yT + g0 - 1) / 2, 0), STONE[2]);
  for (const f of [0.33, 0.66]) b.cyl(1.55 * S - 0.5 * S * f, 1.55 * S - 0.5 * S * f, 0.5 * S, 8, mat(0, g0 + (yT - g0) * f, 0), RIM);
  b.cyl(1.5 * S, 1.1 * S, 1.4 * S, 8, mat(0, yT + 0.4 * S, 0), STONE[3]);
  b.ico(1.1 * S, 1, mat(0, yT + 2.1 * S, 0), VIOLET, PULSE);
  beam(b, V3(0, Y[0] + 5 * S, 0), V3(spout.x, spout.y + 1.4 * S, spout.z), 0.8 * S, STONE[3]);
  b.cone(0.5 * S, 1.3 * S, 6, mat(spout.x, spout.y + 0.65 * S, spout.z, Math.PI, 0, 0), RIM);
  // each basin's pillar and the yoke it swings in
  for (let i = 0; i < L; i++) {
    const [cx, cz] = C[i], pt = Y[i] - 1.3 * rb[i], ax = -Math.sin(psi[i]), az = Math.cos(psi[i]), hf = 1.15 * rb[i] + 0.3 * S;
    b.cyl(0.55 * S + 0.1 * rb[i], 0.75 * S + 0.12 * rb[i], pt - g[i] + 1, 6, mat(cx, (pt + g[i] - 1) / 2, cz), STONE[1 + (i % 2)]);
    beam(b, V3(cx - ax * hf, pt, cz - az * hf), V3(cx + ax * hf, pt, cz + az * hf), 0.7 * S, STONE[3]);
    for (const s of [-1, 1]) {
      beam(b, V3(cx + s * ax * hf, pt, cz + s * az * hf), V3(cx + s * ax * hf, Y[i] + 0.4 * S, cz + s * az * hf), 0.6 * S, STONE[2]);
      b.box(0.8 * S, 0.8 * S, 0.8 * S, mat(cx + s * ax * hf, Y[i], cz + s * az * hf, 0, -psi[i], 0), RIM);
    }
  }
  // the pool: a ring wall at the foot, a dark floor
  const [qx, qz] = C[L];
  b.cyl(poolR + 0.7 * S, poolR + 0.9 * S, yPw - (plo - 1), 32, mat(qx, (yPw + plo - 1) / 2, qz), STONE[1], 0, true);
  b.cyl(poolR, poolR, yPw - (yPs - 0.8 * S), 32, mat(qx, (yPw + yPs - 0.8 * S) / 2, qz, 0, 0, 0, -1, 1, 1), STONE[2], 0, true);
  b.add(new THREE.RingGeometry(poolR, poolR + 0.7 * S, 32, 1), mat(qx, yPw, qz, -Math.PI / 2, 0, 0), STONE[3]);
  b.add(new THREE.CircleGeometry(poolR, 32), mat(qx, yPs - 0.8 * S, qz, -Math.PI / 2, 0, 0), STONE[0]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const pb = new Builder();
  pb.add(new THREE.CircleGeometry(poolR - 0.1 * S, 32), mat(qx, yPs, qz, -Math.PI / 2, 0, 0), pale, 1);
  const pool = lightMesh(pb.build(), fx, 0.45);
  group.add(pool);
  // the basins themselves (one shape, each scaled to its size, tipping about its axle), and
  // the light in them
  const ub = new Builder();
  ub.cyl(1, 0.75, 0.8, 14, mat(0, -0.2, 0), STONE[3], 0, true);
  ub.cyl(0.94, 0.7, 0.78, 14, mat(0, -0.19, 0, 0, 0, 0, -1, 1, 1), STONE[1], 0, true);
  ub.cyl(0.75, 0.75, 0.12, 14, mat(0, -0.6, 0), STONE[2]);
  ub.cyl(1.03, 1.03, 0.1, 14, mat(0, 0.18, 0), RIM);
  ub.box(0.45, 0.08, 0.36, mat(1.1, 0.19, 0), RIM);
  ub.box(0.18, 0.18, 2.3, null, STONE[2]);
  const instMat = worldMaterial({ unique: true });
  const bowls = instanced(ub.build(), instMat, L);
  const lb = new Builder();
  lb.add(new THREE.CircleGeometry(1, 18), mat(0, 0, 0, -Math.PI / 2, 0, 0), pale, 1);
  const liquid = lightInstanced(lb.build(), fx, L, 0.8);
  group.add(bowls, liquid);
  // the streams: one from each basin as it tips (and the violet thread from the spout)
  const SEG = 10, streams = quadMesh(L * SEG * 2, fx, lit, 0.95), thread = quadMesh(2, fx, vio, 0.9);
  group.add(streams.mesh, thread.mesh);
  // time: the highest tips every T0; the i-th each Pi[i] T0, DL later for each level above it
  const Pi = [1];
  for (let i = 1; i < L; i++) Pi.push(Pi[i - 1] * K[i - 1]);
  const DL = 2.4, TMAX = 1.75;
  const ownTau = (i, t) => { const s = t - DL * i, per = Pi[i] * T0; return s - Math.floor(s / per) * per; };
  const tilt = (tau) => (tau < 1.2 ? TMAX * ease(tau / 1.2) : tau < 2.4 ? TMAX : tau < 3.6 ? TMAX * (1 - ease((tau - 2.4) / 1.2)) : 0);
  const fillOf = (i, t, tau) => {
    const drain = tau < 0.5 ? 1 : tau < DL ? 1 - (tau - 0.5) / (DL - 0.5) : 0;
    if (i === 0) return tau < DL ? drain : (tau - DL) / (T0 - DL);
    const su = t - DL * (i - 1), pu = Pi[i - 1] * T0, qi = Math.floor(su / pu), tu = su - qi * pu, k = K[i - 1];
    const r = ((qi % k) + k) % k, p = clamp((tu - 0.5) / (DL - 0.5), 0, 1);
    if (r === 0) return tu < DL ? (k - 1 + p) / k : drain;
    return (r - 1 + p) / k;
  };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c1 = new THREE.Vector3(), _d = new THREE.Vector3(), _m3 = new THREE.Matrix4();
  const height = yT + 3.4 * S;
  let span = Math.hypot(...C[L]) + poolR + 0.9 * S;
  for (let i = 0; i < L; i++) span = Math.max(span, Math.hypot(...C[i]) + 1.2 * rb[i]);
  return finish({ group, light: spout.clone(), focus: V3(0, (g0 + yT) / 2, 0), span, height, solid: { r: span * 0.8, top: height, low: 0 } }, fx, [instMat], (t) => {
    let poolFlash = 0;
    for (let i = 0; i < L; i++) {
      const tau = ownTau(i, t), th = tilt(tau), fill = clamp(fillOf(i, t, tau), 0, 1), [cx, cz] = C[i], r = rb[i];
      trs(_m, cx, Y[i], cz, 0, -psi[i], -th, r, r, r);
      bowls.setMatrixAt(i, _m);
      if (fill < 0.02) liquid.setMatrixAt(i, ZERO);
      else {
        const rr = (0.7 + 0.24 * fill) * 0.97;
        liquid.setMatrixAt(i, _m3.multiplyMatrices(_m, trs(_m2, 0, -0.54 + fill * 0.68, 0, 0, 0, 0, rr, 1, rr)));
        liquid.setColorAt(i, _c.setScalar(0.6 + 0.6 * fill));
      }
      // its stream, while it pours: from the lip to the basin below (or the pool)
      const pour = tau > 0.5 && tau < DL ? Math.sin((Math.PI * (tau - 0.5)) / (DL - 0.5)) : 0;
      if (pour <= 0.01) { for (let s = 0; s < SEG * 2; s++) hideSeg(streams, i * SEG * 2 + s); continue; }
      if (i === L - 1) poolFlash = pour;
      const u = 1.1 * Math.cos(th) + 0.19 * Math.sin(th), v = -1.1 * Math.sin(th) + 0.19 * Math.cos(th);
      _a.set(cx + u * r * Math.cos(psi[i]), Y[i] + v * r, cz + u * r * Math.sin(psi[i]));
      if (i + 1 < L) _b.set(C[i + 1][0], Y[i + 1] - 0.2 * rb[i + 1], C[i + 1][1]); else _b.set(qx, yPs, qz);
      _c1.set(_a.x + (_b.x - _a.x) * 0.45, _a.y - 0.2 * S, _a.z + (_b.z - _a.z) * 0.45);
      const wd = (0.14 * r + 0.1 * S) * (0.4 + 0.6 * pour), sx = -Math.sin(psi[i]) * wd, sz = Math.cos(psi[i]) * wd;
      let px = _a.x, py = _a.y, pz = _a.z;
      for (let s = 0; s < SEG; s++) {
        const q = (s + 1) / SEG, q1 = 1 - q;
        _d.set(q1 * q1 * _a.x + 2 * q1 * q * _c1.x + q * q * _b.x, q1 * q1 * _a.y + 2 * q1 * q * _c1.y + q * q * _b.y, q1 * q1 * _a.z + 2 * q1 * q * _c1.z + q * q * _b.z);
        seg(streams, (i * SEG + s) * 2, px, py, pz, _d.x, _d.y, _d.z, sx, 0, sz, pour, pour * 0.8);
        seg(streams, (i * SEG + s) * 2 + 1, px, py, pz, _d.x, _d.y, _d.z, 0, wd, 0, pour * 0.7, pour * 0.6);
        px = _d.x; py = _d.y; pz = _d.z;
      }
    }
    for (const im of [bowls, liquid]) im.instanceMatrix.needsUpdate = true;
    liquid.instanceColor.needsUpdate = true;
    streams.dirty();
    // the violet thread from the spout, never stopping
    const ft = 0.75 + 0.25 * Math.sin(t * 9.1) * Math.sin(t * 3.7), tw = 0.14 * S, ty = Y[0] - 0.1 * S;
    seg(thread, 0, spout.x, spout.y, spout.z, spout.x, ty, spout.z, tw, 0, 0, ft, ft);
    seg(thread, 1, spout.x, spout.y, spout.z, spout.x, ty, spout.z, 0, 0, tw, ft, ft);
    thread.dirty();
    pool.userData.fx[2] = 1 + 2.2 * poolFlash;
  });
}

// ------------------------------------------------------------------ epicycles
function epicycles(d, A, mats, ctx) {
  const P = d.params, S = d.size, T = P.terms, K = T.length, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), pale = mixHex(A, 0xffffff, 0.55), vio = mixHex(VIOLET, 0xffffff, 0.1);
  const base = ctx.ground(0, 0);
  const plane = new THREE.Group();
  plane.position.y = base + P.alt;
  plane.quaternion.setFromAxisAngle(V3(Math.cos(P.tiltDir), 0, Math.sin(P.tiltDir)), P.tilt);
  const group = new THREE.Group();
  group.add(plane);
  // how many circles are given it on its r-th turn (two at the least), and how far each is
  // let out at time t (each new one let out over the first part of a turn)
  const mOf = (r) => 2 + ((((r + P.r0) % (K - 1)) + (K - 1)) % (K - 1));
  const fac = (j, t) => {
    if (j === 0) return 1;
    const tr = t / P.period, r = Math.floor(tr), u = tr - r;
    const cur = j < mOf(r) ? 1 : 0, prev = j < mOf(r - 1) ? 1 : 0;
    return prev + (cur - prev) * ease(clamp(u / 0.18, 0, 1));
  };
  const penAt = (t, full) => {
    const s = (P.dir * TAU * t) / P.period;
    let x = 0, z = 0;
    for (let j = 0; j < K; j++) { const a = (full ? 1 : fac(j, t)) * T[j].amp, g = T[j].f * s + T[j].ph; x += a * Math.cos(g); z += a * Math.sin(g); }
    return [x, z];
  };
  // how far it reaches with every circle out
  let ext = 0;
  for (let i = 0; i < 128; i++) {
    const s = (i / 128) * TAU;
    let x = 0, z = 0;
    for (let j = 0; j < K; j++) { ext = Math.max(ext, Math.hypot(x, z) + T[j].amp); const g = T[j].f * s + T[j].ph; x += T[j].amp * Math.cos(g); z += T[j].amp * Math.sin(g); }
    ext = Math.max(ext, Math.hypot(x, z));
  }
  // the hub: a drum hung on nothing, a spire above, a pendant below with a violet lamp
  const b = new Builder();
  b.cyl(2.4 * S, 2.4 * S, 1.6 * S, 12, mat(0, 0, 0), STONE[2]);
  b.cyl(2.7 * S, 2.7 * S, 0.35 * S, 12, mat(0, 0.6 * S, 0), RIM);
  b.cone(1.3 * S, 4.5 * S, 8, mat(0, 0.8 * S + 2.25 * S, 0), STONE[3]);
  b.cone(1.6 * S, 5 * S, 8, mat(0, -0.8 * S - 2.5 * S, 0, Math.PI, 0, 0), STONE[1]);
  b.ico(0.9 * S, 1, mat(0, -6.2 * S, 0), VIOLET, PULSE);
  plane.add(new THREE.Mesh(b.build(), mats.body));
  // the circles (bands of pale stone), the arms (bars of stone), the joints (drums)
  const ringMat = worldMaterial({ unique: true, side: THREE.DoubleSide });
  const instMat = worldMaterial({ unique: true });
  const rg = new Builder();
  rg.add(new THREE.CylinderGeometry(1, 1, 0.45 * S, 64, 1, true), null, RIM);
  const rings = instanced(rg.build(), ringMat, K);
  const ab = new Builder();
  ab.box(1, 0.55 * S, 0.55 * S, mat(0.5, 0, 0), STONE[3]);
  const arms = instanced(ab.build(), instMat, K);
  const jb = new Builder();
  jb.cyl(0.8 * S, 0.8 * S, 0.9 * S, 8, null, STONE[2]);
  jb.cyl(0.35 * S, 0.35 * S, 1.1 * S, 6, null, lit, 1.1);
  const joints = instanced(jb.build(), instMat, K);
  plane.add(rings, arms, joints);
  // the pen
  const pb = new Builder();
  pb.ico(0.95 * S, 1, null, pale, 1);
  const pen = lightMesh(pb.build(), fx, 1);
  const penGlow = lightPoints(1, fx, pale, 5 * S, 1);
  penGlow.al[0] = 1;
  plane.add(pen, penGlow.pts);
  // the figure it is coming to, faint and violet, a little below its plane
  const M2 = 200, gb = new Builder(), gw = 0.32 * S;
  let prev = penAt(0, true);
  for (let i = 1; i <= M2; i++) {
    const cu = penAt((i / M2) * P.period, true), dx = cu[0] - prev[0], dz = cu[1] - prev[1], l = Math.hypot(dx, dz) || 1, wx = (-dz / l) * gw, wz = (dx / l) * gw, y = -0.35 * S;
    gb.quad([prev[0] - wx, y, prev[1] - wz], [prev[0] + wx, y, prev[1] + wz], [cu[0] + wx, y, cu[1] + wz], [cu[0] - wx, y, cu[1] - wz], 0xffffff, 0.6);
    gb.quad([prev[0], y - gw, prev[1]], [prev[0], y + gw, prev[1]], [cu[0], y + gw, cu[1]], [cu[0], y - gw, cu[1]], 0xffffff, 0.45);
    prev = cu;
  }
  const ghost = lightMesh(gb.build(), fx, 0.35);
  ghost.material.uniforms.uTint.value.setHex(vio);
  plane.add(ghost);
  // what the pen has drawn this last turn, fading behind it
  const M = 220, trace = quadMesh(M * 2, fx, lit, 1);
  plane.add(trace.mesh);
  const tx = new Float64Array(M + 1), tz = new Float64Array(M + 1);
  const cx = new Float64Array(K + 1), cz = new Float64Array(K + 1), ra = new Float64Array(K);
  const lift = ext * Math.sin(P.tilt);
  const height = base + P.alt + lift + 6 * S;
  const light = V3(0, -6.2 * S, 0).applyQuaternion(plane.quaternion).add(plane.position);
  return finish({ group, light, focus: V3(0, base + P.alt, 0), span: ext + 1, height, solid: { r: ext, top: height, low: base + P.alt - lift - 7 * S } }, fx, [ringMat, instMat], (t) => {
    const s = (P.dir * TAU * t) / P.period;
    cx[0] = 0; cz[0] = 0;
    for (let j = 0; j < K; j++) {
      ra[j] = fac(j, t) * T[j].amp;
      const g = T[j].f * s + T[j].ph;
      cx[j + 1] = cx[j] + ra[j] * Math.cos(g); cz[j + 1] = cz[j] + ra[j] * Math.sin(g);
    }
    for (let j = 0; j < K; j++) {
      const r = ra[j];
      if (r < 0.05) { rings.setMatrixAt(j, ZERO); arms.setMatrixAt(j, ZERO); joints.setMatrixAt(j, ZERO); continue; }
      rings.setMatrixAt(j, trs(_m, cx[j], 0, cz[j], 0, 0, 0, r, 1, r));
      arms.setMatrixAt(j, trs(_m, cx[j], 0, cz[j], 0, -Math.atan2(cz[j + 1] - cz[j], cx[j + 1] - cx[j]), 0, r, 1, 1));
      if (j > 0) joints.setMatrixAt(j, trs(_m, cx[j], 0, cz[j], 0, 0, 0, 1, 1, 1));
    }
    for (const im of [rings, arms, joints]) im.instanceMatrix.needsUpdate = true;
    pen.position.set(cx[K], 0.2 * S, cz[K]);
    penGlow.pos[0] = cx[K]; penGlow.pos[1] = 0.2 * S; penGlow.pos[2] = cz[K];
    penGlow.dirty();
    for (let i = 0; i <= M; i++) { const q = i === 0 ? [cx[K], cz[K]] : penAt(t - (i / M) * P.period * 0.985, false); tx[i] = q[0]; tz[i] = q[1]; }
    const w = 0.3 * S, y = 0.25 * S;
    for (let i = 0; i < M; i++) {
      const dx = tx[i + 1] - tx[i], dz = tz[i + 1] - tz[i], l = Math.hypot(dx, dz) || 1;
      const ea = Math.pow(1 - i / M, 1.3), eb = Math.pow(1 - (i + 1) / M, 1.3);
      seg(trace, i * 2, tx[i], y, tz[i], tx[i + 1], y, tz[i + 1], (-dz / l) * w, 0, (dx / l) * w, ea, eb);
      seg(trace, i * 2 + 1, tx[i], y, tz[i], tx[i + 1], y, tz[i + 1], 0, w * 0.8, 0, ea * 0.8, eb * 0.8);
    }
    trace.dirty();
  });
}

// ------------------------------------------------------------------ quincunx
function quincunx(d, A, mats, ctx) {
  const P = d.params, S = d.size, Nr = P.rows, pc = P.pitch, dy = pc * 0.95, G = P.grains, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), pale = mixHex(A, 0xffffff, 0.55), vio = mixHex(VIOLET, 0xffffff, 0.15);
  const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
  const gl = (x, z) => ctx.ground(x * cy + z * sy, -x * sy + z * cy);
  const nb = Nr + 1, halfW = (nb * pc) / 2, hw = halfW + 0.8 * S, th = 1.8 * S, pd = 1.4 * S, pr = 0.38 * S, Hb = P.binH;
  let hi = -1e9, lo = 1e9;
  for (let i = 0; i <= 10; i++) for (const z of [-th / 2 - 4 * S, 0, th / 2 + 4 * S]) { const g = gl(-hw - 2 + (i / 10) * (2 * hw + 4), z); hi = Math.max(hi, g); lo = Math.min(lo, g); }
  const yP = hi + 1.2;                                   // the plinth's top: the bins' floor
  const yRow = (r) => yP + Hb + dy * 0.9 + (Nr - 1 - r) * dy, yTop = yRow(0), yRel = yTop + dy * 1.3, yApex = yRel + 1.4 * S;
  const yBase = yRow(Nr - 1) - 0.2 * dy;
  const pegX = (r, j) => (j - r / 2) * pc, pegTop = (r) => yRow(r) + pr + 0.32 * S;
  const b = new Builder();
  // the plinth, and the wall standing on it: square below, its upper part the triangle of pegs
  b.box(2 * hw + 4 * S, yP - (lo - 1.5), th + 7 * S, mat(0, (yP + lo - 1.5) / 2, 0), STONE[1]);
  const sh = new THREE.Shape();
  sh.moveTo(-hw, yP - 0.2); sh.lineTo(hw, yP - 0.2); sh.lineTo(hw, yBase); sh.lineTo(1.4 * pc, yApex); sh.lineTo(-1.4 * pc, yApex); sh.lineTo(-hw, yBase); sh.lineTo(-hw, yP - 0.2);
  const wall = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, steps: 1, curveSegments: 1 });
  wall.translate(0, 0, -th / 2);
  b.add(wall, null, STONE[2]);
  // its coping along the sloping edges and the flat top
  beam(b, V3(hw, yBase, 0), V3(1.4 * pc, yApex, 0), th + 0.4 * S, STONE[3]);
  beam(b, V3(-hw, yBase, 0), V3(-1.4 * pc, yApex, 0), th + 0.4 * S, STONE[3]);
  b.box(2.8 * pc + 0.8 * S, 0.6 * S, th + 0.4 * S, mat(0, yApex + 0.1 * S, 0), STONE[3]);
  // the pegs right through it, standing out of both faces
  for (let r = 0; r < Nr; r++) for (let j = 0; j <= r; j++) b.cyl(pr, pr, th + 2 * pd, 6, mat(pegX(r, j), yRow(r), 0, Math.PI / 2, 0, 0), j % 2 ? STONE[3] : RIM);
  // the bins: fins through the wall at its foot
  for (let i = 0; i <= nb; i++) b.box(0.3 * S, Hb, th + 2 * pd, mat((i - nb / 2) * pc, yP + Hb / 2, 0), STONE[3]);
  // the hopper on the top, a spout over each face, a violet lamp in it
  const zg = th / 2 + pd * 0.5;
  b.cyl(3.2 * S, 1.9 * S, 3 * S, 10, mat(0, yApex + 0.4 * S + 1.5 * S, 0), STONE[3]);
  b.cyl(3.35 * S, 3.35 * S, 0.35 * S, 10, mat(0, yApex + 3.4 * S, 0), RIM);
  for (const s of [-1, 1]) b.cone(0.6 * S, yApex + 0.4 * S - yRel, 6, mat(0, (yApex + 0.4 * S + yRel) / 2, s * zg, Math.PI, 0, 0), STONE[2]);
  b.ico(1.1 * S, 1, mat(0, yApex + 3.9 * S, 0), VIOLET, PULSE);
  // and at each end a pair of struts, to the ground on either side
  for (const q of [-1, 1]) for (const s of [-1, 1]) {
    const x = q * (hw + 0.4 * S), z = s * (th / 2 + 7 * S);
    beam(b, V3(x, gl(x, z) - 0.6, z), V3(x, yP + Hb * 0.9, 0), 1.2 * S, STONE[1]);
  }
  const board = new THREE.Group();
  board.rotation.y = P.yaw;
  board.add(new THREE.Mesh(b.build(), mats.body));
  const group = new THREE.Group();
  group.add(board);
  // the light: grains, the pegs' ends (violet, as often as grains have passed them), the
  // bins' fill, and the curve the bins will come to
  const NP = (Nr * (Nr + 1)) / 2;
  const grains = lightPoints(2 * G, fx, pale, 0.8 * S, 1);
  const pegs = lightPoints(2 * NP, fx, vio, 2.4 * S, 1);
  const fill = quadMesh(2 * nb, fx, lit, 0.4);
  board.add(grains.pts, pegs.pts, fill.mesh);
  for (let f = 0; f < 2; f++) for (let r = 0; r < Nr; r++) for (let j = 0; j <= r; j++) {
    const k = f * NP + (r * (r + 1)) / 2 + j;
    pegs.pos.set([pegX(r, j), yRow(r), (f ? -1 : 1) * (th / 2 + pd + 0.1 * S)], k * 3);
  }
  const sig = Math.sqrt(Nr) / 2, Ec = G / (sig * Math.sqrt(TAU)), gs = (Hb - 0.6) / (Ec * 1.3);
  const cb = new Builder(), cw = 0.22 * S;
  for (const s of [-1, 1]) {
    const z = s * (th / 2 + pd + 0.15 * S);
    let px = null, py = 0;
    for (let i = 0; i <= 48; i++) {
      const x = -halfW + 0.3 * pc + (i / 48) * (2 * halfW - 0.6 * pc), kk = x / pc;
      const y = yP + Math.min(Hb - 0.2, gs * Ec * Math.exp(-(kk * kk) / (2 * sig * sig)));
      if (px !== null) cb.quad([px, py - cw, z], [px, py + cw, z], [x, y + cw, z], [x, y - cw, z], 0xffffff, 1);
      px = x; py = y;
    }
  }
  const curve = lightMesh(cb.build(), fx, 0.8);
  curve.material.uniforms.uTint.value.setHex(vio);
  board.add(curve);
  // the run: G grains a face, one every dt; each falls, goes left or right at every peg
  const tD = 0.5, hopT = P.hop, tF = 0.55, dt = P.dt;
  const tLand = (G - 1) * dt + dt / 2 + tD + Nr * hopT + tF + 0.2, tCurve = tLand + 1, tDrain = tCurve + 9, cycle = tDrain + 4.5;
  const salt = d.seed[4] | 0;
  let planned = null, plannedCy = null;
  const plan = (cyc) => {
    const out = [];
    for (let f = 0; f < 2; f++) {
      const J = new Int16Array(G * (Nr + 1)), bin = new Int16Array(G), stack = new Int16Array(G), jit = new Float32Array(G), dd = new Float32Array(G), count = new Int16Array(nb);
      for (let i = 0; i < G; i++) {
        let j = 0;
        for (let r = 0; r < Nr; r++) { J[i * (Nr + 1) + r] = j; if (hash2(cyc * 977 + f * 13 + salt, i * 64 + r) < 0.5) j++; }
        J[i * (Nr + 1) + Nr] = j;
        bin[i] = j; stack[i] = count[j]++;
        jit[i] = (hash2(i * 7 + f, cyc + salt) - 0.5) * 0.56 * pc;
        dd[i] = hash2(i * 11 + f, cyc * 3 + salt) * 1.2;
      }
      out.push({ J, bin, stack, jit, dd });
    }
    return out;
  };
  const hits = new Float32Array(NP), flash = new Float32Array(NP), landed = new Float32Array(nb);
  const height = yApex + 5.2 * S;
  return finish({ group, light: V3(0, yApex + 3.9 * S, 0), focus: V3(0, (yP + yTop) / 2, 0), span: hw + 1.2 * S, height, solid: { r: hw, top: height, low: 0 } }, fx, [], (t) => {
    const cyc = Math.floor(t / cycle), tc = t - cyc * cycle;
    if (plannedCy !== cyc) { planned = plan(cyc); plannedCy = cyc; }
    const drainK = clamp((tc - tDrain) / 2.2, 0, 1);
    for (let f = 0; f < 2; f++) {
      const pl = planned[f], sg = f ? -1 : 1, z = sg * (th / 2 + pd * 0.5);
      hits.fill(0); flash.fill(0); landed.fill(0);
      for (let i = 0; i < G; i++) {
        const tau = tc - i * dt - f * dt * 0.5, o = (f * G + i) * 3, Jo = i * (Nr + 1);
        const xb = (pl.bin[i] - Nr / 2) * pc, yLand = Math.min(yP + (pl.stack[i] + 0.5) * gs, yP + Hb - 0.4);
        let x, y, a = 0.9;
        if (tau < 0) { grains.al[f * G + i] = 0; continue; }
        if (tau < tD) { const u = tau / tD; x = 0; y = yRel + (pegTop(0) - yRel) * u * u; }
        else if (tau < tD + Nr * hopT) {
          const v = (tau - tD) / hopT, r = Math.floor(v), u = v - r;
          const x0 = pegX(r, pl.J[Jo + r]), y0 = pegTop(r);
          const x1 = r < Nr - 1 ? pegX(r + 1, pl.J[Jo + r + 1]) : xb, y1 = r < Nr - 1 ? pegTop(r + 1) : yP + Hb + 0.3;
          x = x0 + (x1 - x0) * (1 - (1 - u) * (1 - u)); y = y0 + (y1 - y0) * u * u + 0.5 * S * Math.sin(Math.PI * u);
        } else if (tau < tD + Nr * hopT + tF) {
          const u = (tau - tD - Nr * hopT) / tF; x = xb + pl.jit[i] * u; y = yP + Hb + 0.3 + (yLand - yP - Hb - 0.3) * u * u;
        } else {
          x = xb + pl.jit[i]; y = yLand; a = 0.75;
          const td = tc - tDrain - pl.dd[i];
          if (td > 0) { y -= 4.9 * td * td; a *= clamp((y - (yP - 1)) / 1, 0, 1); }
          if (y >= yP - 0.2) landed[pl.bin[i]]++;
        }
        // the pegs it has passed, and the one it is on
        const rPast = Math.min(Nr, Math.floor((tau - tD) / hopT) + 1);
        for (let r = 0; r < rPast; r++) {
          const k = (r * (r + 1)) / 2 + pl.J[Jo + r], ago = tau - tD - r * hopT;
          hits[k]++;
          if (ago < 0.3) flash[k] = Math.max(flash[k], 1 - ago / 0.3);
        }
        grains.pos[o] = x; grains.pos[o + 1] = y; grains.pos[o + 2] = z;
        grains.al[f * G + i] = a;
      }
      // the pegs: each row lit by how often each of its pegs has been passed, the most
      // passed the brightest (Pascal's triangle, in light)
      for (let r = 0; r < Nr; r++) {
        let mx = 1;
        for (let j = 0; j <= r; j++) mx = Math.max(mx, hits[(r * (r + 1)) / 2 + j]);
        for (let j = 0; j <= r; j++) {
          const k = (r * (r + 1)) / 2 + j;
          pegs.al[f * NP + k] = (0.1 + 0.75 * (hits[k] / mx)) * (1 - 0.8 * drainK) + 0.9 * flash[k];
        }
      }
      for (let k = 0; k < nb; k++) {
        const xb = (k - Nr / 2) * pc, h = Math.min(Hb - 0.4, landed[k] * gs), zf = sg * (th / 2 + 0.06);
        if (h < 0.05) { hideSeg(fill, f * nb + k); continue; }
        seg(fill, f * nb + k, xb, yP, zf, xb, yP + h, zf, 0.42 * pc, 0, 0, 0.6, 0.3);
      }
    }
    // the curve: faint while they fall, bright when they have all come down
    curve.userData.fx[2] = 0.3 + 0.7 * ease(clamp((tc - tLand) / 2, 0, 1)) * (1 - drainK);
    grains.dirty(); pegs.dirty(); fill.dirty();
  });
}

// ------------------------------------------------------------------ the set

export const SET = {
  pendulumwave: {
    code: 'PWV', cls: 'Pendulum wave', nouns: ['Pendulums', 'Wave', 'Phase', 'Beat', 'Rank', 'Return'], place: 'any', kin: ['choir', 'turning', 'chladni'], voice: ['glass', 'breath'],
    params(R, size) {
      const T = R.pick([90, 120, 120, 150]);
      const n = R.pick([12, 13, 14, 15, 16, 18]);
      const K = n - 1 + R.int(0, 3);
      const P = { n, T, K, longest: R.range(21, 28) * size, spacing: Math.min(R.range(2.7, 3.4), 56 / (n - 1)) * size, amp: R.range(3.4, 4.6) * size, mode: R.pick(['level', 'stepped', 'stepped']) };
      const len = (n - 1) * P.spacing + 6 * size;
      P.text = `${numw(n)} pendulums hung in a row from a truss of stone ${Math.round(len)} meters long, the longest ${Math.round(P.longest)} meters: in ${T} seconds the longest swings ${K} times, the next ${K + 1}, the shortest ${K + n - 1}. They fall out of step into a snake, a wave, a scatter; at half time they swing in two ranks, and every ${T} seconds they come back into one line, and the violet thread through them draws straight.`;
      return P;
    },
    build: pendulumwave,
  },
  rippletank: {
    code: 'RPL', cls: 'Ripple tank', nouns: ['Tank', 'Ripple', 'Fringe', 'Interference', 'Source', 'Node'], place: 'any', kin: ['chladni', 'lotus', 'halo'], voice: ['breath', 'whale'],
    params(R, size) {
      const n = R.pick([2, 2, 3]), mode = R.pick(['spread', 'steer', 'both']);
      const P = { n, mode, radius: R.range(19, 24) * size, lambda: R.range(3.6, 5) * size, wave: R.range(1.7, 2.4), cycle: R.pick([40, 50, 60]), dmin: 0.6, dmax: n === 2 ? 4.2 : 2.4, dmid: n === 2 ? R.range(1.6, 2.6) : R.range(1.1, 1.6), bridge: R.range(15, 19) * size, beta: R.range(0, TAU) };
      const how = mode === 'spread' ? `the rods draw apart and together again every ${P.cycle} seconds, and the fans open out and close up`
        : mode === 'steer' ? 'each rod dips a little after the one before it, and the brightest fan swings slowly from side to side, as a listening array turns its ear'
          : 'the rods draw apart and together, and dip each a little after the last, so the fans open and close and swing from side to side';
      P.text = `A round tank of stone ${Math.round(P.radius * 2)} meters across, brimming with light, and over it a bridge on two piers from which ${lower(numw(n))} rods dip into it, each sending out rings. Where the rings cross they make bright fans with dark lines between; ${how}.`;
      return P;
    },
    build: rippletank,
  },
  basins: {
    code: 'TIP', cls: 'Basin clock', nouns: ['Basins', 'Cascade', 'Tipping', 'Measure', 'Carry', 'Patience'], place: 'any', kin: ['fountain', 'tidegate', 'clockwork'], voice: ['breath', 'grains'],
    params(R, size) {
      const levels = R.int(6, 8), radix = Array.from({ length: levels - 1 }, () => R.pick([2, 2, 3, 3, 4]));
      const P = { levels, radix, first: R.range(5, 7), drop: R.range(4.4, 5.4) * size, delta: R.range(0.55, 0.72), turn: R.range(0, TAU), dir: R.chance(0.5) ? 1 : -1 };
      const total = radix.reduce((a, k) => a * k, 1) * P.first;
      const dur = total < 5400 ? `${Math.round(total / 60)} minutes` : `${(total / 3600).toFixed(1)} hours`;
      P.text = `${numw(levels)} stone basins on pillars winding down round a tower, each larger than the one above; a violet thread runs from the tower's spout into the highest, which tips into the next every ${Math.round(P.first)} seconds. The second tips only when it has had ${lower(numw(radix[0]))} pours, the third when it has had ${lower(numw(radix[1]))} of the second's, and so on down: the lowest pours into the pool at its foot once in about ${dur}.`;
      return P;
    },
    build: basins,
  },
  epicycles: {
    code: 'EPY', cls: 'Epicycles', nouns: ['Epicycle', 'Deferent', 'Circle', 'Figure', 'Approach', 'Series'], place: 'any', floats: true, kin: ['armillary', 'clockwork', 'planet'], voice: ['whale', 'glass'],
    params(R, size) {
      const K = R.int(6, 9);
      // the first circle the greatest, the next an ellipse's or a loop's (never a figure of
      // many points), the rest smaller and smaller, out of step: a figure with no symmetry
      const second = R.pick([-1, 2]);
      const terms = [{ f: 1, amp: 1, ph: R.range(0, TAU) }, { f: second, amp: R.range(0.3, 0.5), ph: R.range(0, TAU) }];
      const pool = [-1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6].filter((f) => f !== second);
      while (terms.length < K) {
        const f = pool.splice(Math.min(pool.length - 1, R.int(0, 2)), 1)[0];
        terms.push({ f, amp: R.range(0.45, 0.9) * (terms.length === 2 ? 0.3 : 0.24) / Math.pow(Math.abs(f), 0.9), ph: R.range(0, TAU) });
      }
      const Rc = R.range(18, 26) * size;
      let mx = 0;
      for (let i = 0; i < 256; i++) { const s = (i / 256) * TAU; let x = 0, z = 0; for (const q of terms) { x += q.amp * Math.cos(q.f * s + q.ph); z += q.amp * Math.sin(q.f * s + q.ph); } mx = Math.max(mx, Math.hypot(x, z)); }
      for (const q of terms) q.amp *= Rc / mx;
      terms.sort((a, b) => b.amp - a.amp);
      const P = { terms, alt: R.range(22, 30) * size, period: R.pick([24, 30, 36]), tilt: R.range(0.1, 0.28), tiltDir: R.range(0, TAU), r0: R.int(0, 20), dir: R.chance(0.5) ? 1 : -1 };
      P.text = `${numw(K)} circles of pale stone hung in the air ${Math.round(P.alt)} meters up, each turning on the rim of the last at a whole number of turns to the first's one; the last carries a point of light that draws a closed figure ${Math.round(Rc * 2)} meters across in ${P.period} seconds. Each time round it is given one circle more and comes nearer the figure laid faintly in violet beside it; when it has them all it lets them go and begins again.`;
      return P;
    },
    build: epicycles,
  },
  quincunx: {
    code: 'QNX', cls: 'Chance board', nouns: ['Quincunx', 'Chance', 'Peg', 'Bin', 'Curve', 'Trial'], place: 'any', kin: ['fountain', 'chandelier', 'pages'], voice: ['grains', 'chirp'],
    params(R, size) {
      const rows = R.int(10, 14);
      const P = { rows, pitch: R.range(2.8, 3.3) * size, grains: R.pick([120, 150, 180]), dt: R.range(0.32, 0.45), hop: R.range(0.26, 0.34), binH: R.range(9, 12.5) * size, yaw: R.range(0, TAU) };
      const H = P.binH + rows * P.pitch * 0.95 + 9 * size;
      P.text = `A wall of dark stone ${Math.round(H)} meters tall with ${(rows * (rows + 1)) / 2} pegs through it in a triangle and ${rows + 1} bins at its foot. Grains of light fall down both its faces, ${P.grains} a side; each goes left or right at every peg as chance has it, the pegs light as often as they are passed, and the bins fill into the bell curve drawn over them in violet. Then the bins are emptied, and it begins again.`;
      return P;
    },
    build: quincunx,
  },
};
