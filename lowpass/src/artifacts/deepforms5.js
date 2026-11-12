import * as THREE from 'three';
import { Builder, mat } from '../render/build.js';
import { glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { TAU, clamp, smoothstep } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { PULSE } from './parts.js';
import { PHI, bar, cloud } from './deepkit.js';

// The MYTHIC tier's true forms: landmarks found by perhaps one pilot in a hundred, that the
// others then fly a long way to see. Each is 120-220 m, layered, luminous, its light running
// slowly through every hue beside its stratum's colors, and each has one slow event that
// unfolds over minutes: a solid of four dimensions turning through itself while a plane of
// light slices it; a sun held in a barrel of irises that open in turn and let its light out
// across the forest; a dome hung with rings of pendulums that drift apart into waves and
// come back into one line. Each stands at its origin (or, built `mini`, hangs centered in
// the air with nothing on the ground), and moves only by the t handed to it. Built small (a
// crown, a court's) its motion is given once, at t = 0, and dropped: each is whole at t = 0.

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pale = (h, k = 0.3) => mixHex(h, 0xffffff, k);
const lesser = (k, art, mini) => mini && k !== art.main;
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen'];
const num = (n) => NUMW[n] || String(n);
const Num = (n) => { const s = num(n); return s[0].toUpperCase() + s.slice(1); };
const frac = (x) => x - Math.floor(x);

// a hue, as a color (shared: read it at once) and as a hex
const _hc = new THREE.Color();
const hsl = (h, s = 0.85, l = 0.62) => _hc.setHSL(frac(h), s, l);
const hueHex = (h, s = 0.85, l = 0.62) => new THREE.Color().setHSL(frac(h), s, l).getHex();

// a mesh of pure light with a material of its own (its own tint: what the update turns)
function lightMesh(art, parent, geo, opacity, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  parent.add(mesh);
  art.fades.push([m, opacity]);
  art.mats.extra.push(m);
  return mesh;
}

// a geometry of nv loose vertices, rewritten by the update: of light, or of the sheen
function liveGeo(nv) {
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), em = new Float32Array(nv);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return { g, pos, col, em, dirty() { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.emissive.needsUpdate = true; } };
}
function liveLight(art, parent, nv, opacity) {
  const L = liveGeo(nv);
  L.mesh = lightMesh(art, parent, L.g, opacity);
  return L;
}
function liveShell(art, parent, nv) {
  const L = liveGeo(nv);
  L.mesh = new THREE.Mesh(L.g, art.mats.shell);
  L.mesh.frustumCulled = false;
  parent.add(L.mesh);
  return L;
}

// one quad (two triangles) from a to b, offset +-o: a-o, a+o, b+o | a-o, b+o, b-o
function quadAt(pos, v, ax, ay, az, bx, by, bz, ox, oy, oz) {
  let q = v * 3;
  pos[q++] = ax - ox; pos[q++] = ay - oy; pos[q++] = az - oz;
  pos[q++] = ax + ox; pos[q++] = ay + oy; pos[q++] = az + oz;
  pos[q++] = bx + ox; pos[q++] = by + oy; pos[q++] = bz + oz;
  pos[q++] = ax - ox; pos[q++] = ay - oy; pos[q++] = az - oz;
  pos[q++] = bx + ox; pos[q++] = by + oy; pos[q++] = bz + oz;
  pos[q++] = bx - ox; pos[q++] = by - oy; pos[q++] = bz - oz;
  return v + 6;
}
// a thread of light from a to b: two quads crossed along it (12 vertices), seen from anywhere
function seg(pos, v, ax, ay, az, bx, by, bz, w) {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-6) { for (let i = 0; i < 12; i++) { pos[(v + i) * 3] = ax; pos[(v + i) * 3 + 1] = ay; pos[(v + i) * 3 + 2] = az; } return v + 12; }
  dx /= L; dy /= L; dz /= L;
  let ex = -dz, ez = dx;
  const el = Math.hypot(ex, ez);
  if (el < 1e-3) { ex = 1; ez = 0; } else { ex /= el; ez /= el; }
  const fx = dy * ez, fy = dz * ex - dx * ez, fz = -dy * ex;
  v = quadAt(pos, v, ax, ay, az, bx, by, bz, ex * w, 0, ez * w);
  return quadAt(pos, v, ax, ay, az, bx, by, bz, fx * w, fy * w, fz * w);
}
// the colors and lights of n quads written by quadAt: a, a, b, a, b, b
const PAT = [0, 0, 1, 0, 1, 1];
function paint(col, em, v, n, ar, ag, ab, ea, br, bg, bb, eb) {
  for (let q = 0; q < n; q++) for (let i = 0; i < 6; i++, v++) {
    const b = PAT[i];
    col[v * 3] = b ? br : ar; col[v * 3 + 1] = b ? bg : ag; col[v * 3 + 2] = b ? bb : ab;
    em[v] = Math.max(0.0001, b ? eb : ea);
  }
  return v;
}

// ------------------------------------------------------------------ POLYCHORON
// The convex regular solids of four dimensions: the tesseract (8 cells), the 16-cell, the
// 24-cell, the 600-cell. Their corners on the unit 3-sphere, their edges (the shortest
// distances), their 2-faces (squares for the tesseract, else the triangles of the edges).
const POLY4 = {};
const EVEN = (() => {
  const out = [], a = [0, 1, 2, 3];
  const perm = (l) => {
    if (l === 4) { let inv = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (a[i] > a[j]) inv++; if (inv % 2 === 0) out.push(a.slice()); return; }
    for (let i = l; i < 4; i++) { [a[l], a[i]] = [a[i], a[l]]; perm(l + 1); [a[l], a[i]] = [a[i], a[l]]; }
  };
  perm(0);
  return out;
})();
function poly4(name) {
  if (POLY4[name]) return POLY4[name];
  const V = [];
  const cube = () => { for (let i = 0; i < 16; i++) V.push([0, 1, 2, 3].map((b) => ((i >> b) & 1 ? 0.5 : -0.5))); };
  const axes = () => { for (let a = 0; a < 4; a++) for (const s of [1, -1]) { const v = [0, 0, 0, 0]; v[a] = s; V.push(v); } };
  if (name === '8') cube();
  else if (name === '16') axes();
  else if (name === '24') {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (const s of [1, -1]) for (const q of [1, -1]) { const v = [0, 0, 0, 0]; v[a] = s * Math.SQRT1_2; v[b] = q * Math.SQRT1_2; V.push(v); }
  } else {
    cube(); axes();
    const base = [PHI / 2, 0.5, 1 / (2 * PHI), 0];
    for (const p of EVEN) for (let sg = 0; sg < 8; sg++) { const v = [0, 0, 0, 0]; for (let i = 0; i < 4; i++) v[p[i]] = base[i] * (i < 3 && (sg >> i) & 1 ? -1 : 1); V.push(v); }
  }
  const n = V.length, d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 + (a[3] - b[3]) ** 2;
  let min = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) min = Math.min(min, d2(V[i], V[j]));
  const E = [], adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (d2(V[i], V[j]) < min * 1.01) { E.push([i, j]); adj[i].add(j); adj[j].add(i); }
  const F = [];
  if (name === '8') {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const others = [0, 1, 2, 3].filter((x) => x !== a && x !== b);
      for (let m = 0; m < 4; m++) {
        const o = ((m & 1) << others[0]) | (((m >> 1) & 1) << others[1]);
        F.push([o, o | (1 << a), o | (1 << a) | (1 << b), o | (1 << b)]);
      }
    }
  } else for (const [i, j] of E) for (const q of adj[i]) if (q > j && adj[j].has(q)) F.push([i, j, q]);
  return (POLY4[name] = { V, E, F });
}
const CELLS = { 8: 'a tesseract', 16: 'a sixteen-celled', 24: 'a twenty-four-celled', 600: 'a six-hundred-celled' };

// POLYCHORON: the shadow, cast into our three dimensions, of solids of four. Three of them,
// one inside another (the outer drawn in edges of light over faint panes, the inner a dark
// heart of the sheen), turning in planes that are not here, so that as they turn they pass
// through themselves and come out inside out; every edge's hue is how far into the fourth
// direction it lies. A plane of light sweeps through the fourth direction, and where it
// cuts them each section is drawn, a solid of our own changing as it goes. Standing, it
// hangs over a stepped dais in a ring of standing stones, a thread of light under it and a
// spire of light over it.
function polychoron(k, P, S, art, mini) {
  const R = art.R, c = art.pal, less = lesser(k, art, mini), U = S * (mini ? 0.9 : 1);
  const Rp = 33 * U, H = mini ? 0 : 1.1 * Rp + 12 * U, g0 = mini ? 0 : art.ground(0, 0), D = 2.4;
  const holder = k.sub(0, H, 0);
  const tilt = R.range(-0.15, 0.15), yaw0 = R() * TAU;
  // the layers: which solid, how large in four dimensions, its colors and its way of turning
  const names = less ? ['24', '8'] : [P.outer, P.mid, P.inner];
  const radii = [1, 0.58, 0.3], pcs = [c.light, c.second, c.third];
  const layers = names.map((nm, li) => {
    const { V, E, F } = poly4(nm), n = V.length;
    // a turn of its own, from the seed, in all six planes, given once
    const B = V.map((v) => v.slice());
    for (const [a, b] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) {
      const th = R() * TAU, cs = Math.cos(th), sn = Math.sin(th);
      for (const v of B) { const x = v[a], y = v[b]; v[a] = x * cs - y * sn; v[b] = x * sn + y * cs; }
    }
    const heart = !less && li === 2, Rl = radii[li] * Rp;
    const L = {
      nm, n, B, E, F, Rl, heart, sg: li % 2 ? -1 : 1, rate: 1 + 0.3 * li, h0: R(), pc: new THREE.Color(pcs[li]),
      X: new Float32Array(n), Y: new Float32Array(n), Z: new Float32Array(n), W: new Float32Array(n), F4: new Float32Array(n * 3), K: new Float32Array(n),
      cr: new Float32Array(n), cg: new Float32Array(n), cb: new Float32Array(n), gl: new Float32Array(n),
      wE: (li === 0 ? 0.34 : li === 1 ? 0.38 : 0.42) * U * (nm === '600' ? 0.8 : 1),
    };
    L.edges = liveLight(art, holder.group, E.length * 12, 0.95);
    const nf = F.reduce((s, f) => s + (f.length === 4 ? 6 : 3), 0);
    if (!less) L.panes = heart ? liveShell(art, holder.group, nf) : liveLight(art, holder.group, nf, 0.9);
    L.aF = clamp(1.1 / Math.sqrt(F.length), 0.025, 0.1);
    if (!less && li === 0) L.slice = liveLight(art, holder.group, F.length * 12, 1);
    if (!less) L.pts = cloud(art, holder.group, n, 0xffffff, (li === 0 ? 1.5 : 1.9) * U, 1);
    return L;
  });
  // the heart's own light
  holder.lit.ico(1.4 * U, 1, null, c.second, PULSE);
  holder.glow.ico(3.2 * U, 1, null, pale(c.light, 0.5), 0.35);
  // threads of light along its axis, above and below; standing, the lower one comes down
  // to a stepped dais in a ring of standing stones
  const upL = (mini ? 0.45 : 0.5) * Rp, top = 1.12 * Rp;
  k.glow.add(new THREE.CylinderGeometry(0.2 * U, 1.3 * U, upL, 8, 4, true), mat(0, H + top + upL / 2, 0), pale(c.light, 0.4), (x, y) => 0.04 + 0.7 * (0.5 - y / upL));
  if (mini) k.glow.add(new THREE.CylinderGeometry(1.3 * U, 0.2 * U, upL, 8, 4, true), mat(0, -top - upL / 2, 0), pale(c.light, 0.4), (x, y) => 0.04 + 0.7 * (0.5 + y / upL));
  else {
    const daisTop = g0 + 3.25 * U;
    for (let i = 0; i < 3; i++) {
      const r = (15 - 3.5 * i) * U, y = g0 - 0.5 * U + i * 1.5 * U;
      k.stone.cyl(r, r * 1.03, 1.5 * U, 40, mat(0, y, 0), c.stone[1 + (i % 2)]);
      k.lit.add(new THREE.TorusGeometry(r - 0.3 * U, 0.16 * U, 3, 48), mat(0, y + 0.76 * U, 0, Math.PI / 2, 0, 0), i % 2 ? c.second : c.light, PULSE);
    }
    k.glow.add(new THREE.CircleGeometry(5 * U, 32), mat(0, daisTop + 0.05 * U, 0, -Math.PI / 2, 0, 0), pale(c.light, 0.5), 0.55);
    const low = H - top, dl = low - daisTop;
    k.glow.add(new THREE.CylinderGeometry(0.5 * U, 1.6 * U, dl, 8, 4, true), mat(0, daisTop + dl / 2, 0), pale(c.light, 0.4), (x, y) => 0.12 + 0.5 * (0.5 - y / dl));
    const ns = P.stones, rs = 1.02 * Rp;
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * TAU, x = Math.cos(a) * rs, z = Math.sin(a) * rs, gy = art.ground(x, z), hs = (9 + 12 * frac(i * 0.618034 + 0.3)) * U;
      k.stone.cyl(1.5 * U, 2.1 * U, hs + 1.5 * U, 6, mat(x, gy + hs / 2 - 0.75 * U, z, 0, a, 0), c.stone[1 + (i % 3)]);
      k.lit.add(new THREE.OctahedronGeometry(1.1 * U), mat(x, gy + hs + 1.2 * U, z), [c.light, c.second, c.third][i % 3], PULSE);
      const b = (i + 1) / ns * TAU, x2 = Math.cos(b) * rs, z2 = Math.sin(b) * rs;
      bar(k.glow, V3(x, gy + 0.3 * U, z), V3(x2, art.ground(x2, z2) + 0.3 * U, z2), 0.3 * U, c.second, 0.6);
    }
  }
  const step = (t) => {
    holder.group.rotation.set(tilt, yaw0 + t * 0.015, 0);
    const al = (t * TAU) / P.period, ga = (t * TAU) / (P.period * PHI), de = 0.4 * Math.sin(t * 0.017), s = 1.08 * Math.sin((t * TAU) / P.slice), hT = t * 0.008;
    const pulse = 1 + 0.06 * Math.sin(t * 0.9);
    for (const L of layers) {
      const ca = Math.cos(al * L.sg * L.rate), sa = Math.sin(al * L.sg * L.rate), cg = Math.cos(ga * L.sg), sg = Math.sin(ga * L.sg), cd = Math.cos(de), sd = Math.sin(de);
      for (let i = 0; i < L.n; i++) {
        let [x, y, z, w] = L.B[i], q;
        q = x * ca - w * sa; w = x * sa + w * ca; x = q;          // in the plane of x and the fourth
        q = z * cg - w * sg; w = z * sg + w * cg; z = q;          // of z and the fourth
        q = y * cd - w * sd; w = y * sd + w * cd; y = q;          // of y and the fourth, rocking
        const f = D / (D - w), r = f * L.Rl;
        L.F4[i * 3] = x; L.F4[i * 3 + 1] = y; L.F4[i * 3 + 2] = z;
        L.X[i] = x * r; L.Y[i] = y * r; L.Z[i] = z * r; L.W[i] = w; L.K[i] = f;
        const gl = Math.exp(-(((w - s) / 0.13) ** 2));
        L.gl[i] = gl;
        const hc = hsl(L.h0 + 0.3 * w + hT, 0.85, 0.6 + 0.15 * gl);
        L.cr[i] = hc.r * 0.7 + L.pc.r * 0.3; L.cg[i] = hc.g * 0.7 + L.pc.g * 0.3; L.cb[i] = hc.b * 0.7 + L.pc.b * 0.3;
      }
      // its edges
      const E = L.edges;
      let v = 0;
      for (const [a, b] of L.E) {
        const f = (L.K[a] + L.K[b]) / 2;
        const v0 = v;
        v = seg(E.pos, v, L.X[a], L.Y[a], L.Z[a], L.X[b], L.Y[b], L.Z[b], L.wE * f * pulse);
        const ea = 0.3 + 0.5 * (L.K[a] - 0.7) + 1.1 * L.gl[a], eb = 0.3 + 0.5 * (L.K[b] - 0.7) + 1.1 * L.gl[b];
        paint(E.col, E.em, v0, 2, L.cr[a], L.cg[a], L.cb[a], ea, L.cr[b], L.cg[b], L.cb[b], eb);
      }
      E.dirty();
      // its faces: faint panes of light (the heart's, of the sheen)
      if (L.panes) {
        const Pn = L.panes, p = Pn.pos, cl = Pn.col, em = Pn.em;
        let u = 0;
        const put = (i, e) => {
          p[u * 3] = L.X[i]; p[u * 3 + 1] = L.Y[i]; p[u * 3 + 2] = L.Z[i];
          if (L.heart) { const k2 = 0.5 + 0.5 * L.W[i]; cl[u * 3] = L.cr[i] * 0.4 + 0.3 * k2; cl[u * 3 + 1] = L.cg[i] * 0.4 + 0.25 * k2; cl[u * 3 + 2] = L.cb[i] * 0.4 + 0.3 * k2; }
          else { cl[u * 3] = L.cr[i]; cl[u * 3 + 1] = L.cg[i]; cl[u * 3 + 2] = L.cb[i]; }
          em[u] = Math.max(0.0001, e(i));
          u++;
        };
        const e = L.heart ? (i) => 0.12 + 0.9 * L.gl[i] : (i) => L.aF * (0.6 + 2.2 * L.gl[i]);
        for (const f of L.F) {
          put(f[0], e); put(f[1], e); put(f[2], e);
          if (f.length === 4) { put(f[0], e); put(f[2], e); put(f[3], e); }
        }
        Pn.dirty();
      }
      // the section: where the plane of light cuts each face, a thread
      if (L.slice) {
        const Sl = L.slice, f = D / (D - s), r = f * L.Rl;
        const hc = hsl(0.5 + s * 0.3 + hT, 0.6, 0.8), cr = hc.r, cg = hc.g, cb = hc.b;
        let v2 = 0;
        for (const fc of L.F) {
          let m = 0, x0 = 0, y0 = 0, z0 = 0, x1 = 0, y1 = 0, z1 = 0;
          for (let e2 = 0; e2 < fc.length && m < 2; e2++) {
            const a = fc[e2], b = fc[(e2 + 1) % fc.length], wa = L.W[a] - s, wb = L.W[b] - s;
            if ((wa < 0) === (wb < 0)) continue;
            const u = wa / (wa - wb);
            const x = (L.F4[a * 3] + (L.F4[b * 3] - L.F4[a * 3]) * u) * r, y = (L.F4[a * 3 + 1] + (L.F4[b * 3 + 1] - L.F4[a * 3 + 1]) * u) * r, z = (L.F4[a * 3 + 2] + (L.F4[b * 3 + 2] - L.F4[a * 3 + 2]) * u) * r;
            if (m === 0) { x0 = x; y0 = y; z0 = z; } else { x1 = x; y1 = y; z1 = z; }
            m++;
          }
          const v0 = v2;
          if (m < 2) { x1 = x0; y1 = y0; z1 = z0; }
          v2 = seg(Sl.pos, v2, x0, y0, z0, x1, y1, z1, 0.28 * U * f);
          const e3 = m < 2 ? 0 : 1.2;
          paint(Sl.col, Sl.em, v0, 2, cr, cg, cb, e3, cr, cg, cb, e3);
        }
        Sl.dirty();
      }
      // its corners, beads of light
      if (L.pts) {
        for (let i = 0; i < L.n; i++) { L.pts.pos[i * 3] = L.X[i]; L.pts.pos[i * 3 + 1] = L.Y[i]; L.pts.pos[i * 3 + 2] = L.Z[i]; }
        L.pts.attr.needsUpdate = true;
        L.pts.p.material.uniforms.uColor.value.setHSL(frac(L.h0 + hT + 0.5), 0.5, 0.82);
      }
    }
  };
  step(0);
  art.updates.push(step);
  const reach = 1.1 * Rp;
  return { light: V3(0, H, 0), focus: V3(0, H, 0), span: mini ? reach : Math.max(reach, 1.02 * Rp + 2.5 * U), height: H + reach, solid: Rp * 0.85, low: mini ? -reach : 0 };
}

// ------------------------------------------------------------------ APERTURE
// APERTURE: a sun held in a barrel of irises. At its heart a small sun, its corona and
// prominences; on either side of it, along one level axis, three irises one beyond another,
// each larger than the last, their frames joined by struts of stone: a funnel opening out
// each way. Every iris is a ring of curved blades of the sheen, each a different hue, that
// overlap round a hole (a plain polygon, as many sides as blades) and turn on their pivots
// to open it or close it. Over some minutes they open in turn from the sun outward, rings
// of the spectrum showing in each opening, and when all are open on a side the sun's light
// goes out of that end across the forest, sweeping as the barrel turns; then they close in
// turn from the outside in, until only a pinhole of the sun shows. Standing, the barrel
// rests on two pylons that ride a ring of stone on the ground.
function aperture(k, P, S, art, mini) {
  const R = art.R, c = art.pal, less = lesser(k, art, mini), U = S * (mini ? 0.9 : 1);
  const nJ = less ? 2 : 3, T = P.period, Rs = 6.5 * U;
  const H = mini ? 0 : 48 * U, g0 = mini ? 0 : art.ground(0, 0);
  const holder = k.sub(0, H, 0), yaw0 = R() * TAU;
  // the sun
  const sunK = holder.sub();
  sunK.lit.ico(Rs, 2, null, c.second, PULSE);
  sunK.glow.ico(Rs * 1.18, 2, null, pale(c.light, 0.55), 0.7);
  for (let i = 0; i < P.arcs; i++) {
    const r = R.range(1.6, 3.2) * U;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(R() * TAU, R() * TAU, R() * TAU)).multiply(new THREE.Matrix4().makeTranslation(0, Rs * 0.95, 0));
    sunK.glow.add(new THREE.TorusGeometry(r, 0.35 * U, 4, 14, Math.PI), m, mixHex(c.light, c.second, 0.5), 1);
  }
  let corona = null;
  if (!less) {
    const cb = new Builder();
    cb.ico(Rs * 2.1, 3, null, 0xffffff, 0.5);
    corona = lightMesh(art, holder.group, cb.build(), 0.8, { fresnel: 1 });
  }
  // the irises: frames, pivots, rings of light; their blades are drawn every frame
  const stops = [];
  for (const side of [1, -1]) for (let j = 0; j < nJ; j++) {
    const Rf = (17 + 11 * j) * U, z = side * (12 + 9.5 * j) * U, N = less ? Math.min(9, P.blades[j]) : P.blades[j];
    holder.shell.add(new THREE.TorusGeometry(Rf, 1.1 * U, less ? 6 : 8, less ? 64 : 96), mat(0, 0, z), mixHex(c.shellLo, c.shellHi, 0.6));
    if (!less) holder.stone.add(new THREE.TorusGeometry(Rf + 1.9 * U, 0.75 * U, 6, 96), mat(0, 0, z), c.stone[2]);
    holder.glow.add(new THREE.TorusGeometry(Rf - 1.4 * U, 0.12 * U, 3, 128), mat(0, 0, z + side * 0.9 * U), hueHex(j * 0.27 + (side > 0 ? 0 : 0.5)), 0.8);
    for (let i = 0; i < N; i++) { const a = (i / N) * TAU; holder.lit.ico(0.6 * U, 0, mat(Math.cos(a) * Rf, Math.sin(a) * Rf, z + side * 1.15 * U), [c.light, c.second, c.third][i % 3], PULSE); }
    stops.push({ side, j, Rf, z, N, rot0: R() * TAU, spin: (j % 2 ? -1 : 1) * 0.01, o: 0, r: 0 });
  }
  // the struts: the funnel's ribs, and across the sun between the two innermost
  const ns = 6, sa0 = R() * TAU;
  for (let q = 0; q < ns; q++) {
    const a = sa0 + (q / ns) * TAU, ca = Math.cos(a), sn = Math.sin(a);
    for (const side of [1, -1]) {
      const mine = stops.filter((s) => s.side === side);
      for (let j = 0; j < nJ - 1; j++) bar(holder.stone, V3(ca * mine[j].Rf, sn * mine[j].Rf, mine[j].z), V3(ca * mine[j + 1].Rf, sn * mine[j + 1].Rf, mine[j + 1].z), 0.9 * U, c.stone[1]);
    }
    bar(holder.stone, V3(ca * stops[0].Rf, sn * stops[0].Rf, stops[0].z), V3(ca * stops[0].Rf, sn * stops[0].Rf, -stops[0].z), 0.8 * U, c.stone[1]);
  }
  // standing: two pylons under the outer frames, turning with it on a ring of stone
  const outer = stops[nJ - 1];
  if (!mini) {
    for (const side of [1, -1]) {
      const z = side * Math.abs(outer.z), topY = -outer.Rf - 1.2 * U, footY = g0 - 2.5 * U - H, len = topY - footY;
      holder.stone.add(new THREE.CylinderGeometry(1.8 * U, 3.4 * U, len, 4), mat(0, footY + len / 2, z, 0, Math.PI / 4, 0), c.stone[1]);
      holder.stone.box(6 * U, 1.4 * U, 6 * U, mat(0, footY + 2.6 * U, z), c.stone[2]);
      holder.lit.box(1.2 * U, 1.2 * U, 1.2 * U, mat(0, topY - 1.6 * U, z + side * 2 * U), c.light, PULSE);
    }
    const rt = Math.abs(outer.z), n = 64;
    const at = (r, a, dy) => V3(Math.cos(a) * r, art.ground(Math.cos(a) * r, Math.sin(a) * r) + dy, Math.sin(a) * r);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      bar(k.stone, at(rt, a0, -0.2 * U), at(rt, a1, -0.2 * U), 2.6 * U, c.stone[2]);
      bar(k.glow, at(rt - 2.4 * U, a0, 0.25 * U), at(rt - 2.4 * U, a1, 0.25 * U), 0.3 * U, c.light, 0.7);
    }
  }
  // the blades (the sheen) and the threads of light along their inner edges
  const nU = less ? 6 : 10, nV = less ? 2 : 3, nb = stops.reduce((s, q) => s + q.N, 0);
  const blades = liveShell(art, holder.group, nb * nU * nV * 6);
  const edges = less ? null : liveLight(art, holder.group, nb * nU * 12, 1);
  // rings of the spectrum in each opening, and the light let out of each end
  const rings = less ? [] : stops.map((s) => {
    const b = new Builder();
    for (let q = 0; q < 4; q++) { const ri = 0.42 + 0.16 * q; b.add(new THREE.RingGeometry(ri, ri + 0.035, 64, 1), null, hueHex(0.78 - 0.24 * q, 0.9, 0.62), 0.8); }
    return lightMesh(art, holder.group, b.build(), 0.9);
  });
  const beams = less ? [] : [1, -1].map((side) => {
    const b = new Builder();
    b.add(new THREE.CylinderGeometry(1.6, 1, 1, 24, 8, true), mat(0, 0, side * 0.5, side * Math.PI / 2, 0, 0), 0xffffff, (x, y) => 0.02 + 0.55 * Math.pow(0.5 - y, 1.4));
    return { side, mesh: lightMesh(art, holder.group, b.build(), 0.9) };
  });
  const motes = less ? null : cloud(art, holder.group, 220, pale(c.light, 0.45), 0.8 * U, 1);
  const M = motes ? Array.from({ length: 220 }, () => ({ r: R.range(8, 11) * U, a: R() * TAU, b: Math.acos(R.range(-1, 1)), w: R.range(0.05, 0.16) * (R() < 0.5 ? -1 : 1) })) : [];
  const pcHi = new THREE.Color(c.shellHi);
  const step = (t) => {
    holder.group.rotation.y = yaw0 + t * 0.012;
    sunK.group.rotation.set(0.3, t * 0.05, 0);
    sunK.group.scale.setScalar(1 + 0.03 * Math.sin(t * 1.7));
    const x = frac(t / T + 0.4), hT = t * 0.006;
    if (corona) corona.material.uniforms.uTint.value.copy(hsl(hT + 0.1, 0.7, 0.7));
    let v = 0, ve = 0;
    for (let si = 0; si < stops.length; si++) {
      const st = stops[si], { j, side, Rf, N } = st;
      const a = 0.05 + 0.07 * j, b = 0.7 - 0.07 * j;
      const o = smoothstep(a, a + 0.16, x) * (1 - smoothstep(b, b + 0.16, x));
      const Rb = Rf * 0.97, r = Rf * (0.03 + 0.8 * o), sA = r * Math.tan(Math.PI / N), sE = -0.97 * Math.sqrt(Math.max(0, Rb * Rb - r * r));
      st.o = o; st.r = r;
      const rot = st.rot0 + st.spin * t + o * 1.2 * (Math.PI / N);
      for (let i = 0; i < N; i++) {
        const th = rot + (i / N) * TAU, nx = Math.cos(th), ny = Math.sin(th), tx = -ny, ty = nx;
        const hc = hsl(i / N + j * 0.17 + (side > 0 ? 0 : 0.5) + hT, 0.8, 0.55);
        const cr = hc.r * 0.65 + pcHi.r * 0.35, cg = hc.g * 0.65 + pcHi.g * 0.35, cb = hc.b * 0.65 + pcHi.b * 0.35;
        const lift = 0.07 * U * i, glowO = 0.6 + 0.8 * o;
        const Pt = (u, w) => {
          const s = sA + (sE - sA) * u, ix = nx * r + tx * s, iy = ny * r + ty * s, ri = Math.hypot(ix, iy) || 1e-6, k2 = Rb / ri;
          const px = ix + (ix * k2 - ix) * w, py = iy + (iy * k2 - iy) * w, rho = Math.hypot(px, py);
          return [px, py, st.z - side * (0.18 * (Rb - rho) + lift)];
        };
        for (let ui = 0; ui < nU; ui++) {
          for (let vi = 0; vi < nV; vi++) {
            const A = Pt(ui / nU, vi / nV), B = Pt((ui + 1) / nU, vi / nV), C = Pt((ui + 1) / nU, (vi + 1) / nV), Dd = Pt(ui / nU, (vi + 1) / nV);
            const e = (0.08 + 0.4 * (1 - vi / nV)) * glowO;
            for (const p of [A, B, C, A, C, Dd]) {
              blades.pos[v * 3] = p[0]; blades.pos[v * 3 + 1] = p[1]; blades.pos[v * 3 + 2] = p[2];
              blades.col[v * 3] = cr; blades.col[v * 3 + 1] = cg; blades.col[v * 3 + 2] = cb; blades.em[v] = e;
              v++;
            }
          }
          if (edges) {
            const A = Pt(ui / nU, 0), B = Pt((ui + 1) / nU, 0), w = 0.35 * U, el = hsl(i / N + j * 0.17 + 0.5 + hT, 0.9, 0.72);
            for (const off of [side * 0.12 * U, -side * 0.12 * U]) {
              const ve0 = ve;
              ve = quadAt(edges.pos, ve, A[0] + nx * w, A[1] + ny * w, A[2] + off, B[0] + nx * w, B[1] + ny * w, B[2] + off, nx * w, ny * w, 0);
              paint(edges.col, edges.em, ve0, 1, el.r, el.g, el.b, 0.9 * glowO, el.r, el.g, el.b, 0.9 * glowO);
            }
          }
        }
      }
      if (rings.length) {
        const m = rings[si];
        m.visible = o > 0.02;
        m.scale.set(r, r, 1);
        m.position.z = st.z - side * (0.18 * (Rb - r) + 0.4 * U);
        m.material.uniforms.uTint.value.setScalar(o * o);
      }
    }
    blades.dirty();
    if (edges) edges.dirty();
    for (const bm of beams) {
      const mine = stops.filter((s) => s.side === bm.side), b = mine.reduce((p, s) => p * s.o, 1), rb = Math.max(Rs, 0.75 * mine[0].r);
      bm.mesh.visible = b > 0.01;
      bm.mesh.scale.set(rb, rb, 95 * U);
      bm.mesh.material.uniforms.uTint.value.copy(hsl(hT + (bm.side > 0 ? 0.15 : 0.65), 0.5, 0.8)).multiplyScalar(b);
    }
    if (motes) {
      for (let i = 0; i < M.length; i++) {
        const q = M[i], a = q.a + t * q.w, rr = q.r * (1 + 0.08 * Math.sin(t * 0.7 + i));
        motes.pos[i * 3] = Math.sin(q.b) * Math.cos(a) * rr; motes.pos[i * 3 + 1] = Math.cos(q.b) * rr; motes.pos[i * 3 + 2] = Math.sin(q.b) * Math.sin(a) * rr;
      }
      motes.attr.needsUpdate = true;
    }
  };
  step(0);
  art.updates.push(step);
  const reach = outer.Rf + 2.7 * U;
  return { light: V3(0, H, 0), focus: V3(0, H, 0), span: Math.max(reach, Math.abs(outer.z) + 2 * U), height: H + reach, solid: reach * 0.8, low: mini ? -reach : 0 };
}

// ------------------------------------------------------------------ PENDULUMS
// PENDULUMS: a dome of ribs, standing on legs that flare to the ground, and hung from rings
// on it, one inside another and each higher, rings of pendulums of light. In each ring every
// pendulum is a little shorter than the one before and swings a little faster, the harmonics
// of one long count: in and out from the middle they drift into waves, spirals, two groups,
// three, apparent chaos, and at the end of the count all come back into one line, and the
// ribs flare with light (the inner rings, counting a half and a third as long, have come
// into line on the way). Each bob is a plumb of the sheen in a hue of its own, the hues
// going round each ring, a trail of light behind it. From the dome's crown a great plumb
// swings slowly, its plane turning half round in one count, and knocks down one by one a
// ring of pegs on the ground, which stand again as the rings come into line.
function pendulums(k, P, S, art, mini) {
  const R = art.R, c = art.pal, less = lesser(k, art, mini), G = S * 0.78 * (mini ? 0.9 : 1);
  const nT = less ? 1 : P.tiers, spire = mini ? 10 : 16, yBot = 1.8, yTop = 100 + spire;
  const g0 = mini ? 0 : art.ground(0, 0), off = mini ? -(yTop + yBot) / 2 : 0;
  const Y = (y) => g0 + (y + off) * G;
  const dome = (r) => 100 - 20 * (r / 30) ** 2, leg = (y) => 50 - 20 * (Math.max(0, y) / 80) ** 3;
  // the ribs: from the ground (standing) up the flaring legs to the first ring, then over the dome
  const nR = P.ribs, ra0 = R() * TAU, ribGlow = new Builder();
  for (let i = 0; i < nR; i++) {
    const a = ra0 + (i / nR) * TAU, ca = Math.cos(a), sa = Math.sin(a), rp = [];
    if (!mini) for (let q = 0; q < 12; q++) { const y = -2 + (82 * q) / 12; rp.push([leg(y), y]); }
    for (let q = 0; q <= 10; q++) { const r = 30 * (1 - q / 10); rp.push([r, dome(r)]); }
    const pts = rp.map(([r, y]) => {
      const x = ca * r * G, z = sa * r * G;
      return V3(x, Y(y) + (!mini && y < 80 ? (art.ground(x, z) - g0) * (1 - clamp(y / 80, 0, 1)) : 0), z);
    });
    const rad = (u) => (mini ? 1.5 - 0.6 * u : 2.4 - 1.5 * u) * G;
    k.shell.tube(pts, rad, 6, (u) => mixHex(c.shellLo, c.shellHi, 0.3 + 0.6 * u));
    // a thread of light along its outside, beads on it
    const gp = pts.map((p, q) => {
      const a2 = pts[Math.max(0, q - 1)], b2 = pts[Math.min(pts.length - 1, q + 1)];
      const dr = (Math.hypot(b2.x, b2.z) - Math.hypot(a2.x, a2.z)), dy = b2.y - a2.y, l = Math.hypot(dr, dy) || 1;
      const nr = dy / l, ny = -dr / l, o = rad(q / (pts.length - 1)) + 0.3 * G;
      return V3(p.x + ca * nr * o, p.y + ny * o, p.z + sa * nr * o);
    });
    if (!less) ribGlow.tube(gp, 0.22 * G, 3, pale(c.light, 0.3), 0.8);
    gp.forEach((p, q) => { if (q % 3 === 1) k.lit.ico(0.75 * G, 0, mat(p.x, p.y, p.z), [c.light, c.second, c.third][q % 3], PULSE); });
    if (!mini) {
      const f = pts[0];
      k.stone.cyl(3.4 * G, 4.6 * G, 4 * G, 6, mat(f.x, art.ground(f.x, f.z) + 0.6 * G, f.z, 0, a, 0), c.stone[2]);
    }
  }
  const ribMesh = less ? null : lightMesh(art, k.group, ribGlow.build(), 0.9);
  // the crown: a stone cap, a beacon, a spire of light
  k.stone.ico(2.4 * G, 1, mat(0, Y(100), 0), c.stone[2]);
  k.lit.ico(1.5 * G, 1, mat(0, Y(102.4), 0), c.second, PULSE);
  k.glow.ico(3.4 * G, 1, mat(0, Y(102.4), 0), pale(c.light, 0.5), 0.5);
  const sl = (spire - 3) * G;
  k.glow.add(new THREE.CylinderGeometry(0.12 * G, 1.1 * G, sl, 8, 4, true), mat(0, Y(103) + sl / 2, 0), pale(c.light, 0.4), (x, y) => 0.04 + 0.7 * (0.5 - y / sl));
  // the rings, and the pendulums hung from them
  const ringGlow = new Builder(), pend = [], tiers = [];
  const LL = [[64, 40], [44, 27], [28, 16]], AMP = [0.25, 0.26, 0.24];
  for (let j = 0; j < nT; j++) {
    const r = 30 * (1 - 0.3 * j), y = j === 0 ? 80 : dome(r), N = less ? Math.min(24, P.n[j]) : P.n[j];
    k.shell.add(new THREE.TorusGeometry(r * G, 1.2 * G, 8, 112), mat(0, Y(y), 0, Math.PI / 2, 0, 0), mixHex(c.shellLo, c.shellHi, 0.7));
    k.stone.add(new THREE.TorusGeometry(r * G, 0.6 * G, 5, 112), mat(0, Y(y) + 1.4 * G, 0, Math.PI / 2, 0, 0), c.stone[1]);
    ringGlow.add(new THREE.TorusGeometry((r - 1.6) * G, 0.16 * G, 3, 128), mat(0, Y(y) - 0.6 * G, 0, Math.PI / 2, 0, 0), [c.light, c.second, c.third][j], 0.9);
    const Tc = P.cycle / (j + 1), N0 = Math.max(12, Math.round(Tc / 8.5)), Tmax = Tc / N0, Tmin = Tc / (N0 + N - 1), a0 = R() * TAU;
    const tier = { j, N, i0: pend.length, h0: R() };
    for (let q = 0; q < N; q++) {
      const a = a0 + (q / N) * TAU, Tq = Tc / (N0 + q), L = (LL[j][1] + ((LL[j][0] - LL[j][1]) * (Tq - Tmin)) / (Tmax - Tmin)) * G;
      const px = Math.cos(a) * r * G, pz = Math.sin(a) * r * G, py = Y(y) - 1.4 * G;
      k.lit.ico(0.55 * G, 0, mat(px, py, pz), [c.light, c.second, c.third][q % 3], PULSE);
      pend.push({ ca: Math.cos(a), sa: Math.sin(a), px, py, pz, L, w: (TAU * (N0 + q)) / Tc, A: AMP[j], h: q / N, j });
    }
    tier.halo = less ? null : cloud(art, k.group, N, 0xffffff, 3.4 * G, 0.9);
    tiers.push(tier);
  }
  const ringMesh = lightMesh(art, k.group, ringGlow.build(), 0.9);
  const np = pend.length, Mt = 7, dT = 0.22;
  const wires = liveLight(art, k.group, np * 12, 0.9);
  const bobs = liveShell(art, k.group, np * 24);
  const trails = less ? null : liveLight(art, k.group, np * (Mt - 1) * 12, 0.9);
  // a plumb: a bicone about its center (8 triangles)
  const bh = 1.8 * G, bw = 1.0 * G, BC = [];
  for (let q = 0; q < 4; q++) {
    const a = (q / 4) * TAU + Math.PI / 4, b = ((q + 1) / 4) * TAU + Math.PI / 4, e0 = [Math.cos(a) * bw, 0, Math.sin(a) * bw], e1 = [Math.cos(b) * bw, 0, Math.sin(b) * bw];
    BC.push([0, bh, 0], e1, e0, [0, -bh, 0], e0, e1);
  }
  // the great plumb, from the crown
  const fp = k.sub(0, Y(99), 0), Lf = 93 * G, Af = 0.09, psi0 = R() * TAU;
  fp.group.rotation.order = 'YXZ';
  bar(fp.glow, V3(0, 0, 0), V3(0, -Lf + 2.6 * G, 0), 0.22 * G, pale(c.light, 0.4), 0.8);
  fp.shell.ico(2.6 * G, 2, mat(0, -Lf, 0), c.shellHi);
  fp.lit.add(new THREE.TorusGeometry(2.65 * G, 0.28 * G, 4, 32), mat(0, -Lf, 0, Math.PI / 2, 0, 0), c.light, PULSE);
  fp.lit.cone(0.7 * G, 1.6 * G, 8, mat(0, -Lf - 3.4 * G, 0, Math.PI, 0, 0), c.second, PULSE);
  fp.glow.ico(4.2 * G, 1, mat(0, -Lf, 0), pale(c.second, 0.4), 0.25);
  // its ring of pegs on a dial of stone (standing only)
  const Rpg = (Lf * Math.sin(Af)) + 0.3 * G, npg = 24, pegs = !mini && !less ? liveShell(art, k.group, npg * 36) : null;
  const PG = [];
  if (pegs) {
    k.stone.cyl(Rpg + 3 * G, Rpg + 3.4 * G, 1.2 * G, 48, mat(0, g0 - 0.2 * G, 0), c.stone[1]);
    k.lit.add(new THREE.TorusGeometry(Rpg + 1.8 * G, 0.18 * G, 3, 64), mat(0, g0 + 0.45 * G, 0, Math.PI / 2, 0, 0), c.light, PULSE);
    for (let i = 0; i < npg; i++) {
      const a = (i / npg) * TAU;
      PG.push({ a, x: Math.cos(a) * Rpg, z: Math.sin(a) * Rpg, xp: frac((a - psi0) / Math.PI), col: new THREE.Color(mixHex(c.shellLo, c.shellHi, 0.4 + 0.5 * (i % 2))) });
    }
  }
  const step = (t) => {
    const hT = t * 0.006;
    // how nearly each ring is in line
    const coh = tiers.map((tr) => {
      let sc = 0, ss = 0;
      for (let q = tr.i0; q < tr.i0 + tr.N; q++) { const ph = pend[q].w * t; sc += Math.cos(ph); ss += Math.sin(ph); }
      return Math.pow(Math.hypot(sc, ss) / tr.N, 6);
    });
    let vw = 0, vb = 0, vt = 0;
    for (let q = 0; q < np; q++) {
      const p = pend[q], g = coh[p.j], th = p.A * Math.cos(p.w * t), sx = Math.sin(th) * p.L, bx = p.px + p.ca * sx, bz = p.pz + p.sa * sx, by = p.py - Math.cos(th) * p.L;
      const hc = hsl(p.h + p.j * 0.11 + hT, 0.9, 0.62), cr = hc.r, cg = hc.g, cb = hc.b;
      const v0 = vw;
      vw = seg(wires.pos, vw, p.px, p.py, p.pz, bx, by + bh, bz, 0.12 * G);
      paint(wires.col, wires.em, v0, 2, cr, cg, cb, 0.22 + 0.6 * g, cr, cg, cb, 0.35 + 0.6 * g);
      const eb = 0.7 + 0.9 * g;
      for (const e of BC) {
        bobs.pos[vb * 3] = bx + e[0]; bobs.pos[vb * 3 + 1] = by + e[1]; bobs.pos[vb * 3 + 2] = bz + e[2];
        bobs.col[vb * 3] = cr * 0.8 + 0.15; bobs.col[vb * 3 + 1] = cg * 0.8 + 0.15; bobs.col[vb * 3 + 2] = cb * 0.8 + 0.15; bobs.em[vb] = eb;
        vb++;
      }
      if (trails) {
        // where it was a moment ago, and before: a ribbon each way, fading
        let lx = bx, ly = by, lz = bz;
        for (let m = 1; m < Mt; m++) {
          const t2 = t - m * dT, th2 = p.A * Math.cos(p.w * t2), s2 = Math.sin(th2) * p.L, nx = p.px + p.ca * s2, nz = p.pz + p.sa * s2, ny = p.py - Math.cos(th2) * p.L;
          const ea = 0.55 * (1 - (m - 1) / (Mt - 1)) ** 2 * (0.6 + g), eb2 = 0.55 * (1 - m / (Mt - 1)) ** 2 * (0.6 + g);
          const v1 = vt;
          vt = quadAt(trails.pos, vt, lx, ly, lz, nx, ny, nz, 0, 0.6 * G, 0);
          vt = quadAt(trails.pos, vt, lx, ly, lz, nx, ny, nz, -p.sa * 0.6 * G, 0, p.ca * 0.6 * G);
          paint(trails.col, trails.em, v1, 2, cr, cg, cb, ea, cr, cg, cb, eb2);
          lx = nx; ly = ny; lz = nz;
        }
      }
      const tr = tiers[p.j];
      if (tr.halo) { const i = q - tr.i0; tr.halo.pos[i * 3] = bx; tr.halo.pos[i * 3 + 1] = by; tr.halo.pos[i * 3 + 2] = bz; }
    }
    wires.dirty(); bobs.dirty();
    if (trails) trails.dirty();
    for (const tr of tiers) if (tr.halo) {
      tr.halo.attr.needsUpdate = true;
      tr.halo.p.material.uniforms.uColor.value.copy(hsl(tr.h0 + hT, 0.45, 0.8)).multiplyScalar(0.6 + 0.8 * coh[tr.j]);
    }
    const flare = coh.reduce((s, g, j) => s + g / (j + 1), 0) / coh.reduce((s, g, j) => s + 1 / (j + 1), 0);
    if (ribMesh) ribMesh.material.uniforms.uTint.value.copy(hsl(hT + 0.3, 0.35, 0.75)).multiplyScalar(0.45 + 1.6 * flare);
    ringMesh.material.uniforms.uTint.value.setScalar(0.6 + 1.2 * flare);
    // the great plumb, and its plane turning half round in one count
    const x = frac(t / P.cycle);
    fp.group.rotation.set(0, psi0 + Math.PI * (t / P.cycle), Af * Math.sin((TAU * t) / P.plumb));
    if (pegs) {
      let v = 0;
      const up = 3.2 * G, hw = 0.35 * G;
      for (const pg of PG) {
        const fall = smoothstep(pg.xp, pg.xp + 0.006, x) * (1 - smoothstep(0.965, 0.995, x)), phi = fall * 1.45;
        const ox = Math.cos(pg.a), oz = Math.sin(pg.a), gx = -oz, gz = ox, cu = Math.cos(phi), su = Math.sin(phi);
        // its up and out, tipped outward about its foot
        const ux = ox * su, uy = cu, uz = oz * su, ex = ox * cu, ey = -su, ez = oz * cu;
        const by = art.ground(pg.x, pg.z) + 0.2 * G;
        const C = (a, b, h) => [pg.x + gx * a * hw + ex * b * hw + ux * h, by + ey * b * hw + uy * h, pg.z + gz * a * hw + ez * b * hw + uz * h];
        const c8 = [C(-1, -1, 0), C(1, -1, 0), C(1, 1, 0), C(-1, 1, 0), C(-1, -1, up), C(1, -1, up), C(1, 1, up), C(-1, 1, up)];
        for (const [a, b, d, e] of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) {
          for (const i of [a, b, d, a, d, e]) {
            pegs.pos.set(c8[i], v * 3);
            pegs.col[v * 3] = pg.col.r; pegs.col[v * 3 + 1] = pg.col.g; pegs.col[v * 3 + 2] = pg.col.b;
            pegs.em[v] = i >= 4 ? 0.5 * (1 - fall) : 0;
            v++;
          }
        }
      }
      pegs.dirty();
    }
  };
  step(0);
  art.updates.push(step);
  return { light: V3(0, Y(60), 0), focus: V3(0, Y(55), 0), span: (mini ? 47 : 54) * G, height: Y(yTop), solid: 30 * G, low: mini ? Y(yBot) : 0 };
}

// ------------------------------------------------------------------ what each is, and how it grows with depth
export const NEW_FORMS = {
  polychoron: {
    code: 'ZHC', cls: 'Shadow of four dimensions', nouns: ['Polytope', 'Hypersolid', 'Projection', 'Tesseract', 'Cell', 'Shadow'], set: 'plus', from: 1,
    params(R, depth) {
      const outer = depth >= 2 ? '600' : '24';
      const mid = outer === '600' ? R.pick(['24', '8']) : '8';
      const inner = '16';
      const period = R.range(150, 210), slice = R.range(50, 75);
      const stones = Math.min(24, 8 + 2 * depth);
      return { outer, mid, inner, period, slice, stones,
        text: `The shadow of solids of four dimensions, cast into the air: ${CELLS[outer]} polytope, ${CELLS[mid]} within it and ${CELLS[inner]} heart, each turning in a direction that is not here, passing through itself and coming out inside out every few minutes. A plane of light sweeps through them; ${stones} standing stones keep the ring beneath.` };
    },
    build: polychoron,
  },
  aperture: {
    code: 'QAP', cls: 'Barrel of irises', nouns: ['Aperture', 'Iris', 'Diaphragm', 'Lens', 'Shutter', 'Oculus'], set: 'plus', from: 1,
    params(R, depth) {
      const g = Math.min(3, Math.floor(depth / 3));
      const blades = [7 + 2 * g, 9 + 2 * g, 11 + 2 * g];
      const period = R.range(170, 230), arcs = Math.min(12, 5 + depth);
      return { blades, period, arcs,
        text: `A small sun held in a barrel of irises, three on either side, of ${num(blades[0])}, ${num(blades[1])} and ${num(blades[2])} blades; over some minutes they open in turn from the sun outward, and when all are open its light goes out of both ends across the forest. Then they close again, to a pinhole.` };
    },
    build: aperture,
  },
  pendulums: {
    code: 'XPW', cls: 'Pendulum wave', nouns: ['Pendulums', 'Cadence', 'Plumb', 'Harmonics', 'Count', 'Swing'], set: 'plus', from: 1,
    params(R, depth) {
      const tiers = depth >= 4 ? 3 : 2, d = Math.min(6, depth);
      const n = [36 + 4 * d, 30 + 3 * d, 24 + 2 * d];
      const ribs = R.pick(depth >= 3 ? [3, 4, 6] : [3, 4]);
      const cycle = R.range(240, 300), plumb = R.range(17, 21);
      const total = n.slice(0, tiers).reduce((a, b) => a + b, 0);
      return { tiers, n, ribs, cycle, plumb,
        text: `A dome on ${num(ribs)} legs hung with ${total} pendulums of light in ${num(tiers)} rings, each a little shorter than the one before: they drift into waves and spirals and seeming chaos, and every ${Math.round(cycle / 60)} minutes or so come back into one line. A great plumb in the middle knocks down a ring of pegs, one by one.` };
    },
    build: pendulums,
  },
};
