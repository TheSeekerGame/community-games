import * as THREE from 'three';
import { mat } from '../render/build.js';
import { TAU, clamp, damp, smoothstep } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { PULSE } from './parts.js';
import { hash3, orient, bar, petal, cloud, strips } from './deepkit.js';

// More of the deep's forms (deepforms.js registers them): a clock with no face, a fountain
// of light, a radiolarian's lattice, a sounding plate and its figures. Each is built of the
// Kit's four kinds of stuff in its stratum's colors, stands at its origin (or, built `mini`,
// hangs centered in the air with nothing on the ground), and moves only by t and dt.

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pale = (h, k = 0.3) => mixHex(h, 0xffffff, k);
const put = (cl, i, x, y, z) => { const p = cl.pos, j = i * 3; p[j] = x; p[j + 1] = y; p[j + 2] = z; };
const nearOf = (ctx) => (ctx && ctx.near) || 0;
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen'];
const num = (n) => NUMW[n] || String(n);
const Num = (n) => { const s = num(n); return s[0].toUpperCase() + s.slice(1); };
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _rx = new THREE.Matrix4().makeRotationX(Math.PI / 2);
const shift = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

// a quad wound to face away from `inside` (stone and lit are drawn one-sided)
function oquad(b, inside, p0, p1, p2, p3, color, em = 0) {
  _a.subVectors(p1, p0);
  _b.subVectors(p2, p0);
  _a.cross(_b);
  _b.copy(p0).add(p2).multiplyScalar(0.5).sub(inside);
  if (_a.dot(_b) >= 0) b.quad(p0.toArray(), p1.toArray(), p2.toArray(), p3.toArray(), color, em);
  else b.quad(p0.toArray(), p3.toArray(), p2.toArray(), p1.toArray(), color, em);
}

// a flat ring (a plate with a hole) in the XY plane, from z0 to z1
function annulus(b, r0, r1, z0, z1, seg, color, em = 0) {
  const P = (r, a, z) => V3(Math.cos(a) * r, Math.sin(a) * r, z);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU, e = ((i + 1) / seg) * TAU, mid = P((r0 + r1) / 2, (a + e) / 2, (z0 + z1) / 2);
    oquad(b, mid, P(r0, a, z1), P(r1, a, z1), P(r1, e, z1), P(r0, e, z1), color, em);
    oquad(b, mid, P(r0, a, z0), P(r1, a, z0), P(r1, e, z0), P(r0, e, z0), color, em);
    oquad(b, mid, P(r1, a, z0), P(r1, e, z0), P(r1, e, z1), P(r1, a, z1), color, em);
    if (r0 > 1e-3) oquad(b, mid, P(r0, a, z0), P(r0, e, z0), P(r0, e, z1), P(r0, a, z1), color, em);
  }
}

// a flat circle of light on both faces of a plate lying in the XY plane (z0 its back, z1 its front)
function inlay(b, r0, r1, z0, z1, seg, color, em = 1) {
  b.add(new THREE.RingGeometry(r0, r1, seg), mat(0, 0, z1), color, em);
  b.add(new THREE.RingGeometry(r0, r1, seg), mat(0, 0, z0, 0, Math.PI, 0), color, em);
}

// ------------------------------------------------------------------ CLOCKWORK
// A toothed wheel in the plane z = zc of its kit, about the kit's origin: N teeth of pitch p
// (so its pitch circle is N p / TAU, and any two of one pitch mesh), a tooth centered on
// the angle o.off. Spoked, or (the pinions) a plain disc.
function gear(b, N, p, zc, w, o) {
  const r = (N * p) / TAU, ra = r + 0.3 * p, rf = r - 0.32 * p, z0 = zc - w / 2, z1 = zc + w / 2;
  const rimIn = o.solid ? 0 : Math.max(o.hub + 0.3 * p, rf - o.rim);
  annulus(b, rimIn, rf, z0, z1, N <= 20 && !o.lite ? N * 2 : N, o.cRim);
  const rb = rf - 0.06 * p, h0 = 0.3 * p, h1 = 0.15 * p;
  for (let i = 0; i < N; i++) {
    const a = o.off + (i / N) * TAU, ex = Math.cos(a), ey = Math.sin(a);
    const P = (rad, s, z) => V3(ex * rad - ey * s, ey * rad + ex * s, z), mid = P((rb + ra) / 2, 0, zc);
    oquad(b, mid, P(rb, -h0, z1), P(rb, h0, z1), P(ra, h1, z1), P(ra, -h1, z1), o.cTooth);
    oquad(b, mid, P(rb, -h0, z0), P(rb, h0, z0), P(ra, h1, z0), P(ra, -h1, z0), o.cTooth);
    oquad(b, mid, P(rb, -h0, z0), P(ra, -h1, z0), P(ra, -h1, z1), P(rb, -h0, z1), o.cTooth);
    oquad(b, mid, P(rb, h0, z0), P(ra, h1, z0), P(ra, h1, z1), P(rb, h0, z1), o.cTooth);
    oquad(b, mid, P(ra, -h1, z0), P(ra, h1, z0), P(ra, h1, z1), P(ra, -h1, z1), o.cTooth);
  }
  if (!o.solid) {
    for (let i = 0; i < o.spokes; i++) {
      const a = o.off + ((i + 0.5) / o.spokes) * TAU, rc = (o.hub + rimIn) / 2;
      b.box(rimIn - o.hub + 0.4 * p, o.sw, w * 0.8, mat(Math.cos(a) * rc, Math.sin(a) * rc, zc, 0, 0, a), o.cSpoke);
    }
  }
  b.cyl(o.solid ? 0.75 * p * 0.55 : o.hub, o.solid ? 0.75 * p * 0.55 : o.hub, w * 1.5, 10, mat(0, 0, zc, Math.PI / 2, 0, 0), o.cHub);
  return { r, ra, rf, rimIn };
}

// the escape wheel: N long slanted teeth leaning the way it turns
function escapeWheel(b, N, r, zc, w, dir, U, c) {
  const z0 = zc - w / 2, z1 = zc + w / 2, rb = r * 0.84, st = TAU / N, ri = rb - 0.8 * U;
  annulus(b, ri, rb, z0, z1, Math.max(24, N), mixHex(c.shellLo, c.shellHi, 0.5));
  const P = (rad, a, z) => [Math.cos(a) * rad, Math.sin(a) * rad, z];
  for (let i = 0; i < N; i++) {
    const a0 = i * st, a1 = a0 + st * 0.62, at = a0 + st * (dir > 0 ? 0.92 : -0.3);
    b.tri(P(rb, a0, z1), P(rb, a1, z1), P(r, at, z1), c.shellHi);
    b.tri(P(rb, a0, z0), P(rb, a1, z0), P(r, at, z0), c.shellHi);
    b.quad(P(rb, a0, z0), P(r, at, z0), P(r, at, z1), P(rb, a0, z1), c.shellHi);
    b.quad(P(rb, a1, z0), P(r, at, z0), P(r, at, z1), P(rb, a1, z1), c.shellHi);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.3, rc = (0.6 * U + ri) / 2;
    b.box(ri - 0.6 * U + 0.3 * U, 0.6 * U, w * 0.8, mat(Math.cos(a) * rc, Math.sin(a) * rc, zc, 0, 0, a), c.shellLo);
  }
  b.cyl(0.9 * U, 0.9 * U, w * 1.4, 8, mat(0, 0, zc, Math.PI / 2, 0, 0), c.shellHi);
}

// CLOCKWORK: a clock with no face. A train of toothed wheels meshed in the air on arbors of
// light, in two planes (a wheel and a pinion on one arbor carry the motion from one plane to
// the other), before a slow great wheel that the first arbor's pinion drives; at the far
// end of the train an escape wheel, and an anchor and its pendulum that let the whole train
// go one tick to the beat. Every wheel turns as its teeth demand.
function clockwork(k, P, S, art, mini) {
  const R = art.R, c = art.pal, U = S * (mini ? 0.6 : 1);
  const train = mini && P.train.length > 6 ? P.train.slice(0, 6) : P.train;
  let escI = 0;
  train.forEach((q, i) => { if (!q.side) escI = i; });
  const p = 1.75 * U, w = 0.9 * U, rG = 20 * U, pb = (TAU * rG) / P.great, rD = (P.drive * pb) / TAU;
  const zB = -3 * U, zP = [0, 2.6 * U], zE = 5.2 * U;
  const W = [], arbors = [], posts = [];
  let bound, beta, aim, fits;
  const free = (x, y, r, plane, skip) => {
    if (Math.hypot(x, y) + r > bound) return false;
    for (const q of W) if (q !== skip && q.plane === plane && Math.hypot(q.x - x, q.y - y) < q.r + r + 0.8 * p) return false;
    for (const q of posts) if (q.plane === plane && Math.hypot(q.x - x, q.y - y) < q.r + r + 0.8 * p) return false;
    return true;
  };
  // lay the train out: from the first arbor at the great wheel's rim (low on it), each
  // wheel against the one it follows, wandering up toward the escapement's place
  const place = (t, i) => {
    const N = t.n, r = (N * p) / TAU;
    if (i === 0) {
      arbors.push({ x: Math.cos(beta) * (rG + rD), y: Math.sin(beta) * (rG + rD), th0: 0, rho: 1, zs: [zB, zP[0]] });
      W.push({ N, r, plane: 0, x: arbors[0].x, y: arbors[0].y, arbor: 0, off: 0 });
      return;
    }
    if (t.rel === 'coax') {
      const par = W[t.par], held = posts.findIndex((q) => q.own === t.par);
      if (held >= 0) posts.splice(held, 1);
      arbors[par.arbor].zs.push(zP[1 - par.plane]);
      W.push({ N, r, plane: 1 - par.plane, x: par.x, y: par.y, arbor: par.arbor, off: 0 });
      return;
    }
    // (the wheel that shares its arbor, in the other plane, must have room there too; and
    // the last one's arbor runs forward to the escape wheel)
    const co = train.find((q) => q.rel === 'coax' && q.par === i), rco = co ? (co.n * p) / TAU : i === escI ? U : 0;
    const tryAt = (par, tries, aimed) => {
      const d = par.r + r, b0 = aimed ? Math.atan2(aim.y - par.y, aim.x - par.x) + R.range(-0.8, 0.8) : R() * TAU;
      for (let j = 0; j < tries; j++) {
        const a = b0 + (aimed ? (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.17 : (j / tries) * TAU);
        const x = par.x + Math.cos(a) * d, y = par.y + Math.sin(a) * d;
        if (free(x, y, r, par.plane, par) && (!rco || free(x, y, rco, 1 - par.plane, null))) return { x, y, a, par };
      }
      return null;
    };
    let at = null;
    for (let g = 0; g < 14 && !at; g++) {
      at = tryAt(W[t.par], 36, !t.side);
      for (let q = W.length - 1; q >= 0 && !at; q--) at = tryAt(W[q], 24, false);
      if (!at) bound *= 1.12;
    }
    if (!at) { const par = W[t.par]; at = { x: par.x + par.r + r, y: par.y, a: 0, par }; }
    if (bound > (rG + 7 * U) * 1.3) fits = false;
    const pa = arbors[at.par.arbor];
    arbors.push({ x: at.x, y: at.y, rho: (-pa.rho * at.par.N) / N, zs: [zP[at.par.plane]],
      th0: at.a + Math.PI - (TAU / N) * (0.5 - (at.par.N * (at.a - pa.th0 - at.par.off)) / TAU) });
    W.push({ N, r, plane: at.par.plane, x: at.x, y: at.y, arbor: arbors.length - 1, off: 0 });
    // (its place in the other plane is kept for the wheel that will share its arbor)
    if (co) posts.push({ x: at.x, y: at.y, r: rco, plane: 1 - at.par.plane, own: i });
    else if (i === escI && at.par.plane === 0) posts.push({ x: at.x, y: at.y, r: U, plane: 1 });
  };
  // (a train that will not go in is begun again from another place on the rim)
  for (let go = 0; go < 12 && !fits; go++) {
    W.length = arbors.length = posts.length = 0;
    bound = rG + 7 * U; fits = true;
    beta = -Math.PI / 2 + R.range(-1, 1);
    aim = { x: R.range(-5, 5) * U, y: R.range(7, 13) * U };
    train.forEach(place);
  }
  // how fast: the quickest arbor a fifth of a radian to the tick, and the escape wheel
  // (its teeth are its own) half a tooth
  const esc = arbors[W[escI].arbor];
  esc.zs.push(zE);
  const maxRho = Math.max(...arbors.map((a) => Math.abs(a.rho)));
  const NE = clamp(Math.round(Math.PI / ((Math.abs(esc.rho) * 0.21) / maxRho)), 15, 72);
  const sc = Math.min(Math.PI / NE / Math.abs(esc.rho), 0.5 / maxRho), rE = Math.max(5, NE * 0.105) * U;
  const aG = beta + Math.PI, thG = aG + Math.PI - (TAU / P.great) * (0.5 - (P.drive * aG) / TAU), rhoG = -P.drive / P.great;
  const pivot = { x: esc.x, y: esc.y + 1.38 * rE }, Lp = 27 * U;
  // where it all is, to hang it centered
  let x0 = -rG - pb, x1 = rG + pb, yLo = -rG - pb, yHi = rG + pb;
  for (const q of W) { x0 = Math.min(x0, q.x - q.r - p); x1 = Math.max(x1, q.x + q.r + p); yLo = Math.min(yLo, q.y - q.r - p); yHi = Math.max(yHi, q.y + q.r + p); }
  x0 = Math.min(x0, esc.x - rE, pivot.x - 0.13 * Lp - 3 * U); x1 = Math.max(x1, esc.x + rE, pivot.x + 0.13 * Lp + 3 * U);
  yHi = Math.max(yHi, pivot.y + 1.5 * U); yLo = Math.min(yLo, pivot.y - Lp - 3.2 * U);
  const half = (yHi - yLo) / 2, mid = (yHi + yLo) / 2, cy = mini ? 0 : half + 9 * U, baseY = cy - mid;
  const base = k.sub(0, baseY, 0);
  const lights = [c.light, c.second, c.third];
  // the arbors, of light, and what turns on each
  const wheelsOf = arbors.map(() => []);
  W.forEach((q, i) => wheelsOf[q.arbor].push([q, i]));
  arbors.forEach((a, ai) => {
    const z0 = Math.min(...a.zs) - 1.4 * U, z1 = Math.max(...a.zs) + 1.4 * U;
    bar(base.glow, V3(a.x, a.y, z0), V3(a.x, a.y, z1), 0.34 * U, pale(c.light, 0.35), 0.85);
    for (const z of [z0, z1]) base.glow.ico(0.5 * U, 0, mat(a.x, a.y, z), c.second, 1);
    const ak = (a.kit = base.sub(a.x, a.y, 0));
    for (const [q, i] of wheelsOf[ai]) {
      const stone = R() < 0.42, b = stone ? ak.stone : ak.shell, z = zP[q.plane], solid = q.N < 14, col = lights[i % 3];
      const g = gear(b, q.N, p, z, w, { off: q.off, solid, lite: mini, rim: Math.max(0.9 * U, q.r * 0.16), hub: Math.min(1.5 * U, 0.85 * U + q.r * 0.06), spokes: q.N < 22 ? 4 : q.N < 30 ? 5 : 6, sw: 0.8 * U,
        cRim: stone ? c.stone[2] : mixHex(c.shellLo, c.shellHi, 0.3 + 0.5 * R()), cTooth: stone ? c.stone[3] : c.shellHi, cSpoke: stone ? c.stone[1] : c.shellLo, cHub: stone ? c.stone[3] : c.shellHi });
      // a jewel through it (so its turning shows), and on the stone ones a circle of light
      ak.lit.cyl(0.38 * U, 0.38 * U, w * 1.6, 6, mat(solid ? g.rf * 0.62 : (g.rimIn + g.rf) / 2, 0, z, Math.PI / 2, 0, 0), col, PULSE);
      if (stone && !solid) inlay(ak.lit, g.rf - 0.6 * U, g.rf - 0.22 * U, z - w / 2 - 0.05 * U, z + w / 2 + 0.05 * U, Math.max(16, q.N), col);
      if (!stone && !solid) ak.lit.cyl(0.55 * U, 0.55 * U, w * 1.8, 8, mat(0, 0, z, Math.PI / 2, 0, 0), col, 1);
    }
  });
  // the pinion behind, on the first arbor, and the great wheel it drives
  gear(arbors[0].kit.shell, P.drive, pb, zB, w, { off: 0, solid: true, lite: mini, cRim: c.shellLo, cTooth: c.shellHi, cHub: c.shellHi });
  const gk = base.sub(0, 0, 0);
  const gG = gear(gk.shell, P.great, pb, zB, w * 1.15, { off: 0, rim: 1.5 * U, hub: 2.2 * U, spokes: P.spokes, sw: 1.2 * U,
    cRim: mixHex(c.shellLo, c.shellHi, 0.3), cTooth: c.shellHi, cSpoke: c.shellLo, cHub: c.shellHi });
  annulus(gk.shell, rG * 0.52, rG * 0.52 + 1.1 * U, zB - w * 0.5, zB + w * 0.5, mini ? 24 : 48, mixHex(c.shellLo, c.shellHi, 0.65));
  for (let j = 0; j < 12; j++) { const a = (j / 12) * TAU, rj = (gG.rimIn + gG.rf) / 2; gk.lit.cyl(0.42 * U, 0.42 * U, w * 1.8, 6, mat(Math.cos(a) * rj, Math.sin(a) * rj, zB, Math.PI / 2, 0, 0), j % 3 ? c.light : c.second, PULSE); }
  inlay(gk.lit, (gG.rimIn + gG.rf) / 2 - 0.2 * U, (gG.rimIn + gG.rf) / 2 + 0.2 * U, zB - w * 0.575 - 0.05 * U, zB + w * 0.575 + 0.05 * U, mini ? 32 : 64, c.light);
  bar(base.glow, V3(0, 0, zB - 3.4 * U), V3(0, 0, zB + 1.5 * U), 0.5 * U, pale(c.light, 0.4), 0.9);
  base.glow.ico(1.5 * U, 1, mat(0, 0, zB + 1.5 * U), pale(c.light, 0.5), 0.9);
  // the escapement: the escape wheel before all the rest, the anchor over it, its pendulum
  const dirE = esc.rho < 0 ? -1 : 1;
  escapeWheel(esc.kit.shell, NE, rE, zE, w * 0.8, dirE, U, c);
  esc.kit.lit.cyl(0.6 * U, 0.6 * U, w * 1.6, 8, mat(0, 0, zE, Math.PI / 2, 0, 0), c.second, PULSE);
  const anc = base.sub(pivot.x, pivot.y, zE + U);
  for (const q of [V3(-0.79 * rE, -0.76 * rE, 0), V3(0.79 * rE, -0.76 * rE, 0)]) {
    bar(anc.stone, V3(0, 0, 0), q, 0.55 * U, c.stone[3]);
    anc.lit.box(0.9 * U, 0.9 * U, 1.4 * U, mat(q.x, q.y, -0.45 * U, 0, 0, q.x > 0 ? 0.6 : -0.6), c.second, PULSE);
  }
  anc.stone.cyl(0.95 * U, 0.95 * U, 0.9 * U, 8, mat(0, 0, 0, Math.PI / 2, 0, 0), c.stone[2]);
  bar(anc.glow, V3(0, 0, 0.55 * U), V3(0, -Lp, 0.55 * U), 0.3 * U, pale(c.light, 0.3), 0.9);
  anc.lit.cyl(2.3 * U, 2.3 * U, 0.7 * U, 16, mat(0, -Lp, 0.55 * U, Math.PI / 2, 0, 0), c.second, PULSE);
  anc.shell.cyl(1.2 * U, 1.2 * U, 1.1 * U, 12, mat(0, -Lp, 0.55 * U, Math.PI / 2, 0, 0), c.shellHi);
  anc.glow.add(new THREE.TorusGeometry(3 * U, 0.12 * U, 3, 28), mat(0, -Lp, 0.55 * U), c.light, 0.9);
  bar(base.glow, V3(pivot.x, pivot.y, zE - 0.4 * U), V3(pivot.x, pivot.y, zE + 2.4 * U), 0.3 * U, pale(c.light, 0.35), 0.85);
  // standing: its weight, on a cord of light off a barrel behind the great wheel, going
  // down a little with every tick and wound up again
  let cord = null;
  if (!mini) {
    const zc = zB - 1.8 * U, Lmax = baseY - 8 * U, Lmin = Lmax - 11 * U;
    gk.shell.cyl(2.2 * U, 2.2 * U, 1.9 * U, 12, mat(0, 0, zc, Math.PI / 2, 0, 0), c.shellLo);
    const ck = base.sub(2.2 * U, 0, zc), wk = base.sub(2.2 * U, -Lmin, zc);
    ck.glow.box(0.24 * U, 1, 0.24 * U, mat(0, -0.5, 0), pale(c.light, 0.3), 0.8);
    wk.stone.cyl(1.5 * U, 1.5 * U, 5 * U, 10, mat(0, -2.5 * U, 0), c.stone[2]);
    wk.stone.cone(1.5 * U, 1.4 * U, 10, mat(0, -5.7 * U, 0, Math.PI, 0, 0), c.stone[1]);
    for (const y of [-0.9, -4.1]) wk.lit.cyl(1.58 * U, 1.58 * U, 0.4 * U, 10, mat(0, y * U, 0), c.light, PULSE);
    cord = { ck, wk, Lmin, Lmax };
  }
  art.updates.push((t, dt, ctx, beat) => {
    const bt = beat || 0, fl = Math.floor(bt), x = bt - fl;
    // the tick: a quick advance and a small recoil, then still until the next
    const tau = fl + smoothstep(0, 0.28, x) - 0.07 * Math.sin(Math.PI * clamp((x - 0.28) / 0.3, 0, 1));
    for (const a of arbors) a.kit.group.rotation.z = a.th0 + a.rho * sc * tau;
    gk.group.rotation.z = thG + rhoG * sc * tau;
    anc.group.rotation.z = 0.12 * Math.sin(Math.PI * (bt - 0.14));
    base.group.rotation.y = Math.sin(t * 0.05) * 0.45;
    if (cord) {
      const q = (tau / 220) % 1, s = q < 0.95 ? q / 0.95 : 1 - smoothstep(0.95, 1, q), L = cord.Lmin + (cord.Lmax - cord.Lmin) * s;
      cord.ck.group.scale.y = L;
      cord.wk.group.position.y = -L;
    }
  });
  const span = Math.max(-x0, x1);
  return { light: V3(0, baseY, 0), focus: V3(0, cy, 0), span, height: baseY + yHi, solid: span * 0.8, low: baseY + yLo };
}

// ------------------------------------------------------------------ FOUNTAIN
// FOUNTAIN: tiers of lobed shell basins one over another on a stem, each turning its own
// way, and water of light: a plume at the crown (higher when the ship is near), arcs of
// motes thrown out from the top into a basin below, and from every basin's lobes a curtain
// falling to the next, front after front. Standing, it has a pool about its foot, and jets
// from the pool's rim arching into the lowest basin.
function fountain(k, P, S, art, mini) {
  const R = art.R, c = art.pal, U = S * (mini ? 0.55 : 1);
  const T = P.tiers, m = P.lobes;
  const Rb = (13 + 1.6 * T) * U, Rt = 4.6 * U, h0 = (10 + T) * U;
  const tiers = [];
  for (let i = 0, y = mini ? 0 : 10 * U; i < T; i++) {
    const q = i / (T - 1), r = Rb + (Rt - Rb) * Math.pow(q, 0.8);
    tiers.push({ r, y, d: 0.2 * r + 0.9 * U, rs: (0.9 + 0.22 * (T - i)) * U, sp: (0.035 + 0.012 * i) * (i % 2 ? -1 : 1) });
    y += (10 - 4 * q) * U;
  }
  const top = tiers[T - 1], yN = top.y + 4.5 * U, Rp = Rb * 1.55;
  const body = k.sub(0, mini ? -(yN + 0.6 * h0 - 6 * U) / 2 : 0, 0);
  const stem = mini ? body.shell : body.stone;
  const water = (i) => pale([c.light, c.second, c.third][i % 3], 0.3);
  tiers.forEach((tr, i) => {
    const tk = (tr.kit = body.sub(0, tr.y, 0)), { r, d } = tr, col = [c.light, c.second, c.third][i % 3];
    // the basin: a shallow bowl with a lip, its rim drawn out into lobes
    const prof = [[tr.rs, -d], [0.5 * r, -0.86 * d], [0.86 * r, -0.38 * d], [r, 0], [1.05 * r, 0.14 * d], [0.96 * r, -0.03 * d], [0.5 * r, -0.6 * d], [tr.rs * 0.9, -0.72 * d]];
    const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), (mini ? 2 : 4) * m), pa = g.attributes.position;
    for (let j = 0; j < pa.count; j++) {
      const x = pa.getX(j), z = pa.getZ(j), kk = 1 + 0.07 * Math.cos(m * Math.atan2(z, x)) * smoothstep(0.45 * r, r, Math.hypot(x, z));
      pa.setX(j, x * kk); pa.setZ(j, z * kk);
    }
    tk.shell.add(g, null, (x, y) => mixHex(c.shellLo, c.shellHi, clamp(1 + y / d, 0, 1) * 0.85 + 0.15 * (i % 2)));
    tk.glow.add(new THREE.CircleGeometry(0.94 * r, 4 * m), mat(0, -0.1 * d, 0, -Math.PI / 2, 0, 0), water(i), 0.4);
    tk.lit.add(new THREE.TorusGeometry(0.9 * r, 0.14 * U, 3, 4 * m), mat(0, -0.02 * d, 0, Math.PI / 2, 0, 0), col, 1);
    for (let j = 0; j < m; j++) { const a = (j / m) * TAU; tk.lit.ico(0.45 * U, 0, mat(Math.cos(a) * r * 1.12, 0.14 * d, Math.sin(a) * r * 1.12), col, PULSE); }
    // the stem under it, and a knop on the stem
    if (i || !mini) {
      const yA = i ? tiers[i - 1].y - 0.72 * tiers[i - 1].d : -U, yB = tr.y - d * 0.98;
      stem.cyl(tr.rs, i ? tiers[i - 1].rs : tr.rs * 1.7, yB - yA, 8, mat(0, (yA + yB) / 2, 0), mini ? c.shellLo : c.stone[(i + 1) % 4]);
      body.shell.add(new THREE.IcosahedronGeometry(tr.rs * 1.75, 1), mat(0, yA + (yB - yA) * 0.55, 0, 0, 0, 0, 1, 0.62, 1), mixHex(c.shellLo, c.shellHi, 0.5));
    } else {
      stem.cone(tr.rs * 1.4, 4.5 * U, 8, mat(0, tr.y - d - 2.2 * U, 0, Math.PI, 0, 0), c.shellLo);
      body.lit.ico(0.55 * U, 0, mat(0, tr.y - d - 4.6 * U, 0), c.second, PULSE);
    }
  });
  if (!mini) {
    body.stone.cyl(5 * U, 5.6 * U, 1.2 * U, 12, mat(0, 0.2 * U, 0), c.stone[1]);
    body.stone.cyl(3.4 * U, 3.8 * U, 1.2 * U, 12, mat(0, 1.4 * U, 0), c.stone[2]);
    // the pool about its foot
    body.stone.add(new THREE.TorusGeometry(Rp, 0.9 * U, 5, 48), mat(0, 0.4 * U, 0, Math.PI / 2, 0, 0), c.stone[2]);
    body.glow.add(new THREE.CircleGeometry(Rp * 0.98, 48), mat(0, 0.5 * U, 0, -Math.PI / 2, 0, 0), mixHex(c.light, c.second, 0.3), 0.28);
    body.lit.add(new THREE.TorusGeometry(Rp, 0.2 * U, 3, 48), mat(0, 1.3 * U, 0, Math.PI / 2, 0, 0), c.light, PULSE);
  }
  // the crown: a bud about the nozzle, and the plume's heart
  const fin = body.sub(0, top.y, 0);
  fin.shell.cyl(0.5 * U, top.rs * 0.9, 4.2 * U + 0.7 * top.d, 6, mat(0, (4.2 * U - 0.7 * top.d) / 2, 0), c.shellHi);
  for (let j = 0; j < 6; j++) petal(fin.shell, 3.4 * U, 1.3 * U, 0.55, (j / 6) * TAU, 0.5 * U, 3 * U, 0.5, 0.2, c.shellLo, c.shellHi, 4, 2, { b: fin.glow, color: pale(c.light, 0.3) }, 0.1 * U);
  fin.glow.ico(1.1 * U, 1, mat(0, 4.5 * U, 0), pale(c.light, 0.5), 1);
  fin.lit.ico(0.6 * U, 0, mat(0, 4.5 * U, 0), c.second, PULSE);
  const pl = body.sub(0, yN, 0);
  pl.glow.cyl(0.06 * U, 0.75 * U, 1, 6, mat(0, 0.5, 0), pale(c.light, 0.5), 0.45, true);
  // the curtains: from each basin's lobes to the water of the one below (the lowest, when
  // it stands, to the pool), each a few bands that fall one after another
  const HB = 4, nPts = (mini ? 2 : 4) * m + 1, falls = [];
  tiers.forEach((tr, i) => {
    if (!i && mini) return;
    const lo = i ? tiers[i - 1] : null, yL = lo ? lo.y - 0.1 * lo.d : 0.5 * U, dy = tr.y - yL;
    const tf = Math.sqrt((2 * dy) / (3 * U));
    falls.push({ tr, i, dy, dr: lo ? Math.max(0.3 * U, Math.min(2.2 * U, lo.r * 0.9 - tr.r * 1.13)) : 2.5 * U, tf, rate: 1 / (tf * (1 + 1 / HB)) });
  });
  const cur = strips(art, body.group, falls.length * HB, nPts, (s) => water(falls[Math.floor(s / HB)].i),
    (s, q, side) => (side ? 0.85 : 0.1) * (0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.cos(q * TAU * m), 2)), 0.6);
  const cm = Array.from({ length: nPts }, (_, i) => Math.cos(m * (i / (nPts - 1)) * TAU));
  // the motes: the plume; the arcs (from the nozzle over the top basin's rim into the one
  // below; and from the pool's rim into the lowest); the falls
  const nM = mini ? Math.min(P.motes, 600) : P.motes, nP = Math.floor(nM * 0.3), nA = Math.floor(nM * 0.25), nF = nM - nP - nA;
  const plume = cloud(art, body.group, nP + (mini ? nA : 0), pale(c.light, 0.45), 1.3 * U, 1);
  const arcs = mini ? plume : cloud(art, body.group, nA, pale(c.second, 0.3), 1.1 * U, 1), aOff = mini ? nP : 0;
  const fallc = cloud(art, body.group, nF, pale(c.third, 0.35), U, 1);
  const drop = 4.5 * U + 0.1 * top.d;
  const PL = Array.from({ length: nP }, () => ({ ph: R(), w: 1 / (3.4 * (0.85 + 0.3 * R())), a: R() * TAU, r: (0.1 + 0.65 * R()) * top.r, h: 0.7 + 0.3 * R() }));
  // an arc from (ra, ya) to (rb, yb), high enough to clear the rims it passes over
  const arcOf = (ra, ya, rb, yb, rims) => {
    let ah = 4 * U;
    for (const [rr, ry] of rims) { const q = (rr - ra) / (rb - ra); if (q > 0.02 && q < 0.98) ah = Math.max(ah, (ry - ya - (yb - ya) * q * q) / (4 * q * (1 - q))); }
    return { ra, ya, rb, yb, ah };
  };
  const land = tiers[T - 2], rimOf = (tr) => [tr.r * 1.13, tr.y + 0.14 * tr.d + 1.2 * U];
  const crown = arcOf(0.5 * U, yN - 0.5 * U, land.r * 0.88, land.y - 0.1 * land.d, [rimOf(top)]);
  const jets = mini ? null : arcOf(Rp * 0.9, 0.7 * U, tiers[0].r * 0.6, tiers[0].y - 0.1 * tiers[0].d, [rimOf(tiers[0])]);
  const AR = Array.from({ length: nA }, (_, i) => {
    const pool = jets && i % 9 >= 5, n = pool ? 2 * m : m, j = Math.floor(R() * n);
    return { arc: pool ? jets : crown, ph: R(), w: 1 / ((pool ? 3.6 : 3) * (0.9 + 0.2 * R())), a: ((j + 0.5) / n) * TAU + (R() - 0.5) * 0.07, k: 0.94 + 0.12 * R(), sp: pool ? 0 : -0.08 };
  });
  const FL = Array.from({ length: nF }, () => {
    let pick = R() * falls.reduce((s, F) => s + F.tr.r, 0), F = falls[0];
    for (const q of falls) { F = q; pick -= q.tr.r; if (pick <= 0) break; }
    return { F, ph: R(), th: (Math.floor(R() * m) / m) * TAU + (R() - 0.5) * 0.24, jr: (R() - 0.5) * 0.8 * U, w: 0.85 + 0.3 * R() };
  });
  let nearS = 0;
  art.updates.push((t, dt, ctx) => {
    nearS = damp(nearS, nearOf(ctx), 1.5, dt);
    for (const tr of tiers) tr.kit.group.rotation.y = t * tr.sp;
    fin.group.rotation.y = -t * 0.08;
    const h = h0 * (1 + 0.9 * nearS);
    pl.group.scale.set(1 + 0.3 * nearS, h * 0.92, 1 + 0.3 * nearS);
    falls.forEach((F, fi) => {
      const rot = -t * F.tr.sp, rim = F.tr.r * 1.05;
      for (let b = 0; b < HB; b++) {
        const s0 = ((b / HB + t * F.rate) % 1) * (1 + 1 / HB) - 1 / HB, sa = Math.max(0, s0), sb = Math.min(1, s0 + 1 / HB);
        const ya = F.tr.y - F.dy * sa * sa, yb = F.tr.y - F.dy * sb * sb;
        for (let i = 0; i < nPts; i++) {
          const th = (i / (nPts - 1)) * TAU, r0 = rim * (1 + 0.07 * cm[i]), rp = 0.25 * U * Math.sin(th * m * 2 + t * 1.7);
          const cs = Math.cos(th + rot), sn = Math.sin(th + rot), ra = r0 + (F.dr + rp) * sa, rb = r0 + (F.dr + rp) * sb;
          cur.set(fi * HB + b, i, cs * ra, ya, sn * ra, cs * rb, yb, sn * rb);
        }
      }
    });
    cur.commit();
    PL.forEach((q, i) => {
      const u = (q.ph + t * q.w) % 1, hh = h * q.h, tt = u * (1 + Math.sqrt(1 + drop / hh)) * 0.5, r = 0.3 * U + q.r * u;
      put(plume, i, Math.cos(q.a) * r, yN + 4 * hh * tt * (1 - tt), Math.sin(q.a) * r);
    });
    AR.forEach((q, i) => {
      const u = (q.ph + t * q.w) % 1, A = q.arc, r = A.ra + (A.rb - A.ra) * u * q.k, a = q.a + t * q.sp;
      put(arcs, aOff + i, Math.cos(a) * r, A.ya + 4 * A.ah * (1 + 0.3 * nearS) * q.k * u * (1 - u) + (A.yb - A.ya) * u * u, Math.sin(a) * r);
    });
    FL.forEach((q, i) => {
      const F = q.F, s = (q.ph + (t * q.w) / F.tf) % 1, a = q.th - t * F.tr.sp, r = F.tr.r * 1.05 * (1 + 0.07 * Math.cos(m * q.th)) + F.dr * s + q.jr * s;
      put(fallc, i, Math.cos(a) * r, F.tr.y - F.dy * s * s, Math.sin(a) * r);
    });
    plume.attr.needsUpdate = arcs.attr.needsUpdate = fallc.attr.needsUpdate = true;
  });
  const yS = body.group.position.y;
  return { light: V3(0, yS + yN, 0), focus: V3(0, yS + yN * 0.55, 0), span: mini ? Rb * 1.15 : Rp * 1.03, height: yS + yN + h0 * 1.25, solid: Rb, low: mini ? yS - tiers[0].d - 5 * U : 0 };
}

// ------------------------------------------------------------------ RADIOLARIAN
// the geodesic sphere of a frequency (1: the icosahedron's 12 corners, 2: 42, 4: 162):
// its corners (unit), its faces, each corner's neighbours
const _geo = {};
function geodesic(freq) {
  if (_geo[freq]) return _geo[freq];
  const g = new THREE.IcosahedronGeometry(1, freq - 1), p = g.attributes.position;
  const V = [], F = [], seen = new Map();
  const id = (i) => {
    const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    if (!seen.has(key)) { seen.set(key, V.length); V.push(V3(p.getX(i), p.getY(i), p.getZ(i)).normalize()); }
    return seen.get(key);
  };
  for (let i = 0; i < p.count; i += 3) F.push([id(i), id(i + 1), id(i + 2)]);
  g.dispose();
  const nb = V.map(() => new Set());
  for (const [a, b, e] of F) { nb[a].add(b).add(e); nb[b].add(a).add(e); nb[e].add(a).add(b); }
  return (_geo[freq] = { V, F, nb: nb.map((s) => [...s]) });
}

// a lattice sphere: a ring about every corner of the geodesic sphere, each touching its
// neighbours (the round windows), a plate where three rings meet, and a thorn on the plate
function lattice(kit, freq, r, tube, c, lite, thorn) {
  const { V, F, nb } = geodesic(freq);
  V.forEach((v, i) => {
    let dm = 0;
    for (const j of nb[i]) dm += v.distanceTo(V[j]);
    const rr = ((0.5 * dm) / nb[i].length) * r * 0.98, five = nb[i].length === 5;
    const m = orient(v.clone().multiplyScalar(Math.sqrt(Math.max(0, r * r - rr * rr))), v).multiply(_rx);
    kit.shell.add(new THREE.TorusGeometry(rr - tube * 0.6, tube, lite ? 3 : 4, freq === 1 ? 20 : five ? 10 : 12), m,
      five ? mixHex(c.shellHi, c.light, 0.35) : mixHex(c.shellLo, c.shellHi, 0.25 + 0.65 * hash3(v.x, v.y, v.z)));
  });
  for (const [a, b, e] of F) {
    const cen = V[a].clone().add(V[b]).add(V[e]).normalize().multiplyScalar(r * 0.99);
    const pt = (i, j) => V[i].clone().add(V[j]).normalize().multiplyScalar(r * 0.99).sub(cen).multiplyScalar(1.35).add(cen).toArray();
    kit.shell.tri(pt(a, b), pt(b, e), pt(e, a), c.shellLo);
    if (thorn) kit.shell.add(new THREE.ConeGeometry(tube * 0.9, thorn, 3, 1, true), orient(cen, cen).multiply(shift(0, thorn / 2, 0)), c.shellHi);
  }
}

// RADIOLARIAN: a radiolarian's skeleton the size of a tower: a lattice sphere of round
// windows, a second and a third inside it deeper down, each turning on its own axis against
// the others and breathing; twenty long spines of light out through the lattice's knots
// (and twelve through its five-sided windows), that reach further when the ship is near.
function radiolarian(k, P, S, art, mini) {
  const R = art.R, c = art.pal, U = S * (mini ? 0.6 : 1);
  const r1 = 17 * U, Ls = 1.75, H = mini ? 0 : r1 * Ls * (P.rays ? 1.14 : 1) * 1.27 + 3 * U;
  const hub = k.sub(0, H, 0);
  const n = mini ? Math.min(P.cages, 2) : P.cages;
  const freqs = (mini ? [2, 1] : P.freq === 4 ? [4, 2, 1] : [2, 2, 1]).slice(0, n), radii = [1, 0.6, 0.34];
  const cages = freqs.map((fq, i) => {
    const kit = hub.sub(0, 0, 0), r = r1 * radii[i];
    lattice(kit, fq, r, (fq === 4 ? 0.036 : i ? 0.06 : 0.048) * r, c, mini || fq === 4, i === 0 && !mini ? 0.1 * r : 0);
    // lights at its five-sided windows' hearts
    for (const v of geodesic(1).V) kit.lit.ico((i ? 0.045 : 0.03) * r + 0.12 * U, 0, mat(v.x * r, v.y * r, v.z * r), [c.second, c.light, c.third][i], PULSE);
    return { kit, axis: V3(R() - 0.5, (R() - 0.5) * (i ? 1 : 0.4) + (i ? 0 : 0.8), R() - 0.5).normalize(), sp: (0.05 + 0.05 * R()) * (i % 2 ? -1 : 1) * (1 + i * 0.7) };
  });
  // the spines: out of the knots where three windows meet (the twenty faces' middles)
  const sp = cages[0].kit.sub(0, 0, 0), D20 = geodesic(1).F.map(([a, b, e]) => geodesic(1).V[a].clone().add(geodesic(1).V[b]).add(geodesic(1).V[e]).normalize());
  for (const d of D20) {
    sp.glow.tube([d.clone().multiplyScalar(r1 * 0.45), d.clone().multiplyScalar(r1 * 1.3), d.clone().multiplyScalar(r1 * Ls)], (t) => 0.34 * U * (1 - 0.8 * t), 3, pale(c.light, 0.3), 0.9);
    sp.lit.ico(0.42 * U, 0, mat(d.x * r1 * Ls, d.y * r1 * Ls, d.z * r1 * Ls), c.second, PULSE);
    cages[0].kit.shell.add(new THREE.ConeGeometry(0.8 * U, 3.4 * U, 3, 1, true), orient(d.clone().multiplyScalar(r1 * 0.98), d).multiply(shift(0, 1.7 * U, 0)), c.shellHi);
  }
  if (P.rays) for (const v of geodesic(1).V) {
    sp.glow.tube([v.clone().multiplyScalar(r1 * 0.2), v.clone().multiplyScalar(r1 * Ls * 1.14)], (t) => 0.2 * U * (1 - 0.6 * t), 3, pale(c.second, 0.35), 0.6);
  }
  const core = hub.sub(0, 0, 0);
  core.glow.ico(0.15 * r1, 2, null, pale(c.light, 0.55), 1);
  core.lit.ico(0.09 * r1, 1, null, c.second, PULSE);
  // standing: a thread of light from the ground up to it
  if (!mini) {
    bar(k.glow, V3(0, 0.3 * U, 0), V3(0, H - r1, 0), 0.45 * U, pale(c.light, 0.3), 0.55);
    k.glow.add(new THREE.RingGeometry(3 * U, 3.5 * U, 28), mat(0, 0.5 * U, 0, -Math.PI / 2, 0, 0), c.light, 0.7);
  }
  let nearS = 0;
  art.updates.push((t, dt, ctx) => {
    nearS = damp(nearS, nearOf(ctx), 1.2, dt);
    cages.forEach((q, i) => {
      q.kit.group.quaternion.setFromAxisAngle(q.axis, t * q.sp);
      q.kit.group.scale.setScalar(1 + 0.045 * Math.sin(t * 0.55 - i * 1.1));
    });
    sp.group.scale.setScalar(1 + 0.05 * Math.sin(t * 0.55 + 0.7) + 0.22 * nearS);
    core.group.scale.setScalar(1 + 0.1 * Math.sin(t * 1.1));
  });
  const ext = r1 * Ls * (P.rays ? 1.14 : 1);
  return { light: V3(0, H, 0), focus: V3(0, H, 0), span: ext * 1.05, height: H + ext * 1.05, solid: r1 * 1.1, low: H - r1 * 1.1 };
}

// ------------------------------------------------------------------ CHLADNI
// CHLADNI: a great thin plate hanging level, and on it thousands of grains of light lying
// along the still lines of the plate's ringing (on the square one the figure
// cos(n x) cos(m y) +- cos(m x) cos(n y) = 0; on the round one n diameters and circles).
// Every so often a bow of light is drawn down its edge, it rings another way, and the
// grains run to the new figure. A stem of light under its middle.
function chladni(k, P, S, art, mini) {
  const R = art.R, c = art.pal, U = S * (mini ? 0.6 : 1);
  const a = 22 * U, H = mini ? 0 : 21 * U, th = 0.5 * U;
  const pk = k.sub(0, H, 0);
  if (P.round) {
    pk.stone.cyl(a, a, th, 48, null, c.stone[0]);
    pk.shell.cyl(a * 0.97, a * 0.86, 0.5 * U, 48, mat(0, -th, 0), (x, y, z) => mixHex(c.shellLo, c.shellHi, 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 3)));
    pk.shell.add(new THREE.TorusGeometry(a, 0.5 * U, 4, 48), mat(0, 0, 0, Math.PI / 2, 0, 0), c.shellHi);
    pk.glow.add(new THREE.TorusGeometry(a * 0.975, 0.1 * U, 3, 64), mat(0, th / 2 + 0.25 * U, 0, Math.PI / 2, 0, 0), pale(c.light), 0.8);
    for (let i = 0; i < 12; i++) { const q = (i / 12) * TAU; pk.lit.ico(0.6 * U, 0, mat(Math.cos(q) * a, 0.5 * U, Math.sin(q) * a), i % 3 ? c.light : c.second, PULSE); }
  } else {
    pk.stone.box(2 * a, th, 2 * a, null, c.stone[0]);
    pk.shell.box(1.94 * a, 0.4 * U, 1.94 * a, mat(0, -th * 0.9, 0), (x, y, z) => mixHex(c.shellLo, c.shellHi, 0.5 + 0.5 * Math.sin(((x + z) / a) * 2.2)));
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      pk.shell.box(sx ? 0.9 * U : 2 * a + 0.9 * U, 0.9 * U, sz ? 0.9 * U : 2 * a + 0.9 * U, mat(sx * a, 0, sz * a), c.shellHi);
      pk.glow.box(sx ? 0.14 * U : 2 * a * 0.95, 0.14 * U, sz ? 0.14 * U : 2 * a * 0.95, mat(sx * a * 0.965, th / 2 + 0.25 * U, sz * a * 0.965), pale(c.light), 0.8);
    }
    for (const sx of [1, -1]) for (const sz of [1, -1]) pk.lit.box(1.5 * U, 1.3 * U, 1.5 * U, mat(sx * a, 0, sz * a), c.second, PULSE);
  }
  pk.lit.cyl(2 * U, 1.1 * U, 0.9 * U, 12, mat(0, -th - 0.6 * U, 0), c.light, PULSE);
  // what holds it: standing, a stone stand and a stem of light; in the air, the stem alone
  if (!mini) {
    k.stone.cyl(5 * U, 5.6 * U, 1.2 * U, 12, mat(0, 0.3 * U, 0), c.stone[1]);
    k.stone.cyl(3.2 * U, 3.6 * U, 1.2 * U, 12, mat(0, 1.5 * U, 0), c.stone[2]);
    k.stone.cyl(0.9 * U, 1.8 * U, H * 0.42, 8, mat(0, 2.1 * U + H * 0.21, 0), c.stone[3]);
    k.lit.add(new THREE.TorusGeometry(1.2 * U, 0.22 * U, 4, 14), mat(0, 2.1 * U + H * 0.42, 0, Math.PI / 2, 0, 0), c.second, PULSE);
    bar(k.glow, V3(0, 2.1 * U + H * 0.4, 0), V3(0, H - th, 0), 0.9 * U, pale(c.light, 0.4), 0.85);
  } else {
    bar(k.glow, V3(0, H - 12 * U, 0), V3(0, H - th, 0), 0.8 * U, pale(c.light, 0.4), 0.85);
    k.lit.ico(0.9 * U, 0, mat(0, H - 12.4 * U, 0), c.second, PULSE);
  }
  // the bow: a rod of light standing across the middle of one edge
  const bw = k.sub(a + (P.round ? 0.8 : 1.2) * U, H, 0);
  bw.lit.box(0.32 * U, 18 * U, 0.32 * U, null, c.second, 1);
  bw.glow.box(0.75 * U, 18 * U, 0.75 * U, null, c.second, 0.25);
  for (const s of [1, -1]) bw.shell.box(0.95 * U, 1.7 * U, 0.95 * U, mat(0, s * 9 * U, 0), c.shellHi);
  // the grains, in the plate's own measure (-1..1 across it)
  const nC = mini ? 2 : 3, n = Math.floor((mini ? Math.min(P.grains, 1400) : P.grains) / nC) * nC;
  const cols = [pale(c.light, 0.3), pale(c.second, 0.25), pale(c.third, 0.25)];
  const cls = Array.from({ length: nC }, (_, j) => cloud(art, pk.group, n / nC, cols[j], (mini ? 1.1 : 0.85) * U, 1));
  const gx = new Float32Array(n), gz = new Float32Array(n), gf = new Float32Array(n), o = [0, 0, 0], hp = Math.PI / 2;
  for (let i = 0; i < n; i++) {
    if (P.round) { const q = R() * TAU, rr = Math.sqrt(R()); gx[i] = Math.cos(q) * rr; gz[i] = Math.sin(q) * rr; } else { gx[i] = R() * 2 - 1; gz[i] = R() * 2 - 1; }
  }
  let seed = (R() * 4294967296) >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  // how far the plate moves at (x, z) in a mode, and which way that grows
  const field = P.round ? (md, x, z) => {
    const nn = md[0], rr = Math.max(0.03, Math.hypot(x, z)), q = Math.atan2(z, x), A = Math.cos(nn * q), dA = -nn * Math.sin(nn * q);
    const kq = Math.PI * (nn ? md[1] - 0.5 : md[1]), B = nn ? Math.sin(kq * rr) : Math.cos(kq * rr), dB = nn ? kq * Math.cos(kq * rr) : -kq * Math.sin(kq * rr);
    o[0] = A * B; o[1] = (dA * -z * B) / (rr * rr) + (A * dB * x) / rr; o[2] = (dA * x * B) / (rr * rr) + (A * dB * z) / rr;
  } : (md, x, z) => {
    const nn = md[0], mm = md[1], sg = md[2], A = (x + 1) * hp, B = (z + 1) * hp;
    const cnA = Math.cos(nn * A), cmA = Math.cos(mm * A), cnB = Math.cos(nn * B), cmB = Math.cos(mm * B);
    o[0] = cnA * cmB + sg * cmA * cnB;
    o[1] = hp * (-nn * Math.sin(nn * A) * cmB - sg * mm * Math.sin(mm * A) * cnB);
    o[2] = hp * (-mm * cnA * Math.sin(mm * B) - sg * nn * cmA * Math.sin(nn * B));
  };
  // every grain a step toward the nearest still line, and shaken as hard as the plate
  // moves under it
  const relax = (md, kk, jit) => {
    for (let i = 0; i < n; i++) {
      let x = gx[i], z = gz[i];
      field(md, x, z);
      const f = o[0], g2 = o[1] * o[1] + o[2] * o[2] + 0.6;
      let sx = (-f * o[1]) / g2, sz = (-f * o[2]) / g2;
      const sl = Math.hypot(sx, sz), j = jit * (Math.abs(f) + 0.55);
      if (sl > 0.1) { sx *= 0.1 / sl; sz *= 0.1 / sl; }
      x += sx * kk + rnd() * j; z += sz * kk + rnd() * j;
      if (P.round) { const rr = Math.hypot(x, z); if (rr > 1) { x /= rr; z /= rr; } } else { x = clamp(x, -1, 1); z = clamp(z, -1, 1); }
      gx[i] = x; gz[i] = z; gf[i] = f;
    }
  };
  const settle = (md) => { for (let it = 0; it < 18; it++) relax(md, 0.7, 0.02 * (1 - it / 20)); };
  settle(P.modes[0]);
  const Tm = P.period, K = P.modes.length;
  let cur = -1;
  art.updates.push((t, dt, ctx) => {
    const cyc = Math.floor(t / Tm), mi = ((cyc % K) + K) % K, tm = t - cyc * Tm, nr = nearOf(ctx);
    if (mi !== cur) {
      // (first seen: as it lies at that hour; after: struck, the grains thrown up)
      if (cur < 0) { if (mi) settle(P.modes[mi]); } else for (let i = 0; i < n; i++) { gx[i] += rnd() * 0.14; gz[i] += rnd() * 0.14; }
      cur = mi;
    }
    if (dt > 0) relax(P.modes[mi], 1 - Math.exp(-dt * 1.5), (0.016 + 0.03 * nr) * Math.sqrt(dt * 60));
    const hop = (0.5 + 1.6 * nr) * U, sc = a * 0.96, y0 = th / 2 + 0.3 * U;
    for (let i = 0; i < n; i++) put(cls[i % nC], (i / nC) | 0, gx[i] * sc, y0 + Math.abs(gf[i]) * hop * Math.abs(Math.sin(t * 6 + i * 1.7)), gz[i] * sc);
    for (const cl of cls) cl.attr.needsUpdate = true;
    // the bow drawn down (or up) the edge as the note changes; the plate barely rocking
    bw.group.position.y = H + 2.5 * U * Math.sin(t * 0.3) + (cyc % 2 ? -6.5 : 6.5) * U * Math.sin(Math.PI * clamp(tm / 3.2, 0, 1));
    pk.group.rotation.set(0.05 * Math.sin(t * 0.21), 0, 0.05 * Math.cos(t * 0.17));
  });
  return { light: V3(0, H + U, 0), focus: V3(0, H, 0), span: a * (P.round ? 1.1 : 1.42), height: H + 18.5 * U, solid: a, low: H - 2 * U };
}

// ------------------------------------------------------------------ the forms
export const NEW_FORMS = {
  clockwork: {
    code: 'CLK', cls: 'Clockwork', nouns: ['Clockwork', 'Train', 'Escapement', 'Movement', 'Wheelwork', 'Hour'], set: 'any', from: 1,
    // its train, wheel by wheel: its teeth, and whether it meshes with the one it follows
    // or shares its arbor in the other plane (a wheel and a pinion: the train's speed
    // steps down there, and up again at the next such pair)
    params(R, depth) {
      const n = Math.min(12, 5 + Math.floor(depth * 0.7) + R.int(0, 1));
      const SMALL = [8, 9, 10, 12], MID = [14, 15, 16, 18], BIG = n > 8 ? [20, 24, 28, 30] : [24, 28, 32, 36];
      const train = [{ n: R.pick([18, 20, 24]), rel: 'root', par: -1 }];
      const maxCoax = Math.min(3, Math.floor((depth + 1) / 2));
      let last = 0, coax = 0, v = 1;
      for (let i = 1; i < n; i++) {
        const prev = train[last], end = i === n - 1;
        if (!end && i > 1 && R() < 0.2) {
          const par = R.int(0, i - 1);
          train.push({ n: R.pick(train[par].n >= 20 ? MID : BIG), rel: 'mesh', par, side: true });
        } else if (!end && prev.rel !== 'coax' && coax < maxCoax && R() < 0.45 && (v >= 1 ? prev.n >= 20 : prev.n <= 12)) {
          const N = R.pick(v >= 1 ? SMALL : BIG);
          v *= N / prev.n;
          coax++;
          train.push({ n: N, rel: 'coax', par: last });
          last = i;
        } else {
          train.push({ n: end ? R.pick([8, 9, 10]) : R.pick(prev.n >= 20 ? [...SMALL, ...MID] : [...MID, ...BIG]), rel: 'mesh', par: last });
          last = i;
        }
      }
      const great = R.pick([60, 72, 84, 96]), teeth = train.map((q) => q.n);
      return { wheels: n, train, great, drive: R.pick([10, 12]), spokes: R.pick([6, 8]),
        text: `A clock with no face: ${num(n)} toothed wheels of ${Math.min(...teeth)} to ${Math.max(...teeth)} teeth meshed in the air on arbors of light, each turning as its teeth demand, before a slow great wheel of ${great}; an anchor and its pendulum let them go one tick to the beat.` };
    },
    build: clockwork,
  },
  fountain: {
    code: 'FTN', cls: 'Fountain', nouns: ['Fountain', 'Font', 'Cascade', 'Spring', 'Basin', 'Plume'], set: 'any', from: 1,
    params(R, depth) {
      const tiers = Math.min(6, 2 + Math.floor(depth / 2) + (R() < 0.3 ? 1 : 0)), lobes = R.pick([6, 8, 9, 10, 12]), motes = Math.min(2400, 800 + depth * 160);
      return { tiers, lobes, motes,
        text: `${Num(tiers)} basins of shell one over another, each of ${lobes} lobes and turning its own way; water of light falls from basin to basin in curtains, ${motes.toLocaleString('en-US')} motes of it in the air, and the plume at its crown climbs when the ship is near.` };
    },
    build: fountain,
  },
  radiolarian: {
    code: 'RAD', cls: 'Radiolarian', nouns: ['Radiolarian', 'Lattice', 'Skeleton', 'Urchin', 'Spicule', 'Cage'], set: 'any', from: 2,
    params(R, depth) {
      const cages = Math.min(3, 1 + Math.floor(depth / 3) + (R() < 0.4 ? 1 : 0)), freq = depth >= 6 || (depth >= 4 && R() < 0.5) ? 4 : 2, rays = depth >= 3 && R() < 0.6;
      return { cages, freq, rays,
        text: `A lattice sphere of ${freq === 4 ? 162 : 42} round windows${cages === 2 ? ', a second within it' : cages === 3 ? ', a second and a third within it' : ''}, ${cages > 1 ? 'each turning against the next' : 'turning'}; ${rays ? 32 : 20} spines of light stand out of it, further when the ship is near, and it breathes.` };
    },
    build: radiolarian,
  },
  chladni: {
    code: 'CLD', cls: 'Sounding plate', nouns: ['Plate', 'Figure', 'Resonance', 'Tone', 'Sounding', 'Node'], set: 'any', from: 2,
    // its figures: on the square plate [n, m, sign]; on the round one [diameters, circles]
    params(R, depth) {
      const round = R() < 0.35, grains = Math.min(9000, 2400 + depth * 600), mx = Math.min(9, 3 + Math.floor(depth / 2)), K = Math.min(8, 3 + Math.floor(depth / 2));
      const modes = [], seen = new Set();
      for (let g = 0; modes.length < K && g < 300; g++) {
        const a = R.int(1, mx - 1), md = round ? [R.int(0, mx - 1), R.int(1, Math.max(2, mx - 2))] : [a, R.int(a + 1, mx), R() < 0.5 ? 1 : -1];
        if (!seen.has(md.join())) { seen.add(md.join()); modes.push(md); }
      }
      const period = R.int(14, 22);
      return { round, grains, modes, period,
        text: `A ${round ? 'round' : 'square'} plate hanging level in the air, ${grains.toLocaleString('en-US')} grains of light gathered on the still lines of its ringing; every ${period} seconds a bow is drawn down its edge, it rings another way, ${num(K)} figures in turn, and the grains run to the new one.` };
    },
    build: chladni,
  },
};
