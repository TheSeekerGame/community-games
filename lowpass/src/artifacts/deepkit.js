import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial, deepMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { stratum } from './strata.js';
import { STONE, PULSE, Y } from './parts.js';

// The deep forms' kit: what every form of the deep is built with (deepforms.js, deepforms2.js,
// layers.js): the Kit (four kinds of stuff per moving part) and the shapes they share.

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
export const hash3 = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };
export const PHI = (1 + Math.sqrt(5)) / 2;
export const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// ------------------------------------------------------------------ the kit
export class Kit {
  constructor(art, parent) {
    this.art = art;
    this.group = new THREE.Group();
    if (parent) parent.add(this.group);
    this.stone = new Builder();
    this.shell = new Builder();
    this.lit = new Builder();
    this.glow = new Builder();
    art.kits.push(this);
  }
  sub(x = 0, y = 0, z = 0) {
    const k = new Kit(this.art, this.group);
    k.group.position.set(x, y, z);
    return k;
  }
  finish() {
    if (this.done) return;
    this.done = true;
    const m = this.art.mats;
    for (const [b, material, fx] of [[this.stone, m.stone], [this.shell, m.shell], [this.lit, this.litMat || m.lit], [this.glow, m.light, true]]) {
      if (b.empty) continue;
      const mesh = new THREE.Mesh(b.build(), material);
      if (fx) { mesh.layers.set(LAYER_FX); mesh.frustumCulled = false; }
      this.group.add(mesh);
    }
  }
}

// ------------------------------------------------------------------ shapes
export function orient(pos, dir, sx = 1, sy = 1, sz = 1) {
  _v.copy(dir).normalize();
  _q.setFromUnitVectors(Y, _v);
  return new THREE.Matrix4().compose(pos.clone(), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

// a bar from a to c
export function bar(b, a, c, w, color, em = 0) {
  const d = _w.subVectors(c, a), len = d.length();
  if (len < 1e-4) return;
  b.box(w, len + w * 0.3, w, orient(_v.addVectors(a, c).multiplyScalar(0.5).clone(), d), color, em);
}

// a crystal along dir from base: a prism and a point
export function shard(b, base, dir, len, r, sides, color, em = 0, tip = null) {
  const m = orient(base, dir);
  b.add(new THREE.CylinderGeometry(r, r * 0.8, len * 0.72, sides), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, len * 0.36, 0)), color, em);
  b.add(new THREE.ConeGeometry(r, len * 0.28, sides), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, len * 0.86, 0)), tip ?? color, em);
}

// A petal: a curved, cupped blade, base at the origin, along +Y, its outside to +Z; then
// tilted out by `tilt`, turned to face `a`, set at radius r0. Shell colors from root to tip.
export function petal(b, L, W, tilt, a, r0, y0, cup, curl, lo, hi, segU = 7, segV = 4, edge = null, ew = 0) {
  const m = mat(Math.cos(a) * r0, y0, Math.sin(a) * r0, tilt, Math.PI / 2 - a, 0);
  const P = (u, v) => {
    const w = W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.85);
    return new THREE.Vector3(v * w, u * L, -cup * v * v * w + curl * L * u * u).applyMatrix4(m);
  };
  for (let i = 0; i < segU; i++) {
    const u0 = i / segU, u1 = (i + 1) / segU;
    const col = mixHex(lo, hi, (u0 + u1) / 2);
    for (let j = 0; j < segV; j++) {
      const v0 = -1 + (2 * j) / segV, v1 = -1 + (2 * (j + 1)) / segV;
      const p00 = P(u0, v0), p10 = P(u1, v0), p11 = P(u1, v1), p01 = P(u0, v1);
      b.quad(p00.toArray(), p10.toArray(), p11.toArray(), p01.toArray(), col);
    }
  }
  if (edge) {
    for (const v of [-1, 1]) for (let i = 0; i < segU; i++) bar(edge.b, P(i / segU, v), P((i + 1) / segU, v), ew, edge.color, 1);
  }
}

// the solids: their corners and edges (and faces, for the five that three.js knows)
export const POLY = {};
export function polyOf(name) {
  if (POLY[name]) return POLY[name];
  let verts = [];
  const perms = (x, y, z) => [[x, y, z], [y, z, x], [z, x, y]];
  if (name === 'cuboctahedron') { for (const s of [1, -1]) for (const t of [1, -1]) verts.push([s, t, 0], [s, 0, t], [0, s, t]); }
  else if (name === 'icosidodecahedron') {
    for (const s of [1, -1]) for (const p of perms(0, 0, s * PHI)) verts.push(p);
    for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) for (const p of perms(a * 0.5, b * PHI / 2, c * PHI * PHI / 2)) verts.push(p);
  } else if (name === 'stella') { for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) verts.push([x, y, z]); }
  else {
    const g = { tetrahedron: new THREE.TetrahedronGeometry(1), cube: new THREE.BoxGeometry(1, 1, 1), octahedron: new THREE.OctahedronGeometry(1),
      dodecahedron: new THREE.DodecahedronGeometry(1), icosahedron: new THREE.IcosahedronGeometry(1) }[name];
    const p = g.attributes.position;
    const seen = new Set();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(k)) { seen.add(k); verts.push([p.getX(i), p.getY(i), p.getZ(i)]); }
    }
    g.dispose();
  }
  const V = verts.map((v) => new THREE.Vector3(...v).normalize());
  let min = Infinity;
  const pairs = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
    const dd = V[i].distanceTo(V[j]);
    pairs.push([i, j, dd]);
    // the stella's edges are within each of its two tetrahedra
    if (name !== 'stella' || (verts[i][0] * verts[i][1] * verts[i][2]) === (verts[j][0] * verts[j][1] * verts[j][2])) min = Math.min(min, dd);
  }
  const E = pairs.filter(([i, j, dd]) => Math.abs(dd - min) < 1e-3 && (name !== 'stella' || verts[i][0] * verts[i][1] * verts[i][2] === verts[j][0] * verts[j][1] * verts[j][2])).map(([i, j]) => [i, j]);
  return (POLY[name] = { V, E });
}
export function solidGeo(name, r) {
  if (name === 'tetrahedron') return new THREE.TetrahedronGeometry(r);
  if (name === 'cube') return new THREE.BoxGeometry(r * 1.155, r * 1.155, r * 1.155);
  if (name === 'octahedron') return new THREE.OctahedronGeometry(r);
  if (name === 'dodecahedron') return new THREE.DodecahedronGeometry(r);
  if (name === 'icosahedron') return new THREE.IcosahedronGeometry(r);
  return null;
}

// a solid's edges as bars of light, its corners as lit beads
export function wire(k, name, r, w, color, bead) {
  const { V, E } = polyOf(name);
  for (const [i, j] of E) bar(k.glow, V[i].clone().multiplyScalar(r), V[j].clone().multiplyScalar(r), w, color, 1);
  if (bead) for (const v of V) k.lit.ico(w * 1.8, 0, mat(v.x * r, v.y * r, v.z * r), bead, PULSE);
}

// faces drawn in, each a pane of the sheen (stained glass), or stone
export function panes(b, geo, inset, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), c = new THREE.Vector3().fromBufferAttribute(p, i + 1), e = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const m = a.clone().add(c).add(e).multiplyScalar(1 / 3);
    const t = (x) => x.clone().lerp(m, inset).toArray();
    b.tri(t(a), t(c), t(e), typeof color === 'function' ? color(m) : color);
  }
  if (g !== geo) g.dispose();
  geo.dispose();
}

// points of light (one color a set), moved by the form's update; returns the positions
export function cloud(art, parent, n, color, size, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n), al = new Float32Array(n);
  const R = art.R;
  for (let i = 0; i < n; i++) { sz[i] = 0.6 + R() * 0.8; al[i] = 0.5 + R() * 0.5; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  parent.add(p);
  art.fades.push([m, opacity]);
  art.mats.extra.push(m);
  return { p, pos, attr: g.attributes.position };
}

// a mesh of light whose points move (veils, arms): strips of quads, each strip a list of
// pairs of points; color and alpha per vertex
export function strips(art, parent, nStrips, nPts, color, alphaOf, opacity) {
  const nv = nStrips * (nPts - 1) * 6;
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), em = new Float32Array(nv);
  const c = new THREE.Color();
  let o = 0;
  for (let s = 0; s < nStrips; s++) for (let i = 0; i < nPts - 1; i++) for (const [k, side] of [[i, 0], [i, 1], [i + 1, 0], [i, 1], [i + 1, 1], [i + 1, 0]]) {
    c.setHex(typeof color === 'function' ? color(s, k / (nPts - 1), side) : color);
    col.set([c.r, c.g, c.b], o * 3);
    em[o] = Math.max(0.0001, alphaOf(s, k / (nPts - 1), side));
    o++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  parent.add(mesh);
  art.fades.push([m, opacity]);
  art.mats.extra.push(m);
  // set(s, i, ax, ay, az, bx, by, bz): the pair of points i of strip s
  const A = new Float32Array(nStrips * nPts * 6);
  return {
    set(s, i, ax, ay, az, bx, by, bz) { A.set([ax, ay, az, bx, by, bz], (s * nPts + i) * 6); },
    commit() {
      let q = 0;
      for (let s = 0; s < nStrips; s++) for (let i = 0; i < nPts - 1; i++) {
        const p0 = (s * nPts + i) * 6, p1 = (s * nPts + i + 1) * 6;
        // (a_i, b_i, a_i+1) (b_i, b_i+1, a_i+1) as two triangles
        for (const off of [p0, p0 + 3, p1, p0 + 3, p1 + 3, p1]) { pos[q++] = A[off]; pos[q++] = A[off + 1]; pos[q++] = A[off + 2]; }
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

// a tube along a curve given as a function of t in [0, 1]
export function curveTube(b, f, n, radius, seg, color, em = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(f(i / n));
  b.tube(pts, radius, seg, color, em);
  return pts;
}

// a tube whose spine moves: its rings rewritten every frame (the serpent's body)
export function liveTube(k, art, N, seg, colorOf) {
  const nv = (N - 1) * seg * 6;
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), em = new Float32Array(nv);
  const cc = new THREE.Color();
  let o = 0;
  for (let i = 0; i < N - 1; i++) { cc.setHex(colorOf(i / (N - 1))); for (let q = 0; q < seg * 6; q++) col.set([cc.r, cc.g, cc.b], 3 * o++); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const mesh = new THREE.Mesh(g, art.mats.shell);
  mesh.frustumCulled = false;
  k.group.add(mesh);
  const C = Array.from({ length: N }, () => new THREE.Vector3()), Rad = new Float32Array(N), ring = new Float32Array(N * seg * 3);
  const up = new THREE.Vector3(0, 1, 0), tng = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3();
  return {
    set(i, p, r) { C[i].copy(p); Rad[i] = r; },
    commit() {
      for (let i = 0; i < N; i++) {
        tng.subVectors(C[Math.min(N - 1, i + 1)], C[Math.max(0, i - 1)]).normalize();
        side.crossVectors(tng, up);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        nrm.crossVectors(side, tng).normalize();
        for (let s2 = 0; s2 < seg; s2++) {
          const a = (s2 / seg) * TAU, ca = Math.cos(a) * Rad[i], sa = Math.sin(a) * Rad[i], j = (i * seg + s2) * 3;
          ring[j] = C[i].x + side.x * ca + nrm.x * sa; ring[j + 1] = C[i].y + side.y * ca + nrm.y * sa; ring[j + 2] = C[i].z + side.z * ca + nrm.z * sa;
        }
      }
      let q = 0;
      const put = (i, s2) => { const j = (i * seg + (s2 % seg)) * 3; pos[q++] = ring[j]; pos[q++] = ring[j + 1]; pos[q++] = ring[j + 2]; };
      for (let i = 0; i < N - 1; i++) for (let s2 = 0; s2 < seg; s2++) { put(i, s2); put(i + 1, s2); put(i + 1, s2 + 1); put(i, s2); put(i + 1, s2 + 1); put(i, s2 + 1); }
      g.attributes.position.needsUpdate = true;
    },
  };
}
