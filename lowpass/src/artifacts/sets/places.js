import * as THREE from 'three';
import { Builder, mat, mul, roughen } from '../../render/build.js';
import { glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp, lerp, smoothstep, formatInt } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam, slab } from '../parts.js';

// Places somebody built and left: memory, patience, geometry. Eight wild artifacts of the
// forest at large.
//   labyrinth     one path wound into circuits of low walls; a light walks it in, paying
//                 out a thread, and walks out again taking it up
//   well          a ring wall round a shaft, a wheel over it; lights are drawn up out of
//                 the dark one by one, and let go
//   archive       standing tablets scored with the rows of an automaton (or the primes);
//                 a light reads them, a row to the beat
//   amphitheatre  stepped rings open to one side, lights seated on them in Fibonacci
//                 counts about one on the floor; when it speaks, they answer ring by ring
//   aqueduct      a run of arches broken off at one end; the light in its channel pours
//                 from the break to a pool on the ground
//   garden        boulders on a level bed, raked lines of faint light about them; ripples
//                 go out from one boulder at a time
//   belljars      glass jars on a table of stone, a flame or a seedling of light in each
//                 but one, leaning after the ship
//   tensegrity    a mast of struts that touch nothing, held in the air by cables of light

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-one'];
const numw = (n) => (NUMW[n] || String(n)).toLowerCase();
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth'];
const DARK = 0.004;          // a glow's alpha of exactly 0 reads as 1 (materials.js): this is "off"
const BLACK = 0x05070a;

// ------------------------------------------------------------------ light
// (the pattern of instruments.js: every material of light is kept in fx and its opacity
// set each update; k is a part's own brightness, for update to move)
function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  const e = { m, o: opacity, k: 1 };
  fx.push(e);
  mesh.userData.fx = e;
  return mesh;
}
function lightPoints(n, fx, color, size, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  const e = { m, o: opacity, k: 1 };
  fx.push(e);
  const points = new THREE.Points(g, m);
  points.layers.set(LAYER_FX);
  points.frustumCulled = false;
  return { points, pos, sz, al, g, e };
}
function finish(out, fx, update) {
  return {
    ...out,
    mats: fx.map((e) => e.m),
    update(t, beat, c) {
      c = c || {};
      if (update) update(t, beat ?? t * 1.6, c);
      const k = (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      for (const e of fx) e.m.uniforms.uOpacity.value = e.o * e.k * k;
    },
  };
}
// Lines of light: quads laid once, each lit by itself afterwards (its alpha is the
// emissive attribute).
class Strips {
  constructor() { this.p = []; this.n = 0; }
  quad(a, b, c, d) {
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    return this.n++;
  }
  // a ribbon from p0 to p1, w wide, lying flat
  flat(p0, p1, w) {
    const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1, nx = ((-dz / l) * w) / 2, nz = ((dx / l) * w) / 2;
    return this.quad(V(p0.x - nx, p0.y, p0.z - nz), V(p0.x + nx, p0.y, p0.z + nz), V(p1.x + nx, p1.y, p1.z + nz), V(p1.x - nx, p1.y, p1.z - nz));
  }
  // the same on edge, h tall
  up(p0, p1, h) {
    return this.quad(V(p0.x, p0.y, p0.z), V(p0.x, p0.y + h, p0.z), V(p1.x, p1.y + h, p1.z), V(p1.x, p1.y, p1.z));
  }
  mesh(fx, opacity, tint) {
    const g = new THREE.BufferGeometry(), nv = this.n * 6;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3).fill(1), 3));
    this.em = new Float32Array(nv).fill(DARK);
    this.attr = new THREE.BufferAttribute(this.em, 1);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('emissive', this.attr);
    const m = lightMesh(g, fx, opacity);
    m.material.uniforms.uTint.value.setHex(tint);
    return m;
  }
  set(q, a) { this.em.fill(a > DARK ? a : DARK, q * 6, q * 6 + 6); }
  done() { this.attr.needsUpdate = true; }
}
// a column of light, brightest at its foot
function column(r0, r1, y0, y1, a0 = 1, a1 = 0.04, seg = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 6, true);
  g.translate(0, (y0 + y1) / 2, 0);
  const n = g.attributes.position.count, em = new Float32Array(n);
  for (let i = 0; i < n; i++) em[i] = Math.max(DARK, lerp(a0, a1, Math.pow(clamp((g.attributes.position.getY(i) - y0) / (y1 - y0), 0, 1), 0.6)));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return g;
}

// ------------------------------------------------------------------ stone
// a quad (or a triangle) of stone facing the way n points, whatever order its corners
// come in
function face(b, p0, p1, p2, p3, n, color, em = 0) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  if (d >= 0) b.quad(p0, p1, p2, p3, color, em);
  else b.quad(p0, p3, p2, p1, color, em);
}
function faceTri(b, p0, p1, p2, n, color, em = 0) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const d = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  if (d >= 0) b.tri(p0, p1, p2, color, em);
  else b.tri(p0, p2, p1, color, em);
}
// the lowest and the highest ground within r of (x, z)
function groundSpan(g, r, x = 0, z = 0) {
  let lo = g(x, z), hi = lo;
  for (const k of [0.5, 1]) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + k, y = g(x + Math.cos(a) * r * k, z + Math.sin(a) * r * k);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return [lo, hi];
}

// ------------------------------------------------------------------ labyrinth
// One path and no choices. Its circuits (1 the outermost) are walked in a seeded order,
// every change of circuit made at the one axis, on alternate sides of it: the classical
// labyrinth is 3 2 1 4 7 6 5. Such an order can be built when the turnings on each side
// nest without crossing; a turning that lies inside another is made further from the axis.
const LAB_BLOCKS = [[1], [3, 2, 1], [3, 2, 1], [5, 2, 3, 4, 1], [3, 4, 5, 2, 1], [5, 4, 1, 2, 3], [5, 4, 3, 2, 1], [7, 6, 5, 4, 3, 2, 1]];
function labTurns(seq) {
  const n = seq.length, s = [0, ...seq, n + 1], con = [];
  for (let i = 0; i <= n; i++) con.push({ a: Math.min(s[i], s[i + 1]), b: Math.max(s[i], s[i + 1]), side: i % 2, from: s[i], to: s[i + 1], depth: 0 });
  for (const c of con) for (const o of con) {
    if (o === c || o.side !== c.side) continue;
    if (o.a < c.a && c.b < o.b) c.depth++;
    else if (!(c.a < o.a && o.b < c.b) && !(c.b < o.a || o.b < c.a)) return null;
  }
  return con;
}
function labSeq(R) {
  if (R.chance(0.3)) return [3, 2, 1, 4, 7, 6, 5];
  for (let tries = 0; tries < 60; tries++) {
    const n = R.int(7, 9), seq = [];
    let plain = 0;
    while (seq.length < n) {
      let blk = R.pick(LAB_BLOCKS);
      if (seq.length + blk.length > n) blk = LAB_BLOCKS[0];
      if (blk.length === 1) plain++;
      const o = seq.length;
      for (const v of blk) seq.push(o + v);
    }
    const con = labTurns(seq);
    if (con && plain <= 3 && Math.max(...con.map((c) => c.depth)) <= 2) return seq;
  }
  return [3, 2, 1, 4, 7, 6, 5];
}
// its plan, the axis along +z and the mouth at its end: the path (points, and the length
// walked to each), and its walls as arcs about the middle and straight pieces beside the axis
function labPlan(seq, across) {
  const n = seq.length, con = labTurns(seq);
  const DA = 1 + Math.max(...con.filter((c) => c.side === 0).map((c) => c.depth));
  const DB = 1 + Math.max(...con.filter((c) => c.side === 1).map((c) => c.depth));
  const c0 = Math.max(DA, DB) + 0.8, Ro = across / 2, w = Ro / (n + c0), r0 = c0 * w;
  const rho = (k) => r0 + (n - k) * w;           // the wall between circuit k and circuit k + 1 (0: the outer wall)
  const mid = (l) => r0 + (n - l + 0.5) * w;     // the middle of circuit l
  const xOf = (c) => (c.side ? -1 : 1) * (c.depth + 0.5) * w;
  const step = Math.max(1.1, across / 42);
  const raw = [[xOf(con[0]), Math.sqrt(Ro * Ro - xOf(con[0]) ** 2) + 1.8 * w]];
  for (let i = 0; i <= n; i++) {
    const c = con[i], x = xOf(c);
    if (c.to === n + 1) {
      const zc = Math.sqrt(r0 * r0 - x * x) * 0.6, l = Math.hypot(x, zc);
      raw.push([x, zc], [(x / l) * 1.1 * w, (zc / l) * 1.1 * w]);
      break;
    }
    // along the axis to the next circuit, then all the way round it to the other side
    const r = mid(c.to), nx = xOf(con[i + 1]);
    const f0 = c.side ? TAU - Math.asin(-x / r) : Math.asin(x / r);
    const f1 = c.side ? Math.asin(nx / r) : TAU - Math.asin(-nx / r);
    const m = Math.max(2, Math.ceil((Math.abs(f1 - f0) * r) / step));
    for (let j = 0; j <= m; j++) { const f = f0 + ((f1 - f0) * j) / m; raw.push([r * Math.sin(f), r * Math.cos(f)]); }
  }
  const pts = [raw[0]], cum = [0];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1], b = raw[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(l / step));
    for (let j = 1; j <= m; j++) { pts.push([lerp(a[0], b[0], j / m), lerp(a[1], b[1], j / m)]); cum.push(cum[cum.length - 1] + l / m); }
  }
  // the walls: every side of every cell of the plan that the path does not cross
  const M = DA + DB + 1, sec = (c) => (c.side ? DA + DB - c.depth : c.depth);
  const open = Array.from({ length: n + 1 }, () => new Array(M).fill(false));
  for (const c of con) for (let k = c.a; k < c.b; k++) open[k][sec(c)] = true;
  const ang = (j, r) => {
    if (j < DA) return [Math.asin((j * w) / r), Math.asin(((j + 1) * w) / r)];
    if (j === DA) return [Math.asin((DA * w) / r), TAU - Math.asin((DB * w) / r)];
    const p = DA + DB - j;
    return [TAU - Math.asin(((p + 1) * w) / r), TAU - Math.asin((p * w) / r)];
  };
  const arcs = [], lines = [{ x: 0, z0: r0, z1: Ro }];
  for (let k = 0; k <= n; k++) {
    const r = rho(k);
    let from = null;
    for (let j = 0; j <= M; j++) {
      const shut = j < M && !open[k][j];
      if (shut && from === null) from = ang(j, r)[0];
      if (!shut && from !== null) { arcs.push({ r, f0: from, f1: ang(j - 1, r)[1], k }); from = null; }
    }
  }
  for (let l = 1; l <= n; l++) {
    const i = seq.indexOf(l);                    // circuit l is come into by turning i and left by turning i + 1
    const lo = sec(con[i].side === 0 ? con[i] : con[i + 1]), hi = sec(con[i].side === 1 ? con[i] : con[i + 1]);
    for (let j = 0; j < M - 1; j++) {
      if (j >= lo && j < hi) continue;
      const x = j < DA ? (j + 1) * w : -(DA + DB - j) * w;
      lines.push({ x, z0: Math.sqrt(rho(l) ** 2 - x * x), z1: Math.sqrt(rho(l - 1) ** 2 - x * x) });
    }
  }
  return { n, w, r0, Ro, step, pts, cum, L: cum[cum.length - 1], arcs, lines, mouth: xOf(con[0]) };
}

function labyrinth(d, A, mats, ctx) {
  const P = d.params, S = d.size, g = ctx.ground, b = new Builder(), pl = labPlan(P.seq, P.across);
  const w = pl.w, th = Math.max(0.5 * S, w * 0.2), hW = P.wall, pale = mixHex(STONE[3], RIM, 0.3);
  // a piece of wall, following the ground, its top paler than its sides
  const wall = (x0, z0, x1, z1, color) => {
    const y0 = g(x0, z0), y1 = g(x1, z1), dx = x1 - x0, dz = z1 - z0, hl = Math.hypot(dx, dz), H = hW + 1.4;
    b.add(new THREE.BoxGeometry(th, H, hl + th * 0.6), mat((x0 + x1) / 2, (y0 + y1) / 2 + hW - H / 2, (z0 + z1) / 2, -Math.atan2(y1 - y0, hl), Math.atan2(dx, dz), 0), (x, y) => (y > H * 0.49 ? pale : color), 0, { flat: true });
  };
  for (const a of pl.arcs) {
    const seg = clamp((a.r * TAU) / 64, 1.6 * S, 4.5 * S), m = Math.max(1, Math.round(((a.f1 - a.f0) * a.r) / seg));
    for (let j = 0; j < m; j++) {
      const f = a.f0 + ((a.f1 - a.f0) * j) / m, e = a.f0 + ((a.f1 - a.f0) * (j + 1)) / m;
      wall(a.r * Math.sin(f), a.r * Math.cos(f), a.r * Math.sin(e), a.r * Math.cos(e), STONE[a.k % 2 ? 1 : 2]);
    }
  }
  for (const l of pl.lines) {
    const m = Math.max(1, Math.round((l.z1 - l.z0) / (3 * S)));
    for (let j = 0; j < m; j++) wall(l.x, lerp(l.z0, l.z1, j / m), l.x, lerp(l.z0, l.z1, (j + 1) / m), STONE[2]);
  }
  // two stones at its mouth, and the stone in the middle
  for (const q of [-0.5, 0.5]) {
    const x = pl.mouth + q * w, z = Math.sqrt(pl.Ro * pl.Ro - x * x) + 0.8 * S;
    slab(b, x, z, g(x, z) - 0.6, 1.5 * S, P.gate + 0.6, 1.2 * S, 0, 0, STONE[3]);
  }
  const y0 = g(0, 0);
  b.cyl(1.3 * S, 1.7 * S, 1.8, 8, mat(0, y0 - 0.3, 0), STONE[3]);
  const sg = new THREE.IcosahedronGeometry(0.95 * S, 0);
  roughen(sg, 0.22 * S, 7);
  b.add(sg, mat(0, y0 + 0.6 + 0.8 * S, 0, 0, 0.4, 0, 1, 1.25, 1), A, PULSE, { flat: true });
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the thread along the path, and the tops of the walls beside it, to be lit
  const pts = pl.pts.map(([x, z]) => V(x, g(x, z), z)), n = pts.length - 1;
  const st = new Strips(), walled = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, nx = ((-dz / l) * w) / 2, nz = ((dx / l) * w) / 2;
    st.flat(V(p.x, p.y + 0.15, p.z), V(q.x, q.y + 0.15, q.z), Math.max(0.35 * S, w * 0.14));
    for (const s of [-1, 1]) st.flat(V(p.x + nx * s, g(p.x + nx * s, p.z + nz * s) + hW + 0.3, p.z + nz * s), V(q.x + nx * s, g(q.x + nx * s, q.z + nz * s) + hW + 0.3, q.z + nz * s), th + 0.15);
    const rm = Math.hypot(p.x + q.x, p.z + q.z) / 2;
    walled.push(rm < pl.Ro - 0.1 && rm > pl.r0);
  }
  group.add(st.mesh(fx, 0.9, mixHex(A, 0xffffff, 0.25)));
  // the light that walks it
  const wb = new Builder();
  wb.ico(0.5 * S, 1, null, 0xffffff, 1);
  const walker = lightMesh(wb.build(), fx, 1);
  walker.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.5));
  const halo = lightPoints(1, fx, A, 5 * S, 1.1);
  group.add(walker, halo.points);
  // and what stands over the stone while it is there
  const top = y0 + P.beam, col = lightMesh(column(0.5 * S, 0.14 * S, y0 + 1.6 * S, top, 0.9, 0.03), fx, 0.5);
  col.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.2));
  group.add(col);
  const cum = pl.cum, L = pl.L, tin = L / P.speed, T = 2 * (tin + P.rest), win = Math.ceil((8 * w) / pl.step) + 2;
  const paint = (i, s) => {
    const dd = s - (cum[i] + cum[i + 1]) / 2;
    st.set(i * 3, dd > 0 ? 0.3 + 0.7 * Math.exp(-dd / (2.5 * w)) : 0);
    const a = walled[i] ? 0.95 * Math.max(0, Math.exp(-Math.abs(dd) / (2.2 * w)) - 0.03) : 0;
    st.set(i * 3 + 1, a);
    st.set(i * 3 + 2, a);
  };
  let last = -1;
  return finish({ group, light: V(0, y0 + 0.6 + 0.8 * S, 0), focus: V(0, y0 + 2 * S, 0), span: pl.Ro + 2 * w, clear: Math.min(95, pl.Ro + 2 * w + 6), height: top }, fx, (t) => {
    // in to the middle, a while there, out again, a while at the mouth
    const u = t % T;
    const s = u < tin ? u * P.speed : u < tin + P.rest ? L : u < 2 * tin + P.rest ? L - (u - tin - P.rest) * P.speed : 0;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m + 1] < s) lo = m + 1; else hi = m; }
    const from = last < 0 ? 0 : Math.max(0, Math.min(last, lo) - win), to = last < 0 ? n - 1 : Math.min(n - 1, Math.max(last, lo) + win);
    for (let i = from; i <= to; i++) paint(i, s);
    st.done();
    last = lo;
    const f = clamp((s - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]), 0, 1), p = pts[lo], q = pts[lo + 1];
    walker.position.set(lerp(p.x, q.x, f), lerp(p.y, q.y, f) + 1.2 * S + Math.sin(t * 1.7) * 0.15 * S, lerp(p.z, q.z, f));
    halo.pos[0] = walker.position.x; halo.pos[1] = walker.position.y; halo.pos[2] = walker.position.z;
    halo.g.attributes.position.needsUpdate = true;
    col.userData.fx.k = 0.15 + 0.85 * smoothstep(0.8, 1, s / L);
  });
}

// ------------------------------------------------------------------ well
function well(d, A, mats, ctx) {
  const P = d.params, S = d.size, g = ctx.ground, b = new Builder(), R = rng(d.seed[5]);
  const Rm = P.mouth, tw = 1.5 * S, Ro = Rm + tw, pale = mixHex(STONE[3], RIM, 0.28);
  const [, hi] = groundSpan(g, Rm), [lo] = groundSpan(g, Ro * 1.05);
  const yd = hi + 0.3, yTop = yd + P.wall, yFoot = lo - 1.2, hOut = yTop - yFoot, rows = Math.max(2, Math.round(hOut / (1.1 * S)));
  // the ring wall in courses, its inner face going down into the dark, and the dark
  b.add(new THREE.CylinderGeometry(Ro, Ro * 1.05, hOut, 28, rows, true), mat(0, (yTop + yFoot) / 2, 0), (x, y) => STONE[1 + (Math.floor((y / hOut + 0.5) * rows * 0.999) % 2)], 0, { flat: true });
  b.add(new THREE.CylinderGeometry(Rm, Rm, P.wall + 0.2, 28, 4, true), mat(0, yd + P.wall / 2, 0, 0, 0, 0, -1, 1, 1), (x, y) => mixHex(BLACK, STONE[2], clamp(y / P.wall + 0.5, 0, 1) ** 2), 0, { flat: true });
  b.add(new THREE.RingGeometry(Rm, Ro, 28), mat(0, yTop, 0, -Math.PI / 2, 0, 0), STONE[3]);
  b.cyl(Rm + 0.1, Rm + 0.1, 0.3, 28, mat(0, yd - 0.15, 0), 0x030405);
  // coping stones, one left out where the stair goes down
  const nc = P.coping, aS = (0.5 / nc) * TAU;
  for (let i = 1; i < nc; i++) {
    const a = ((i + 0.5) / nc) * TAU, hb = (0.55 + 0.4 * R()) * S, rc = Rm + tw / 2;
    b.box(tw * 1.2, hb, ((rc * TAU) / nc) * 0.84, mat(Math.cos(a) * rc, yTop + hb / 2, Math.sin(a) * rc, 0, -a, 0), i % 2 ? STONE[3] : pale);
  }
  // the stair, winding down inside out of sight
  const rise = 0.4 * S, dth = (TAU / P.treads) * P.turn, tl = 1.8 * S;
  for (let i = 0; i < 200; i++) {
    const y = yTop - 0.15 - i * rise;
    if (y < yd - 0.6) break;
    const a = aS + i * dth, r = Rm - tl / 2 + 0.1;
    b.box(tl, 0.34 * S, Math.max(1.1 * S, Rm * Math.abs(dth) * 1.05), mat(Math.cos(a) * r, y - 0.17 * S, Math.sin(a) * r, 0, -a, 0), mixHex(pale, BLACK, clamp((yTop - y) / P.wall, 0, 1) * 0.9));
  }
  // the frame over it: four legs to two bearings, tied
  const H = P.height, Rw = P.wheel, tx = 1.0 * S, tz = 1.4 * S, fx0 = Ro * 0.45, fz0 = Ro * 1.3 + 0.5 * S;
  const leg = (sx, sz, f) => V(sx * lerp(fx0, tx, f), lerp(g(sx * fx0, sz * fz0) - 1, H, f), sz * lerp(fz0, tz, f));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(b, leg(sx, sz, 0), leg(sx, sz, 1), 1.1 * S, STONE[sx * sz > 0 ? 2 : 1]);
  for (const f of [[0.5], [0.4, 0.7], [0.36, 0.56, 0.76]][P.ties - 1]) {
    for (const q of [-1, 1]) {
      beam(b, leg(-1, q, f), leg(1, q, f), 0.8 * S, STONE[3]);
      beam(b, leg(q, -1, f), leg(q, 1, f), 0.8 * S, STONE[3]);
    }
  }
  for (const q of [-1, 1]) b.box(2 * tx + 1.6 * S, 1.4 * S, 1.2 * S, mat(0, H, q * tz), pale);
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the wheel
  const wb = new Builder();
  wb.torus(Rw, 0.32 * S, 5, 28, null, STONE[3]);
  for (let i = 0; i < P.spokes; i++) {
    const a = (i / P.spokes) * TAU;
    wb.box(0.3 * S, Rw, 0.3 * S, mat((-Math.sin(a) * Rw) / 2, (Math.cos(a) * Rw) / 2, 0, 0, 0, a), STONE[2]);
    for (const q of [-1, 1]) wb.box(0.5 * S, 0.5 * S, 0.2 * S, mat(-Math.sin(a) * Rw, Math.cos(a) * Rw, q * 0.36 * S, 0, 0, a), A, PULSE);
  }
  wb.cyl(0.9 * S, 0.9 * S, 1.2 * S, 10, mat(0, 0, 0, Math.PI / 2, 0, 0), RIM);
  wb.cyl(0.3 * S, 0.3 * S, 2 * tz, 6, mat(0, 0, 0, Math.PI / 2, 0, 0), STONE[1]);
  const wheel = new THREE.Mesh(wb.build(), mats.glow);
  wheel.position.y = H;
  group.add(wheel);
  // the rope of light over it, both ends down the shaft; and the light far down
  const rb = new Builder(), Rr = Rw + 0.36 * S;
  for (const q of [-1, 1]) rb.box(0.16 * S, H - yd + 1, 0.16 * S, mat(q * Rr, (H + yd - 1) / 2, 0), 0xffffff, 0.8);
  rb.torus(Rr, 0.09 * S, 3, 16, mat(0, H, 0), 0xffffff, 0.8, Math.PI);
  rb.cyl(0.9 * S, 0.9 * S, 0.06, 12, mat(0, yd + 0.08, 0), 0xffffff, 1);
  const rope = lightMesh(rb.build(), fx, 0.75);
  rope.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.3));
  group.add(rope);
  // the beam that stands up out of it
  const top = H + Rw + P.beam, col = lightMesh(column(1.0 * S, 0.45 * S, yd + 0.1, top, 0.85, 0.02, 10), fx, 0.3);
  col.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.15));
  group.add(col);
  // the lights drawn up: the one on the rope, and the one just let go
  const lights = lightPoints(2, fx, mixHex(A, 0xffffff, 0.35), 3.4 * S, 1.5);
  group.add(lights.points);
  const N = P.count, ybot = yd - 5 * S, D = H - ybot, Th = D / P.speed, Tc = N * Th + P.pause, net = N % 2 ? -1 : 0;
  return finish({ group, light: V(0, yTop + 1, 0), focus: V(0, H * 0.55, 0), span: fz0 + 1.5 * S, clear: fz0 + 8, height: top, solid: { r: fz0, top: H + Rw + 2 * S, low: 0 } }, fx, (t) => {
    const cyc = Math.floor(t / Tc), u = t - cyc * Tc, k = Math.min(N, Math.floor(u / Th)), f = k < N ? (u - k * Th) / Th : 0, e = f * f * (3 - 2 * f);
    // a haul on the left rope turns the wheel one way, the next, on the right, turns it back
    wheel.rotation.z = (D / Rw) * (cyc * net + (k < N ? (k % 2 ? e - 1 : -e) : net));
    const y = ybot + e * D;
    lights.pos[0] = (k % 2 ? 1 : -1) * Rr; lights.pos[1] = y; lights.pos[2] = 0;
    lights.al[0] = k < N ? 0.15 + 0.85 * smoothstep(yd - 1, yTop + 2, y) : 0;
    // let go at the wheel: it drifts into the beam, rises, and is gone
    const tr = u - k * Th, gone = k > 0 ? clamp(1 - tr / 3.5, 0, 1) : 0;
    lights.pos[3] = ((k - 1) % 2 ? 1 : -1) * Rr * Math.exp(-tr * 1.2); lights.pos[4] = H + 0.5 + tr * P.speed * 0.9; lights.pos[5] = 0;
    lights.al[1] = gone * gone;
    lights.g.attributes.position.needsUpdate = true;
    lights.g.attributes.aAlpha.needsUpdate = true;
    col.userData.fx.k = 0.8 + 0.7 * gone * gone;
  });
}

// ------------------------------------------------------------------ archive
// what is written on it, row after row from the top of the first tablet to the foot of
// the last: an automaton's run from one mark (begun again if it dies or fills), or the
// numbers in rows with the primes marked
function archiveRows(P) {
  const total = P.n * P.rows, rows = [], seedRow = () => Array.from({ length: P.cols }, (_, c) => c === (P.cols >> 1));
  if (P.kind === 'sieve') {
    const N = total * P.cols + 1, comp = new Uint8Array(N + 1);
    for (let i = 2; i * i <= N; i++) if (!comp[i]) for (let j = i * i; j <= N; j += i) comp[j] = 1;
    for (let r = 0; r < total; r++) rows.push(Array.from({ length: P.cols }, (_, c) => r * P.cols + c + 1 > 1 && !comp[r * P.cols + c + 1]));
    return rows;
  }
  let row = seedRow();
  for (let r = 0; r < total; r++) {
    rows.push(row);
    const next = row.map((_, c) => !!((P.rule >> ((row[(c + P.cols - 1) % P.cols] ? 4 : 0) | (row[c] ? 2 : 0) | (row[(c + 1) % P.cols] ? 1 : 0))) & 1));
    const lit = next.filter(Boolean).length;
    row = lit === 0 || lit === P.cols ? seedRow() : next;
  }
  return rows;
}
function archive(d, A, mats, ctx) {
  const P = d.params, S = d.size, g = ctx.ground, b = new Builder(), R = rng(d.seed[5]);
  const cell = P.cell, ch = cell * 0.9, Wt = (P.cols + 1.6) * cell, Ht = P.rows * ch + 2.6 * cell, th = 1.3 * S, yM = Ht - 1.2 * cell;
  const pale = mixHex(STONE[3], RIM, 0.3), markC = mixHex(RIM, A, 0.35), sp = Wt + 1.3 * S, n = P.n;
  // where the tablets stand, in the order they are read
  const at = [];
  let desk;
  if (P.layout === 'ranks') {
    const m = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const side = i < m ? 0 : 1, j = side ? 2 * m - 1 - i : i;       // down one rank, back up the other
      at.push({ x: (j - (m - 1) / 2) * sp, z: side ? -P.aisle / 2 : P.aisle / 2, ry: side ? 0 : Math.PI, f: m > 1 ? j / (m - 1) : 0 });
    }
    desk = [-((m - 1) / 2) * sp - Wt / 2 - 4 * S, 0];
  } else {
    const c = P.layout === 'spiral' ? P.pitch / TAU : 0;
    let a = 0, r = P.layout === 'spiral' ? P.inner : Math.max(P.inner, (n * sp) / (TAU * 0.78));
    for (let i = 0; i < n; i++) {
      at.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, ry: -a - Math.PI / 2, f: i / (n - 1) });
      const da = sp / r;
      a += da; r += c * da;
    }
    desk = [0, 0];
  }
  const rows = archiveRows(P), total = n * P.rows;
  let span = 0, top = 0;
  for (let i = 0; i < n; i++) {
    const T = at[i], ph = 0.6 * S + (P.grow ? T.f * P.rise : 0), yb = g(T.x, T.z) + ph, M = mat(T.x, yb, T.z, 0, T.ry, 0);
    T.M = M;
    T.from = i === P.broken ? Math.floor(P.rows * P.brokenAt) : 0;     // its first row still standing
    const h = T.from ? yM - T.from * ch + 0.3 * cell : Ht, tone = STONE[2 + (i % 2)];
    b.box(Wt + 1.4 * S, ph + 2.5, th + 1.4 * S, mul(M, mat(0, -(ph + 2.5) / 2, 0)), STONE[1]);
    b.add(new THREE.BoxGeometry(Wt, h, th), mul(M, mat(0, h / 2, 0)), (x, y) => (y > h * 0.49 ? pale : tone), 0, { flat: true });
    if (T.from) {
      // broken off: a tooth of it left standing, and the rest face down in front of it
      b.box(Wt * 0.4, ch * 1.6, th, mul(M, mat(-Wt * 0.3, h + ch * 0.8, 0)), tone);
      const lost = Ht - h;
      b.box(Wt * 0.94, th * 0.9, lost * 0.85, mul(M, mat(Wt * 0.06, -ph + th * 0.3, th + lost * 0.5 + 1.2 * S, 0.03, 0.14, 0.05)), tone);
    }
    for (let r = T.from; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
      if (!rows[i * P.rows + r][c]) continue;
      const lx = (c - (P.cols - 1) / 2) * cell, ly = yM - (r + 0.5) * ch;
      b.add(new THREE.PlaneGeometry(cell * 0.62, ch * 0.5), mul(M, mat(lx, ly, th / 2 + 0.06)), markC, 0.16);
      b.add(new THREE.PlaneGeometry(cell * 0.62, ch * 0.5), mul(M, mat(lx, ly, -th / 2 - 0.06, 0, Math.PI, 0)), markC, 0.16);
    }
    span = Math.max(span, Math.hypot(T.x, T.z) + Wt / 2 + 1.5 * S);
    top = Math.max(top, yb + Ht);
  }
  // a desk of stone where the reading is done from, a light over it
  const yd = g(desk[0], desk[1]);
  b.box(2.4 * S, 1.6 * S + 1, 1.8 * S, mat(desk[0], yd + 0.8 * S - 0.5, desk[1], 0, 0.5, 0), STONE[3]);
  b.box(2.8 * S, 0.3 * S, 2.1 * S, mat(desk[0], yd + 1.7 * S, desk[1], 0.22, 0.5, 0), pale);
  b.ico(0.55 * S, 0, mat(desk[0], yd + 3.2 * S, desk[1]), A, PULSE);
  span = Math.max(span, Math.hypot(desk[0], desk[1]) + 2 * S);
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the rows being read: the one under the light and the two before it, on both faces
  const st = new Strips(), per = P.cols * 2;
  for (let i = 0; i < 3 * per; i++) st.quad(V(), V(), V(), V());
  const lit = st.mesh(fx, 1, mixHex(A, 0xffffff, 0.3)), pa = lit.geometry.attributes.position, shown = [[], [], []];
  pa.setUsage(THREE.DynamicDrawUsage);
  const v = V();
  const place = (slot, G) => {
    const T = at[Math.floor(G / P.rows)], r = G % P.rows, on = shown[slot];
    on.length = 0;
    for (let c = 0; c < P.cols; c++) for (const s of [1, -1]) {
      const q = slot * per + c * 2 + (s > 0 ? 0 : 1), there = r >= T.from && rows[G][c];
      on.push(there);
      const lx = (c - (P.cols - 1) / 2) * cell, ly = yM - (r + 0.5) * ch, hw = there ? cell * 0.4 : 0, hh = there ? ch * 0.34 : 0;
      [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, -hh], [hw, hh], [-hw, hh]].forEach(([ox, oy], k) => {
        v.set(lx + ox, ly + oy, s * (th / 2 + 0.16)).applyMatrix4(T.M);
        pa.setXYZ(q * 6 + k, v.x, v.y, v.z);
      });
    }
    pa.needsUpdate = true;
  };
  const eye = lightPoints(1, fx, mixHex(A, 0xffffff, 0.4), 3 * S, 1.3);
  group.add(lit, eye.points);
  let cur = -1;
  return finish({ group, light: V(desk[0], yd + 3.2 * S, desk[1]), focus: V(0, top * 0.5, 0), span, clear: Math.min(95, span + 6), height: top, solid: { r: span, top: top + 1, low: 0 } }, fx, (t, beat) => {
    const bt = beat * P.rate, G = ((Math.floor(bt) % total) + total) % total, fr = bt - Math.floor(bt);
    if (G !== cur) { cur = G; for (let j = 0; j < 3; j++) place(j, (G - j + total) % total); }
    // the marks light as the light passes along the row, and go out slowly behind it
    for (let j = 0; j < 3; j++) for (let k = 0; k < per; k++) {
      const c = k >> 1;
      st.set(j * per + k, !shown[j][k] ? 0 : j ? 0.8 * Math.exp(-(j - 1 + fr) * 1.1) : c + 0.5 < fr * (P.cols + 1) ? 1 : 0);
    }
    st.done();
    const T = at[Math.floor(G / P.rows)];
    v.set((fr * (P.cols + 1) - 0.5 - (P.cols - 1) / 2) * cell, yM - ((G % P.rows) + 0.5) * ch, th / 2 + 0.9 * S).applyMatrix4(T.M);
    eye.pos[0] = v.x; eye.pos[1] = v.y; eye.pos[2] = v.z;
    eye.g.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ amphitheatre
const FIB = [2, 3, 5, 8, 13, 21, 34, 55, 89];
function amphitheatre(d, A, mats, ctx) {
  const P = d.params, S = d.size, g = ctx.ground, b = new Builder(), R = rng(d.seed[5]), K = P.rings;
  const Ro = P.across / 2, r0 = P.floor, tread = (Ro - r0) / K, f0 = P.open / 2, f1 = TAU - P.open / 2, nseg = 44;
  const [lo, hi] = groundSpan(g, r0), yf = hi + 0.2, pale = mixHex(STONE[3], RIM, 0.3);
  const yk = (k) => yf + (k + 1) * P.riser, rk = (k) => r0 + k * tread;
  // its floor, and the rings stepping up and outward from it
  b.cyl(r0 + 0.2, r0 + 0.2, yf - lo + 1.5, 36, mat(0, (yf + lo - 1.5) / 2, 0), STONE[0]);
  for (let i = 0; i < nseg; i++) {
    const a = lerp(f0, f1, i / nseg), e = lerp(f0, f1, (i + 1) / nseg), m = (a + e) / 2;
    const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e), cm = Math.cos(m), sm = Math.sin(m);
    for (let k = 0; k < K; k++) {
      const r = rk(k), q = rk(k + 1), y = yk(k), yl = k ? yk(k - 1) : yf;
      face(b, [ca * r, yl, sa * r], [ce * r, yl, se * r], [ce * r, y, se * r], [ca * r, y, sa * r], [-cm, 0, -sm], STONE[1]);
      face(b, [ca * r, y, sa * r], [ce * r, y, se * r], [ce * q, y, se * q], [ca * q, y, sa * q], [0, 1, 0], k === K - 1 ? pale : STONE[2 + (k % 2)]);
    }
    const yb = Math.min(g(ca * Ro, sa * Ro), g(ce * Ro, se * Ro)) - 1.2, yt = yk(K - 1);
    face(b, [ca * Ro, yb, sa * Ro], [ce * Ro, yb, se * Ro], [ce * Ro, yt, se * Ro], [ca * Ro, yt, sa * Ro], [cm, 0, sm], STONE[1]);
  }
  for (const [f, sgn] of [[f0, -1], [f1, 1]]) {
    const c = Math.cos(f), s = Math.sin(f);
    for (let k = 0; k < K; k++) {
      const r = rk(k), q = rk(k + 1), yb = Math.min(g(c * r, s * r), g(c * q, s * q)) - 1.2;
      face(b, [c * r, yb, s * r], [c * q, yb, s * q], [c * q, yk(k), s * q], [c * r, yk(k), s * r], [-s * sgn, 0, c * sgn], STONE[2]);
    }
  }
  // what stands up from it: a pylon at each end of the rings, or posts along the last of them
  let top = yk(K - 1);
  if (P.crown === 'pylons') {
    for (const [f, sgn] of [[f0, -1], [f1, 1]]) {
      const a = f + (sgn * 2.2 * S) / Ro, r = Ro - 1.8 * S, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const hp = yk(K - 1) - g(x, z) + P.crownH * 0.55;        // half as tall again as the rings
      slab(b, x, z, g(x, z) - 1, 3.2 * S, hp + 1, 2.4 * S, -a - Math.PI / 2, 0, STONE[2], 0.55);
      top = Math.max(top, g(x, z) + hp);
    }
  } else {
    for (let i = 0; i < P.posts; i++) {
      const a = lerp(f0, f1, (i + 0.5) / P.posts), r = Ro - 0.9 * S, h = P.crownH * 0.5;
      b.cyl(0.4 * S, 0.55 * S, h, 6, mat(Math.cos(a) * r, yk(K - 1) + h / 2, Math.sin(a) * r), STONE[2 + (i % 2)]);
      b.box(1.3 * S, 0.4 * S, 1.3 * S, mat(Math.cos(a) * r, yk(K - 1) + h + 0.2 * S, Math.sin(a) * r, 0, -a, 0), pale);
    }
    top += P.crownH * 0.5 + 0.4 * S;
  }
  b.cyl(1.5 * S, 1.9 * S, 0.8 * S, 10, mat(0, yf + 0.4 * S, 0), STONE[3]);
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // those seated: Fibonacci numbers of them, ring by ring
  const sb = new Builder(), seats = [];
  for (let k = 0; k < K; k++) for (let j = 0; j < P.counts[k]; j++) {
    const a = lerp(f0, f1, (j + 0.5) / P.counts[k]), r = rk(k) + tread * 0.55, p = V(Math.cos(a) * r, yk(k) + 0.56 * S, Math.sin(a) * r);
    sb.add(new THREE.OctahedronGeometry(0.36 * S, 0), mat(p.x, p.y, p.z, 0, a, 0, 1, 1.5, 1), 0xffffff, 1);
    seats.push({ k, p, ph: R() * TAU });
  }
  const sg = sb.build(), sem = sg.attributes.emissive, per = sem.count / seats.length;
  sem.setUsage(THREE.DynamicDrawUsage);
  const seated = lightMesh(sg, fx, 1);
  seated.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.3));
  const halo = lightPoints(seats.length + 1, fx, A, 1.7 * S, 0.9);
  seats.forEach((s, i) => halo.pos.set([s.p.x, s.p.y, s.p.z], i * 3));
  // and the one they have come to hear
  const cb = new Builder(), yc = yf + 2.8 * S;
  cb.ico(1.15 * S, 1, mat(0, yc, 0), 0xffffff, 1);
  cb.add(new THREE.RingGeometry(2.3 * S, 2.8 * S, 28), mat(0, yf + 0.12, 0, -Math.PI / 2, 0, 0), 0xffffff, 0.55);
  const one = lightMesh(cb.build(), fx, 1);
  one.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.45));
  halo.pos.set([0, yc, 0], seats.length * 3);
  halo.sz[seats.length] = 4.5;
  group.add(seated, halo.points, one);
  const cyc = K + 3;
  return finish({ group, light: V(0, yc, 0), focus: V(0, yf + 3 * S, 0), span: Ro + 1, clear: Math.min(95, Ro + 7), height: top, solid: top > 24 ? { r: Ro, top: top + 1, low: 0 } : undefined }, fx, (t, beat) => {
    // it speaks on the first beat; ring by ring, outward, they answer; then two beats of quiet
    const u = (((beat / P.every) % cyc) + cyc) % cyc;
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i], du = u - (s.k + 1), a = 0.2 + 0.8 * (du >= 0 ? Math.exp(-du * 1.5) : 0) + 0.05 * Math.sin(t * 1.3 + s.ph);
      sem.array.fill(a, i * per, (i + 1) * per);
      halo.al[i] = a;
    }
    const sp = 0.45 + 0.55 * Math.exp(-u * 1.2);
    one.userData.fx.k = sp;
    halo.al[seats.length] = sp;
    one.position.y = Math.sin(t * 0.6) * 0.2 * S;
    sem.needsUpdate = true;
    halo.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ aqueduct
function aqueduct(d, A, mats, ctx) {
  const P = d.params, S = d.size, g = ctx.ground, b = new Builder(), R = rng(d.seed[5]);
  const sx = P.end, N = P.arches, bay = P.bay, H = P.height, dz = P.depth, pw = P.pier, td = 1.5 * S, pale = mixHex(STONE[3], RIM, 0.28);
  const v = P.flow, G = 4.9, throwEst = v * Math.sqrt((2 * H) / G);
  // built along x with its broken end toward +x, then turned about if the seed says so
  const X = (x) => sx * x;
  const q4 = (p0, p1, p2, p3, n, color) => face(b, [X(p0[0]), p0[1], p0[2]], [X(p1[0]), p1[1], p1[2]], [X(p2[0]), p2[1], p2[2]], [X(p3[0]), p3[1], p3[2]], [sx * n[0], n[1], n[2]], color);
  const x0 = -(N * bay + bay / 2 + throwEst + P.pool - pw / 2) / 2, xL = x0 - pw / 2 - 0.5 * S;
  // a tier of arches: piers from foot(x) up to `top`, the wall between them over round
  // arches; past the last pier, `stub` of one more arch (0: none) and the break
  const arcade = (n, bay, pw, foot, top, depth, stub, tone) => {
    const r = (bay - pw) / 2, ys = top - 1.3 * r - 0.5 * S, hz = depth / 2, kr = 1 + (0.7 * S) / r;
    let xEnd = x0 + n * bay + pw / 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * bay, yf = foot(x), h = top - yf;
      b.box(pw, h, depth, mat(X(x), yf + h / 2, 0), STONE[tone + (i % 2)]);
      b.box(pw + 0.5 * S, 0.6 * S, depth + 0.5 * S, mat(X(x), ys, 0), pale);
      if (i === n && !stub) break;
      const cx = x + bay / 2, part = i === n ? stub : 1, m = i === n ? Math.max(2, Math.round(8 * stub)) : 8;
      for (let j = 0; j < m; j++) {
        const a0 = Math.PI * (1 - (part * j) / m), a1 = Math.PI * (1 - (part * (j + 1)) / m), am = (a0 + a1) / 2;
        const xa = cx + r * Math.cos(a0), ya = ys + r * Math.sin(a0), xb = cx + r * Math.cos(a1), yb = ys + r * Math.sin(a1);
        for (const s of [-1, 1]) {
          q4([xa, ya, s * hz], [xb, yb, s * hz], [xb, top, s * hz], [xa, top, s * hz], [0, 0, s], STONE[2]);
          const zr = s * (hz + 0.12);
          q4([xa, ya, zr], [xb, yb, zr], [cx + (xb - cx) * kr, ys + (yb - ys) * kr, zr], [cx + (xa - cx) * kr, ys + (ya - ys) * kr, zr], [0, 0, s], pale);
        }
        q4([xa, ya, -hz], [xb, yb, -hz], [xb, yb, hz], [xa, ya, hz], [-Math.cos(am), -Math.sin(am), 0], STONE[1]);
      }
      if (i === n) {
        const ab = Math.PI * (1 - stub), xb = cx + r * Math.cos(ab), yb = ys + r * Math.sin(ab);
        q4([xb, yb, -hz], [xb, yb, hz], [xb, top, hz], [xb, top, -hz], [1, 0, 0], STONE[1]);
        xEnd = xb;
      }
    }
    return xEnd;
  };
  const footG = (x) => Math.min(g(X(x - pw / 2), 0), g(X(x + pw / 2), 0)) - 1.5;
  let xEnd;
  if (P.tiers === 2) {
    const H1 = H * 0.58, t1 = 1.0 * S;
    const xe = arcade(N, bay, pw, footG, H1, dz * 1.25, 0, 1);
    b.box(xe + 0.4 * S - xL, t1, dz * 1.25 + 0.9 * S, mat(X((xe + 0.4 * S + xL) / 2), H1 + t1 / 2, 0), STONE[3]);
    xEnd = arcade(2 * N, bay / 2, pw * 0.55, () => H1 + t1, H - td, dz, P.stub, 2);
  } else xEnd = arcade(N, bay, pw, footG, H - td, dz, P.stub, 1);
  // the channel along its top
  b.box(xEnd - xL, td, dz + 0.9 * S, mat(X((xEnd + xL) / 2), H - td / 2, 0), STONE[3]);
  for (const s of [-1, 1]) b.box(xEnd - xL, 0.6 * S, 0.5 * S, mat(X((xEnd + xL) / 2), H + 0.3 * S, s * (dz / 2 + 0.2 * S)), pale);
  // what fell
  for (let i = 0; i < P.rubble; i++) {
    const x = xEnd + R.range(-3, 9) * S, z = R.range(-1, 1) * (dz / 2 + 4 * S), s = R.range(1.2, 2.6) * S;
    const bg = new THREE.BoxGeometry(s, s * R.range(0.5, 0.9), s * R.range(0.7, 1.4));
    roughen(bg, 0.25 * S, i + 3);
    b.add(bg, mat(X(x), g(X(x), z) + s * 0.15, z, R.range(-0.4, 0.4), R() * TAU, R.range(-0.4, 0.4)), STONE[1 + (i % 3)], 0, { flat: true });
  }
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the light in the channel, flat and on edge (so it shows from the side too); the fall
  // from the break, the way water falls; and the pool, in rings
  const st = new Strips(), tau = [], env = [], yc = H + 0.12, wch = dz * 0.5, xS = xL + 0.5 * S;
  const nC = Math.ceil((xEnd - xS) / (1.5 * S));
  for (let i = 0; i < nC; i++) {
    const xa = lerp(xS, xEnd, i / nC), xb = lerp(xS, xEnd, (i + 1) / nC), tm = ((xa + xb) / 2 - xEnd) / v, fade = clamp(((xa + xb) / 2 - xS) / (10 * S), 0, 1);
    st.flat(V(X(xa), yc, 0), V(X(xb), yc, 0), wch);
    st.up(V(X(xa), yc, 0), V(X(xb), yc, 0), 1.0 * S);
    tau.push(tm, tm);
    env.push(fade, fade * 0.7);
  }
  const fall = [];
  for (let tt = 0; ; tt += 0.12) {
    const x = xEnd + v * tt, y = yc - 0.5 * G * tt * tt;
    fall.push([x, y, tt]);
    if (y <= g(X(x), 0) + 0.15 || tt > 14) break;
  }
  const Tf = fall[fall.length - 1][2], xp = fall[fall.length - 1][0], yp = g(X(xp), 0);
  for (let i = 0; i < fall.length - 1; i++) {
    const p = fall[i], q = fall[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = (-(q[1] - p[1]) / l) * 0.45 * S, ny = ((q[0] - p[0]) / l) * 0.45 * S;
    const hw = (wch / 2) * (1 + 0.25 * (p[2] / Tf)), k = 0.95 - 0.4 * (p[2] / Tf);
    st.quad(V(X(p[0]), p[1], -hw), V(X(p[0]), p[1], hw), V(X(q[0]), q[1], hw), V(X(q[0]), q[1], -hw));
    st.quad(V(X(p[0] - nx), p[1] - ny, 0), V(X(p[0] + nx), p[1] + ny, 0), V(X(q[0] + nx), q[1] + ny, 0), V(X(q[0] - nx), q[1] - ny, 0));
    tau.push((p[2] + q[2]) / 2, (p[2] + q[2]) / 2);
    env.push(k, k);
  }
  const nFlow = st.n, nr = 7, ns = 18, ringOf = [];
  const onPool = (rr, a) => V(X(xp) + Math.cos(a) * rr, g(X(xp) + Math.cos(a) * rr, Math.sin(a) * rr) + 0.18, Math.sin(a) * rr);
  for (let i = 0; i < 8; i++) { st.quad(V(X(xp), yp + 0.2, 0), onPool(1.1 * S, (i / 8) * TAU), onPool(1.1 * S, ((i + 1) / 8) * TAU), V(X(xp), yp + 0.2, 0)); ringOf.push(-1); }
  for (let j = 0; j < nr; j++) for (let i = 0; i < ns; i++) {
    const rr = 1.1 * S + ((P.pool - 1.1 * S) * (j + 1)) / nr;
    st.flat(onPool(rr, (i / ns) * TAU), onPool(rr, ((i + 1) / ns) * TAU), 0.34 * S);
    ringOf.push(j);
  }
  group.add(st.mesh(fx, 0.9, mixHex(A, 0xffffff, 0.3)));
  // drops of it
  const nd = 64, drops = lightPoints(nd, fx, mixHex(A, 0xffffff, 0.4), 0.8 * S, 1.2);
  const D = Array.from({ length: nd }, () => ({ ph: R() * Tf, z: R.range(-1, 1) * wch * 0.5, jx: R.range(-0.5, 0.5), jy: R.range(-0.4, 0.4) }));
  for (let i = 0; i < nd; i++) drops.sz[i] = 0.6 + R() * 0.9;
  group.add(drops.points);
  const half = Math.max(-xL, xp + P.pool) + 1, far = Math.max(-xL, xEnd);
  return finish({ group, light: V(X(xp), yp + 1.5, 0), focus: V(0, H * 0.5, 0), span: half, clear: Math.min(95, half + 6), height: H + 0.6 * S, solid: { r: far, top: H + 2 * S, low: 0 } }, fx, (t) => {
    for (let q = 0; q < nFlow; q++) { const ph = t - tau[q]; st.set(q, env[q] * (0.5 + 0.28 * Math.sin(ph * 2.3) + 0.2 * Math.sin(ph * 5.1 + 1.3))); }
    for (let q = nFlow; q < st.n; q++) { const j = ringOf[q - nFlow]; st.set(q, j < 0 ? 0.9 : (0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.2 - j * 1.1), 2)) * (1 - (j / nr) * 0.7)); }
    st.done();
    for (let i = 0; i < nd; i++) {
      const o = D[i], tt = (t + o.ph) % Tf;
      drops.pos[i * 3] = X(xEnd + (v + o.jx) * tt); drops.pos[i * 3 + 1] = yc - 0.5 * G * tt * tt + o.jy * tt; drops.pos[i * 3 + 2] = o.z * (1 + 0.3 * tt);
      drops.al[i] = Math.min(1, (1 - tt / Tf) * 8);
    }
    drops.g.attributes.position.needsUpdate = true;
    drops.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ garden
function garden(d, A, mats, ctx) {
  const P = d.params, S = d.size, g = ctx.ground, b = new Builder(), R = rng(d.seed[5]);
  const a = P.long / 2, c = P.wide / 2, e = P.shape === 'oval' ? 2 : 6, kerb = 0.9 * S, pale = mixHex(STONE[3], RIM, 0.25), M = 56;
  // the bed: level, kerbed, its edge a rectangle with its corners eased (or an oval)
  const edge = (i, grow = 0) => {
    const t = (i / M) * TAU, cs = Math.cos(t), sn = Math.sin(t);
    return [Math.sign(cs) * Math.pow(Math.abs(cs), 2 / e) * (a + grow), Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e) * (c + grow)];
  };
  const inside = (x, z, m = 0) => Math.pow(Math.abs(x) / (a - m), e) + Math.pow(Math.abs(z) / (c - m), e) < 1;
  let lo = g(0, 0), hi = lo;
  for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) { const y = g((i / 3) * (a + kerb), (j / 2) * (c + kerb)); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const yb = hi + 0.3, yk = yb + 0.5 * S, yFoot = lo - 1.2;
  for (let i = 0; i < M; i++) {
    const p = edge(i), q = edge(i + 1), o = edge(i, kerb), u = edge(i + 1, kerb), mx = p[0] + q[0], mz = p[1] + q[1];
    faceTri(b, [0, yb, 0], [p[0], yb, p[1]], [q[0], yb, q[1]], [0, 1, 0], STONE[1]);
    face(b, [p[0], yk, p[1]], [q[0], yk, q[1]], [u[0], yk, u[1]], [o[0], yk, o[1]], [0, 1, 0], pale);
    face(b, [p[0], yb, p[1]], [q[0], yb, q[1]], [q[0], yk, q[1]], [p[0], yk, p[1]], [-mx, 0, -mz], STONE[2]);
    face(b, [o[0], yFoot, o[1]], [u[0], yFoot, u[1]], [u[0], yk, u[1]], [o[0], yk, o[1]], [mx, 0, mz], STONE[2]);
  }
  // the boulders, in their groups, nowhere two alike and nothing in the middle
  const stones = [], centres = [];
  P.groups.forEach((cnt, gi) => {
    let best = null, score = -1;
    for (let k = 0; k < 16; k++) {
      const x = R.range(-0.74, 0.74) * a, z = R.range(-0.64, 0.64) * c;
      if (!inside(x, z, 5 * S)) continue;
      const s = Math.min(3 * S + Math.hypot(x, z) * 1.5, ...centres.map((q) => Math.hypot(q[0] - x, q[1] - z)));
      if (s > score) { score = s; best = [x, z]; }
    }
    best = best || [(gi - 1) * a * 0.4, (gi % 2 ? 0.3 : -0.3) * c];
    centres.push(best);
    let ang = R() * TAU, reach = 0;
    for (let k = 0; k < cnt; k++) {
      const lead = k === 0, rx = (lead ? (gi ? R.range(1.8, 2.6) : R.range(2.2, 3)) : R.range(1.1, 1.9)) * S, rz = rx * R.range(0.6, 0.9);
      const h = (lead ? (gi ? R.range(2, 3.4) : R.range(4.2, 6)) : R.range(0.9, 2)) * S, rr = (rx + rz) * 0.48;
      let x = best[0], z = best[1];
      if (!lead) {
        const dist = (reach + rr) * R.range(1.15, 1.5);
        x += Math.cos(ang) * dist; z += Math.sin(ang) * dist;
        ang += R.range(1.6, 2.9);
        if (!inside(x, z, rr + 1.5 * S)) { x = best[0] * 0.8 + Math.cos(ang) * dist * 0.6; z = best[1] * 0.8 + Math.sin(ang) * dist * 0.6; }
      } else reach = rr;
      const tone = STONE[(stones.length + gi) % 3], ig = new THREE.IcosahedronGeometry(1, 1);
      roughen(ig, 0.24, stones.length * 5 + 2);
      b.add(ig, mat(x, yb + h * 0.32, z, R.range(-0.15, 0.15), R() * TAU, R.range(-0.15, 0.15), rx, h * 0.68, rz), (px, py) => (py > 0.45 ? mixHex(tone, RIM, 0.16) : tone), 0, { flat: true });
      stones.push({ x, z, r: rr, h });
    }
  });
  // what keeps it: a lantern of stone, or a pole, where the boulders leave most room
  let kx = 0, kz = 0, far = -1;
  for (const [ux, uz] of [[0.74, 0.62], [-0.74, 0.62], [0.74, -0.62], [-0.74, -0.62], [0, 0.7], [0, -0.7]]) {
    const x = ux * a * (e === 2 ? 0.8 : 1), z = uz * c * (e === 2 ? 0.8 : 1), s = Math.min(...stones.map((q) => Math.hypot(q.x - x, q.z - z) - q.r)) + R() * S;
    if (s > far) { far = s; kx = x; kz = z; }
  }
  const kh = P.keeperH, K = (r0, r1, h, y, color, em = 0) => b.cyl(r0, r1, h, 6, mat(kx, yb + y + h / 2, kz, 0, 0.3, 0), color, em);
  let ly;
  if (P.keeper === 'lantern') {
    K(0.2 * kh, 0.24 * kh, 0.07 * kh, 0, STONE[2]);
    K(0.07 * kh, 0.09 * kh, 0.4 * kh, 0.07 * kh, STONE[3]);
    K(0.2 * kh, 0.12 * kh, 0.06 * kh, 0.47 * kh, STONE[2]);
    K(0.105 * kh, 0.105 * kh, 0.16 * kh, 0.53 * kh, A, PULSE);
    for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU + 0.3; b.box(0.035 * kh, 0.16 * kh, 0.035 * kh, mat(kx + Math.sin(t) * 0.125 * kh, yb + 0.61 * kh, kz + Math.cos(t) * 0.125 * kh, 0, t, 0), STONE[1]); }
    K(0.02 * kh, 0.31 * kh, 0.16 * kh, 0.69 * kh, STONE[3]);
    K(0.045 * kh, 0.045 * kh, 0.06 * kh, 0.85 * kh, pale);
    b.ico(0.05 * kh, 0, mat(kx, yb + 0.95 * kh, kz), pale);
    ly = yb + 0.61 * kh;
  } else {
    K(0.9 * S, 1.2 * S, 0.8 * S, 0, STONE[2]);
    K(0.16 * S, 0.32 * S, kh - 1.6 * S, 0.8 * S, STONE[3]);
    K(0.4 * S, 0.4 * S, 0.5 * S, kh * 0.66, pale);
    b.ico(0.6 * S, 1, mat(kx, yb + kh - 0.6 * S, kz), A, PULSE);
    ly = yb + kh - 0.6 * S;
  }
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the raking: rings about each boulder (where two boulders' rings would cross, the
  // nearer boulder has the ground) and, in the one style, straight lines over the rest
  const st = new Strips(), qx = [], qz = [], yl = yb + 0.1, lw = 0.28 * S, pitch = P.pitch, clearK = P.keeper === 'lantern' ? 0.3 * kh : 1.8 * S;
  const line = (x0, z0, x1, z1) => { st.flat(V(x0, yl, z0), V(x1, yl, z1), lw); qx.push((x0 + x1) / 2); qz.push((z0 + z1) / 2); };
  const off = (s, x, z) => Math.hypot(x - s.x, z - s.z) - s.r;
  const free = (x, z) => inside(x, z, 0.5 * S) && Math.hypot(x - kx, z - kz) > clearK;
  const reachAll = Math.hypot(a, c) * 2;
  stones.forEach((s) => {
    for (let j = 0; P.style === 'cells' ? s.r + j * pitch < reachAll : j < P.rings; j++) {
      const rr = s.r + (j + 0.7) * pitch, ns = Math.max(12, Math.ceil((TAU * rr) / (1.4 * S)));
      for (let i = 0; i < ns; i++) {
        const t0 = (i / ns) * TAU, t1 = ((i + 1) / ns) * TAU, tm = (t0 + t1) / 2, mx = s.x + Math.cos(tm) * rr, mz = s.z + Math.sin(tm) * rr;
        if (!free(mx, mz)) continue;
        const mine = off(s, mx, mz);
        if (stones.some((o) => o !== s && off(o, mx, mz) < mine)) continue;
        line(s.x + Math.cos(t0) * rr, s.z + Math.sin(t0) * rr, s.x + Math.cos(t1) * rr, s.z + Math.sin(t1) * rr);
      }
    }
  });
  let rows = 0;
  if (P.style === 'rows') {
    const nz = Math.floor(c / pitch), sl = 1.5 * S, nx = Math.ceil((2 * a) / sl);
    for (let m = -nz; m < nz; m++) {
      const z = (m + 0.5) * pitch;
      rows++;
      for (let i = 0; i < nx; i++) {
        const x0 = -a + i * sl, x1 = x0 + sl, mx = (x0 + x1) / 2;
        if (free(mx, z) && !stones.some((o) => off(o, mx, z) < (P.rings + 0.2) * pitch)) line(x0, z, x1, z);
      }
    }
  }
  group.add(st.mesh(fx, 0.85, mixHex(A, 0xffffff, 0.3)));
  const halo = lightPoints(1, fx, A, (P.keeper === 'lantern' ? 0.45 * kh : 4 * S), 1);
  halo.pos.set([kx, ly, kz]);
  group.add(halo.points);
  const nq = st.n, top = yb + kh, wave = 8 * S, speed = 3.2 * S;
  let near = 0;
  return finish({ group, light: V(kx, ly, kz), focus: V(0, yb + 2 * S, 0), span: a + kerb + 1, clear: Math.min(95, a + kerb + 7), height: top }, fx, (t, beat, cc) => {
    // from one boulder at a time, rings of brightness going out over all the raking
    near += ((cc.near ?? 0) - near) * 0.03;
    const cyc = Math.floor(t / P.period), tau = t - cyc * P.period, s = stones[cyc % stones.length];
    const front = speed * tau, out = 1 - smoothstep(0.78, 1, tau / P.period), base = 0.17 + 0.08 * near;
    for (let q = 0; q < nq; q++) {
      const dd = Math.hypot(qx[q] - s.x, qz[q] - s.z) - s.r;
      st.set(q, base + (dd < front ? out * Math.exp(-dd / (34 * S)) * Math.pow(Math.max(0, Math.sin(((front - dd) / wave) * TAU)), 2) * 0.85 : 0));
    }
    st.done();
  });
}

// ------------------------------------------------------------------ belljars
function belljars(d, A, mats, ctx) {
  const P = d.params, S = d.size, g = ctx.ground, b = new Builder(), R = rng(d.seed[5]), n = P.n, J = P.jars;
  const pale = mixHex(STONE[3], RIM, 0.28), gap = 1.1 * S, at = new Array(n);
  let span;
  if (P.stand === 'table') {
    // a long table on slabs: one row of jars, or two
    const two = n > 7, rmax = Math.max(...J.map((j) => j.r)), zr = two ? rmax + 0.5 * S : 0, idx = J.map((_, i) => i);
    let len = 0;
    (two ? [idx.filter((i) => i % 2 === 0), idx.filter((i) => i % 2)] : [idx]).forEach((row, ri) => {
      let x = 0;
      const xs = row.map((i) => { x += J[i].r; const v = x; x += J[i].r + gap; return v; }), L = x - gap;
      len = Math.max(len, L);
      row.forEach((i, k) => { at[i] = { x: xs[k] - L / 2, z: ri ? -zr : zr }; });
    });
    const L = len + 2.6 * S, W = 2 * zr + 2 * rmax + 2.2 * S, tt = 1.1 * S;
    let hi = g(0, 0);
    for (let i = -4; i <= 4; i++) hi = Math.max(hi, g((i / 8) * L, 0));
    const yT = hi + P.standH;
    b.add(new THREE.BoxGeometry(L, tt, W), mat(0, yT - tt / 2, 0), (x, y) => (y > tt * 0.49 ? STONE[3] : STONE[2]), 0, { flat: true });
    const nl = Math.max(2, Math.round(L / (12 * S)) + 1);
    for (let l = 0; l < nl; l++) {
      const x = lerp(-L / 2 + 2 * S, L / 2 - 2 * S, l / (nl - 1)), yf = Math.min(g(x, -W / 2), g(x, W / 2)) - 1.5, h = yT - tt - yf;
      b.box(1.6 * S, h, W - 1.8 * S, mat(x, yf + h / 2, 0), STONE[1]);
    }
    b.box(L - 4 * S, 0.9 * S, 0.9 * S, mat(0, yT - tt - P.standH * 0.5, 0), STONE[2]);
    for (const p of at) p.y = yT;
    span = L / 2 + 1;
  } else {
    // a stepped plinth: the largest jar on top, the rest in rings on the steps under it
    const order = J.map((_, i) => i).sort((p, q) => J[q].r - J[p].r), m1 = Math.min(n - 1, n > 6 ? 5 : n - 1);
    const rings = [order.slice(1, 1 + m1), order.slice(1 + m1)].filter((r) => r.length), tiers = [J[order[0]].r + 1.2 * S], rad = [];
    for (const ring of rings) {
      const rm = Math.max(...ring.map((i) => J[i].r)), around = ring.reduce((s, i) => s + 2 * J[i].r + gap, 0);
      const rr = Math.max(tiers[tiers.length - 1] + rm + 0.8 * S, around / TAU);
      rad.push(rr);
      tiers.push(rr + rm + 1.2 * S);
    }
    const [lo, hi] = groundSpan(g, tiers[tiers.length - 1]), step = P.standH / 2, yT = (j) => hi + 0.3 + step * (tiers.length - j);
    tiers.forEach((r, j) => {
      const h = yT(j) - lo + 1.2;
      b.add(new THREE.CylinderGeometry(r, r + 0.3 * S, h, P.sides), mat(0, yT(j) - h / 2, 0, 0, 0.2, 0), (x, y) => (y > h * 0.49 ? STONE[3] : STONE[1 + (j % 2)]), 0, { flat: true });
    });
    at[order[0]] = { x: 0, z: 0, y: yT(0) };
    rings.forEach((ring, ri) => {
      const around = ring.reduce((s, i) => s + 2 * J[i].r + gap, 0);
      let ang = R() * TAU;
      for (const i of ring) {
        ang += ((J[i].r + gap / 2) / around) * TAU;
        at[i] = { x: Math.cos(ang) * rad[ri], z: Math.sin(ang) * rad[ri], y: yT(ri + 1) };
        ang += ((J[i].r + gap / 2) / around) * TAU;
      }
    });
    span = tiers[tiers.length - 1] + 1;
  }
  // each jar on a turned foot of stone; the glass pale and faint
  const gb = new Builder(), foot = 0.5 * S;
  let top = 0;
  J.forEach((j, i) => {
    const p = at[i], r = j.r, h = j.h;
    b.add(new THREE.CylinderGeometry(r * 1.12, r * 1.2, foot, 14), mat(p.x, p.y + foot / 2, p.z), (x, y) => (y > foot * 0.49 ? pale : STONE[2]), 0, { flat: true });
    const prof = [[1, 0], [1, 0.3], [1, 0.6], [0.96, 0.72], [0.83, 0.83], [0.6, 0.91], [0.32, 0.955], [0.1, 0.97], [0.1, 0.985], [0.2, 1], [0.22, 1.03], [0.12, 1.06], [0.001, 1.065]];
    gb.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * r, y * h)), 14), mat(p.x, p.y + foot, p.z), 0xffffff, i === P.empty ? 0.5 : 1);
    top = Math.max(top, p.y + foot + h * 1.07);
  });
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  const glass = lightMesh(gb.build(), fx, 0.2, { fresnel: 0.9 });
  glass.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.65));
  group.add(glass);
  // what is kept under them: a flame, or a seedling, of light (one unit tall, to be scaled)
  const fb = new Builder(), flame = P.kind === 'flame';
  if (flame) {
    const fp = [[0.001, 0], [0.16, 0.04], [0.24, 0.16], [0.25, 0.3], [0.19, 0.5], [0.1, 0.74], [0.001, 1]].map(([x, y]) => new THREE.Vector2(x, y));
    fb.add(new THREE.LatheGeometry(fp, 7), null, 0xffffff, (x, y) => 0.85 - 0.6 * y);
    fb.add(new THREE.LatheGeometry(fp, 5), mat(0, 0.03, 0, 0, 0, 0, 0.5), 0xffffff, 1);
  } else {
    fb.box(0.05, 0.74, 0.05, mat(0, 0.37, 0), 0xffffff, 0.7);
    for (const [q, y0, len] of [[1, 0.4, 0.38], [-1, 0.55, 0.3]]) {
      const p0 = [0, y0, 0], tip = [q * len, y0 + len * 0.58, 0], l = [q * len * 0.52, y0 + len * 0.42, len * 0.24], r = [q * len * 0.52, y0 + len * 0.42, -len * 0.24];
      fb.tri(p0, l, tip, 0xffffff, 0.75);
      fb.tri(p0, tip, r, 0xffffff, 0.75);
    }
    fb.add(new THREE.OctahedronGeometry(0.11, 0), mat(0, 0.86, 0, 0, 0, 0, 1, 1.6, 1), 0xffffff, 1);
  }
  const im = new THREE.InstancedMesh(fb.build(), glowMaterial({ opacity: 0.95, fog: 0.6, side: THREE.DoubleSide, tint: mixHex(A, 0xffffff, 0.35) }), n - 1);
  im.layers.set(LAYER_FX);
  im.frustumCulled = false;
  fx.push({ m: im.material, o: 0.95, k: 1 });
  const hearts = lightPoints(n - 1, fx, A, 2.2 * S, 1);
  group.add(im, hearts.points);
  const F = [];
  J.forEach((j, i) => { if (i !== P.empty) F.push({ base: V(at[i].x, at[i].y + foot + 0.05, at[i].z), s: j.h * (flame ? 0.36 : 0.4), lx: 0, lz: 0, rate: R.range(0.015, 0.05), ph: R() * TAU }); });
  F.forEach((f, k) => { hearts.sz[k] = f.s / (3 * S); });
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), ax = V(), sc = V(), hy = flame ? 0.22 : 0.86;
  let near = 0;
  return finish({ group, light: F[0].base.clone().setY(F[0].base.y + F[0].s * 0.3), focus: V(0, top * 0.55, 0), span, clear: Math.min(95, span + 6), height: top, solid: { r: span, top: top + 1, low: 0 } }, fx, (t, beat, c) => {
    near += ((c.near ?? 0) - near) * 0.03;
    const ship = c.shipLocal, amt = 0.1 + 0.3 * near;
    F.forEach((f, k) => {
      // each leans toward the ship, in its own time
      const dx = ship ? ship.x - f.base.x : 0, dz = ship ? ship.z - f.base.z : 0, l = Math.hypot(dx, dz) || 1;
      f.lx += ((dx / l) * amt - f.lx) * f.rate;
      f.lz += ((dz / l) * amt - f.lz) * f.rate;
      const wx = f.lx + 0.03 * Math.sin(t * 1.7 + f.ph), wz = f.lz + 0.03 * Math.cos(t * 1.3 + f.ph * 2), ang = Math.hypot(wx, wz) || 1e-5;
      q4.setFromAxisAngle(ax.set(wz / ang, 0, -wx / ang), ang);
      const fl = flame ? 1 + 0.08 * Math.sin(t * 5.3 + f.ph) + 0.05 * Math.sin(t * 8.7 + f.ph * 2) : 1 + 0.02 * Math.sin(t * 0.9 + f.ph);
      im.setMatrixAt(k, m4.compose(f.base, q4, sc.set(f.s * (2 - fl), f.s * fl, f.s * (2 - fl))));
      const sn = Math.sin(ang) * f.s * hy;
      hearts.pos[k * 3] = f.base.x + (wx / ang) * sn; hearts.pos[k * 3 + 1] = f.base.y + Math.cos(ang) * f.s * hy; hearts.pos[k * 3 + 2] = f.base.z + (wz / ang) * sn;
      hearts.al[k] = flame ? 0.6 + 0.4 * fl * fl - 0.3 : 0.8;
    });
    im.instanceMatrix.needsUpdate = true;
    hearts.g.attributes.position.needsUpdate = true;
    hearts.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ tensegrity
// A mast in the manner of the needle towers: stages of three struts, each a twisted
// prism (its top triangle turned five twelfths of a turn from its foot), each stage of
// the other hand from the one under it and hung partly down inside it, so that no strut
// touches another; only cables join them. The whole is rebuilt each frame from its
// corners, which sway.
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
function axes(a, b) {
  _d.subVectors(b, a).normalize();
  if (Math.abs(_d.y) > 0.98) _u.set(1, 0, 0); else _u.set(0, 1, 0);
  _u.cross(_d).normalize();
  _w.crossVectors(_d, _u);
}
const BOX_FACES = [[2, 3, 7, 6, 1, 0], [0, 1, 5, 4, -1, 0], [1, 3, 7, 5, 0, 1], [0, 2, 6, 4, 0, -1], [0, 1, 3, 2, 0, 0, -1], [4, 5, 7, 6, 0, 0, 1]];
const _c8 = Array.from({ length: 8 }, () => new THREE.Vector3());
function writeStrut(arr, o, a, b, w) {
  axes(a, b);
  for (let i = 0; i < 8; i++) _c8[i].copy(i & 4 ? b : a).addScaledVector(_d, (i & 4 ? 1 : -1) * w * 0.4).addScaledVector(_u, (i & 2 ? 0.5 : -0.5) * w).addScaledVector(_w, (i & 1 ? 0.5 : -0.5) * w);
  for (const f of BOX_FACES) {
    const p0 = _c8[f[0]], p1 = _c8[f[1]], p2 = _c8[f[2]], p3 = _c8[f[3]];
    const nx = _u.x * f[4] + _w.x * f[5] + _d.x * (f[6] || 0), ny = _u.y * f[4] + _w.y * f[5] + _d.y * (f[6] || 0), nz = _u.z * f[4] + _w.z * f[5] + _d.z * (f[6] || 0);
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z, vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
    const flip = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0;
    for (const p of flip ? [p0, p3, p2, p0, p2, p1] : [p0, p1, p2, p0, p2, p3]) { arr[o++] = p.x; arr[o++] = p.y; arr[o++] = p.z; }
  }
}
function writeCable(arr, o, a, b, w) {
  axes(a, b);
  for (const n of [_u, _w]) {
    const x = n.x * w * 0.5, y = n.y * w * 0.5, z = n.z * w * 0.5;
    arr.set([a.x - x, a.y - y, a.z - z, a.x + x, a.y + y, a.z + z, b.x + x, b.y + y, b.z + z, a.x - x, a.y - y, a.z - z, b.x + x, b.y + y, b.z + z, b.x - x, b.y - y, b.z - z], o);
    o += 18;
  }
}
function tensegrity(d, A, mats, ctx) {
  const P = d.params, S = d.size, g = ctx.ground, K = P.stages, R = rng(d.seed[5]), b = new Builder();
  const [, hi] = groundSpan(g, P.radius), y0 = hi + P.lift, H = P.height, rise = H - P.lift;
  const hs = Array.from({ length: K }, (_, k) => Math.pow(P.taper, k * 0.5));
  const unit = rise / (hs.reduce((s, x) => s + x, 0) - P.overlap * hs.slice(0, K - 1).reduce((s, x) => s + x, 0));
  const rest = [], struts = [], cables = [];
  const node = (r, a, y) => rest.push(V(Math.cos(a) * r, y, Math.sin(a) * r)) - 1;
  const th0 = R() * TAU;
  let th = th0, yb = y0, under = null, first = null;
  for (let k = 0; k < K; k++) {
    const s = P.hand * (k % 2 ? -1 : 1), h = hs[k] * unit, rb = P.radius * Math.pow(P.taper, k), rt = rb * Math.sqrt(P.taper);
    const B = [0, 1, 2].map((i) => node(rb, th + (i * TAU) / 3, yb)), T = [0, 1, 2].map((i) => node(rt, th + (i * TAU) / 3 + (s * TAU * 5) / 12, yb + h));
    for (let i = 0; i < 3; i++) {
      struts.push([B[i], T[i], k, Math.min(P.thick, rb * 0.19)]);
      cables.push([B[i], B[(i + 1) % 3]], [T[i], T[(i + 1) % 3]], [T[i], B[(i + s + 3) % 3]]);
    }
    // the saddle: each corner of the stage under it holds the two corners of this one beside it
    if (under) for (let i = 0; i < 3; i++) cables.push([under[i], B[i]], [under[i], B[(i + 2) % 3]]);
    else first = B;
    under = T;
    th += (s * TAU * 5) / 12 + TAU / 6;
    yb += h * (1 - P.overlap);
  }
  // a light held over its top, and three pylons it hangs from
  const jewel = rest.push(V(0, hi + H + 1.8 * S, 0)) - 1, moving = rest.length;
  for (const i of under) cables.push([i, jewel]);
  const Ra = P.anchor * P.radius, hp = P.lift + P.post;
  for (let i = 0; i < 3; i++) {
    const a = th0 + TAU / 6 + (i * TAU) / 3, x = Math.cos(a) * Ra, z = Math.sin(a) * Ra, yg = g(x, z);
    slab(b, x, z, yg - 1, 2.4 * S, hp + 1, 2 * S, -a - Math.PI / 2, 0, STONE[1 + (i % 2)], 0.6);
    b.box(0.7 * S, 0.5 * S, 0.7 * S, mat(x, yg + hp + 0.2 * S, z, 0, -a, 0), A, 1);
    const p = rest.push(V(x, yg + hp, z)) - 1;
    cables.push([p, first[i]], [p, first[(i + 1) % 3]]);
  }
  const group = new THREE.Group(), fx = [];
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the struts: dark, their ends pale
  const sg = new THREE.BufferGeometry(), sp = new Float32Array(struts.length * 108), scol = new Float32Array(struts.length * 108), col = new THREE.Color(), end = new THREE.Color(mixHex(STONE[3], RIM, 0.5));
  struts.forEach(([, , k], i) => {
    col.setHex(STONE[1 + ((i + k) % 3)]);
    for (let j = 0; j < 36; j++) (j < 24 ? col : end).toArray(scol, i * 108 + j * 3);
  });
  const spa = new THREE.BufferAttribute(sp, 3);
  spa.setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('position', spa);
  sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  sg.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(struts.length * 36), 1));
  const mast = new THREE.Mesh(sg, mats.glow);
  mast.frustumCulled = false;
  group.add(mast);
  // the cables: two crossed ribbons of light each
  const cg = new THREE.BufferGeometry(), cp = new Float32Array(cables.length * 36), cem = new Float32Array(cables.length * 12).fill(0.5);
  const cpa = new THREE.BufferAttribute(cp, 3), cea = new THREE.BufferAttribute(cem, 1);
  cpa.setUsage(THREE.DynamicDrawUsage);
  cea.setUsage(THREE.DynamicDrawUsage);
  cg.setAttribute('position', cpa);
  cg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cables.length * 36).fill(1), 3));
  cg.setAttribute('emissive', cea);
  const web = lightMesh(cg, fx, 0.95);
  web.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.3));
  group.add(web);
  const jb = new Builder();
  jb.ico(0.65 * S, 1, null, 0xffffff, 1);
  const gem = lightMesh(jb.build(), fx, 1);
  gem.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.45));
  group.add(gem);
  const now = rest.map((p) => p.clone()), lev = cables.map(([p, q]) => clamp(((rest[p].y + rest[q].y) / 2 - hi) / H, 0, 1));
  const ph = [0, 1, 2, 3, 4].map(() => R() * TAU), cw = 0.17 * S;
  let near = 0;
  const top = hi + H + 2.5 * S;
  return finish({ group, light: V(0, hi + H + 1.8 * S, 0), focus: V(0, hi + H * 0.5, 0), span: Ra + 2 * S, clear: Ra + 8 * S > 95 ? 95 : Ra + 8, height: top, solid: { r: Ra, top: top + S, low: 0 } }, fx, (t, beat, c) => {
    // it sways a very little, more the higher (and a little more with the ship's passing)
    near += ((c.near ?? 0) - near) * 0.03;
    const amp = P.sway * H * (1 + 1.2 * near);
    const sx = amp * (Math.sin(0.37 * t + ph[0]) + 0.4 * Math.sin(0.83 * t + ph[1])), sz = amp * (Math.cos(0.29 * t + ph[2]) + 0.4 * Math.sin(0.71 * t + ph[3])), tw = 0.014 * Math.sin(0.23 * t + ph[4]);
    for (let i = 0; i < moving; i++) {
      const p = rest[i], f = Math.pow(clamp((p.y - y0) / rise, 0, 1.1), 1.5), ca = Math.cos(tw * f), sa = Math.sin(tw * f);
      now[i].set(p.x * ca - p.z * sa + sx * f, p.y, p.x * sa + p.z * ca + sz * f);
    }
    struts.forEach(([p, q, , w], i) => writeStrut(sp, i * 108, now[p], now[q], w));
    cables.forEach(([p, q], i) => {
      writeCable(cp, i * 36, now[p], now[q], cw);
      // on the rhythm, brightness climbs the cables from the foot up
      const u = beat * 0.5 - lev[i] * 1.2, fr = u - Math.floor(u);
      cem.fill(0.3 + 0.7 * Math.pow(1 - fr, 3), i * 12, i * 12 + 12);
    });
    spa.needsUpdate = true; cpa.needsUpdate = true; cea.needsUpdate = true;
    gem.position.copy(now[jewel]);
  });
}

// ------------------------------------------------------------------ the set
const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : `${a[0]}`);
export const SET = {
  labyrinth: {
    code: 'LBY', cls: 'Labyrinth', nouns: ['Labyrinth', 'Maze', 'Thread', 'Circuit', 'Winding', 'Way'], place: 'any', kin: ['knot', 'nautilus', 'serpent'], voice: ['glass', 'breath'],
    params(R, size) {
      const P = { seq: labSeq(R), across: R.range(45, 60) * size, wall: R.range(1.5, 2.2) * size, gate: R.range(3.6, 5.6) * size, speed: R.range(5, 8) * size, rest: R.range(5, 10), beam: R.range(20, 30) * size };
      P.text = `A labyrinth of ${numw(P.seq.length)} circuits, ${Math.round(P.across)} meters across, and one path through it: ${formatInt(Math.round(labPlan(P.seq, P.across).L))} meters from its mouth to the stone in the middle, by the circuits ${P.seq.join(' ')}. A light walks it in, paying out a thread, and walks out again taking it up.`;
      return P;
    },
    build: labyrinth,
  },
  well: {
    code: 'WEL', cls: 'Well', nouns: ['Well', 'Shaft', 'Windlass', 'Wheel', 'Cistern', 'Draw'], place: 'any', kin: ['tidegate', 'spire', 'turning'], voice: ['whale', 'grains'],
    params(R, size) {
      const P = { mouth: R.range(6, 8.5) * size, wall: R.range(3.4, 5.2) * size, height: R.range(24, 34) * size, spokes: R.pick([5, 6, 7, 8, 9]), count: R.pick([3, 5, 7, 8, 11, 13]), treads: R.pick([13, 21, 34]), turn: R.chance(0.5) ? 1 : -1, coping: R.int(9, 17), ties: R.int(1, 3), pause: R.range(8, 16), speed: R.range(3.4, 5) * size, beam: R.range(14, 26) * size };
      P.wheel = P.mouth * R.range(0.56, 0.66);
      P.text = `A well ${Math.round(P.mouth * 2)} meters across at the mouth, a stair winding down inside it, ${P.treads} treads to the turn; over it a frame ${Math.round(P.height)} meters tall and a wheel of ${numw(P.spokes)} spokes. ${NUMW[P.count]} lights are drawn up out of the dark, one by one, and let go.`;
      return P;
    },
    build: well,
  },
  archive: {
    code: 'ARV', cls: 'Archive', nouns: ['Archive', 'Tablets', 'Record', 'Ledger', 'Library', 'Annals'], place: 'any', kin: ['loom', 'cathedral', 'menger'], voice: ['glitch', 'glass'],
    params(R, size) {
      const P = { layout: R.pick(['spiral', 'spiral', 'ranks', 'arc']), cols: R.pick([7, 9, 11]), rows: R.int(14, 22), kind: R.chance(0.65) ? 'automaton' : 'sieve', rule: R.pick([30, 90, 110, 150, 54, 60, 22, 126, 62, 45]), cell: R.range(0.62, 0.78) * size, rate: R.pick([1, 2]), grow: R.chance(0.6), rise: R.range(3, 7) * size, pitch: R.range(8.5, 11) * size, aisle: R.range(9, 13) * size, brokenAt: R.range(0.35, 0.6) };
      P.n = P.layout === 'ranks' ? R.pick([6, 8, 10]) : R.pick([8, 9, 11, 13, 15]);
      P.broken = R.chance(0.5) ? R.int(1, P.n - 1) : -1;
      P.inner = (P.cols + 1.6) * P.cell * R.range(0.85, 1.1);
      const how = { spiral: 'in a spiral', ranks: 'in two ranks, face to face', arc: 'in an arc' }[P.layout];
      const what = P.kind === 'sieve' ? `the numbers from 1 to ${formatInt(P.n * P.rows * P.cols)} in rows of ${P.cols}, the primes marked` : `rule ${P.rule} of the automata, run for ${P.n * P.rows} rows from a single mark`;
      P.text = `${NUMW[P.n]} tablets of stone ${how}, each scored with ${P.rows} rows of ${P.cols} places: ${what}${P.broken >= 0 ? '; one tablet is broken, and its rows are lost' : ''}. A light reads them a row at a time, and begins again.`;
      return P;
    },
    build: archive,
  },
  amphitheatre: {
    code: 'AMP', cls: 'Amphitheatre', nouns: ['Amphitheatre', 'Theatre', 'Audience', 'Hearing', 'Assembly', 'Chorus'], place: 'any', kin: ['choir', 'halo', 'corolla'], voice: ['breath', 'glass'],
    params(R, size) {
      const P = { rings: R.int(5, 7), across: R.range(46, 56) * size, riser: R.range(1.0, 1.5) * size, open: R.range(0.2, 0.32) * TAU, crown: R.chance(0.65) ? 'pylons' : 'posts', crownH: R.range(11, 15) * size, posts: R.pick([13, 21]), every: R.pick([1, 1, 2]) };
      const i0 = R.int(0, P.rings === 7 ? 1 : 2);
      P.counts = FIB.slice(i0, i0 + P.rings);
      P.floor = (P.across / 2) * R.range(0.26, 0.34);
      P.text = `An amphitheatre of ${numw(P.rings)} stepped rings, ${Math.round(P.across)} meters across and open on one side; ${list(P.counts)} lights are seated on its rings, ${P.counts.reduce((s, x) => s + x, 0)} in all, about a larger one on the floor.`;
      return P;
    },
    build: amphitheatre,
  },
  aqueduct: {
    code: 'AQD', cls: 'Aqueduct', nouns: ['Aqueduct', 'Arches', 'Channel', 'Conduit', 'Span', 'Fall'], place: 'any', kin: ['cathedral', 'tidegate', 'serpent'], voice: ['grains', 'whale'],
    params(R, size) {
      const P = { arches: R.int(4, 7), tiers: R.pick([1, 1, 2]), bay: R.range(8.5, 11.5) * size, depth: R.range(3, 4.2) * size, stub: R.range(0.25, 0.5), rubble: R.int(5, 11), flow: R.range(1.8, 3), pool: R.range(4, 6.5) * size, end: R.chance(0.5) ? 1 : -1 };
      P.height = (P.tiers === 2 ? R.range(32, 42) : R.range(24, 34)) * size;
      P.pier = P.bay * R.range(0.2, 0.28);
      P.text = `An aqueduct of ${numw(P.arches)} arches${P.tiers === 2 ? ', a tier of smaller ones over them' : ''}, ${Math.round(P.arches * P.bay + P.pier)} meters long and ${Math.round(P.height)} tall, broken off at one end; the light in its channel pours from the break and falls to a pool on the ground.`;
      return P;
    },
    build: aqueduct,
  },
  garden: {
    code: 'GDN', cls: 'Stone garden', nouns: ['Garden', 'Bed', 'Stones', 'Rake', 'Stillness', 'Courtyard'], place: 'any', kin: ['archipelago', 'halo', 'lotus'], voice: ['breath', 'grains'],
    params(R, size) {
      const P = { n: R.pick([3, 5, 5, 7]), long: R.range(40, 50) * size, shape: R.pick(['rect', 'rect', 'oval']), style: R.pick(['rows', 'rows', 'cells']), rings: R.int(3, 6), pitch: R.range(1.0, 1.35) * size, keeper: R.chance(0.55) ? 'lantern' : 'pole', period: R.range(11, 17) };
      P.wide = P.long * R.range(0.58, 0.78);
      P.groups = R.pick({ 3: [[2, 1]], 5: [[3, 2], [2, 2, 1]], 7: [[3, 2, 2], [3, 3, 1], [4, 2, 1]] }[P.n]);
      P.keeperH = (P.keeper === 'lantern' ? R.range(7.5, 10) : R.range(11, 15)) * size;
      const raked = P.style === 'rows' ? `${numw(P.rings)} rings raked about each and straight lines across the rest of the bed` : 'rings raked about each as far as they meet';
      P.text = `A garden of raked stone, ${Math.round(P.long)} meters by ${Math.round(P.wide)}: ${numw(P.n)} boulders in groups of ${list(P.groups)}, ${raked}, drawn in faint light. ${P.keeper === 'lantern' ? `A stone lantern ${Math.round(P.keeperH)} meters tall keeps it` : `A pole ${Math.round(P.keeperH)} meters tall, lit at its tip, keeps it`}.`;
      return P;
    },
    build: garden,
  },
  belljars: {
    code: 'JAR', cls: 'Bell jars', nouns: ['Bell Jars', 'Cloches', 'Vigil', 'Nursery', 'Flames', 'Glasshouse'], place: 'any', kin: ['chandelier', 'seedpod', 'medusa'], voice: ['glass', 'chirp'],
    params(R, size) {
      const P = { n: R.int(5, 13), stand: R.pick(['table', 'table', 'plinth']), kind: R.pick(['flame', 'seedling']), standH: R.range(3.4, 5) * size, sides: R.pick([8, 12, 16]) };
      P.empty = R.int(0, P.n - 1);
      P.jars = Array.from({ length: P.n }, () => { const r = (P.n > 9 ? R.range(1.8, 3.1) : R.range(2.0, 3.8)) * size; return { r, h: r * R.range(3.2, 4.6) }; });
      P.text = `${NUMW[P.n]} bell jars of glass on a ${P.stand === 'table' ? 'table' : 'stepped plinth'} of stone, the tallest ${Math.round(Math.max(...P.jars.map((j) => j.h)))} meters; a ${P.kind} of light in each ${P.stand === 'table' ? `but the ${ORD[P.empty]}, which is empty` : 'but one, which is empty and dark'}. They lean after whatever passes.`;
      return P;
    },
    build: belljars,
  },
  tensegrity: {
    code: 'TNS', cls: 'Tensegrity mast', nouns: ['Mast', 'Needle', 'Tension', 'Balance', 'Struts', 'Tower'], place: 'any', kin: ['spire', 'loom', 'helicon'], voice: ['fm', 'glass'],
    params(R, size) {
      const P = { stages: R.int(4, 7), height: R.range(40, 58) * size, radius: R.range(6, 9) * size, taper: 0, overlap: R.range(0.22, 0.36), hand: R.chance(0.5) ? 1 : -1, thick: R.range(0.6, 0.85) * size, lift: R.range(2, 4) * size, anchor: R.range(1.5, 2.1), post: R.range(3, 6) * size, sway: R.range(0.008, 0.016) };
      P.taper = R.range(Math.max(0.8, Math.pow(0.45, 1 / (P.stages - 1))), 0.93);
      P.text = `A mast of ${numw(P.stages)} stages, ${Math.round(P.height)} meters tall: ${P.stages * 3} struts of dark stone, none touching another or the ground, hung from three pylons by ${P.stages * 15 + 3} cables of light. Each stage is turned against the one under it.`;
      return P;
    },
    build: tensegrity,
  },
};
