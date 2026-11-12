import * as THREE from 'three';
import { Builder, mat } from '../render/build.js';
import { glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { TAU, clamp, smoothstep } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { PULSE } from './parts.js';
import { hash3, GOLDEN, bar, petal, cloud } from './deepkit.js';

// More of the deep's forms: a ringed world, a moth, a seed-head letting its seeds go, a
// storm of pages. Each is built of the Kit's four kinds of stuff in its stratum's colors,
// stands at its origin (or, built `mini`, hangs centered in the air with nothing on the
// ground), and moves only by the t, dt and ctx handed to it. Built small (a crown, a
// court's) its motion is given once, at t = 0, and dropped: every one is whole at t = 0.

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pale = (h, k = 0.3) => mixHex(h, 0xffffff, k);
const nearOf = (ctx) => (ctx && ctx.near) || 0;
const DEG = Math.PI / 180;
// built small, as another's crown or one of its court (several of them at once, and still):
// then it is made of less. Hanging as the artifact's own form it is whole.
const lesser = (k, art, mini) => mini && k !== art.main;
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n) => NUMW[n] || String(n);
const Num = (n) => { const s = num(n); return s[0].toUpperCase() + s.slice(1); };

// a mesh of pure light with a material of its own (its own opacity, a fresnel edge)
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

// a geometry of nv loose vertices (triangles), rewritten by the form's update
function liveGeo(nv) {
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), em = new Float32Array(nv);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return { g, pos, col, em };
}

// the ground about the origin, sampled once (for what falls to it every frame)
function groundGrid(art, half, n = 9) {
  const g = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = art.ground(((i / (n - 1)) * 2 - 1) * half, ((j / (n - 1)) * 2 - 1) * half);
  return (x, z) => {
    const fx = clamp((x / half + 1) / 2, 0, 1) * (n - 1), fz = clamp((z / half + 1) / 2, 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fz)), u = fx - i, v = fz - j;
    return (g[j * n + i] * (1 - u) + g[j * n + i + 1] * u) * (1 - v) + (g[(j + 1) * n + i] * (1 - u) + g[(j + 1) * n + i + 1] * u) * v;
  };
}

// ------------------------------------------------------------------ PLANET
// A dark banded world hanging in the air, tilted: belts of shell and stone, a thin lit limb
// on its day side; about it a system of flat rings, each a faint sheet of light and
// thousands of motes gathered into arcs, each ring turning at the speed its distance asks
// (the inner faster, as Kepler has it), gaps between them, and in the gaps small moons of
// light going round at their own speeds. The globe's shadow lies across the rings, and the
// motes and the moons go dark as they pass through it. Standing, the rings' outline lies
// on the ground.
function planet(k, P, S, art, mini) {
  const R = art.R, c = art.pal, U = S * (mini ? 0.85 : 1);
  const Rg = 7.2 * U, H = mini ? 0 : 34 * S, flat = 0.93, cols = [c.light, c.second, c.third];
  const sys = k.sub(0, H, 0);
  sys.group.rotation.set(0, R() * TAU, P.tilt);
  // the globe: belts from pole to pole, by turns shell and dark stone
  const globe = sys.sub();
  const nb = 2 * R.int(5, 7) + 1, sq = mat(0, 0, 0, 0, 0, 0, 1, flat, 1), dark = mixHex(c.shellLo, c.stone[0], 0.4);
  const wt = Array.from({ length: nb }, (_, j) => (j % 2 ? R.range(0.5, 1.3) : R.range(0.8, 1.9)));
  const tot = wt.reduce((a, b) => a + b, 0);
  let th = 0;
  for (let j = 0; j < nb; j++) {
    const dth = (wt[j] / tot) * Math.PI, g = new THREE.SphereGeometry(Rg, 36, Math.max(1, Math.round(dth / 0.2)), 0, TAU, th, dth);
    if (j % 2) globe.stone.add(g, sq, c.stone[R.int(0, 2)]);
    else globe.shell.add(g, sq, mixHex(dark, c.shellHi, R.range(0.05, 0.55)));
    th += dth;
    if (j < nb - 1 && R() < 0.3) globe.glow.add(new THREE.TorusGeometry(Math.sin(th) * Rg * 1.005, 0.07 * U, 3, 48), mat(0, Math.cos(th) * Rg * flat, 0, Math.PI / 2, 0, 0), c.second, 0.5);
  }
  // its limb: a skin of light on the day side, seen only where it is seen edge-on; and
  // away from that side its shadow, lying across the rings (1 lit, 0 in the shadow)
  const la = R() * TAU, L = V3(Math.cos(la) * 0.9, 0.3, Math.sin(la) * 0.9).normalize(), lb = new Builder();
  const lit = (x, y, z) => {
    const s = x * L.x + y * L.y + z * L.z;
    return s >= 0 ? 1 : smoothstep(Rg * 0.8, Rg * 1.02, Math.sqrt(Math.max(0, x * x + y * y + z * z - s * s)));
  };
  lb.add(new THREE.SphereGeometry(Rg * 1.035, 36, 14), sq, pale(c.light, 0.45), (x, y, z) => Math.max(0.002, smoothstep(-0.15, 0.75, (x * L.x + y * L.y + z * L.z) / (Rg * 1.035))));
  lightMesh(art, sys.group, lb.build(), 0.95, { fresnel: 1 });
  // the rings: where each begins and ends, the gaps between (one of them the great one)
  const nR = P.rings, less = lesser(k, art, mini), nc = less ? 2 : 3, rIn = 1.42 * Rg, rOut = (2.15 + 0.1 * nR) * Rg, dir = P.tilt > 0 ? 1 : -1;
  const kep = (r) => 0.42 * Math.pow(r / Rg, -1.5) * dir;
  const gaps = Array.from({ length: nR - 1 }, () => R.range(0.06, 0.1) * Rg);
  if (nR > 1) gaps[R.int(0, nR - 2)] = 0.2 * Rg;
  const wts = Array.from({ length: nR }, () => R.range(0.6, 1.6)), wsum = wts.reduce((a, b) => a + b, 0);
  const room = rOut - rIn - gaps.reduce((a, b) => a + b, 0);
  const rings = [];
  let r = rIn;
  for (let i = 0; i < nR; i++) {
    const w = (room * wts[i]) / wsum;
    rings.push({ r0: r, r1: r + w, col: i % nc, dens: R.range(0.55, 1), m: R.pick([1, 2, 3, 5]), p0: R() * TAU, con: R.range(0.45, 0.8), nl: Math.max(1, Math.round(w / (0.45 * U))), w: kep(r + w / 2) });
    r += w + (gaps[i] || 0);
  }
  // each a faint sheet of light, in ringlets, dark where the globe's shadow crosses it
  for (const g of rings) for (let q = 0; q < g.nl; q++) {
    const a = g.r0 + ((g.r1 - g.r0) * q) / g.nl, b = g.r0 + ((g.r1 - g.r0) * (q + 0.8)) / g.nl, al = (0.1 + 0.2 * R()) * g.dens;
    sys.glow.add(new THREE.RingGeometry(a, b, 72, 1), mat(0, 0, 0, -Math.PI / 2, 0, 0), cols[g.col], (x, y) => Math.max(0.004, al * (0.08 + 0.92 * lit(x, 0, -y))));
  }
  // and its motes, gathered into arcs so that its turning shows
  const N = less ? Math.min(P.motes, 3200) : P.motes;
  const area = rings.map((g) => (g.r1 * g.r1 - g.r0 * g.r0) * g.dens), asum = area.reduce((a, b) => a + b, 0);
  const sets = [];
  for (let ci = 0; ci < nc; ci++) {
    const mine = rings.filter((g) => g.col === ci).map((g) => [g, Math.max(8, Math.round((N * area[rings.indexOf(g)]) / asum))]);
    const n = mine.reduce((s, [, m]) => s + m, 0);
    if (!n) continue;
    const cl = cloud(art, sys.group, n, pale(cols[ci], 0.2), 0.62 * U, 1), base = new Float32Array(n * 3), spans = [];
    let o = 0;
    for (const [g, m] of mine) {
      const o0 = o;
      for (let i = 0; i < m; i++, o++) {
        let phi;
        do { phi = R() * TAU; } while (R() > 1 - g.con * (0.5 + 0.5 * Math.cos(g.m * (phi - g.p0))));
        const rr = g.r0 + ((g.r1 - g.r0) * (Math.floor(R() * g.nl) + 0.08 + 0.64 * R())) / g.nl;
        base[o * 3] = Math.cos(phi) * rr; base[o * 3 + 1] = (R() - 0.5) * 0.12 * U; base[o * 3 + 2] = Math.sin(phi) * rr;
      }
      spans.push([o0, o, g.w]);
    }
    sets.push({ cl, base, spans, al: cl.p.geometry.attributes.aAlpha, A: cl.p.geometry.attributes.aAlpha.array.slice() });
  }
  // the shepherds: a moon of light in each gap (the widest first), then one outside, one inside
  const slots = gaps.map((g, i) => ({ r: rings[i].r1 + g / 2, w: g })).sort((a, b) => b.w - a.w);
  slots.push({ r: rOut + 0.12 * Rg, w: 0.14 * Rg }, { r: rIn - 0.12 * Rg, w: 0.1 * Rg });
  const moons = slots.slice(0, P.moons).map((s, i) => {
    const m = sys.sub(), rad = clamp(s.w * 0.5, 0.45 * U, 0.75 * U);
    if (less) m.glow.ico(rad * 3, 2, null, cols[i % 3], 0.16);
    m.glow.ico(rad * 1.7, 1, null, pale(cols[i % 3], 0.3), 0.45);
    m.glow.ico(rad, 1, null, 0xffffff, 1);
    return { m, r: s.r, ph: R() * TAU, w: kep(s.r) };
  });
  // (whole, each has a soft glow about it as well)
  const halo = less ? null : cloud(art, sys.group, moons.length, pale(c.light, 0.45), 4.5 * U, 1.1);
  if (halo) halo.p.geometry.attributes.aSize.array.fill(1);
  // standing: the outline of its rings drawn on the ground under it
  if (!mini) {
    sys.group.updateMatrix();
    const at = (rr, a) => { const p = V3(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyMatrix4(sys.group.matrix); p.y = art.ground(p.x, p.z) + 0.35; return p; };
    for (const [rr, col, w] of [[rOut, c.light, 0.32], [rIn, c.second, 0.22]]) for (let i = 0; i < 64; i++) bar(k.glow, at(rr, (i / 64) * TAU), at(rr, ((i + 1) / 64) * TAU), w * S, col, 0.6);
  }
  const step = (t) => {
    for (const s of sets) {
      const p = s.cl.pos, b = s.base, al = s.al.array;
      for (const [i0, i1, w] of s.spans) {
        const cs = Math.cos(t * w), sn = Math.sin(t * w);
        for (let i = i0 * 3, j = i0; j < i1; i += 3, j++) {
          const x = b[i] * cs - b[i + 2] * sn, z = b[i] * sn + b[i + 2] * cs;
          p[i] = x; p[i + 1] = b[i + 1]; p[i + 2] = z;
          al[j] = s.A[j] * (0.06 + 0.94 * lit(x, 0, z));     // (they go dark as they cross the shadow)
        }
      }
      s.cl.attr.needsUpdate = true;
      s.al.needsUpdate = true;
    }
    for (const q of moons) {
      const a = q.ph + t * q.w, x = Math.cos(a) * q.r, z = Math.sin(a) * q.r;
      q.m.group.position.set(x, 0, z);
      q.m.group.scale.setScalar(0.3 + 0.7 * lit(x, 0, z));
      if (halo) { const i = moons.indexOf(q); halo.pos[i * 3] = x; halo.pos[i * 3 + 1] = 0; halo.pos[i * 3 + 2] = z; halo.p.geometry.attributes.aAlpha.array[i] = 0.1 + 0.9 * lit(x, 0, z); }
    }
    if (halo) { halo.attr.needsUpdate = true; halo.p.geometry.attributes.aAlpha.needsUpdate = true; }
    globe.group.rotation.y = t * 0.09 * dir;
    sys.group.position.y = H + Math.sin(t * 0.25) * 0.7 * U;
  };
  step(0);
  art.updates.push(step);
  const reach = rOut + 0.2 * Rg;
  return { light: V3(0, H, 0), focus: V3(0, H, 0), span: reach, height: H + Math.max(Rg, reach * Math.abs(Math.sin(P.tilt))) + U, solid: Rg * 1.15, low: H - Rg };
}

// ------------------------------------------------------------------ MOTH
// A wing: a fan of nr rings by ns sectors about its root, lying in the plane of x (the span,
// to the side sx) and y (toward the head), pleated between its veins and a little cupped
// toward the back (+z). Its margin is o.rOf(angle); o.phis are the sectors' edges.
function wingAt(o, sx, s, rho, U) {
  const ns = o.phis.length - 1, f = clamp(s, 0, 0.9999) * ns, j = Math.floor(f), phi = o.phis[j] + (o.phis[j + 1] - o.phis[j]) * (f - j), r = o.rOf(phi) * rho;
  return V3(sx * Math.cos(phi) * r, Math.sin(phi) * r, o.cam * U * rho * rho * Math.sin(Math.PI * s));
}
function wing(w, o, sx, c, U) {
  const ns = o.phis.length - 1, nr = o.nr, cols = [c.light, c.second, c.third];
  const G = Array.from({ length: nr + 1 }, (_, i) => Array.from({ length: ns + 1 }, (_, j) => {
    const rho = i / nr, r = o.rOf(o.phis[j]) * rho;
    return V3(sx * Math.cos(o.phis[j]) * r, Math.sin(o.phis[j]) * r, (j % 2 ? 1 : -1) * 0.2 * U * rho + o.cam * U * rho * rho * Math.sin((Math.PI * j) / ns));
  }));
  // the membrane: darker at the root, a dark band across it, pale at the margin
  for (let i = 0; i < nr; i++) {
    let col = mixHex(c.shellLo, c.shellHi, Math.pow((i + 0.5) / nr, 0.8));
    if (i === o.band) col = mixHex(col, c.stone[0], 0.6);
    if (i === nr - 1) col = mixHex(col, c.light, 0.3);
    for (let j = 0; j < ns; j++) {
      const a = G[i][j].toArray(), b = G[i + 1][j].toArray(), d = G[i + 1][j + 1].toArray(), e = G[i][j + 1].toArray();
      if (i === 0) w.shell.tri(a, b, d, col);
      else w.shell.quad(a, b, d, e, col);
    }
  }
  // veins of light along every other pleat: three from the root (the fore edge, the middle,
  // the hind edge), the rest from the cell they close a third of the way out; the margin;
  // a line across
  const veins = [];
  for (let j = 0; j <= ns; j += 2) if (o.rOf(o.phis[j]) > 0.5 * U) veins.push(j);
  const mid = veins[veins.length >> 1], vc = pale(c.light, 0.25);
  for (const j of veins) {
    const i0 = j === veins[0] || j === veins[veins.length - 1] || j === mid ? 0 : o.cell;
    w.glow.tube(G.slice(i0).map((row) => row[j]), (t) => (0.2 - 0.1 * t) * U, 3, vc, 0.8);
  }
  w.glow.tube(G[o.cell].slice(veins[0], veins[veins.length - 1] + 1), 0.12 * U, 3, vc, 0.8);
  w.glow.tube(G[nr], 0.2 * U, 3, c.second, 0.95);
  w.glow.tube(G[o.band + 1], 0.1 * U, 3, c.third, 0.6);
  // the eyespot: plain circles, one inside another, on a dark round, on both faces
  const E = wingAt(o, sx, o.eye.s, o.eye.rho, U), re = o.eye.re;
  for (const q of [1, -1]) {
    w.stone.add(new THREE.CircleGeometry(re, 24), mat(E.x, E.y, E.z + q * 0.36 * U, 0, q > 0 ? 0 : Math.PI, 0), c.stone[0]);
    for (let n = 0; n < o.eyes; n++) {
      const rr = re * (1 - n / (o.eyes + 0.4));
      w.glow.add(new THREE.RingGeometry(rr - 0.2 * U, rr, 24, 1), mat(E.x, E.y, E.z + q * 0.47 * U), cols[n % 3], 0.9);
    }
  }
}
// the forewing: a long leading edge to a point, an outer margin a little bowed, a short hind edge
function foreSpec(P, U) {
  const Lf = 21 * U, pi = -30 * DEG, pc = 31 * DEG, pe = 39 * DEG, Lt = 0.76 * Lf;
  const A = [Math.cos(pc) * Lf, Math.sin(pc) * Lf], T = [Math.cos(pi) * Lt, Math.sin(pi) * Lt], dx = A[0] - T[0], dy = A[1] - T[1], cr = T[0] * dy - T[1] * dx;
  const nm = 2 * P.veins, phis = [];
  for (let j = 0; j <= nm; j++) phis.push(pi + ((pc - pi) * j) / nm);
  phis.push(pc + (pe - pc) * 0.55, pe);
  return { phis, nr: 6, band: 3, cell: 2, cam: 0.6, eyes: P.eyes, eye: { s: (0.5 * nm) / (nm + 2), rho: 0.58, re: 2.3 * U },
    rOf: (phi) => {
      if (phi <= pc) return (cr / (Math.cos(phi) * dy - Math.sin(phi) * dx)) * (1 + 0.05 * Math.sin((Math.PI * (phi - pi)) / (pc - pi)));
      const q = (phi - pc) / (pe - pc);
      return Lf * Math.sqrt(Math.max(0, 1 - q * q)) * (1 - 0.2 * q);
    } };
}
// the hindwing: a round lobe (or, with tails, drawn out into one)
function hindSpec(P, U) {
  const Lh = 14.5 * U, p0 = -88 * DEG, p1 = 4 * DEG, ns = 20, phis = Array.from({ length: ns + 1 }, (_, j) => p0 + ((p1 - p0) * j) / ns);
  return { phis, nr: 5, band: 3, cell: 2, cam: 0.5, eyes: P.eyes, eye: { s: 0.54, rho: 0.7, re: 1.9 * U },
    rOf: (phi) => {
      const q = (phi - p0) / (p1 - p0);
      return Lh * (0.78 + 0.22 * Math.pow(Math.max(0, Math.sin(Math.PI * q)), 0.7)) * (1 + (P.tails ? 0.5 * Math.exp(-(((q - 0.25) / 0.055) ** 2)) : 0));
    } };
}

// MOTH: a moth of light hanging in the air head up, leaning back, turning slowly: four
// wings of shell hinged on its body, veined and margined in light, an eyespot of plain
// circles on each, opening wide, resting open, closing over its back and opening again;
// feathered antennae; a body of segments ringed with light. At every closing, scales of
// light come off the wings and fall, turning, a long way (standing: to the ground).
function moth(k, P, S, art, mini) {
  const R = art.R, c = art.pal, U = S * (mini ? 0.85 : 1);
  const H = mini ? 3 * U : 32 * S, T = P.period, tilt0 = 0.3, yaw0 = R() * TAU, yawRate = 0.03, bodyY = -1.2 * U;
  const turn = k.sub(0, H, 0), body = turn.sub(0, bodyY, 0);
  // the abdomen: segments, each wider at its foot than the next at its head, a ring of light between
  const nseg = P.segments, y0a = 0.8 * U, La = 11.5 * U, prof = (s) => 1.9 * U * (1 - 0.74 * Math.pow(s, 1.7)), h = La / nseg;
  for (let j = 0; j < nseg; j++) {
    const yc = y0a - (j + 0.5) * h;
    body.shell.cyl(prof(j / nseg) * 0.86, prof((j + 1) / nseg) * 1.05, h, 10, mat(0, yc, 0), mixHex(c.shellLo, c.shellHi, j % 2 ? 0.25 : 0.8));
    body.lit.add(new THREE.TorusGeometry(prof((j + 1) / nseg) * 1.06, 0.11 * U, 4, 16), mat(0, yc - h / 2, 0, Math.PI / 2, 0, 0), j % 2 ? c.second : c.light, j % 3 === 0 ? PULSE : 1);
  }
  body.shell.cone(prof(1) * 1.05, 1.6 * U, 8, mat(0, y0a - La - 0.8 * U, 0, Math.PI, 0, 0), c.shellLo);
  // the thorax and its two ruffs, the head (no eyes: nothing of a face)
  body.shell.add(new THREE.IcosahedronGeometry(1, 2), mat(0, 3.2 * U, 0, 0, 0, 0, 2.3 * U, 3.1 * U, 2.3 * U), c.shellHi);
  for (let i = 0; i < 12; i++) petal(body.shell, 2.8 * U, 0.9 * U, 0.75, (i / 12) * TAU, 1.3 * U, 4.9 * U, 0.4, 0.15, c.shellLo, c.shellHi, 3, 2);
  for (let i = 0; i < 10; i++) petal(body.shell, 3 * U, 1 * U, 2.4, ((i + 0.5) / 10) * TAU, 1.5 * U, 1.9 * U, 0.4, -0.1, c.shellHi, c.shellLo, 3, 2);
  body.stone.ico(1.15 * U, 1, mat(0, 6.5 * U, 0), c.stone[2]);
  body.glow.ico(3.2 * U, 1, mat(0, 3.2 * U, 0), pale(c.light, 0.3), 0.14);
  // the antennae: a curved rib, combed on both sides like a feather
  const ants = [];
  for (const sx of [1, -1]) {
    const an = body.sub(sx * 0.55 * U, 7.2 * U, 0.3 * U);
    const f = (t) => V3(sx * (0.9 * t + 4.3 * t * t) * U, (8.4 * t - 1.6 * t * t) * U, 1.6 * t * t * U);
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(f(i / 8));
    an.lit.tube(pts, (t) => (0.2 - 0.12 * t) * U, 4, c.second, 1);
    for (let i = 1; i <= P.barbs; i++) {
      const t = i / (P.barbs + 1), p = f(t), tg = f(t + 0.01).sub(f(t - 0.01)).normalize(), sd = V3().crossVectors(tg, V3(0, 0, 1)).normalize();
      const Lb = (0.35 + 2.3 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.8)) * U;
      for (const q of [1, -1]) bar(an.glow, p, p.clone().addScaledVector(sd, q * Lb * 0.82).addScaledVector(tg, Lb * 0.57), 0.1 * U, c.light, 0.8);
    }
    an.glow.ico(0.32 * U, 0, mat(pts[8].x, pts[8].y, pts[8].z), pale(c.second, 0.4), 1);
    ants.push({ an, sx });
  }
  // the wings, each on its hinge along the body
  const fo = foreSpec(P, U), hi = hindSpec(P, U), wings = [];
  for (const sx of [1, -1]) {
    const wf = body.sub(sx * 1.3 * U, 3.6 * U, 0.75 * U), wh = body.sub(sx * 1.2 * U, 1.4 * U, 0.05 * U);
    wing(wf, fo, sx, c, U);
    wing(wh, hi, sx, c, U);
    wings.push({ w: wf, o: fo, sx, hind: 0 }, { w: wh, o: hi, sx, hind: 1 });
  }
  // the beat: open and at rest, closing, closed a moment, opening (the hind pair always a
  // little less far than the fore pair lying over it, so that they never cross)
  const thO = 0.2, thC = 1.26;
  const beat = (x) => { x -= Math.floor(x); return x < 0.42 ? 0 : x < 0.62 ? smoothstep(0.42, 0.62, x) : x < 0.7 ? 1 : 1 - smoothstep(0.7, 1, x); };
  const angle = (x, hind) => (hind ? thO * 0.8 + (thC - thO) * 0.9 * beat(x) : thO + (thC - thO) * beat(x));
  // the scales: each leaves its place on a wing at its moment of the beat (half of them as
  // the wings close), is flung outward, and falls; then it is another, from the same place
  const n = lesser(k, art, mini) ? Math.min(P.scales, 280) : P.scales, floorAt = mini ? null : groundGrid(art, 40 * S);
  const sets = [c.light, c.second].map((col) => {
    const m = Math.floor(n / 2), cl = cloud(art, k.group, m, pale(col, 0.25), 1.05 * U, 1.2);
    cl.p.geometry.boundingBox = new THREE.Box3();      // (it is hung by its body and wings, not by what falls from them)
    const q = Array.from({ length: m }, () => {
      const wg = wings[(R() < 0.5 ? 0 : 2) + (R() < 0.62 ? 0 : 1)];
      const x = R() < 0.5 ? R.range(0.43, 0.66) : R();
      const a = -wg.sx * angle(x, wg.hind), ca = Math.cos(a), sa = Math.sin(a), pl = wingAt(wg.o, wg.sx, R(), Math.sqrt(R()), U);
      const bx = pl.x * ca + pl.z * sa, bz = -pl.x * sa + pl.z * ca, hl = Math.hypot(bx, bz) || 1, sp = R.range(0.8, 2.2) * U;
      const tl = tilt0 + 0.05 * beat(x), ct = Math.cos(tl), st = Math.sin(tl);
      const py = wg.w.group.position.y + pl.y, pz = wg.w.group.position.z + bz, vy = 0.15, vz = bz / hl - 0.5;
      const m2 = mini ? R.int(1, 2) : R.int(3, 4);
      return { px: wg.w.group.position.x + bx, py: bodyY + py * ct - pz * st + 0.6 * U * beat(x), pz: py * st + pz * ct, vx: (bx / hl) * sp, vy: (vy * ct - vz * st) * sp, vz: (vy * st + vz * ct) * sp,
        x, m: m2, k: R.int(0, m2 - 1), ph: R() * TAU, fall: (mini ? R.range(0.25, 0.45) : R.range(1.1, 1.7)) * U, tv: R.range(1.8, 3.2), a: 0.5 + 0.5 * R() };
    });
    return { cl, al: cl.p.geometry.attributes.aAlpha, q };
  });
  const step = (t) => {
    const x = t / T, b = beat(x);
    // (it shivers now and then while it rests open, as they do to warm themselves)
    const shiver = 0.02 * Math.pow(Math.max(0, Math.sin(t * 0.41)), 4) * Math.sin(t * 19) * (1 - b);
    for (const wg of wings) wg.w.group.rotation.y = -wg.sx * (angle(x, wg.hind) + shiver);
    body.group.rotation.x = tilt0 + 0.05 * b;
    turn.group.rotation.y = yaw0 + t * yawRate;
    turn.group.position.y = H + 0.6 * U * b + Math.sin(t * 0.5) * 0.4 * U;
    for (const { an, sx } of ants) an.group.rotation.set(Math.sin(t * 0.9 + sx) * 0.07 + 0.08 * b, 0, sx * (Math.sin(t * 0.7) * 0.06 - 0.1 * b));
    for (const s of sets) {
      const p = s.cl.pos, al = s.al.array;
      for (let i = 0; i < s.q.length; i++) {
        const q = s.q[i];
        let cyc = (x - q.k - q.x) % q.m;
        if (cyc < 0) cyc += q.m;
        const age = cyc * T, life = q.m * T, ya = yaw0 + (t - age) * yawRate, cy = Math.cos(ya), sy = Math.sin(ya);
        const e = q.tv * (1 - Math.exp(-age / q.tv)), lx = q.px + q.vx * e, lz = q.pz + q.vz * e, g = Math.min(1, age / 4);
        const X = lx * cy + lz * sy + Math.sin(age * 1.1 + q.ph) * 0.9 * U * g, Z = -lx * sy + lz * cy + Math.cos(age * 0.9 + q.ph * 1.7) * 0.9 * U * g;
        let Y = H + q.py + q.vy * e - q.fall * age;
        if (floorAt) Y = Math.max(Y, floorAt(X, Z) + 0.3);
        p[i * 3] = X; p[i * 3 + 1] = Y; p[i * 3 + 2] = Z;
        al[i] = q.a * Math.min(1, age / 0.8) * (1 - smoothstep(0.8, 1, age / life)) * (0.75 + 0.25 * Math.sin(age * 5 + q.ph));
      }
      s.cl.attr.needsUpdate = true;
      s.al.needsUpdate = true;
    }
  };
  step(0);
  art.updates.push(step);
  return { light: V3(0, H + 2 * U, 0), focus: V3(0, H, 0), span: 18.5 * U, height: H + 17 * U, solid: 13 * U, low: H - 16 * U };
}

// ------------------------------------------------------------------ DANDELION
// A seed-head: a sphere of fine filaments from one lit core, set at the golden angle, each
// a seed, a long beak and a parasol of light. A wind that is not there passes over it in
// waves and the filaments lean; one by one the seeds let go, right themselves under their
// parasols and drift off downwind, most of them rising, and fade; another grows where each
// was. They go sooner when the ship is near. Standing: a slender stem, a rosette of leaves.
function dandelion(k, P, S, art, mini) {
  const R = art.R, c = art.pal, U = S;
  const Rh = 11.5 * U, Rc = 2 * U, Hc = mini ? 0 : 33 * S, g0 = mini ? 0 : art.ground(0, 0);
  const N = lesser(k, art, mini) ? Math.min(P.seeds, 377) : P.seeds;
  if (!mini) {
    const bow = R.range(-1, 1) * 3 * U, bow2 = R.range(-1, 1) * 1.2 * U, pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(V3(Math.sin(t * Math.PI) * bow, g0 - 0.5 + t * (Hc - Rc * 0.5 - g0 + 0.5), Math.sin(t * TAU) * bow2)); }
    k.shell.tube(pts, (t) => (0.8 - 0.32 * t) * U, 7, (t) => mixHex(c.shellLo, c.shellHi, t));
    const nl = R.int(6, 8);
    for (let i = 0; i < nl; i++) petal(k.shell, R.range(9, 13) * U, R.range(1, 1.4) * U, R.range(1.18, 1.34), (i / nl) * TAU + R() * 0.4, 0.5 * U, g0 + 0.3, 0.35, -0.13, c.shellLo, c.shellHi, 6, 2, { b: k.glow, color: c.third }, 0.07 * U);
  }
  // the core, and the bracts turned back under it
  const head = k.sub(0, Hc, 0);
  head.lit.ico(Rc, 1, null, c.second, PULSE);
  head.glow.ico(Rc * 1.7, 1, null, pale(c.light, 0.4), 0.3);
  for (let i = 0; i < 11; i++) petal(head.shell, 3.6 * U, 0.75 * U, 2.45, (i / 11) * TAU, Rc * 0.5, -Rc * 0.75, 0.4, -0.12, c.shellLo, c.shellHi, 4, 2);
  // one seed, along +y from its foot: the seed itself, its beak, its parasol (a shallow cone,
  // bright at its heart, ribbed)
  const Rb = Rc * 0.9, Ls = Rh - Rb, hP = 0.85 * U, rP = clamp(22 / Math.sqrt(N), 1, 1.8) * U, tp = [], ta = [], tc = [];
  const push = (x, y, z, a, ci) => { tp.push(x, y, z); ta.push(a); tc.push(ci); };
  const blade = (ya, yb, hw, aa, ab, ci) => {
    for (const [ex, ez] of [[1, 0], [0, 1]]) {
      const q = [[-hw, ya, aa], [hw, ya, aa], [hw, yb, ab], [-hw, yb, ab]];
      for (const i of [0, 1, 2, 0, 2, 3]) push(q[i][0] * ex, q[i][1], q[i][0] * ez, q[i][2], ci);
    }
  };
  blade(0, 0.12 * Ls, 0.17 * U, 0.65, 0.65, 1);
  blade(0.12 * Ls, Ls - hP, 0.055 * U, 0.6, 0.45, 0);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU, ar = i % 2 ? 0.34 : 0.14;
    push(0, Ls - hP, 0, 0.8, 0); push(Math.cos(a0) * rP, Ls, Math.sin(a0) * rP, ar, 2); push(Math.cos(a1) * rP, Ls, Math.sin(a1) * rP, ar, 2);
  }
  const NV = ta.length, { g, pos, col, em } = liveGeo(N * NV);
  lightMesh(art, head.group, g, 0.9);
  const tips = cloud(art, head.group, N, pale(c.light, 0.45), 1.25 * U, 1.1), tipA = tips.p.geometry.attributes.aAlpha;
  // (it is hung by its head, not by the seeds adrift)
  g.boundingBox = new THREE.Box3(V3(-Rh, -Rh, -Rh), V3(Rh, Rh, Rh));
  tips.p.geometry.boundingBox = new THREE.Box3();
  // the seeds: where each stands on the core, how large, how it flies; what it is doing now
  // (0 held, 1 adrift, 2 growing) and for how long
  const D = new Float32Array(N * 3), E = new Float32Array(N * 3), Q = new Float32Array(N), FL = new Float32Array(N), H1 = new Float32Array(N), H2 = new Float32Array(N), A0 = new Float32Array(N);
  const ST = new Uint8Array(N), TM = new Float32Array(N), CY = new Uint16Array(N);
  const GROW = 7, WAIT = 260, cc = new THREE.Color(), cset = [pale(c.light, 0.35), c.second, 0];
  for (let j = 0; j < N; j++) {
    const u = 1 - (1.9 * (j + 0.5)) / N, rr = Math.sqrt(1 - u * u), a = j * GOLDEN, d = V3(Math.cos(a) * rr, u, Math.sin(a) * rr);
    const e = V3().crossVectors(d, Math.abs(u) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).normalize();
    D.set([d.x, d.y, d.z], j * 3); E.set([e.x, e.y, e.z], j * 3);
    Q[j] = R.range(0.92, 1); FL[j] = R.range(12, 16); H1[j] = R(); H2[j] = R(); A0[j] = 0.55 + 0.45 * R();
    const hh = R();
    if (hh < 0.05) { ST[j] = 1; TM[j] = R() * FL[j] * 0.9; } else if (hh < 0.08) { ST[j] = 2; TM[j] = R() * GROW; } else TM[j] = R() * WAIT * 1.7;
    cset[2] = [c.light, c.third, c.second][j % 3];
    for (let v = 0; v < NV; v++) { cc.setHex(cset[tc[v]]); col.set([cc.r, cc.g, cc.b], (j * NV + v) * 3); }
  }
  const wa = P.wind, Wx = Math.cos(wa), Wz = Math.sin(wa), Cx = -Wz, Cz = Wx;
  const step = (t, dt, ctx) => {
    const rate = 1 + 6 * nearOf(ctx), gph = t * 0.6 + 0.7 * Math.sin(t * 0.23), tpos = tips.pos, tal = tipA.array;
    for (let j = 0; j < N; j++) {
      const j3 = j * 3, dx = D[j3], dy = D[j3 + 1], dz = D[j3 + 2];
      let st = ST[j], tm = TM[j];
      if (st === 0) { tm -= dt * rate; if (tm <= 0) { st = 1; tm = 0; } }
      else if (st === 1) { tm += dt; if (tm >= FL[j]) { st = 2; tm = 0; } }
      else { tm += dt; if (tm >= GROW) { st = 0; CY[j]++; tm = WAIT * (0.3 + 1.4 * hash3(j, CY[j], 3.7)); } }
      ST[j] = st; TM[j] = tm;
      // the wind's wave over the head: how far this one leans
      const gw = 0.5 + 0.5 * Math.sin(gph - 2.2 * (dx * Wx + dz * Wz)), bend = 0.04 + 0.13 * gw * gw, tr = 0.02 * Math.sin(t * 2.1 + j);
      let ox = dx * Rb, oy = dy * Rb, oz = dz * Rb, sc = Q[j], fade = 1, spin = 0;
      let ax = dx + Wx * bend + Cx * tr, ay = dy, az = dz + Wz * bend + Cz * tr, an = 1 / (Math.hypot(ax, ay, az) || 1);
      ax *= an; ay *= an; az *= an;
      if (st === 1) {
        // adrift. Its parasol carries it: out along the filament, then with the wind, rising
        // (those from the underside are lifted round the head); the seed swings down under
        // the parasol and hangs there, rocking
        const a = tm, h1 = H1[j], h2 = H2[j], len = Ls * sc, under = Math.max(0, -dy);
        const out = 5 * U * (1 - 0.6 * under) * (1 - Math.exp(-a / 1.8)), dr = (1.2 + 0.6 * h1) * U * (a + 1.5 * (Math.exp(-a / 1.5) - 1));
        const sw = 1.6 * U * Math.sin(a * 0.4 + h2 * TAU) * Math.min(1, a / 4);
        const tx = ox + ax * len + dx * out + Wx * dr + Cx * sw, tz = oz + az * len + dz * out + Wz * dr + Cz * sw;
        const ty = oy + ay * len + dy * out + under * 9 * U * (1 - Math.exp(-a / 2.5)) + (0.5 * h2 - 0.05) * U * a + U * Math.sin(a * 0.55 + h1 * TAU) * Math.min(1, a / 3);
        const kk = smoothstep(0, 3.2, a), pend = 0.14 * Math.sin(a * 1.3 + h1 * 9), mid = 1.2 * kk * (1 - kk);
        ax = ax * (1 - kk) + (pend * Cx - 0.2 * Wx) * kk + Wx * mid;
        ay = ay * (1 - kk) + kk;
        az = az * (1 - kk) + (pend * Cz - 0.2 * Wz) * kk + Wz * mid;
        an = 1 / (Math.hypot(ax, ay, az) || 1);
        ax *= an; ay *= an; az *= an;
        ox = tx - ax * len; oy = ty - ay * len; oz = tz - az * len;
        fade = 1 - smoothstep(0.6, 1, a / FL[j]);
        spin = a * 0.45;
      } else if (st === 2) sc *= smoothstep(0, GROW, tm);
      // two more axes square to it
      let bx = E[j3], by = E[j3 + 1], bz = E[j3 + 2], dd = bx * ax + by * ay + bz * az;
      bx -= dd * ax; by -= dd * ay; bz -= dd * az;
      let bl = Math.hypot(bx, by, bz);
      if (bl < 0.2) {
        bx = dy * E[j3 + 2] - dz * E[j3 + 1]; by = dz * E[j3] - dx * E[j3 + 2]; bz = dx * E[j3 + 1] - dy * E[j3];
        dd = bx * ax + by * ay + bz * az;
        bx -= dd * ax; by -= dd * ay; bz -= dd * az;
        bl = Math.hypot(bx, by, bz) || 1;
      }
      bx /= bl; by /= bl; bz /= bl;
      let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      if (spin) {
        const cs = Math.cos(spin), sn = Math.sin(spin), b0 = bx, b1 = by, b2 = bz;
        bx = b0 * cs + cx * sn; by = b1 * cs + cy * sn; bz = b2 * cs + cz * sn;
        cx = cx * cs - b0 * sn; cy = cy * cs - b1 * sn; cz = cz * cs - b2 * sn;
      }
      let o = j * NV * 3;
      const e0 = j * NV;
      for (let v = 0; v < NV; v++) {
        const x = tp[v * 3] * sc, y = tp[v * 3 + 1] * sc, z = tp[v * 3 + 2] * sc;
        pos[o++] = ox + x * bx + y * ax + z * cx;
        pos[o++] = oy + x * by + y * ay + z * cy;
        pos[o++] = oz + x * bz + y * az + z * cz;
        em[e0 + v] = Math.max(0.0001, ta[v] * fade);
      }
      const yt = (Ls - hP * 0.5) * sc;
      tpos[j3] = ox + ax * yt; tpos[j3 + 1] = oy + ay * yt; tpos[j3 + 2] = oz + az * yt;
      tal[j] = A0[j] * fade * (st === 2 ? sc / Q[j] : 1);
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.emissive.needsUpdate = true;
    tips.attr.needsUpdate = true;
    tipA.needsUpdate = true;
  };
  step(0, 0, null);
  art.updates.push(step);
  return { light: V3(0, Hc, 0), focus: V3(0, mini ? 0 : Hc * 0.85, 0), span: Rh * 1.2, height: Hc + Rh + U, solid: Rh * 0.5, low: mini ? Hc - Rh : 0 };
}

// ------------------------------------------------------------------ PAGES
// A storm of pages: thousands of small blank plates of shell going up round a column of
// light, most of them along the arms of a rising spiral, each turning over and over as it
// goes; waves of light climb the column and the pages they pass are lit, and any page that
// faces the column squarely flashes. Outside the storm a few larger sheets hang open and
// still, a small light before each, as if being read. Standing, they lift off a drift of
// pages lying about the column's foot.
function pages(k, P, S, art, mini) {
  const R = art.R, c = art.pal, less = lesser(k, art, mini), U = S * (less ? 0.55 : mini ? 0.7 : 1);
  const Hc = 46 * U * (mini ? 1.12 : 1), y0 = mini ? -Hc / 2 : art.ground(0, 0);
  const funnel = (u) => (3 + 9.5 * Math.pow(u, 1.25) + 4 * Math.pow(Math.max(0, (u - 0.8) / 0.2), 2)) * U;
  // the column, a bright thread in it, a light at its head
  bar(k.glow, V3(0, y0, 0), V3(0, y0 + Hc, 0), 1.3 * U, pale(c.light, 0.35), 0.5);
  bar(k.glow, V3(0, y0, 0), V3(0, y0 + Hc, 0), 0.5 * U, 0xffffff, 1);
  k.glow.ico(1.5 * U, 1, mat(0, y0 + Hc, 0), pale(c.light, 0.5), 0.9);
  if (mini) k.glow.ico(1.1 * U, 1, mat(0, y0, 0), pale(c.light, 0.5), 0.9);
  else {
    // its foot, and the drift of pages lying about it along the spiral's arms
    k.stone.cyl(2.6 * U, 3.6 * U, 1.4 * U, 10, mat(0, y0 + 0.5 * U, 0), c.stone[2]);
    k.lit.add(new THREE.TorusGeometry(2.9 * U, 0.16 * U, 4, 24), mat(0, y0 + 1.2 * U, 0, Math.PI / 2, 0, 0), c.light, PULSE);
    for (let i = 0; i < 220; i++) {
      const rr = (3.6 + 12 * Math.pow(R(), 1.4)) * U, a = ((i % P.arms) * TAU) / P.arms - rr / (5 * U) + (R() - 0.5) * 0.9;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = art.ground(x, z) + 0.12 + 0.5 * U * R() * Math.max(0, 1 - rr / (9 * U));
      const ya = R() * TAU, hw = R.range(0.6, 0.9) * U, hh = hw * 1.4, tx = R.range(-0.12, 0.12), tz = R.range(-0.12, 0.12);
      const ax = Math.cos(ya) * hw, ay = tx * hw, az = Math.sin(ya) * hw, bx = -Math.sin(ya) * hh, by = tz * hh, bz = Math.cos(ya) * hh;
      k.shell.quad([x - ax - bx, y - ay - by, z - az - bz], [x + ax - bx, y + ay - by, z + az - bz], [x + ax + bx, y + ay + by, z + az + bz], [x - ax + bx, y - ay + by, z - az + bz], pale(c.shellHi, 0.15 + 0.35 * R()));
    }
  }
  // the ones that hang still: a sheet folded once and held open toward the column, leaning
  // back, a small light before it
  const nStill = less ? Math.min(P.still, 4) : P.still, lamps = [];
  for (let i = 0; i < nStill; i++) {
    const us = 0.2 + 0.58 * ((i * 0.618034 + 0.3) % 1), a = i * GOLDEN + R() * 0.5, rr = funnel(us) * 1.15 + R.range(6, 9) * U;
    const m = mat(Math.cos(a) * rr, y0 + us * Hc, Math.sin(a) * rr, -0.28, Math.atan2(-Math.cos(a), -Math.sin(a)), R.range(-0.12, 0.12));
    const w = R.range(2.4, 3.1) * U, hh = w * 1.42, fold = R.range(0.18, 0.4), col = pale(c.shellHi, 0.35);
    const at = (sd, x, y) => V3(sd * x * Math.cos(fold), y, x * Math.sin(fold) + (0.1 * x * x) / w).applyMatrix4(m).toArray();
    for (const sd of [1, -1]) for (let q = 0; q < 3; q++) k.shell.quad(at(sd, (q * w) / 3, -hh / 2), at(sd, ((q + 1) * w) / 3, -hh / 2), at(sd, ((q + 1) * w) / 3, hh / 2), at(sd, (q * w) / 3, hh / 2), col, 0.3);
    const lamp = V3(0, hh * 0.62, 2.2 * U).applyMatrix4(m);
    k.glow.ico(0.38 * U, 1, mat(lamp.x, lamp.y, lamp.z), pale(c.second, 0.5), 1);
    lamps.push(lamp);
  }
  // the storm: one geometry, every plate two triangles, rewritten every frame
  const N = less ? Math.min(P.pages, 2400) : P.pages, { g, pos, col, em } = liveGeo(N * 6);
  const mesh = new THREE.Mesh(g, art.mats.shell);
  mesh.frustumCulled = false;
  k.group.add(mesh);
  const ph = new Float32Array(N), sp = new Float32Array(N), rho = new Float32Array(N), a0 = new Float32Array(N), hw = new Float32Array(N), hh = new Float32Array(N);
  const al0 = new Float32Array(N), wa = new Float32Array(N), be0 = new Float32Array(N), wb = new Float32Array(N), cc = new THREE.Color();
  for (let i = 0; i < N; i++) {
    ph[i] = R(); sp[i] = R.range(0.02, 0.034);
    if (R() < 0.8) { a0[i] = (R.int(0, P.arms - 1) * TAU) / P.arms + (R() + R() + R() - 1.5) * 0.5; rho[i] = R.range(0.75, 1.1); } else { a0[i] = R() * TAU; rho[i] = R.range(0.35, 1.2); }
    hw[i] = R.range(0.4, 0.78) * U; hh[i] = hw[i] * R.range(1.3, 1.5);
    al0[i] = R() * TAU; wa[i] = R.range(0.3, 1.4) * (R() < 0.5 ? -1 : 1); be0[i] = R() * TAU; wb[i] = R.range(0.4, 1.8) * (R() < 0.5 ? -1 : 1);
    cc.setHex(R() < 0.2 ? mixHex(c.shellHi, c.shellLo, 0.5) : pale(c.shellHi, 0.15 + 0.4 * R()));
    for (let v = 0; v < 6; v++) col.set([cc.r, cc.g, cc.b], (i * 6 + v) * 3);
  }
  // sparks going up the column's heart, and the two lights that climb it
  // (the last points of the cloud are the still pages' lights, large and soft)
  const ns = less ? 160 : 420, sparks = cloud(art, k.group, ns + lamps.length, pale(c.light, 0.3), 0.9 * U, 1.1);
  lamps.forEach((l, i) => { sparks.pos.set([l.x, l.y, l.z], (ns + i) * 3); sparks.p.geometry.attributes.aSize.array[ns + i] = 4.5; sparks.p.geometry.attributes.aAlpha.array[ns + i] = 0.9; });
  const sq = Array.from({ length: ns }, () => [R(), 0.6 + R() * 0.9, R() * TAU, R()]);
  const orbs = [0, 1].map((i) => { const o = k.sub(0, y0, 0); o.glow.ico(1.7 * U, 1, null, pale(i ? c.second : c.light, 0.45), 0.9); return o; });
  const twist = P.turns * TAU, om = 0.55, wv = 4.5 * U;
  const step = (t) => {
    const yw = [0, 1].map((i) => y0 + Hc * ((((t * 0.085 + i * 0.5) % 1) + 1) % 1 * 1.3 - 0.15));
    orbs.forEach((o, i) => { o.group.position.y = clamp(yw[i], y0, y0 + Hc); o.group.scale.setScalar(Math.max(0.001, clamp(Math.min(yw[i] - y0, y0 + Hc - yw[i]) / (3 * U), 0, 1))); });
    const breathe = 1 + 0.06 * Math.sin(t * 0.3);
    for (let i = 0, o = 0; i < N; i++) {
      const u = (((ph[i] + t * sp[i]) % 1) + 1) % 1, s = Math.min(1, u / 0.07, (1 - u) / 0.13);
      const rr = (3 + 9.5 * Math.pow(u, 1.25) + (u > 0.8 ? 100 * (u - 0.8) * (u - 0.8) : 0)) * U * rho[i] * breathe;
      const th = a0[i] - twist * u + om * t, ct = Math.cos(th), sn = Math.sin(th);
      const x = ct * rr, y = y0 + u * Hc + Math.sin(t * 0.9 + i) * 0.5 * U, z = sn * rr;
      const al = al0[i] + wa[i] * t, be = be0[i] + wb[i] * t, ca = Math.cos(al), sa = Math.sin(al), cb = Math.cos(be), sb = Math.sin(be);
      const w = hw[i] * s, h = hh[i] * s, ax = ca * w, az = sa * w, bx = -sa * sb * h, by = cb * h, bz = ca * sb * h;
      pos[o] = x - ax - bx; pos[o + 1] = y - by; pos[o + 2] = z - az - bz;
      pos[o + 3] = x + ax - bx; pos[o + 4] = y - by; pos[o + 5] = z + az - bz;
      pos[o + 6] = x + ax + bx; pos[o + 7] = y + by; pos[o + 8] = z + az + bz;
      pos[o + 9] = pos[o]; pos[o + 10] = pos[o + 1]; pos[o + 11] = pos[o + 2];
      pos[o + 12] = pos[o + 6]; pos[o + 13] = pos[o + 7]; pos[o + 14] = pos[o + 8];
      pos[o + 15] = x - ax + bx; pos[o + 16] = y + by; pos[o + 17] = z - az + bz;
      o += 18;
      // its light: the waves that pass it, and the flash when it faces the column
      const d0 = (y - yw[0]) / wv, d1 = (y - yw[1]) / wv, w0 = 1 / (1 + d0 * d0), w1 = 1 / (1 + d1 * d1);
      let gl = cb * (sn * ca - ct * sa);
      gl *= gl; gl *= gl; gl *= gl;
      const e = Math.min(1.45, 0.05 + 0.85 * (w0 * w0 + w1 * w1) + 0.6 * gl);
      for (let v = 0, q = i * 6; v < 6; v++) em[q + v] = e;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.emissive.needsUpdate = true;
    for (let i = 0; i < ns; i++) {
      const [p0, v, a, r0] = sq[i], u = (((p0 + t * 0.05 * v) % 1) + 1) % 1, ang = a + t * 1.2 * v, rr = (0.7 + 2.3 * r0) * U * (1 + 1.5 * u);
      sparks.pos[i * 3] = Math.cos(ang) * rr; sparks.pos[i * 3 + 1] = y0 + u * Hc; sparks.pos[i * 3 + 2] = Math.sin(ang) * rr;
    }
    sparks.attr.needsUpdate = true;
  };
  step(0);
  art.updates.push(step);
  return { light: V3(0, y0 + Hc * 0.55, 0), focus: V3(0, y0 + Hc * 0.5, 0), span: 19 * U, height: y0 + Hc + 2 * U, solid: 8 * U, low: mini ? y0 : 0 };
}

// ------------------------------------------------------------------ what each is, and how it grows with depth
export const NEW_FORMS = {
  planet: {
    code: 'PLN', cls: 'Ringed world', nouns: ['World', 'Planet', 'Orbit', 'Wanderer', 'Sphere', 'Ring-world'], set: 'any', from: 3,
    params(R, depth) {
      const rings = Math.min(7, Math.max(3, 3 + Math.floor((depth - 3) / 2) + (R() < 0.4 ? 1 : 0)));
      const moons = Math.min(rings + 1, 6, Math.max(1, Math.floor(depth / 2)) + R.int(0, 1));
      const motes = Math.min(7200, 2400 + depth * 420);
      const tilt = R.range(0.3, 0.5) * (R() < 0.5 ? -1 : 1);
      return { rings, moons, motes, tilt,
        text: `A dark banded world hanging tilted in the air, ${num(rings)} rings about it, ${motes.toLocaleString('en-US')} motes in all, each ring turning at its own speed, the inner ones faster; ${moons === 1 ? 'a moon of light keeps' : `${num(moons)} moons of light keep`} the gaps between them.` };
    },
    build: planet,
  },
  moth: {
    code: 'MTH', cls: 'Moth', nouns: ['Moth', 'Emperor', 'Night-flier', 'Wing', 'Visitor', 'Imago'], set: 'autumn', from: 1,
    params(R, depth) {
      const eyes = Math.min(4, 2 + Math.floor(depth / 4));
      const veins = Math.min(10, 6 + Math.floor(depth / 2));
      const scales = Math.min(560, 180 + depth * 36);
      const segments = Math.min(10, 6 + Math.floor(depth / 3));
      const barbs = Math.min(18, 10 + depth);
      const tails = depth >= 3 && R() < 0.5;
      const period = R.range(8.5, 11.5);
      return { eyes, veins, scales, segments, barbs, tails, period,
        text: `A moth of light the size of a house, hanging in the air, its four wings opening and closing slowly${tails ? ', the hind pair drawn out into tails' : ''}; on each wing an eyespot of ${num(eyes)} circles; scales of light fall from them at every beat.` };
    },
    build: moth,
  },
  dandelion: {
    code: 'DND', cls: 'Seed-head', nouns: ['Seed-head', 'Dandelion', 'Clock', 'Pappus', 'Globe', 'Dispersal'], set: 'any', from: 1,
    params(R, depth) {
      const seeds = [144, 233, 377, 610][Math.min(3, Math.floor((depth + 1) / 3.5))];
      return { seeds, wind: R() * TAU,
        text: `A seed-head as wide as a house: ${seeds} filaments from one core, set at the golden angle, each tipped with a parasol of light. Its seeds let go one by one and drift off on the air, and others grow in their place.` };
    },
    build: dandelion,
  },
  pages: {
    code: 'PGS', cls: 'Storm of pages', nouns: ['Pages', 'Archive', 'Leaves', 'Storm', 'Library', 'Manuscript'], set: 'any', from: 3,
    params(R, depth) {
      const count = Math.min(6000, 1800 + depth * 420);
      const arms = R.pick([2, 3, 3, 5]);
      const still = Math.min(9, 3 + Math.floor(depth / 2));
      const turns = R.range(1.4, 2);
      return { pages: count, arms, still, turns,
        text: `${count.toLocaleString('en-US')} blank pages circling a column of light in ${num(arms)} rising spirals, turning as they go, lit in waves. ${Num(still)} hang open and still in the air, as if being read.` };
    },
    build: pages,
  },
};
