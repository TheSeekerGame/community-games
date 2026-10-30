import * as THREE from 'three';
import { clamp } from '../core/math.js';
import { glowMaterial, worldMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';

// What the ship's emitters do to an artifact. Bought once in the SHOP, each is fired at
// whatever the scanner holds (1 to 4, or its button), for some of the boost's plasma: the
// artifact changes where it stands, and the scan records it as it is then, worth more for
// every one it took. Any number of them on one artifact, in any order, on anything the
// forest grows at any depth (a witnessed seeker is the network's, and never touched):
//   glitch   torn into bands of broken signal, its colors swapped, now and then the whole
//            of it jumping to one side
//   chaos    it runs like water: twisted about its height, flowing, its colors turning
//   voxel    set in blocks, the way the seekers themselves are drawn: sampled into a
//            grid of blocks, each the color of what it holds (lit ones lit); whatever
//            moved in it stops where it was
//   shatter  broken into its faces, every one hanging where the burst threw it, turning
// The anomalies (anomaly.js) lay their own on whatever rises while they last:
//   charge   it trembles, lit with the violet of a discharge
//   glow     its own light many times over, as the long night asks
//   freeze   a burst stopped in time: the shatter, held still
//   invert   its own negative, drawn out and slowly turning
//
// Each is a few lines added to every shader the artifact is drawn with (its own copies:
// an artifact's materials are its own), working on where each point of it stands about
// the artifact's heart, so a form of any family takes them all, and all at once.

export const EFFECTS = [
  { id: 'glitch', name: 'GLITCH', key: '1', price: 120, color: 0xff5ec4, line: 'Tears it into bands of broken signal.' },
  { id: 'chaos', name: 'CHAOS', key: '2', price: 260, color: 0x6dffb0, line: 'Sets it running like water.' },
  { id: 'voxel', name: 'VOXEL', key: '3', price: 450, color: 0x8fd8ff, line: 'Sets it in blocks, as the seekers are drawn.' },
  { id: 'shatter', name: 'SHATTER', key: '4', price: 700, color: 0xfff1c9, line: 'Breaks it into its faces, hanging in the air.' },
];
export const FX_VALUE = 1.5;       // what a scan is worth, times this for every one it took
export const FX_COST = 2.2;        // seconds of a full boost's plasma, each
export const effectById = (id) => EFFECTS.find((e) => e.id === id);
// the past tense, for the Codex
export const DONE = { glitch: 'glitched', chaos: 'set running', voxel: 'set in blocks', shatter: 'shattered', charge: 'charged', glow: 'lit', freeze: 'stopped', invert: 'inverted' };

const FX_HEAD = /* glsl */ `
uniform vec3 uFxC;
uniform vec4 uFxA;          // glitch, chaos, voxel, shatter (0..1, and a little over)
uniform vec4 uFxB;          // charge, glow, freeze, invert
uniform vec3 uFxTint;
uniform float uFxSpan, uFxT;
float fxH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float fxH1(float x) { return fract(sin(x * 91.3458 + 0.17) * 47453.5453); }
`;

const FX_VERT = /* glsl */ `
attribute vec4 fxc;
vec3 fxRot(vec3 v, vec3 k, float a) {
  k = normalize(k);
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
// chaos and voxel: where a point about the heart goes (the faces of a shattered one go
// with their own middles)
vec3 fxShape(vec3 p) {
  float S = uFxSpan, t = uFxT;
  if (uFxA.y > 0.0) {
    float k = uFxA.y, f = 3.2 / S;
    float tw = k * (p.y / S) * 1.5 * sin(t * 0.33 + 1.0);
    float c = cos(tw), s = sin(tw);
    p.xz = mat2(c, -s, s, c) * p.xz;
    p += k * S * 0.11 * vec3(sin(p.y * f + t * 1.3 + sin(p.z * f * 0.7)), 0.6 * sin(p.z * f * 1.1 + t * 0.9), cos(p.x * f * 0.9 - t * 1.1));
    p *= 1.0 + k * 0.07 * sin(t * 1.7 + length(p) * f * 2.0);
  }
  return p;
}
vec3 fxWarp(vec3 w, vec3 cw, float has) {
  vec3 c = uFxC;
  float S = uFxSpan, t = uFxT;
  vec3 p0 = w - c;
  vec3 p = fxShape(p0);
  float burst = max(uFxA.w, uFxB.z);
  if (burst > 0.0) {
#ifdef FX_POINTS
    vec3 q0 = p0;
#else
    vec3 q0 = has > 1.5 ? cw - c : (floor(p0 / (S * 0.11)) + 0.5) * (S * 0.11);
#endif
    vec3 q = fxShape(q0);
    float r1 = fxH(q0 * 0.731 + 1.3), r2 = fxH(q0 * 1.37 + 7.1), r3 = fxH(q0 * 0.53 + 3.7);
    vec3 dir = normalize(q + vec3(r1 - 0.5, r2 - 0.35, r3 - 0.5) * S * 0.3 + vec3(0.0, S * 0.05, 0.001));
    // a stopped burst (freeze) holds still; a shattered one drifts and turns
    float live = uFxA.w > 0.0 ? 1.0 : 0.0;
    float dist = burst * (length(q) * 0.45 + S * (0.06 + 0.22 * r2)) * (1.0 + live * 0.1 * sin(t * 0.7 + r1 * 6.283));
    vec3 rel = fxRot(p - q, vec3(r1 - 0.5, r3 - 0.5, r2 - 0.5) + 0.001, burst * (r3 - 0.5) * 6.0 + live * t * (r1 - 0.5) * 0.6);
    p = q + dir * dist + rel * (1.0 - 0.25 * clamp(burst, 0.0, 1.0)) + vec3(0.0, live * sin(t * 0.5 + r2 * 9.0) * S * 0.02 * burst, 0.0);
  }
  if (uFxA.x > 0.0) {
    float k = uFxA.x, ts = floor(t * 9.0);
    float band = floor((p.y + S * 3.0) / (S * 0.07));
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    p += right * step(0.62, fxH1(band * 1.71 + ts * 13.3)) * (fxH1(band + ts * 7.7) - 0.5) * S * 0.5 * k;
    float big = step(0.86, fxH1(ts * 3.1 + 0.4));
    p += right * big * (fxH1(ts * 5.3) - 0.5) * S * 0.3 * k;
    p.y += big * (fxH1(ts * 2.9) - 0.5) * S * 0.08 * k;
  }
  if (uFxB.w > 0.0) {
    // inverted: drawn out along its height, and turning slowly about it
    float a = uFxB.w * sin(t * 0.21) * 0.6 * (p.y / S);
    p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
    p.y *= 1.0 + 0.35 * uFxB.w;
  }
  if (uFxB.x > 0.0) {
    // charged: a fine trembling, faster than the eye
    float ts = floor(t * 24.0);
    p += (vec3(fxH(p0 * 0.31 + ts), fxH(p0 * 0.47 + ts + 3.0), fxH(p0 * 0.29 + ts + 7.0)) - 0.5) * S * 0.012 * uFxB.x;
  }
  return c + p;
}
`;

const FX_FRAG = /* glsl */ `
vec3 fxHue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
vec3 fxColor(vec3 col, vec3 world) {
  vec3 p = world - uFxC;
  float S = uFxSpan, t = uFxT;
  if (uFxA.y > 0.0) col = max(fxHue(col, uFxA.y * (t * 0.35 + p.y / S * 2.2)), 0.0);
  if (uFxA.z > 0.0) col = mix(col, floor(col * 5.0 + 0.5) / 5.0, clamp(uFxA.z, 0.0, 1.0) * 0.6);
  if (uFxA.w > 0.0) col *= 1.0 + 0.3 * clamp(uFxA.w, 0.0, 1.0);
  if (uFxA.x > 0.0) {
    float k = clamp(uFxA.x, 0.0, 1.0), ts = floor(t * 9.0);
    float band = floor((p.y + S * 3.0) / (S * 0.07));
    if (fxH1(band * 1.71 + ts * 13.3) > 0.62) col = mix(col, col.gbr * vec3(1.5, 0.6, 1.6) + vec3(0.04, 0.0, 0.06), k);
    vec2 blk = floor(gl_FragCoord.xy / 5.0);
    if (fxH(vec3(blk, ts)) > 1.0 - 0.05 * k) col = mix(col, vec3(1.0) - col, 0.9);
    col = mix(col, floor(col * 6.0) / 6.0, k * 0.5);
    col *= 1.0 - k * 0.22 * step(0.5, fract(gl_FragCoord.y * 0.5));
  }
  if (uFxB.x > 0.0) {
    // charged: violet light crawling over it in moving seams
    float s = sin(p.x * 0.9 + t * 7.0) * sin(p.y * 1.3 - t * 5.0) * sin(p.z * 1.1 + t * 6.0);
    col += uFxTint * uFxB.x * (0.12 + 0.9 * smoothstep(0.82, 0.97, abs(s)));
  }
  if (uFxB.y > 0.0) col *= 1.0 + uFxB.y * 1.4;
  if (uFxB.w > 0.0) {
    // inverted: its own negative, its light turned to the far side of the wheel
    vec3 neg = max(vec3(0.92, 0.9, 1.0) - col * 0.85, 0.0) + max(fxHue(col, 3.1416), 0.0) * 0.3;
    col = mix(col, neg, uFxB.w);
  }
  return col;
}
`;

const VERT_AT = /(vec4 w = modelMatrix \* [^;]+;)/;
const VERT_PUT = `$1
#ifdef USE_INSTANCING
  vec3 fxcw = (modelMatrix * instanceMatrix * vec4(fxc.xyz, 1.0)).xyz;
#else
  vec3 fxcw = (modelMatrix * vec4(fxc.xyz, 1.0)).xyz;
#endif
  w.xyz = fxWarp(w.xyz, fxcw, fxc.w);`;

// One material made to take the effects (in place: an artifact's materials are its own),
// sharing the artifact's effect uniforms U. False if its shaders are not of the kind.
export function fxify(m, U) {
  if (!m || !m.isShaderMaterial || m.userData.fx) return !!(m && m.userData.fx);
  if (!VERT_AT.test(m.vertexShader) || !/varying vec3 vWorld;/.test(m.fragmentShader)) return false;
  const points = m.vertexShader.includes('gl_PointSize');
  m.vertexShader = (points ? '#define FX_POINTS\n' : '') + FX_HEAD + FX_VERT + m.vertexShader.replace(VERT_AT, VERT_PUT);
  m.fragmentShader = FX_HEAD + FX_FRAG + m.fragmentShader.replace('void main()', 'void fxMain()') + '\nvoid main() { fxMain(); gl_FragColor.rgb = fxColor(gl_FragColor.rgb, vWorld); }\n';
  Object.assign(m.uniforms, U);
  // (a shattered face turns its back to the eye; the lighting finds its front either way)
  m.side = THREE.DoubleSide;
  m.userData.fx = true;
  m.needsUpdate = true;
  return true;
}

// The middle of each face, for a shatter to break it along its faces (a face's three
// corners share it). Only for geometry whose corners are not shared (what the builder
// makes); the rest breaks in blocks.
function faces(geo) {
  if (geo.index || geo.attributes.fxc || !geo.attributes.position) return;
  const p = geo.attributes.position, n = p.count - (p.count % 3);
  if (n < 3) return;
  const out = new Float32Array(p.count * 4);
  for (let i = 0; i < n; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    for (let k = 0; k < 3; k++) out.set([x, y, z, 2], (i + k) * 4);
  }
  geo.setAttribute('fxc', new THREE.BufferAttribute(out, 4));
}

// VOXEL: the artifact sampled into a grid of blocks in its own space, each the color of
// what it holds and as lit; one instanced mesh, its blocks rising into place from the
// ground up. Returns { mesh, from: the meshes it stands for, y: each block's height 0..1 }.
const MAX_BLOCKS = 5000;
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _v = new THREE.Vector3(), _c = new THREE.Color();
function voxelize(a, U) {
  const g = a.model.group, span = Math.max(8, a.model.span || 10);
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const from = [];
  g.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && !o.userData.noFx && o.geometry && o.geometry.attributes.position && !o.userData.voxels) from.push(o); });
  const tris = from.reduce((n, o) => n + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1), 0);
  let b = span * 0.055, cells = null;
  for (let tries = 0; tries < 4; tries++, b *= 1.35) {
    cells = new Map();
    const put = (x, y, z, r, gg, bb, e) => {
      const k = (Math.floor(x / b) + 1024) * 4194304 + (Math.floor(y / b) + 1024) * 2048 + (Math.floor(z / b) + 1024);
      let c = cells.get(k);
      if (!c) cells.set(k, (c = [0, 0, 0, 0, 0, x, y, z]));
      c[0] += r; c[1] += gg; c[2] += bb; c[3]++; c[4] = Math.max(c[4], e);
    };
    for (const o of from) {
      const geo = o.geometry, P = geo.attributes.position, C = geo.attributes.color, E = geo.attributes.emissive, I = geo.index;
      const m = o.material, glow = m && m.blending === THREE.AdditiveBlending;
      const tint = m && m.uniforms && m.uniforms.uTint ? m.uniforms.uTint.value : null;
      // a shell of the deep: its sheen's middle color, as much as it shows
      const irid = m && m.uniforms && m.uniforms.uIrid1 ? [m.uniforms.uIrid1.value, m.uniforms.uIrid.value] : null;
      const n = I ? I.count : P.count, reps = o.isInstancedMesh ? o.count : 1;
      for (let r = 0; r < reps; r++) {
        _m.multiplyMatrices(inv, o.matrixWorld);
        if (o.isInstancedMesh) { o.getMatrixAt(r, _mi); _m.multiply(_mi); }
        let ic = null;
        if (o.isInstancedMesh && o.instanceColor) { o.getColorAt(r, _c); ic = [_c.r, _c.g, _c.b]; }
        const corner = (i, out) => { const j = I ? I.getX(i) : i; _v.fromBufferAttribute(P, j).applyMatrix4(_m); out[0] = _v.x; out[1] = _v.y; out[2] = _v.z; return j; };
        const A = [0, 0, 0], B = [0, 0, 0], Cc = [0, 0, 0];
        for (let i = 0; i + 2 < n; i += 3) {
          const j = corner(i, A); corner(i + 1, B); corner(i + 2, Cc);
          let cr = C ? C.getX(j) : 1, cg = C ? C.getY(j) : 1, cb = C ? C.getZ(j) : 1;
          if (ic) { cr *= ic[0]; cg *= ic[1]; cb *= ic[2]; }
          if (tint) { cr *= tint.r; cg *= tint.g; cb *= tint.b; }
          if (irid) { cr += (irid[0].r - cr) * irid[1]; cg += (irid[0].g - cg) * irid[1]; cb += (irid[0].b - cb) * irid[1]; }
          const e = glow ? 1.6 : E ? E.getX(j) : 0;
          const L = Math.max(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), Math.hypot(Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]), Math.hypot(Cc[0] - B[0], Cc[1] - B[1], Cc[2] - B[2]));
          const k = tris > 60000 ? 1 : Math.min(12, Math.max(1, Math.ceil(L / (b * 0.7))));
          for (let u = 0; u <= k; u++) for (let w = 0; w <= k - u; w++) {
            const fu = u / k, fw = w / k;
            put(A[0] + (B[0] - A[0]) * fu + (Cc[0] - A[0]) * fw, A[1] + (B[1] - A[1]) * fu + (Cc[1] - A[1]) * fw, A[2] + (B[2] - A[2]) * fu + (Cc[2] - A[2]) * fw, cr, cg, cb, e);
          }
        }
      }
    }
    if (cells.size <= MAX_BLOCKS) break;
  }
  const list = [...cells.entries()];
  const box = new THREE.BoxGeometry(b * 0.97, b * 0.97, b * 0.97).toNonIndexed();
  const nv = box.attributes.position.count;
  box.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3).fill(1), 3));
  const fxc = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) fxc[i * 4 + 3] = 2;     // each block breaks whole
  box.setAttribute('fxc', new THREE.BufferAttribute(fxc, 4));
  const em = new Float32Array(list.length);
  const mat = worldMaterial({ unique: true });
  fxify(mat, U);
  const mesh = new THREE.InstancedMesh(box, mat, list.length);
  mesh.userData.voxels = true;
  mesh.frustumCulled = false;
  let y0 = Infinity, y1 = -Infinity;
  for (const [k] of list) { const iy = Math.floor(k / 2048) % 2048; y0 = Math.min(y0, iy); y1 = Math.max(y1, iy); }
  const ys = new Float32Array(list.length), at = new Float32Array(list.length * 3);
  list.forEach(([k, c], i) => {
    const ix = Math.floor(k / 4194304) - 1024, iy = (Math.floor(k / 2048) % 2048) - 1024, iz = (k % 2048) - 1024;
    at.set([(ix + 0.5) * b, (iy + 0.5) * b, (iz + 0.5) * b], i * 3);
    ys[i] = y1 > y0 ? (iy + 1024 - y0) / (y1 - y0) : 0;
    // (posterized a little, as the seekers' palettes are)
    _c.setRGB(Math.round((c[0] / c[3]) * 6) / 6, Math.round((c[1] / c[3]) * 6) / 6, Math.round((c[2] / c[3]) * 6) / 6);
    mesh.setColorAt(i, _c);
    em[i] = c[4];
    _m.makeScale(0.001, 0.001, 0.001).setPosition(at[i * 3], at[i * 3 + 1], at[i * 3 + 2]);
    mesh.setMatrixAt(i, _m);
  });
  box.setAttribute('emissive', new THREE.InstancedBufferAttribute(em, 1));
  g.add(mesh);
  return { mesh, mat, from, ys, at, done: false };
}

// How each one comes over the artifact once fired (seconds -> 0..1 and a little over):
// a glitch at once, chaos slowly, the blocks in steps, a shatter in a burst that overshoots
// and settles.
const ARRIVE = {
  glitch: (s) => clamp(s / 0.25, 0, 1),
  chaos: (s) => 1 - Math.exp(-s * 1.6),
  voxel: (s) => Math.min(1, Math.floor(s * 7) / 6),
  shatter: (s) => 1 - Math.exp(-s * 4) * Math.cos(s * 5),
  charge: (s) => clamp(s / 1.2, 0, 1),
  glow: (s) => 1 - Math.exp(-s * 1.2),
  freeze: (s) => (1 - Math.exp(-s * 5)) * 0.85,
  invert: (s) => clamp(s / 2, 0, 1),
};
const SLOT = { glitch: ['uFxA', 'x'], chaos: ['uFxA', 'y'], voxel: ['uFxA', 'z'], shatter: ['uFxA', 'w'], charge: ['uFxB', 'x'], glow: ['uFxB', 'y'], freeze: ['uFxB', 'z'], invert: ['uFxB', 'w'] };

// An artifact's effects: which it has taken (in order), how far each has come over it,
// and the uniforms all its materials share.
export class ArtifactFx {
  constructor(a) {
    this.a = a;
    this.list = [];             // fired by the ship, in order
    this.marks = [];            // laid by an anomaly as it rose
    this.since = {};
    this.t = 0;
    this.U = {
      uFxC: { value: new THREE.Vector3() }, uFxA: { value: new THREE.Vector4(0, 0, 0, 0) }, uFxB: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFxTint: { value: new THREE.Color(0xa58cff) }, uFxSpan: { value: Math.max(8, a.model.span || 10) }, uFxT: { value: 0 },
    };
    this.ready = false;
  }

  // every material it is drawn with, made to take the effects; every face given its middle
  _prepare() {
    if (this.ready) return;
    this.ready = true;
    const seen = new Set();
    this.a.model.group.traverse((o) => {
      if (o.userData.noFx) return;
      if (o.geometry && (o.isMesh || o.isInstancedMesh)) faces(o.geometry);
      // (moved about, it may stand outside where it was culled by)
      if (o.isMesh || o.isPoints) o.frustumCulled = false;
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (!seen.has(m)) { seen.add(m); fxify(m, this.U); }
    });
  }

  has(id) { return this.list.includes(id) || this.marks.includes(id); }

  // fired by the ship (false: it already has it)
  add(id) {
    if (this.has(id)) return false;
    this._prepare();
    this.list.push(id);
    this.since[id] = 0;
    if (id === 'voxel') {
      this.vox = voxelize(this.a, this.U);
      this.a.model.mats.push(this.vox.mat);
    }
    return true;
  }

  // the blocks rising into place, from the ground up, in steps; then what they stand for
  // goes
  _grow(s) {
    const v = this.vox;
    if (!v || v.done) return;
    const m = v.mesh, n = m.count;
    for (let i = 0; i < n; i++) {
      const k = clamp(Math.floor((s * 2.6 - v.ys[i] * 0.9) * 4) / 4, 0, 1);
      _m.makeScale(k || 0.001, k || 0.001, k || 0.001).setPosition(v.at[i * 3], v.at[i * 3 + 1], v.at[i * 3 + 2]);
      m.setMatrixAt(i, _m);
    }
    m.instanceMatrix.needsUpdate = true;
    if (s > 0.5) for (const o of v.from) o.visible = false;
    if (s > 0.8) v.done = true;
  }

  // laid by an anomaly
  mark(id) {
    if (this.has(id)) return;
    this._prepare();
    this.marks.push(id);
    this.since[id] = 0;
  }

  get any() { return this.list.length + this.marks.length > 0; }

  // dt: seconds; slow: how fast time runs about it (an anomaly may slow it)
  update(dt, slow = 1) {
    if (!this.any) return;
    this.t += dt * slow;
    const U = this.U;
    U.uFxT.value = this.t;
    U.uFxSpan.value = Math.max(8, this.a.model.span || 10);
    U.uFxC.value.copy(this.a.model.focus).applyMatrix4(this.a.model.group.matrixWorld);
    for (const id of [...this.list, ...this.marks]) {
      this.since[id] += dt;
      const [u, c] = SLOT[id];
      U[u].value[c] = ARRIVE[id](this.since[id]);
    }
    if (this.vox) this._grow(this.since.voxel);
  }
}

// The emitter's shot: a beam of the effect's color from the ship's nose to the artifact's
// heart, there and gone in half a second.
export class Shot {
  constructor(scene) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.5);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    this.mat = glowMaterial({ opacity: 0, fog: 0.4, fresnel: 0.6, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.layers.set(LAYER_FX);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.t = 0;
  }

  fire(color) {
    this.mat.uniforms.uTint.value.setHex(color);
    this.t = 0.55;
  }

  // from, to: render space
  update(dt, from, to) {
    this.t = Math.max(0, this.t - dt);
    this.mesh.visible = this.t > 0 && !!to;
    if (!this.mesh.visible) return;
    const k = this.t / 0.55, len = from.distanceTo(to);
    this.mesh.position.copy(from);
    this.mesh.lookAt(to);
    this.mesh.scale.set(0.35 + 0.5 * (1 - k), 0.35 + 0.5 * (1 - k), len);
    this.mat.uniforms.uOpacity.value = Math.pow(k, 1.5) * 0.9;
  }
}
