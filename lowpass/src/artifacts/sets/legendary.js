import * as THREE from 'three';
import { Builder, mat, mul } from '../../render/build.js';
import { worldMaterial, glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam } from '../parts.js';

// The LEGENDARY tier: four families at the surface, each 70-130 m, monumental and slow,
// in gold (0xffd27a) beside their own light, each turning through something over about a
// minute, so that it rewards circling it.
//   conjunction  great rings of stone nested on pivots between two pillars, each turning
//                its own number of half-turns; once a cycle they come into one plane and a
//                line of gold passes through all of them
//   zeno         a causeway between pairs of standing stones, each pair a fixed fraction of
//                the last in height and in distance, so it seems to run on to a horizon; a
//                light of gold walks it a pair at a time, each step the same time and each
//                shorter than the last, lighting them in procession, and never arrives
//   knell        a bell of light as tall as a tower, hanging over the clearing from nothing;
//                its clapper of gold swings in a turning plane and each stroke rings it in
//                another mode, its still meridians showing dark between the bright (floats)
//   hanoi        stone discs as wide as a clearing on three pegs: one at a time, never a
//                larger on a smaller, they are lifted, carried and set down until the stack
//                stands on the next peg; then it goes on to the next

const GOLD = 0xffd27a;
const GA = Math.PI * (3 - Math.sqrt(5));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Yax = new THREE.Vector3(0, 1, 0);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one'];
const num = (n) => NUM[n] ?? String(n);
const ORD = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];
const Cap = (s) => s[0].toUpperCase() + s.slice(1);
const list = (a) => (a.length === 1 ? `${a[0]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// a legendary thing is always huge: its size moves it a little, not by half
const kOf = (size) => 0.7 + 0.3 * size;

// light drawn after the fog, faded in with the artifact; its entry's g is a gain set per frame
function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  const f = { m, o: opacity, g: 1 };
  fx.push(f);
  mesh.userData.fx = f;
  return mesh;
}
// points of light, moved every frame
function sparks(n, color, size, fx, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  const f = { m, o: opacity, g: 1 };
  fx.push(f);
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  return { p, g, pos, sz, al, f };
}
function finish(out, update) {
  return {
    ...out,
    mats: [...out.fx.map((f) => f.m), ...(out.own || [])],
    update(t, beat, c) {
      if (update) update(t, beat, c);
      for (const f of out.fx) f.m.uniforms.uOpacity.value = f.o * f.g * (c.reveal ?? 1) * (0.8 + (c.pulse ?? 1) * 0.25);
    },
  };
}
// built in a frame turned by psi about y
function turned(ctx, psi) {
  const c = Math.cos(psi), s = Math.sin(psi), inner = new THREE.Group();
  inner.rotation.y = psi;
  return { inner, ground: (x, z) => ctx.ground(x * c + z * s, -x * s + z * c), out: (v) => v.clone().applyAxisAngle(Yax, psi) };
}
// a hewn stone: a square prism tapering to `top` of its foot, its foot at M's origin, its
// top face paler
function monolith(b, M, w, h, dpt, color, top = 0.75) {
  const g = new THREE.CylinderGeometry(top * 0.7071, 0.7071, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  b.add(g, mul(M, mat(0, 0, 0, 0, 0, 0, w, h, dpt)), (px, py) => (py > 0.97 ? mixHex(color, RIM, 0.22) : color), 0, { flat: true });
}
// one lamp of a row of boxes (36 vertices each) set to a color and a brightness
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function setLamp(col, em, i, c, e) {
  for (let v = i * 36; v < (i + 1) * 36; v++) { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; em[v] = Math.max(0.004, e); }
}

// ================================================================== conjunction
function conjunction(d, A, mats, ctx) {
  const P = d.params, k = P.k, R = rng(d.seed[5]), fx = [], own = [];
  const F = turned(ctx, P.bearing), G = F.ground, N = P.rings, R0 = P.radius;
  const b = new Builder(), edge = mixHex(STONE[3], RIM, 0.25);
  // the plinth: three tiers, the lowest as high as the highest ground under it
  const Rp1 = R0 + 14 * k, Rp2 = R0 + 10 * k, Rp3 = R0 * 0.5;
  let gmin = G(0, 0), gmax = gmin;
  for (let i = 0; i < 32; i++) for (const f of [0.35, 0.7, 1.05]) {
    const a = (i / 32) * TAU, g = G(Math.cos(a) * Rp1 * f, Math.sin(a) * Rp1 * f);
    gmin = Math.min(gmin, g); gmax = Math.max(gmax, g);
  }
  const t1 = gmax + 2.4 * k, t2 = t1 + 3 * k, t3 = t2 + 2.6 * k, foot = gmin - 3 * k;
  const Hc = t3 + R0 + 6 * k;                 // the heart: the rings sweep a sphere of R0 about it, clear of the dais
  b.cyl(Rp1, Rp1 + 0.9 * k, t1 - foot, 20, mat(0, (t1 + foot) / 2, 0), STONE[0]);
  b.cyl(Rp1 + 0.2 * k, Rp1 + 0.2 * k, 0.5 * k, 20, mat(0, t1 - 0.25 * k, 0), edge);
  b.cyl(Rp2, Rp2 + 0.5 * k, t2 - t1 + 0.5 * k, 20, mat(0, (t2 + t1 - 0.5 * k) / 2, 0), STONE[1]);
  b.cyl(Rp2 + 0.2 * k, Rp2 + 0.2 * k, 0.45 * k, 20, mat(0, t2 - 0.22 * k, 0), edge);
  b.cyl(Rp3, Rp3 + 0.6 * k, t3 - t2 + 0.5 * k, 16, mat(0, (t3 + t2 - 0.5 * k) / 2, 0), STONE[2]);
  b.torus(Rp3 * 0.62, 0.35 * k, 4, 40, mat(0, t3 + 0.1 * k, 0, Math.PI / 2, 0, 0), GOLD, 1);
  // lamps round the second tier, kept off the pillars' feet
  for (let i = 0; i < 20; i++) {
    const a = ((i + 0.5) / 20) * TAU, r = Rp2 - 0.8 * k;
    b.box(0.9 * k, 0.8 * k, 0.9 * k, mat(Math.cos(a) * r, t2 + 0.4 * k, Math.sin(a) * r, 0, -a, 0), A, PULSE);
  }
  // two pillars on the second tier holding the outermost ring's pivots (on x), buttressed
  for (const q of [-1, 1]) {
    const xp = q * (R0 + 5 * k);
    b.box(7 * k, 2.5 * k, 9 * k, mat(xp, t2 + 1.05 * k, 0), STONE[2]);
    monolith(b, mat(xp, t2 + 2.2 * k, 0), 4.4 * k, Hc + 3.6 * k - (t2 + 2.2 * k), 6 * k, STONE[2], 0.75);
    b.box(5.6 * k, 1.6 * k, 7.6 * k, mat(xp, Hc + 4.3 * k, 0), STONE[3]);
    b.box(4.6 * k, 0.5 * k, 6.6 * k, mat(xp, Hc + 5.3 * k, 0), edge);
    b.ico(1.1 * k, 0, mat(xp, Hc + 6.3 * k, 0), GOLD, PULSE);
    // the pin the ring turns on, and its boss of gold on the pillar's face
    b.cyl(0.9 * k, 0.9 * k, 3.6 * k, 8, mat(q * (R0 + 1.9 * k), Hc, 0, 0, 0, Math.PI / 2), RIM);
    b.cyl(1.9 * k, 1.9 * k, 0.8 * k, 10, mat(q * (R0 + 3.2 * k), Hc, 0, 0, 0, Math.PI / 2), GOLD, 1);
    beam(b, V(q * (R0 + 6.5 * k), t2 + (Hc - t2) * 0.4, 0), V(q * (R0 + 12.5 * k), t1 - 0.4 * k, 0), 2.4 * k, STONE[1]);
  }
  F.inner.add(new THREE.Mesh(b.build(), mats.body));
  // the rings: a chain of gimbals, ring i turning about x (even) or y (odd) in ring i-1's
  // frame; each lies in its own xy plane, so when every angle is a whole half-turn they are one plane
  const rm = worldMaterial({ unique: true });
  own.push(rm);
  const radii = Array.from({ length: N }, (_, i) => R0 * (1 - (0.6 * i) / (N - 1)));
  // (rings 4-5 and R0 >= 30k keep a radial gap of >= 4.6k between neighbours: more than a
  // band, the next band and a tick, so no two touch at any angle)
  const tubes = radii.map((_, i) => (1.3 - 0.1 * i) * k);
  const gs = [];
  let parent = F.inner;
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group();
    if (i === 0) g.position.y = Hc;
    parent.add(g);
    gs.push(g);
    parent = g;
    const rb = new Builder(), Ri = radii[i], tb = tubes[i];
    rb.add(new THREE.TorusGeometry(Ri, tb, 4, 96), mat(0, 0, 0, 0, 0, 0, 1, 1, P.blade), i % 2 ? STONE[3] : edge);
    // its graduation: ticks round its outer edge, every fourth long and lit on the rhythm
    // (none where it is pinned: the pins it turns on pass there)
    const m = Math.max(12, 4 * Math.round((TAU * Ri) / (P.pitch * k * 4))), axA = i % 2 ? Math.PI / 2 : 0;
    for (let j = 0; j < m; j++) {
      const a = (j / m) * TAU, major = j % 4 === 0, L = (major ? 1.2 : 0.7) * k, r = Ri + tb + L / 2 - 0.25 * k;
      if (Math.abs(Math.sin(a - axA)) < 0.16) continue;
      rb.box(L, (major ? 0.6 : 0.4) * k, 0.7 * k, mat(Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a), major ? A : mixHex(A, RIM, 0.4), major ? PULSE : 0.8);
    }
    // the pins to the next ring in (or to the heart), along the next one's axis
    const ax = (i + 1) % 2 === 0 ? 'x' : 'y', rIn = i < N - 1 ? radii[i + 1] : P.heart * 0.8;
    const len = Ri - tb * 0.5 - rIn, mid = rIn + len / 2;
    for (const q of [-1, 1]) {
      const at = (r) => (ax === 'x' ? [q * r, 0] : [0, q * r]);
      const [px, py] = at(mid), [bx, by] = at(Ri - tb * 0.2);
      rb.cyl(0.5 * k, 0.5 * k, len, 6, mat(px, py, 0, 0, 0, ax === 'x' ? Math.PI / 2 : 0), RIM);
      rb.ico(tb * 0.95, 0, mat(bx, by, 0), GOLD, PULSE);
    }
    if (i === N - 1) rb.ico(P.heart, 1, mat(0, 0, 0), GOLD, PULSE);
    g.add(new THREE.Mesh(rb.build(), rm));
  }
  // the line of gold through all of them when they are one plane (along z, their common axis)
  const Lb = R0 * 2.3, fade = (y) => Math.max(0.004, Math.pow(Math.max(0, 1 - Math.abs(y) / Lb), 1.4));
  const bb = new Builder();
  bb.add(new THREE.CylinderGeometry(0.7 * k, 0.7 * k, 2 * Lb, 8, 12, true), mat(0, 0, 0, Math.PI / 2, 0, 0), GOLD, (x, y) => fade(y));
  bb.add(new THREE.CylinderGeometry(3 * k, 3 * k, 2 * Lb, 10, 12, true), mat(0, 0, 0, Math.PI / 2, 0, 0), mixHex(GOLD, A, 0.3), (x, y) => fade(y) * 0.22);
  const beamM = lightMesh(bb.build(), fx, 1, { fresnel: 0.35 });
  beamM.position.y = Hc;
  const hb = new Builder();
  hb.ico(P.heart * 2.4, 1, null, GOLD, 1);
  const heart = lightMesh(hb.build(), fx, 0.5, { fresnel: 0.7 });
  heart.position.y = Hc;
  F.inner.add(beamM, heart);
  // gold dust rising through the rings from the dais
  const NS = 140, S = sparks(NS, mixHex(GOLD, 0xffffff, 0.3), 1.1 * k, fx, 0.9);
  const M = Array.from({ length: NS }, () => ({ a: R() * TAU, r: Math.sqrt(R()) * R0 * 0.85, ph: R(), sp: 0.5 + R() }));
  F.inner.add(S.p);
  const group = new THREE.Group();
  group.add(F.inner);
  const top = Hc + R0 + tubes[0] + 2 * k;
  const out = { group, fx, own, light: F.out(V(0, Hc, 0)), focus: F.out(V(0, Hc * 0.7, 0)), span: Rp1 + 1 * k, clear: Rp1 + 6 * k, height: top, solid: { r: Rp1, top, low: 0 } };
  const Tc = P.period, dw = P.dwell, ymax = Hc + R0 * 0.7;
  return finish(out, (t) => {
    const u = ((((t + P.phase) / Tc) % 1) + 1) % 1;
    const v = clamp((u - dw) / (1 - 2 * dw), 0, 1), f = v - Math.sin(TAU * v) / TAU;
    let al = 1;
    for (let i = 0; i < N; i++) {
      const th = Math.PI * P.turns[i] * f * (i % 2 ? -1 : 1) * P.dir;
      if (i % 2 === 0) gs[i].rotation.x = th; else gs[i].rotation.y = th;
      al *= Math.cos(th) ** 2;
    }
    const s = al ** 8;
    beamM.userData.fx.g = s;
    heart.userData.fx.g = 0.35 + 0.65 * s;
    rm.uniforms.uEmisBoost.value = 1 + 1.2 * s;
    for (let i = 0; i < NS; i++) {
      const m = M[i], h = (m.ph + t * 0.012 * m.sp) % 1, a = m.a + t * 0.03;
      S.pos[i * 3] = Math.cos(a) * m.r; S.pos[i * 3 + 1] = t3 + h * (ymax - t3); S.pos[i * 3 + 2] = Math.sin(a) * m.r;
      S.al[i] = Math.sin(Math.PI * h) * (0.25 + 0.75 * s);
    }
    S.g.attributes.position.needsUpdate = true;
    S.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ================================================================== zeno
function zeno(d, A, mats, ctx) {
  const P = d.params, k = P.k, R = rng(d.seed[5]), fx = [];
  const F = turned(ctx, P.bearing), G = F.ground, q = P.ratio, n = P.n, reach = P.reach, s0 = reach * (1 - q);
  const x0 = -reach / 2 + 6 * k, Xinf = x0 + reach;
  // gate j: s0 (1 + q + ... + q^(j-1)) from the first, everything in it q^j of the first's
  const gx = (j) => x0 + (s0 * (1 - q ** j)) / (1 - q), sp = (j) => s0 * q ** j;
  const b = new Builder(), lb = new Builder(), edge = mixHex(STONE[3], RIM, 0.25);
  const under = (xa, xb, W) => {
    let lo = Infinity, hi = -Infinity;
    for (const x of [xa, (xa + xb) / 2, xb]) for (const z of [-W, 0, W]) { const g = G(x, z); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    return [lo, hi];
  };
  // the causeway: a block to each gate, as wide as its gate, curbed; it narrows as they shrink
  const seg = (xa, xb, W, c, color) => {
    const [lo, hi] = under(xa, xb, W), top = hi + Math.max(0.5, 1.4 * k * c), bot = lo - 2 * k, xm = (xa + xb) / 2;
    b.box(xb - xa + 0.04, top - bot, 2 * W, mat(xm, (top + bot) / 2, 0), color);
    const cw = Math.max(0.15, 0.7 * k * c);
    for (const s of [-1, 1]) b.box(xb - xa + 0.04, cw * 0.6, cw, mat(xm, top + cw * 0.3, s * (W - cw / 2)), edge);
    return top;
  };
  const gates = [];
  for (let j = 0; j < n; j++) {
    const c = q ** j, W = P.w0 * c, xa = j === 0 ? gx(0) - 12 * k : gx(j) - sp(j - 1) / 2, xb = j === n - 1 ? Xinf + 1.5 * k * c : gx(j) + sp(j) / 2;
    const top = seg(xa, xb, W, c, STONE[j % 2]), h = P.tall * c * (0.95 + R() * 0.1);
    for (const s of [-1, 1]) {
      const z = s * (W - 1.9 * k * c);
      monolith(b, mat(gx(j), top - 0.3 * k * c, z, 0, (R() - 0.5) * 0.06, 0), 4.2 * k * c, h + 0.3 * k * c, 2.6 * k * c, STONE[1 + ((j + (s > 0 ? 1 : 0)) % 3)], 0.8);
      lb.box(2.4 * k * c, 1.0 * k * c, 1.5 * k * c, mat(gx(j), top + h + 0.4 * k * c, z), 0xffffff, 1);
    }
    gates.push({ x: gx(j), top, c });
  }
  // where they would meet: a small stone and a point of gold on it, at the limit
  const cl = q ** (n - 1), topL = gates[n - 1].top;
  const ped = Math.max(0.5, 2.4 * k * cl);
  b.box(ped * 1.1, ped, ped * 1.1, mat(Xinf, topL + ped / 2 - 0.05, 0), STONE[3]);
  lb.box(0.8 * k, 0.8 * k, 0.8 * k, mat(Xinf, topL + ped + 0.3 * k, 0), 0xffffff, 1);
  // the near end: a pedestal where the light waits
  const xd = gx(0) - 7 * k, top0 = gates[0].top;
  b.cyl(2.2 * k, 2.6 * k, 1.2 * k, 10, mat(xd, top0 + 0.6 * k, 0), STONE[3]);
  b.torus(2.4 * k, 0.2 * k, 4, 20, mat(xd, top0 + 1.2 * k, 0, Math.PI / 2, 0, 0), GOLD, 1);
  F.inner.add(new THREE.Mesh(b.build(), mats.body));
  const lg = lb.build(), col = lg.attributes.color.array, em = lg.attributes.emissive.array;
  F.inner.add(lightMesh(lg, fx, 0.95));
  // the walk: one gate a step, every step the same time and each a fraction q of the last;
  // past the last gate it goes on smaller still, and never arrives
  const extra = 4, Ts = P.step, lead = 2.5;
  const tAt = (j) => lead + j * Ts;                 // when it stands in gate j
  const tLim = tAt(n - 1 + extra), tReset = tLim + P.hold, Tcy = tReset + 5;
  const where = (jf) => {                           // its place at a fractional gate index (-1: the pedestal)
    if (jf < 0) return [xd + (gx(0) - xd) * (jf + 1), top0 + 3.2 * k];
    const j = Math.min(Math.floor(jf), n - 1), c = q ** jf;
    return [x0 + (s0 * (1 - q ** jf)) / (1 - q), gates[j].top + 3 * k * c];
  };
  const walkerAt = (tau) => {
    const u = clamp((tau - lead) / Ts, -1, n - 1 + extra), j0 = Math.floor(u), f = u - j0;
    const e = sstep(0.25, 1, f);
    const [xa, ya] = where(j0), [xb, yb] = where(j0 + 1 > n - 1 + extra ? j0 : j0 + 1);
    const arc = Math.sin(Math.PI * e) * (1.5 * k * q ** Math.max(0, j0) + 0.25 * Math.abs(xb - xa));
    return [xa + (xb - xa) * e, ya + (yb - ya) * e + arc, q ** Math.max(0, u)];
  };
  const wb = new Builder();
  wb.ico(1.4 * k, 1, null, mixHex(GOLD, 0xffffff, 0.3), 1);
  const walker = lightMesh(wb.build(), fx, 1, { fresnel: 0.3 });
  const NT = 20, T = sparks(NT, GOLD, 2.6 * k, fx, 1);
  for (let i = 0; i < NT; i++) T.sz[i] = 1 - i / NT;
  F.inner.add(walker, T.p);
  const cA = new THREE.Color(A), cG = new THREE.Color(GOLD);
  const group = new THREE.Group();
  group.add(F.inner);
  const H = top0 + P.tall * 1.05 + 1.5 * k;
  const out = { group, fx, light: F.out(V(gx(1), top0 + P.tall * 0.6, 0)), focus: F.out(V(0, P.tall * 0.3, 0)), span: reach / 2 + 8 * k, clear: Math.min(100, reach / 2 + 10 * k), height: H, solid: { r: reach / 2 + 8 * k, top: H, low: 0 } };
  return finish(out, (tt) => {
    const tau = (((tt + P.phase) % Tcy) + Tcy) % Tcy, back = sstep(tReset, tReset + 4, tau);
    // each gate it passes flares gold, and keeps a little of it a while
    for (let j = 0; j < n; j++) {
      const dt = tau - tAt(j);
      let e = 0.38, g = 0;
      if (dt >= 0) { g = Math.exp(-dt / P.memory); e = 0.38 + 0.7 * g + (dt < 1.5 ? Math.exp(-dt * 3) * 0.8 : 0); }
      e += (0.38 - e) * back; g *= 1 - back;
      _c1.copy(cA).lerp(cG, g);
      setLamp(col, em, j * 2, _c1, e);
      setLamp(col, em, j * 2 + 1, _c1, e);
    }
    const lim = sstep(tLim - 1, tLim + 1, tau) * (1 - back);
    _c2.copy(cA).lerp(cG, lim);
    setLamp(col, em, n * 2, _c2, 0.15 + lim * 1.4);
    lg.attributes.color.needsUpdate = true;
    lg.attributes.emissive.needsUpdate = true;
    const [wx, wy, wc] = walkerAt(tau), sc = Math.max(0.001, wc * Math.min(sstep(0, 1.2, tau), 1 - sstep(tLim - 2, tLim + 1, tau)));
    walker.position.set(wx, wy, 0);
    walker.scale.setScalar(sc);
    for (let i = 0; i < NT; i++) {
      const [px, py] = walkerAt(tau - i * 0.06);
      T.pos[i * 3] = px; T.pos[i * 3 + 1] = py; T.pos[i * 3 + 2] = 0;
      T.al[i] = Math.min(1, sc * 1.2) * (1 - i / NT) * 0.8;
    }
    T.g.attributes.position.needsUpdate = true;
    T.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ================================================================== knell
function knell(d, A, mats, ctx) {
  const P = d.params, k = P.k, fx = [];
  const H = P.height, Rl = P.lip, y0 = P.hang, w = P.waist, M = P.meridians, Q = P.parallels, VT = 0.82;
  // its profile: the radius at a fraction v of its height (0 the lip, 1 the crown)
  const prof = (v) => {
    let r = w + (1 - w) * Math.exp(-7 * v) + 0.04 * Math.sin(Math.PI * v);
    if (v > 0.84) r *= Math.sqrt(Math.max(0, 1 - ((v - 0.84) / 0.16) ** 2));
    return Rl * r;
  };
  // the lattice: ribs from the lip up into the crown, hoops round it
  const lb = new Builder();
  for (let j = 0; j < M; j++) {
    const a = (j / M) * TAU + P.rot, pts = [];
    for (let s = 0; s <= 26; s++) { const v = (s / 26) * VT, r = prof(v); pts.push(V(Math.cos(a) * r, y0 + v * H, Math.sin(a) * r)); }
    lb.tube(pts, 0.34 * k, 3, 0xffffff);
  }
  for (let q = 0; q < Q; q++) {
    const v = 0.8 * Math.pow(q / Q, 1.2), r = prof(v), pts = [];
    for (let s = 0; s <= 96; s++) { const a = (s / 96) * TAU; pts.push(V(Math.cos(a) * r, y0 + v * H, Math.sin(a) * r)); }
    lb.tube(pts, (q === 0 ? 0.55 : 0.3) * k, 3, 0xffffff);
  }
  const lg = lb.build();
  // the solid of it: the lip, the crown and its loops
  const sb = new Builder(), vc = 0.78, Rd = prof(0.84) * 1.03, Rc = prof(vc) * 1.03;
  const crownTop = y0 + 0.84 * H + 0.1648 * H;     // the dome's top (0.16 H, a little proud)
  // a loop standing on the crown, crossed by a second: its foot sunk in the dome
  const loopR = Math.min(Rl * 0.18, 0.12 * H), loopY = crownTop + loopR * 0.55;
  sb.torus(Rl + 0.2 * k, 0.95 * k, 6, 96, mat(0, y0, 0, Math.PI / 2, 0, 0), STONE[3]);
  sb.add(new THREE.SphereGeometry(1, 32, 7, 0, TAU, 0, Math.PI / 2), mat(0, y0 + 0.84 * H, 0, 0, 0, 0, Rd, 0.16 * H * 1.03, Rd), (x, y) => (y > 0.9 ? STONE[3] : STONE[2]), 0, { flat: true });
  sb.cyl(Rd, Rc, 0.06 * H, 32, mat(0, y0 + 0.81 * H, 0), STONE[1], 0, true);
  sb.add(new THREE.CircleGeometry(Rc, 32), mat(0, y0 + vc * H, 0, Math.PI / 2, 0, 0), STONE[0]);
  for (const ry of [0, Math.PI / 2]) sb.torus(loopR, 1.1 * k, 5, 32, mat(0, loopY, 0, 0, ry + P.rot, 0), STONE[3]);
  sb.ico(1.2 * k, 0, mat(0, loopY + loopR + 0.6 * k, 0), GOLD, PULSE);
  // a band of the light just over the lip
  const yb = y0 + 1.7 * k;
  sb.torus(prof((yb - y0) / H), 0.32 * k, 3, 96, mat(0, yb, 0, Math.PI / 2, 0, 0), mixHex(A, 0xffffff, 0.2), PULSE);
  const sg = sb.build();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(sg, mats.body));
  const lattice = lightMesh(lg, fx, 0.85);
  group.add(lattice);
  // a faint skin of light over the lattice, brightest at its edges
  const shp = [];
  for (let s = 0; s <= 16; s++) { const v = (s / 16) * 0.8; shp.push(new THREE.Vector2(prof(v) * 0.995, y0 + v * H)); }
  const shg = new THREE.LatheGeometry(shp, 48);
  const shb = new Builder();
  shb.add(shg, null, mixHex(A, 0xffffff, 0.3), 1);
  group.add(lightMesh(shb.build(), fx, 0.1, { fresnel: 0.9 }));
  // the clapper: a rod from under the crown and a ball of gold, swung against the wall
  const pivotY = y0 + vc * H - 0.5 * k, rb = P.ball, Lc = pivotY - (y0 + 0.12 * H);
  let thMax = 0.02;
  for (let th = 0.02; th < 0.9; th += 0.002) {
    const bx = Lc * Math.sin(th) + rb, by = pivotY - Lc * Math.cos(th);
    if (bx >= prof((by - y0) / H) - 1.0 * k) break;
    thMax = th;
  }
  const clap = new THREE.Group(), arm = new THREE.Group();
  clap.position.y = pivotY;
  clap.add(arm);
  const cb = new Builder();
  cb.box(1.4 * k, 1.0 * k, 1.4 * k, mat(0, 0, 0), STONE[3]);
  cb.box(0.5 * k, Lc - rb * 0.5, 0.5 * k, mat(0, -(Lc - rb * 0.5) / 2, 0), RIM);
  cb.ico(rb, 1, mat(0, -Lc, 0), GOLD, PULSE);
  arm.add(new THREE.Mesh(cb.build(), mats.glow));
  group.add(clap);
  // dust of gold shaken from the lip, falling a little way and gone
  const ND = 120, R = rng(d.seed[6]), D = sparks(ND, mixHex(GOLD, 0xffffff, 0.25), 0.9 * k, fx, 0.9);
  const DM = Array.from({ length: ND }, () => ({ a: R() * TAU, r: Rl * (0.9 + R() * 0.14), ph: R(), sp: 0.6 + R() * 0.8 }));
  group.add(D.p);
  // what each vertex needs to ring: where it is round the bell, how far up, which way is out
  const prep = (g) => {
    const p = g.attributes.position.array, n = p.length / 3, o = { base: Float32Array.from(p), cx: new Float32Array(n), cz: new Float32Array(n), gv: new Float32Array(n), v: new Float32Array(n), cm: {}, sm: {} };
    const modes = [...new Set(P.modes)];
    for (const m of modes) { o.cm[m] = new Float32Array(n); o.sm[m] = new Float32Array(n); }
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], r = Math.hypot(x, z), ph = Math.atan2(z, x), v = clamp((y - y0) / H, 0, 1);
      o.cx[i] = r > 1e-4 ? x / r : 0; o.cz[i] = r > 1e-4 ? z / r : 0;
      o.v[i] = v; o.gv[i] = Math.pow(1 - v, 1.3);
      for (const m of modes) { o.cm[m][i] = Math.cos(m * ph); o.sm[m][i] = Math.sin(m * ph); }
    }
    o.n = n;
    return o;
  };
  const LV = prep(lg), SV = prep(sg);
  const lcol = lg.attributes.color.array, lem = lg.attributes.emissive.array;
  const cA = new THREE.Color(mixHex(A, 0xffffff, 0.25)), cG = new THREE.Color(GOLD);
  const Ts = P.strike, wv = TAU / P.hum, amp = P.amp, tau = P.tau, len = P.modes.length;
  const strike = (j, t) => {
    const ts = (j - 0.5) * Ts, side = j % 2 ? 1 : -1, ps = P.prec * ts + P.rot + (side > 0 ? 0 : Math.PI), m = P.modes[((j % len) + len) % len], dt = t - ts;
    return { m, c: Math.cos(m * ps), s: Math.sin(m * ps), a: amp * Math.exp(-dt / tau) * Math.sin(wv * dt), br: Math.exp(-dt / (tau * 0.7)), front: dt * 0.32 };
  };
  const out = { group, fx, light: V(0, y0 + H * 0.4, 0), focus: V(0, y0 + H * 0.45, 0), span: Rl * 1.02, clear: Rl + 10 * k, height: loopY + loopR + 2 * k, solid: { r: Rl + 1 * k, top: loopY + loopR, low: y0 - 1.2 * k }, floats: true };
  return finish(out, (t0) => {
    const t = t0 + P.phase, j = Math.floor(t / Ts + 0.5);
    const S0 = strike(j, t), S1 = strike(j - 1, t);
    // the clapper: across and back at a steady pace, its plane turning
    const u = (((t / Ts + 0.5) % 2) + 2) % 2, tri = u < 1 ? 2 * u - 1 : 3 - 2 * u;
    clap.rotation.y = -(P.prec * t + P.rot);
    arm.rotation.z = thMax * tri;
    // the bell rings: each stroke's mode, out of true at its antinodes, still at its nodes
    const ring = (o, pos, col, em) => {
      const c0 = o.cm[S0.m], s0 = o.sm[S0.m], c1 = o.cm[S1.m], s1 = o.sm[S1.m];
      for (let i = 0; i < o.n; i++) {
        const k0 = c0[i] * S0.c + s0[i] * S0.s, k1 = c1[i] * S1.c + s1[i] * S1.s;
        const dl = o.gv[i] * (S0.a * k0 + S1.a * k1);
        pos[i * 3] = o.base[i * 3] + o.cx[i] * dl;
        pos[i * 3 + 2] = o.base[i * 3 + 2] + o.cz[i] * dl;
        if (col) {
          const v = o.v[i], b0 = Math.max(0, 1 - ((v - S0.front) / 0.08) ** 2), b1 = Math.max(0, 1 - ((v - S1.front) / 0.08) ** 2);
          const hot = S0.br * Math.abs(k0) + S1.br * Math.abs(k1);
          const e = 0.3 + 0.6 * hot + 0.7 * (S0.br * b0 + S1.br * b1);
          const gd = clamp(hot * 0.9 + (S0.br * b0 + S1.br * b1) * 0.6, 0, 1);
          col[i * 3] = cA.r + (cG.r - cA.r) * gd; col[i * 3 + 1] = cA.g + (cG.g - cA.g) * gd; col[i * 3 + 2] = cA.b + (cG.b - cA.b) * gd;
          em[i] = e;
        }
      }
    };
    ring(LV, lg.attributes.position.array, lcol, lem);
    ring(SV, sg.attributes.position.array, null, null);
    lg.attributes.position.needsUpdate = true;
    lg.attributes.color.needsUpdate = true;
    lg.attributes.emissive.needsUpdate = true;
    sg.attributes.position.needsUpdate = true;
    const shake = 0.25 + 0.75 * S0.br;
    for (let i = 0; i < ND; i++) {
      const m = DM[i], h = (m.ph + t0 * 0.035 * m.sp) % 1;
      D.pos[i * 3] = Math.cos(m.a) * m.r; D.pos[i * 3 + 1] = y0 - 0.5 * k - h * 13 * k; D.pos[i * 3 + 2] = Math.sin(m.a) * m.r;
      D.al[i] = (1 - h) * shake;
    }
    D.g.attributes.position.needsUpdate = true;
    D.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ================================================================== hanoi
function hanoi(d, A, mats, ctx) {
  const P = d.params, k = P.k, fx = [];
  const F = turned(ctx, P.bearing), G = F.ground, n = P.discs, th = P.thick, Rm = P.radius, D = 2 * Rm + 5 * k;
  const radii = Array.from({ length: n }, (_, i) => Rm * (0.4 + (0.6 * i) / (n - 1)));     // 0 the smallest
  const b = new Builder(), edge = mixHex(STONE[3], RIM, 0.25);
  // the plinth: a long block as high as the highest ground under it, a second step on it
  const Lx = 2 * D + 2 * Rm + 8 * k, Lz = 2 * Rm + 8 * k;
  let gmin = Infinity, gmax = -Infinity;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) { const g = G((i / 8 - 0.5) * Lx, (j / 4 - 0.5) * Lz); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
  const t1 = gmax + 2 * k, t2 = t1 + 2.5 * k, foot = gmin - 3 * k;
  b.box(Lx, t1 - foot, Lz, mat(0, (t1 + foot) / 2, 0), STONE[0]);
  b.box(Lx + 0.4 * k, 0.5 * k, Lz + 0.4 * k, mat(0, t1 - 0.25 * k, 0), edge);
  b.box(Lx - 5 * k, t2 - t1 + 0.2 * k, Lz - 5 * k, mat(0, (t2 + t1 - 0.2 * k) / 2, 0), STONE[1]);
  b.box(Lx - 4.6 * k, 0.4 * k, Lz - 4.6 * k, mat(0, t2 - 0.2 * k, 0), edge);
  const base = t2 + 1.2 * k, Hp = n * th + 3 * k, yTop = base + Hp + th / 2 + 4 * k;
  for (let p = 0; p < 3; p++) {
    const px = (p - 1) * D;
    b.cyl(5 * k, 5.6 * k, 1.4 * k, 16, mat(px, t2 + 0.5 * k, 0), STONE[2]);
    b.cyl(1.8 * k, 2.2 * k, Hp, 12, mat(px, base + Hp / 2, 0), STONE[3]);
    b.cyl(2.6 * k, 2.6 * k, 0.8 * k, 12, mat(px, base + Hp + 0.4 * k, 0), edge);
    b.ico(1.1 * k, 0, mat(px, base + Hp + 1.5 * k, 0), GOLD, PULSE);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; b.box(0.8 * k, 0.6 * k, 0.8 * k, mat(px + Math.cos(a) * 6.4 * k, t2 + 0.3 * k, Math.sin(a) * 6.4 * k, 0, -a, 0), A, PULSE); }
  }
  F.inner.add(new THREE.Mesh(b.build(), mats.body));
  // the discs: dark stone, a pale band round each, lamps in the band
  const discs = radii.map((r, i) => {
    const db = new Builder(), m = Math.max(10, Math.round((TAU * r) / (4 * k)));
    db.cyl(r, r, th * 0.94, 40, null, STONE[1 + (i % 3)]);
    db.cyl(r * 0.97, r * 0.97, th * 0.04, 40, mat(0, th * 0.49, 0), mixHex(STONE[3], RIM, 0.12));
    db.cyl(r + 0.15 * k, r + 0.15 * k, th * 0.22, 40, null, edge);
    for (let j = 0; j < m; j++) { const a = (j / m) * TAU; db.box(0.5 * k, th * 0.16, 1.0 * k, mat(Math.cos(a) * (r + 0.2 * k), 0, Math.sin(a) * (r + 0.2 * k), 0, -a, 0), A, j % 2 ? 1 : PULSE); }
    const mesh = new THREE.Mesh(db.build(), mats.glow);
    F.inner.add(mesh);
    return mesh;
  });
  // the moves of a whole transfer from peg 0 to peg 2, and where every disc is before each
  const moves = [];
  const solve = (m, a, c, via) => { if (m < 0) return; solve(m - 1, a, via, c); moves.push([m, a, c]); solve(m - 1, via, c, a); };
  solve(n - 1, 0, 2, 1);
  const states = [], pegs = [[...Array(n).keys()].reverse(), [], []];
  const snap = () => { const s = []; pegs.forEach((st, p) => st.forEach((m, l) => { s[m] = [p, l]; })); return s; };
  for (const [m, a, c] of moves) { states.push(snap()); pegs[a].pop(); pegs[c].push(m); }
  states.push(snap());
  const M = moves.length, yOf = (l) => base + th * (l + 0.5);
  // each transfer goes on from where the last ended: 0 -> 2, 2 -> 1, 1 -> 0; a move takes as
  // long as its path at the stone's own slow pace
  const lead = 2, rest = P.rest, sched = [0, 1, 2].map((c) => {
    const from = (3 - (c % 3)) % 3, to = (3 - ((c + 1) % 3)) % 3, sig = [from, 3 - from - to, to];
    let t = lead;
    const at = moves.map(([m, a, c2], i) => {
      const la = states[i][m][1], lb2 = states[i + 1][m][1], up = yTop - yOf(la), dn = yTop - yOf(lb2), dx = Math.abs(sig[c2] - sig[a]) * D;
      const dur = 1.4 + (up + dx + dn) / P.pace, o = { t0: t, dur, f1: up / (up + dx + dn), f2: (up + dx) / (up + dx + dn) };
      t += dur;
      return o;
    });
    return { sig, at, end: t, len: t + rest };
  });
  const T3 = sched[0].len + sched[1].len + sched[2].len;
  // the moving disc's ring of gold, and a flare over the peg a transfer ends on
  const rb = new Builder();
  rb.add(new THREE.TorusGeometry(1, 0.03, 4, 64), mat(0, 0, 0, Math.PI / 2, 0, 0), GOLD, 1);
  const ring = lightMesh(rb.build(), fx, 1);
  const fb = new Builder();
  fb.ico(3.2 * k, 1, null, GOLD, 1);
  const flare = lightMesh(fb.build(), fx, 0.8, { fresnel: 0.6 });
  F.inner.add(ring, flare);
  const group = new THREE.Group();
  group.add(F.inner);
  const out = { group, fx, light: F.out(V(0, base + Hp * 0.6, 0)), focus: F.out(V(0, base + Hp * 0.45, 0)), span: Lx / 2, clear: Math.min(100, Lx / 2 + 6 * k), height: yTop + th / 2 + 1 * k, solid: { r: Lx / 2, top: yTop + th / 2, low: 0 } };
  return finish(out, (t) => {
    let tau = (((t + P.phase) % T3) + T3) % T3, c = 0;
    while (c < 2 && tau >= sched[c].len) { tau -= sched[c].len; c++; }
    const S = sched[c];
    let mi = M;
    for (let i = 0; i < M; i++) if (tau < S.at[i].t0 + S.at[i].dur) { mi = i; break; }
    const st = states[Math.min(mi, M)];
    let gr = 0;
    for (let m = 0; m < n; m++) {
      const [p, l] = st[m];
      let x = (S.sig[p] - 1) * D, y = yOf(l);
      if (mi < M && moves[mi][0] === m && tau >= S.at[mi].t0) {
        const o = S.at[mi], u = (tau - o.t0) / o.dur, [, a, c2] = moves[mi];
        const xa = (S.sig[a] - 1) * D, xb = (S.sig[c2] - 1) * D, ya = yOf(l), yb = yOf(states[mi + 1][m][1]);
        // lifted clear of the peg, carried over, set down: a crane's three motions
        if (u < o.f1) { x = xa; y = ya + (yTop - ya) * sstep(0, o.f1, u); }
        else if (u < o.f2) { x = xa + (xb - xa) * sstep(o.f1, o.f2, u); y = yTop; }
        else { x = xb; y = yTop + (yb - yTop) * sstep(o.f2, 1, u); }
        ring.position.set(x, y, 0);
        ring.scale.setScalar(radii[m] + 0.9 * k);
        gr = sstep(0, 0.06, u) * (1 - sstep(0.94, 1, u));
      }
      discs[m].position.set(x, y, 0);
      discs[m].rotation.y = t * 0.02 * (m % 2 ? 1 : -1);
    }
    ring.userData.fx.g = gr;
    const done = sstep(S.end, S.end + 1, tau) * (1 - sstep(S.len - 1.5, S.len, tau));
    flare.position.set((S.sig[2] - 1) * D, base + Hp + 1.5 * k, 0);
    flare.userData.fx.g = done;
    flare.scale.setScalar(0.001 + done);
  });
}

export const SET = {
  conjunction: {
    code: 'CNJ', cls: 'Conjunction', nouns: ['Conjunction', 'Alignment', 'Meridian', 'Gimbal', 'Transit', 'Concord'], place: 'any', kin: ['armillary', 'clockwork', 'halo'], voice: ['glass', 'whale'],
    params(R, size) {
      const P = { k: kOf(size) };
      P.rings = R.int(4, 5);
      P.radius = R.range(30, 40) * P.k;
      P.blade = R.range(1.7, 2.6);
      P.pitch = R.range(2.6, 3.6);
      const law = R.pick(['harmonic', 'harmonic', 'fibonacci']);
      P.turns = (law === 'harmonic' ? [1, 2, 3, 4, 5, 6] : [1, 1, 2, 3, 5, 8]).slice(0, P.rings);
      P.period = R.range(80, 110);
      P.dwell = R.range(0.07, 0.11);
      P.phase = R() * 300;
      P.dir = R.chance(0.5) ? 1 : -1;
      P.heart = R.range(2.4, 3.2) * P.k;
      P.bearing = R() * TAU;
      P.text = `${Cap(num(P.rings))} great rings of stone, the outermost ${Math.round(P.radius * 2)} meters across, nested one in another on pivots of gold between two pillars over a stepped plinth. While the outermost makes one half-turn the others make ${list(P.turns.slice(1).map(num))}, drifting ever further out of true; every ${Math.round(P.period)} seconds they come back into one plane, and a line of gold passes through all of them.`;
      return P;
    },
    build: conjunction,
  },
  zeno: {
    code: 'ZNO', cls: 'Causeway of halves', nouns: ['Causeway', 'Approach', 'Horizon', 'Vanishing', 'Patience', 'Procession'], place: 'any', kin: ['choir', 'spine', 'archipelago'], voice: ['breath', 'glass'],
    params(R, size) {
      const P = { k: kOf(size) };
      P.ratio = R.range(0.84, 0.89);
      P.reach = R.range(96, 116) * P.k;
      P.n = Math.min(24, Math.floor(Math.log(0.07) / Math.log(P.ratio)) + 1);
      P.tall = R.range(38, 46) * P.k;
      P.w0 = R.range(9, 11) * P.k;
      P.step = R.range(2.4, 3.2);
      P.memory = R.range(12, 22);
      P.hold = R.range(7, 10);
      P.phase = R() * 300;
      P.bearing = R() * TAU;
      const pct = Math.round(P.ratio * 100);
      P.text = `A causeway between ${num(P.n)} pairs of standing stones, the first ${Math.round(P.tall)} meters tall; each pair stands ${pct} parts in a hundred of the last's height and of its distance, so the avenue seems to run on to a horizon that lies only ${Math.round(P.reach)} meters off. A light of gold walks it a pair at a time, every step taking the same ${P.step.toFixed(1)} seconds and each shorter than the one before, and never reaches the end.`;
      return P;
    },
    build: zeno,
  },
  knell: {
    code: 'KNL', cls: 'Bell of light', nouns: ['Bell', 'Knell', 'Toll', 'Peal', 'Canopy', 'Resonance'], place: 'any', floats: true, kin: ['medusa', 'chandelier', 'chladni'], voice: ['whale', 'glass'],
    params(R, size) {
      const P = { k: kOf(size) };
      P.height = R.range(60, 74) * P.k;
      P.lip = P.height * R.range(0.44, 0.52);
      P.waist = R.range(0.54, 0.64);
      P.hang = R.range(20, 27) * P.k;
      P.meridians = R.pick([18, 20, 24, 28]);
      P.parallels = R.int(8, 12);
      P.strike = R.range(7, 10);
      P.modes = R.pick([[2, 3, 4, 5], [2, 4, 3, 6], [3, 2, 5, 4], [2, 3, 2, 4, 2, 5]]);
      P.amp = R.range(1.6, 2.4) * P.k;
      P.tau = R.range(3, 4.5);
      P.hum = R.range(1.8, 2.6);
      P.prec = R.range(0.05, 0.09) * (R.chance(0.5) ? 1 : -1);
      P.ball = R.range(3, 4) * P.k;
      P.rot = R() * TAU;
      P.phase = R() * 300;
      const still = [...new Set(P.modes)].map((m) => num(2 * m));
      P.text = `A bell ${Math.round(P.height)} meters tall and ${Math.round(P.lip * 2)} across its lip, a lattice of ${num(P.meridians)} ribs and ${num(P.parallels)} hoops of light under a crown of stone, hanging ${Math.round(P.hang)} meters over the ground from nothing at all. Its clapper of gold swings in a plane that turns, striking every ${Math.round(P.strike)} seconds, and each stroke rings it another way: ${list(still)} meridians stay still and dark while the light between them sways.`;
      return P;
    },
    build: knell,
  },
  hanoi: {
    code: 'HNI', cls: 'Tower of discs', nouns: ['Tower', 'Discs', 'Transfer', 'Patience', 'Stack', 'Labour'], place: 'any', kin: ['temple', 'clockwork', 'archipelago'], voice: ['whale', 'grains'],
    params(R, size) {
      const P = { k: kOf(size) };
      P.discs = R.pick([4, 4, 5]);
      P.radius = R.range(16, 20) * P.k;
      P.thick = R.range(5.5, 7) * P.k;
      P.pace = (P.discs === 5 ? R.range(14, 17) : R.range(10, 13)) * P.k;
      P.rest = R.range(6, 9);
      P.phase = R() * 600;
      P.bearing = R() * TAU;
      const moves = 2 ** P.discs - 1;
      P.text = `${Cap(num(P.discs))} discs of stone, the largest ${Math.round(P.radius * 2)} meters across, on three pegs on a plinth ${Math.round(2 * (2 * P.radius + 5 * P.k) + 2 * P.radius + 8 * P.k)} meters long. One at a time and never a larger on a smaller, the discs are lifted, carried and set down until the whole stack stands on the next peg, in ${moves} moves; then it begins again.`;
      return P;
    },
    build: hanoi,
  },
};
