import * as THREE from 'three';
import { Builder, mat, mul, roughen } from '../../render/build.js';
import { worldMaterial, glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp, hash1 } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam } from '../parts.js';

// The heights: nine wild artifacts, five of the mountains and four of the turned stands.
// On the summits (bare rock and snow above the fog, the ground falling away on all sides,
// the wind never still):
//   prayerwheels  a wall of stone along the ridge, a row of drums in it turning in the wind
//   bivouac       a shelter lashed to the summit, one window lit, wands leading down to it
//   horn          a long horn on trestles, pointing out over the valley; rings of light leave it
//   eyrie         a nest of timbers on a pinnacle, eggs of pale light in it, and no bird
//   cablecar      two pylons, a cable over the drop, one gondola still hanging on it
// Among the gold birches (a clearing, nearly level, in mist):
//   sheaves       stooks of dry stalks, their heads faintly lit, fireflies between them
//   swing         a great bare birch and a swing on one bough, swinging by itself
//   fairyring     a ring of amber mushrooms lit from beneath; nothing falls inside it
//   chrysalis     a bare tree hung with chrysalides of amber glass, one of them empty

const SNOW = 0xdfe5ec, DARK = 0x0f0e16;                                   // the mountain's tones
const BARK = 0xe4dfd3, MARK = 0x2a2622, LEAF = [0xf2c14e, 0xe0952f, 0xc4612a, 0xf5dc8a, 0xa8452a];   // the season's
const WOOD = [0x1c1918, 0x27211e, 0x332b26], STRAW = [0x5d4f30, 0x74633a, 0x8a7644], AMBER = [0xe09a2c, 0xffd27a];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const Yax = new THREE.Vector3(0, 1, 0), Zax = new THREE.Vector3(0, 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// the wind: never still, never quite the same twice (about -1.2..1.2)
const wind = (t, ph) => Math.sin(t * 0.83 + ph) * 0.55 + Math.sin(t * 2.1 + ph * 1.7) * 0.25 + Math.sin(t * 0.19 + ph * 0.6) * 0.45;
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one'];
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty-first'];
const num = (n) => NUM[n] ?? String(n);
const Cap = (s) => s[0].toUpperCase() + s.slice(1);

// light that is drawn after the fog, faded in with the artifact (fx: the list it joins)
function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}
// the same, many times over (each its own place, and its own brightness by its color)
function lightInst(geo, n, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.InstancedMesh(geo, m, n);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}
// sparks: points of light, moved every frame
function sparks(n, color, size, fx, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  fx.push([m, opacity]);
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  return { p, g, pos, sz, al };
}
function finish(out, update) {
  return {
    ...out,
    mats: [...out.fx.map(([m]) => m), ...(out.own || [])],
    update(t, beat, c) {
      for (const [m, o] of out.fx) m.uniforms.uOpacity.value = o * (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      if (update) update(t, beat, c);
    },
  };
}
const rock = (r, detail, seed, amount = 0.3) => { const g = new THREE.IcosahedronGeometry(r, detail); roughen(g, r * amount, seed); return g; };
// a stone half in the ground, snow on it
const boulder = (b, x, y, z, r, seed, snow = true) => b.add(rock(1, 0, seed, 0.3), mat(x, y, z, 0, seed * 1.3, 0, r * 1.25, r * 0.8, r), (px, py, pz, i) => (snow && py > 0.3 ? SNOW : STONE[((i / 3) | 0) % 3]), 0, { flat: true });
// a part set along a direction: the matrix that takes +y (or `from`) to dir, at p
const along = (p, dir, from = Yax) => new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize()), V(1, 1, 1));
// its own bearing on the summit: built in a frame turned by psi about y
function turned(ctx, psi) {
  const c = Math.cos(psi), s = Math.sin(psi), inner = new THREE.Group();
  inner.rotation.y = psi;
  return { inner, ground: (x, z) => ctx.ground(x * c + z * s, -x * s + z * c), out: (v) => v.clone().applyAxisAngle(Yax, psi) };
}
// a prism lying along x, its section a regular polygon: half-width a (to its corners), b up
function prismX(b, sides, len, x, y, z, a, bh, color, em = 0, theta0 = 0) {
  const m = new THREE.Matrix4().makeBasis(V(0, 0, a), V(1, 0, 0), V(0, bh, 0)).setPosition(x, y, z);
  b.add(new THREE.CylinderGeometry(1, 1, len, sides, 1, false, theta0), m, color, em);
}
// leaves: an instanced flat leaf, each its own color of the season
function leafMesh(n, own) {
  const b = new Builder();
  b.tri([0, 0, -0.5], [0.32, 0, 0], [0, 0, 0.55], 0xffffff);
  b.tri([0, 0, -0.5], [0, 0, 0.55], [-0.32, 0, 0], 0xffffff);
  const m = worldMaterial({ unique: true, side: THREE.DoubleSide });
  own.push(m);
  const mesh = new THREE.InstancedMesh(b.build(), m, n);
  mesh.frustumCulled = false;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c.setHex(LEAF[i % LEAF.length]));
  return mesh;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function setInst(mesh, i, x, y, z, rx, ry, rz, sx, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  mesh.setMatrixAt(i, _m);
}
// leaves that fall, lie a while where they fell, and fall again. spot(R) -> [x, z, top, ground]
function leafFall(n, size, R, own, spot) {
  const mesh = leafMesh(n, own);
  const L = Array.from({ length: n }, () => { const [x, z, top, gy] = spot(R); return { x, z, top, gy, ph: R(), sp: 0.6 + R() * 0.7, sw: R() * TAU, s: size * (0.8 + R() * 0.5) }; });
  return {
    mesh,
    update(t) {
      for (let i = 0; i < n; i++) {
        const l = L[i], cyc = (l.ph + t * 0.03 * l.sp) % 1, f = Math.min(1, cyc / 0.74), air = 1 - f * f * f;
        const y = l.gy + 0.15 + (l.top - l.gy) * (1 - f);
        setInst(mesh, i, l.x + Math.sin(t * 1.4 * l.sp + l.sw) * 2.2 * air, y, l.z + Math.cos(t * 1.1 * l.sp + l.sw) * 1.7 * air, Math.sin(t * 2.2 + l.sw) * 0.9 * air, t * 0.8 * air + l.sw, Math.cos(t * 1.7 + l.sw) * 0.7 * air, l.s);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
// a bare crown: a limb forking k times; its segments, so they can be measured before they are built
function crown(R, from, dir, len, r, k, o, segs = []) {
  const to = from.clone().addScaledVector(dir, len);
  segs.push({ from: from.clone(), to: to.clone(), r, k });
  if (k > 0) for (let j = 0; j < o.kids(k); j++) {
    const nd = dir.clone().add(V((R() - 0.5) * o.spread, o.rise + R() * o.rise2, (R() - 0.5) * o.spread)).normalize();
    crown(R, to, nd, len * (o.shrink + R() * 0.15), r * 0.62, k - 1, o, segs);
  }
  return segs;
}
// ...stretched so that its highest twig is exactly `top`
function crownTo(segs, y0, top) {
  const hi = Math.max(...segs.map((s) => s.to.y)), k = (top - y0) / Math.max(1e-3, hi - y0);
  for (const s of segs) for (const p of [s.from, s.to]) if (p.y > y0) p.y = y0 + (p.y - y0) * k;
  return segs;
}

// ================================================================== prayer wheels
// one drum: bands of small lit marks about it, alternate bands on the rhythm
function drumGeo(r, h, bands, counts, v, A, S) {
  const b = new Builder();
  b.cyl(r, r, h, 10, null, STONE[2]);
  for (const q of [-1, 1]) b.cyl(r * 1.08, r * 1.08, h * 0.07, 10, mat(0, q * h * 0.465, 0), RIM);
  for (let k = 0; k < bands; k++) {
    const y = ((k + 0.5) / bands - 0.5) * h * 0.8, m = counts[(k + v) % counts.length], lit = (k + v) % 2 === 0;
    const w = Math.min(0.6 * S, ((TAU * r) / m) * 0.55), hh = ((h * 0.8) / bands) * 0.55;
    for (let j = 0; j < m; j++) {
      const a = (j / m) * TAU + k * 0.4;
      b.box(w, hh, 0.16 * S, mat(Math.cos(a) * r, y, Math.sin(a) * r, 0, Math.PI / 2 - a, 0), lit ? A : mixHex(A, 0xffffff, 0.35), lit ? PULSE : 0.9);
    }
  }
  return b.build();
}

function prayerwheels(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), own = [];
  const n = P.n, pitch = P.pitch, rd = P.drumR, hd = P.drumH, Rg = P.greatR, Hg = P.greatH;
  const gate = Rg * 2 + 3.4 * S, T = rd * 2 + 1.1 * S, Tg = Rg * 2 + 1.6 * S, halfL = gate / 2 + (n / 2) * pitch;
  // the line of the wall along the ridge
  const cz = (x) => (P.curve === 'bowed' ? P.bow * halfL * (x / halfL) ** 2 : P.curve === 'winding' ? P.bow * halfL * 0.5 * Math.sin((x / halfL) * Math.PI) : 0);
  const yawAt = (x) => -Math.atan(cz(x + 0.5) - cz(x - 0.5));
  const plinth = 1.0 * S, sill = 0.35 * S, head = 0.7 * S, hp = sill + hd + head;
  const drums = [];
  for (let k = 0; k < n; k++) {
    const q = k < n / 2 ? -1 : 1, j = k < n / 2 ? n / 2 - 1 - k : k - n / 2;
    const x = q * (gate / 2 + (j + 0.5) * pitch), z = cz(x);
    // each bay stands level on the uphill end of its own piece of the ridge: the wall goes down in steps
    const base = Math.max(ctx.ground(x - pitch / 2, cz(x - pitch / 2)), ctx.ground(x, z), ctx.ground(x + pitch / 2, cz(x + pitch / 2)));
    const M = mat(x, base, z, 0, yawAt(x), 0), at = (lx, ly, lz) => mul(M, mat(lx, ly, lz));
    b.box(pitch + 0.06, plinth + 6 * S, T + 0.6 * S, at(0, plinth / 2 - 3 * S, 0), STONE[k % 2]);
    const pw = pitch * 0.12;
    for (const e of [-1, 1]) b.box(pw, hp, T, at(e * (pitch / 2 - pw / 2), plinth + hp / 2, 0), STONE[2]);
    b.box(pitch + 0.06, 0.55 * S, T + 0.5 * S, at(0, plinth + hp + 0.275 * S, 0), STONE[3]);
    b.box(pitch + 0.06, (0.16 + R() * 0.16) * S, T + 0.3 * S, at(0, plinth + hp + 0.62 * S, 0), SNOW);
    b.cyl(0.1 * S, 0.1 * S, hp, 5, at(0, plinth + hp / 2, 0), RIM);
    drums.push({ x, y: base + plinth + sill + hd / 2, z, v: k % 3, ang: R() * TAU, w: 0.35 + R() * 0.75, e: 0, tau: 5 + R() * 8, kick: 4.5 + R() * 2.5 });
  }
  // a pier at each end of it, a lit stone on each
  for (const q of [-1, 1]) {
    const x = q * (halfL + 0.9 * S), z = cz(x), base = ctx.ground(x, z), h = plinth + hp + 2.2 * S, yaw = yawAt(x);
    b.box(1.8 * S, h + 6 * S, T + 0.9 * S, mat(x, base + h / 2 - 3 * S, z, 0, yaw, 0), STONE[1]);
    b.box(2.2 * S, 0.4 * S, T + 1.3 * S, mat(x, base + h + 0.2 * S, z, 0, yaw, 0), STONE[3]);
    b.box(2.0 * S, 0.22 * S, T + 1.1 * S, mat(x, base + h + 0.5 * S, z, 0, yaw, 0), SNOW);
    b.ico(0.5 * S, 0, mat(x, base + h + 1.05 * S, z), A, PULSE);
  }
  // the house of the great drum, at the middle, on the summit itself
  const M0 = mat(0, 0, 0, 0, yawAt(0), 0), at0 = (lx, ly, lz) => mul(M0, mat(lx, ly, lz));
  const pod = 1.4 * S, hp0 = Hg + 1.3 * S;
  b.box(gate, pod + 6 * S, Tg + 2.4 * S, at0(0, pod / 2 - 3 * S, 0), STONE[0]);
  for (const e of [-1, 1]) b.box(gate * 0.55, 6.7 * S, 1.3 * S, at0(0, 0.7 * S - 3.35 * S, e * (Tg / 2 + 1.85 * S)), STONE[1]);
  for (const e of [-1, 1]) b.box(1.3 * S, hp0, Tg + 0.6 * S, at0(e * (Rg + 1.05 * S), pod + hp0 / 2, 0), STONE[2]);
  b.cyl(0.16 * S, 0.16 * S, hp0, 6, at0(0, pod + hp0 / 2, 0), RIM);
  let y = pod + hp0, tw = 0, td = 0;
  for (let k = 0; k < P.tiers; k++) {
    tw = gate + (2.4 - k * 1.5) * S; td = Tg + (3.2 - k * 1.3) * S;
    b.box(tw, 0.65 * S, td, at0(0, y + 0.325 * S, 0), STONE[3 - (k % 2)]);
    y += 0.65 * S;
  }
  b.box(tw - 0.5 * S, 0.26 * S, td - 0.5 * S, at0(0, y + 0.13 * S, 0), SNOW);
  b.cone(0.6 * S, 3 * S, 5, at0(0, y + 1.5 * S, 0), STONE[3]);
  b.ico(0.65 * S, 1, at0(0, y + 3.4 * S, 0), A, PULSE);
  const topY = y + 4.05 * S;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the drums: three scorings among them; one material of their own, so that they can brighten as they spin
  const dm = worldMaterial({ unique: true });
  own.push(dm);
  const insts = [0, 1, 2].map((v) => {
    const mine = drums.filter((q) => q.v === v);
    const mesh = new THREE.InstancedMesh(drumGeo(rd, hd, P.bands, P.counts, v, A, S), dm, Math.max(1, mine.length));
    mesh.frustumCulled = false;
    mine.forEach((q, i) => { q.mesh = mesh; q.i = i; });
    group.add(mesh);
    return mesh;
  });
  const great = new THREE.Mesh(drumGeo(Rg, Hg, P.greatBands, P.counts.map((c) => c * 2), 1, A, S), dm);
  great.position.set(0, pod + 0.5 * S + Hg / 2, 0);
  group.add(great);
  const place = () => {
    for (const q of drums) { _m.makeRotationY(q.ang).setPosition(q.x, q.y, q.z); q.mesh.setMatrixAt(q.i, _m); }
    for (const m of insts) m.instanceMatrix.needsUpdate = true;
  };
  place();
  let last = null, ge = 0;
  const out = { group, fx: [], own, light: V(0, y + 3.4 * S, 0), focus: V(0, (pod + hp0) * 0.6, 0), span: halfL + 2 * S, clear: Math.min(95, halfL + 9 * S), height: topY };
  return finish(out, (t, beat, c) => {
    const dt = last === null ? 0 : clamp(t - last, 0, 0.1);
    last = t;
    // the ship passing close sets them all spinning: the nearest first and hardest; each settles in its own time
    const close = sstep(0.55, 0.92, c.near || 0), sp = c.shipLocal;
    let sum = 0;
    for (const q of drums) {
      const far = sp ? Math.hypot(sp.x - q.x, sp.z - q.z) : 0, want = close * (0.55 + 0.45 * clamp(1 - far / 150, 0, 1));
      q.e += (want - q.e) * (1 - Math.exp(-dt * (want > q.e ? 1.8 : 1 / q.tau)));
      // the wind comes along the wall in gusts
      const gust = clamp(0.55 + 0.45 * Math.sin(t * 0.23 + q.x * 0.05) + 0.25 * Math.sin(t * 0.71 + q.x * 0.11), 0.06, 1.3);
      q.ang += P.dir * (q.w * gust + q.e * q.kick) * dt;
      sum += q.e;
    }
    place();
    ge += (close - ge) * (1 - Math.exp(-dt * (close > ge ? 1.2 : 0.09)));
    great.rotation.y += P.dir * (0.16 + 0.1 * Math.sin(t * 0.17) + ge * 2.6) * dt;
    dm.uniforms.uPulse.value = (c.pulse ?? 1) * (0.75 + 0.45 * ge) + (sum / drums.length) * 0.7;
  });
}

// ================================================================== bivouac
function bivouac(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), fx = [];
  const F = turned(ctx, P.bearing), G = F.ground, pale = mixHex(A, 0xffffff, 0.3);
  const Lh = P.length, Wh = P.width, dk = P.deck, tent = P.form === 'aframe';
  const hw = tent ? 0 : P.wall, hr = tent ? P.wall + P.rise + 1.2 * S : P.rise;
  const Wd = Wh + 2.4 * S, Ld = Lh + 2.8 * S, We = Wh / 2 + 0.3 * S, eave = dk + hw, ridge = eave + hr, xEnd = tent ? Lh / 2 + 0.25 * S : Lh / 2;
  // the platform: a deck on beams, the beams on legs wedged in the rock
  b.box(Ld, 0.35 * S, Wd, mat(0, dk - 0.175 * S, 0), WOOD[2]);
  for (const q of [-1, 0, 1]) b.box(Ld + 1.6 * S, 0.45 * S, 0.45 * S, mat(0, dk - 0.575 * S, q * (Wd / 2 - 0.5 * S)), WOOD[1]);
  for (let i = 0; i < 4; i++) b.box(0.4 * S, 0.4 * S, Wd + 1.6 * S, mat((i / 3 - 0.5) * (Ld - 1.2 * S), dk - 1.0 * S, 0), WOOD[0]);
  for (const qx of P.legs === 6 ? [-1, 0, 1] : [-1, 1]) for (const qz of [-1, 1]) {
    const cx = qx * (Ld / 2 - 0.6 * S), cz = qz * (Wd / 2 - 0.4 * S), fx0 = cx * 1.15 + qx * 0.6 * S, fz0 = cz * 1.5, gy = G(fx0, fz0);
    beam(b, V(cx, dk - 1.1 * S, cz), V(fx0, gy - 1, fz0), 0.42 * S, WOOD[1]);
    beam(b, V(cx, dk - 1.1 * S, cz), V(cx, Math.min(dk - 1.2 * S, G(cx, cz)) - 1, cz), 0.36 * S, WOOD[0]);
    boulder(b, fx0, gy - 0.1 * S, fz0, (0.9 + R() * 0.5) * S, 3 + qx * 5 + qz, true);
  }
  // the shelter: dark panels, pale ribs over them where it is lashed down
  if (!tent) { const np = P.ribs + 1; for (let i = 0; i < np; i++) b.box(Lh / np, hw, Wh, mat(((i + 0.5) / np - 0.5) * Lh, dk + hw / 2, 0), STONE[1 + (i % 2)]); }
  const roof = (len, x, k, color) => (P.form === 'vault'
    ? prismX(b, 8, len, x, eave, 0, (We / 0.924) * k, (hr / 0.924) * k, color, 0, Math.PI / 8)
    : prismX(b, 3, len, x, eave + hr / 3, 0, (We / 0.866) * k, (hr / 1.5) * k, color));
  roof(Lh + 0.5 * S, 0, 1, STONE[0]);
  const piton = (x, z) => { const gy = G(x, z); b.box(0.32 * S, 1.1 * S, 0.32 * S, mat(x, gy + 0.2 * S, z, 0.3, x, 0.2), RIM); return V(x, gy + 0.5 * S, z); };
  for (let i = 0; i < P.ribs; i++) {
    const x = ((i + 0.5) / P.ribs - 0.5) * Lh * 0.86;
    roof(0.36 * S, x, 1.06, RIM);
    for (const q of [-1, 1]) {
      const from = tent ? V(x, dk + hr * 0.5, q * We * 0.56) : V(x, eave + 0.1 * S, q * We * 1.05);
      beam(b, from, piton(x * 1.35, q * (We + P.reach * (0.85 + R() * 0.3))), 0.09 * S, RIM);
    }
  }
  for (const q of [-1, 1]) beam(b, V(q * (Lh / 2 + 0.25 * S), ridge - 0.05 * S, 0), piton(q * (Lh / 2 + P.reach * 1.2), (R() - 0.5) * 2 * S), 0.09 * S, RIM);
  // a door at one end; at the other its one window, lit, looking down the line of wands
  const wy = tent ? dk + hr * 0.3 : dk + hw * 0.58;
  b.box(0.16 * S, 2.0 * S, 1.1 * S, mat(-xEnd - 0.03 * S, dk + 1.0 * S, 0), DARK);
  b.box(0.16 * S, 1.0 * S, 1.4 * S, mat(xEnd + 0.03 * S, wy, 0), A, 1.3);
  b.box(0.3 * S, 0.14 * S, 1.8 * S, mat(xEnd + 0.1 * S, wy - 0.6 * S, 0), RIM);
  if (P.pipe) { b.cyl(0.22 * S, 0.22 * S, 2.2 * S, 6, mat(-Lh * 0.25, ridge - 0.1 * S, Wh * 0.14), STONE[3]); b.cone(0.45 * S, 0.4 * S, 6, mat(-Lh * 0.25, ridge + 1.2 * S, Wh * 0.14), STONE[3]); }
  b.box(Lh * 0.7, 0.5 * S, 1.1 * S, mat(-Lh * 0.05, dk + 0.25 * S, -(Wh / 2 + 0.6 * S)), SNOW);
  // the pole and its lantern
  const q = P.poleSide, px = -Ld / 2 - 1.6 * S, pz = q * (Wd / 2 + 1.2 * S), pg = G(px, pz), top = pg + P.pole;
  beam(b, V(px, pg - 1.5, pz), V(px, top, pz), 0.36 * S, STONE[3]);
  beam(b, V(px, top - 0.2 * S, pz), V(px, top - 0.2 * S, pz + q * 2.7 * S), 0.28 * S, STONE[3]);
  beam(b, V(px, top - 2.4 * S, pz), V(px, top - 0.3 * S, pz + q * 2.0 * S), 0.18 * S, STONE[2]);
  beam(b, V(px, top - 1 * S, pz), piton(px - 4.5 * S, pz - q * 2.5 * S), 0.09 * S, RIM);
  beam(b, V(px, top - 1 * S, pz), piton(px + 3.5 * S, pz + q * 5 * S), 0.09 * S, RIM);
  boulder(b, px, pg, pz, 1.1 * S, 17, true);
  const lan = new THREE.Group();
  lan.position.set(px, top - 0.35 * S, pz + q * 2.6 * S);
  const lb = new Builder(), cord = 1.5 * S;
  lb.box(0.08 * S, cord, 0.08 * S, mat(0, -cord / 2, 0), RIM);
  lb.cone(0.8 * S, 0.5 * S, 4, mat(0, -cord + 0.2 * S, 0, 0, Math.PI / 4, 0), STONE[3]);
  lb.box(1.0 * S, 0.14 * S, 1.0 * S, mat(0, -cord - 0.1 * S, 0), STONE[3]);
  lb.box(0.72 * S, 1.0 * S, 0.72 * S, mat(0, -cord - 0.67 * S, 0), A, PULSE);
  for (const [ex, ez] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lb.box(0.1 * S, 1.0 * S, 0.1 * S, mat(ex * 0.42 * S, -cord - 0.67 * S, ez * 0.42 * S), STONE[3]);
  lb.box(1.0 * S, 0.14 * S, 1.0 * S, mat(0, -cord - 1.24 * S, 0), STONE[3]);
  lan.add(new THREE.Mesh(lb.build(), mats.glow));
  const hb = new Builder();
  hb.ico(1.0 * S, 1, mat(0, -cord - 0.67 * S, 0), pale, 1);
  lan.add(lightMesh(hb.build(), fx, 0.4, { fresnel: 0.5 }));
  // the wands: a line of them leading down the ridge, their tips lit
  const x0 = xEnd + 5 * S, gap = Math.min(P.gap, (40 * S - x0) / (P.wands - 1)), tb = new Builder(), wb = new Builder(), tips = [];
  for (let i = 0; i < P.wands; i++) {
    const x = x0 + i * gap, z = Math.sin(i * 0.8 + P.bearing * 3) * P.wander + i * gap * P.drift, gy = G(x, z), h = (3.4 + R() * 1.3) * S;
    const tip = V(x + (R() - 0.5) * 0.5 * S, gy + h, z + (R() - 0.5) * 0.5 * S);
    beam(b, V(x, gy - 0.8, z), tip, 0.17 * S, RIM);
    b.box(0.34 * S, 0.34 * S, 0.34 * S, mat(tip.x, tip.y, tip.z, 0, i, 0), A, 1);
    tb.ico(0.46 * S, 0, mat(tip.x, tip.y, tip.z), pale, 1);
    tips.push(tip);
  }
  const far = x0 + (P.wands - 1) * gap, back = Lh / 2 + P.reach * 1.2;
  wb.add(new THREE.PlaneGeometry(2.3 * S, 1.8 * S), mat(xEnd + 0.3 * S, wy, 0, 0, Math.PI / 2, 0), pale, 0.4);
  F.inner.add(new THREE.Mesh(b.build(), mats.body), lan, lightMesh(wb.build(), fx, 0.8));
  const tg = tb.build(), te = tg.attributes.emissive.array;
  F.inner.add(lightMesh(tg, fx, 0.9));
  const group = new THREE.Group();
  group.add(F.inner);
  const out = { group, fx, light: F.out(V(xEnd + 0.3 * S, wy, 0)), focus: F.out(V((far - back) * 0.3, dk + 3 * S, 0)), span: (far + back) / 2 + 2 * S, clear: Math.min(95, far + 6 * S), height: Math.max(top, ridge) + 1 * S };
  return finish(out, (t, beat) => {
    // the lantern in the wind
    lan.rotation.x = 0.1 * q + 0.2 * wind(t, 1.3);
    lan.rotation.z = 0.15 * wind(t * 1.13, 4.1);
    // a light running up the line of wands, home
    const at = P.wands + 1 - ((beat * P.rate) % (P.wands + 5));
    for (let i = 0; i < P.wands; i++) te.fill(0.16 + 0.84 * Math.pow(Math.max(0, 1 - Math.abs(at - i) / 1.7), 2), i * 60, (i + 1) * 60);
    tg.attributes.emissive.needsUpdate = true;
  });
}

// ================================================================== horn
function horn(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), fx = [], own = [];
  const F = turned(ctx, P.bearing), G = F.ground, pale = mixHex(A, 0xffffff, 0.35);
  const L = P.length, N = 50, r0 = 0.32 * S, r1 = P.bore, Rb = P.bell, sB = 0.86, sA = sB - P.bendLen;
  const rad = (s) => (s < sB ? r0 + (r1 - r0) * Math.pow(s / sB, 1.2) : r1 + (Rb - r1) * Math.pow((s - sB) / (1 - sB), 2.1));
  // its line: straight, rising a little; the last of it turned up (in some) before the bell
  const pts = [], p = V(-0.4 * L * Math.cos(P.tilt), P.saddle - 0.4 * L * Math.sin(P.tilt), 0);
  for (let i = 0; i <= N; i++) {
    pts.push(p.clone());
    const ang = P.tilt + P.curl * sstep(sA, sB, (i + 0.5) / N);
    p.add(V(Math.cos(ang), Math.sin(ang), 0).multiplyScalar(L / N));
  }
  const at = (s) => { const f = clamp(s, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)); return pts[i].clone().lerp(pts[i + 1], f - i); };
  const tan = (s) => { const i = Math.min(N - 1, Math.floor(clamp(s, 0, 1) * N)); return pts[i + 1].clone().sub(pts[i]).normalize(); };
  const e = tan(1), M = pts[N];
  // bands of stone where it divides: a half, a third, a quarter... of its length from the bell
  const cuts = Array.from({ length: P.bands }, (_, k) => 1 - 1 / (k + 2));
  const hb = new Builder();
  hb.tube(pts, rad, 10, (t) => WOOD[cuts.filter((c) => c < t).length % 3]);
  // its throat, lit
  const iB = Math.round(sB * N);
  hb.tube(pts.slice(iB), (t) => rad(sB + t * (1 - sB)) * 0.9, 10, A, (t) => (t < 0.3 ? PULSE : t < 0.62 ? 0.9 : 0.3));
  cuts.forEach((s, k) => hb.cyl(rad(s) * 1.16 + 0.12 * S, rad(s) * 1.16 + 0.12 * S, 0.5 * S, 10, along(at(s), tan(s)), k % 2 ? RIM : STONE[3]));
  hb.cyl(0.62 * S, 0.45 * S, 0.6 * S, 8, along(at(0.004), tan(0)), RIM);
  hb.add(new THREE.TorusGeometry(Rb, 0.24 * S, 5, 20), along(M, e, Zax), RIM);
  const hm = worldMaterial({ unique: true, side: THREE.DoubleSide });       // seen from inside, too
  own.push(hm);
  // the trestles: two frames to each, a cradle between them, their feet where the rock is
  let low = 0;
  for (const s of P.trestles === 3 ? [0.1, 0.4, 0.64] : [0.16, 0.6]) {
    const c = at(s), r = rad(s), w = 1.8 * S + 0.3 * (c.y - G(c.x, 0));
    for (const dx of [-0.8 * S, 0.8 * S]) {
      let gy = 0;
      for (const q of [-1, 1]) {
        const g = G(c.x + dx, q * w) - 1;
        beam(b, V(c.x + dx, c.y - r - 0.5 * S, q * 0.35 * S), V(c.x + dx, g, q * w), 0.45 * S, WOOD[1]);
        boulder(b, c.x + dx, g + 0.9, q * w, 0.9 * S, 11 + q + Math.round(s * 20), true);
        gy += g / 2;
        low = Math.min(low, g);
      }
      b.box(0.32 * S, 0.32 * S, w + 1.0 * S, mat(c.x + dx, (c.y - r - 0.5 * S + gy) / 2, 0), WOOD[2]);
    }
    b.box(2.4 * S, 0.5 * S, 2 * r + 1.4 * S, mat(c.x, c.y - r - 0.3 * S, 0, 0, 0, P.tilt), STONE[2]);
    for (const q of [-1, 1]) b.box(2.4 * S, r * 1.3 + 0.4 * S, 0.4 * S, mat(c.x, c.y - r * 0.4, q * (r + 0.5 * S), 0, 0, P.tilt), STONE[2]);
  }
  // the rings that leave it: K of them in the air at once, a new one on the beat
  const K = P.rings, NS = 28, D = P.reach, per = NS * 12;
  const pos = new Float32Array(K * per * 3), col = new Float32Array(K * per * 3), em = new Float32Array(K * per).fill(0.004);
  _c.setHex(pale);
  for (let i = 0; i < K * per; i++) col.set([_c.r, _c.g, _c.b], i * 3);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  rg.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const vx = e.y, vy = -e.x;                                               // across the bell, in its plane
  const rings = (beat) => {
    const ph = beat / P.every, fr = ph - Math.floor(ph);
    let o = 0;
    for (let m = 0; m < K; m++) {
      const f = (m + fr) / K, cx = M.x + e.x * f * D, cy = M.y + e.y * f * D;
      const rho = Rb * (1 + f * P.spread), w = (0.22 + 0.55 * f) * S;
      em.fill(Math.max(0.004, Math.min(1, f * K * 2.5) * Math.pow(Math.max(0, 1 - f), 1.5)), m * per, (m + 1) * per);
      const put = (r, a, off) => { pos[o++] = cx + vx * Math.sin(a) * r + e.x * off; pos[o++] = cy + vy * Math.sin(a) * r + e.y * off; pos[o++] = Math.cos(a) * r; };
      for (let i = 0; i < NS; i++) {
        const a0 = (i / NS) * TAU, a1 = ((i + 1) / NS) * TAU;
        put(rho - w, a0, 0); put(rho + w, a0, 0); put(rho + w, a1, 0); put(rho - w, a0, 0); put(rho + w, a1, 0); put(rho - w, a1, 0);
        put(rho, a0, -w); put(rho, a0, w); put(rho, a1, w); put(rho, a0, -w); put(rho, a1, w); put(rho, a1, -w);
      }
    }
    rg.attributes.position.needsUpdate = true;
    rg.attributes.emissive.needsUpdate = true;
  };
  rings(0);
  F.inner.add(new THREE.Mesh(b.build(), mats.body), new THREE.Mesh(hb.build(), hm), lightMesh(rg, fx, 0.85));
  const group = new THREE.Group();
  group.add(F.inner);
  const x0 = pts[0].x, x1 = M.x + e.x * D * 0.6, top = Math.max(M.y + Rb * Math.abs(e.x), at(0.9).y) + 0.5 * S;
  const out = { group, fx, own, light: F.out(M), focus: F.out(V((x0 + M.x) / 2 + 0.1 * L, (P.saddle + M.y) / 2, 0)), span: (x1 - x0) / 2, clear: Math.min(95, 0.62 * L + 8 * S), height: top };
  if (top > 24) out.solid = { r: 0.62 * L, top, low: 0 };
  return finish(out, (t, beat) => rings(beat));
}

// ================================================================== eyrie
function eyrie(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), fx = [];
  const Hp = P.height, Rn = P.radius, pale = mixHex(A, 0xffffff, 0.55);
  // the pinnacle: rock on rock, narrowing, snow on its ledges
  const m = 5, rTop = Rn * 0.42, rBase = rTop + P.girth, sy = 1.7;
  const lean = V(Math.cos(P.leanDir) * P.lean * Hp, 0, Math.sin(P.leanDir) * P.lean * Hp);
  for (let k = 0; k < m; k++) {
    const f = k / (m - 1), r = rBase + (rTop - rBase) * Math.pow(f, 0.8), cy = -3 * S + f * (Hp - rTop * sy * 0.8 + 3 * S), off = k === m - 1 ? 0 : 2 * S * (1 - f);
    b.add(rock(1, 1, (d.seed[4] % 89) + k * 7, 0.32), mat(lean.x * f + (R() - 0.5) * off, cy, lean.z * f + (R() - 0.5) * off, 0, R() * TAU, 0, r, r * sy, r),
      (x, y, z, i) => (y > 0.5 && k < m - 1 ? SNOW : STONE[((i / 9) | 0) % 3]), 0, { flat: true });
  }
  for (let i = 0; i < P.splinters; i++) {
    const a = P.leanDir + 1 + (i / P.splinters) * TAU + R() * 0.8, rr = rBase * (0.85 + R() * 0.3), x = Math.cos(a) * rr, z = Math.sin(a) * rr, hh = (3.5 + R() * 3) * S;
    b.add(rock(1, 1, 40 + i * 3, 0.3), mat(x, ctx.ground(x, z) - 1.5 * S + hh * 0.85, z, 0.12 + R() * 0.14, Math.atan2(Math.cos(a), Math.sin(a)), 0, 1.7 * S, hh, 1.7 * S),
      (px, py, pz, j) => (py > 0.72 ? SNOW : STONE[((j / 9) | 0) % 3]), 0, { flat: true });
  }
  // the nest: a floor, and course on course of timbers laid round it, each across the last
  const C = V(lean.x, Hp, lean.z), wood = () => { const k = R(); return k < 0.1 ? RIM : k < 0.25 ? STONE[3] : WOOD[Math.floor(R() * 3)]; };
  b.cyl(Rn * 0.62, Rn * 0.42, 1.1 * S, 11, mat(C.x, Hp + 0.25 * S, C.z), WOOD[0]);
  let rimY = Hp;
  for (let k = 0; k < P.courses; k++) {
    const f = k / (P.courses - 1), r = Rn * (0.5 + 0.5 * Math.pow(f, 0.8)), cnt = Math.max(5, Math.round((TAU * r) / (3.0 * S)));
    rimY = Hp + 0.6 * S + Math.pow(f, 1.5) * Rn * 0.34;
    for (let j = 0; j < cnt; j++) {
      const a = ((j + R() * 0.6) / cnt) * TAU + k * 0.37, len = (4.2 + R() * 3.6) * S, yaw = a + Math.PI / 2 + (R() - 0.5) * 0.8, pitch = (R() - 0.5) * 0.45;
      const c = V(C.x + Math.cos(a) * r, rimY + (R() - 0.5) * 0.5 * S, C.z + Math.sin(a) * r), dir = V(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
      beam(b, c.clone().addScaledVector(dir, -len / 2), c.clone().addScaledVector(dir, len / 2), (0.42 + R() * 0.3) * S, wood());
    }
  }
  let topY = rimY;
  for (let i = 0; i < 11; i++) {
    const a = ((i + R() * 0.7) / 11) * TAU, a2 = a + (R() - 0.5) * 0.5, r2 = Rn * (1.12 + R() * 0.2), y2 = rimY + (0.4 + R() * 1.6) * S;
    beam(b, V(C.x + Math.cos(a) * Rn * 0.86, rimY - 0.6 * S, C.z + Math.sin(a) * Rn * 0.86), V(C.x + Math.cos(a2) * r2, y2, C.z + Math.sin(a2) * r2), 0.3 * S, wood());
    topY = Math.max(topY, y2);
  }
  for (let i = 0; i < P.braces; i++) {
    const a = ((i + R() * 0.5) / P.braces) * TAU;
    beam(b, V(C.x + Math.cos(a) * rTop * 0.9, Hp - (4 + R() * 3) * S, C.z + Math.sin(a) * rTop * 0.9), V(C.x + Math.cos(a) * Rn * 0.78, Hp + 0.6 * S + Rn * 0.17, C.z + Math.sin(a) * Rn * 0.78), 0.5 * S, WOOD[1]);
  }
  // the eggs: pale, lying against one another; a shell of light about each
  const eb = new Builder(), eggs = [];
  const rho = (P.eggR[0] * 1.08) / Math.sin(Math.PI / P.eggs);
  for (let i = 0; i < P.eggs; i++) {
    const re = P.eggR[i], a = (i / P.eggs) * TAU + P.eggTurn;
    const M = mat(C.x + Math.cos(a) * rho, Hp + 0.8 * S + re * 0.9, C.z + Math.sin(a) * rho, 0.9 + R() * 0.5, R() * TAU, 0, re, re * 1.35, re);
    b.ico(1, 2, M, pale, 0.45);
    const start = eb.pos.length / 3;
    eb.ico(1.16, 2, M, pale, 1);
    eggs.push({ start, end: eb.pos.length / 3, w: TAU / [4.1, 5.3, 6.7, 7.9, 9.7][i], ph: R() * TAU });
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const eg = eb.build(), ee = eg.attributes.emissive.array;
  group.add(lightMesh(eg, fx, 0.6, { fresnel: 0.5 }));
  // their light on the floor of the nest
  const fb = new Builder();
  fb.add(new THREE.CircleGeometry(Rn * 0.6, 18), mat(C.x, Hp + 0.95 * S, C.z, -Math.PI / 2, 0, 0), pale, (x, y) => 0.05 + 0.3 * Math.pow(Math.max(0, 1 - Math.hypot(x, y) / (Rn * 0.6)), 1.5));
  group.add(lightMesh(fb.build(), fx, 0.8));
  // feathers of light, loose, going up from it on the wind
  const fg = new Builder();
  fg.tri([0, 0, -1], [0.34, 0.1, 0.15], [0, 0, 1.1], 0xffffff, 1);
  fg.tri([0, 0, -1], [0, 0, 1.1], [-0.34, 0.1, 0.15], 0xffffff, 1);
  fg.tri([-0.05, 0, -1], [0.05, 0, -1], [0, 0, -1.5], 0xffffff, 1);
  const nf = P.feathers, feathers = lightInst(fg.build(), nf, fx, 0.9), Hf = P.rise;
  const fl = Array.from({ length: nf }, () => ({ ph: R(), a: R() * TAU, r: Math.sqrt(R()) * Rn * 0.8, sp: 0.6 + R() * 0.8, sw: R() * TAU, s: (1.1 + R() * 0.9) * S }));
  const base = new THREE.Color(mixHex(A, 0xffffff, 0.45));
  for (let i = 0; i < nf; i++) feathers.setColorAt(i, base);
  group.add(feathers);
  const wx = Math.cos(P.wind), wz = Math.sin(P.wind);
  const out = { group, fx, light: V(C.x, Hp + 2 * S, C.z), focus: V(C.x * 0.6, Hp * 0.62, C.z * 0.6), span: Rn * 1.35, clear: Rn * 1.35 + 7 * S, height: topY + 0.5 * S, solid: { r: Rn * 1.2, top: topY + 0.5 * S, low: 0 } };
  return finish(out, (t) => {
    // the eggs, each in its own time
    for (const g of eggs) ee.fill(0.1 + 0.9 * Math.pow(0.5 + 0.5 * Math.sin(t * g.w + g.ph), 2), g.start, g.end);
    eg.attributes.emissive.needsUpdate = true;
    for (let i = 0; i < nf; i++) {
      const l = fl[i], f = (l.ph + t * 0.022 * l.sp) % 1, out2 = 1 + 0.7 * f, drift = f * f * 9 * S;
      const x = C.x + Math.cos(l.a) * l.r * out2 + Math.sin(t * 0.5 * l.sp + l.sw) * 2.2 * S + wx * drift;
      const z = C.z + Math.sin(l.a) * l.r * out2 + Math.cos(t * 0.4 * l.sp + l.sw) * 2.2 * S + wz * drift;
      setInst(feathers, i, x, Hp + 1.5 * S + f * Hf, z, Math.sin(t * 1.1 * l.sp + l.sw) * 0.7, t * 0.3 * l.sp + l.sw, Math.cos(t * 0.9 * l.sp + l.sw) * 0.5, l.s);
      feathers.setColorAt(i, _c.copy(base).multiplyScalar(Math.min(1, f * 8) * Math.pow(Math.max(0, 1 - f), 1.3)));
    }
    feathers.instanceMatrix.needsUpdate = true;
    feathers.instanceColor.needsUpdate = true;
  });
}

// ================================================================== cable car
function pylon(b, x, top, G, S, half0, half1) {
  const ref = G(x, 0), corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (k, f) => { const h = half0 + (half1 - half0) * f; return V(x + corners[k][0] * h, ref + (top - ref) * f, corners[k][1] * h); };
  const steps = Math.max(3, Math.round((top - ref) / (4.6 * S)));
  for (let k = 0; k < 4; k++) {
    // each leg goes on down its own line until it meets the rock
    let f0 = 0;
    for (let it = 0; it < 3; it++) { const p = at(k, f0); f0 = clamp((G(p.x, p.z) - 1.2 - ref) / (top - ref), -0.8, 0.2); }
    const foot = at(k, f0);
    beam(b, foot, at(k, 1), 0.42 * S, STONE[3]);
    b.box(1.4 * S, 1.2 * S, 1.4 * S, mat(foot.x, foot.y + 0.9, foot.z), STONE[1]);
    for (let s = 0; s < steps; s++) {
      const fa = s / steps, fb = (s + 1) / steps, k2 = (k + 1) % 4, zig = (s + k) % 2;
      beam(b, at(k, fb), at(k2, fb), 0.2 * S, STONE[2]);
      beam(b, at(zig ? k : k2, Math.max(fa, 0.02)), at(zig ? k2 : k, fb), 0.18 * S, STONE[2]);
    }
  }
  // its head: a sheave for the cable to run over
  b.box(half1 * 2 + 1.4 * S, 0.9 * S, half1 * 2 + 0.8 * S, mat(x, top + 0.3 * S, 0), STONE[3]);
  b.box(half1 * 2 + 1.2 * S, 0.22 * S, half1 * 2 + 0.6 * S, mat(x, top + 0.86 * S, 0), SNOW);
  for (const q of [-1, 1]) b.box(0.6 * S, 2.0 * S, 0.22 * S, mat(x, top + 1.6 * S, q * 0.5 * S), STONE[2]);
  b.cyl(1.25 * S, 1.25 * S, 0.45 * S, 12, mat(x, top + 1.65 * S, 0, Math.PI / 2, 0, 0), STONE[3]);
  b.cyl(0.3 * S, 0.3 * S, 1.3 * S, 6, mat(x, top + 1.65 * S, 0, Math.PI / 2, 0, 0), RIM);
}

function cablecar(d, A, mats, ctx) {
  const P = d.params, S = d.size, b = new Builder(), fx = [], own = [];
  const F = turned(ctx, P.bearing), G = F.ground, W = P.span, pale = mixHex(A, 0xffffff, 0.3);
  const xa = -0.3 * W, xb = 0.7 * W, hang = 3.2 * S, Hc = P.cabH, Lc = P.cabL, Wc = P.cabW, sheave = 2.9 * S;
  let topA = G(xa, 0) + P.tall, topB = Math.max(topA - P.drop, G(xb, 0) + 9 * S);
  const cab = (u) => V(xa + (xb - xa) * u, topA + (topB - topA) * u + sheave - P.sag * 4 * u * (1 - u), 0);
  // the cable clear of the rock all along, and the gondola hanging well clear of it
  let lift = 0;
  for (let i = 1; i < 20; i++) { const p = cab(i / 20); lift = Math.max(lift, 5 * S - (p.y - G(p.x, 0))); }
  { const p = cab(P.at); lift = Math.max(lift, hang + Hc + P.rope + 5 * S - (p.y - G(p.x, 0))); }
  topA += lift; topB += lift;
  pylon(b, xa, topA, G, S, 2.6 * S, 0.75 * S);
  pylon(b, xb, topB, G, S, 2.3 * S, 0.75 * S);
  const NC = 22;
  for (let i = 0; i < NC; i++) beam(b, cab(i / NC), cab((i + 1) / NC), 0.16 * S, RIM);
  // beyond each pylon it goes down to a block of stone
  const anchor = (x) => { const g = G(x, 0); b.box(2.6 * S, 2.2 * S + 4, 2.6 * S, mat(x, g + 1.1 * S - 2, 0), STONE[1]); b.box(2.7 * S, 0.25 * S, 2.7 * S, mat(x, g + 2.3 * S, 0), SNOW); return V(x, g + 1.6 * S, 0); };
  beam(b, cab(0), anchor(xa - 0.16 * W), 0.16 * S, RIM);
  beam(b, cab(1), anchor(xb + 0.12 * W), 0.16 * S, RIM);
  // the gondola: a grip on the cable, a hanger, a cabin with the light still on in it
  const gon = new THREE.Group();
  gon.position.copy(cab(P.at));
  const gb = new Builder(), ty = -hang, wyTop = ty - 0.32 * S, hwn = Hc * 0.5, hlo = Hc * 0.5;
  gb.box(1.7 * S, 0.5 * S, 0.7 * S, mat(0, 0.1 * S, 0), STONE[3]);
  for (const q of [-1, 1]) gb.cyl(0.38 * S, 0.38 * S, 0.3 * S, 8, mat(q * 0.55 * S, 0.3 * S, 0, Math.PI / 2, 0, 0), RIM);
  for (const q of [-1, 1]) beam(gb, V(0, -0.1 * S, 0), V(q * Lc * 0.34, ty, 0), 0.3 * S, STONE[3]);
  gb.box(Lc + 0.5 * S, 0.32 * S, Wc + 0.5 * S, mat(0, ty - 0.16 * S, 0), STONE[3]);
  gb.box(Lc + 0.3 * S, 0.2 * S, Wc + 0.3 * S, mat(0, ty + 0.1 * S, 0), SNOW);
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) gb.box(0.3 * S, hwn, 0.3 * S, mat(qx * (Lc / 2 - 0.15 * S), wyTop - hwn / 2, qz * (Wc / 2 - 0.15 * S)), STONE[2]);
  for (const qz of [-1, 1]) for (let i = 1; i < P.bays; i++) gb.box(0.22 * S, hwn, 0.22 * S, mat((i / P.bays - 0.5) * Lc, wyTop - hwn / 2, qz * (Wc / 2 - 0.12 * S)), STONE[2]);
  gb.box(Lc - 0.5 * S, hwn - 0.1 * S, Wc - 0.5 * S, mat(0, wyTop - hwn / 2, 0), A, PULSE);
  gb.box(Lc / P.bays, hwn, 0.2 * S, mat(((P.dark + 0.5) / P.bays - 0.5) * Lc, wyTop - hwn / 2, P.darkSide * (Wc / 2 - 0.08 * S)), STONE[0]);   // one bay boarded
  gb.box(Lc, hlo, Wc, mat(0, wyTop - hwn - hlo / 2, 0), STONE[1]);
  gb.box(Lc + 0.2 * S, 0.25 * S, Wc + 0.2 * S, mat(0, wyTop - hwn - 0.1 * S, 0), RIM);
  gb.box(Lc * 0.6, 0.3 * S, Wc * 0.5, mat(0, wyTop - Hc - 0.15 * S, 0), STONE[0]);
  gb.box(0.1 * S, P.rope, 0.1 * S, mat(Lc * 0.3, wyTop - Hc - P.rope / 2, Wc * 0.2), RIM);                     // a line still hanging from it
  gb.ico(0.32 * S, 0, mat(Lc * 0.3, wyTop - Hc - P.rope, Wc * 0.2), STONE[3]);
  const gm = worldMaterial({ unique: true });                                // its own, so that its light can falter
  own.push(gm);
  gon.add(new THREE.Mesh(gb.build(), gm));
  const hb = new Builder();
  hb.box(Lc + 0.9 * S, hwn + 0.6 * S, Wc + 0.9 * S, mat(0, wyTop - hwn / 2, 0), pale, 1);
  const halo = lightMesh(hb.build(), fx, 0.24, { fresnel: 0.4 });
  gon.add(halo);
  // the small lights that run down the cable, now and then: a head and what follows it
  const nb = P.beads.length, sp = sparks(nb * 3, pale, 1.7 * S, fx, 1);
  sp.al.fill(0);
  for (let i = 0; i < nb * 3; i++) { const p = cab(0); sp.pos.set([p.x, p.y, p.z], i * 3); sp.sz[i] = [1, 0.7, 0.5][i % 3]; }
  F.inner.add(new THREE.Mesh(b.build(), mats.body), gon, sp.p);
  const group = new THREE.Group();
  group.add(F.inner);
  const top = topA + sheave + 0.3 * S, lightAt = cab(P.at).add(V(0, wyTop - hwn / 2, 0));
  const out = { group, fx, own, light: F.out(lightAt), focus: F.out(V(0.2 * W, (lightAt.y + top) / 2, 0)), span: 0.64 * W + 1.3 * S, clear: Math.min(95, 0.85 * W + 6 * S), height: top };
  if (top > 24) out.solid = { r: 0.76 * W, top, low: 0 };
  return finish(out, (t, beat, c) => {
    gon.rotation.x = P.swing * wind(t, 2.2);
    gon.rotation.z = P.list + 0.035 * wind(t * 1.3, 5.7);
    let pass = 0;
    for (let j = 0; j < nb; j++) {
      const T = P.beads[j], run = 7, cyc = (t + j * 4.7) % T;
      for (let k = 0; k < 3; k++) {
        const u = cyc / run - k * 0.014, i = j * 3 + k, on = u > 0 && u < 1;
        const p = cab(clamp(u, 0, 1));
        sp.pos[i * 3] = p.x; sp.pos[i * 3 + 1] = p.y + 0.25 * S; sp.pos[i * 3 + 2] = p.z;
        sp.al[i] = on ? Math.pow(Math.sin(Math.PI * u), 0.35) * [1, 0.55, 0.3][k] : 0;
        if (on && k === 0) pass = Math.max(pass, Math.exp(-Math.pow((u - P.at) / 0.05, 2)));
      }
    }
    sp.g.attributes.position.needsUpdate = true;
    sp.g.attributes.aAlpha.needsUpdate = true;
    // its light: steady, but for a stutter every so often; and it answers a light going by on the cable
    const stut = t % P.flick < 1.3 && hash1(Math.floor(t * 11)) < 0.45 ? 0.2 : 1;
    gm.uniforms.uPulse.value = (0.55 + 0.25 * (c.pulse ?? 1)) * stut + pass * 0.9;
    halo.material.uniforms.uOpacity.value = 0.24 * (c.reveal ?? 1) * (stut + pass * 1.5);
  });
}

// ================================================================== sheaves
function sheaf(b, M, hs, h, waist, lit) {
  const rb = 0.085 * h, rw = 0.042 * h, rh = 0.1 * h, wy = waist * hs, uh = hs * 0.9 - wy;
  const stripes = (c0, c1) => (x, y, z, i) => (((i / 6) | 0) % 2 ? c0 : c1);
  b.add(new THREE.CylinderGeometry(rw, rb, wy, 6, 1, true), mul(M, mat(0, wy / 2, 0)), stripes(STRAW[0], STRAW[1]), 0, { flat: true });
  b.cyl(rw * 1.3, rw * 1.3, 0.045 * hs, 6, mul(M, mat(0, wy, 0)), RIM);
  b.add(new THREE.CylinderGeometry(rh, rw, uh, 6, 1, true), mul(M, mat(0, wy + uh / 2, 0)), stripes(STRAW[1], STRAW[2]), 0, { flat: true });
  b.cone(rh * 1.08, hs * 0.17, 6, mul(M, mat(0, hs * 0.9 + hs * 0.085, 0)), lit ? LEAF[3] : LEAF[0], lit ? 1.6 : 0.45);
}

function sheaves(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), fx = [];
  const n = P.n, H = P.height;
  // where the stooks stand
  const spots = [];
  if (P.layout === 'ring') for (let i = 0; i < n; i++) { const a = (i / n) * TAU + P.turn; spots.push([Math.cos(a) * P.radius, Math.sin(a) * P.radius]); }
  else if (P.layout === 'spiral') for (let i = 0; i < n; i++) { const a = i * GOLDEN + P.turn, r = 0.42 * H * Math.sqrt(i + 0.5); spots.push([Math.cos(a) * r, Math.sin(a) * r]); }
  else {
    const rows = n > 9 ? 3 : 2, gapZ = H * 1.0, gapX = H * 0.78;
    for (let i = 0; i < n; i++) { const r = i % rows, k = Math.floor(i / rows), cnt = Math.ceil((n - r) / rows); spots.push([(k - (cnt - 1) / 2 + (r % 2) * 0.5 - 0.25) * gapX, (r - (rows - 1) / 2) * gapZ]); }
  }
  let reach = 0, top = 0;
  spots.forEach(([x, z], i) => {
    const h = H * (i === 0 ? 1 : 0.82 + R() * 0.18), rho = 0.2 * h, per = P.per, y0 = ctx.ground(x, z), t0 = R() * TAU;
    for (let k = 0; k < per; k++) {
      const a = (k / per) * TAU + t0, sx = x + Math.cos(a) * rho, sz = z + Math.sin(a) * rho, hs = h * (0.94 + R() * 0.06);
      const M = mat(sx, ctx.ground(sx, sz) - 0.3, sz, Math.atan((rho * 0.78) / hs), Math.atan2(-Math.cos(a), -Math.sin(a)), 0);
      sheaf(b, M, hs, h, P.waist, k === 0);
    }
    reach = Math.max(reach, Math.hypot(x, z) + 0.3 * h);
    top = Math.max(top, y0 + h);
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the fireflies: each about its own place among the stooks, until the ship is near
  const nf = P.flies, sp = sparks(nf, mixHex(A, 0xfff1c9, 0.4), 1.0 * S, fx, 1);
  const fl = Array.from({ length: nf }, () => {
    const a = R() * TAU, r = Math.sqrt(R()) * (reach + 3 * S), x = Math.cos(a) * r, z = Math.sin(a) * r;
    return { x, y: ctx.ground(x, z) + (1.2 + R() * R() * 0.8 * (H / S)) * S, z, ph: R() * TAU, ax: (2 + R() * 4) * S, wx: 0.2 + R() * 0.3, wz: 0.2 + R() * 0.3, wy: 0.3 + R() * 0.4 };
  });
  fl.forEach((l, i) => { sp.sz[i] = 0.6 + R() * 0.8; });
  group.add(sp.p);
  let last = null, g = 0;
  const out = { group, fx, light: V(spots[0][0], ctx.ground(spots[0][0], spots[0][1]) + H * 0.95, spots[0][1]), focus: V(0, H * 0.5, 0), span: reach + 1 * S, clear: Math.min(95, reach + 7 * S), height: top };
  return finish(out, (t, beat, c) => {
    const dt = last === null ? 0 : clamp(t - last, 0, 0.1);
    last = t;
    g += (sstep(0.5, 0.9, c.near || 0) - g) * (1 - Math.exp(-dt * 0.45));
    // where they gather: on the ship's side, and up toward it
    const s = c.shipLocal, far = s ? Math.max(1, Math.hypot(s.x, s.z)) : 1, k = s ? Math.min(1, (reach * 0.9) / far) : 0;
    const tx = s ? s.x * k : 0, tz = s ? s.z * k : 0, ty = s ? clamp(s.y - 8, 4 * S, H * 1.4) : H;
    for (let i = 0; i < nf; i++) {
      const l = fl[i], ox = Math.sin(t * l.wx + l.ph) * l.ax, oz = Math.cos(t * l.wz + l.ph * 1.3) * l.ax, oy = Math.sin(t * l.wy + l.ph * 2.1) * 1.2 * S;
      const gi = g * (0.55 + 0.4 * ((i * 0.618) % 1));
      sp.pos[i * 3] = l.x + ox + (tx + l.x * 0.22 + ox * 0.5 - l.x - ox) * gi;
      sp.pos[i * 3 + 1] = l.y + oy + (ty + (l.y - H * 0.4) * 0.3 + oy - l.y - oy) * gi;
      sp.pos[i * 3 + 2] = l.z + oz + (tz + l.z * 0.22 + oz * 0.5 - l.z - oz) * gi;
      // each blinks in its own time; gathered, they fall into step
      sp.al[i] = 0.12 + 0.88 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.9 + l.ph * (1 - g * 0.9)), 3);
    }
    sp.g.attributes.position.needsUpdate = true;
    sp.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ================================================================== swing
function swing(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), fx = [], own = [];
  const H = P.height, Ht = H * 0.62, rB = H * 0.032, pale = mixHex(A, 0xffffff, 0.3);
  // the trunk: pale, a little bowed, dark at the foot and dark marks across it all the way up
  const lx = Math.cos(P.leanDir) * P.lean, lz = Math.sin(P.leanDir) * P.lean;
  const trunk = (f) => V(lx * Ht * f + Math.sin(f * Math.PI) * lz * Ht * 0.6, f * Ht, lz * Ht * f - Math.sin(f * Math.PI) * lx * Ht * 0.6);
  const rad = (f) => rB * (1 - 0.55 * clamp(f, 0, 1));
  const tp = [];
  for (let i = 0; i <= 10; i++) tp.push(trunk(-0.05 + (i / 10) * 1.05));
  b.tube(tp, (t) => rad(-0.05 + t * 1.05) * (t < 0.1 ? 1.5 - t * 5 : 1), 7, (t) => (t < 0.09 ? mixHex(BARK, MARK, 0.75) : t < 0.16 ? mixHex(BARK, MARK, 0.35) : BARK));
  const nm = Math.floor(Ht / (1.5 * S));
  for (let i = 0; i < nm; i++) {
    const f = 0.1 + ((i + R() * 0.6) / nm) * 0.88, c = trunk(f), r = rad(f), a = R() * TAU;
    b.box(r * (0.9 + R() * 0.7), (0.22 + R() * 0.35) * S, r * 0.36, mat(c.x + Math.cos(a) * r * 0.84, c.y, c.z + Math.sin(a) * r * 0.84, 0, Math.PI / 2 - a, 0), MARK);
  }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + R(), r = rB * (2.2 + R()); beam(b, V(Math.cos(a) * r, ctx.ground(Math.cos(a) * r, Math.sin(a) * r) - 0.5, Math.sin(a) * r), V(Math.cos(a) * rB * 0.3, 1.6 * S, Math.sin(a) * rB * 0.3), rB * 0.8, mixHex(BARK, MARK, 0.7)); }
  // its crown: bare, forking, darker toward the twigs
  const segs = [], o = { spread: 1.25, rise: 0.3, rise2: 0.4, shrink: 0.62, kids: (k) => (k > 1 ? 3 : 2) };
  for (let i = 0; i < P.limbs; i++) {
    const a = (i / P.limbs) * TAU + R(), from = trunk(1 - i * 0.08);
    crown(R, from, V(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize(), H * 0.2, rad(1) * 0.85, 3, o, segs);
  }
  crownTo(segs, Ht * 0.7, H);
  for (const s of segs) beam(b, s.from, s.to, s.r * 2, mixHex(BARK, MARK, [0.85, 0.6, 0.3, 0.05][s.k]));
  // the one long bough: out from the trunk, level where the ropes are tied, its tip turned up
  const fb = (P.bough * H) / Ht, q0 = trunk(fb), dir = V(Math.cos(P.boughDir), 0, Math.sin(P.boughDir)), Lb = P.boughLen;
  const bp = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; bp.push(q0.clone().addScaledVector(dir, u * Lb).add(V(0, Lb * 0.14 * sstep(0, 0.45, u) + Math.max(0, u - 0.85) * Lb * 0.35, 0))); }
  const rbo = (u) => rad(fb) * 0.66 * (1 - 0.68 * u);
  b.tube(bp, rbo, 6, BARK);
  for (const u of [0.28, 0.52, 0.92]) { const c = q0.clone().addScaledVector(dir, u * Lb).add(V(0, Lb * 0.14 * sstep(0, 0.45, u), 0)); beam(b, c, c.clone().add(V((R() - 0.5) * 3 * S, (2.5 + R() * 2.5) * S, (R() - 0.5) * 3 * S)), rbo(u) * 0.9, mixHex(BARK, MARK, 0.6)); }
  for (let i = 0; i < 3; i++) { const u = 0.3 + i * 0.22, c = q0.clone().addScaledVector(dir, u * Lb).add(V(0, Lb * 0.14 * sstep(0, 0.45, u), 0)); b.box(rbo(u) * 2.2, 0.3 * S, rbo(u) * 0.8, along(c.clone().add(V(0, 0, 0)), dir, V(1, 0, 0)), MARK); }
  // the swing
  const ua = 0.66, w = Math.min(P.seat, 0.3 * Lb), piv = q0.clone().addScaledVector(dir, ua * Lb).add(V(0, Lb * 0.14 - rbo(ua) * 0.8, 0)), Lr = P.rope;
  const sw = new THREE.Group();
  sw.position.copy(piv);
  sw.rotation.order = 'YXZ';
  sw.rotation.y = -P.boughDir;
  const sb = new Builder();
  for (const q of [-1, 1]) {
    sb.box(0.15 * S, Lr, 0.15 * S, mat((q * w) / 2, -Lr / 2, 0), RIM);
    sb.box(0.5 * S, 0.5 * S, 0.5 * S, mat((q * w) / 2, 0, 0), mixHex(BARK, MARK, 0.6));
    sb.box(0.42 * S, 0.42 * S, 0.42 * S, mat((q * w) / 2, -Lr + 0.3 * S, 0), A, PULSE);
  }
  sb.box(w + 0.9 * S, 0.3 * S, 1.4 * S, mat(0, -Lr, 0), WOOD[2]);
  sb.box(w + 0.9 * S, 0.1 * S, 0.2 * S, mat(0, -Lr + 0.16 * S, 0.6 * S), RIM);
  sb.box(w + 0.9 * S, 0.1 * S, 0.2 * S, mat(0, -Lr + 0.16 * S, -0.6 * S), RIM);
  sw.add(new THREE.Mesh(sb.build(), mats.glow));
  // the lantern at its foot, and the light it lays on the ground
  const la = P.boughDir + 0.75, ld = rB * 1.5 + 2.6 * S, lxx = Math.cos(la) * ld, lzz = Math.sin(la) * ld, ly = ctx.ground(lxx, lzz);
  b.box(1.9 * S, 0.9 * S + 2, 1.9 * S, mat(lxx, ly + 0.45 * S - 1, lzz, 0, la, 0), STONE[1]);
  b.box(1.5 * S, 0.3 * S, 1.5 * S, mat(lxx, ly + 1.05 * S, lzz, 0, la, 0), STONE[3]);
  b.box(0.95 * S, 1.2 * S, 0.95 * S, mat(lxx, ly + 1.8 * S, lzz, 0, la, 0), A, PULSE);
  for (const [ex, ez] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(0.16 * S, 1.2 * S, 0.16 * S, mul(mat(lxx, ly + 1.8 * S, lzz, 0, la, 0), mat(ex * 0.56 * S, 0, ez * 0.56 * S)), STONE[3]);
  b.box(1.7 * S, 0.24 * S, 1.7 * S, mat(lxx, ly + 2.52 * S, lzz, 0, la, 0), STONE[3]);
  if (P.lantern === 'peaked') b.cone(1.25 * S, 1.0 * S, 4, mat(lxx, ly + 3.14 * S, lzz, 0, la + Math.PI / 4, 0), STONE[2]);
  else { b.box(1.1 * S, 0.3 * S, 1.1 * S, mat(lxx, ly + 2.79 * S, lzz, 0, la, 0), STONE[2]); b.ico(0.3 * S, 0, mat(lxx, ly + 3.2 * S, lzz), RIM); }
  const gl = new Builder(), pr = 6.5 * S;
  gl.ico(1.5 * S, 1, mat(lxx, ly + 1.8 * S, lzz), pale, 0.6);
  // (the pool of its light, laid on the ground as the ground lies)
  for (let j = 0; j < 4; j++) for (let i = 0; i < 16; i++) {
    const pt = (jj, ii) => { const r = (jj / 4) * pr, a = (ii / 16) * TAU, x = lxx + Math.cos(a) * r, z = lzz + Math.sin(a) * r; return [x, ctx.ground(x, z) + 0.2, z]; };
    gl.quad(pt(j, i), pt(j + 1, i), pt(j + 1, i + 1), pt(j, i + 1), mixHex(A, LEAF[3], 0.4), 0.04 + 0.4 * Math.pow(Math.max(0, 1 - (j + 0.5) / 4), 2));
  }
  // the leaves that fall round it
  const fall = leafFall(P.leaves, 1.0 * S, R, own, (Q) => { const a = Q() * TAU, r = (0.08 + 0.92 * Math.sqrt(Q())) * H * 0.42, x = Math.cos(a) * r, z = Math.sin(a) * r; return [x, z, H * (0.45 + Q() * 0.45), ctx.ground(x, z)]; });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body), sw, fall.mesh, lightMesh(gl.build(), fx, 0.7));
  const reach = Math.max(...segs.map((s) => Math.hypot(s.to.x, s.to.z)), Lb + 1), om = Math.sqrt(9.81 / Lr);
  const out = { group, fx, own, light: V(lxx, ly + 1.8 * S, lzz), focus: V(dir.x * Lb * 0.3, H * 0.42, dir.z * Lb * 0.3), span: reach + 1 * S, clear: Math.min(95, reach + 7 * S), height: H + 0.5 * S, solid: { r: reach * 0.8, top: H + 0.5 * S, low: 0 } };
  return finish(out, (t) => {
    // a pendulum of its own length: it keeps its time, and never quite the same height twice
    sw.rotation.x = P.amp * (1 + 0.12 * Math.sin(t * 0.045)) * Math.sin(t * om);
    fall.update(t);
  });
}

// ================================================================== fairy ring
const isPrime = (k) => { if (k < 2) return false; for (let j = 2; j * j <= k; j++) if (k % j === 0) return false; return true; };
const LEVEL = {
  ruler: (i) => { let v = 0, k = i + 1; while (k % 2 === 0 && v < 3) { k /= 2; v++; } return v / 3; },
  'Fibonacci word': (i) => (Math.floor((i + 2) / 1.6180339887) - Math.floor((i + 1) / 1.6180339887) ? 1 : 0.25),
  primes: (i) => (isPrime(i + 1) ? 1 : 0.18),
  'harmonic series': (i) => 1 / (1 + (i % 5)),
};

function fairyring(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), fx = [], own = [];
  const n = P.n, Rr = P.radius, gold = mixHex(A, 0xfff1c9, 0.55), STEM = 0xd6cfbd;
  const caps = [], pb = new Builder();
  let top = 0, wide = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + P.turn, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr, y0 = ctx.ground(x, z), lv = LEVEL[P.seq](i);
    const h = (3.2 * S + (P.tall - 3.2 * S) * lv) * (0.94 + R() * 0.12), rc = (1.5 + 3.5 * lv) * S * (0.92 + R() * 0.16), rs = rc * 0.2 + 0.12 * S;
    const M = mat(x, y0 - 0.4, z, P.lean * (0.5 + R()), Math.atan2(Math.cos(a), Math.sin(a)) + (R() - 0.5) * 0.8, 0), at = (ly) => mul(M, mat(0, ly, 0));
    b.cyl(rs * 0.72, rs, h + 0.4, 6, at((h + 0.4) / 2), STEM);
    b.cyl(rs * 1.5, rs * 0.9, 0.35 * S, 6, at(h * 0.74), mixHex(STEM, RIM, 0.4));                     // its ring
    // the gills: lit from beneath, alternately brighter and dimmer
    const gh = rc * 0.3;
    b.add(new THREE.CylinderGeometry(rc * 0.97, rs * 0.8, gh, 14, 1, true), at(h + 0.4 - gh / 2), gold, (px, py, pz) => ((Math.round((Math.atan2(pz, px) / TAU) * 28) & 1) ? PULSE : 0.75), { flat: true });
    // the cap: amber, darker at its crown
    const sy = P.cap === 'bell' ? 0.95 : P.cap === 'plate' ? 0.32 : 0.62, amber = mixHex(LEAF[1], LEAF[2], (i * 0.618) % 1);
    b.add(new THREE.SphereGeometry(rc, 10, 3, 0, TAU, 0, Math.PI / 2), mul(at(h + 0.4), mat(0, 0, 0, 0, 0, 0, 1, sy, 1)), (px, py) => (py > rc * 0.8 ? mixHex(amber, MARK, 0.45) : py > rc * 0.45 ? amber : mixHex(amber, LEAF[0], 0.35)), 0.12, { flat: true });
    b.cyl(rc * 1.02, rc * 1.02, 0.14 * S, 10, at(h + 0.4), mixHex(amber, LEAF[3], 0.5), 0.3);
    const tip = V(0, h + 0.4 + rc * sy, 0).applyMatrix4(M);
    caps.push({ tip, rc });
    top = Math.max(top, tip.y);
    wide = Math.max(wide, rc);
    // the light it lays under itself
    pb.add(new THREE.CircleGeometry(rc * 1.5, 12), mat(x, y0 + 0.22, z, -Math.PI / 2, 0, 0), gold, (px, py) => 0.04 + 0.42 * Math.pow(Math.max(0, 1 - Math.hypot(px, py) / (rc * 1.5)), 1.6));
  }
  // inside the ring: the ground dusted with a faint light (laid as the ground lies), brightest toward the ring
  for (let j = 0; j < 5; j++) for (let i = 0; i < 24; i++) {
    const pt = (jj, ii) => { const r = (jj / 5) * Rr * 0.94, a = (ii / 24) * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r; return [x, ctx.ground(x, z) + 0.18, z]; };
    pb.quad(pt(j, i), pt(j + 1, i), pt(j + 1, i + 1), pt(j, i + 1), gold, 0.05 + 0.16 * Math.pow((j + 0.5) / 5, 2));
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body), lightMesh(pb.build(), fx, 0.7));
  const nd = 150, dust = sparks(nd, gold, 0.55 * S, fx, 0.9), dph = [];
  for (let i = 0; i < nd; i++) { const a = R() * TAU, r = Math.sqrt(R()) * Rr * 0.9, x = Math.cos(a) * r, z = Math.sin(a) * r; dust.pos.set([x, ctx.ground(x, z) + 0.3, z], i * 3); dust.sz[i] = 0.5 + R(); dph.push(R() * TAU); }
  group.add(dust.p);
  // spores: three to a cap, let go on its beat, going up and thinning
  const ns = n * 3, sp = sparks(ns, mixHex(A, 0xfff1c9, 0.4), 0.6 * S, fx, 1), sd = Array.from({ length: ns }, () => ({ a: R() * TAU, r: R(), ph: R() * TAU }));
  group.add(sp.p);
  // leaves fall all round it, and none inside
  const fall = leafFall(P.leaves, 0.9 * S, R, own, (Q) => { const a = Q() * TAU, r = Rr + wide + (1.5 + Q() * 11) * S, x = Math.cos(a) * r, z = Math.sin(a) * r; return [x, z, (14 + Q() * 12) * S, ctx.ground(x, z)]; });
  group.add(fall.mesh);
  const out = { group, fx, own, light: V(0, 1.5 * S, 0), focus: V(0, top * 0.4, 0), span: Rr + wide + 1 * S, clear: Math.min(95, Rr + wide + 9 * S), height: top };
  return finish(out, (t, beat) => {
    const Lb = P.life;
    for (let i = 0; i < ns; i++) {
      const m = Math.floor(i / 3), c = caps[m], s = sd[i];
      const age = (((beat * P.rate - ((m * P.stride) % Lb) - (i % 3) * 0.14) % Lb) + Lb) % Lb, f = age / Lb, up = 1 - (1 - f) * (1 - f);
      sp.pos[i * 3] = c.tip.x + Math.cos(s.a) * c.rc * (0.25 + 0.5 * s.r + f * 0.5) + Math.sin(f * 5 + s.ph) * 0.9 * S * f;
      sp.pos[i * 3 + 1] = c.tip.y - c.rc * 0.1 + up * (5 + 6 * s.r) * S;
      sp.pos[i * 3 + 2] = c.tip.z + Math.sin(s.a) * c.rc * (0.25 + 0.5 * s.r + f * 0.5) + Math.cos(f * 4 + s.ph) * 0.9 * S * f;
      sp.al[i] = Math.min(1, f * 14) * Math.pow(Math.max(0, 1 - f), 1.2);
    }
    sp.g.attributes.position.needsUpdate = true;
    sp.g.attributes.aAlpha.needsUpdate = true;
    for (let i = 0; i < nd; i++) dust.al[i] = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.7 + dph[i]), 2);
    dust.g.attributes.aAlpha.needsUpdate = true;
    fall.update(t);
  });
}

// ================================================================== chrysalis
// its shape: hung from a thread at the origin, 0.35 of thread and then one unit long, widest a third of the way down
const pupa = (v) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(clamp(v, 0, 1), 0.62))), 0.85);
function pupaGlass() {
  const lp = [];
  for (let i = 0; i <= 9; i++) { const v = i / 9; lp.push(new THREE.Vector2(Math.max(i === 0 ? 0.1 : 0.03, pupa(v)), -0.35 - v)); }
  return new THREE.LatheGeometry(lp, 8);
}

function chrysalis(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), b = new Builder(), fx = [], own = [];
  const H = P.height, Ht = H * 0.42, rB = H * 0.04, n = P.n;
  // the tree: dark, bare, its boughs going out wide
  const lx = (R() - 0.5) * 0.08, lz = (R() - 0.5) * 0.08;
  const trunk = (f) => V(lx * Ht * f + Math.sin(f * 4 + P.twist) * rB * 0.5 * f, f * Ht, lz * Ht * f + Math.cos(f * 3 + P.twist) * rB * 0.5 * f);
  const rad = (f) => rB * (1 - 0.5 * clamp(f, 0, 1));
  const tp = [];
  for (let i = 0; i <= 8; i++) tp.push(trunk(-0.06 + (i / 8) * 1.06));
  b.tube(tp, (t) => rad(-0.06 + t * 1.06) * (t < 0.12 ? 1.5 - t * 4.2 : 1), 6, (t) => STONE[1 + (Math.floor(t * 8) % 2)]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + R(), r = rB * (2.4 + R()); beam(b, V(Math.cos(a) * r, ctx.ground(Math.cos(a) * r, Math.sin(a) * r) - 0.5, Math.sin(a) * r), V(Math.cos(a) * rB * 0.3, 2 * S, Math.sin(a) * rB * 0.3), rB * 0.8, STONE[1]); }
  const segs = [], o = { spread: 1.4, rise: 0.1, rise2: 0.45, shrink: 0.66, kids: (k) => (k > 1 ? 3 : 2) };
  for (let i = 0; i < P.boughs; i++) {
    const a = (i / P.boughs) * TAU + R() * 0.8;
    crown(R, trunk(1 - (i % 3) * 0.1), V(Math.cos(a) * P.spread, 0.75, Math.sin(a) * P.spread).normalize(), H * 0.27, rad(1) * 0.8, 2, o, segs);
  }
  crownTo(segs, Ht * 0.75, H);
  for (const s of segs) beam(b, s.from, s.to, s.r * 2, [STONE[3], STONE[2], STONE[1]][s.k]);
  // where they hang: the ends of its boughs, the farthest apart first
  const nodes = segs.filter((s) => s.k < 2).map((s) => s.to), picked = [];
  for (let i = 0; i < n; i++) {
    let best = 0, bd = -1;
    nodes.forEach((p, j) => { if (picked.includes(j)) return; const dd = picked.length ? Math.min(...picked.map((k) => nodes[k].distanceTo(p))) : R(); if (dd > bd) { bd = dd; best = j; } });
    picked.push(best);
  }
  const hung = picked.map((j, i) => { const L = Math.min(P.sizes[i], (nodes[j].y - 2.5 * S) / 1.35); return { p: nodes[j], L, r: L * (0.2 + R() * 0.05), ph: R() * TAU, th: 0.42 + R() * 0.3, rate: 0.35 + R() * 0.9, g: 0 }; });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const live = hung.filter((h, i) => i !== P.open), empty = hung[P.open], nl = live.length;
  // the glass of them
  const gl = new Builder();
  gl.add(pupaGlass(), null, (x, y) => mixHex(AMBER[0], AMBER[1], clamp(-(y + 0.35), 0, 1)), 1);
  const glass = lightInst(gl.build(), nl, fx, 0.4, { fresnel: 0.85 });
  // what is dark of them: the thread, the cap, the rings of the body
  const hk = new Builder();
  hk.box(0.1, 0.38, 0.1, mat(0, -0.18, 0), MARK);
  hk.cyl(0.1, 0.3, 0.12, 6, mat(0, -0.4, 0), MARK);
  for (const v of [0.5, 0.64, 0.77, 0.88]) hk.cyl(pupa(v - 0.018) * 1.04, pupa(v + 0.018) * 1.04, 0.036, 8, mat(0, -0.35 - v, 0), MARK, 0, true);
  const hm = worldMaterial({ unique: true });
  own.push(hm);
  const husk = new THREE.InstancedMesh(hk.build(), hm, nl);
  husk.frustumCulled = false;
  // the light folded in each: four blades along a spine, closed like a fan
  const lb = new Builder();
  for (const be of [0.45, -0.45, Math.PI - 0.45, Math.PI + 0.45]) lb.tri([0, -0.52, 0], [0, -1.2, 0], [Math.cos(be) * 0.52, -0.92, Math.sin(be) * 0.52], 0xffffff, 1);
  lb.ico(0.1, 0, mat(0, -0.8, 0, 0, 0, 0, 1, 1.6, 1), 0xffffff, 1);
  const lights = lightInst(lb.build(), nl, fx, 0.9);
  const tint = new THREE.Color(mixHex(A, 0xffffff, 0.3));
  for (let i = 0; i < nl; i++) lights.setColorAt(i, tint);
  group.add(husk, glass, lights);
  // the one that has opened: its two halves hanging from the thread, nothing in them
  const og = new THREE.Group();
  og.position.copy(empty.p);
  const ob = new Builder(), ol = new Builder(), sc = new THREE.Matrix4().makeScale(empty.r, empty.L, empty.r);
  ob.box(0.1, 0.38, 0.1, mul(sc, mat(0, -0.18, 0)), MARK);
  ob.cyl(0.1, 0.3, 0.12, 6, mul(sc, mat(0, -0.4, 0)), MARK);
  for (const q of [-1, 1]) {
    const hinge = mul(mul(mat(0, -0.35 * empty.L, 0, 0, 0, q * (0.5 + R() * 0.25)), mat(0, 0.35 * empty.L, 0)), sc);
    ol.add(pupaGlass(), hinge, (x, y) => mixHex(AMBER[0], AMBER[1], clamp(-(y + 0.35), 0, 1)), 1, { keep: (x) => q * x > 0 });
  }
  og.add(new THREE.Mesh(ob.build(), mats.glow), lightMesh(ol.build(), fx, 0.26, { fresnel: 0.7 }));
  group.add(og);
  const place = (t, c) => {
    for (let i = 0; i < nl; i++) {
      const h = live[i], g = h.g;
      // it sways on its thread; woken, it shivers
      _e.set(0.07 * wind(t, h.ph) + g * 0.035 * Math.sin(t * 6.1 + h.ph), 0, 0.07 * wind(t * 0.9, h.ph + 2) + g * 0.035 * Math.cos(t * 5.3 + h.ph));
      _q.setFromEuler(_e);
      _m.compose(_p.copy(h.p), _q, _s.set(h.r, h.L, h.r));
      husk.setMatrixAt(i, _m);
      glass.setMatrixAt(i, _m);
      // the light in it stirs, and opens a little
      const open = 0.5 + 0.5 * g + 0.06 * Math.sin(t * 0.6 + h.ph);
      _q2.setFromAxisAngle(Yax, 0.4 * Math.sin(t * 0.4 + h.ph) + g * 0.9 * Math.sin(t * 2.3 + h.ph * 2));
      _m.compose(_p, _q.multiply(_q2), _s.set(h.r * open, h.L, h.r * open));
      lights.setMatrixAt(i, _m);
      lights.setColorAt(i, _c.copy(tint).multiplyScalar(0.2 + 0.08 * Math.sin(t * 0.5 + h.ph) + 1.15 * g * (0.75 + 0.25 * Math.sin(t * 3.1 + h.ph))));
    }
    husk.instanceMatrix.needsUpdate = true;
    glass.instanceMatrix.needsUpdate = true;
    lights.instanceMatrix.needsUpdate = true;
    lights.instanceColor.needsUpdate = true;
    og.rotation.set(0.06 * wind(t, empty.ph), 0, 0.06 * wind(t * 0.9, empty.ph + 2));
  };
  place(0);
  const reach = Math.max(...segs.map((s) => Math.hypot(s.to.x, s.to.z))), mid = hung.reduce((v, h) => v.add(h.p), V(0, 0, 0)).multiplyScalar(1 / n);
  let last = null;
  const out = { group, fx, own, light: V(mid.x, mid.y - 3 * S, mid.z), focus: V(0, H * 0.55, 0), span: reach + 1 * S, clear: Math.min(95, reach + 7 * S), height: H + 0.5 * S, solid: { r: reach * 0.85, top: H + 0.5 * S, low: 0 } };
  return finish(out, (t, beat, c) => {
    const dt = last === null ? 0 : clamp(t - last, 0, 0.1);
    last = t;
    // they wake one after another as the ship comes nearer, each at its own distance
    for (const h of live) h.g += (sstep(h.th, h.th + 0.22, c.near || 0) - h.g) * (1 - Math.exp(-dt * h.rate));
    place(t);
  });
}

// ================================================================== the set
const bearing = (R) => R.range(0, TAU);

export const SET = {
  prayerwheels: {
    code: 'PWH', cls: 'Wheel wall', nouns: ['Wheels', 'Drums', 'Wall', 'Turning', 'Murmur', 'Spindles'], place: 'mountain', kin: ['turning', 'choir', 'loom'], voice: ['grains', 'glass'],
    params(R, size) {
      const P = {};
      P.n = R.pick([8, 10, 12, 14, 16, 18, 20]);
      P.greatR = R.range(2.0, 2.8) * size;
      P.greatH = P.greatR * R.range(2.1, 2.7);
      const gate = P.greatR * 2 + 3.4 * size;
      P.pitch = Math.min(R.range(2.9, 4.2) * size, (34 * size - gate / 2) / (P.n / 2));
      P.drumR = P.pitch * 0.31;
      P.drumH = P.drumR * R.range(2.0, 2.8);
      P.bands = R.int(2, 4);
      P.counts = R.pick([[5, 8, 13], [5, 7, 11], [6, 9, 12], [8, 8, 8], [7, 7, 7]]);
      P.greatBands = R.int(3, 5);
      P.curve = R.pick(['straight', 'bowed', 'winding']);
      P.bow = R.range(0.08, 0.2) * (R.chance(0.5) ? 1 : -1);
      P.tiers = R.int(2, 3);
      P.dir = R.chance(0.5) ? 1 : -1;
      const used = [...new Set(Array.from({ length: P.bands }, (_, k) => P.counts[k % 3]))];
      const marks = used.length === 1 ? `${used[0]}` : `${used.slice(0, -1).join(', ')} and ${used[used.length - 1]}`;
      P.text = `${Cap(num(P.n + 1))} drums on spindles in a wall of stone ${Math.round(gate + P.n * P.pitch)} meters long, the greatest at its middle; each is scored with ${num(P.bands)} bands of lit marks, ${marks} to a band, and the wind turns them, each at its own speed. They spin up when something passes, and slowly settle.`;
      return P;
    },
    build: prayerwheels,
  },
  bivouac: {
    code: 'BIV', cls: 'Summit shelter', nouns: ['Bivouac', 'Shelter', 'Refuge', 'Lantern', 'Waypoint', 'Vigil'], place: 'mountain', kin: ['watcher', 'nest', 'halo'], voice: ['breath', 'glass'],
    params(R, size) {
      const P = {};
      P.form = R.pick(['gable', 'vault', 'aframe']);
      P.length = R.range(6.5, 8.5) * size;
      P.width = R.range(4.4, 5.6) * size;
      P.wall = R.range(2.3, 3.0) * size;
      P.rise = R.range(1.5, 2.2) * size;
      P.deck = R.range(1.0, 1.6) * size;
      P.ribs = R.int(2, 4);
      P.legs = R.pick([4, 6]);
      P.reach = R.range(5, 8) * size;
      P.pole = R.range(11, 16) * size;
      P.poleSide = R.chance(0.5) ? 1 : -1;
      P.pipe = R.chance(0.6);
      P.wands = R.int(7, 13);
      P.gap = R.range(4.2, 6.2) * size;
      P.wander = R.range(0.5, 2.5) * size;
      P.drift = R.range(-0.22, 0.22);
      P.rate = R.pick([0.5, 1]);
      P.bearing = bearing(R);
      const what = { gable: 'A hut', vault: 'A vaulted box', aframe: 'A tent' }[P.form];
      P.text = `${what} of dark panels on a platform of beams wedged in the rock, lashed to the summit by ${num(P.ribs * 2 + 2)} lines, its one window lit. A lantern swings on a pole ${Math.round(P.pole)} meters tall, and ${num(P.wands)} wands with lit tips lead down the ridge to it.`;
      return P;
    },
    build: bivouac,
  },
  horn: {
    code: 'HRN', cls: 'Long horn', nouns: ['Horn', 'Call', 'Bell', 'Summons', 'Drone', 'Echo'], place: 'mountain', kin: ['helicon', 'whale', 'halo'], voice: ['whale', 'breath'],
    params(R, size) {
      const P = {};
      P.length = R.range(30, 45) * size;
      P.tilt = R.range(0.06, 0.17);
      P.curl = R.chance(0.4) ? 0 : R.range(0.25, 0.6);
      P.bendLen = R.range(0.14, 0.2);
      P.bell = R.range(3.2, 4.8) * size;
      P.bore = R.range(1.0, 1.4) * size;
      P.saddle = R.range(3.6, 5.4) * size;
      P.bands = R.int(3, 6);
      P.trestles = R.pick([2, 3, 3]);
      P.every = R.pick([1, 2, 2, 4]);
      P.rings = R.int(5, 8);
      P.reach = R.range(26, 40) * size;
      P.spread = R.range(1.0, 1.8);
      P.bearing = bearing(R);
      const when = { 1: 'On every beat', 2: 'On every second beat', 4: 'On every fourth beat' }[P.every];
      P.text = `A horn ${Math.round(P.length)} meters long, of dark wood bound with ${num(P.bands)} bands of stone at a half, a third, a quarter… of its length, resting on ${num(P.trestles)} trestles and pointing out over the valley${P.curl ? ', its bell turned up' : ''}. ${when} a ring of light leaves the bell, ${Math.round(P.bell * 2)} meters across, and widens as it goes.`;
      return P;
    },
    build: horn,
  },
  eyrie: {
    code: 'EYR', cls: 'Eyrie', nouns: ['Eyrie', 'Nest', 'Clutch', 'Brood', 'Roost', 'Pinnacle'], place: 'mountain', kin: ['nest', 'seedpod', 'spire'], voice: ['breath', 'chirp'],
    params(R, size) {
      const P = {};
      P.height = R.range(17, 28) * size;
      P.radius = R.range(7, 10) * size;
      P.girth = R.range(2.5, 4.5) * size;
      P.lean = R.range(0, 0.1);
      P.leanDir = bearing(R);
      P.eggs = R.int(2, 5);
      P.eggR = Array.from({ length: 5 }, () => R.range(1.3, 1.9) * size);
      P.eggTurn = bearing(R);
      P.courses = R.int(5, 7);
      P.braces = R.int(5, 8);
      P.splinters = R.int(2, 4);
      P.feathers = R.pick([21, 26, 34]);
      P.rise = R.range(26, 36) * size;
      P.wind = bearing(R);
      P.text = `A nest of dark timbers ${Math.round(P.radius * 2)} meters across, woven in ${num(P.courses)} courses on a pinnacle of rock ${Math.round(P.height)} meters tall. ${Cap(num(P.eggs))} eggs of pale light lie in it, pulsing out of step, and loose feathers of light drift up from it. There is no bird.`;
      return P;
    },
    build: eyrie,
  },
  cablecar: {
    code: 'CBL', cls: 'Cableway', nouns: ['Gondola', 'Cable', 'Crossing', 'Span', 'Carriage', 'Line'], place: 'mountain', kin: ['loom', 'chandelier', 'watcher'], voice: ['glitch', 'fm'],
    params(R, size) {
      const P = {};
      P.span = R.range(42, 56) * size;
      P.tall = R.range(17, 24) * size;
      P.drop = P.span * R.range(0.12, 0.28);
      P.sag = P.span * R.range(0.06, 0.1);
      const where = R.pick([[0.5, 'halfway along it'], [0.6, 'three fifths of the way along it'], [2 / 3, 'two thirds of the way along it'], [0.55, 'a little past its middle']]);
      P.at = where[0];
      P.cabL = R.range(4.2, 5.2) * size;
      P.cabH = R.range(3.2, 3.8) * size;
      P.cabW = R.range(2.8, 3.3) * size;
      P.bays = R.int(2, 4);
      P.dark = R.int(0, P.bays - 1);
      P.darkSide = R.chance(0.5) ? 1 : -1;
      P.rope = R.range(2.5, 4.5) * size;
      P.list = R.range(0.03, 0.09) * (R.chance(0.5) ? 1 : -1);
      P.swing = R.range(0.1, 0.17);
      const pool = [11, 13, 17, 19, 23, 29];
      P.beads = Array.from({ length: R.int(2, 3) }, () => pool.splice(Math.floor(R() * pool.length), 1)[0]).sort((a, b) => a - b);
      P.flick = R.pick([9, 12, 15]);
      P.bearing = bearing(R);
      P.text = `Two pylons on the rock and a cable ${Math.round(P.span)} meters long slung between them out over the drop, sagging ${Math.round(P.sag)}. One gondola still hangs on it, ${where[1]}, swinging in the wind, a light on inside. Every ${P.beads.slice(0, -1).join(', ')} and ${P.beads[P.beads.length - 1]} seconds a small light runs down the cable.`;
      return P;
    },
    build: cablecar,
  },
  sheaves: {
    code: 'SHV', cls: 'Harvest stooks', nouns: ['Sheaves', 'Stooks', 'Harvest', 'Gleaning', 'Threshing', 'Field'], place: 'autumn', kin: ['murmuration', 'corolla', 'pyre'], voice: ['grains', 'chirp'],
    params(R, size) {
      const P = {};
      P.n = R.int(5, 13);
      P.layout = R.pick(['ring', 'rows', 'spiral']);
      P.per = R.int(4, 7);
      P.height = R.range(12, 17) * size;
      P.radius = Math.max(R.range(13, 18) * size, (P.n * 0.7 * P.height) / TAU);
      P.waist = R.range(0.55, 0.68);
      P.flies = R.pick([55, 89, 144]);
      P.turn = bearing(R);
      const how = { ring: `in a ring ${Math.round(P.radius * 2)} meters across`, rows: `in ${P.n > 9 ? 'three' : 'two'} rows`, spiral: 'each at the golden angle from the last' }[P.layout];
      P.text = `${Cap(num(P.n))} stooks of tall dry stalks, ${Math.round(P.height)} meters, ${num(P.per)} sheaves bound and stood together in each, ${how}; their heads are faintly lit. ${P.flies} fireflies drift between them, and gather toward whatever passes.`;
      return P;
    },
    build: sheaves,
  },
  swing: {
    code: 'SWG', cls: 'Swing tree', nouns: ['Swing', 'Bough', 'Pendulum', 'Birch', 'Lull', 'Return'], place: 'autumn', kin: ['tree', 'turning', 'leaffall'], voice: ['breath', 'glass'],
    params(R, size) {
      const P = {};
      P.height = R.range(34, 48) * size;
      P.bough = R.range(0.4, 0.5);
      P.boughLen = R.range(0.36, 0.48) * P.height;
      P.boughDir = bearing(R);
      P.seat = R.range(3, 4.4) * size;
      P.rope = P.bough * P.height + 0.14 * P.boughLen - R.range(3.4, 5) * size;
      P.amp = R.range(0.28, 0.42);
      P.limbs = R.int(3, 4);
      P.lean = R.range(0, 0.05);
      P.leanDir = bearing(R);
      P.leaves = R.pick([55, 70, 89]);
      P.lantern = R.pick(['peaked', 'flat']);
      P.text = `A single bare birch ${Math.round(P.height)} meters tall, and from one long bough a swing on two ropes of ${Math.round(P.rope)} meters. It swings by itself, once every ${(TAU * Math.sqrt(P.rope / 9.81)).toFixed(1)} seconds, and does not stop; ${P.leaves} leaves fall round it. A lantern is lit at the foot of the tree.`;
      return P;
    },
    build: swing,
  },
  fairyring: {
    code: 'FAE', cls: 'Fairy ring', nouns: ['Ring', 'Circle', 'Caps', 'Round', 'Spores', 'Threshold'], place: 'autumn', kin: ['halo', 'corolla', 'bloom'], voice: ['glass', 'grains'],
    params(R, size) {
      const P = {};
      P.n = R.pick([13, 17, 21, 26, 34]);
      P.radius = clamp(Math.max(R.range(9, 15), P.n * 0.42), 9, 15) * size;
      P.seq = R.pick(['ruler', 'Fibonacci word', 'primes', 'harmonic series']);
      P.tall = R.range(11, 16) * size;
      P.cap = R.pick(['dome', 'bell', 'plate']);
      P.lean = R.range(0.03, 0.12);
      P.stride = R.pick([1, 3, 5]);
      P.rate = R.pick([0.5, 1]);
      P.life = 8;
      P.leaves = R.pick([40, 55, 70]);
      P.turn = bearing(R);
      const law = { ruler: 'the marks of a ruler', 'Fibonacci word': 'the Fibonacci word', primes: 'the primes', 'harmonic series': 'the harmonic series' }[P.seq];
      P.text = `${Cap(num(P.n))} mushrooms with caps of amber in a ring ${Math.round(P.radius * 2)} meters across, the tallest ${Math.round(P.tall)}, their heights following ${law}; their gills are lit from beneath. Inside the ring the ground is dusted with a faint light and nothing falls there. Spores rise from the caps on the rhythm.`;
      return P;
    },
    build: fairyring,
  },
  chrysalis: {
    code: 'CHR', cls: 'Chrysalis tree', nouns: ['Chrysalides', 'Cocoons', 'Sleepers', 'Husks', 'Waiting', 'Wings'], place: 'autumn', kin: ['seedpod', 'chandelier', 'tree'], voice: ['glass', 'whale'],
    params(R, size) {
      const P = {};
      P.n = R.int(7, 21);
      P.height = R.range(30, 42) * size;
      P.long = R.range(5, 6.5) * size;
      P.sizes = Array.from({ length: P.n }, (_, i) => P.long * (i === 0 ? 1 : 0.45 + 0.5 * Math.pow(R(), 1.4)));
      P.open = R.int(1, P.n - 1);
      P.boughs = R.int(4, 6);
      P.spread = R.range(0.8, 1.2);
      P.twist = bearing(R);
      P.text = `A bare tree ${Math.round(P.height)} meters tall hung with ${num(P.n)} chrysalides of amber glass, the longest ${P.long.toFixed(1)} meters; in each a folded light, that stirs and brightens when something comes near. The ${ORD[P.open]} has opened and is empty, its halves hanging.`;
      return P;
    },
    build: chrysalis,
  },
};
