import * as THREE from 'three';
import { Builder, mat, mul, roughen } from '../../render/build.js';
import { glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp, smoothstep } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam, slab } from '../parts.js';

// The Grey Waste's rare tiers (place 'desert'): what lies out in the pale dunes under the
// fog, half buried, wind-scoured, glazed, salted, left running.
//   sandpile    EPIC: a tablet of glazed stone ruled in cells, a hopper over it on three
//               leaning legs letting fall grains of light; wherever four gather they topple
//               to the four sides, and the avalanches draw the sandpile's figure outward
//               until it reaches the edge; it holds in violet, the wind scours it off
//   lodestones  EPIC: two wind-cut pillars of lodestone, iron sand combed into their
//               picture on the dune between their feet, and between their heads arches of
//               light along the lines of their pull, grains running them; now and then the
//               lesser stone's hold weakens and the outer arches open into plumes
//   screw       LEGENDARY: a screw of stone and glass a hundred meters long lying slantwise,
//               its foot in a dune; it turns by itself and lifts gold sand a pocket at a
//               time, pours it into a heap, and every few pours the heap slumps and the
//               gold runs back down a channel to its foot
//   glasswave   MYTHIC: a breaking wave of glass two hundred meters long, dark at its back,
//               clear in its curl, the old sea stopped and fused; every few minutes it
//               remembers: light runs its lip from the curl to the shoulder, the barrel
//               fills with every color, spray is flung and hangs, the sea's edge washes up
//               the sand before it, and it all goes out

const VIOLET = 0xb48cff, GOLD = 0xffd27a;
const SAND = [0x6f6c76, 0x7b7882, 0x86828d], GLAZE = [0x24303a, 0x34434b, 0x4b5c5c], SALT = 0xb2b0b8, IRON = 0x161519;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Yax = V(0, 1, 0);
const frac = (x) => x - Math.floor(x);
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const num = (n) => NUM[n] ?? String(n);
const Cap = (s) => s[0].toUpperCase() + s.slice(1);
const mins = (s) => Math.max(3, Math.round(s / 60));
const _c = new THREE.Color(), _c2 = new THREE.Color();
const prism = (h, s = 0.65, l = 0.62) => _c.setHSL(frac(h), s, l);

// ------------------------------------------------------------------ shared
// light drawn after the fog; its entry's g is a gain the update may set
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
// soft points of light, placed by the caller (aSize in meters, with size 1)
function sparks(n, color, fx, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size: 1, additive: true, opacity });
  const f = { m, o: opacity, g: 1 };
  fx.push(f);
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  return { p, m, f, pos, sz, al, touch() { g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aSize.needsUpdate = true; } };
}
// a geometry of light rewritten by the update (nv vertices, optionally indexed)
function dyn(nv, index = null) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1), em = new Float32Array(nv).fill(0.004);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  if (index) g.setIndex(index);
  return {
    g, pos, col, em,
    touch(p = true, c = true) {
      if (p) g.attributes.position.needsUpdate = true;
      g.attributes.emissive.needsUpdate = true;
      if (c) g.attributes.color.needsUpdate = true;
    },
  };
}
// lines as crossed ribbons: `count` lines of `nodes` nodes, four vertices a node
function ribbonIndex(count, nodes) {
  const idx = [];
  for (let s = 0; s < count; s++) for (let j = 0; j < nodes - 1; j++) {
    const b = (s * nodes + j) * 4, c = b + 4;
    idx.push(b, b + 1, c + 1, b, c + 1, c, b + 2, b + 3, c + 3, b + 2, c + 3, c + 2);
  }
  return idx;
}
// flat quads: n of them, four vertices each
function quadIndex(n) {
  const idx = [];
  for (let q = 0; q < n; q++) { const b = q * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return idx;
}
const setCol = (col, v, c) => { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; };
// a face seen from both sides
function quad2(b, p, q, r, s, color, em = 0) {
  b.quad(p, q, r, s, color, em);
  b.quad(p, s, r, q, color, em);
}
function finish(out, update) {
  const res = {
    ...out,
    mats: [...out.fx.map((f) => f.m), ...(out.own || [])],
    update(t, beat, c) {
      c = c || {};
      update(t, beat, c);
      const k = (c.reveal ?? 1) * (0.8 + (c.pulse ?? 1) * 0.25);
      for (const f of out.fx) f.m.uniforms.uOpacity.value = f.o * f.g * k;
    },
  };
  res.update(0, 0, { pulse: 1, reveal: 0 });
  return res;
}
// built in a frame turned by psi about y
function turned(ctx, psi) {
  const c = Math.cos(psi), s = Math.sin(psi), inner = new THREE.Group();
  inner.rotation.y = psi;
  return { inner, ground: (x, z) => ctx.ground(x * c + z * s, -x * s + z * c), out: (v) => v.clone().applyAxisAngle(Yax, psi) };
}
// a heap of drifted sand against a straight face: stations along it (s, how high), the
// face at `at(s, 0)`, its toe `at(s, out)` away; it climbs to `yTop` where it is highest
function drift(b, G, at, st, yTop, reach) {
  const P = st.map(([s, f]) => {
    const [ex, ez] = at(s, 0.05), ge = G(ex, ez), ye = ge + (yTop - ge) * f;
    const L = reach * f + 1;
    const [mx, mz] = at(s, L * 0.45), [tx, tz] = at(s, L);
    const gm = G(mx, mz), gt = G(tx, tz);
    return [[ex, Math.max(ye, ge - 0.2), ez], [mx, gm + (ye - gm) * 0.62, mz], [tx, gt - 0.4, tz]];
  });
  for (let i = 0; i < P.length - 1; i++) {
    quad2(b, P[i][0], P[i][1], P[i + 1][1], P[i + 1][0], SAND[2]);
    quad2(b, P[i][1], P[i][2], P[i + 1][2], P[i + 1][1], SAND[1]);
  }
}

// ================================================================== sandpile (EPIC)
// The abelian sandpile on a grid of 2m+1 cells a side, a sink beyond its edge. Its figure
// after N grains at the middle is the same whatever the order they toppled in, so it is
// kept as snapshots every B grains (one set for each m, shared) and replayed from the
// nearest; which cells toppled lately (their heat) comes from the replay.
const PILES = new Map();
function settle(h, G, st, n, last, tag) {
  while (n > 0) {
    const c = st[--n], v = h[c];
    if (v < 4) continue;
    const q = v >> 2;
    h[c] = v & 3;
    if (last) last[c] = tag;
    const i = c % G, j = (c - i) / G;
    if (i > 0) { const o = c - 1, w = h[o]; h[o] = w + q; if (w < 4 && w + q >= 4) st[n++] = o; }
    if (i < G - 1) { const o = c + 1, w = h[o]; h[o] = w + q; if (w < 4 && w + q >= 4) st[n++] = o; }
    if (j > 0) { const o = c - G, w = h[o]; h[o] = w + q; if (w < 4 && w + q >= 4) st[n++] = o; }
    if (j < G - 1) { const o = c + G, w = h[o]; h[o] = w + q; if (w < 4 && w + q >= 4) st[n++] = o; }
  }
}
function pileOf(m) {
  if (PILES.has(m)) return PILES.get(m);
  const G = 2 * m + 1, B = 32, h = new Int32Array(G * G), st = new Int32Array(G * G), c0 = m * G + m;
  const snaps = [new Int8Array(G * G)];
  let n = 0, edge = false;
  while (!edge && n < 8000) {
    h[c0] += B; n += B;
    st[0] = c0;
    settle(h, G, st, 1, null, 0);
    for (let k = 0; k < G && !edge; k++) if (h[G + k] || h[(G - 2) * G + k] || h[k * G + 1] || h[k * G + G - 2]) edge = true;
    if (!edge) snaps.push(Int8Array.from(h));
  }
  const P = { G, B, snaps, Nmax: (snaps.length - 1) * B };
  PILES.set(m, P);
  return P;
}

function sandpile(d, A, mats, ctx) {
  const P = d.params, k = P.k, fx = [], R = rng(d.seed[5]);
  const F = turned(ctx, P.bearing), Gd = F.ground;
  const PL = pileOf(P.m), G = PL.G, m = P.m, c = P.cell, Nmax = PL.Nmax, B = PL.B;
  const half = (G * c) / 2, hw = half + 2.4 * k;
  // the ground under it, and the tablet set level on it: a skirt, the tablet, its rim
  let gmin = Infinity, gmax = -Infinity;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const g = Gd((i / 8 - 0.5) * 2 * (hw + 6 * k), (j / 8 - 0.5) * 2 * (hw + 6 * k));
    gmin = Math.min(gmin, g); gmax = Math.max(gmax, g);
  }
  const top = gmax + 1.8 * k, foot = gmin - 2.5 * k, sk = top - 1.1 * k;
  const b = new Builder(), gb = new Builder(), edge = mixHex(STONE[3], RIM, 0.3);
  b.box(2 * hw + 7 * k, sk - foot, 2 * hw + 7 * k, mat(0, (sk + foot) / 2, 0), STONE[1]);
  b.box(2 * hw + 7.3 * k, 0.4 * k, 2 * hw + 7.3 * k, mat(0, sk - 0.2 * k, 0), mixHex(STONE[2], RIM, 0.12));
  b.box(2 * hw, top - foot, 2 * hw, mat(0, (top + foot) / 2, 0), STONE[0]);
  for (const s of [-1, 1]) {
    b.box(2 * hw, 0.6 * k, 1.2 * k, mat(0, top + 0.3 * k, s * (hw - 0.6 * k)), edge);
    b.box(1.2 * k, 0.6 * k, 2 * hw - 2.4 * k, mat(s * (hw - 0.6 * k), top + 0.3 * k, 0), edge);
  }
  // the ruling: a fine grid of paler stone between the cells
  const rule = mixHex(STONE[1], RIM, 0.15);
  for (let l = 0; l <= G; l++) {
    const x = -half + l * c;
    b.box(0.1 * k, 0.08 * k, 2 * half, mat(x, top + 0.04 * k, 0), rule);
    b.box(2 * half, 0.08 * k, 0.1 * k, mat(0, top + 0.04 * k, x), rule);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.ico(0.9 * k, 0, mat(sx * (hw - 0.6 * k), top + 1.4 * k, sz * (hw - 0.6 * k)), A, PULSE);
  // sand drifted against its windward face, and a little along another
  // (from the tablet's face, over the skirt, which it buries where it is deep)
  drift(b, Gd, (s, o) => [-hw - o, s], [[-hw * 0.95, 0.1], [-hw * 0.25, 1], [hw * 0.5, 0.75], [hw * 0.98, 0]], top + 0.2 * k, 13 * k);
  drift(b, Gd, (s, o) => [s, hw + o], [[-hw * 0.1, 0], [hw * 0.45, 0.65], [hw * 0.8, 0.85], [hw * 0.99, 0.2]], top + 0.2 * k, 10 * k);
  // the hopper on three leaning legs, each foot set clear of the tablet
  const Y = top + P.tall, legs = [];
  for (let i = 0; i < 3; i++) {
    const a = P.leg0 + (i * TAU) / 3, ca = Math.cos(a), sa = Math.sin(a);
    const r = (hw + 7 * k) / Math.max(Math.abs(ca), Math.abs(sa)), fx0 = ca * r, fz0 = sa * r, g0 = Gd(fx0, fz0);
    const f0 = V(fx0, g0 - 1.5 * k, fz0), ap = V(0, Y + 0.4 * k, 0);
    beam(b, f0, ap, 2.2 * k, STONE[2]);
    for (const u of [0.32, 0.66]) beam(b, f0.clone().lerp(ap, u - 0.012), f0.clone().lerp(ap, u + 0.012), 3.1 * k, edge);
    b.box(5 * k, 2.6 * k, 5 * k, mat(fx0, g0 + 0.2 * k, fz0, 0, -a, 0), STONE[1]);
    b.cyl(1.6 * k, 5.4 * k, 2.2 * k, 8, mat(fx0, g0 + 0.3 * k, fz0), SAND[1]);
    legs.push(a);
  }
  b.box(5.2 * k, 3.4 * k, 5.2 * k, mat(0, Y + 0.6 * k, 0, 0, P.leg0, 0), STONE[3]);
  b.box(4.4 * k, 0.5 * k, 4.4 * k, mat(0, Y + 2.5 * k, 0, 0, P.leg0, 0), edge);
  b.cyl(4.4 * k, 0.9 * k, 6.5 * k, 12, mat(0, Y - 1.1 * k - 3.25 * k, 0), STONE[1]);
  b.cyl(4.7 * k, 4.7 * k, 0.6 * k, 12, mat(0, Y - 1.4 * k, 0), edge);
  const yM = Y - 7.8 * k;
  gb.torus(1.0 * k, 0.32 * k, 4, 16, mat(0, yM + 0.2 * k, 0, Math.PI / 2, 0, 0), VIOLET, PULSE);
  gb.ico(0.8 * k, 0, mat(0, Y + 3.4 * k, 0), VIOLET, PULSE);
  // broken stones lying about it, half sunk
  for (let i = 0; i < 7; i++) {
    let a = R() * TAU;
    for (const la of legs) if (Math.abs(Math.atan2(Math.sin(a - la), Math.cos(a - la))) < 0.4) a += 0.8;
    const r = (hw + 6 * k) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) + (2 + R() * 10) * k;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    slab(b, x, z, Gd(x, z) - 1.2 * k, (2.5 + R() * 3) * k, (2 + R() * 5) * k, (1.2 + R() * 1.2) * k, R() * TAU, (R() - 0.5) * 1.1, i % 3 ? STONE[1 + (i % 2)] : GLAZE[1]);
  }
  F.inner.add(new THREE.Mesh(b.build(), mats.body));
  F.inner.add(new THREE.Mesh(gb.build(), mats.glow));
  // the cells: a quad of light over each, lifted by its count
  const NC = G * G, D = dyn(NC * 4, quadIndex(NC)), hc = c * 0.41;
  F.inner.add(lightMesh(D.g, fx, 0.95));
  const cx = new Float32Array(NC), cz = new Float32Array(NC);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { cx[j * G + i] = (i - m) * c; cz[j * G + i] = (j - m) * c; }
  // the pour: a thread of violet from the hopper's mouth, grains falling down it
  const sb = new Builder(), L = yM - top;
  sb.cyl(0.3 * k, 0.3 * k, L, 8, mat(0, top + L / 2, 0), mixHex(VIOLET, 0xffffff, 0.3), 1, true);
  sb.cyl(1.3 * k, 1.3 * k, L, 10, mat(0, top + L / 2, 0), VIOLET, 0.22, true);
  const stream = lightMesh(sb.build(), fx, 0.55, { fresnel: 0.5 });
  F.inner.add(stream);
  const NF = 60, fall = sparks(NF, mixHex(VIOLET, 0xffffff, 0.35), fx, 1);
  const FJ = Array.from({ length: NF }, () => [(R() - 0.5) * 0.6 * k, (R() - 0.5) * 0.6 * k, R()]);
  for (let i = 0; i < NF; i++) fall.sz[i] = 0.9 * k;
  const NW = 160, motes = sparks(NW, mixHex(A, 0xffffff, 0.5), fx, 0.9);
  const MW = Array.from({ length: NW }, (_, i) => ({ w: (i + 0.5) / NW, z: (R() * 2 - 1) * half, s: 0.6 + R() * 0.8, ph: R() * TAU }));
  for (let i = 0; i < NW; i++) motes.sz[i] = 0.8 * k;
  const glows = sparks(2, VIOLET, fx, 0.9);
  glows.sz[0] = 7 * k; glows.sz[1] = 12 * k;
  glows.pos.set([0, top + 0.6 * k, 0, 0, yM, 0]);
  F.inner.add(fall.p, motes.p, glows.p);
  // the state, replayed from the snapshots
  const h = new Int32Array(NC), st = new Int32Array(NC), last = new Float32Array(NC).fill(-1e9), c0 = m * G + m;
  let cur = 0;
  const setN = (N) => {
    if (N < cur || N - cur > 160) {
      const s = Math.max(0, Math.min(PL.snaps.length - 1, Math.floor((N - 64) / B)));
      h.set(PL.snaps[s]); cur = s * B; last.fill(-1e9);
    }
    while (cur < N) { cur++; if (++h[c0] >= 4) { st[0] = c0; settle(h, G, st, 1, last, cur); } }
  };
  const lead = 2, Tf = P.fill, Th = P.hold, Tw = P.wind, Cy = lead + Tf + Th + Tw + 3;
  const cA1 = new THREE.Color(A), cA2 = new THREE.Color(mixHex(A, 0xffffff, 0.35)), cV = new THREE.Color(mixHex(VIOLET, 0xffffff, 0.1)), cW = new THREE.Color(0xffffff);
  const E = [0.004, 0.24, 0.55, 0.9], CC = [cA1, cA1, cA2, cV];
  const group = new THREE.Group();
  group.add(F.inner);
  const span = (hw + 7 * k) * Math.SQRT2 + 3 * k;
  const out = { group, fx, light: F.out(V(0, top + 2 * k, 0)), focus: F.out(V(0, top + P.tall * 0.4, 0)), span, clear: Math.min(95, span + 6), height: Y + 3.6 * k, solid: { r: span, top: Y + 3 * k, low: 0 } };
  return finish(out, (t) => {
    const tau = (((t + P.phase) % Cy) + Cy) % Cy;
    let N = 0, fill = 0, hold = -1, wind = -1;
    if (tau >= lead && tau < lead + Tf) { N = Math.floor((Nmax * (tau - lead)) / Tf); fill = 1; }
    else if (tau >= lead + Tf && tau < lead + Tf + Th) { N = Nmax; hold = (tau - lead - Tf) / Th; }
    else if (tau >= lead + Tf + Th && tau < lead + Tf + Th + Tw) { N = Nmax; wind = (tau - lead - Tf - Th) / Tw; }
    setN(N);
    const fi = wind >= 0 ? -3 + wind * (G + 6) : -99, glow = hold >= 0 ? Math.sin(Math.PI * hold) : 0;
    for (let q = 0; q < NC; q++) {
      let n = h[q], heat = 0;
      const lg = last[q];
      if (lg > 0) { const dt = tau - (lead + (lg * Tf) / Nmax); if (dt >= 0 && dt < 4) heat = Math.exp(-dt / 0.6); }
      if (wind >= 0) {
        const dd = (q % G) - fi;
        if (dd < 0) { n = 0; heat = 0; } else if (dd < 1.6 && n > 0) heat = Math.max(heat, 1 - dd / 1.6);
      }
      // the held figure breathes, its rings of three brightest
      let e = E[n] * (1 + glow * (n === 3 ? 0.6 : 0.3)) + heat * 1.3;
      _c2.copy(CC[n]).lerp(cW, heat * 0.6);
      if (n === 0 && heat > 0) _c2.copy(cV).lerp(cW, 0.5);
      e = Math.max(0.004, e);
      const y = top + 0.12 * k + n * 0.3 * k + heat * 0.5 * k, x = cx[q], z = cz[q], o = q * 12;
      D.pos[o] = x - hc; D.pos[o + 1] = y; D.pos[o + 2] = z - hc;
      D.pos[o + 3] = x + hc; D.pos[o + 4] = y; D.pos[o + 5] = z - hc;
      D.pos[o + 6] = x + hc; D.pos[o + 7] = y; D.pos[o + 8] = z + hc;
      D.pos[o + 9] = x - hc; D.pos[o + 10] = y; D.pos[o + 11] = z + hc;
      for (let v = q * 4; v < q * 4 + 4; v++) { D.em[v] = e; setCol(D.col, v, _c2); }
    }
    D.touch();
    // the pour, while it fills
    const on = fill ? ease((tau - lead) / 0.8) * (1 - ease((tau - lead - Tf + 0.6) / 0.6)) : 0;
    stream.userData.fx.g = on;
    for (let i = 0; i < NF; i++) {
      const u = frac(FJ[i][2] + (tau * 24 * k) / L);
      fall.pos[i * 3] = FJ[i][0]; fall.pos[i * 3 + 1] = yM - u * L; fall.pos[i * 3 + 2] = FJ[i][1];
      fall.al[i] = on * (0.5 + 0.5 * Math.sin(u * Math.PI));
    }
    fall.touch();
    glows.al[0] = on * (0.6 + 0.25 * Math.sin(t * 9) + 0.15 * Math.sin(t * 23)) + glow * 0.8;
    glows.al[1] = 0.25 + 0.5 * on;
    glows.touch();
    // the wind's grains, lifted off the front and carried away
    const ww = (tau - (lead + Tf + Th)) / Tw;
    for (let i = 0; i < NW; i++) {
      const M = MW[i], age = (ww - M.w) * Tw;
      if (ww < 0 || age < 0 || age > 5) { motes.al[i] = 0; continue; }
      const x0 = -half + (M.w * (G + 6) - 3) * c;
      motes.pos[i * 3] = x0 + age * 7 * k * M.s; motes.pos[i * 3 + 1] = top + 0.5 * k + age * age * 0.5 * k * M.s + Math.sin(age * 2 + M.ph) * 0.6 * k;
      motes.pos[i * 3 + 2] = M.z + Math.sin(age * 1.3 + M.ph) * 1.2 * k;
      motes.al[i] = Math.max(0, 1 - age / 5) * 0.9;
    }
    motes.touch();
  });
}

// ================================================================== lodestones (EPIC)
function lodestones(d, A, mats, ctx) {
  const P = d.params, k = P.k, fx = [], R = rng(d.seed[5]);
  const F = turned(ctx, P.bearing), G = F.ground, D = P.apart;
  const b = new Builder(), gb = new Builder(), band = mixHex(GLAZE[2], RIM, 0.3);
  // a pillar: wind-cut into waists, leaning out, a glazed cap; its pole in the cap
  const poles = [];
  const pillar = (x0, h, lean, side) => {
    const g0 = G(x0, 0), M = mat(x0, g0 - 3 * k, 0, 0, 0, side * lean), NS = 5, Ht = h + 3 * k, hs = Ht / NS, R0 = P.girth;
    const rb = (j) => R0 * (1 - (0.28 * j) / NS) * (j % 2 ? 0.72 : 1) * (j === 0 ? 1.15 : 1);
    for (let j = 0; j < NS; j++) {
      const g = new THREE.CylinderGeometry(rb(j + 1), rb(j), hs, 7, 2);
      roughen(g, 0.3 * k, Math.floor(x0 * 7 + j * 13 + 101));
      b.add(g, mul(M, mat(0, (j + 0.5) * hs, 0, 0, j * 0.6 + R() * 0.3, 0)), j % 2 ? STONE[0] : IRON, 0, { flat: true });
      if (j % 2) b.cyl(rb(j) * 1.06, rb(j) * 1.06, 0.4 * k, 7, mul(M, mat(0, j * hs, 0)), band);
    }
    const capR = R0 * 0.78, pc = V(0, Ht + capR * 0.55, 0).applyMatrix4(M);
    const cg = new THREE.IcosahedronGeometry(capR, 1);
    roughen(cg, 0.25 * k, Math.floor(x0 * 3 + 7));
    b.add(cg, mul(M, mat(0, Ht + capR * 0.55, 0, 0, 0, 0, 1.15, 0.8, 1.15)), GLAZE[1], 0, { flat: true });
    gb.ico(0.7 * k, 0, mul(M, mat(0, Ht + capR * 1.4, 0)), VIOLET, PULSE);
    b.cyl(R0 * 0.9, R0 * 2.3, 3 * k, 9, mat(x0, g0 + 0.6 * k, 0), SAND[1]);
    poles.push(pc);
    return g0;
  };
  pillar(-D / 2, P.tall1, P.lean1, 1);
  pillar(D / 2, P.tall2, P.lean2, -1);
  // the iron sand on the dune between their feet, combed into the lines of their pull
  const fe = [V(-D / 2, 0, 0), V(D / 2, 0, 0)];
  const f2 = (x, z) => {
    let ex = 0, ez = 0;
    for (let i = 0; i < 2; i++) { const dx = x - fe[i].x, dz = z - fe[i].z, r2 = dx * dx + dz * dz + 1e-3, q = i ? -1 : 1; ex += (q * dx) / r2; ez += (q * dz) / r2; }
    const l = Math.hypot(ex, ez) || 1;
    return [ex / l, ez / l];
  };
  const NI = P.iron, ds = 1.6 * k, wI = 0.32 * k;
  for (let l = 0; l < NI; l++) {
    const a0 = ((l + 0.5) / NI) * TAU;
    let x = fe[0].x + Math.cos(a0) * 5.5 * k, z = Math.sin(a0) * 5.5 * k;
    for (let s = 0; s < 70; s++) {
      const [ux, uz] = f2(x, z), x2 = x + ux * ds, z2 = z + uz * ds;
      if (Math.hypot(x2 - fe[1].x, z2) < 5.5 * k || Math.hypot(x2, z2) > D * 0.85) break;
      if (s % 3 !== 2) {
        const nx = -uz * wI * (1 - s / 90), nz = ux * wI * (1 - s / 90), y1 = G(x, z) + 0.08, y2 = G(x2, z2) + 0.08;
        quad2(b, [x - nx, y1, z - nz], [x + nx, y1, z + nz], [x2 + nx, y2, z2 + nz], [x2 - nx, y2, z2 - nz], IRON);
      }
      x = x2; z = z2;
    }
  }
  F.inner.add(new THREE.Mesh(b.build(), mats.body));
  F.inner.add(new THREE.Mesh(gb.build(), mats.glow));
  // the arches: lines of the field between the two poles, worked out afresh each frame
  const P1 = poles[0], P2 = poles[1], ax = P2.clone().sub(P1).normalize();
  const eu = Yax.clone().addScaledVector(ax, -Yax.dot(ax)).normalize(), es = new THREE.Vector3().crossVectors(ax, eu);
  const NPl = P.planes, NTh = P.thetas, NL = NPl * NTh, MAXS = 120, NN = 36, step = 1.5 * k, rEnd = 2.2 * k;
  const starts = [];
  for (let j = 0; j < NPl; j++) for (let i = 0; i < NTh; i++) {
    const ph = (NPl > 1 ? j / (NPl - 1) - 0.5 : 0) * 2 * 1.05, th = 0.3 + (i / Math.max(1, NTh - 1)) * 1.1;
    const dir = ax.clone().multiplyScalar(Math.cos(th)).addScaledVector(eu, Math.sin(th) * Math.cos(ph)).addScaledVector(es, Math.sin(th) * Math.sin(ph));
    starts.push(P1.clone().addScaledVector(dir, P.girth * 0.95));
  }
  const raw = new Float32Array(MAXS * 3), arc = new Float32Array(MAXS);
  const nodes = new Float32Array(NL * NN * 3), len = new Float32Array(NL), shut = new Uint8Array(NL);
  let q2 = -1;
  const E = (x, y, z, o) => {
    let dx = x - P1.x, dy = y - P1.y, dz = z - P1.z, r = Math.hypot(dx, dy, dz), r3 = r * r * r + 1e-6;
    let ex = dx / r3, ey = dy / r3, ez = dz / r3;
    dx = x - P2.x; dy = y - P2.y; dz = z - P2.z; r = Math.hypot(dx, dy, dz); r3 = r * r * r + 1e-6;
    ex += (q2 * dx) / r3; ey += (q2 * dy) / r3; ez += (q2 * dz) / r3;
    const l = Math.hypot(ex, ey, ez) || 1;
    o[0] = ex / l; o[1] = ey / l; o[2] = ez / l;
  };
  // (open lines are let go a little way out: plumes, not the whole sky)
  const yTopP = Math.max(P1.y, P2.y), k1 = [0, 0, 0], k2 = [0, 0, 0], yCap = yTopP + 30 * k, rCap = D / 2 + 24 * k;
  // the ground under the arches, sampled once (the field is traced afresh every frame)
  const GN = 16, gE = rCap + 4 * k, gGrid = new Float32Array((GN + 1) * (GN + 1));
  for (let i = 0; i <= GN; i++) for (let j = 0; j <= GN; j++) gGrid[i * (GN + 1) + j] = G(-gE + (2 * gE * i) / GN, -gE + (2 * gE * j) / GN);
  const gAt = (x, z) => {
    const fi = clamp(((x + gE) / (2 * gE)) * GN, 0, GN - 1e-3), fj = clamp(((z + gE) / (2 * gE)) * GN, 0, GN - 1e-3), i = Math.floor(fi), j = Math.floor(fj), a = fi - i, c = fj - j, o = i * (GN + 1) + j;
    return (gGrid[o] * (1 - c) + gGrid[o + 1] * c) * (1 - a) + (gGrid[o + GN + 1] * (1 - c) + gGrid[o + GN + 2] * c) * a;
  };
  const trace = (li) => {
    const s0 = starts[li];
    let x = s0.x, y = s0.y, z = s0.z, n = 0, closed = 0;
    raw[0] = P1.x; raw[1] = P1.y; raw[2] = P1.z; arc[0] = 0; n = 1;
    for (let s = 0; s < MAXS - 2; s++) {
      raw[n * 3] = x; raw[n * 3 + 1] = y; raw[n * 3 + 2] = z;
      arc[n] = arc[n - 1] + Math.hypot(x - raw[n * 3 - 3], y - raw[n * 3 - 2], z - raw[n * 3 - 1]); n++;
      if (Math.hypot(x - P2.x, y - P2.y, z - P2.z) < rEnd) { closed = 1; break; }
      if (y < gAt(x, z) + 0.3 || y > yCap || Math.hypot(x, z) > rCap) break;
      E(x, y, z, k1);
      E(x + k1[0] * step * 0.5, y + k1[1] * step * 0.5, z + k1[2] * step * 0.5, k2);
      x += k2[0] * step; y += k2[1] * step; z += k2[2] * step;
    }
    if (closed) { raw[n * 3] = P2.x; raw[n * 3 + 1] = P2.y; raw[n * 3 + 2] = P2.z; arc[n] = arc[n - 1] + Math.hypot(P2.x - x, P2.y - y, P2.z - z); n++; }
    // even nodes along it
    const Lt = arc[n - 1], o = li * NN * 3;
    let seg = 0;
    for (let j = 0; j < NN; j++) {
      const sx = (j / (NN - 1)) * Lt;
      while (seg < n - 2 && arc[seg + 1] < sx) seg++;
      const f = clamp((sx - arc[seg]) / Math.max(1e-5, arc[seg + 1] - arc[seg]), 0, 1);
      for (let a = 0; a < 3; a++) nodes[o + j * 3 + a] = raw[seg * 3 + a] + (raw[seg * 3 + 3 + a] - raw[seg * 3 + a]) * f;
    }
    len[li] = Lt; shut[li] = closed;
  };
  const RB = dyn(NL * NN * 4, ribbonIndex(NL, NN));
  F.inner.add(lightMesh(RB.g, fx, 0.7));
  const NG = 10, grains = sparks(NL * NG, mixHex(A, 0xffffff, 0.45), fx, 1);
  for (let i = 0; i < NL * NG; i++) grains.sz[i] = (1.0 + (i % 3) * 0.3) * k;
  const halos = sparks(2, VIOLET, fx, 0.85);
  halos.sz[0] = halos.sz[1] = 11 * k;
  halos.pos.set([P1.x, P1.y, P1.z, P2.x, P2.y, P2.z]);
  F.inner.add(grains.p, halos.p);
  const cA = new THREE.Color(mixHex(A, 0xffffff, 0.15)), cV = new THREE.Color(VIOLET);
  const w = 0.24 * k, t1 = V(), s1 = V(), s2 = V();
  const group = new THREE.Group();
  group.add(F.inner);
  const span = Math.max(D / 2 + P.girth * 2.4, 40 * k), height = yTopP + 32 * k;
  const out = { group, fx, light: F.out(P1.clone().lerp(P2, 0.5).add(V(0, 8 * k, 0))), focus: F.out(V(0, Math.max(P1.y, P2.y) * 0.8, 0)), span, clear: Math.min(95, span + 6), height, solid: { r: D / 2 + P.girth * 2, top: Math.max(P1.y, P2.y) + 3 * k, low: 0 } };
  return finish(out, (t) => {
    const u = frac(t / P.cycle + P.phase);
    const str = u < 0.3 ? 1 : u < 0.5 ? 1 - ease((u - 0.3) / 0.2) : u < 0.66 ? 0 : u < 0.88 ? ease((u - 0.66) / 0.22) : 1;
    q2 = -(P.weak + (1 - P.weak) * str);
    for (let li = 0; li < NL; li++) trace(li);
    for (let li = 0; li < NL; li++) {
      const o = li * NN, cl = shut[li], run = frac(t * 0.11 + li * 0.137);
      for (let j = 0; j < NN; j++) {
        const pj = (o + j) * 3, pa = (o + Math.max(0, j - 1)) * 3, pb = (o + Math.min(NN - 1, j + 1)) * 3;
        t1.set(nodes[pb] - nodes[pa], nodes[pb + 1] - nodes[pa + 1], nodes[pb + 2] - nodes[pa + 2]).normalize();
        s1.set(-t1.z, 0, t1.x);
        if (s1.lengthSq() < 1e-6) s1.set(1, 0, 0);
        s1.normalize();
        s2.crossVectors(t1, s1);
        const v = (o + j) * 4, px = nodes[pj], py = nodes[pj + 1], pz = nodes[pj + 2];
        RB.pos[v * 3] = px + s1.x * w; RB.pos[v * 3 + 1] = py; RB.pos[v * 3 + 2] = pz + s1.z * w;
        RB.pos[v * 3 + 3] = px - s1.x * w; RB.pos[v * 3 + 4] = py; RB.pos[v * 3 + 5] = pz - s1.z * w;
        RB.pos[v * 3 + 6] = px + s2.x * w; RB.pos[v * 3 + 7] = py + s2.y * w; RB.pos[v * 3 + 8] = pz + s2.z * w;
        RB.pos[v * 3 + 9] = px - s2.x * w; RB.pos[v * 3 + 10] = py - s2.y * w; RB.pos[v * 3 + 11] = pz - s2.z * w;
        const f = j / (NN - 1), vio = Math.pow(Math.max(0, 1 - 4 * f), 1.5) + (cl ? Math.pow(Math.max(0, 4 * f - 3), 1.5) : 0);
        const pulse = 0.55 * Math.exp(-(((f - run) / 0.05) ** 2));
        const e = cl ? 0.3 + pulse : (0.32 + pulse) * Math.pow(1 - f, 1.4);
        _c2.copy(cA).lerp(cV, clamp(vio, 0, 1));
        for (let q = v; q < v + 4; q++) { RB.em[q] = Math.max(0.004, e); setCol(RB.col, q, _c2); }
      }
      // the grains running it: up and out on an open line, fading as they go
      for (let gi = 0; gi < NG; gi++) {
        const f = frac(gi / NG + (t * 5.5 * k) / Math.max(10, len[li]) + li * 0.31), x = f * (NN - 1), j = Math.min(NN - 2, Math.floor(x)), fr = x - j;
        const pa = (o + j) * 3, pb = pa + 3, gidx = li * NG + gi;
        for (let a = 0; a < 3; a++) grains.pos[gidx * 3 + a] = nodes[pa + a] + (nodes[pb + a] - nodes[pa + a]) * fr;
        grains.al[gidx] = cl ? 0.75 * Math.sin(Math.PI * f) + 0.15 : 0.9 * Math.pow(1 - f, 1.5);
      }
    }
    RB.touch();
    grains.touch();
    halos.al[0] = 0.7 + 0.15 * Math.sin(t * 1.3);
    halos.al[1] = 0.2 + 0.6 * str;
    halos.touch();
  });
}

// ================================================================== screw (LEGENDARY)
function screw(d, A, mats, ctx) {
  const P = d.params, k = P.k, fx = [], R = rng(d.seed[5]);
  const F = turned(ctx, P.bearing), G = F.ground;
  const Ls = P.length, al = P.slope, Rt = P.radius, p = P.pitch, Tr = P.turn, hand = P.hand, nP = P.pours;
  const ca = Math.cos(al), sa = Math.sin(al), edge = mixHex(STONE[3], RIM, 0.25);
  const dir = V(ca, sa, 0), nrm = V(-sa, ca, 0);
  // where things fall along x, with the foot at x 0, to set the whole of it about the origin
  const Lc = 10 * k, dc = V(1, -0.3, 0).normalize();
  const lipX0 = (Ls / 2 + Ls / 2 + 0.6 * k) * ca + (Rt - 0.6 * k) * sa + dc.x * Lc;
  const Rb = 14 * k, Hx0 = lipX0 + P.throw, xa = -((-14 * k) + (Hx0 + Rb + 0.8 * k)) / 2;
  const Pa = V(xa, G(xa, 0) + 0.5 * k, 0), C = Pa.clone().addScaledVector(dir, Ls / 2);
  const at = (s, y = 0, z = 0) => C.clone().addScaledVector(dir, s).addScaledVector(nrm, y).add(V(0, 0, z));
  // the rotor's frame: x along the axis
  const rotor = new THREE.Group();
  rotor.position.copy(C);
  rotor.rotation.z = al;
  const spin = new THREE.Group();
  rotor.add(spin);
  const sb = new Builder();
  sb.cyl(1.1 * k, 1.1 * k, Ls + 5 * k, 10, mat(0.5 * k, 0, 0, 0, 0, Math.PI / 2), STONE[3]);
  const nh = Math.round(Ls / (8.5 * k)) + 1, hsp = (Ls - 1.2 * k) / (nh - 1);
  for (let j = 0; j < nh; j++) {
    const s = -Ls / 2 + 0.6 * k + j * hsp, end = j === 0 || j === nh - 1;
    sb.torus(Rt + 0.35 * k, (end ? 0.9 : 0.6) * k, 4, 30, mat(s, 0, 0, 0, Math.PI / 2, 0), j % 2 ? STONE[2] : edge);
  }
  for (let i = 0; i < 8; i++) { const b2 = (i / 8) * TAU; sb.box(Ls, 0.75 * k, 0.75 * k, mat(0, Math.cos(b2) * (Rt + 0.15 * k), Math.sin(b2) * (Rt + 0.15 * k), b2, 0, 0), STONE[1]); }
  // the flight: a helicoid from the axle to the wall, its outer band paler, lamps on its edge
  const nsg = Math.ceil((Ls / p) * 30), ri = 1.1 * k, rm = Rt * 0.84, ro = Rt - 0.12 * k, band = mixHex(STONE[3], RIM, 0.3);
  const hp = (s, r) => { const th = (hand * TAU * s) / p; return [s, r * Math.cos(th), r * Math.sin(th)]; };
  for (let q = 0; q < nsg; q++) {
    const s0 = -Ls / 2 + 0.4 * k + (q * (Ls - 0.8 * k)) / nsg, s1 = -Ls / 2 + 0.4 * k + ((q + 1) * (Ls - 0.8 * k)) / nsg;
    quad2(sb, hp(s0, ri), hp(s0, rm), hp(s1, rm), hp(s1, ri), STONE[2]);
    quad2(sb, hp(s0, rm), hp(s0, ro), hp(s1, ro), hp(s1, rm), band);
  }
  const NLm = Math.floor((Ls / p) * 6);
  for (let l = 0; l < NLm; l++) { const [x, y, z] = hp(-Ls / 2 + ((l + 0.5) * p) / 6, ro - 0.5 * k); sb.box(0.9 * k, 0.9 * k, 0.9 * k, mat(x, y, z), A, PULSE); }
  for (const s of [-1, 1]) sb.cyl(2.2 * k, 2.2 * k, 1.2 * k, 10, mat(s * (Ls / 2 + 2.4 * k), 0, 0, 0, 0, Math.PI / 2), GOLD, PULSE);
  spin.add(new THREE.Mesh(sb.build(), mats.glow));
  // the glass between the hoops (it turns, but a round glass shows nothing of it)
  const gl = new Builder();
  gl.add(new THREE.CylinderGeometry(Rt, Rt, Ls, 36, 1, true), mat(0, 0, 0, 0, 0, Math.PI / 2), 0xffffff, 1);
  const glass = lightMesh(gl.build(), fx, 0.14, { fresnel: 0.85 });
  glass.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.6));
  rotor.add(glass);
  // the cradles it turns in: an arc of stone under it on a pier, buttressed
  const cb = new Builder(), b = new Builder(), gb = new Builder();
  // (each set midway between two hoops, so no hoop passes through it as it turns)
  for (const f of [-0.18, 0.32]) {
    const sc = -Ls / 2 + 0.6 * k + (Math.round((f * Ls + Ls / 2 - 0.6 * k) / hsp - 0.5) + 0.5) * hsp, Rc = Rt + 1.8 * k;
    const M = new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, -1, 0), V(1, 0, 0)).setPosition(sc, 0, 0);
    cb.add(new THREE.TorusGeometry(Rc, 1.0 * k, 5, 20, Math.PI), M, STONE[3]);
    cb.box(3.2 * k, 2.2 * k, 2 * Rc * 0.7, mat(sc, -(Rc + 0.9 * k), 0), STONE[2]);
    const Bt = at(sc, -(Rc + 1.8 * k), 0), gB = G(Bt.x, 0), hP = Bt.y + 0.6 * k - (gB - 2 * k);
    b.box(4.4 * k, hP, 2 * Rt * 0.8, mat(Bt.x, gB - 2 * k + hP / 2, 0), STONE[1]);
    b.box(5 * k, 0.6 * k, 2 * Rt * 0.8 + 0.6 * k, mat(Bt.x, Bt.y - 0.6 * k, 0), edge);
    for (const z of [-1, 1]) {
      const top = at(sc, 0, z * Rc), fx0 = top.x - 2 * k, fz0 = z * (Rt + 7 * k);
      beam(b, V(fx0, G(fx0, fz0) - 1.5 * k, fz0), top, 2.0 * k, STONE[2]);
      b.box(4 * k, 2 * k, 4 * k, mat(fx0, G(fx0, fz0) + 0.2 * k, fz0), STONE[1]);
    }
  }
  rotor.add(new THREE.Mesh(cb.build(), mats.body));
  // its foot sunk in a dune
  const mx = Pa.x + 3 * k, mg = new THREE.SphereGeometry(1, 18, 7, 0, TAU, 0, Math.PI / 2);
  roughen(mg, 0.06, 17);
  b.add(mg, mat(mx, G(mx, 0) - 0.8 * k, 0, 0, R() * TAU, 0, 17 * k, 9.5 * k, 14 * k), (x, y) => (y > 0.7 ? SAND[2] : SAND[1]), 0, { flat: true });
  // the chute from its mouth, on a post, and the basin the heap stands in
  const M0 = at(Ls / 2 + 0.6 * k, -(Rt - 0.6 * k), 0), ang = Math.atan2(dc.y, dc.x), cm = M0.clone().addScaledVector(dc, Lc / 2);
  const up = V(-Math.sin(ang), Math.cos(ang), 0);
  b.box(Lc, 0.7 * k, 3.6 * k, mat(cm.x, cm.y, 0, 0, 0, ang), STONE[2]);
  for (const z of [-1, 1]) b.box(Lc, 1.6 * k, 0.5 * k, mat(cm.x + up.x * 0.8 * k, cm.y + up.y * 0.8 * k, z * 1.8 * k, 0, 0, ang), edge);
  const Lip = M0.clone().addScaledVector(dc, Lc);
  beam(b, V(Lip.x - 2 * k, G(Lip.x - 2 * k, 0) - 1, 0), V(Lip.x - 2 * k, Lip.y - 0.7 * k, 0), 1.5 * k, STONE[2]);
  const Hx = Lip.x + P.throw, Gh = G(Hx, 0);
  b.cyl(Rb, Rb + 0.8 * k, 1.8 * k, 30, mat(Hx, Gh - 0.4 * k, 0), STONE[1]);
  b.torus(Rb, 0.45 * k, 4, 40, mat(Hx, Gh + 0.5 * k, 0, Math.PI / 2, 0, 0), edge);
  for (let i = 0; i < 14; i++) { const a = ((i + 0.5) / 14) * TAU; gb.box(0.8 * k, 0.6 * k, 0.8 * k, mat(Hx + Math.cos(a) * (Rb - 1.2 * k), Gh + 0.8 * k, Math.sin(a) * (Rb - 1.2 * k)), A, PULSE); }
  gb.torus(Rb * 0.25, 0.3 * k, 3, 24, mat(Hx, Gh + 0.6 * k, 0, Math.PI / 2, 0, 0), GOLD, 1);
  // the channel back to the foot: a groove of glazed stone between curbs
  const zc = -(Rt + 12.5 * k), chan = [V(Hx - Rb * 0.75, 0, -Rb * 0.6), V(Hx - Rb - 6 * k, 0, zc), V(Pa.x + 16 * k, 0, zc), V(Pa.x + 7 * k, 0, -7 * k)];
  const cpts = [];
  for (let i = 0; i < chan.length - 1; i++) {
    const a = chan[i], c2 = chan[i + 1], n = Math.max(1, Math.round(a.distanceTo(c2) / (5 * k)));
    for (let j = 0; j < n; j++) cpts.push(a.clone().lerp(c2, j / n));
  }
  cpts.push(chan[chan.length - 1].clone());
  const NCh = cpts.length - 1, cu = [0];
  for (let i = 0; i < NCh; i++) cu.push(cu[i] + cpts[i].distanceTo(cpts[i + 1]));
  const CL = cu[NCh];
  for (let i = 0; i < NCh; i++) {
    const a = cpts[i], c2 = cpts[i + 1], xm = (a.x + c2.x) / 2, zm = (a.z + c2.z) / 2, yaw = Math.atan2(c2.x - a.x, c2.z - a.z), l = a.distanceTo(c2) + 0.3 * k;
    const gy = G(xm, zm);
    b.box(2.8 * k, 0.5 * k, l, mat(xm, gy - 0.05 * k, zm, 0, yaw, 0), GLAZE[0]);
    for (const s of [-1, 1]) b.box(0.6 * k, 0.9 * k, l, mat(xm + Math.cos(yaw) * s * 1.7 * k, gy + 0.1 * k, zm - Math.sin(yaw) * s * 1.7 * k, 0, yaw, 0), edge);
  }
  // staves of an older one, broken, standing out of the sand
  for (let i = 0; i < 5; i++) {
    const x = Pa.x - 4 * k + R() * 20 * k, z = (15 + R() * 10) * k, h = (4 + R() * 7) * k;
    beam(b, V(x, G(x, z) - 1.5 * k, z), V(x + (R() - 0.5) * 4 * k, G(x, z) + h, z + (R() - 0.5) * 4 * k), 0.8 * k, i % 2 ? STONE[1] : GLAZE[1]);
  }
  F.inner.add(new THREE.Mesh(b.build(), mats.body));
  F.inner.add(new THREE.Mesh(gb.build(), mats.glow));
  F.inner.add(rotor);
  // the gold: in its pockets (in the rotor's frame, not turning), the pour, the heap, the run back
  const NPk = Math.ceil(Ls / p) + 3, GPk = 26, pk = sparks(NPk * GPk, mixHex(GOLD, 0xffffff, 0.15), fx, 1);
  const PG = Array.from({ length: GPk }, () => [(R() - 0.5) * 0.6 * p, (R() - 0.5) * 1.1, Rt * (0.5 + R() * 0.44)]);
  for (let i = 0; i < NPk * GPk; i++) pk.sz[i] = (0.9 + (i % 4) * 0.15) * k;
  rotor.add(pk.p);
  const NS = 110, pour = sparks(NS, mixHex(GOLD, 0xffffff, 0.25), fx, 1);
  const SJ = Array.from({ length: NS }, () => [R(), (R() - 0.5) * 1.4 * k, (R() - 0.5) * 1.0 * k]);
  for (let i = 0; i < NS; i++) pour.sz[i] = (1.0 + R() * 0.5) * k;
  const hg = new THREE.ConeGeometry(1, 1, 24, 4, true);
  hg.translate(0, 0.5, 0);
  const hb = new Builder();
  hb.add(hg, null, GOLD, (x, y) => 0.2 + 0.8 * y);
  const heap = lightMesh(hb.build(), fx, 0.5, { fresnel: 0.4 });
  heap.position.set(Hx, Gh + 0.5 * k, 0);
  const CH = dyn(NCh * 4, quadIndex(NCh));
  for (let i = 0; i < NCh; i++) {
    const a = cpts[i], c2 = cpts[i + 1], yaw = Math.atan2(c2.x - a.x, c2.z - a.z), wx = Math.cos(yaw) * 1.1 * k, wz = -Math.sin(yaw) * 1.1 * k;
    const ya = G(a.x, a.z) + 0.35 * k, yb = G(c2.x, c2.z) + 0.35 * k, o = i * 12;
    CH.pos.set([a.x - wx, ya, a.z - wz, a.x + wx, ya, a.z + wz, c2.x + wx, yb, c2.z + wz, c2.x - wx, yb, c2.z - wz], o);
  }
  _c2.setHex(mixHex(GOLD, 0xffffff, 0.1));
  for (let v = 0; v < NCh * 4; v++) setCol(CH.col, v, _c2);
  CH.touch();
  const halos = sparks(3, GOLD, fx, 0.9);
  halos.sz[0] = 8 * k; halos.sz[1] = 18 * k; halos.sz[2] = 22 * k;
  halos.pos.set([Lip.x, Lip.y, 0, Hx, Gh + 4 * k, 0, Pa.x + 3 * k, G(Pa.x + 3 * k, 0) + 6 * k, 0]);
  F.inner.add(pour.p, heap, lightMesh(CH.g, fx, 0.9), halos.p);
  // when a pour begins: a pocket's middle is 0.32 of a pitch below the mouth
  const kap = -(Ls / (2 * p) - 0.82 - hand / 2), tauC = 0.9, h0 = 2.5 * k, hmax = 9.5 * k;
  const pourAt = (tt) => { const f = frac(tt / Tr + kap); return f < 0.64 ? Math.sin((Math.PI * f) / 0.64) : 0; };
  const topY = Gh + 0.5 * k, Tflow = P.flow;
  const group = new THREE.Group();
  group.add(F.inner);
  const xmin = Pa.x - 14 * k, xmax = Hx + Rb + 0.8 * k, span = Math.max(xmax, -xmin);
  const height = at(Ls / 2, Rt + 1, 0).y + 2 * k;
  const out = { group, fx, light: F.out(C.clone()), focus: F.out(V(C.x, C.y * 0.8, 0)), span, clear: Math.min(100, span + 6), height, solid: { r: span, top: height, low: 0 } };
  return finish(out, (t) => {
    const tt = t + P.phase, rho = -hand * (TAU / Tr) * tt;
    spin.rotation.x = rho;
    // the pockets: between the flights where they cross the bottom of the tube
    const base = frac(hand / 2 + tt / Tr), n0 = Math.floor(-Ls / (2 * p)) - 2, dl = -hand * 0.38;
    for (let q = 0; q < NPk; q++) {
      const s = (base + 0.5 + n0 + q) * p;
      for (let i = 0; i < GPk; i++) {
        const g = PG[i], S = s + g[0], idx = q * GPk + i, an = Math.PI + dl + g[1] * (1 - Math.abs(g[0]) / (0.4 * p));
        pk.pos[idx * 3] = S; pk.pos[idx * 3 + 1] = Math.cos(an) * g[2]; pk.pos[idx * 3 + 2] = Math.sin(an) * g[2];
        pk.al[idx] = S > Ls / 2 - 0.3 * k || S < -Ls / 2 ? 0 : 0.75 * smoothstep(-Ls / 2, -Ls / 2 + 1.2 * p, S);
      }
    }
    pk.touch();
    // the pour: down the chute and falling to the heap
    const c = tt / Tr + kap, mm = c - nP * Math.floor(c / nP), full = Math.floor(mm), fr = mm - full;
    let amt = full + ease(fr / 0.64);
    let slump = 0;
    if (full === nP - 1 && fr > 0.7) { slump = ease((fr - 0.7) / 0.26); amt = nP * (1 - slump); }
    const hH = h0 + ((hmax - h0) * amt) / nP, yTop = topY + hH;
    heap.scale.set(hH * 1.35, hH, hH * 1.35);
    const drop = Math.max(2, Lip.y - yTop), tf = Math.sqrt((2 * drop) / 9.8), Tp = tauC + tf, vx = (Hx - Lip.x) / tf;
    for (let i = 0; i < NS; i++) {
      const v = frac(SJ[i][0] + tt / Tp), age = v * Tp;
      let x, y, z = SJ[i][2];
      if (age < tauC) { const f = age / tauC; x = M0.x + (Lip.x - M0.x) * f; y = M0.y + (Lip.y - M0.y) * f + 0.5 * k; z *= 0.6; }
      else { const a = age - tauC; x = Lip.x + vx * a + SJ[i][1] * (a / tf); y = Lip.y - 4.9 * a * a; }
      pour.pos[i * 3] = x; pour.pos[i * 3 + 1] = Math.max(y, yTop - 0.5 * k); pour.pos[i * 3 + 2] = z;
      pour.al[i] = pourAt(tt - age) * 0.9;
    }
    pour.touch();
    heap.userData.fx.g = 0.6 + 0.6 * pourAt(tt - Tp) + 0.4 * slump;
    // the run back along the channel, once the heap has slumped
    const fa = (((mm - (nP - 1 + 0.7)) % nP) + nP) % nP * Tr, uf = (fa / Tflow) * CL, fade = 1 - smoothstep(Tflow, Tflow + 5, fa);
    for (let i = 0; i < NCh; i++) {
      for (let j = 0; j < 4; j++) {
        const s = j === 0 || j === 1 ? cu[i] : cu[i + 1], dd = uf - s;
        const e = dd >= 0 ? (0.15 + 0.85 * Math.exp(-dd / (10 * k)) + (dd < 3 * k ? 0.8 : 0)) * fade : 0.004;
        CH.em[i * 4 + j] = Math.max(0.004, e);
      }
    }
    CH.touch(false, false);
    halos.al[0] = pourAt(tt) * 0.9;
    halos.al[1] = 0.25 + 0.35 * pourAt(tt - Tp) + 0.4 * slump;
    halos.al[2] = fa > Tflow ? Math.exp(-(fa - Tflow) / 3) * 0.9 : 0;
    halos.touch();
  });
}

// ================================================================== glass wave (MYTHIC)
// its profile across, as fractions of its height (x forward, the way it breaks; y up): from
// the back foot over the crest, out along the lip, in under it round the barrel, down the
// face to the front foot; curled where it is pitching, a plain swell where it is not
const CURL = [[-0.95, 0], [-0.62, 0.22], [-0.32, 0.56], [-0.08, 0.86], [0.14, 0.99], [0.38, 0.95], [0.55, 0.76], [0.58, 0.52], [0.47, 0.62], [0.27, 0.7], [0.1, 0.52], [0.12, 0.26], [0.34, 0.06], [0.56, 0]];
const SWELL = [[-0.95, 0], [-0.62, 0.17], [-0.32, 0.42], [-0.08, 0.62], [0.12, 0.7], [0.26, 0.66], [0.34, 0.58], [0.4, 0.48], [0.44, 0.4], [0.48, 0.32], [0.52, 0.24], [0.57, 0.15], [0.63, 0.06], [0.7, 0]];
const invEase = (y) => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (ease(m) < y) lo = m; else hi = m; } return (lo + hi) / 2; };

function glasswave(d, A, mats, ctx) {
  const P = d.params, K = P.k, fx = [], R = rng(d.seed[5]);
  const F = turned(ctx, P.bearing), G = F.ground;
  const H = P.height, Lz = P.length, u0 = P.peak, NZ = 96, NPr = 53, CI = 13;
  const hf = (u) => (u < u0 ? 0.55 + 0.45 * ease(u / u0) : 1 - 0.7 * ease((u - u0) / (1 - u0)));
  const cf = (u) => (u < u0 ? 1 : 1 - ease((u - u0) / (0.6 * (1 - u0))));
  const endT = (u) => 0.03 + 0.97 * ease(u / 0.12) * ease((1 - u) / 0.1);
  // (set back so that it and the sand it washes stand about the origin)
  const xoff = (u) => P.bend * H * (4 * (u - 0.5) ** 2 - 0.33) - 0.14 * H;
  const zOf = (u) => (u - 0.5) * Lz;
  // the profile at a place along it, set on the ground (a little sunk)
  const profile = (u) => {
    const c = cf(u), s = hf(u) * endT(u), sx = 0.55 + 0.45 * hf(u), pts = [];
    for (let i = 0; i <= CI; i++) pts.push(V((SWELL[i][0] + (CURL[i][0] - SWELL[i][0]) * c) * H * sx + xoff(u), (SWELL[i][1] + (CURL[i][1] - SWELL[i][1]) * c) * H * s, 0));
    const z = zOf(u);
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints(NPr - 1).map((q) => V(q.x, q.y + G(q.x, z) - 1.2 * K, z));
  };
  // outward (out of the water) in the profile's plane: to the left of its way
  const outward = (row, j) => {
    const a = row[Math.max(0, j - 1)], c = row[Math.min(NPr - 1, j + 1)], tx = c.x - a.x, ty = c.y - a.y, l = Math.hypot(tx, ty) || 1;
    return [-ty / l, tx / l, tx / l, ty / l];
  };
  const rows = Array.from({ length: NZ }, (_, i) => profile(i / (NZ - 1)));
  const jOf = (ci) => Math.round((ci / CI) * (NPr - 1));
  const jS = jOf(4.6), jG = jOf(3.8);
  // its back: dark glass, salt in bands where the sea stood, sand drifted on its foot
  const b = new Builder();
  for (let i = 0; i < NZ - 1; i++) for (let j = 0; j < jS; j++) {
    const a = rows[i][j], c = rows[i][j + 1], e = rows[i + 1][j + 1], f = rows[i + 1][j];
    const y = (a.y + c.y + e.y + f.y) / 4 - G(a.x, a.z), hy = y / H;
    let col = hy < 0.05 ? SAND[1] : hy < 0.1 ? mixHex(SAND[0], GLAZE[0], 0.5) : mixHex(GLAZE[0], GLAZE[2], clamp(hy, 0, 1) * 0.8);
    if (hy > 0.1 && frac(y / (7.5 * K)) < 0.07) col = mixHex(col, SALT, 0.55);
    quad2(b, [a.x, a.y, a.z], [c.x, c.y, c.z], [e.x, e.y, e.z], [f.x, f.y, f.z], col);
  }
  // shards flung in front of it, half sunk; the old sea's lines of salt on the sand
  const front = rows.map((r) => r[NPr - 1].x);
  for (let i = 0; i < P.shards; i++) {
    const u = 0.03 + R() * 0.94, iz = Math.round(u * (NZ - 1)), x = front[iz] + (0.06 + R() * 0.5) * H, z = zOf(u), hs = (2 + R() * 7) * K;
    b.cone(hs * 0.18, hs, 4, mat(x, G(x, z) + hs * 0.15, z, (R() - 0.5) * 0.8, R() * TAU, -(0.3 + R() * 0.7)), GLAZE[R() < 0.5 ? 0 : 1]);
  }
  for (let l = 0; l < 3; l++) {
    const dd = (0.22 + l * 0.15) * H;
    for (let i = 2; i < NZ - 3; i += 2) {
      const za = zOf(i / (NZ - 1)), zb = zOf((i + 2) / (NZ - 1));
      const xa = front[i] + dd + Math.sin(i * 0.37 + l * 2) * 2 * K, xb = front[i + 2] + dd + Math.sin((i + 2) * 0.37 + l * 2) * 2 * K, w = 0.5 * K;
      quad2(b, [xa - w, G(xa, za) + 0.12, za], [xa + w, G(xa, za) + 0.12, za], [xb + w, G(xb, zb) + 0.12, zb], [xb - w, G(xb, zb) + 0.12, zb], SALT);
    }
  }
  F.inner.add(new THREE.Mesh(b.build(), mats.body));
  // the clear glass: crest, lip, barrel and face; brighter about the lip
  const gb = new Builder();
  const lipE = (j) => { const ci = (j / (NPr - 1)) * CI; return 0.16 + 0.5 * Math.exp(-(((ci - 6.3) / 1.4) ** 2)) + 0.12 * smoothstep(8, 10, ci); };
  for (let i = 0; i < NZ - 1; i++) for (let j = jG; j < NPr - 1; j++) {
    const a = rows[i][j], c = rows[i][j + 1], e = rows[i + 1][j + 1], f = rows[i + 1][j];
    const ea = lipE(j), ec = lipE(j + 1);
    gb.tri([a.x, a.y, a.z], [c.x, c.y, c.z], [e.x, e.y, e.z], 0xffffff, (ea + ec) / 2);
    gb.tri([a.x, a.y, a.z], [e.x, e.y, e.z], [f.x, f.y, f.z], 0xffffff, (ea + ec) / 2);
  }
  const glass = lightMesh(gb.build(), fx, 0.34, { fresnel: 0.75, fog: 0.35 });
  const tintA = mixHex(A, 0xffffff, 0.55);
  glass.material.uniforms.uTint.value.setHex(tintA);
  F.inner.add(glass);
  // lines of light in it: across it (its grain) and along it (crest, lip, barrel, foot)
  const NL = P.lines, j2 = jOf(2), nn = NPr - j2, ALONG = [[4, 0.5], [7, 0.85], [10, 0.5], [12.4, 0.45]];
  const NQ = NL * (nn - 1) + ALONG.length * (NZ - 1), LN = dyn(NQ * 4, quadIndex(NQ));
  const vu = new Float32Array(NQ * 4), vc = new Float32Array(NQ * 4), vk = new Uint8Array(NQ * 4);
  let qn = 0;
  const putQ = (pa, pb, wa, wb, ua, ub, ca, cb, kind) => {
    const o = qn * 12, v = qn * 4;
    LN.pos.set([pa[0] - wa[0], pa[1] - wa[1], pa[2] - wa[2], pa[0] + wa[0], pa[1] + wa[1], pa[2] + wa[2], pb[0] + wb[0], pb[1] + wb[1], pb[2] + wb[2], pb[0] - wb[0], pb[1] - wb[1], pb[2] - wb[2]], o);
    vu[v] = vu[v + 1] = ua; vu[v + 2] = vu[v + 3] = ub;
    vc[v] = vc[v + 1] = ca; vc[v + 2] = vc[v + 3] = cb;
    vk[v] = vk[v + 1] = vk[v + 2] = vk[v + 3] = kind;
    qn++;
  };
  const off = 0.4 * K;
  const rowAt = (u) => { const f = clamp(u, 0, 1) * (NZ - 1), a = Math.min(NZ - 2, Math.floor(f)), r = f - a; return rows[a].map((q, j) => q.clone().lerp(rows[a + 1][j], r)); };
  for (let l = 0; l < NL; l++) {
    const u = (l + 0.5) / NL, row = rowAt(u), w = 0.45 * K;
    for (let j = j2; j < NPr - 1; j++) {
      const [ox, oy] = outward(row, j), [ox2, oy2] = outward(row, j + 1), a = row[j], c = row[j + 1];
      putQ([a.x + ox * off, a.y + oy * off, a.z], [c.x + ox2 * off, c.y + oy2 * off, c.z], [0, 0, w], [0, 0, w], u, u, (j / (NPr - 1)) * CI, ((j + 1) / (NPr - 1)) * CI, 0);
    }
  }
  ALONG.forEach(([ci, wd], kk) => {
    const j = jOf(ci);
    for (let i = 0; i < NZ - 1; i++) {
      const ra = rows[i], rb = rows[i + 1], [ox, oy, tx, ty] = outward(ra, j), [ox2, oy2, tx2, ty2] = outward(rb, j), a = ra[j], c = rb[j], w = wd * K;
      putQ([a.x + ox * off, a.y + oy * off, a.z], [c.x + ox2 * off, c.y + oy2 * off, c.z], [tx * w, ty * w, 0], [tx2 * w, ty2 * w, 0], i / (NZ - 1), (i + 1) / (NZ - 1), ci, ci, kk + 1);
    }
  });
  LN.touch();
  F.inner.add(lightMesh(LN.g, fx, 0.9, { fog: 0.3 }));
  // the sea's edge on the sand before it
  const NSw = 3, SW = dyn(NSw * (NZ - 1) * 4, quadIndex(NSw * (NZ - 1)));
  const GS = 10, gsx = (i, dd) => front[i] + dd, gsamp = rows.map((r, i) => Array.from({ length: GS + 1 }, (_, s) => G(front[i] + (s / GS) * 0.8 * H, zOf(i / (NZ - 1)))));
  const gAt = (i, dd) => { const f = clamp(dd / (0.8 * H), 0, 1) * GS, s = Math.min(GS - 1, Math.floor(f)), r = f - s; return gsamp[i][s] + (gsamp[i][s + 1] - gsamp[i][s]) * r; };
  F.inner.add(lightMesh(SW.g, fx, 0.8, { fog: 0.4 }));
  // spray flung from the lip as the light passes, hanging where it is when it stops
  const NB = P.beads, jTip = jOf(7), clouds = [0, 1, 2].map(() => sparks(Math.ceil(NB / 3), 0xffffff, fx, 1));
  const tipZ = (u) => { const i = clamp(u, 0, 1) * (NZ - 1), a = Math.floor(Math.min(i, NZ - 2)), r = i - a; return rows[a][jTip].clone().lerp(rows[a + 1][jTip], r); };
  const BD = Array.from({ length: NB }, () => {
    const u = R(), T = tipZ(u), el = 0.2 + R() * 0.8, sp = (8 + R() * 10) * K, zj = (R() - 0.5) * 0.4;
    const qb = u >= u0 ? 0.12 + 0.38 * invEase((u - u0) / (1 - u0)) : 0.12 + 0.2 * invEase(1 - u / u0);
    return { T, vx: Math.cos(el) * sp, vy: Math.sin(el) * sp, vz: zj * sp, tb: 0.6 + R() * 1.3, qb, ph: R() * TAU, a: 0.5 + 0.5 * R(), s: (1.2 + R() * 1.1) * K, g: G(T.x + 12 * K, T.z) };
  });
  BD.forEach((B, i) => { clouds[i % 3].sz[Math.floor(i / 3)] = B.s; });
  const halos = sparks(2, 0xffffff, fx, 0.9);
  halos.sz[0] = 60 * K; halos.sz[1] = 40 * K;
  F.inner.add(...clouds.map((c) => c.p), halos.p);
  const peakTip = tipZ(u0);
  const cA = new THREE.Color(mixHex(A, 0xffffff, 0.2)), C = P.cycle, slow = 3;
  const group = new THREE.Group();
  group.add(F.inner);
  const span = Lz / 2 + 4 * K, height = H + 10 * K;
  const out = { group, fx, light: F.out(peakTip.clone()), focus: F.out(V(0.1 * H, 0.45 * H, zOf(u0))), span, clear: Math.min(140, span), height, solid: { r: span, top: H, low: 0 } };
  return finish(out, (t) => {
    const q = frac(t / C + P.phase), hue = t / P.hue;
    const Fm = smoothstep(0.12, 0.16, q) * (1 - smoothstep(0.74, 0.94, q));
    const act = smoothstep(0.12, 0.14, q) * (1 - smoothstep(0.48, 0.53, q));
    const pe = ease((q - 0.12) / 0.38), up = q < 0.12 ? u0 : u0 + (1 - u0) * pe, lo = q < 0.12 ? u0 : u0 * (1 - ease((q - 0.12) / 0.2));
    const glint = frac(t / 95 + P.phase * 3);
    for (let v = 0; v < NQ * 4; v++) {
      const u = vu[v], ci = vc[v], kind = vk[v];
      const lit = smoothstep(lo - 0.02, lo + 0.005, u) * (up >= 0.999 ? 1 : smoothstep(up + 0.02, up - 0.005, u));
      const head = act * (Math.exp(-(((u - up) / 0.02) ** 2)) + (lo > 0.002 ? Math.exp(-(((u - lo) / 0.02) ** 2)) : 0));
      const lipness = Math.exp(-(((ci - 6.3) / 1.6) ** 2)), inside = smoothstep(7, 9.5, ci) * (1 - smoothstep(11.5, 12.8, ci));
      const gl = 0.35 * Math.exp(-(((u - glint) / 0.035) ** 2));
      let e;
      if (kind === 0) e = 0.03 + 0.05 * lipness + gl * lipness + Fm * lit * (0.14 + 0.5 * inside + 0.35 * lipness) * (0.75 + 0.25 * Math.sin(TAU * (ci * 0.35 - t * 0.18) + u * 31)) + head * (0.3 + 0.9 * lipness);
      else if (kind === 2) e = 0.16 + gl * 1.6 + Fm * lit * 0.8 + head * 2.2;
      else if (kind === 1) e = 0.1 + gl * 0.6 + Fm * lit * 0.45 + head * 0.8;
      else e = 0.02 + Fm * lit * (kind === 3 ? 0.55 : 0.3) + head * 0.4;
      LN.em[v] = Math.max(0.004, e);
      prism(hue + u * 0.55 + ci * 0.045, 0.7, 0.62);
      _c.lerp(cA, clamp(1 - Fm * lit, 0, 1) * 0.85);
      setCol(LN.col, v, _c);
    }
    LN.touch(false, true);
    glass.userData.fx.g = 0.8 + 0.7 * Fm;
    glass.material.uniforms.uTint.value.setHex(tintA).lerp(prism(hue + 0.3, 0.5, 0.75), 0.45 * Fm);
    // the swash: three edges of water running up the sand and back
    const sw = (q - 0.5) / 0.32;
    for (let l = 0; l < NSw; l++) {
      const ph = clamp(sw * 1.25 - l * 0.12, 0, 1), reach = Math.pow(Math.sin(Math.PI * ph), 0.8), dd = (0.04 + 0.6 * reach * (1 - l * 0.12)) * H, e = sw > 0 && sw < 1.2 ? Math.sin(Math.PI * ph) * 0.7 : 0;
      for (let i = 0; i < NZ - 1; i++) {
        const qq = l * (NZ - 1) + i, o = qq * 12, w = 0.7 * K, wob = Math.sin(i * 0.5 + l * 1.9 + t * 0.4) * 1.5 * K;
        const xa = gsx(i, dd + wob), xb = gsx(i + 1, dd + Math.sin((i + 1) * 0.5 + l * 1.9 + t * 0.4) * 1.5 * K), za = zOf(i / (NZ - 1)), zb = zOf((i + 1) / (NZ - 1));
        const ya = gAt(i, dd + wob) + 0.3 * K, yb = gAt(i + 1, dd) + 0.3 * K;
        SW.pos.set([xa - w, ya, za, xa + w, ya, za, xb + w, yb, zb, xb - w, yb, zb], o);
        const ue = endT(i / (NZ - 1));
        prism(hue + i / NZ * 0.6 + l * 0.15, 0.5, 0.75);
        for (let v = qq * 4; v < qq * 4 + 4; v++) { SW.em[v] = Math.max(0.004, e * ue); setCol(SW.col, v, _c); }
      }
    }
    SW.touch();
    // the spray
    for (let i = 0; i < NB; i++) {
      const B = BD[i], cl = clouds[i % 3], s = Math.floor(i / 3), age = (q - B.qb) * C;
      if (age < 0 || q > 0.97) { cl.al[s] = 0; continue; }
      const tau = Math.min(age / slow, B.tb);
      let x = B.T.x + B.vx * tau, y = B.T.y + B.vy * tau - 4.9 * tau * tau, z = B.T.z + B.vz * tau;
      const tf = q > 0.76 ? ((q - 0.76) * C) / slow : 0;
      y -= 4.9 * tf * tf;
      y += Math.sin(t * 0.3 + B.ph) * 0.4 * K;
      x += Math.sin(t * 0.21 + B.ph * 2) * 0.3 * K;
      y = Math.max(y, B.g + 0.4 * K);
      cl.pos[s * 3] = x; cl.pos[s * 3 + 1] = y; cl.pos[s * 3 + 2] = z;
      cl.al[s] = B.a * (0.7 + 0.3 * Math.sin(t * 3 + i * 1.7)) * (1 - smoothstep(0.8, 0.95, q)) * smoothstep(0, 0.4, age);
    }
    clouds.forEach((cl, i) => { cl.touch(); cl.m.uniforms.uColor.value.copy(prism(hue + i / 3, 0.55, 0.78)); });
    // the head of the light running the lip, and the peak's light seen from far
    const hp = tipZ(up);
    halos.pos.set([hp.x, hp.y, hp.z, peakTip.x, peakTip.y, peakTip.z]);
    halos.al[0] = act;
    halos.al[1] = 0.3 + 0.5 * Fm + 0.15 * Math.sin(t * 0.7);
    halos.touch();
    halos.m.uniforms.uColor.value.copy(prism(hue + 0.12, 0.45, 0.8));
  });
}

// ================================================================== the set
export const SET = {
  sandpile: {
    code: 'GRN', cls: 'Sandpile', nouns: ['Sandpile', 'Avalanche', 'Tablet', 'Hopper', 'Threshold', 'Topple'], place: 'desert', tier: 3,
    kin: ['chladni', 'menger', 'geode'], voice: ['grains', 'glass'],
    params(R, size) {
      const k = 0.6 + 0.4 * size, grand = size > 1.2;
      const m = Math.min(23, R.int(17, 20) + (grand ? 3 : 0)), PL = pileOf(m), G = 2 * m + 1;
      const P = { k, m, cell: R.range(1.08, 1.22) * k, tall: R.range(36, 44) * k, fill: R.range(150, 205), hold: R.range(10, 15), wind: R.range(8, 11), phase: R() * 600, bearing: R() * TAU, leg0: R() * TAU };
      const W = Math.round(G * P.cell + 4.8 * k), rate = Math.round(PL.Nmax / P.fill);
      P.text = `A tablet of glazed black stone ${W} meters square lies half drifted over, ruled into ${G} by ${G} cells, and over its middle a hopper hangs from three leaning legs ${Math.round(P.tall)} meters high, letting fall grains of light, about ${rate} a second. Wherever four gather in a cell they topple, one to each side, and the avalanches spread a figure nobody drew; after ${PL.Nmax} grains it reaches the edge, holds a while in violet, and then the wind scours it off from one side and the hopper begins again.`;
      return P;
    },
    build: sandpile,
  },
  lodestones: {
    code: 'JLD', cls: 'Lodestones', nouns: ['Lodestones', 'Arches', 'Field', 'Attraction', 'Poles', 'Filings'], place: 'desert', tier: 3,
    kin: ['hopf', 'halo', 'storm'], voice: ['fm', 'whale'],
    params(R, size) {
      const k = 0.6 + 0.4 * size;
      const P = {
        k, apart: R.range(40, 52) * k, tall1: R.range(24, 30) * k, girth: R.range(3.3, 4.1) * k, lean1: R.range(0.05, 0.13), lean2: R.range(0.05, 0.13),
        planes: R.pick([5, 6, 7]), thetas: R.int(4, 6), iron: R.pick([16, 18, 20]), cycle: R.range(55, 80), weak: R.range(0.08, 0.2), phase: R(), bearing: R() * TAU,
      };
      P.tall2 = P.tall1 * R.range(0.72, 0.95);
      P.text = `Two pillars of lodestone, ${Math.round(P.tall1)} and ${Math.round(P.tall2)} meters tall, stand ${Math.round(P.apart)} meters apart in the dune, wind-cut into waists under glazed caps, and the iron in the sand between their feet lies combed into the lines of their pull. Between their heads ${P.planes * P.thetas} arches of light follow the same lines through the air, grains running along them; about every ${Math.round(P.cycle)} seconds the lesser stone's hold weakens, the outer arches open and lift away into the fog as plumes, and close again as it returns.`;
      return P;
    },
    build: lodestones,
  },
  screw: {
    code: 'GSW', cls: 'Sand screw', nouns: ['Screw', 'Helix', 'Lift', 'Labour', 'Pocket', 'Return'], place: 'desert', tier: 4,
    kin: ['helicon', 'spine', 'clockwork'], voice: ['grains', 'whale'],
    params(R, size) {
      const k = 0.7 + 0.3 * size;
      const P = {
        k, length: R.range(90, 106) * k, slope: R.range(0.42, 0.5), radius: R.range(6.2, 7.4) * k, turn: R.range(13, 19), hand: R.chance(0.5) ? 1 : -1, pours: R.int(4, 5),
        throw: R.range(5, 7) * k, flow: R.range(16, 22), phase: R() * 600, bearing: R() * TAU,
      };
      P.pitch = P.radius * R.range(1.25, 1.55);
      const turns = Math.round(P.length / P.pitch), top = Math.round(P.length * Math.sin(P.slope) + P.radius);
      P.text = `A screw of stone and glass ${Math.round(P.length)} meters long lies slantwise in the waste, its foot sunk in a dune and its head ${top} meters up, carried in two cradles on piers, a helix of ${turns} turns inside it. Though nothing drives it, it turns once every ${Math.round(P.turn)} seconds and lifts golden sand up its flights a pocket at a time; each pocket pours from its head into a heap below, and every ${num(P.pours)} pours the heap slumps and the gold runs back along a channel to the foot, to be lifted again.`;
      return P;
    },
    build: screw,
  },
  glasswave: {
    code: 'GWV', cls: 'Glass wave', nouns: ['Wave', 'Breaker', 'Barrel', 'Crest', 'Undertow', 'Shore'], place: 'desert', tier: 5,
    kin: ['vortex', 'nautilus', 'cathedral'], voice: ['breath', 'whale'],
    params(R, size) {
      const k = Math.min(1.12, Math.sqrt(size)), grand = size > 1.2;
      const P = {
        k, height: R.range(92, 110) * k, length: R.range(190, 222) * k * (grand ? 1.06 : 1), peak: R.range(0.22, 0.34), bend: R.range(-0.1, 0.14),
        cycle: R.range(240, 380), hue: R.range(50, 90), phase: R(), bearing: R() * TAU, lines: R.int(36, 48), beads: R.int(480, 660) + (grand ? 120 : 0), shards: R.int(30, 44),
      };
      P.text = `A breaking wave of glass ${Math.round(P.length)} meters long stands in the waste, ${Math.round(P.height)} meters high where it curls over a hollow barrel and running out along its length to a low shoulder, dark at its back and clear in its curl, as if the sea that was here had been stopped in one moment and fused. About every ${num(mins(P.cycle))} minutes it remembers: light runs along its lip from the curl to the shoulder, the barrel fills with every color, spray is flung from the lip and hangs in the air, and the sea's old edge washes up the sand before it; then it all goes out.`;
      return P;
    },
    build: glasswave,
  },
};
