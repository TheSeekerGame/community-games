import * as THREE from 'three';
import { Builder, mat, mul } from '../../render/build.js';
import { glowMaterial, pointsMaterial, worldMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp, smoothstep, formatInt } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, Y, beam } from '../parts.js';

// Instruments of signal and measure, left running where nobody watches: wild artifacts of
// the forest at large.
//   sundial      a gnomon on a dial of dark stone; no shadow, but a blade of light that goes
//                round the dial and wakes each hour mark it crosses
//   forks        tuning forks of stone in a row, an arc or a ring, cut to sound a series;
//                struck in turn, their tines blur and rings of light leave their tips
//   heliostat    mirrors on stalks at the golden angle, all throwing their light on the tip
//                of one slender tower, which burns; they turn as one, and glint in a wave
//   antennae     a grove of thin masts with aerials of shortening crossbars, all turned the
//                same way; wires between them, and lights running the wires like messages
//   seismograph  a drum of dark stone turning on a frame, an arm writing a helix of light
//                round it; every beat of its rhythm jolts the line
//   vanes        a field of weathervanes on poles, veering together with a wind nothing
//                else feels, and swinging round to point at whoever comes near
//   carillon     an open tower hung with bells in tiers, one, two, three…; they swing out
//                of step and each flashes at the top of its swing
//   abacus       a frame of stone, rods across it, beads of light on the rods: it counts,
//                one bead at a time, and does not stop

const GA = Math.PI * (3 - Math.sqrt(5));
const NUMW = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-one'];
const numw = (n) => NUMW[n] ?? String(n);
const lower = (s) => s.toLowerCase();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3();

// a matrix in place: translation, rotation (YXZ), scale
const trs = (m, x, y, z, rx, ry, rz, sx, sy, sz) => m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));

// a mesh of pure light; fx collects [material, its opacity] for finish
function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}
// points of light, to be moved: n of them
function lightPoints(n, fx, color, size, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  fx.push([m, opacity]);
  const pts = new THREE.Points(g, m);
  pts.layers.set(LAYER_FX);
  pts.frustumCulled = false;
  return { pts, pos, sz, al, g };
}
// many copies of one part, each moved (and lit) on its own: one draw call
function instanced(geo, material, n, light = false) {
  const im = new THREE.InstancedMesh(geo, material, n);
  im.frustumCulled = false;
  if (light) im.layers.set(LAYER_FX);
  for (let i = 0; i < n; i++) { im.setMatrixAt(i, _m.identity()); im.setColorAt(i, _c.setRGB(1, 1, 1)); }
  return im;
}
function lightInstanced(geo, fx, n, opacity = 1) {
  const m = glowMaterial({ opacity, fog: 0.6, side: THREE.DoubleSide });
  fx.push([m, opacity]);
  return instanced(geo, m, n, true);
}
// quads of light to be rewritten: n of them (white; tint the material)
function quads(n) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 18), col = new Float32Array(n * 18).fill(1), em = new Float32Array(n * 6).fill(1e-4);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return { g, pos, em };
}
// a plate, len long, h0 tall at its back (-x) and h1 at its front (+x)
function wedge(len, h0, h1, th) {
  const g = new THREE.BoxGeometry(len, 1, th), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (p.getX(i) < 0 ? h0 : h1));
  return g;
}
// the artifact's rhythm: true on the update where a beat of its song falls
function rhythm() {
  let prev = 1e9, lastBeat = null;
  return (beat, c) => {
    if (typeof c.pulse === 'number') { const hit = c.pulse > prev + 0.2; prev = c.pulse; return hit; }
    const k = Math.floor(beat), hit = lastBeat !== null && k !== lastBeat;
    lastBeat = k;
    return hit;
  };
}
// seconds since the last update (0 on the first, never a jump)
function ticker() {
  let last = null;
  return (t) => { const dt = last === null ? 0 : clamp(t - last, 0, 0.25); last = t; return dt; };
}
function finish(out, fx, extra, update) {
  return {
    ...out,
    clear: Math.min(95, out.span + 6),
    mats: [...fx.map(([m]) => m), ...extra],
    update(t, beat, c) {
      c = c || {};
      const k = (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      for (const f of fx) f[0].uniforms.uOpacity.value = f[1] * k;
      update(t, beat, c);
    },
  };
}

// ------------------------------------------------------------------ sundial
function sundial(d, A, mats, ctx) {
  const P = d.params, S = d.size, Rd = P.radius, H = P.height, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), pale = mixHex(A, 0xffffff, 0.6);
  let hi = ctx.ground(0, 0), lo = hi;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, g = ctx.ground(Math.cos(a) * (Rd + 2 * S), Math.sin(a) * (Rd + 2 * S)); hi = Math.max(hi, g); lo = Math.min(lo, g); }
  // the dial: a step, a drum on it, and its face in rings of darker and paler stone
  const top = hi + 0.9 * S, stepTop = top - 0.7 * S, stepBot = lo - 1.5;
  const b = new Builder();
  b.cyl(Rd + 1.5 * S, Rd + 2.1 * S, stepTop - stepBot, 48, mat(0, (stepTop + stepBot) / 2, 0), STONE[1]);
  b.cyl(Rd, Rd, 0.8 * S, 48, mat(0, top - 0.4 * S, 0), STONE[0], 0, true);
  const edges = [0];
  for (let i = 1; i <= P.bands; i++) edges.push(Rd * (0.26 + (0.52 * i) / P.bands));
  edges.push(Rd * 0.8, Rd);
  for (let k = 0; k + 1 < edges.length; k++) {
    const last = k === edges.length - 2, line = k === edges.length - 3;
    const g = k === 0 ? new THREE.CircleGeometry(edges[1], 48) : new THREE.RingGeometry(edges[k], edges[k + 1], 48, 1);
    b.add(g, mat(0, top, 0, -Math.PI / 2, 0, 0), line ? mixHex(STONE[3], RIM, 0.55) : last ? STONE[1] : k % 2 ? STONE[2] : STONE[0]);
  }
  // the gnomon: a fin of stone, its foot at the middle of the dial, its style rising to a lamp
  const stair = P.kind === 'stair', gx = Rd * (stair ? Math.min(P.reach, 0.48) : P.reach), th = P.thick, hyp = Math.hypot(gx, H);
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  if (stair) {
    const back = Rd * 0.26, ns = P.steps;
    sh.lineTo(gx + back, 0);
    for (let j = 1; j <= ns; j++) { sh.lineTo(gx + back - ((j - 1) * back) / ns, (j * H) / ns); sh.lineTo(gx + back - (j * back) / ns, (j * H) / ns); }
  } else { sh.lineTo(gx, 0); sh.lineTo(gx, H); }
  if (P.kind === 'window') {
    const fw = 1.4 * S, yb = 2.2 * S;
    const v2y = (H * (gx - fw) - fw * hyp) / gx, v3x = (fw * hyp + gx * yb) / H;
    if (v2y > yb + 2 * S && v3x < gx - fw - 0.8 * S) { const hole = new THREE.Path(); hole.moveTo(v3x, yb); hole.lineTo(gx - fw, yb); hole.lineTo(gx - fw, v2y); sh.holes.push(hole); }
  }
  const fin = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, steps: 1, curveSegments: 1 });
  fin.translate(0, 0, -th / 2);
  b.add(fin, mat(0, top - 0.3, 0), STONE[2]);
  b.box(0.6 * S, hyp, th + 0.4 * S, mat(gx / 2, top - 0.3 + H / 2, 0, 0, 0, -Math.atan2(gx, H)), mixHex(STONE[3], RIM, 0.7));
  const lampY = top + H + 0.3 * S;
  b.ico(0.75 * S, 1, mat(gx, lampY, 0), lit, PULSE);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the hour marks: bars of light on the rim, every few of them longer
  const mb = new Builder(), r1 = Rd * 0.985;
  for (let i = 0; i < P.hours; i++) {
    const a = (i / P.hours) * TAU, major = i % P.major === 0;
    mb.box((major ? 2.6 : 1.5) * S, 0.3, (major ? 0.7 : 0.45) * S, mat(Math.cos(a) * Rd * 0.9, top + 0.2, Math.sin(a) * Rd * 0.9, 0, -a, 0), lit, 1);
  }
  const markGeo = mb.build(), markEm = markGeo.attributes.emissive;
  group.add(lightMesh(markGeo, fx, 0.9));
  // the blade of light that lies where a shadow would: thin at the foot, wide at the rim
  const bl = new Builder(), r0 = 0.8 * S;
  for (let i = 0; i < 6; i++) {
    const ua = i / 6, ub = (i + 1) / 6, ra = r0 + (r1 - r0) * ua, rb = r0 + (r1 - r0) * ub, wa = (0.14 + 0.75 * ua) * S, wb = (0.14 + 0.75 * ub) * S;
    bl.quad([ra, 0.3, -wa], [ra, 0.3, wa], [rb, 0.3, wb], [rb, 0.3, -wb], pale, 0.4 + 0.6 * ub);
    bl.quad([ra, 0.22, -wa * 3.2], [ra, 0.22, wa * 3.2], [rb, 0.22, wb * 3.2], [rb, 0.22, -wb * 3.2], lit, 0.13);
  }
  const blade = lightMesh(bl.build(), fx, 0.95);
  blade.position.y = top;
  group.add(blade);
  // and the sheet of light between the style and the blade, faint: the shadow's plane, lit
  const sg = new THREE.BufferGeometry(), sp = new Float32Array([0, top + 0.3, 0, gx, top + H - 0.3, 0, r1, top + 0.3, 0]);
  _c.setHex(lit);
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array([_c.r, _c.g, _c.b, _c.r, _c.g, _c.b, _c.r, _c.g, _c.b]), 3));
  sg.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array([0.5, 0.03, 0.6]), 1));
  group.add(lightMesh(sg, fx, 0.2));
  const w = (P.dir * TAU) / P.period;
  return finish({ group, light: V3(gx, lampY, 0), focus: V3(gx * 0.3, top + H * 0.42, 0), span: Rd + 2.1 * S, height: lampY + 1.2 * S, solid: { r: Rd * 0.75, top: lampY + 1.2 * S, low: 0 } }, fx, [], (t) => {
    const th = P.phase + t * w;
    blade.rotation.y = -th;
    sp[6] = Math.cos(th) * r1; sp[8] = Math.sin(th) * r1;
    sg.attributes.position.needsUpdate = true;
    // each mark wakes as the blade crosses it, and dims behind it
    for (let i = 0; i < P.hours; i++) {
      let dl = (((th - (i / P.hours) * TAU) * P.dir) % TAU + TAU) % TAU;
      const e = 0.26 + 1.5 * Math.exp(-dl / 0.55) + 1.5 * Math.exp(-(TAU - dl) / 0.035);
      markEm.array.fill(e, i * 36, i * 36 + 36);
    }
    markEm.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ forks
function forks(d, A, mats, ctx) {
  const P = d.params, S = d.size, n = P.n, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3);
  // each fork: its tines as long as its note asks, the rest of it in keeping
  const F = P.lengths.map((s) => { const k = 0.55 + 0.45 * s, w = P.thick * k, ry = (P.gap * k + w) / 2; return { s, k, w, ry, stem: P.stem * (0.7 + 0.3 * s) }; });
  const unit = P.tall - F[0].stem - F[0].w / 2 - F[0].ry;
  for (const f of F) { f.L = unit * f.s; f.yc = f.stem + f.w / 2 + f.ry; }
  // where they stand: in a row, an arc or a ring, closer as they shorten
  let slots = F.map((_, i) => i);
  if (P.arrange === 'centered') { slots = [0]; for (let i = 1; i < n; i++) (i % 2 ? slots.push(i) : slots.unshift(i)); }
  const u = [0];
  for (let j = 1; j < n; j++) u.push(u[j - 1] + (P.spacing * (F[slots[j - 1]].k + F[slots[j]].k)) / 2);
  const U = u[n - 1], ring = P.layout === 'ring', Ra = ring ? (U + (P.spacing * (F[slots[0]].k + F[slots[n - 1]].k)) / 2) / TAU : U / P.arc;
  slots.forEach((i, j) => {
    const f = F[i];
    if (P.layout === 'row') { f.x = u[j] - U / 2; f.z = 0; f.psi = 0; }
    else { const ph = ring ? u[j] / Ra : (u[j] - U / 2) / Ra; f.x = Ra * Math.sin(ph); f.z = -Ra * Math.cos(ph); f.psi = -ph; }
  });
  const cx = (Math.min(...F.map((f) => f.x)) + Math.max(...F.map((f) => f.x))) / 2, cz = (Math.min(...F.map((f) => f.z)) + Math.max(...F.map((f) => f.z))) / 2;
  const b = new Builder();
  let span = 0, height = 0;
  F.forEach((f, i) => {
    f.x -= cx; f.z -= cz;
    f.gy = ctx.ground(f.x, f.z);
    f.base = mat(f.x, f.gy, f.z, 0, f.psi, 0);
    f.top = f.gy + f.yc + f.L;
    span = Math.max(span, Math.hypot(f.x, f.z) + f.ry + f.w);
    height = Math.max(height, f.top);
    const col = STONE[1 + (i % 2)];
    b.box(f.w * 2.4, 1.2 * S, f.w * 2.4, mul(f.base, mat(0, 0.2 * S, 0)), STONE[0]);
    b.box(f.w * 0.85, f.stem + 1.5, f.w * 0.85, mul(f.base, mat(0, (f.stem - 1.5) / 2, 0)), col);
    b.box(f.w * 1.25, 0.5 * S, f.w * 1.25, mul(f.base, mat(0, f.stem - 0.5 * S, 0)), RIM);
    b.add(new THREE.TorusGeometry(f.ry, f.w * 0.56, 5, 8, Math.PI), mul(f.base, mat(0, f.yc, 0, 0, 0, Math.PI)), col);
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the tines, each free to shake: stone, with a band of light at the tip
  const tb = new Builder();
  tb.box(1, 0.95, 1, mat(0, 0.475, 0), STONE[2]);
  tb.box(1.14, 0.05, 1.14, mat(0, 0.975, 0), lit, PULSE);
  const tineMat = worldMaterial({ unique: true });
  const tines = instanced(tb.build(), tineMat, n * 2);
  group.add(tines);
  // their blur, in light; and the rings that leave their tips
  const gb = new Builder();
  gb.box(1, 1, 1, mat(0, 0.5, 0), lit, 1);
  const ghosts = lightInstanced(gb.build(), fx, n * 2, 0.45);
  group.add(ghosts);
  const rb = new Builder();
  rb.add(new THREE.TorusGeometry(1, 0.06, 4, 20), mat(0, 0, 0, Math.PI / 2, 0, 0), lit, 1);
  const NR = 18, LIFE = 4.6;
  const rings = lightInstanced(rb.build(), fx, NR, 0.9);
  group.add(rings);
  const ringOf = Array.from({ length: NR }, () => ({ f: null, t0: 0 }));
  const struck = new Float64Array(n).fill(-1e9);
  const hit = rhythm();
  let turn = 0, slot = 0;
  const tall = F[0];
  return finish({ group, light: V3(tall.x, tall.top, tall.z), focus: V3(0, P.tall * 0.5, 0), span: span + 1.5 * S, height: height + 1, solid: { r: span, top: height + 1, low: 0 } }, fx, [tineMat], (t, beat, c) => {
    // one fork struck on each beat of its rhythm, in their order
    if (hit(beat, c)) {
      const i = P.order[turn++ % n];
      struck[i] = t;
      for (let j = 0; j < 2; j++) { ringOf[slot].f = F[i]; ringOf[slot].t0 = t + j * 0.5; slot = (slot + 1) % NR; }
    }
    F.forEach((f, i) => {
      const age = t - struck[i], env = age >= 0 ? Math.exp(-age * 1.1) : 0;
      const ph = env * 0.014 * Math.sin(t * 43 + i * 2.1);
      for (let q = 0; q < 2; q++) {
        const sx = q ? 1 : -1;
        tines.setMatrixAt(i * 2 + q, _m.multiplyMatrices(f.base, trs(_m2, sx * f.ry, f.yc, 0, 0, 0, -sx * ph, f.w, f.L, f.w)));
        tines.setColorAt(i * 2 + q, _c.setScalar(1 + 1.6 * env));
        ghosts.setMatrixAt(i * 2 + q, _m.multiplyMatrices(f.base, trs(_m2, sx * f.ry, f.yc, 0, 0, 0, 0, f.w * (1.05 + 2.2 * env), f.L, f.w * 1.05)));
        ghosts.setColorAt(i * 2 + q, _c.setScalar(env * 0.7));
      }
    });
    ringOf.forEach((r, i) => {
      const age = t - r.t0, k = age / LIFE;
      if (!r.f || age < 0 || k >= 1) { rings.setMatrixAt(i, _m.makeScale(0, 0, 0)); rings.setColorAt(i, _c.setScalar(0)); return; }
      const rad = r.f.ry + r.f.w + age * 1.1 * S;
      rings.setMatrixAt(i, trs(_m, r.f.x, r.f.top + 0.4 + age * 2.4 * S * (1 - 0.3 * k), r.f.z, 0, 0, 0, rad, rad, rad));
      rings.setColorAt(i, _c.setScalar(1.2 * Math.pow(Math.max(0, 1 - k), 1.5)));
    });
    for (const im of [tines, ghosts, rings]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  });
}

// ------------------------------------------------------------------ heliostat
function heliostat(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), n = P.n, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), pale = mixHex(A, 0xffffff, 0.55);
  const base = ctx.ground(0, 0), Ht = P.tower, c0 = P.pitch;
  const tip = V3(0, base + Ht + 1.3 * S, 0);
  const b = new Builder();
  // the tower: slender, collared, a cup at its top and the light in the cup
  b.cyl(3 * S, 3.6 * S, 1.6 * S + 2, 8, mat(0, base + 0.3 * S - 1, 0), STONE[1]);
  b.cyl(0.5 * S, 1.45 * S, Ht, 6, mat(0, base + Ht / 2, 0), STONE[2]);
  for (let i = 0; i < P.collars; i++) { const k = (i + 1) / (P.collars + 1), r = (1.45 - 0.95 * k + 0.3) * S; b.cyl(r, r, 0.5 * S, 6, mat(0, base + Ht * k, 0), i % 2 ? RIM : STONE[3]); }
  b.cyl(1.3 * S, 0.5 * S, 0.9 * S, 6, mat(0, base + Ht + 0.2 * S, 0), STONE[3]);
  b.ico(1.15 * S, 1, mat(0, tip.y, 0), pale, PULSE);
  // the mirrors: a sunflower of them, each on its stalk
  const i0 = Math.pow((4.4 * S) / c0, 2), Rf = c0 * Math.sqrt(n - 1 + i0), rm = c0 * 0.52, M = [];
  for (let i = 0; i < n; i++) {
    const r = c0 * Math.sqrt(i + i0), a = i * GA + P.turn, x = Math.cos(a) * r, z = Math.sin(a) * r, gy = ctx.ground(x, z), k = r / Rf;
    const hs = (P.profile === 'bowl' ? 2.2 + 4.5 * k * k : P.profile === 'terraces' ? 2.2 + Math.floor(k * 3.999) * 1.5 : 3) * S + R() * 0.3 * S;
    b.box(0.32 * S, hs + 1.5, 0.32 * S, mat(x, gy + (hs - 1.5) / 2, z), i % 3 ? STONE[1] : STONE[3]);
    const p = V3(x, gy + hs + 0.12 * S, z);
    M.push({ p, to: tip.clone().sub(p).normalize(), k, a: (a % TAU) / TAU, arm: (((i % P.arms) * GA) / TAU) % 1 });
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const mt = 0.16 * S, mg = new Builder();
  const face = (x, y) => (y > mt * 0.4 ? pale : STONE[3]), shine = (x, y) => (y > mt * 0.4 ? 0.5 : 0);
  mg.add(P.shape === 'square' ? new THREE.BoxGeometry(rm * 1.8, mt, rm * 1.8) : new THREE.CylinderGeometry(rm, rm, mt, P.shape === 'hex' ? 6 : 10), null, face, shine, { flat: true });
  const mirrorMat = worldMaterial({ unique: true });
  const mirrors = instanced(mg.build(), mirrorMat, n);
  group.add(mirrors);
  // the light each throws: a thread from the mirror to the tip, seen when the mirror glints
  const tg = new Builder();
  tg.box(1, 1, 1, null, pale, 1);
  const threads = lightInstanced(tg.build(), fx, n, 0.5);
  M.forEach((m, i) => {
    const len = m.p.distanceTo(tip);
    threads.setMatrixAt(i, _m.compose(_p.copy(m.p).lerp(tip, 0.5), _q.setFromUnitVectors(Y, m.to), _s.set(0.24 * S, len, 0.24 * S)));
  });
  group.add(threads);
  // the tip, burning: a shell of light, and sparks going up from it
  const sb = new Builder();
  sb.ico(2.1 * S, 1, null, pale, 1);
  const shell = lightMesh(sb.build(), fx, 0.4);
  shell.position.copy(tip);
  group.add(shell);
  const NS = 30, sparks = lightPoints(NS, fx, pale, 1.1 * S, 1);
  const sk = Array.from({ length: NS }, () => ({ sp: 0.12 + R() * 0.16, ph: R(), a: R() * TAU }));
  group.add(sparks.pts);
  const sun = V3(0, 1, 0), tick = ticker();
  let near = 0;
  return finish({ group, light: tip.clone(), focus: V3(0, base + Ht * 0.5, 0), span: Rf + 2 * S, height: tip.y + 2.4 * S, solid: { r: 4 * S, top: tip.y + 2.4 * S, low: 0 } }, fx, [mirrorMat], (t, beat, c) => {
    const dt = tick(t);
    near += ((c.near ?? 0) - near) * (1 - Math.exp(-dt * 0.8));
    // the sun they keep: going round slowly; or, when the ship is near, the ship
    const az = P.az + (P.dir * t * TAU) / P.period, el = P.el + 0.1 * Math.sin(t * 0.045);
    sun.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    if (c.shipLocal && near > 0.01) {
      _v.copy(c.shipLocal); _v.y = Math.max(_v.y - base, 8 * S);
      sun.lerp(_v.normalize(), near * 0.85).normalize();
    }
    M.forEach((m, i) => {
      // each mirror halves the angle between the sun and the tip
      mirrors.setMatrixAt(i, _m.compose(m.p, _q.setFromUnitVectors(Y, _v.copy(sun).add(m.to).normalize()), _s.set(1, 1, 1)));
      const ph = P.wave === 'ripple' ? m.k * P.rings + t * 0.16 : P.wave === 'sweep' ? m.a - P.dir * t * 0.045 : m.arm - t * 0.05;
      const g = Math.pow(Math.max(0, Math.cos(TAU * ph)), P.wave === 'ripple' ? 6 : 9);
      mirrors.setColorAt(i, _c.setScalar(0.45 + 2.4 * g));
      threads.setColorAt(i, _c.setScalar(g * g));
    });
    mirrors.instanceMatrix.needsUpdate = true;
    mirrors.instanceColor.needsUpdate = true;
    threads.instanceColor.needsUpdate = true;
    shell.scale.setScalar(1 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13) * 0.05);
    sk.forEach((s, i) => {
      const u = (t * s.sp + s.ph) % 1, w = 0.5 * S + u * 1.6 * S;
      sparks.pos[i * 3] = Math.cos(s.a + t * 0.7) * w * u; sparks.pos[i * 3 + 1] = tip.y + 0.8 * S + u * 10 * S; sparks.pos[i * 3 + 2] = Math.sin(s.a + t * 0.7) * w * u;
      sparks.al[i] = (1 - u) * (1 - u);
    });
    sparks.g.attributes.position.needsUpdate = true;
    sparks.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ antennae
function antennae(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), n = P.n, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3);
  const bx = Math.cos(P.bearing), bz = Math.sin(P.bearing);       // where every aerial is turned
  const along = Math.atan2(-bz, bx), across = Math.atan2(-bx, -bz); // yaw of a bar laid along / across it
  // an aerial at the head of a mast: crossbars, each tau times the one before
  const aerial = (mb, top, k) => {
    const K = P.bars, l0 = P.bar * k;
    if (P.style === 'fishbone') {
      // up the mast, shortening and closing up toward the top
      const s0 = Math.min(2.4 * S * k, (0.5 * top * (1 - P.tau)) / (1 - Math.pow(P.tau, K - 1)));
      let y = top - 0.9 * S * k - (s0 * (1 - Math.pow(P.tau, K - 1))) / (1 - P.tau);
      for (let j = 0; j < K; j++) { mb.box(l0 * Math.pow(P.tau, j), 0.26 * S, 0.26 * S, mat(0, y, 0, 0, across, 0), j === K - 1 ? RIM : STONE[3]); y += s0 * Math.pow(P.tau, j); }
    } else {
      // along a boom, the longest at the back
      const s0 = l0 * 0.3, Lb = (s0 * (1 - Math.pow(P.tau, K - 1))) / (1 - P.tau), y = top - 0.5 * S * k, q0 = -Lb * 0.42;
      mb.box(Lb + 1.2 * S * k, 0.3 * S, 0.3 * S, mat(bx * (q0 + Lb / 2), y, bz * (q0 + Lb / 2), 0, along, 0), STONE[3]);
      let q = q0;
      for (let j = 0; j < K; j++) { mb.box(l0 * Math.pow(P.tau, j), 0.24 * S, 0.24 * S, mat(bx * q, y + 0.2 * S, bz * q, 0, across, 0), j === 0 ? RIM : STONE[3]); q += s0 * Math.pow(P.tau, j); }
    }
  };
  const b = new Builder(), ia = [], ka = [], ib = [], kb = [], masts = [];
  for (let i = 0; i < n; i++) {
    const r = P.grove * Math.sqrt((i + 0.25) / n) * 0.96, a = P.turn + i * GA;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, gy = ctx.ground(x, z);
    const H = i === 0 ? P.tall : P.tall * (0.94 - 0.4 * R());
    const mb = new Builder();   // in the mast's own frame, its foot at the origin
    mb.box(1.5 * S, 1.4, 1.5 * S, mat(0, 0.2, 0, 0, a, 0), STONE[0]);
    mb.cyl(0.17 * S, 0.3 * S, H + 1, 5, mat(0, (H - 1) / 2, 0), STONE[2]);
    aerial(mb, H, i === 0 ? 1 : 0.8 + 0.2 * R());
    if (P.tiers === 2 && i % 2 === 0) aerial(mb, H * 0.68, 0.62);
    mb.ico(0.4 * S, 0, mat(0, H + 0.3 * S, 0), lit, 1);
    const v0 = b.pos.length / 3;
    b.merge(mb, mat(x, gy, z));
    for (let v = v0; v < b.pos.length / 3; v++) { ia.push(i); ka.push(Math.max(0, b.pos[v * 3 + 1] - gy)); ib.push(i); kb.push(0); }
    masts.push({ x, z, gy, H, att: H - 0.4 * S, lx: 0, lz: 0, ph: R() * TAU });
  }
  // the wires: every mast joined to its nearest, so that all are joined (and no more)
  const adj = masts.map(() => []), inT = [0], wireCol = mixHex(STONE[3], RIM, 0.45);
  while (inT.length < n) {
    let best = null;
    for (const p of inT) for (let q = 0; q < n; q++) if (!inT.includes(q)) { const l = Math.hypot(masts[p].x - masts[q].x, masts[p].z - masts[q].z); if (!best || l < best[2]) best = [p, q, l]; }
    adj[best[0]].push(best[1]); adj[best[1]].push(best[0]); inT.push(best[1]);
    const ma = masts[best[0]], mq = masts[best[1]], sag = P.sag * best[2];
    const at = (u) => V3(ma.x + (mq.x - ma.x) * u, ma.gy + ma.att + (mq.gy + mq.att - ma.gy - ma.att) * u - sag * 4 * u * (1 - u), ma.z + (mq.z - ma.z) * u);
    for (let j = 0; j < 8; j++) {
      const v0 = b.pos.length / 3;
      beam(b, at(j / 8), at((j + 1) / 8), 0.2 * S, wireCol);
      for (let v = v0; v < b.pos.length / 3; v++) {
        const u = clamp(((b.pos[v * 3] - ma.x) * (mq.x - ma.x) + (b.pos[v * 3 + 2] - ma.z) * (mq.z - ma.z)) / (best[2] * best[2]), 0, 1);
        ia.push(best[0]); ka.push((1 - u) * ma.att); ib.push(best[1]); kb.push(u * mq.att);
      }
    }
  }
  // (masts and wires are one mesh, bent by hand as the masts lean)
  const geo = b.build(), pa = geo.attributes.position, rest = Float32Array.from(pa.array), nv = pa.count;
  const mesh = new THREE.Mesh(geo, mats.glow);
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  // the way a message goes: out along every wire and back, round the whole grove
  const route = [];
  (function walk(p, from) { for (const q of adj[p]) if (q !== from) { route.push([p, q]); walk(q, p); route.push([q, p]); } })(0, -1);
  const lens = route.map(([p, q]) => Math.hypot(masts[p].x - masts[q].x, masts[p].z - masts[q].z, masts[p].gy + masts[p].att - masts[q].gy - masts[q].att));
  const total = lens.reduce((s, l) => s + l, 0);
  const nd = P.messages * P.train, lights = lightPoints(nd + n, fx, lit, 1.5 * S, 1);
  for (let i = 0; i < nd; i++) lights.sz[i] = i % P.train ? 0.7 : 1.1;
  for (let i = 0; i < n; i++) lights.sz[nd + i] = 1.5;
  group.add(lights.pts);
  const offs = Array.from({ length: P.messages }, (_, i) => ((i + R() * 0.6) / P.messages) * total), flash = new Float32Array(n);
  const tick = ticker();
  return finish({ group, light: V3(masts[0].x, masts[0].gy + P.tall, masts[0].z), focus: V3(0, P.tall * 0.55, 0), span: P.grove + P.bar * 0.5, height: P.tall + 1.5 * S, solid: { r: P.grove + 3, top: P.tall + 1.5 * S, low: 0 } }, fx, [], (t, beat, c) => {
    // each mast leans a little toward the ship when it is near (and never quite stands still)
    const f = 1 - Math.exp(-tick(t) * 1.2), near = c.near ?? 0;
    for (const m of masts) {
      let tx = Math.sin(t * 0.31 + m.ph) * 0.006, tz = Math.cos(t * 0.27 + m.ph * 1.7) * 0.006;
      if (c.shipLocal && near > 0) {
        const dx = c.shipLocal.x - m.x, dz = c.shipLocal.z - m.z, dist = Math.hypot(dx, dz), k = (P.lean * near * clamp(dist / (15 * S), 0, 1)) / Math.max(dist, 1e-3);
        tx += dx * k; tz += dz * k;
      }
      m.lx += (tx - m.lx) * f; m.lz += (tz - m.lz) * f;
    }
    const p = pa.array;
    for (let v = 0; v < nv; v++) {
      const m0 = masts[ia[v]], m1 = masts[ib[v]];
      p[v * 3] = rest[v * 3] + m0.lx * ka[v] + m1.lx * kb[v];
      p[v * 3 + 2] = rest[v * 3 + 2] + m0.lz * ka[v] + m1.lz * kb[v];
    }
    pa.needsUpdate = true;
    // the messages: lights in a file along the wires, and a mast's lamp brightens as one passes
    flash.fill(0);
    for (let i = 0; i < nd; i++) {
      let s = (((P.speed * t + offs[Math.floor(i / P.train)] - (i % P.train) * 1.5 * S) % total) + total) % total, e = 0;
      while (e < route.length - 1 && s > lens[e]) s -= lens[e++];
      const u = clamp(s / lens[e], 0, 1), m0 = masts[route[e][0]], m1 = masts[route[e][1]];
      const hl = Math.hypot(m0.x - m1.x, m0.z - m1.z), y0 = m0.gy + m0.att, y1 = m1.gy + m1.att;
      lights.pos[i * 3] = m0.x + m0.lx * m0.att + (m1.x + m1.lx * m1.att - m0.x - m0.lx * m0.att) * u;
      lights.pos[i * 3 + 1] = y0 + (y1 - y0) * u - P.sag * hl * 4 * u * (1 - u);
      lights.pos[i * 3 + 2] = m0.z + m0.lz * m0.att + (m1.z + m1.lz * m1.att - m0.z - m0.lz * m0.att) * u;
      if (u < 0.15) flash[route[e][0]] = Math.max(flash[route[e][0]], 1 - u / 0.15);
      if (u > 0.85) flash[route[e][1]] = Math.max(flash[route[e][1]], (u - 0.85) / 0.15);
    }
    masts.forEach((m, i) => {
      lights.pos.set([m.x + m.lx * (m.H + 0.3 * S), m.gy + m.H + 0.3 * S, m.z + m.lz * (m.H + 0.3 * S)], (nd + i) * 3);
      lights.al[nd + i] = 0.3 + 0.9 * flash[i];
    });
    lights.g.attributes.position.needsUpdate = true;
    lights.g.attributes.aAlpha.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ seismograph
function seismograph(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), Rd = P.radius, Hd = P.drum, base = ctx.ground(0, 0);
  const y0 = base + 3 * S, y1 = y0 + Hd, px = Rd + 6 * S, gallows = P.frame === 'gallows';
  const b = new Builder();
  // the frame: a plinth and a pedestal under the drum, a pillar beside it (the rail the
  // arm climbs), and a beam over it holding its upper bearing
  b.cyl(Rd + 2.4 * S, Rd + 3.2 * S, 1.2 * S + 2.5, 12, mat(0, base + (1.2 * S - 2.5) / 2, 0), STONE[1]);
  b.cyl(1.3 * S, 2 * S, 1.8 * S, 8, mat(0, base + 2.1 * S, 0), STONE[2]);
  b.cyl(0.7 * S, 0.7 * S, 1.5 * S, 8, mat(0, y1 + 0.7 * S, 0), STONE[2]);
  const beamTop = y1 + 3.2 * S, top = gallows ? beamTop + 4.6 * S : beamTop;
  for (const q of gallows ? [1] : [-1, 1]) {
    const g = ctx.ground(q * px, 0) - 1.5, pt = q === 1 ? top : beamTop;
    b.box(1.8 * S, pt - g, 1.8 * S, mat(q * px, (pt + g) / 2, 0), STONE[q === 1 ? 2 : 1]);
    b.box(2.6 * S, 1.4, 2.6 * S, mat(q * px, g + 1.9, 0), STONE[0]);
  }
  if (gallows) {
    b.box(px + 2.5 * S, 1.8 * S, 2 * S, mat((px - 0.7 * S) / 2, y1 + 2.3 * S, 0), STONE[3]);
    beam(b, V3(px, top - 0.4 * S, 0), V3(-0.8 * S, beamTop - 0.2 * S, 0), 0.5 * S, STONE[3]);
  } else b.box(2 * px + 1.8 * S, 1.8 * S, 2 * S, mat(0, y1 + 2.3 * S, 0), STONE[3]);
  b.box(0.3 * S, Hd, 0.7 * S, mat(px - 0.95 * S, y0 + Hd / 2, 0), mixHex(STONE[3], RIM, 0.6));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the drum: facets of two dark stones (so its turning shows), hoops, and a seam
  const drum = new THREE.Group();
  drum.position.y = y0;
  const db = new Builder(), N = P.sides, hoop = mixHex(STONE[3], RIM, 0.45);
  db.add(new THREE.CylinderGeometry(Rd, Rd, Hd, N, 1), mat(0, Hd / 2, 0), (x, y, z) => (Math.abs(y) > Hd * 0.45 ? STONE[1] : Math.floor((((Math.atan2(z, x) + TAU) % TAU) / TAU) * N) % 2 ? STONE[0] : STONE[1]), 0, { flat: true });
  for (const y of [0.35 * S, Hd - 0.35 * S]) db.cyl(Rd + 0.22 * S, Rd + 0.22 * S, 0.7 * S, N, mat(0, y, 0), hoop);
  db.box(0.5 * S, Hd - 1.6 * S, 0.5 * S, mat(Rd - 0.16 * S, Hd / 2, 0), hoop);
  drum.add(new THREE.Mesh(db.build(), mats.glow));
  group.add(drum);
  // the carriage on its rail, and the arm with its point of light
  const Lp = px - 1.35 * S - Rd - 0.3;    // from the arm's pivot to the point
  const carr = new THREE.Group();
  carr.position.x = px;
  const cb = new Builder();
  cb.box(2.7 * S, 1.5 * S, 2.7 * S, null, STONE[3]);
  cb.box(2.9 * S, 0.4 * S, 2.9 * S, null, RIM);
  carr.add(new THREE.Mesh(cb.build(), mats.glow));
  const arm = new THREE.Group();
  arm.position.x = -1.35 * S;
  const ab = new Builder();
  ab.box(Lp - 0.6 * S, 0.36 * S, 0.36 * S, mat(-(Lp - 0.6 * S) / 2, 0, 0), mixHex(STONE[3], RIM, 0.5));
  ab.cone(0.45 * S, 1 * S, 5, mat(-Lp + 0.5 * S, 0, 0, 0, 0, Math.PI / 2), lit, PULSE);
  arm.add(new THREE.Mesh(ab.build(), mats.glow));
  const pb = new Builder();
  pb.ico(0.55 * S, 1, mat(-Lp, 0, 0), lit, 1);
  arm.add(lightMesh(pb.build(), fx, 0.9));
  carr.add(arm);
  group.add(carr);
  // the trace: a ribbon of light on the drum, written where the point is, fading behind
  const NQ = 900, Q = quads(NQ), Rt = Rd + 0.14 * S + 0.06, hw = 0.2 * S;
  const trace = lightMesh(Q.g, fx, 0.95);
  trace.material.uniforms.uTint.value.setHex(lit);
  drum.add(trace);
  const w = TAU / P.period, life = P.turns * P.period, step = life / (NQ - 12), stamp = new Float64Array(NQ).fill(-1e9);
  const ya = y0 + 1.6 * S + P.amp, travel = y1 - 1.6 * S - P.amp - ya, vy = P.pitch / P.period;
  const carriage = (tau) => { const u = (((tau * vy + P.offset * 2 * travel) % (2 * travel)) + 2 * travel) % (2 * travel); return ya + (u < travel ? u : 2 * travel - u); };
  const strong = Array.from({ length: P.figure }, () => 0.2 + 0.8 * R() * R());
  const hits = [];
  let nHit = 0, head = 0, prev = null, last = null, lastS = 0;
  const strike = (tau) => { hits.push({ t: tau, a: P.amp * strong[nHit++ % strong.length] }); if (hits.length > 4) hits.shift(); };
  const jolt = (tau) => {
    let j = 0.05 * S * Math.sin(tau * 2.3) + 0.03 * S * Math.sin(tau * 5.1 + 1);
    for (const h of hits) { const x = tau - h.t; if (x >= 0 && x < 4) j += h.a * Math.exp(-x * 3) * Math.sin(x * 11); }
    return j;
  };
  const put = (o, al, y) => { Q.pos[o] = Math.cos(al) * Rt; Q.pos[o + 1] = y; Q.pos[o + 2] = Math.sin(al) * Rt; };
  const write = (tau) => {
    const al = P.dir * w * tau, y = carriage(tau) + jolt(tau) - y0;
    if (prev) {
      const ds = (al - prev.al) * Rt, dy = y - prev.y, l = Math.hypot(ds, dy) || 1, na = ((-dy / l) * hw) / Rt, ny = (ds / l) * hw;
      const c0 = prev.c || [prev.al - na, prev.y - ny, prev.al + na, prev.y + ny], c1 = [al - na, y - ny, al + na, y + ny], o = head * 18;
      put(o, c0[0], c0[1]); put(o + 3, c0[2], c0[3]); put(o + 6, c1[2], c1[3]);
      put(o + 9, c0[0], c0[1]); put(o + 12, c1[2], c1[3]); put(o + 15, c1[0], c1[1]);
      stamp[head] = tau;
      head = (head + 1) % NQ;
      prev = { al, y, c: c1 };
    } else prev = { al, y, c: null };
  };
  const hit = rhythm();
  const mid = (y0 + y1) / 2;
  return finish({ group, light: V3(Rd + 0.3, mid, 0), focus: V3(0, mid, 0), span: px + 1.4 * S, height: top + 0.5, solid: { r: px + 1.4 * S, top: top + 0.5, low: 0 } }, fx, [], (t, beat, c) => {
    const h = hit(beat, c);
    if (last === null || t < last || t - last > 4) {
      // found already running: what it wrote before anyone came, to a rhythm supposed
      prev = null; hits.length = 0; stamp.fill(-1e9); head = 0;
      let syn = Math.floor((t - life) / 0.8) * 0.8;
      for (lastS = t - life + step; lastS <= t; lastS += step) { while (syn <= lastS) { strike(syn); syn += 0.8; } write(lastS); }
      lastS -= step;
    } else {
      if (h) strike(t);
      while (lastS + step <= t) { lastS += step; write(lastS); }
    }
    last = t;
    for (let j = 0; j < NQ; j++) { const age = t - stamp[j]; Q.em.fill(age < life ? Math.max(1e-4, Math.pow(Math.max(0, 1 - age / life), 1.6)) : 1e-4, j * 6, j * 6 + 6); }
    Q.g.attributes.position.needsUpdate = true;
    Q.g.attributes.emissive.needsUpdate = true;
    drum.rotation.y = P.dir * w * t;
    carr.position.y = carriage(t);
    arm.rotation.z = -Math.asin(clamp(jolt(t) / Lp, -0.7, 0.7));
  });
}

// ------------------------------------------------------------------ vanes
function vanes(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), n = P.n, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3);
  // where they stand: a sunflower, or rows set off against each other
  let spots = [];
  if (P.layout === 'rows') { const cols = Math.ceil(Math.sqrt(n)), sp = P.len * 1.32; for (let i = 0; i < n; i++) { const r = Math.floor(i / cols); spots.push([((i % cols) + (r % 2) * 0.5) * sp, r * sp * 0.87]); } }
  else for (let i = 0; i < n; i++) { const r = P.len * 0.82 * Math.sqrt(i + 0.6), a = P.turn + i * GA; spots.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const cx = (Math.min(...spots.map((s) => s[0])) + Math.max(...spots.map((s) => s[0]))) / 2, cz = (Math.min(...spots.map((s) => s[1])) + Math.max(...spots.map((s) => s[1]))) / 2;
  spots = spots.map(([x, z]) => [x - cx, z - cz]);
  const Rmax = Math.max(...spots.map(([x, z]) => Math.hypot(x, z)));
  // how tall: scattered, or rising to the middle, or falling to it; from low to high
  let hs = spots.map(([x, z]) => { const k = Math.hypot(x, z) / Rmax; return (P.heights === 'rising' ? 1 - k : P.heights === 'falling' ? k : R()) + R() * 0.12; });
  const h0 = Math.min(...hs), h1 = Math.max(...hs);
  hs = hs.map((h) => P.low + ((h - h0) / (h1 - h0)) * (P.high - P.low));
  const b = new Builder(), vb = new Builder(), idx = [], V = [];
  spots.forEach(([x, z], i) => {
    const gy = ctx.ground(x, z), h = hs[i];
    b.box(1.3 * S, 1.4, 1.3 * S, mat(x, gy + 0.2, z, 0, R() * 3, 0), STONE[0]);
    b.cyl(0.2 * S, 0.34 * S, h + 1.5, 5, mat(x, gy + (h - 1.5) / 2, z), i % 3 ? STONE[1] : STONE[2]);
    if (P.hoops && i % 2 === 0) {
      const yaw = R() * 3;
      b.add(new THREE.TorusGeometry(1.25 * S, 0.14 * S, 4, 12), mat(x, gy + h - 1.6 * S, z, Math.PI / 2, 0, 0), RIM);
      b.box(2.5 * S, 0.18 * S, 0.18 * S, mat(x, gy + h - 1.6 * S, z, 0, yaw, 0), RIM);
    }
    // the vane, pointing +x from its pivot: an arrow with a tail plate, or one long blade
    const l = P.len * (0.82 + 0.18 * R()), arrow = P.kind === 'arrows' || (P.kind === 'mixed' && R() < 0.5), one = new Builder();
    let tip;
    one.cyl(0.32 * S, 0.32 * S, 0.9 * S, 5, mat(0, -0.3 * S, 0), STONE[1]);
    if (arrow) {
      one.box(l * 0.9, 0.3 * S, 0.3 * S, null, STONE[3]);
      one.cone(0.7 * S, 1.7 * S, 4, mat(0.45 * l + 0.75 * S, 0, 0, 0, 0, -Math.PI / 2), RIM);
      one.add(wedge(l * 0.3, 2.3 * S, 1 * S, 0.28 * S), mat(-0.36 * l, 0, 0), STONE[2]);
      tip = 0.45 * l + 1.75 * S;
    } else {
      one.add(wedge(l, 2.5 * S, 0.32 * S, 0.3 * S), mat(-0.12 * l, 0, 0), STONE[3]);
      one.ico(0.5 * S, 0, mat(-0.62 * l, 0, 0), STONE[2]);
      tip = 0.38 * l + 0.3 * S;
    }
    one.ico(0.4 * S, 0, mat(tip, 0, 0), lit, PULSE);
    const v0 = vb.pos.length / 3;
    vb.merge(one, null);
    for (let v = v0; v < vb.pos.length / 3; v++) idx.push(i);
    const w0 = 1.9 * Math.sqrt((5.5 * S) / l) * (0.85 + 0.3 * R());
    V.push({ x, z, y: gy + h + 0.5 * S, tip, w0, zeta: P.zeta * (0.8 + 0.4 * R()), th: 0, om: 0, cos: 1, sin: 0, lag: (x * Math.cos(P.wind) + z * Math.sin(P.wind)) / 12 });
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // (all the vanes are one mesh, each turned by hand about its pole)
  const geo = vb.build(), pa = geo.attributes.position, rest = Float32Array.from(pa.array), nv = pa.count;
  const mesh = new THREE.Mesh(geo, mats.glow);
  mesh.frustumCulled = false;
  group.add(mesh);
  const tips = lightPoints(n, fx, lit, 1.7 * S, 0.9);
  group.add(tips.pts);
  // the wind nothing else feels: it holds, then veers, every so many seconds
  const heading = (k) => P.wind + 1.4 * Math.sin(k * 2.4 + P.s1) + 0.8 * Math.sin(k * 0.9 + P.s2);
  const windAt = (tt) => { const k = Math.floor(tt / P.gust), f = tt / P.gust - k; return heading(k - 1) + (heading(k) - heading(k - 1)) * smoothstep(0, 0.12, f); };
  const tick = ticker();
  let begun = false;
  const top = Math.max(...V.map((v) => v.y)), tallest = V.find((v) => v.y === top);
  return finish({ group, light: V3(tallest.x, tallest.y, tallest.z), focus: V3(0, (P.low + P.high) / 2, 0), span: Rmax + P.len * 0.7, height: top + 1.6 * S, solid: { r: Rmax + 2, top: top + 1.6 * S, low: 0 } }, fx, [], (t, beat, c) => {
    const dt = tick(t), sub = Math.max(1, Math.ceil(dt / 0.02)), h = dt / sub;
    const ship = c.shipLocal ? smoothstep(0.03, 0.3, c.near ?? 0) : 0;
    V.forEach((v, i) => {
      // where it should point: down the wind; or, the ship being near, at the ship
      let want = windAt(t - v.lag) + 0.05 * Math.sin(t * 1.9 + i);
      if (ship > 0) {
        const bs = Math.atan2(c.shipLocal.z - v.z, c.shipLocal.x - v.x), wx = (1 - ship) * Math.cos(want) + ship * Math.cos(bs), wz = (1 - ship) * Math.sin(want) + ship * Math.sin(bs);
        if (wx * wx + wz * wz > 1e-6) want = Math.atan2(wz, wx);
      }
      // and it swings there as a vane does: past it, back, and settles
      if (!begun) v.th = want;
      for (let k = 0; k < sub; k++) { v.om += (-v.w0 * v.w0 * Math.sin(v.th - want) - 2 * v.zeta * v.w0 * v.om) * h; v.th += v.om * h; }
      v.cos = Math.cos(v.th); v.sin = Math.sin(v.th);
      tips.pos[i * 3] = v.x + v.cos * v.tip; tips.pos[i * 3 + 1] = v.y; tips.pos[i * 3 + 2] = v.z + v.sin * v.tip;
    });
    begun = true;
    const p = pa.array;
    for (let k = 0; k < nv; k++) {
      const v = V[idx[k]], x = rest[k * 3], z = rest[k * 3 + 2];
      p[k * 3] = v.x + x * v.cos - z * v.sin; p[k * 3 + 1] = v.y + rest[k * 3 + 1]; p[k * 3 + 2] = v.z + x * v.sin + z * v.cos;
    }
    pa.needsUpdate = true;
    tips.g.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ carillon
// its tiers, from the lowest: how many bells, how wide each, and where they hang
function belfry(P, S) {
  const tiers = [];
  let y = P.legs;
  P.counts.forEach((cnt, k) => { const dk = P.bourdon / cnt; y += k === 0 ? 1.25 * dk + 0.8 * S : 1.3 * dk + 1 * S; tiers.push({ cnt, d: dk, y }); });
  const posts = y + 1.4 * S;
  return { tiers, posts, top: posts + (P.cap === 'spire' ? P.capH + 1.1 * S : 3.3 * S) };
}
function carillon(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), D = P.bourdon, pt = 1.3 * S, base = ctx.ground(0, 0);
  const { tiers, posts, top } = belfry(P, S);
  const hwT = 0.62 * D + pt / 2 + 0.3 * S, hwAt = (y) => hwT * (1 + P.taper * (1 - y / posts));
  const b = new Builder();
  // four posts, a little battered, and rings of beams: an open frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * hwAt(0), z = sz * hwAt(0), g = ctx.ground(x, z);
    beam(b, V3(x, Math.min(g, base) - 1.5, z), V3(sx * hwT, base + posts, sz * hwT), pt, STONE[1]);
    b.box(pt * 1.8, 1.6, pt * 1.8, mat(x, g + 0.3, z), STONE[0]);
  }
  const ringAt = (y, th, col, lift = 0) => {
    const hw = hwAt(y);
    for (const q of [-1, 1]) { b.box(th, th, 2 * hw + pt, mat(q * hw, base + y, 0), col); b.box(2 * hw + pt, th, th, mat(0, base + y + lift, q * hw), col); }
  };
  ringAt(P.legs, 1 * S, STONE[2]);
  ringAt(posts - 0.5 * S, 1 * S, STONE[3]);
  const bells = [];
  tiers.forEach((tr, k) => {
    ringAt(tr.y, 0.8 * S, STONE[2], 0.8 * S);
    b.box(2 * hwAt(tr.y), 0.3 * S, 0.3 * S, mat(0, base + tr.y, 0), mixHex(STONE[3], RIM, 0.5));
    for (let j = 0; j < tr.cnt; j++) bells.push({ x: (j - (tr.cnt - 1) / 2) * tr.d * 1.14, y: base + tr.y, d: tr.d, w: P.rate * Math.sqrt(D / tr.d) * (0.97 + 0.06 * R()), amp: P.swing * (0.85 + 0.25 * R()), ph: R() * TAU });
  });
  // its head: a spire of four rafters, or a slab; and one light on it
  if (P.cap === 'spire') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(b, V3(sx * hwT, base + posts, sz * hwT), V3(0, base + posts + P.capH, 0), 0.8 * S, STONE[1]);
    b.ico(0.7 * S, 0, mat(0, base + posts + P.capH + 0.4 * S, 0), lit, PULSE);
  } else {
    b.box(2 * hwT + 2.4 * S, 1.1 * S, 2 * hwT + 2.4 * S, mat(0, base + posts + 0.55 * S, 0), STONE[2]);
    b.box(2.4 * S, 1 * S, 2.4 * S, mat(0, base + posts + 1.6 * S, 0), STONE[3]);
    b.ico(0.7 * S, 0, mat(0, base + posts + 2.6 * S, 0), lit, PULSE);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // a bell one meter across, hanging from its headstock at the origin
  const bb = new Builder();
  bb.box(1.12, 0.14, 0.2, null, STONE[2]);
  bb.cyl(0.1, 0.15, 0.12, 6, mat(0, -0.12, 0), STONE[2]);
  bb.cyl(0.2, 0.33, 0.16, 10, mat(0, -0.26, 0), STONE[3]);
  bb.cyl(0.33, 0.38, 0.36, 10, mat(0, -0.52, 0), STONE[3]);
  bb.cyl(0.38, 0.5, 0.26, 10, mat(0, -0.83, 0), STONE[3]);
  bb.cyl(0.52, 0.52, 0.07, 10, mat(0, -0.985, 0), lit, 0.5);
  const bellMat = worldMaterial({ unique: true });
  const im = instanced(bb.build(), bellMat, bells.length);
  group.add(im);
  // and its light: the mouth, a ring round the lip, the clapper
  const lb = new Builder();
  lb.add(new THREE.CircleGeometry(0.47, 10), mat(0, -1.03, 0, Math.PI / 2, 0, 0), lit, 0.55);
  lb.add(new THREE.TorusGeometry(0.5, 0.04, 4, 12), mat(0, -1.04, 0, Math.PI / 2, 0, 0), lit, 1);
  lb.ico(0.14, 0, mat(0, -1.12, 0), lit, 1);
  const glow = lightInstanced(lb.build(), fx, bells.length, 0.9);
  group.add(glow);
  const hw0 = hwAt(0);
  return finish({ group, light: V3(0, bells[0].y - D, 0), focus: V3(0, base + posts * 0.55, 0), span: hw0 + pt + 0.3 * D, height: base + top, solid: { r: hw0 + pt + 2, top: base + top, low: 0 } }, fx, [bellMat], (t) => {
    bells.forEach((bl, i) => {
      // each swings as a pendulum of its size, and flashes at the top of its swing
      const s = Math.sin(t * bl.w + bl.ph), f = Math.pow(Math.abs(s), 16);
      trs(_m, bl.x, bl.y, 0, bl.amp * s, 0, 0, bl.d, bl.d, bl.d);
      im.setMatrixAt(i, _m); glow.setMatrixAt(i, _m);
      im.setColorAt(i, _c.setScalar(1 + 2.2 * f)); glow.setColorAt(i, _c.setScalar(0.1 + 1.5 * f));
    });
    for (const m of [im, glow]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  });
}

// ------------------------------------------------------------------ abacus
function abacus(d, A, mats, ctx) {
  const P = d.params, S = d.size, fx = [];
  const lit = mixHex(A, 0xffffff, 0.3), W = P.width, H = P.height, pt = 2.2 * S, nb = P.base - 1, rods = P.rods, xp = W / 2 - pt / 2;
  const gy = Math.max(ctx.ground(-xp, 0), ctx.ground(xp, 0), ctx.ground(0, 0));
  const tilt = mat(0, gy, 0, -P.lean, 0, 0);
  // the frame (in its own plane; it may lean back on struts): posts, a head beam, a sill, rods
  const fb = new Builder();
  for (const q of [-1, 1]) fb.box(pt, H + 4, 2.4 * S, mat(q * xp, (H - 4) / 2, 0), STONE[1]);
  fb.box(W + 1.6 * S, 2 * S, 3.2 * S, mat(0, H - 1 * S, 0), STONE[2]);
  fb.box(W + 0.6 * S, 0.5 * S, 3.6 * S, mat(0, H + 0.25 * S, 0), mixHex(STONE[3], RIM, 0.6));
  const ys = 3.4 * S, yt = H - 2 * S, sp = (yt - ys) / rods, dia = Math.min(sp * 0.8, 3.6 * S), xr = W / 2 - pt - 0.3 * S;
  fb.box(W - pt, 1.6 * S, 2.8 * S, mat(0, ys - 0.8 * S, 0), STONE[2]);
  const rodY = (i) => ys + ((P.low === 'bottom' ? i : rods - 1 - i) + 0.5) * sp;
  for (let i = 0; i < rods; i++) fb.box(2 * xr + 0.8 * S, 0.32 * S, 0.32 * S, mat(0, ys + (i + 0.5) * sp, 0), mixHex(STONE[3], RIM, 0.4));
  const b = new Builder();
  b.merge(fb, tilt);
  for (const q of [-1, 1]) {
    b.box(pt * 1.5, 1.6 * S, 9 * S, mat(q * xp, ctx.ground(q * xp, 0) + 0.3 * S, -P.lean * H * 0.3), STONE[0]);
    if (P.lean > 0) {
      const p0 = V3(q * xp, H * 0.78, -1 * S).applyMatrix4(tilt), zg = p0.z - H * 0.42;
      beam(b, V3(q * xp, ctx.ground(q * xp, zg) - 1, zg), p0, 1.1 * S, STONE[1]);
      b.box(pt * 1.3, 1.4, pt * 1.3, mat(q * xp, ctx.ground(q * xp, zg) + 0.2, zg), STONE[0]);
    }
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the beads: of light, base - 1 on every rod; counted, they lie to the right
  const bw = Math.min(P.bead === 'orb' ? dia : dia * 0.72, (0.84 * xr) / nb), pitch = bw * 1.06;
  const bd = new Builder();
  if (P.bead === 'bicone') { bd.cone(0.5, 0.5, 8, mat(0.25, 0, 0, 0, 0, -Math.PI / 2), lit, 1.1); bd.cone(0.5, 0.5, 8, mat(-0.25, 0, 0, 0, 0, Math.PI / 2), lit, 1.1); }
  else if (P.bead === 'disc') bd.cyl(0.5, 0.5, 0.8, 10, mat(0, 0, 0, 0, 0, Math.PI / 2), lit, 1.1);
  else bd.ico(0.5, 1, null, lit, 1.1);
  const beadMat = worldMaterial({ unique: true });
  const im = instanced(bd.build(), beadMat, rods * nb);
  const leaning = new THREE.Group();
  leaning.position.y = gy;
  leaning.rotation.x = -P.lean;
  leaning.add(im);
  group.add(leaning);
  // the number it has reached, a digit to a rod
  const digits = [];
  for (let i = 0, v = P.start; i < rods; i++) { digits.push(v % P.base); v = Math.floor(v / P.base); }
  const beads = [];
  for (let i = 0; i < rods; i++) for (let k = 0; k < nb; k++) { const f = k < digits[i] ? 1 : 0; beads.push({ y: rodY(i), xc: xr - (k + 0.5) * pitch, xu: -xr + (nb - 1 - k + 0.5) * pitch, a: f, b: f, t0: -1e9 }); }
  const DUR = 0.55, ease = (u) => u * u * (3 - 2 * u);
  const at = (bead, t) => bead.a + (bead.b - bead.a) * ease(clamp((t - bead.t0) / DUR, 0, 1));
  const send = (bead, to, t0, t) => { bead.a = at(bead, t); bead.b = to; bead.t0 = t0; };
  const queue = [];
  // one more: clear every full rod below (its beads go back in a file), then one bead over
  const count = (t) => {
    if (!queue.length) { let i = 0; while (i < rods && digits[i] === nb) queue.push([i++, 0]); if (i < rods) queue.push([i, 1]); }
    const [i, up] = queue.shift();
    if (up) send(beads[i * nb + digits[i]++], 1, t, t);
    else { for (let k = digits[i] - 1, j = 0; k >= 0; k--, j++) send(beads[i * nb + k], 0, t + j * 0.13, t); digits[i] = 0; }
  };
  const hit = rhythm();
  let lastMove = null;
  const mid = V3(0, H * 0.52, 0).applyMatrix4(tilt), topY = V3(0, H + 0.5 * S, 0).applyMatrix4(tilt).y;
  return finish({ group, light: mid.clone(), focus: mid, span: W / 2 + 1.2 * S, height: topY + 0.5, solid: { r: W / 2 + 1, top: topY + 0.5, low: 0 } }, fx, [beadMat], (t, beat, c) => {
    // a bead moves on a beat of its rhythm (or, the rhythm failing, after a while)
    const h = hit(beat, c);
    if (lastMove === null || t < lastMove) lastMove = t;
    if ((h && t - lastMove > 0.45) || t - lastMove > 2.4) { count(t); lastMove = t; }
    beads.forEach((bead, i) => {
      const f = at(bead, t), age = t - bead.t0, moved = age >= 0 && age < DUR + 0.9 ? 1 - age / (DUR + 0.9) : 0;
      im.setMatrixAt(i, trs(_m, bead.xu + (bead.xc - bead.xu) * f, bead.y, 0, 0, 0, 0, bw, dia, dia));
      im.setColorAt(i, _c.setScalar(0.28 + 1 * f + 0.9 * moved));
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ the set
const FRACTION = { 0.75: 'three quarters', 0.8: 'four fifths', 0.875: 'seven eighths', 0.9: 'nine tenths' };
const PART = ['', '', 'half', 'a third', 'a quarter', 'a fifth'];

export const SET = {
  sundial: {
    code: 'SDL', cls: 'Dial of light', nouns: ['Gnomon', 'Dial', 'Hour', 'Noon', 'Meridian', 'Style'], place: 'any', kin: ['sun', 'turning', 'halo'], voice: ['glass', 'breath'],
    params(R, size) {
      const hours = R.pick([12, 12, 16, 20, 24, 24, 36]);
      const P = { radius: R.range(15, 20) * size, height: R.range(24, 38) * size, reach: R.range(0.36, 0.58), thick: R.range(1.1, 1.6) * size, kind: R.pick(['blade', 'window', 'window', 'stair']), steps: R.int(4, 7), hours, major: hours / 4, bands: R.int(2, 4), period: R.pick([150, 180, 210, 240, 300]), dir: R.chance(0.5) ? 1 : -1, phase: R.range(0, TAU) };
      const how = P.kind === 'window' ? ', pierced through' : P.kind === 'stair' ? `, its back cut in ${lower(numw(P.steps))} steps` : '';
      P.text = `A gnomon ${Math.round(P.height)} meters tall${how}, on a dial of dark stone ${Math.round(P.radius * 2)} meters across with ${P.hours} marks of light round its rim. It casts no shadow: a blade of light lies on the dial instead, and goes round it once every ${P.period} seconds.`;
      return P;
    },
    build: sundial,
  },
  forks: {
    code: 'FRK', cls: 'Tuning forks', nouns: ['Fork', 'Tine', 'Pitch', 'Overtone', 'Unison', 'Interval'], place: 'any', kin: ['choir', 'spire', 'helicon'], voice: ['fm', 'glass'],
    params(R, size) {
      const seq = R.pick(['harmonic', 'harmonic', 'scale', 'primes', 'octaves']);
      const n = seq === 'octaves' ? R.int(4, 6) : R.int(5, 9);
      const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23];
      const note = { harmonic: (i) => i + 1, scale: (i) => [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2, 9 / 4][i], primes: (i) => PRIMES[i] / 2, octaves: (i) => Math.pow(2, i) }[seq];
      const order = Array.from({ length: n }, (_, i) => i), strike = R.pick(['up', 'down', 'wander']);
      if (strike === 'down') order.reverse();
      if (strike === 'wander') for (let i = n - 1; i > 0; i--) { const j = R.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
      // (a fork sounds as one over the square of its tines' length)
      const P = { n, seq, lengths: order.map((_, i) => 1 / Math.sqrt(note(i))), layout: R.pick(['row', 'row', 'arc', 'ring']), arrange: R.pick(['descending', 'centered']), order, tall: R.range(30, 44) * size, stem: R.range(7, 11) * size, thick: R.range(1.3, 1.7) * size, gap: R.range(2.2, 3.2) * size, spacing: R.range(7.5, 9.5) * size, arc: R.range(1.5, 2.6) };
      const sound = { harmonic: `the harmonic series, one to ${lower(numw(n))}`, scale: 'a just scale, note by note', primes: `the primes from 2 to ${PRIMES[n - 1]}`, octaves: `${lower(numw(n))} octaves, one above another` }[seq];
      P.text = `${numw(n)} tuning forks of stone standing in ${P.layout === 'row' ? 'a row' : P.layout === 'arc' ? 'an arc' : 'a ring'}, the tallest ${Math.round(P.tall)} meters; their tines are cut to sound ${sound}. They are struck in turn on their rhythm: the tines blur, and rings of light leave their tips and rise.`;
      return P;
    },
    build: forks,
  },
  heliostat: {
    code: 'HST', cls: 'Mirror field', nouns: ['Heliostat', 'Mirror', 'Focus', 'Glint', 'Furnace', 'Noon'], place: 'any', kin: ['sun', 'bloom', 'pyre'], voice: ['glass', 'grains'],
    params(R, size) {
      const n = R.pick([55, 89, 89, 144]);
      const P = { n, tower: R.range(34, 50) * size, pitch: R.range(1.95, 2.35) * size * (n === 144 ? 0.8 : n === 89 ? 0.95 : 1.15), shape: R.pick(['square', 'hex', 'round']), profile: R.pick(['level', 'bowl', 'terraces']), collars: R.int(2, 5), period: R.pick([120, 180, 240, 300]), dir: R.chance(0.5) ? 1 : -1, az: R.range(0, TAU), el: R.range(0.55, 0.95), wave: R.pick(['ripple', 'sweep', 'arms']), arms: R.pick([8, 13, 21]), rings: R.range(1.4, 2.4), turn: R.range(0, TAU) };
      const lie = P.profile === 'bowl' ? ', the outer ones taller, like a bowl' : P.profile === 'terraces' ? ', in four terraces' : '';
      const glint = P.wave === 'ripple' ? 'in rings, from the edge inward' : P.wave === 'sweep' ? 'round and round, like the hand of a clock' : `along their ${P.arms} spiral arms, one arm after another`;
      P.text = `${n} mirrors on stalks, set at the golden angle about a tower ${Math.round(P.tower)} meters tall${lie}. They turn as one to keep their light on its tip, which burns; a glint goes through them ${glint}.`;
      return P;
    },
    build: heliostat,
  },
  antennae: {
    code: 'YAG', cls: 'Aerial grove', nouns: ['Aerial', 'Mast', 'Antenna', 'Signal', 'Carrier', 'Reception'], place: 'any', kin: ['loom', 'tree', 'watcher'], voice: ['chirp', 'glitch'],
    params(R, size) {
      const P = { n: R.int(5, 9), style: R.pick(['fishbone', 'yagi', 'yagi']), bars: R.int(5, 9), tau: R.pick([0.75, 0.8, 0.875, 0.9]), tall: R.range(34, 48) * size, grove: R.range(15, 22) * size, bar: R.range(6.5, 9.5) * size, bearing: R.range(0, TAU), turn: R.range(0, TAU), sag: R.range(0.07, 0.13), messages: R.int(3, 6), train: R.pick([1, 2, 3]), speed: R.range(7, 11) * size, tiers: R.pick([1, 1, 2]), lean: R.range(0.08, 0.13) };
      P.text = `${numw(P.n)} thin masts, the tallest ${Math.round(P.tall)} meters, each carrying an aerial of ${lower(numw(P.bars))} crossbars, every bar ${FRACTION[P.tau]} the length of the one before, and all of them turned to the same quarter of the sky. Wires are slung from mast to mast; lights run along them like messages, and the masts lean toward whoever comes near.`;
      return P;
    },
    build: antennae,
  },
  seismograph: {
    code: 'SSM', cls: 'Seismograph', nouns: ['Seismograph', 'Drum', 'Tremor', 'Trace', 'Needle', 'Record'], place: 'any', kin: ['turning', 'helicon', 'storm'], voice: ['grains', 'glitch'],
    params(R, size) {
      const P = { radius: R.range(4.6, 6.4) * size, drum: R.range(22, 32) * size, sides: R.pick([16, 20, 24]), period: R.pick([16, 20, 24, 30]), dir: R.chance(0.5) ? 1 : -1, pitch: R.range(2.3, 3.1) * size, turns: R.range(2.2, 3.2), amp: R.range(0.7, 1.1) * size, frame: R.pick(['gantry', 'gantry', 'gallows']), figure: R.int(3, 8), offset: R() };
      P.text = `A drum of dark stone ${Math.round(P.drum)} meters tall on a ${P.frame} of stone, turning once every ${P.period} seconds. An arm with a point of light writes a line round it, ${P.pitch.toFixed(1)} meters higher at each turn, and every beat of its rhythm jolts the line; ${P.turns.toFixed(1)} turns back, the line has faded.`;
      return P;
    },
    build: seismograph,
  },
  vanes: {
    code: 'VNE', cls: 'Weathervanes', nouns: ['Vane', 'Arrow', 'Bearing', 'Heading', 'Wind', 'Compass'], place: 'any', kin: ['murmuration', 'watcher', 'storm'], voice: ['breath', 'chirp'],
    params(R, size) {
      const P = { n: R.pick([8, 9, 12, 13, 16, 21]), kind: R.pick(['arrows', 'blades', 'mixed']), layout: R.pick(['spiral', 'spiral', 'rows']), len: R.range(5, 6.8) * size, low: R.range(9, 13) * size, high: R.range(24, 34) * size, heights: R.pick(['scattered', 'rising', 'falling']), zeta: R.range(0.13, 0.26), gust: R.pick([9, 12, 15]), wind: R.range(0, TAU), s1: R.range(0, TAU), s2: R.range(0, TAU), hoops: R.chance(0.5), turn: R.range(0, TAU) };
      const what = P.kind === 'arrows' ? 'plain arrows' : P.kind === 'blades' ? 'bare blades' : 'arrows and blades';
      P.text = `${numw(P.n)} weathervanes on poles from ${Math.round(P.low)} to ${Math.round(P.high)} meters tall, ${what}, their tips lit. They veer together with a wind that nothing else feels; and when someone comes near they all swing round to point at them, overshoot, and settle.`;
      return P;
    },
    build: vanes,
  },
  carillon: {
    code: 'CAR', cls: 'Bell tower', nouns: ['Carillon', 'Belfry', 'Bell', 'Peal', 'Bourdon', 'Changes'], place: 'any', kin: ['choir', 'cathedral', 'chandelier'], voice: ['glass', 'fm'],
    params(R, size) {
      const series = R.pick(['harmonic', 'harmonic', 'harmonic', 'odd', 'octave']);
      const tiers = series === 'harmonic' ? R.int(3, 5) : 3;
      const counts = Array.from({ length: tiers }, (_, k) => (series === 'harmonic' ? k + 1 : series === 'odd' ? 2 * k + 1 : Math.pow(2, k)));
      const P = { series, tiers, counts, bourdon: R.range(5.4, 7) * size, legs: R.range(8, 12) * size, taper: R.range(0, 0.16), cap: R.pick(['spire', 'spire', 'slab']), capH: R.range(5, 8) * size, swing: R.range(0.7, 0.95), rate: R.range(0.75, 1) };
      const above = counts.slice(1).map((c) => `${lower(numw(c))} ${PART[c]} its size`);
      P.text = `An open tower of stone ${Math.round(belfry(P, size).top)} meters tall, hung with ${counts.reduce((s, c) => s + c, 0)} bells in ${lower(numw(tiers))} tiers: one great bell, then ${above.slice(0, -1).join(', ')} and ${above[above.length - 1]}. They swing out of step, the small ones faster, and each flashes at the top of its swing.`;
      return P;
    },
    build: carillon,
  },
  abacus: {
    code: 'ABC', cls: 'Counting frame', nouns: ['Abacus', 'Count', 'Tally', 'Reckoner', 'Sum', 'Register'], place: 'any', kin: ['loom', 'menger', 'temple'], voice: ['glitch', 'grains'],
    params(R, size) {
      const base = R.pick([2, 2, 2, 3, 5, 10]);
      const rods = base === 2 ? R.int(8, 12) : base === 3 ? R.int(6, 8) : base === 5 ? R.int(5, 7) : R.int(4, 6);
      const P = { base, rods, width: R.range(26, 38) * size, height: R.range(24, 36) * size, lean: R.pick([0, 0, 0.12, 0.2]), bead: R.pick(['bicone', 'disc', 'orb']), low: R.pick(['bottom', 'bottom', 'top']), start: R.int(Math.pow(base, rods - 3), Math.pow(base, rods - 1)) };
      const how = { 2: 'in binary', 3: 'in threes', 5: 'in fives', 10: 'in tens' }[base];
      P.text = `A frame of stone ${Math.round(P.width)} meters across${P.lean ? ', leaning back on two struts' : ''}, ${lower(numw(rods))} rods in it and ${base === 2 ? 'one bead' : `${lower(numw(base - 1))} beads`} of light on each. It counts ${how}, one bead at a time, from the ${P.low} rod, and does not stop; it had reached ${formatInt(P.start)} when the Codex found it.`;
      return P;
    },
    build: abacus,
  },
};
