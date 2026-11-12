import * as THREE from 'three';
import { Builder, mat, roughen } from '../../render/build.js';
import { glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam } from '../parts.js';

// The Grey Waste: what stands out in the pale desert past the edge of the forest, half
// buried, scoured by the wind, glazed, salted, abandoned. Seven families, by tier:
// COMMON
//   yardangs       long ridges of dark stone cut by the wind into hulls, prows to it, bored
//                  through; when a gust comes down the line their holes light in turn
//   fulgurite      a bolt of lightning caught in the sand and fused to glass, leaning and
//                  kinked, split ragged at its top, many roots splayed low over the sand;
//                  the strike runs down it again and again into its roots
//   saltchimneys   a pan of salt crazed into six-sided plates, chimneys of crusted stone
//                  standing out of it breathing vapor; the plates light by a rule of their
//                  neighbors, creep and settle, and are scattered afresh
// UNCOMMON
//   sailingstones  stones each in the groove of a long loop it has cut, sliding round it,
//                  their fresh tracks glowing; they stop when anything comes near
//   buriedring     the arc of a great ring of stone standing out of the sand, the rest of it
//                  buried; it turns, lifting sand out of the ground and pouring it off
// RARE
//   mirage         over a pan of black glass a strip of the lost forest stands in the air,
//                  upright and hanging upside down beneath, wavering; it turns to face you
//   sandfall       a rock hanging over the sand with nothing under it, turning; sand pours
//                  from cracks in its underside in streams that run and stop in their own time

const GLAZE = [0x0d1114, 0x161c21, 0x232b31];          // black glass, fused
const CRUST = 0x7f8689;                                 // sand fused to a crust, greyed
const SALT = [0xe8eae5, 0xd0d4d0, 0xaeb3b1];
const SNAG = [0x5f5c57, 0x7d7a73];                       // dead wood, bleached and weathered
const DUST = 0x4f5458;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Yax = V(0, 1, 0), Zax = V(0, 0, 1), UP = [0, 1, 0];
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const num = (n) => NUM[n] ?? String(n);
const Cap = (s) => s[0].toUpperCase() + s.slice(1);
const list = (a) => (a.length === 1 ? `${a[0]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// a hash in [0, 1): the same for the same numbers
const hsh = (i, s = 0) => {
  let x = (Math.imul(i | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x632be5ab, 0x85ebca6b)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------ light
// light drawn after the fog, faded in with the artifact; an entry's g is a gain set per frame
function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  const e = { m, o: opacity, g: 1 };
  fx.push(e);
  mesh.userData.fx = e;
  return mesh;
}
// grains: points moved every frame (additive: light, after the fog; else dark dust in the world)
function sparks(n, color, size, fx, opacity = 1, additive = true) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive, opacity });
  const e = { m, o: opacity, g: 1 };
  fx.push(e);
  const p = new THREE.Points(g, m);
  if (additive) p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  return { p, g, pos, sz, al, e, flush() { g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; } };
}
function finish(out, update) {
  return {
    ...out,
    mats: out.fx.map((e) => e.m),
    update(t, beat, c) {
      if (update) update(t, beat, c);
      for (const e of out.fx) e.m.uniforms.uOpacity.value = e.o * e.g * (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
    },
  };
}

// ------------------------------------------------------------------ shapes
const rock = (r, detail, seed, amount = 0.3) => { const g = new THREE.IcosahedronGeometry(r, detail); roughen(g, r * amount, seed); return g; };
// a part set along a direction: the matrix that takes +y (or `from`) to dir, at p
const along = (p, dir, from = Yax) => new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize()), V(1, 1, 1));
// its own bearing: built in a frame turned by psi about y
function turned(ctx, psi) {
  const c = Math.cos(psi), s = Math.sin(psi), inner = new THREE.Group();
  inner.rotation.y = psi;
  return { inner, ground: (x, z) => ctx.ground(x * c + z * s, -x * s + z * c), out: (v) => v.clone().applyAxisAngle(Yax, psi) };
}
// a triangle facing `out`
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
function tri(b, p0, p1, p2, out, color, em = 0) {
  _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
  _n.crossVectors(_a, _b);
  if (_n.lengthSq() < 1e-12) return;                      // nothing to see: two corners in one place
  if (_n.x * out[0] + _n.y * out[1] + _n.z * out[2] < 0) b.tri(p0, p2, p1, color, em);
  else b.tri(p0, p1, p2, color, em);
}
// a disc (r0 = 0) or a ring laid on the ground, lift over it; returns its vertex range
function drape(b, G, cx, cz, r0, r1, nr, na, lift, color, em = 0) {
  const start = b.pos.length / 3, col = typeof color === 'function' ? color : () => color;
  const P = (i, k) => { const r = r0 + ((r1 - r0) * i) / nr, a = (k / na) * TAU, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; return [x, G(x, z) + lift, z]; };
  for (let i = 0; i < nr; i++) for (let k = 0; k < na; k++) {
    const p00 = P(i, k), p01 = P(i, k + 1), p11 = P(i + 1, k + 1), p10 = P(i + 1, k), c = col(i, k);
    if (i > 0 || r0 > 0) tri(b, p00, p01, p11, UP, c, em);
    tri(b, p00, p11, p10, UP, c, em);
  }
  return [start, b.pos.length / 3];
}
// a dead snag: a bare trunk from (x, y, z), h tall, a few broken limbs
function snag(b, R, x, y, z, h, S) {
  const lean = V((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25).normalize(), r0 = 0.3 * S + h * 0.025, foot = V(x, y, z);
  const pts = [];
  for (let i = 0; i <= 4; i++) { const f = i / 4; pts.push(foot.clone().addScaledVector(lean, -1.2 * S + f * (h + 1.2 * S)).add(V((R() - 0.5) * 0.4 * S * f, 0, (R() - 0.5) * 0.4 * S * f))); }
  b.tube(pts, (t) => r0 * (1 - 0.75 * t), 6, (t) => (t > 0.6 ? SNAG[1] : SNAG[0]));
  const nb = 3 + Math.floor(R() * 3);
  for (let k = 0; k < nb; k++) {
    const f = 0.4 + 0.5 * R(), a = R() * TAU, p = foot.clone().addScaledVector(lean, -1.2 * S + f * (h + 1.2 * S));
    const len = (1 - f * 0.6) * h * (0.22 + 0.2 * R()), dir = V(Math.cos(a), 0.4 + R() * 0.8, Math.sin(a)).normalize();
    const e = p.clone().addScaledVector(dir, len), m = p.clone().lerp(e, 0.5).add(V(0, 0.25 * S, 0));
    b.tube([p, m, e], (t) => r0 * 0.42 * (1 - 0.7 * t), 4, SNAG[k % 2]);
  }
}

// ================================================================== yardangs
function yardangs(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), lb = new Builder(), fx = [];
  const F = turned(ctx, P.bearing), G = F.ground, pale = mixHex(A, 0xffffff, 0.4);
  // the ridges side by side across the wind (it blows along +x), the greatest in the middle
  const bodies = P.bodies.map((q) => { const H = P.height * Math.pow(q.k, 0.8); return { ...q, L: P.length * q.k, H, w: H * q.wf }; });
  let zHi = 0, zLo = 0;
  bodies.forEach((q, i) => {
    if (!i) { q.z = 0; zHi = q.w; zLo = -q.w; return; }
    if (i % 2) { q.z = zHi + q.gap * S + q.w; zHi = q.z + q.w; } else { q.z = zLo - q.gap * S - q.w; zLo = q.z - q.w; }
  });
  for (const q of bodies) { q.z -= (zHi + zLo) / 2; q.x0 = q.x * P.length - q.L / 2; }
  // a ridge's section at u along it (0 its prow, 1 its tail): blunt and high at the prow
  const hh = (q, u) => q.H * Math.sqrt(clamp(u / 0.12, 0, 1)) * Math.pow(1 - u, 0.55);
  const ww = (q, u) => q.w * Math.sqrt(clamp(u / 0.07, 0, 1)) * Math.pow(1 - u, 0.42);
  const base = (q, u) => { const x = q.x0 + u * q.L, w = ww(q, u) + 0.5; return Math.min(G(x, q.z - w), G(x, q.z), G(x, q.z + w)) - 0.45 * S; };
  const D = 3 * S;
  const pt = (q, u, phi) => {
    const cy = Math.sin(phi), cz = Math.cos(phi), h = hh(q, u), w = ww(q, u);
    const y = cy >= 0 ? h * Math.pow(cy, 0.85) : D * cy;
    const notch = cy >= 0 ? 1 - 0.16 * Math.exp(-(((cy - 0.2) / 0.12) ** 2)) : 1;     // the groove the sand cuts low along it
    return [q.x0 + u * q.L, base(q, u) + y, q.z + w * Math.sign(cz) * Math.pow(Math.abs(cz), 0.7) * notch];
  };
  const NU = 34, NA = 20, strata = [STONE[1], STONE[2], STONE[0], STONE[3]];
  let top = 0;
  for (const q of bodies) {
    const grid = [];
    for (let iu = 0; iu <= NU; iu++) { const row = [], u = iu / NU; for (let ia = 0; ia <= NA; ia++) { const p = pt(q, u, (ia / NA) * TAU); row.push(p); top = Math.max(top, p[1]); } grid.push(row); }
    for (let iu = 0; iu < NU; iu++) {
      const uc = clamp((iu + 0.5) / NU, 0.16, 0.84), bc = base(q, (iu + 0.5) / NU), hc = hh(q, (iu + 0.5) / NU);
      const ax = [q.x0 + uc * q.L, base(q, uc) + hh(q, uc) * 0.3, q.z];
      for (let ia = 0; ia < NA; ia++) {
        const p00 = grid[iu][ia], p10 = grid[iu + 1][ia], p11 = grid[iu + 1][ia + 1], p01 = grid[iu][ia + 1];
        const cyy = (p00[1] + p10[1] + p11[1] + p01[1]) / 4, rel = cyy - bc;
        const col = rel < 0 ? STONE[0] : rel > hc * 0.9 ? mixHex(STONE[3], RIM, 0.3) : strata[Math.floor(rel / (1.25 * S) + q.k * 7) % 4];
        for (const [p0, p1, p2] of [[p00, p10, p11], [p00, p11, p01]]) {
          const c0 = (p0[0] + p1[0] + p2[0]) / 3, c1 = (p0[1] + p1[1] + p2[1]) / 3, c2 = (p0[2] + p1[2] + p2[2]) / 3;
          tri(b, p0, p1, p2, [c0 - ax[0], c1 - ax[1], c2 - ax[2]], col);
        }
      }
    }
  }
  // the holes, bored clean through: a dark mouth on each face, a pale lip, the light in it
  const holes = [];
  for (const q of bodies) for (let j = 0; j < q.holes; j++) {
    const u = q.hu[j], h = hh(q, u), hr = clamp(0.2 * h, 0.5 * S, 1.3 * S), phiR = Math.asin(Math.pow(q.hf[j], 1 / 0.85));
    for (const phi of [phiR, Math.PI - phiR]) {
      const p = V(...pt(q, u, phi));
      const du = V(...pt(q, u + 0.01, phi)).sub(V(...pt(q, u - 0.01, phi)));
      const dp = V(...pt(q, u, phi + 0.02)).sub(V(...pt(q, u, phi - 0.02)));
      const n = du.cross(dp).normalize();
      if (n.z * (p.z - q.z) < 0) n.negate();
      b.cyl(hr, hr, 0.8 * S, 12, along(p.clone().addScaledVector(n, 0.05 * S), n), 0x06080a);
      b.torus(hr + 0.08 * S, 0.22 * S, 5, 14, along(p.clone().addScaledVector(n, 0.42 * S), n, Zax), mixHex(RIM, A, 0.25));
      const s0 = lb.pos.length / 3;
      lb.add(new THREE.CircleGeometry(hr * 0.92, 12), along(p.clone().addScaledVector(n, 0.47 * S), n, Zax), pale, 1);
      holes.push({ x: p.x, p, s0, s1: lb.pos.length / 3 });
    }
  }
  const lg = lb.build(), le = lg.attributes.emissive.array;
  F.inner.add(new THREE.Mesh(b.build(), mats.body), lightMesh(lg, fx, 0.95));
  // sand smoking off the crests, downwind
  const ng = bodies.length * 26, gr = sparks(ng, mixHex(A, 0xe9edf0, 0.55), 0.55 * S, fx, 0.9);
  const GR = Array.from({ length: ng }, (_, i) => {
    const q = bodies[i % bodies.length], u = 0.12 + R() * 0.6;
    return { x: q.x0 + u * q.L, y: base(q, u) + hh(q, u) + 0.2 * S, z: q.z + (R() - 0.5) * q.w * 0.4, ph: R(), sp: 0.14 + R() * 0.1, dz: (R() - 0.5) * 2 };
  });
  for (let i = 0; i < ng; i++) gr.sz[i] = 0.6 + R() * 0.8;
  F.inner.add(gr.p);
  const xmin = Math.min(...bodies.map((q) => q.x0)), xmax = Math.max(...bodies.map((q) => q.x0 + q.L));
  // a gust: a front running down the line, each its own strength
  const gustAt = (x, t) => {
    const cyc = t / P.gust, k = Math.floor(cyc), front = xmin - 12 * S + (cyc - k) * (xmax - xmin + 40 * S);
    return (0.55 + 0.45 * hsh(k, d.seed[6])) * Math.exp(-(((x - front) / (7 * S)) ** 2));
  };
  const span = Math.max(xmax - xmin, zHi - zLo) / 2 + 1 * S;
  const big = holes[0] ? holes[0].p : V(bodies[0].x0 + bodies[0].L * 0.2, P.height * 0.6, 0);
  const out = { group: new THREE.Group(), fx, light: F.out(big), focus: F.out(V((xmin + xmax) / 2, P.height * 0.45, 0)), span, clear: span + 6 * S, height: top + 0.5 * S, solid: { r: span * 0.85, top, low: 0 } };
  out.group.add(F.inner);
  return finish(out, (t) => {
    for (const h of holes) le.fill(0.08 + 0.92 * gustAt(h.x, t), h.s0, h.s1);
    lg.attributes.emissive.needsUpdate = true;
    for (let i = 0; i < ng; i++) {
      const g = GR[i], f = (g.ph + t * g.sp) % 1, x = g.x + f * 16 * S, z = g.z + g.dz * f * 3 * S + Math.sin(t * 0.7 + i) * 0.3 * S, gy = G(x, z);
      gr.pos[i * 3] = x;
      gr.pos[i * 3 + 1] = Math.max(gy + 0.25, g.y + Math.sin(f * Math.PI) * 1.2 * S - f * f * (g.y - gy));
      gr.pos[i * 3 + 2] = z;
      gr.al[i] = Math.sin(f * Math.PI) * (0.2 + 0.8 * gustAt(g.x + f * 8 * S, t));
    }
    gr.flush();
  });
}

// ================================================================== fulgurite
// (it must never read as a figure from any side: no knob at its top but a ragged split of
// tapering tips; no paired limbs but twigs at every height and bearing, of every length;
// roots splayed low and wide along the sand, many and uneven; the trunk leaning and kinked)
function fulgurite(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), lb = new Builder(), gb = new Builder(), fx = [];
  const G = ctx.ground, H = P.height, pale = mixHex(A, 0xffffff, 0.45);
  const lx = Math.cos(P.lean), lz = Math.sin(P.lean), qx = -lz, qz = lx;          // the way it leans, and across it
  const base = V((R() - 0.5) * 2 * S, 0, (R() - 0.5) * 2 * S);
  base.y = G(base.x, base.z) - 1.6 * S;
  const top = V(base.x + lx * P.tilt * H, H, base.z + lz * P.tilt * H);
  const cum = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + pts[i].distanceTo(pts[i - 1])); return c; };
  const above = (p, h) => { p.y = Math.max(p.y, G(p.x, p.z) + h); return p; };
  const chans = [];
  // the trunk, from where it struck down to the sand: kinked hard, zig and zag across its lean
  const NM = 11, main = [top.clone()], kinks = new Set();
  while (kinks.size < P.kinks) kinks.add(2 + Math.floor(R() * (NM - 4)));
  let off = 0, sg = R() < 0.5 ? -1 : 1;
  for (let i = 1; i < NM; i++) {
    const f = i / NM, p = top.clone().lerp(base, f);
    if (kinks.has(i)) { off += sg * (2.2 + R() * 2.6) * S; sg = R() < 0.75 ? -sg : sg; }
    const k = off * Math.sin(Math.PI * Math.min(1, f * 1.15)) + (R() - 0.5) * 1.4 * S;
    p.x += qx * k + (R() - 0.5) * 1.2 * S; p.z += qz * k + (R() - 0.5) * 1.2 * S; p.y += (R() - 0.5) * 0.8 * S;
    main.push(above(p, 0.9 * S));
  }
  main.push(base.clone());
  chans.push({ pts: main, cum: cum(main), r0: 0.62 * S, r1: 1.1 * S, d0: 0, root: true });
  const md = chans[0].cum;
  // where it struck: a ragged split of tips, each its own length, tapering to nothing
  for (let k = 0; k < P.tips; k++) {
    const a = P.lean + (k / P.tips) * TAU + R() * 1.4, len = (1.6 + R() * 3.8) * S, up = 0.35 + R() * 1.1;
    const dir = V(Math.cos(a) * 0.7 + lx * 0.5, up, Math.sin(a) * 0.7 + lz * 0.5).normalize(), e = top.clone().addScaledVector(dir, len);
    const m = top.clone().lerp(e, 0.45 + R() * 0.2).add(V((R() - 0.5) * 0.8 * S, (R() - 0.5) * 0.5 * S, (R() - 0.5) * 0.8 * S));
    const pts = [top.clone(), m, e];
    chans.push({ pts, cum: cum(pts), r0: 0.5 * S, r1: 0.05 * S, d0: 0, root: false });
  }
  // twigs off the trunk at every height and bearing, none matching another
  const twigAt = [];
  for (let k = 0; k < P.twigs; k++) {
    const j = 1 + Math.floor(R() * (NM - 3)), u = R(), s = main[j].clone().lerp(main[j + 1], u);
    let a = R() * TAU;
    for (const o of twigAt) if (Math.abs(o.y - s.y) < 2.5 * S && Math.abs(wrap(a - o.a - Math.PI)) < 0.7) a += 1.3;   // never a pair, one each side
    twigAt.push({ y: s.y, a });
    const len = (1.4 + R() * 4.6) * S, el = -0.7 + R() * 1.3;
    const dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const e = above(s.clone().addScaledVector(dir, len), 1.0 * S);
    const m = above(s.clone().lerp(e, 0.4 + R() * 0.3).add(V((R() - 0.5) * 0.9 * S, (R() - 0.5) * 0.9 * S, (R() - 0.5) * 0.9 * S)), 0.9 * S);
    const pts = [s, m, e];
    chans.push({ pts, cum: cum(pts), r0: 0.4 * S, r1: 0.05 * S, d0: md[j] + u * (md[j + 1] - md[j]), root: false });
  }
  // the roots: many, uneven, leaving the trunk low and running out over the sand, hugging it
  const low = [];
  for (let i = 1; i < NM; i++) if (main[i].y - G(main[i].x, main[i].z) < 0.32 * H) low.push(i);
  if (!low.length) low.push(NM - 1);
  const rootRun = (s, ds, a, rr, r0) => {
    const n = 4 + Math.floor(R() * 3), pts = [s.clone()];
    for (let i = 1; i < n; i++) {
      const f = i / n, x = s.x + Math.cos(a) * rr * f + (R() - 0.5) * 1.6 * S, z = s.z + Math.sin(a) * rr * f + (R() - 0.5) * 1.6 * S;
      pts.push(V(x, G(x, z) + (0.35 + R() * 0.6) * S + (i === 1 ? Math.max(0, s.y - G(x, z)) * 0.35 : 0), z));
    }
    const ex = s.x + Math.cos(a) * rr * (1 + 0.6 / n), ez = s.z + Math.sin(a) * rr * (1 + 0.6 / n);
    pts.push(V(ex, G(ex, ez) - 1.0 * S, ez));
    const c = { pts, cum: cum(pts), r0, r1: r0 * 0.4, d0: ds, root: true };
    chans.push(c);
    return c;
  };
  for (let k = 0; k < P.roots; k++) {
    const j = low[Math.floor(R() * low.length)], a = ((k + R() * 0.7) / P.roots) * TAU + P.turn, rr = P.spread * (0.25 + 0.75 * Math.pow(R(), 0.7));
    const c = rootRun(main[j], md[j], a, rr, (0.38 + R() * 0.22) * S);
    // some fork again, low, a shorter way off
    if (R() < 0.45) { const i = 1 + Math.floor(R() * (c.pts.length - 2)); rootRun(c.pts[i], c.d0 + c.cum[i], a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.7), rr * (0.25 + R() * 0.35), c.r0 * 0.6); }
  }
  const dist = [];
  let Lmax = 0, hi = 0, far = 0;
  chans.forEach((c, ci) => {
    const n = c.pts.length, rad = (t) => c.r0 + (c.r1 - c.r0) * t;
    b.tube(c.pts, rad, 6, (t) => (Math.floor(t * 7 + ci) % 3 === 0 ? CRUST : GLAZE[1 + (Math.floor(t * 5 + ci) % 2)]));
    lb.tube(c.pts, (t) => rad(t) * 1.3, 6, pale, 1);
    for (let i = 0; i < n - 1; i++) { const dd = c.d0 + (c.cum[i] + c.cum[i + 1]) / 2; for (let v = 0; v < 36; v++) dist.push(dd); }
    Lmax = Math.max(Lmax, c.d0 + c.cum[n - 1]);
    for (const p of c.pts) { hi = Math.max(hi, p.y); far = Math.max(far, Math.hypot(p.x, p.z)); }
  });
  // crusted lumps where the trunk bent, small and few; chips of its light low in the glass
  for (let i = 4; i < NM - 1; i++) {                       // (none near the top)
    const p = main[i];
    if (kinks.has(i) || R() < 0.25) b.add(rock(1, 0, 7 + i * 3, 0.4), mat(p.x, p.y, p.z, R() * 3, R() * 3, 0, (0.75 + 0.3 * (i / NM)) * 1.3 * S, (0.75 + 0.3 * (i / NM)) * 1.0 * S, (0.75 + 0.3 * (i / NM)) * 1.2 * S), CRUST);
  }
  for (let k = 0; k < 4; k++) {
    const c = chans[chans.length - 1 - Math.floor(R() * Math.min(6, chans.length - 1))], p = c.pts[1 + Math.floor(R() * (c.pts.length - 2))];
    b.ico(c.r0 * 0.9, 0, mat(p.x, p.y, p.z, R() * 3, R() * 3, 0), A, PULSE);
  }
  // where its roots go into the ground: glazed; and the light they take
  const roots = [];
  chans.forEach((c, ci) => {
    if (!c.root) return;
    const e = c.pts[c.pts.length - 1], r = (ci ? 1.4 + R() * 0.8 : 4.5) * S;
    drape(b, G, e.x, e.z, 0, r, 2, 12, 0.12, (i) => GLAZE[i ? 1 : 0]);
    const [s0, s1] = drape(gb, G, e.x, e.z, 0, r * 1.1, 2, 12, 0.24, pale, 1);
    roots.push({ s0, s1, dd: c.d0 + c.cum[c.cum.length - 1] - 1.2 * S });
  });
  for (let i = 0; i < 7; i++) {
    const a = R() * TAU, r = (2.5 + R() * 4) * S, x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r, s = (0.5 + R() * 0.6) * S;
    b.add(rock(1, 0, 50 + i, 0.4), mat(x, G(x, z) + s * 0.15, z, R() * 3, R() * 3, 0, s * 1.4, s * 0.8, s), i % 2 ? GLAZE[2] : CRUST);
  }
  const lg = lb.build(), le = lg.attributes.emissive.array, gg = gb.build(), ge = gg.attributes.emissive.array;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body), lightMesh(lg, fx, 0.55, { fresnel: 0.5 }), lightMesh(gg, fx, 0.8));
  const span = far + 1.5 * S;
  const out = { group, fx, light: top.clone(), focus: V(top.x * 0.5, H * 0.5, top.z * 0.5), span, clear: span + 5 * S, height: hi + 0.6 * S, solid: { r: Math.max(P.tilt * H, 4 * S) + 2 * S, top: hi, low: 0 } };
  return finish(out, (t, beat) => {
    // the strike: a front running down from the top, through every channel, into the roots
    const ph = beat / P.every, f = ph - Math.floor(ph), front = f * Lmax * 2.4, w = 2.8 * S;
    for (let v = 0; v < le.length; v++) {
      const dd = dist[v], x = (dd - front) / w;
      le[v] = 0.035 + 0.95 * Math.exp(-x * x) + (front > dd ? 0.3 * Math.exp(-(front - dd) / (0.5 * Lmax)) : 0);
    }
    lg.attributes.emissive.needsUpdate = true;
    for (const r of roots) ge.fill(0.04 + 0.9 * (front >= r.dd ? Math.exp(-(front - r.dd) / (0.6 * Lmax)) : 0), r.s0, r.s1);
    gg.attributes.emissive.needsUpdate = true;
  });
}

// ================================================================== salt chimneys
function saltchimneys(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), lb = new Builder(), fx = [];
  const G = ctx.ground, c = P.cell, Rp = P.radius, pale = mixHex(A, 0xffffff, 0.4);
  // the plates: six-sided, as a pan of salt crazes
  const cells = [], idx = new Map(), N = Math.ceil(Rp / (c * 1.5)) + 1;
  for (let r = -N; r <= N; r++) for (let q = -2 * N; q <= 2 * N; q++) {
    const x = c * Math.sqrt(3) * (q + r / 2), z = c * 1.5 * r;
    if (Math.hypot(x, z) > Rp * (1 + 0.12 * Math.sin(Math.atan2(z, x) * 3 + P.wob)) - c * 0.6) continue;
    idx.set(`${q},${r}`, cells.length);
    cells.push({ q, r, x, z });
  }
  const corner = new Map();
  const cornerAt = (x, z) => {
    const k = `${Math.round(x * 10)},${Math.round(z * 10)}`;
    if (!corner.has(k)) corner.set(k, { x: x + (R() - 0.5) * 0.5 * c, z: z + (R() - 0.5) * 0.5 * c, k });
    return corner.get(k);
  };
  const edges = new Map(), cr = [];
  cells.forEach((cl, i) => {
    const cs = [];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; cs.push(cornerAt(cl.x + c * Math.cos(a), cl.z + c * Math.sin(a))); }
    const ctr = [cl.x, G(cl.x, cl.z) + 0.2, cl.z], tone = mixHex(SALT[2], 0x8e9496, hsh(i, 5) * 0.6);
    for (let k = 0; k < 6; k++) {
      const p = cs[k], q = cs[(k + 1) % 6];
      tri(b, ctr, [p.x, G(p.x, p.z) + 0.2, p.z], [q.x, G(q.x, q.z) + 0.2, q.z], UP, tone);
      const key = p.k < q.k ? `${p.k}|${q.k}` : `${q.k}|${p.k}`;
      if (!edges.has(key)) edges.set(key, [p, q]);
    }
    cr.push(cs);
  });
  // the ridges the salt pushed up along every crack
  for (const [p, q] of edges.values()) beam(b, V(p.x, G(p.x, p.z) + 0.22, p.z), V(q.x, G(q.x, q.z) + 0.22, q.z), 0.42 * S, SALT[0]);
  // the light in each plate
  const lit = cells.map((cl, i) => {
    const s0 = lb.pos.length / 3, ctr = [cl.x, G(cl.x, cl.z) + 0.34, cl.z], cs = cr[i];
    for (let k = 0; k < 6; k++) {
      const p = cs[k], q = cs[(k + 1) % 6], px = cl.x + (p.x - cl.x) * 0.86, pz = cl.z + (p.z - cl.z) * 0.86, qx = cl.x + (q.x - cl.x) * 0.86, qz = cl.z + (q.z - cl.z) * 0.86;
      tri(lb, ctr, [px, G(px, pz) + 0.34, pz], [qx, G(qx, qz) + 0.34, qz], UP, pale, 0.03);
    }
    return [s0, lb.pos.length / 3];
  });
  // the chimneys: the first nearest the middle, the others apart from it and each other
  const chosen = [idx.get('0,0')];
  const order = cells.map((_, i) => i).filter((i) => Math.hypot(cells[i].x, cells[i].z) < Rp * 0.72);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (const i of order) {
    if (chosen.length >= P.chimneys) break;
    if (chosen.every((j) => Math.hypot(cells[i].x - cells[j].x, cells[i].z - cells[j].z) > 3.2 * c)) chosen.push(i);
  }
  const tops = [];
  let height = 0;
  chosen.forEach((ci, i) => {
    const cl = cells[ci], h = P.tall * (i ? P.hs[i % P.hs.length] : 1), rb = (1.2 + 0.9 * (h / P.tall)) * S, gy = G(cl.x, cl.z);
    const m = 4 + Math.round(3 * (h / P.tall)), segH = (h + 1.5 * S) / m, lx = (R() - 0.5) * 0.08, lz = (R() - 0.5) * 0.08;
    const at = (y) => [cl.x + lx * (y - gy), cl.z + lz * (y - gy)];
    let y = gy - 1.5 * S;
    for (let k = 0; k < m; k++) {
      const r0 = rb * (1 - 0.5 * (k / m)) * (1 + (R() - 0.5) * 0.2), r1 = rb * (1 - 0.5 * ((k + 1) / m)) * (1 + (R() - 0.5) * 0.2);
      const g = new THREE.CylinderGeometry(r1, r0, segH * 1.08, 9, 2);
      roughen(g, r0 * 0.14, 17 + i * 13 + k);
      const [x, z] = at(y + segH / 2);
      b.add(g, mat(x, y + segH / 2, z, 0, R() * 3, 0), (px, py, pz, j) => (hsh(j + k * 97, ci) < 0.16 ? SALT[1] : STONE[1 + ((k + (py > 0 ? 1 : 0)) % 2)]), 0, { flat: true });
      if (k) { const [cx, cz] = at(y); b.cyl(r0 * 1.16, r0 * 1.24, 0.55 * S, 9, mat(cx, y, cz), SALT[k % 2]); }
      y += segH;
    }
    // its throat, crusted white, lit in its depths
    // (the last segment's cap stands 0.04 segH over y; the light lies on it, inside the lip)
    const rt = rb * 0.5, [tx, tz] = at(y), yc = y + 0.04 * segH;
    b.add(new THREE.TorusGeometry(rt * 0.9, 0.3 * S, 5, 12), mat(tx, yc, tz, Math.PI / 2, 0, 0), SALT[0]);
    b.cyl(rt * 0.72, rt * 0.72, 0.2 * S, 9, mat(tx, yc + 0.22 * S, tz), A, PULSE);
    tops.push(V(tx, yc, tz));
    height = Math.max(height, yc + 0.4 * S);
  });
  // vapor rising from the throats, drifting with the wind
  const per = 34, nv = tops.length * per, vp = sparks(nv, mixHex(A, 0xffffff, 0.5), 1.2 * S, fx, 0.7);
  const VP = Array.from({ length: nv }, (_, i) => ({ c: tops[Math.floor(i / per)], ph: R(), sp: 0.07 + R() * 0.05, a: R() * TAU }));
  for (let i = 0; i < nv; i++) vp.sz[i] = 0.6 + R() * 1.0;
  const wx = Math.cos(P.wind), wz = Math.sin(P.wind);
  const group = new THREE.Group(), lg = lb.build(), le = lg.attributes.emissive.array;
  group.add(new THREE.Mesh(b.build(), mats.body), lightMesh(lg, fx, 0.85), vp.p);
  // the rule: a plate is salted if, of it and its six neighbors, three or five or more are
  // (a twisted majority, so the patches creep and settle); the chimneys are always salted
  const nc = cells.length, src = new Uint8Array(nc);
  for (const i of chosen) src[i] = 1;
  const nb = cells.map((cl) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([dq, dr]) => idx.get(`${cl.q + dq},${cl.r + dr}`)).filter((v) => v !== undefined));
  let state = new Uint8Array(nc), prev = new Uint8Array(nc), era = -1, cur = 0;
  const seedEra = (e) => { const Q = rng((d.seed[6] ^ Math.imul(e + 1, 2654435761)) >>> 0); for (let i = 0; i < nc; i++) state[i] = src[i] || Q() < P.fill ? 1 : 0; prev = state.slice(); cur = 0; };
  const step = () => {
    const nx = new Uint8Array(nc);
    for (let i = 0; i < nc; i++) { let n = state[i]; for (const j of nb[i]) n += state[j]; nx[i] = src[i] || n === 3 || n >= 5 ? 1 : 0; }
    prev = state; state = nx; cur++;
  };
  const span = Rp * 1.12 + 0.6 * c;
  const out = { group, fx, light: tops[0].clone(), focus: V(0, P.tall * 0.4, 0), span, clear: span + 5 * S, height, solid: { r: span * 0.7, top: height, low: 0 } };
  return finish(out, (t, beat) => {
    const k = Math.floor(beat * P.rate), e = Math.floor(k / P.cycle), s = k - e * P.cycle;
    if (e !== era || s < cur) { era = e; seedEra(e); }
    while (cur < s) step();
    for (let i = 0; i < nc; i++) le.fill(state[i] ? (prev[i] ? 0.45 : 1) : prev[i] ? 0.14 : 0.025, lit[i][0], lit[i][1]);
    lg.attributes.emissive.needsUpdate = true;
    for (let i = 0; i < nv; i++) {
      const v = VP[i], f = (v.ph + t * v.sp) % 1, sw = (0.4 + f * 2.6) * S;
      vp.pos[i * 3] = v.c.x + wx * f * f * 12 * S + Math.cos(v.a + t * 0.3) * sw;
      vp.pos[i * 3 + 1] = v.c.y + 0.3 * S + f * (9 + 7 * f) * S;
      vp.pos[i * 3 + 2] = v.c.z + wz * f * f * 12 * S + Math.sin(v.a + t * 0.3) * sw;
      vp.al[i] = Math.min(1, f * 6) * Math.pow(1 - f, 1.5) * 0.8;
    }
    vp.flush();
  });
}

// ================================================================== sailing stones
function sailingstones(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), tb = new Builder(), fx = [];
  const F = turned(ctx, P.bearing), G = F.ground, pale = mixHex(A, 0xffffff, 0.35);
  const st = P.stones.map((q) => { const h = P.tall * q.k * (q.slab ? 1 : 0.7); return { ...q, h, rho: q.slab ? h * 0.32 : h * 0.66 }; });
  // their lanes side by side across the wind
  let zHi = 0, zLo = 0;
  st.forEach((q, i) => {
    const half = q.b * S * (1 + q.wig) + q.rho + 0.6 * S;
    if (!i) { q.z = 0; zHi = half; zLo = -half; } else if (i % 2) { q.z = zHi + 1.2 * S + half; zHi = q.z + half; } else { q.z = zLo - 1.2 * S - half; zLo = q.z - half; }
  });
  const zm = (zHi + zLo) / 2;
  // each loop: long along the wind, narrow across it, never crossing itself
  const NL = 120;
  const verts = [];      // [stone, arc length] for each vertex of the light
  st.forEach((q, i) => {
    q.z -= zm;
    const ha = (P.length / 2) * q.a, hb = q.b * S, cx = q.cx * P.length;
    q.pts = [];
    for (let k = 0; k <= NL; k++) {
      const th = (k / NL) * TAU, co = Math.cos(th);
      const x = cx + ha * Math.sign(co) * Math.pow(Math.abs(co), 0.6), z = q.z + hb * (Math.sin(th) + q.wig * Math.sin(2 * th + q.wp));
      q.pts.push(V(x, G(x, z), z));
    }
    q.cum = [0];
    for (let k = 1; k <= NL; k++) q.cum.push(q.cum[k - 1] + Math.hypot(q.pts[k].x - q.pts[k - 1].x, q.pts[k].z - q.pts[k - 1].z));
    q.L = q.cum[NL];
    q.s = q.s0 * q.L;
    // the groove it has cut, and the light in it
    const wt = Math.min(0.42 * q.rho, 1.4 * S);
    for (let k = 0; k < NL; k++) {
      const p0 = q.pts[k], p1 = q.pts[k + 1], dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * wt, nz = (dx / l) * wt;
      const c = (x, z, lift) => [x, G(x, z) + lift, z];
      for (const [bb, lift, col, em] of [[b, 0.1, 0x666c70, 0], [tb, 0.2, pale, 0.03]]) {
        const a0 = c(p0.x - nx, p0.z - nz, lift), a1 = c(p0.x + nx, p0.z + nz, lift), b1 = c(p1.x + nx, p1.z + nz, lift), b0 = c(p1.x - nx, p1.z - nz, lift);
        tri(bb, a0, a1, b1, UP, col, em);
        tri(bb, a0, b1, b0, UP, col, em);
      }
      // (each light vertex keeps where along the loop it lies: the middle of its piece is near enough)
      while (verts.length < tb.pos.length / 3) verts.push([i, (q.cum[k] + q.cum[k + 1]) / 2]);
    }
    // the stone
    const sb = new Builder();
    if (q.slab) {
      const g = new THREE.CylinderGeometry(0.62 * 0.707, 0.707, 1, 4, 3);
      g.rotateY(Math.PI / 4);
      roughen(g, 0.06, 5 + i * 7);
      const hh = q.h + 0.9 * S, w = q.h * 0.6, dp = q.h * 0.2;
      sb.add(g, mat(0, hh / 2 - 0.9 * S, 0, 0, 0, 0, dp, hh, w), (px, py) => (py > 0.38 ? mixHex(STONE[2], RIM, 0.2) : STONE[(i + 1) % 3]), 0, { flat: true });
      const f = (0.62 * q.h + 0.9 * S) / hh, k = 1 - 0.38 * f;
      sb.box(dp * k * 1.12, 0.22 * S, w * k * 1.1, mat(0, 0.62 * q.h, 0), A, PULSE);
    } else {
      const M = mat(0, 0.35 * q.h, 0, 0, 0, 0, 0.75 * q.h, 0.65 * q.h, 0.6 * q.h);
      sb.add(rock(1, 1, 31 + i * 5, 0.22), M, (px, py, pz, j) => (py > 0.6 ? mixHex(STONE[3], RIM, 0.2) : STONE[((j / 9) | 0) % 3]), 0, { flat: true });
      const tg = new THREE.TorusGeometry(1.02, 0.05, 4, 24);
      tg.rotateX(Math.PI / 2);
      tg.translate(0, 0.2, 0);
      sb.add(tg, M, A, PULSE);
    }
    q.mesh = new THREE.Mesh(sb.build(), mats.body);
    q.idx = 0;
    F.inner.add(q.mesh);
  });
  const tg = tb.build(), te = tg.attributes.emissive.array;
  let top = Math.max(...st.map((q) => q.h)) + 0.4 * S;
  if (P.snag) {
    const x = (R() - 0.5) * 0.6 * P.length, z = zHi - zm + 4 * S, h = P.snagH;
    snag(b, R, x, G(x, z), z, h, S);
    top = Math.max(top, h + 0.5 * S);
  }
  F.inner.add(new THREE.Mesh(b.build(), mats.body), lightMesh(tg, fx, 0.9));
  // where a stone is on its loop
  const place = (q) => {
    let k = q.idx;
    while (q.cum[k + 1] < q.s) k = (k + 1) % NL;
    while (q.cum[k] > q.s) k = (k + NL - 1) % NL;
    q.idx = k;
    const f = (q.s - q.cum[k]) / Math.max(1e-6, q.cum[k + 1] - q.cum[k]), p0 = q.pts[k], p1 = q.pts[k + 1];
    const x = p0.x + (p1.x - p0.x) * f, z = p0.z + (p1.z - p0.z) * f;
    q.mesh.position.set(x, G(x, z) - 0.05 * S, z);
    q.mesh.rotation.y = q.yaw + 0.12 * Math.sin((q.s / q.L) * TAU);
  };
  st.forEach(place);
  const span = Math.max(P.length / 2 + 2 * S, (zHi - zLo) / 2 + 1 * S);
  const group = new THREE.Group();
  group.add(F.inner);
  const s0 = st[0];
  const out = { group, fx, light: F.out(V(s0.pts[0].x, 0.62 * s0.h, s0.z)), focus: V(0, P.tall * 0.35, 0), span, clear: span + 6 * S, height: top, solid: { r: span * 0.8, top, low: 0 } };
  let last = null;
  return finish(out, (t, beat, c) => {
    const dt = last === null ? 0 : clamp(t - last, 0, 0.1);
    last = t;
    // they slide only while nothing is near
    const go = 1 - sstep(0.45, 0.85, c.near || 0);
    for (const q of st) { q.s = (((q.s + q.dir * q.v * S * dt * go) % q.L) + q.L) % q.L; place(q); }
    for (let v = 0; v < verts.length; v++) {
      const [i, s] = verts[v], q = st[i], age = ((((q.dir > 0 ? q.s - s : s - q.s) % q.L) + q.L) % q.L) / q.L;
      te[v] = 0.03 + 0.9 * Math.pow(1 - age, 4);
    }
    tg.attributes.emissive.needsUpdate = true;
  });
}

// ================================================================== buried ring
function buriedring(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), wb = new Builder(), mb = new Builder(), b = new Builder(), fx = [];
  const F = turned(ctx, P.bearing), G = F.ground, Rr = P.radius, th = P.thick, wd = P.width, yc = P.show - Rr, ri = Rr - th;
  const pale = mixHex(A, 0xffffff, 0.4), NS = 72, rm = Rr - th / 2, arc = (TAU * Rr) / NS;
  // the ring: blocks of stone round it, pale edges on its faces, a band now and then across it
  const gap = P.breaks ? Math.floor(R() * NS) : -1;
  for (let k = 0; k < NS; k++) {
    if (k === gap) continue;
    const a = ((k + 0.5) / NS) * TAU, x = Math.cos(a), y = Math.sin(a), rz = a + Math.PI / 2;
    wb.box(arc * 1.03, th, wd, mat(x * rm, y * rm, 0, 0, 0, rz), k % 2 ? STONE[1] : STONE[2]);
    for (const q of [-1, 1]) wb.box(arc * 1.03, 0.4 * S, 0.3 * S, mat(x * (Rr - 0.25 * S), y * (Rr - 0.25 * S), q * (wd / 2 + 0.1 * S), 0, 0, rz), mixHex(STONE[3], RIM, 0.35));
    if (k % 8 === 3) wb.box(arc * 0.4, 0.3 * S, wd * 1.04, mat(x * (Rr + 0.1 * S), y * (Rr + 0.1 * S), 0, 0, 0, rz), RIM);
  }
  // the marks round its inner face, and their light
  const marks = [];
  for (let j = 0; j < P.marks; j++) {
    const a = ((j + 0.5) / P.marks) * TAU, x = Math.cos(a), y = Math.sin(a), rz = a + Math.PI / 2;
    if (Math.floor(((a / TAU) * NS)) === gap) continue;
    wb.box(0.9 * S, 0.3 * S, wd * 0.55, mat(x * (ri - 0.1 * S), y * (ri - 0.1 * S), 0, 0, 0, rz), A, 0.7);
    const s0 = mb.pos.length / 3;
    mb.box(1.15 * S, 0.12 * S, wd * 0.6, mat(x * (ri - 0.32 * S), y * (ri - 0.32 * S), 0, 0, 0, rz), pale, 1);
    marks.push({ a, s0, s1: mb.pos.length / 3 });
  }
  const wheel = new THREE.Group();
  wheel.position.y = yc;
  const mg = mb.build(), me = mg.attributes.emissive.array;
  wheel.add(new THREE.Mesh(wb.build(), mats.body), lightMesh(mg, fx, 0.9));
  // blocks fallen from it, half in the sand about its feet
  const xo = Math.sqrt(Math.max(1, Rr * Rr - yc * yc));
  for (let i = 0; i < P.rubble; i++) {
    const q = i % 2 ? 1 : -1, s = (1.4 + R() * 1.8) * S;
    const outer = R() < 0.5, x = outer ? q * (xo + (1.5 + R() * 6) * S) : q * R() * xo * 0.8, z = outer ? (R() - 0.5) * 8 * S : (R() < 0.5 ? -1 : 1) * (wd / 2 + s + (1 + R() * 6) * S);
    b.box(s * 1.4, s, s * 0.9, mat(x, G(x, z) + s * 0.1, z, (R() - 0.5) * 0.6, R() * 3, (R() - 0.5) * 0.6), i % 3 ? STONE[i % 3] : STONE[3]);
  }
  // sand carried up out of the ground on the rising side, sliding off its faces, and a thin
  // veil of it through the middle
  const ng = 170, gr = sparks(ng, mixHex(A, 0xdfe3e6, 0.55), 0.5 * S, fx, 0.85);
  const GR = Array.from({ length: ng }, (_, i) => {
    const inner = i % 5 === 0, al = inner ? Math.PI / 2 + (R() - 0.5) * 0.5 : Math.PI / 2 - P.dir * (0.15 + R() * 0.7);
    const r = inner ? ri : ri + R() * th, x = Math.cos(al) * r + (inner ? 0 : 0);
    const z = inner ? (R() - 0.5) * wd * 0.8 : (R() < 0.5 ? -1 : 1) * (wd / 2 + (0.45 + R() * 0.6) * S);
    const y0 = yc + Math.sin(al) * r - (inner ? 0.2 * S : 0), gy = G(x, z), Tf = Math.sqrt((2 * Math.max(0.5, y0 - gy)) / 9.8);
    gr.sz[i] = 0.6 + R() * 0.8;
    return { x, z, y0, gy, Tf: Tf + 0.2, ph: R() };
  });
  const group = new THREE.Group();
  F.inner.add(wheel, new THREE.Mesh(b.build(), mats.body), gr.p);
  group.add(F.inner);
  const out = { group, fx, light: F.out(V(0, P.show - th, 0)), focus: V(0, P.show * 0.5, 0), span: xo + 2 * S, clear: xo + 8 * S, height: P.show + 0.4 * S, solid: { r: xo * 0.9, top: P.show, low: 0 } };
  const w = (P.dir * TAU) / P.period;
  return finish(out, (t) => {
    const rot = P.ph0 + w * t;
    wheel.rotation.z = rot;
    // each mark lights as it comes over the top
    for (const m of marks) { const x = wrap(m.a + rot - Math.PI / 2) / 0.22; me.fill(0.05 + 0.95 * Math.exp(-x * x), m.s0, m.s1); }
    mg.attributes.emissive.needsUpdate = true;
    for (let i = 0; i < ng; i++) {
      const g = GR[i], tau = ((t / g.Tf + g.ph) % 1) * g.Tf, y = g.y0 - 4.9 * tau * tau;
      gr.pos[i * 3] = g.x; gr.pos[i * 3 + 1] = Math.max(g.gy + 0.1, y); gr.pos[i * 3 + 2] = g.z;
      gr.al[i] = y < g.gy ? 0 : Math.min(1, tau * 5) * 0.9;
    }
    gr.flush();
  });
}

// ================================================================== mirage
function mirage(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), pb = new Builder(), fx = [];
  const G = ctx.ground, Rp = P.pan, pale = mixHex(A, 0xffffff, 0.5), Hh = P.horizon, W = P.width;
  // the pan of black glass, crusted at its edge
  drape(b, G, 0, 0, 0, Rp, 4, 32, 0.14, (i, k) => GLAZE[(i + (k % 5 === 0 ? 1 : 0)) % 2]);
  drape(b, G, 0, 0, Rp, Rp + 1.6 * S, 1, 32, 0.12, CRUST);
  const [p0, p1] = drape(pb, G, 0, 0, 0, Rp * 0.92, 3, 32, 0.26, pale, 1);
  const pg = pb.build(), pe = pg.attributes.emissive.array, pp = pg.attributes.position.array;
  for (let v = p0; v < p1; v++) pe[v] = 0.04 + 0.3 * Math.pow(1 - Math.hypot(pp[v * 3], pp[v * 3 + 2]) / Rp, 2);
  // leaning stones at its edge, their tips lit
  let slabTop = 0;
  for (let k = 0; k < P.slabs; k++) {
    const a = ((k + R() * 0.55) / P.slabs) * TAU, r = Rp + (1.5 + R() * 2) * S, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = (4 + R() * 4) * S, w = (2 + R() * 1.4) * S, lean = 0.12 + R() * 0.23, yaw = Math.PI / 2 - a, y0 = G(x, z) - 1.5 * S;
    const g = new THREE.CylinderGeometry(0.7 * 0.707, 0.707, 1, 4, 3);
    g.rotateY(Math.PI / 4);
    roughen(g, 0.06, 11 + k * 5);
    const M = mat(x, y0 + h / 2, z, lean, yaw, 0);
    b.add(g, mat(x, y0 + h / 2, z, lean, yaw, 0, w, h, 0.8 * S), (px, py) => (py > 0.36 ? mixHex(STONE[2], RIM, 0.18) : STONE[k % 3]), 0, { flat: true });
    const tip = V(0, h / 2 + 0.15 * S, 0).applyMatrix4(M);
    b.ico(0.5 * S, 0, mat(tip.x, tip.y, tip.z), A, PULSE);
    slabTop = Math.max(slabTop, tip.y + 0.5 * S);
  }
  // the image: spruces in strips of light along a horizon in the air, and the same hanging
  // upside down beneath it
  const trees = Array.from({ length: P.trees }, (_, j) => ({ x: ((j + 0.5) / P.trees - 0.5) * W * 0.94 + (R() - 0.5) * (W / P.trees) * 0.6, h: P.treeH * (0.5 + R() * 0.5), tiers: 4 + Math.floor(R() * 3) }));
  const hs = 0.75 * S, strips = [{ x: 0, w: W / 2, c: 2 }];
  for (const tr of trees) {
    const rows = Math.max(5, Math.round(tr.h / hs));
    for (let c = 0; c < 2; c++) for (let r = 0; r < rows; r++) {
      const v0 = r / rows, v1 = (r + 0.78) / rows, vm = (v0 + v1) / 2;
      const w = tr.h * 0.24 * (vm < 0.08 ? 0.12 : (1 - vm) * (0.5 + 0.5 * (1 - ((vm * tr.tiers) % 1))));
      strips.push({ x: tr.x, v0: v0 * tr.h, v1: v1 * tr.h, w: Math.max(0.15 * S, w), c });
    }
  }
  const nq = strips.length, pos = new Float32Array(nq * 18), em = new Float32Array(nq * 6), col = new Float32Array(nq * 18);
  const cc = new THREE.Color(pale);
  for (let i = 0; i < nq * 6; i++) col.set([cc.r, cc.g, cc.b], i * 3);
  const ig = new THREE.BufferGeometry();
  ig.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  ig.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ig.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const band = new THREE.Group(), img = lightMesh(ig, fx, 0.75), pan = lightMesh(pg, fx, 0.8);
  band.add(img);
  // heat going up off the glass
  const nh = 90, hp = sparks(nh, pale, 0.6 * S, fx, 0.6);
  const HP = Array.from({ length: nh }, () => { const a = R() * TAU, r = Math.sqrt(R()) * Rp * 0.85, x = Math.cos(a) * r, z = Math.sin(a) * r; return { x, z, gy: G(x, z), ph: R(), sp: 0.05 + R() * 0.05, w: R() * TAU }; });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body), pan, band, hp.p);
  let yaw = P.ph, last = null;
  const maxTop = Hh + P.treeH * 1.4 + 0.5 * S;
  const out = { group, fx, light: V(0, Hh, 0), focus: V(0, Hh * 0.85, 0), span: Math.max(W / 2, Rp + 3 * S), clear: Rp + 6 * S, height: maxTop, solid: { r: Rp + 3 * S, top: slabTop, low: 0 } };
  const put = (o, x0, x1, y0, y1) => { pos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0], o); };
  return finish(out, (t, beat, c) => {
    const dt = last === null ? 1 : clamp(t - last, 0, 0.1);
    last = t;
    // it turns to face whoever looks at it
    const sp = c.shipLocal;
    if (sp) yaw += wrap(Math.atan2(sp.x, sp.z) - yaw) * (1 - Math.exp(-dt * 0.5));
    band.rotation.y = yaw;
    // it stretches and shrinks as the heat does, wanes and comes back
    const su = 1 + 0.28 * Math.sin(t * 0.13 + P.ph) + 0.1 * Math.sin(t * 0.37);
    const sd = Math.min(su * P.inv, (Hh - 3 * S) / P.treeH);
    const gain = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((t * TAU) / P.period + P.ph));
    img.userData.fx.g = gain;
    pan.userData.fx.g = 0.4 + 0.6 * gain;
    for (let i = 0; i < nq; i++) {
      const s = strips[i];
      if (s.c === 2) { put(i * 18, -W / 2, W / 2, Hh - 0.12 * S, Hh + 0.12 * S); em.fill(0.9, i * 6, i * 6 + 6); continue; }
      const sg = s.c ? -1 : 1, k = s.c ? sd : su, ya = Hh + sg * s.v0 * k, yb = Hh + sg * s.v1 * k, ym = (ya + yb) / 2;
      const sh = Math.sin(t * 1.9 + ym * 0.55) * 0.5 * S + Math.sin(t * 0.7 - ym * 0.17 + s.x * 0.05) * 0.9 * S;
      put(i * 18, s.x - s.w + sh, s.x + s.w + sh, ya, yb);
      const edge = 1 - Math.pow(Math.min(1, Math.abs(s.x) / (W / 2)), 4);
      em.fill(Math.max(0.01, (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(ym * 0.5 - t * 2.4)) ** 2) * (s.c ? 0.55 : 1) * edge), i * 6, i * 6 + 6);
    }
    ig.attributes.position.needsUpdate = true;
    ig.attributes.emissive.needsUpdate = true;
    for (let i = 0; i < nh; i++) {
      const h = HP[i], f = (h.ph + t * h.sp) % 1;
      hp.pos[i * 3] = h.x + Math.sin(t * 0.9 + h.w) * 0.8 * S;
      hp.pos[i * 3 + 1] = h.gy + 0.4 + f * 14 * S;
      hp.pos[i * 3 + 2] = h.z + Math.cos(t * 0.8 + h.w) * 0.8 * S;
      hp.al[i] = Math.sin(f * Math.PI) * 0.5 * gain;
    }
    hp.flush();
  });
}

// ================================================================== sandfall
function sandfall(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), ib = new Builder(), lb = new Builder(), fx = [];
  const G = ctx.ground, Rt = P.radius, T = P.thick, pale = mixHex(A, 0xffffff, 0.45);
  // the rock: a cone of it point down, strata in its sides, a crust of dust on its top
  const K = 9, prof = [];
  for (let k = 0; k <= K; k++) { const f = k / K; prof.push([Rt * Math.pow(f, 0.75) * (k ? 1 + (R() - 0.5) * 0.16 : 0), f * T]); }
  prof.push([Rt * 0.9, T + 0.6 * S], [Rt * 0.45, T + 1.1 * S], [0, T + 1.3 * S]);
  const NA = 16, ring = prof.map(([r, y], k) => Array.from({ length: NA + 1 }, (_, j) => {
    const a = ((j % NA) / NA) * TAU, jr = r > 0 ? 1 + (hsh(k * 31 + (j % NA), 7) - 0.5) * 0.18 : 0, jy = r > 0 ? (hsh(k * 31 + (j % NA), 9) - 0.5) * 0.6 * S : 0;
    return [Math.cos(a) * r * jr, y + jy, Math.sin(a) * r * jr];
  }));
  for (let k = 0; k < ring.length - 1; k++) for (let j = 0; j < NA; j++) {
    const p00 = ring[k][j], p01 = ring[k][j + 1], p11 = ring[k + 1][j + 1], p10 = ring[k + 1][j];
    const cy = (p00[1] + p11[1]) / 2, col = cy > T + 0.2 * S ? mixHex(CRUST, RIM, 0.2) : cy < T * 0.18 ? STONE[0] : [STONE[1], STONE[2], STONE[3], STONE[1]][Math.floor(cy / (1.6 * S)) % 4];
    for (const [a, bb, c] of [[p00, p01, p11], [p00, p11, p10]]) {
      const cx = (a[0] + bb[0] + c[0]) / 3, cyy = (a[1] + bb[1] + c[1]) / 3, cz = (a[2] + bb[2] + c[2]) / 3;
      tri(ib, a, bb, c, [cx, cyy - T * 0.55, cz], col);
    }
  }
  // stone teeth hanging from its underside
  for (let i = 0; i < P.teeth; i++) {
    const f = 0.15 + R() * 0.35, a = R() * TAU, rr = Rt * Math.pow(f, 0.75) * 0.85, h = (2.5 + R() * 2.5) * S;
    ib.cone(0.9 * S, h, 5, mat(Math.cos(a) * rr, f * T - h / 2 + 0.7 * S, Math.sin(a) * rr, Math.PI, R() * 3, 0), STONE[i % 2]);
  }
  // the cracks the sand comes from, lit
  const streams = [];
  for (let s = 0; s < P.streams; s++) {
    const be = ((s + R() * 0.5) / P.streams) * TAU, f = 0.12 + R() * 0.33, rr = Rt * Math.pow(f, 0.75) * 0.97, y = f * T;
    ib.add(new THREE.IcosahedronGeometry(1, 0), mat(Math.cos(be) * rr, y, Math.sin(be) * rr, 0, -be, 0, 0.7 * S, 0.5 * S, 1.8 * S), A, PULSE);
    streams.push({ be, r: rr + 0.35 * S, y: y - 0.6 * S, per: P.pers[s], ph: R() * TAU });
  }
  let top = P.lift + T + 1.3 * S + 0.6 * S;
  if (P.snag) {
    const a = R() * TAU, r = Rt * 0.25;
    snag(ib, R, Math.cos(a) * r, T + 0.6 * S, Math.sin(a) * r, P.snagH, S);
    top = P.lift + T + 0.6 * S + P.snagH + 0.6 * S;
  }
  const isle = new THREE.Group();
  isle.position.y = P.lift;
  isle.add(new THREE.Mesh(ib.build(), mats.body));
  // below: a ring of glazed ground where it falls, and stones that fell from it
  const rs = streams.map((s) => s.r), r0 = Math.max(0, Math.min(...rs) - 2.2 * S), r1 = Math.max(...rs) + 2.2 * S;
  drape(b, G, 0, 0, r0, r1, 2, 40, 0.12, (i, k) => GLAZE[(i + k) % 3 === 0 ? 1 : 0]);
  drape(lb, G, 0, 0, r0, r1, 2, 40, 0.24, pale, 0.04);
  for (let i = 0; i < P.fallen; i++) {
    const a = R() * TAU, r = (0.3 + R() * 0.8) * Rt, x = Math.cos(a) * r, z = Math.sin(a) * r, s = (0.8 + R() * 1.4) * S;
    b.add(rock(1, 0, 70 + i, 0.35), mat(x, G(x, z) + s * 0.1, z, R(), R() * 3, 0, s * 1.3, s * 0.85, s), STONE[i % 3]);
  }
  const lg = lb.build(), le = lg.attributes.emissive.array, lp = lg.attributes.position.array, nvl = le.length;
  const va = new Float32Array(nvl), vr = new Float32Array(nvl);
  for (let v = 0; v < nvl; v++) { va[v] = Math.atan2(lp[v * 3 + 2], lp[v * 3]); vr[v] = Math.hypot(lp[v * 3], lp[v * 3 + 2]); }
  // the grains: dark sand and lit, each stream its own
  const g = 9.8, nd = P.streams * 90, nl = P.streams * 40;
  const dk = sparks(nd, DUST, 0.65 * S, fx, 1, false), lt = sparks(nl, mixHex(A, 0xe6eaec, 0.5), 0.55 * S, fx, 0.9);
  for (const s of streams) { const h = P.lift + s.y + 4; s.Tf = Math.sqrt((2 * h) / g); s.Tc = s.Tf + 0.7; }
  const mk = (n, pts) => Array.from({ length: n }, (_, i) => { const s = streams[i % P.streams]; pts.sz[i] = 0.6 + R() * 0.8; return { s, ph: R(), j: (R() - 0.5) * 0.8 * S, dr: (0.2 + R() * 0.6) * S, da: (R() - 0.5) * 0.3 }; });
  const GD = mk(nd, dk), GL = mk(nl, lt);
  const group = new THREE.Group();
  group.add(isle, new THREE.Mesh(b.build(), mats.body), lightMesh(lg, fx, 0.85), dk.p, lt.p);
  const w = (P.dir * TAU) / P.period, bob = (t) => Math.sin(t * 0.23) * 0.5 * S;
  const on = (s, ts) => Math.sin((TAU * ts) / s.per + s.ph) > -0.25;
  const fall = (L, pts, t) => {
    for (let i = 0; i < L.length; i++) {
      const q = L[i], s = q.s, tau = ((t / s.Tc + q.ph) % 1) * s.Tc, ts = t - tau;
      if (!on(s, ts)) { pts.al[i] = 0; pts.pos[i * 3 + 1] = -50; continue; }
      const ang = s.be + w * ts, rr = s.r + q.j, x0 = Math.cos(ang) * rr, z0 = Math.sin(ang) * rr, y0 = P.lift + bob(ts) + s.y;
      const gy = G(x0, z0), th = Math.sqrt((2 * Math.max(0.1, y0 - gy)) / g);
      let x = x0 + Math.cos(ang + q.da) * q.dr * tau * 0.3, z = z0 + Math.sin(ang + q.da) * q.dr * tau * 0.3, y = y0 - 0.5 * g * tau * tau, a = 1;
      if (tau > th) {
        // it has struck: a puff thrown out low, fading
        const k = (tau - th) / 0.6;
        if (k >= 1) { pts.al[i] = 0; pts.pos[i * 3 + 1] = -50; continue; }
        x += Math.cos(ang + q.da * 6) * q.dr * k * 3; z += Math.sin(ang + q.da * 6) * q.dr * k * 3;
        y = G(x, z) + 0.15 + Math.sin(k * Math.PI) * 0.9 * S;
        a = 1 - k;
      }
      pts.pos[i * 3] = x; pts.pos[i * 3 + 1] = y; pts.pos[i * 3 + 2] = z;
      pts.al[i] = a * Math.min(1, tau * 6);
    }
    pts.flush();
  };
  const out = { group, fx, light: V(0, P.lift + T * 0.3, 0), focus: V(0, (P.lift + T) * 0.6, 0), span: Math.max(Rt * 1.1, r1) + 1.5 * S, clear: Math.max(Rt * 1.1, r1) + 8 * S, height: top, solid: { r: Rt, top, low: Math.max(0, P.lift - 5.5 * S) } };
  return finish(out, (t) => {
    isle.rotation.y = -w * t;
    isle.position.y = P.lift + bob(t);
    fall(GD, dk, t);
    fall(GL, lt, t);
    // the glaze lit where a stream is striking it now
    for (let v = 0; v < nvl; v++) {
      let e = 0.04;
      for (const s of streams) {
        if (!on(s, t - s.Tf)) continue;
        const da = wrap(va[v] - (s.be + w * (t - s.Tf))) * vr[v], dr = vr[v] - s.r;
        e += 0.8 * Math.exp(-(da * da) / (6 * S * S) - (dr * dr) / (4 * S * S));
      }
      le[v] = Math.min(1, e);
    }
    lg.attributes.emissive.needsUpdate = true;
  });
}

// ================================================================== the set
export const SET = {
  yardangs: {
    code: 'WYD', cls: 'Singing yardangs', nouns: ['Yardangs', 'Hulls', 'Ridges', 'Flutes', 'Herd', 'Windward'], place: 'desert', tier: 0,
    kin: ['choir', 'whale', 'storm'], voice: ['breath', 'whale'],
    params(R, size) {
      const P = {};
      P.n = R.int(3, 6);
      P.length = R.range(22, 32) * size;
      P.height = R.range(8, 12) * size;
      P.bearing = R.range(0, TAU);
      P.gust = R.range(8, 15);
      P.bodies = Array.from({ length: P.n }, (_, i) => {
        const k = i === 0 ? 1 : R.range(0.42, 0.85), holes = i === 0 ? R.int(2, 4) : k > 0.6 ? R.int(1, 3) : R.int(0, 1);
        return { k, wf: R.range(0.4, 0.52), holes, hu: Array.from({ length: holes }, (_, j) => 0.2 + ((j + 0.3 + R() * 0.4) / holes) * 0.55), hf: Array.from({ length: holes }, () => R.range(0.4, 0.6)), x: R.range(-0.2, 0.2), gap: R.range(3, 7) };
      });
      const holes = P.bodies.reduce((s, q) => s + q.holes, 0);
      P.text = `${Cap(num(P.n))} long ridges of dark stone, cut by the wind into hulls ${Math.round(P.length)} meters long and less, every blunt prow turned into it; ${num(holes)} holes are bored clean through them. When a gust comes down the line the holes light one after another, and sand smokes off the crests.`;
      return P;
    },
    build: yardangs,
  },
  fulgurite: {
    code: 'DFG', cls: 'Fulgurite', nouns: ['Fulgurite', 'Strike', 'Bolt', 'Glass', 'Roots', 'Thunderstone'], place: 'desert', tier: 0,
    kin: ['tree', 'storm', 'prism'], voice: ['glitch', 'glass'],
    params(R, size) {
      const P = {};
      P.height = R.range(16, 26) * size;
      P.roots = R.int(7, 12);
      P.twigs = R.int(6, 11);
      P.tips = R.int(2, 4);
      P.kinks = R.int(2, 3);
      P.tilt = R.range(0.18, 0.38);
      P.lean = R.range(0, TAU);
      P.spread = R.range(9, 14) * size;
      P.every = R.pick([3, 4, 6, 8]);
      P.turn = R.range(0, TAU);
      P.text = `A bolt of lightning caught in the sand and fused to glass, leaning and kinked, ${Math.round(P.height)} meters up to the ragged split where it struck; ${num(P.roots)} roots of glass run out from its foot low over the dunes, and the wind has carried off the sand that held it. Every ${num(P.every)} beats the strike runs down it again, and the glazed ground where its roots go in glows and fades.`;
      return P;
    },
    build: fulgurite,
  },
  saltchimneys: {
    code: 'WSC', cls: 'Salt chimneys', nouns: ['Chimneys', 'Salt Pan', 'Vents', 'Crust', 'Breath', 'Evaporite'], place: 'desert', tier: 0,
    kin: ['geode', 'bloom', 'pyre'], voice: ['grains', 'chirp'],
    params(R, size) {
      const P = {};
      P.radius = R.range(15, 20) * size;
      P.cell = R.range(2.2, 2.9) * size;
      P.chimneys = R.int(3, 6);
      P.tall = R.range(12, 20) * size;
      P.hs = Array.from({ length: 6 }, () => R.range(0.4, 0.85));
      P.fill = R.range(0.4, 0.55);
      P.cycle = R.pick([21, 34, 55]);
      P.rate = R.pick([0.5, 1]);
      P.wob = R.range(0, TAU);
      P.wind = R.range(0, TAU);
      P.text = `A pan of salt ${Math.round(P.radius * 2)} meters across, crazed into six-sided plates, and ${num(P.chimneys)} chimneys of crusted stone standing out of it, the tallest ${Math.round(P.tall)} meters, breathing a pale vapor. The plates light by a rule of their neighbors, ${P.rate === 1 ? 'a step to every beat' : 'a step to every second beat'}, creeping and settling; every ${P.cycle} steps the salt is scattered afresh and it begins again.`;
      return P;
    },
    build: saltchimneys,
  },
  sailingstones: {
    code: 'DSS', cls: 'Sailing stones', nouns: ['Stones', 'Tracks', 'Drifters', 'Playa', 'Grooves', 'Wanderers'], place: 'desert', tier: 1,
    kin: ['archipelago', 'turning', 'murmuration'], voice: ['grains', 'fm'],
    params(R, size) {
      const P = {};
      P.n = R.int(3, 5);
      P.length = R.range(26, 38) * size;
      P.tall = R.range(7, 10) * size;
      P.bearing = R.range(0, TAU);
      P.stones = Array.from({ length: P.n }, (_, i) => ({ slab: i === 0 ? R.chance(0.7) : R.chance(0.45), k: i === 0 ? 1 : R.range(0.42, 0.75), v: R.range(0.45, 0.8), b: R.range(1.3, 2.4), a: R.range(0.72, 1), cx: R.range(-0.12, 0.12), wig: R.range(0.15, 0.42), wp: R.range(0, TAU), dir: R.chance(0.5) ? 1 : -1, s0: R(), yaw: (R() - 0.5) * 0.4 }));
      P.snag = R.chance(0.6);
      P.snagH = R.range(6, 9) * size;
      P.text = `${Cap(num(P.n))} stones on a flat of hard grey ground, the largest ${Math.round(P.tall)} meters tall, each in the groove of a loop it has cut for itself ${Math.round(P.length)} meters long: they slide round them, slower than walking, out along the wind and back. The newest of each track glows behind its stone and fades, and when anything comes near, the stones stop.`;
      return P;
    },
    build: sailingstones,
  },
  buriedring: {
    code: 'DBR', cls: 'Buried ring', nouns: ['Ring', 'Arc', 'Wheel', 'Rim', 'Return', 'Revolution'], place: 'desert', tier: 1,
    kin: ['halo', 'armillary', 'mobius'], voice: ['whale', 'fm'],
    params(R, size) {
      const P = {};
      P.radius = R.range(17, 24) * size;
      P.show = P.radius * R.range(0.6, 0.95);
      P.thick = R.range(2.6, 3.6) * size;
      P.width = R.range(3.5, 5.5) * size;
      P.marks = R.pick([24, 30, 36, 42, 48]);
      P.breaks = R.chance(0.4) ? 1 : 0;
      P.period = R.range(240, 420);
      P.dir = R.chance(0.5) ? 1 : -1;
      P.ph0 = R.range(0, TAU);
      P.rubble = R.int(5, 9);
      P.bearing = R.range(0, TAU);
      const min = Math.round(P.period / 60);
      P.text = `The arc of a ring of dark stone ${Math.round(P.radius * 2)} meters across, standing ${Math.round(P.show)} meters out of the sand, the rest of it buried; ${P.marks} lit marks are set round its inner face${P.breaks ? ', and one block is missing' : ''}. It turns, once in about ${num(min)} minutes, lifting sand out of the ground on one side and pouring it off its faces, and each mark lights as it comes over the top.`;
      return P;
    },
    build: buriedring,
  },
  mirage: {
    code: 'WMG', cls: 'Standing mirage', nouns: ['Mirage', 'Fata Morgana', 'Image', 'Shimmer', 'Remembrance', 'Horizon'], place: 'desert', tier: 2,
    kin: ['tree', 'prism', 'temple'], voice: ['glass', 'breath'],
    params(R, size) {
      const P = {};
      P.width = R.range(36, 54) * size;
      P.horizon = R.range(15, 22) * size;
      P.trees = R.int(9, 17);
      P.treeH = R.range(8, 13) * size;
      P.pan = R.range(15, 21) * size;
      P.slabs = R.int(5, 9);
      P.inv = R.range(0.6, 0.9);
      P.period = R.range(40, 75);
      P.ph = R.range(0, TAU);
      P.text = `Over a pan of black glass ${Math.round(P.pan * 2)} meters across, a strip of forest ${Math.round(P.width)} meters long stands in the air ${Math.round(P.horizon)} meters up: ${num(P.trees)} spruces drawn in wavering light, and under them the same spruces hanging upside down. It turns to face whoever looks at it, stretches and shrinks as the heat does, and wanes and comes back about every ${Math.round(P.period)} seconds; ${num(P.slabs)} leaning stones keep the edge of the glass.`;
      return P;
    },
    build: mirage,
  },
  sandfall: {
    code: 'DSF', cls: 'Sandfall', nouns: ['Sandfall', 'Hanging Rock', 'Pour', 'Isle', 'Measure', 'Outpouring'], place: 'desert', tier: 2,
    kin: ['geode', 'vortex', 'medusa'], voice: ['grains', 'breath'],
    params(R, size) {
      const P = {};
      P.lift = R.range(17, 25) * size;
      P.radius = R.range(9, 13) * size;
      P.thick = R.range(10, 15) * size;
      P.streams = R.int(3, 6);
      P.period = R.range(150, 280);
      P.dir = R.chance(0.5) ? 1 : -1;
      P.teeth = R.int(3, 5);
      P.fallen = R.int(4, 7);
      P.snag = R.chance(0.7);
      P.snagH = R.range(5, 8) * size;
      const pool = [5, 7, 11, 13, 17, 19, 23];
      P.pers = Array.from({ length: P.streams }, () => pool.splice(Math.floor(R() * pool.length), 1)[0]).sort((a, b) => a - b);
      P.text = `A rock ${Math.round(P.radius * 2)} meters across hangs ${Math.round(P.lift)} meters over the sand with nothing under it, turning once in about ${num(Math.round(P.period / 60))} minutes${P.snag ? ', a dead tree standing on it' : ''}. Sand pours from ${num(P.streams)} cracks in its underside, each stream running and stopping in its own time (every ${list(P.pers)} seconds), onto a ring of glazed ground below.`;
      return P;
    },
    build: sandfall,
  },
};
