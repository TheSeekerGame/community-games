import * as THREE from 'three';
import { Builder, mat } from '../../render/build.js';
import { glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp, smoothstep } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE } from '../parts.js';

// The MYTHIC tier: landmarks. Among a hundred pilots perhaps one ever finds one, and the
// others fly a long way to see it. Each is seen from far through the fog, carries a
// second, prismatic light beside its accent, and lives through a slow event that takes
// minutes to unfold and then resets.
//   strandtower   a ring of stone sockets and, two hundred meters over it, a ring of light
//                 with nothing under it; two families of straight strands of light between
//                 them. They are drawn up one by one; the upper ring turns until the strands
//                 pinch to a burning waist (a ruled hyperboloid closing to a double cone),
//                 then it all unwinds and goes dark again
//   glassneedles  a forest of glass needles in a golden spiral, the tallest as tall as a
//                 tower; waves of ringing cross it from ever other sides, each needle
//                 humming in its own mode, and over it the ringing draws an aurora that
//                 hangs a while and fades
//   worldseed     a seed as large as a hall hanging with nothing holding it, closed in
//                 scales at the golden angle; its scales open from the tip upward and a
//                 lattice of light unfolds out of it, holds, folds back in, and the seed
//                 closes (floats)

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
const GOLD = Math.PI * (3 - Math.sqrt(5));
const frac = (x) => x - Math.floor(x);
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const hash = (k) => frac(Math.sin(k * 12.9898 + 4.1414) * 43758.5453);
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const numw = (n) => NUMW[n] || String(n);
const _c = new THREE.Color(), _c2 = new THREE.Color();

function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.4, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  const e = [m, opacity];
  fx.push(e);
  mesh.userData.fx = e;
  return mesh;
}
// (each fx entry is [material, base opacity]; an update may change the base before it is applied)
function finish(out, update) {
  const res = {
    ...out,
    mats: out.fx.map(([m]) => m),
    update(t, beat, c) {
      if (update) update(t, beat, c);
      const k = (c.reveal ?? 1) * (0.8 + (c.pulse ?? 1) * 0.25);
      for (const e of out.fx) e[0].uniforms.uOpacity.value = e[1] * k;
    },
  };
  res.update(0, 0, { pulse: 1, reveal: 0, near: 0, shipLocal: V(0, 9999, 9999) });
  return res;
}
// soft points of light, placed by the caller
function lights(n, color, fx, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size: 1, additive: true, opacity });
  const e = [m, opacity];
  fx.push(e);
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  return { p, m, e, pos, sz, al, touch() { g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aSize.needsUpdate = true; } };
}
// a geometry of light rewritten every frame (nv vertices, optionally indexed)
function dyn(nv, index = null) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1), em = new Float32Array(nv).fill(0.02);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  if (index) g.setIndex(index);
  return {
    g, pos, col, em,
    touch(colors = false) {
      g.attributes.position.needsUpdate = true;
      g.attributes.emissive.needsUpdate = true;
      if (colors) g.attributes.color.needsUpdate = true;
    },
  };
}
// lines of light as crossed ribbons: `count` lines of `nodes` nodes, four vertices a node
function ribbonIndex(count, nodes) {
  const idx = [];
  for (let s = 0; s < count; s++) for (let j = 0; j < nodes - 1; j++) {
    const b = (s * nodes + j) * 4, c = b + 4;
    idx.push(b, b + 1, c + 1, b, c + 1, c, b + 2, b + 3, c + 3, b + 2, c + 3, c + 2);
  }
  return idx;
}
// a straight line of light from a to c, its nodes evenly along it, half-width w
function writeLine(pos, at, ax, ay, az, cx, cy, cz, nodes, w) {
  let dx = cx - ax, dy = cy - ay, dz = cz - az;
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-5) { dx = 0; dy = 1; dz = 0; } else { dx /= l; dy /= l; dz /= l; }
  let s1x = -dz, s1z = dx;
  const sl = Math.hypot(s1x, s1z);
  if (sl < 1e-4) { s1x = 1; s1z = 0; } else { s1x /= sl; s1z /= sl; }
  const s2x = dy * s1z, s2y = dz * s1x - dx * s1z, s2z = -dy * s1x;
  for (let j = 0; j < nodes; j++) {
    const u = nodes > 1 ? j / (nodes - 1) : 0;
    const px = ax + (cx - ax) * u, py = ay + (cy - ay) * u, pz = az + (cz - az) * u, o = (at + j) * 12;
    pos[o] = px + s1x * w; pos[o + 1] = py; pos[o + 2] = pz + s1z * w;
    pos[o + 3] = px - s1x * w; pos[o + 4] = py; pos[o + 5] = pz - s1z * w;
    pos[o + 6] = px + s2x * w; pos[o + 7] = py + s2y * w; pos[o + 8] = pz + s2z * w;
    pos[o + 9] = px - s2x * w; pos[o + 10] = py - s2y * w; pos[o + 11] = pz - s2z * w;
  }
}
const setCol = (col, v, c) => { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; };
const prism = (h, s = 0.65, l = 0.62) => _c.setHSL(frac(h), s, l);

// ------------------------------------------------------------------ strand tower
function strandtower(d, A, mats, ctx) {
  const P = d.params, K = P.k, N = P.n, Rb = P.base, Rt = Rb * P.topR, H = P.height, C = P.cycle;
  const group = new THREE.Group(), fx = [];
  const b = new Builder(), gb = new Builder();
  const g0 = ctx.ground(0, 0);
  // the sockets in their ring, a curb of dark stone between them, an eye of light on each
  const feet = [];
  let fy = 0;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, x = Math.cos(a) * Rb, z = Math.sin(a) * Rb, gy = ctx.ground(x, z);
    b.box(4.4 * K, 7 * K, 4.4 * K, mat(x, gy + 1.5 * K, z, 0, -a, 0), STONE[1 + (i % 3)]);
    b.box(5.2 * K, 0.8 * K, 5.2 * K, mat(x, gy + 5.2 * K, z, 0, -a, 0), RIM);
    gb.ico(1.2 * K, 1, mat(x, gy + 6.7 * K, z), A, PULSE);
    feet.push(V(x, gy + 6.7 * K, z));
    fy += (gy + 6.7 * K) / N;
    const am = ((i + 0.5) / N) * TAU, rc = Rb * Math.cos(Math.PI / N), xm = Math.cos(am) * rc, zm = Math.sin(am) * rc;
    b.box(Math.max(1, 2 * Rb * Math.sin(Math.PI / N) - 4.2 * K), 1.8 * K, 2.2 * K, mat(xm, ctx.ground(xm, zm) + 0.2 * K, zm, 0, -am - Math.PI / 2, 0), STONE[0]);
  }
  // the hearth in the middle, under where the waist will close
  b.cyl(9 * K, 10 * K, 2 * K, 32, mat(0, g0 + 0.2 * K, 0), STONE[0]);
  b.cyl(9.3 * K, 9.3 * K, 0.5 * K, 32, mat(0, g0 + 1.1 * K, 0), RIM);
  gb.torus(6.2 * K, 0.45 * K, 4, 40, mat(0, g0 + 1.4 * K, 0, Math.PI / 2, 0, 0), A, PULSE);
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(gb.build(), mats.glow));
  // the upper ring: light with nothing under it, and a prismatic haze about it
  const rb = new Builder();
  rb.torus(Rt, 1.0 * K, 6, 128, mat(0, H, 0, Math.PI / 2, 0, 0), mixHex(A, 0xffffff, 0.4), 1);
  group.add(lightMesh(rb.build(), fx, 0.85, { fog: 0.3 }));
  const hb = new Builder();
  hb.torus(Rt, 3.4 * K, 6, 96, mat(0, H, 0, Math.PI / 2, 0, 0), 0xffffff, 1);
  const haze = lightMesh(hb.build(), fx, 0.16, { fog: 0.3, fresnel: 0.6 });
  group.add(haze);
  // the strands: two rulings of the same surface, one in the accent, one prismatic
  const SEG = 22, NOD = SEG + 1, idx = ribbonIndex(N, NOD);
  const D1 = dyn(N * NOD * 4, idx), D2 = dyn(N * NOD * 4, idx.slice());
  _c2.setHex(mixHex(A, 0xffffff, 0.2));
  for (let v = 0; v < N * NOD * 4; v++) setCol(D1.col, v, _c2);
  group.add(lightMesh(D1.g, fx, 0.75, { fog: 0.35 }));
  group.add(lightMesh(D2.g, fx, 0.6, { fog: 0.35 }));
  // where each is tied to the upper ring, and the waist's fire
  const tp = lights(2 * N, mixHex(A, 0xffffff, 0.5), fx, 0.9);
  for (let i = 0; i < 2 * N; i++) tp.sz[i] = 6.5 * K;
  group.add(tp.p);
  const cb = new Builder();
  cb.ico(2.6 * K, 1, mat(0, 0, 0), 0xffffff, 1);
  const core = lightMesh(cb.build(), fx, 0, { fog: 0.3 });
  group.add(core);
  const fire = lights(2, 0xffffff, fx, 1);
  fire.sz[0] = 70 * K; fire.sz[1] = 16 * K;
  group.add(fire.p);
  // the order they are drawn up in: scattered about the ring
  const rank = new Array(N);
  Array.from({ length: N }, (_, i) => i).sort((p, q) => frac(p * 0.6180339887 + P.phase) - frac(q * 0.6180339887 + P.phase)).forEach((i, r) => { rank[i] = r / N; });
  const phi0 = P.rest, phi1 = Math.PI * P.close, w = 0.7 * K;
  let lastWaist = fy + (H - fy) * 0.5;
  return finish({
    group, fx, light: V(0, fy + (H - fy) * Rb / (Rb + Rt), 0), focus: V(0, H * 0.45, 0), span: Math.max(Rb, Rt) + 4 * K,
    clear: Rb + 9 * K, height: H + 3 * K,
  }, (t) => {
    const q = frac(t / C + P.phase);
    // the twist: rest, turn to the waist, hold it burning, unwind
    let tw = 0;
    if (q >= 0.2 && q < 0.55) tw = ease((q - 0.2) / 0.35);
    else if (q >= 0.55 && q < 0.68) tw = 1;
    else if (q >= 0.68 && q < 0.88) tw = 1 - ease((q - 0.68) / 0.2);
    const phi = phi0 + (phi1 - phi0) * tw, close = smoothstep(0.8, 1, tw);
    const cp = Math.cos(phi), sWaist = clamp((Rb * Rb - Rb * Rt * cp) / Math.max(1e-3, Rb * Rb + Rt * Rt - 2 * Rb * Rt * cp), 0.05, 0.95);
    const hue = t / P.hue;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, f = feet[i], r = rank[i];
      for (let k = 0; k < 2; k++) {
        const D = k ? D2 : D1, sg = k ? -1 : 1;
        const up = clamp((q - 0.015 - 0.14 * r - k * 0.01) / 0.035, 0, 1), down = clamp((q - 0.885 - 0.08 * r) / 0.03, 0, 1);
        const g = Math.min(up, 1 - down);
        const ta = a + sg * phi, tx = Math.cos(ta) * Rt, tz = Math.sin(ta) * Rt;
        writeLine(D.pos, i * NOD, f.x, f.y, f.z, tx, H, tz, NOD, w * (1 + close * 0.4));
        const moving = g > 0 && g < 1;
        for (let j = 0; j < NOD; j++) {
          const u = j / SEG;
          const lit = smoothstep(g + 0.012, g - 0.012, u);
          const run = Math.pow(0.5 + 0.5 * Math.sin(TAU * (u * 2.5 - t * 0.16) + i * 2.4 + k * 1.3), 6);
          const waist = close * 1.1 * Math.exp(-(((u - sWaist) / 0.07) ** 2));
          const head = moving ? 1.4 * Math.exp(-(((u - g) / 0.035) ** 2)) : 0;
          const e = 0.04 + lit * (0.5 + 0.35 * run + waist) + head;
          const o = (i * NOD + j) * 4;
          D.em[o] = D.em[o + 1] = D.em[o + 2] = D.em[o + 3] = e;
        }
        tp.pos[(i * 2 + k) * 3] = tx; tp.pos[(i * 2 + k) * 3 + 1] = H; tp.pos[(i * 2 + k) * 3 + 2] = tz;
        tp.al[i * 2 + k] = 0.25 + 0.75 * g;
        if (k) {
          prism(hue + 0.18 * Math.sin((i / N) * TAU));
          for (let v = i * NOD * 4; v < (i + 1) * NOD * 4; v++) setCol(D2.col, v, _c);
        }
      }
    }
    D1.touch(); D2.touch(true); tp.touch();
    // the fire at the waist, where every strand passes nearest the axis
    lastWaist = fy + (H - fy) * sWaist;
    const flick = 1 + Math.sin(t * 5.3) * 0.06 + Math.sin(t * 8.9) * 0.04;
    core.position.y = lastWaist;
    core.scale.setScalar((0.3 + close) * flick);
    core.userData.fx[1] = 1.1 * close * close;
    fire.pos[1] = lastWaist; fire.pos[4] = lastWaist;
    fire.al[0] = 0.05 + 0.9 * close * close; fire.al[1] = close * flick;
    fire.touch();
    fire.m.uniforms.uColor.value.copy(prism(hue + 0.1, 0.45, 0.78));
    haze.material.uniforms.uTint.value.copy(prism(hue, 0.6, 0.6));
    haze.userData.fx[1] = 0.12 + 0.12 * close;
  });
}

// ------------------------------------------------------------------ glass needles
function glassneedles(d, A, mats, ctx) {
  const P = d.params, K = P.k, R = rng(d.seed[5]), n = P.n, Rf = P.radius, C = P.cycle;
  const group = new THREE.Group(), fx = [];
  const b = new Builder(), gl = new Builder();
  const vid = [], vu = [], ND = [];
  const gap = Rf * Math.sqrt(Math.PI / n);
  let top = 0;
  for (let i = 0; i < n; i++) {
    const th = i * GOLD + P.turn + (R() - 0.5) * 0.08;
    const r = clamp(Rf * Math.sqrt((i + 0.5) / n) + (R() - 0.5) * gap * 0.3, 0, Rf);
    const x = Math.cos(th) * r, z = Math.sin(th) * r, gy = ctx.ground(x, z);
    const h = P.tall * (0.28 + 0.72 * (1 - Math.pow(r / Rf, 1.5))) * R.range(0.8, 1.05);
    const rb = (0.6 + h / 110) * K;
    const lean = (r / Rf) * R.range(0.02, 0.07);
    const dir = V(Math.cos(th) * Math.sin(lean), Math.cos(lean), Math.sin(th) * Math.sin(lean));
    const base = V(x, gy - 1.5 * K, z);
    const cg = new THREE.ConeGeometry(rb, h, 6, 4, true);
    cg.translate(0, h / 2, 0);
    const m4 = new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromUnitVectors(UP, dir), V(1, 1, 1));
    gl.add(cg, m4, 0xffffff, (px, py) => { vid.push(i); vu.push(clamp(py / h, 0, 1)); return 0.3; });
    // its root: a collar of dark stone and a pale band
    b.cyl(rb * 1.6, rb * 2.1, 4 * K, 6, mat(x, gy + 0.5 * K, z), STONE[i % 4]);
    b.cyl(rb * 1.7, rb * 1.7, 0.5 * K, 6, mat(x, gy + 2.6 * K, z), RIM);
    const tip = base.clone().addScaledVector(dir, h);
    top = Math.max(top, tip.y);
    ND.push({ x, z, h, tip, mode: h > P.tall * 0.6 ? 2 : 3, ph: R() * TAU });
  }
  group.add(new THREE.Mesh(b.build(), mats.body));
  const glassGeo = gl.build(), gem = glassGeo.attributes.emissive.array;
  const glass = lightMesh(glassGeo, fx, 0.3, { fresnel: 0.7, fog: 0.4 });
  glass.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.55));
  group.add(glass);
  const tips = lights(n, mixHex(A, 0xffffff, 0.5), fx, 1);
  ND.forEach((q, i) => { tips.pos.set([q.tip.x, q.tip.y + 1, q.tip.z], i * 3); tips.sz[i] = (2.5 + 4 * q.h / P.tall) * K; });
  group.add(tips.p);
  // the aurora: curtains over the field, drawn by the ringing
  const NC = P.curtains, COL = 72, ROW = 8, NV = (COL + 1) * (ROW + 1), aidx = [];
  for (let c = 0; c < NC; c++) for (let s = 0; s < COL; s++) for (let v = 0; v < ROW; v++) {
    const o = c * NV + s * (ROW + 1) + v, o2 = o + ROW + 1;
    aidx.push(o, o2, o2 + 1, o, o2 + 1, o + 1);
  }
  const AU = dyn(NC * NV, aidx);
  group.add(lightMesh(AU.g, fx, 0.6, { fog: 0.28 }));
  const yA = top + 12 * K, Acol = new THREE.Color().setHex(mixHex(A, 0xffffff, 0.15));
  // the waves: each from its own place on the field's edge, every W seconds
  const W = P.every, speed = P.speed;
  const src = (k) => { const a = k * 2.39996 + P.turn; return [Math.cos(a) * Rf * 0.85, Math.sin(a) * Rf * 0.85]; };
  let env = 0, tt = 0;
  const ring = (x, z) => {
    const kc = Math.floor(tt / W);
    let s = 0;
    for (let k = kc - 3; k <= kc; k++) {
      const [sx, sz] = src(k), tau = k * W + Math.hypot(x - sx, z - sz) / speed;
      if (tt >= tau) s += (0.55 + 0.45 * hash(k)) * Math.exp(-(tt - tau) * P.decay);
    }
    return (0.12 + 0.88 * env) * s;
  };
  const amp = new Float32Array(n);
  return finish({
    group, fx, light: V(0, top * 0.6, 0), focus: V(0, top * 0.55, 0), span: Rf + 3 * K, clear: Rf + 7 * K,
    height: yA + P.aurora * 1.05,
  }, (t) => {
    tt = t;
    const q = frac(t / C + P.phase);
    env = smoothstep(0.08, 0.18, q) * (1 - smoothstep(0.62, 0.74, q));
    for (let i = 0; i < n; i++) {
      const a = ring(ND[i].x, ND[i].z);
      amp[i] = a;
      tips.al[i] = 0.22 + Math.min(1.3, a * 1.1);
    }
    tips.touch();
    // each needle humming in its mode: standing bands of light along it
    for (let v = 0; v < gem.length; v++) {
      const i = vid[v], u = vu[v], nd = ND[i], a = amp[i];
      gem[v] = 0.22 + 0.18 * u + (a > 0.01 ? a * (0.35 + 1.1 * Math.abs(Math.sin(Math.PI * u * (nd.mode + 0.5))) * (0.65 + 0.35 * Math.cos(t * 9 + nd.ph))) : 0);
    }
    glassGeo.attributes.emissive.needsUpdate = true;
    // the curtains: built up from the middle out while it rings, hanging, fading upward
    const D = smoothstep(0.2, 0.5, q), F = 1 - smoothstep(0.7, 0.95, q), hue = t / P.hue;
    for (let c = 0; c < NC; c++) {
      const yaw = P.yaw + c * 0.45, cy = Math.cos(yaw), sy = Math.sin(yaw), off = (c - (NC - 1) / 2) * 16 * K;
      for (let s = 0; s <= COL; s++) {
        const u = s / COL, along = (u - 0.5) * 2 * Rf * 0.92 * (1 - 0.08 * c);
        const across = off + P.fold * Rf * 0.28 * Math.sin(TAU * P.freq * u + c * 1.7 + t * 0.011) + 6 * K * Math.sin(TAU * 3.3 * u + t * 0.05 + c);
        const yb = yA + 7 * K * Math.sin(TAU * 1.3 * u + c), hh = P.aurora * (0.75 + 0.25 * Math.sin(TAU * 2.1 * u + c * 2 + t * 0.03));
        const gx = along * cy - across * sy, gz = along * sy + across * cy;
        const vis = smoothstep(0, 0.12, D * 0.62 - Math.abs(u - 0.5));
        const I = 0.05 + F * vis * (0.55 + 0.6 * Math.min(1.2, ring(gx, gz)));
        const ray = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(TAU * u * P.rays + t * 0.07 + c), 3);
        for (let v = 0; v <= ROW; v++) {
          const f = v / ROW, o = c * NV + s * (ROW + 1) + v, lean = f * 8 * K;
          AU.pos[o * 3] = gx - lean * sy; AU.pos[o * 3 + 1] = yb + f * hh; AU.pos[o * 3 + 2] = gz + lean * cy;
          const prof = Math.min(1, f / 0.08 + 0.15) * Math.pow(1 - f, 1.4);
          AU.em[o] = Math.max(0.004, I * prof * ray);
          prism(hue + u * 0.3 + f * 0.25 + c * 0.1, 0.65, 0.6);
          _c.lerp(Acol, (1 - f) * (1 - f) * 0.7);
          setCol(AU.col, o, _c);
        }
      }
    }
    AU.touch(true);
  });
}

// ------------------------------------------------------------------ world seed
function worldseed(d, A, mats, ctx) {
  const P = d.params, K = P.k, n = P.scales, Ls = P.length, Rs = P.girth, Rl = P.lattice, C = P.cycle;
  const group = new THREE.Group(), fx = [];
  const spin = new THREE.Group();
  spin.position.y = ctx.ground(0, 0) + P.hang;
  group.add(spin);
  // its outline: widest a little above the middle, a point at the bottom
  const rv = (v) => Rs * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(clamp(v, 0, 1), 1.25))), 0.7);
  const yv = (v) => (v - 0.5) * Ls;
  const drdy = (v) => (rv(v + 1e-3) - rv(v - 1e-3)) / (2e-3 * Ls);
  // the scales spread evenly over its surface, each at the golden angle from the last
  const T0 = 400, v0 = 0.04, v1 = 0.95, cdf = [0];
  let arc = 0;
  for (let k = 1; k <= T0; k++) {
    const va = v0 + ((k - 1) / T0) * (v1 - v0), vb = v0 + (k / T0) * (v1 - v0);
    const ds = Math.hypot(yv(vb) - yv(va), rv(vb) - rv(va));
    arc += ds;
    cdf.push(cdf[k - 1] + ds * rv((va + vb) / 2));
  }
  const vAt = (f) => {
    const target = f * cdf[T0];
    let lo = 0, hi = T0;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdf[mid] < target) lo = mid; else hi = mid; }
    const w = (target - cdf[lo]) / Math.max(1e-9, cdf[hi] - cdf[lo]);
    return v0 + ((lo + w) / T0) * (v1 - v0);
  };
  const sq = Math.sqrt(n), SC = [];
  const sb = new Builder();
  for (let k = 0; k < n; k++) {
    const v = vAt((k + 0.5) / n), th = k * GOLD, r = rv(v), rp = drdy(v);
    const ct = Math.cos(th), st = Math.sin(th);
    const Tn = V(rp * ct, 1, rp * st).normalize(), Nn = V(ct, -rp, st).normalize(), Sn = new THREE.Vector3().crossVectors(Tn, Nn);
    const w = Math.max(2.5 * K, ((TAU * r) / sq) * 1.3), h = Math.max(3 * K, (arc / sq) * 1.45 * (0.3 + 0.7 * Math.sqrt(r / Rs))), thick = 1.1 * K;
    const hinge = V(ct * r, yv(v), st * r).addScaledVector(Tn, h * 0.42).addScaledVector(Nn, 0.4 * K + thick / 2);
    const s0 = sb.pos.length / 3;
    const pg = new THREE.CylinderGeometry(0.707 * 0.55, 0.707, 1, 4, 1);
    pg.rotateY(Math.PI / 4);
    sb.add(pg, mat(0, -h / 2, 0, 0, 0, 0, w, h, thick), STONE[1 + ((k % 13) % 3)]);
    sb.box(w * 0.92, 0.6 * K, thick * 1.3, mat(0, -h + 0.3 * K, 0), RIM);
    sb.box(w * 0.55, h * 0.6, 0.15 * K, mat(0, -h * 0.55, -thick / 2 - 0.1 * K), A, 0.8);
    SC.push({ s0, s1: sb.pos.length / 3, v, f: k / n, hinge, Tn, Nn, Sn, h, a: -1 });
  }
  const scaleGeo = sb.build(), sp = scaleGeo.attributes.position.array, sbase = Float32Array.from(sp);
  const scales = new THREE.Mesh(scaleGeo, mats.glow);
  scales.frustumCulled = false;
  spin.add(scales);
  // the body under the scales, the stalk it hung from (broken off above), the drop at its tip
  const b = new Builder(), gb = new Builder();
  const prof = [];
  for (let k = 0; k <= 20; k++) { const v = k / 20; prof.push(new THREE.Vector2(rv(v) * 0.86, yv(v))); }
  b.add(new THREE.LatheGeometry(prof, 28), null, STONE[0]);
  b.cyl(1.4 * K, 2.8 * K, 18 * K, 7, mat(0, Ls / 2 + 7 * K, 0), STONE[2]);
  b.cyl(2.1 * K, 2.1 * K, 0.8 * K, 7, mat(0, Ls / 2 + 15.6 * K, 0), RIM);
  spin.add(new THREE.Mesh(b.build(), mats.body));
  const tipY = -Ls / 2 - 3.2 * K;
  gb.ico(1.9 * K, 1, mat(0, tipY, 0), A, PULSE);
  gb.cone(0.6 * K, 2.4 * K, 6, mat(0, -Ls / 2 - 0.9 * K, 0, Math.PI, 0, 0), RIM);
  spin.add(new THREE.Mesh(gb.build(), mats.glow));
  // the seams of light on its body: the two families of spirals the scales lie on
  const surf = (k) => { const s = SC[k], th = k * GOLD, r = rv(s.v) * 0.9; return V(Math.cos(th) * r, yv(s.v), Math.sin(th) * r); };
  const fams = [3, 5, 8, 13, 21, 34].filter((F) => F < n / 3).map((F) => {
    let sum = 0, m = 0;
    for (let k = 0; k + F < n; k++) { sum += surf(k).distanceTo(surf(k + F)); m++; }
    return [F, sum / m];
  }).sort((p, q) => p[1] - q[1]).slice(0, 2).map((p) => p[0]);
  const seamB = new Builder();
  for (const F of fams) for (let k0 = 0; k0 < F; k0++) {
    const pts = [];
    for (let k = k0; k + F < n; k += F) {
      const a = SC[k], c = SC[k + F], tha = k * GOLD, thc = (k + F) * GOLD;
      for (let j = 0; j < 4; j++) {
        const f = j / 4, v = a.v + (c.v - a.v) * f;
        // (around the short way between them)
        let dth = frac((thc - tha) / TAU + 0.5) * TAU - Math.PI;
        const th = tha + dth * f, r = rv(v) * 0.875;
        pts.push(V(Math.cos(th) * r, yv(v), Math.sin(th) * r));
      }
    }
    if (pts.length >= 2) seamB.tube(pts, 0.32 * K, 3, A, 1);
  }
  const seams = lightMesh(seamB.build(), fx, 0.15, { fog: 0.35 });
  spin.add(seams);
  // the drop's glow, seen from far
  const drop = lights(1, A, fx, 0.8);
  drop.pos.set([0, tipY, 0]); drop.sz[0] = 34 * K;
  spin.add(drop.p);
  // the lattice: nodes on a broad spheroid, each joined to its nearest
  const M = P.nodes, NO = [];
  for (let i = 0; i < M; i++) {
    const y = 1 - (2 * (i + 0.5)) / M, rho = Math.sqrt(Math.max(0, 1 - y * y)), ph = i * GOLD;
    const dx = rho * Math.cos(ph), dz = rho * Math.sin(ph);
    const v = clamp((y + 1) / 2, 0.02, 0.98), rr = rv(v) * 0.9, hx = rho > 1e-3 ? dx / rho : 1, hz = rho > 1e-3 ? dz / rho : 0;
    NO.push({ y, L: V(dx * Rl, y * Rl * P.flat, dz * Rl), S: V(hx * rr, yv(v), hz * rr), dir: V(dx, y, dz), ord: (y + 1) / 2, cur: V() });
  }
  const ED = [], seen = new Set();
  for (let i = 0; i < M; i++) {
    const near = [];
    for (let j = 0; j < M; j++) if (j !== i) near.push([NO[i].dir.distanceToSquared(NO[j].dir), j]);
    near.sort((p, q) => p[0] - q[0]);
    for (let k = 0; k < 4; k++) {
      const j = near[k][1], key = i < j ? i * 10000 + j : j * 10000 + i;
      if (seen.has(key)) continue;
      seen.add(key);
      ED.push(NO[i].ord <= NO[j].ord ? [i, j] : [j, i]);
    }
  }
  const NE = ED.length, LD = dyn(NE * 2 * 4, ribbonIndex(NE, 2));
  spin.add(lightMesh(LD.g, fx, 0.7, { fog: 0.3 }));
  const nodes = lights(M, 0xffffff, fx, 1);
  for (let i = 0; i < M; i++) nodes.sz[i] = 5 * K;
  spin.add(nodes.p);
  const Aln = new THREE.Color().setHex(A);
  const hMax = Math.max(...SC.map((s) => s.h)), height = P.hang + Math.max(Ls / 2 + 16.5 * K, Rl * P.flat) + 2 * K;
  const vis = new Float32Array(M);
  return finish({
    group, fx, light: V(0, P.hang + tipY, 0), focus: V(0, P.hang, 0), span: Rl * 0.85, clear: Rs + 12 * K, height,
    solid: { r: Rs + hMax * 0.9, top: P.hang + Ls / 2 + 16.5 * K, low: P.hang - Ls / 2 - 5 * K },
  }, (t) => {
    const q = frac(t / C + P.phase);
    spin.rotation.y = t * P.turn;
    // the scales: open from the tip upward, close from the top down
    let openAvg = 0;
    for (let k = 0; k < n; k++) {
      const s = SC[k];
      const op = ease((q - 0.08 - 0.14 * s.f) / 0.06), cl = ease((q - 0.83 - 0.12 * (1 - s.f)) / 0.05);
      const o = Math.min(op, 1 - cl);
      openAvg += o / n;
      const a = 0.1 + (P.open * (0.85 + 0.15 * (1 - s.f)) - 0.1) * o + 0.04 * o * Math.sin(t * 0.3 + k);
      if (Math.abs(a - s.a) < 1e-4) continue;
      s.a = a;
      const ca = Math.cos(a), sa = Math.sin(a), H = s.hinge, S = s.Sn, T = s.Tn, N = s.Nn;
      for (let v = s.s0 * 3; v < s.s1 * 3; v += 3) {
        const x = sbase[v], y = sbase[v + 1], z = sbase[v + 2];
        const y2 = y * ca + z * sa, z2 = -y * sa + z * ca;
        sp[v] = H.x + S.x * x + T.x * y2 + N.x * z2;
        sp[v + 1] = H.y + S.y * x + T.y * y2 + N.y * z2;
        sp[v + 2] = H.z + S.z * x + T.z * y2 + N.z * z2;
      }
    }
    scaleGeo.attributes.position.needsUpdate = true;
    seams.userData.fx[1] = 0.25 + 0.75 * openAvg;
    // the lattice: out from the body, bottom first; joined; held, a light passing down it; folded back, top first
    const wy = 1 - 2.4 * frac(t / 17) + 0.2, hue = t / P.hue;
    for (let i = 0; i < M; i++) {
      const nd = NO[i];
      const out = ease((q - 0.24 - 0.12 * nd.ord) / 0.08), back = ease((q - 0.74 - 0.08 * (1 - nd.ord)) / 0.06);
      const e = out * (1 - back), ee = 1 - (1 - e) * (1 - e);
      nd.cur.lerpVectors(nd.S, nd.L, ee);
      nd.cur.y += Math.sin(t * 0.21 + i) * 1.2 * K * e;
      vis[i] = e;
      nodes.pos[i * 3] = nd.cur.x; nodes.pos[i * 3 + 1] = nd.cur.y; nodes.pos[i * 3 + 2] = nd.cur.z;
      nd.wave = Math.exp(-(((nd.y - wy) / 0.16) ** 2)) * smoothstep(0.4, 0.5, q) * (1 - smoothstep(0.7, 0.74, q));
      nodes.al[i] = e > 0.02 ? 0.15 + 0.6 * e + 0.9 * nd.wave : 0;
      nodes.sz[i] = (4 + 4 * nd.wave) * K;
    }
    nodes.touch();
    nodes.m.uniforms.uColor.value.copy(prism(hue + 0.08, 0.45, 0.8));
    const undraw = 1 - clamp((q - 0.72) / 0.03, 0, 1);
    for (let k = 0; k < NE; k++) {
      const [i, j] = ED[k], a = NO[i], c = NO[j];
      const g = Math.min(clamp((q - 0.32 - 0.12 * c.ord) / 0.04, 0, 1), undraw) * Math.min(vis[i], vis[j]);
      const ex = a.cur.x + (c.cur.x - a.cur.x) * g, ey = a.cur.y + (c.cur.y - a.cur.y) * g, ez = a.cur.z + (c.cur.z - a.cur.z) * g;
      writeLine(LD.pos, k * 2, a.cur.x, a.cur.y, a.cur.z, ex, ey, ez, 2, 0.55 * K);
      const ea = g > 0 ? 0.08 + 0.62 * g * (1 + 1.4 * a.wave) : 0.004, ec = g > 0 ? 0.08 + 0.62 * g * (1 + 1.4 * c.wave) : 0.004;
      prism(hue + a.y * 0.3); _c.lerp(Aln, 0.25);
      for (let v = 0; v < 4; v++) { LD.em[k * 8 + v] = ea; setCol(LD.col, k * 8 + v, _c); }
      prism(hue + c.y * 0.3); _c.lerp(Aln, 0.25);
      for (let v = 4; v < 8; v++) { LD.em[k * 8 + v] = ec; setCol(LD.col, k * 8 + v, _c); }
    }
    LD.touch(true);
  });
}

const mins = (s) => Math.max(4, Math.round(s / 60));

export const SET = {
  strandtower: {
    code: 'RLD', cls: 'Tower of strands', nouns: ['Tower', 'Throat', 'Strands', 'Waist', 'Spindle', 'Loom'], place: 'any',
    kin: ['halo', 'helicon', 'spire'], voice: ['whale', 'glass'],
    params(R, size) {
      const k = Math.min(1.12, Math.sqrt(size)), grand = size > 1.2;
      const P = {
        k, n: R.pick([24, 30, 36, 42]) + (grand ? 6 : 0), base: R.range(44, 58) * k, topR: R.range(0.78, 1.15), height: R.range(175, 215) * k,
        cycle: R.range(240, 400), close: R.range(0.9, 0.96), rest: R.range(0.12, 0.35), hue: R.range(50, 90), phase: R(),
      };
      P.text = `${P.n} sockets of stone in a ring ${Math.round(P.base * 2)} meters across, and ${Math.round(P.height)} meters over them a ring of light with nothing holding it up; between them ${P.n * 2} strands of light in two crossing families, one of them in every color by turns. About every ${numw(mins(P.cycle))} minutes the strands are drawn up one by one, the upper ring turns until they pinch to a burning waist, and then it all unwinds and goes dark.`;
      return P;
    },
    build: strandtower,
  },
  glassneedles: {
    code: 'NDL', cls: 'Glass needles', nouns: ['Needles', 'Glasswood', 'Stand', 'Chorus', 'Spires', 'Shiver'], place: 'any',
    kin: ['spire', 'loom', 'choir'], voice: ['glass', 'breath'],
    params(R, size) {
      const k = Math.min(1.12, Math.sqrt(size)), grand = size > 1.2;
      const P = {
        k, n: R.int(95, 140) + (grand ? 30 : 0), radius: R.range(70, 92) * k, tall: R.range(115, 150) * k, turn: R.range(0, TAU),
        cycle: R.range(280, 440), every: R.range(9, 15), speed: R.range(22, 34), decay: R.range(0.35, 0.6), phase: R(),
        curtains: R.int(2, 3), aurora: R.range(40, 60) * k, yaw: R.range(0, TAU), fold: R.range(0.6, 1.2), freq: R.range(0.8, 1.8), rays: R.int(9, 17), hue: R.range(60, 110),
      };
      P.text = `${P.n} needles of glass stand in a golden spiral ${Math.round(P.radius * 2)} meters across, the tallest ${Math.round(P.tall)} meters. About every ${numw(mins(P.cycle))} minutes waves of ringing cross them, one every ${Math.round(P.every)} seconds, each from somewhere else, and each needle hums in bands of light; over them the ringing draws ${numw(P.curtains)} curtains of an aurora that hang a while and fade.`;
      return P;
    },
    build: glassneedles,
  },
  worldseed: {
    code: 'KRN', cls: 'Opening seed', nouns: ['Seed', 'Kernel', 'Husk', 'Lattice', 'Germ', 'Unfolding'], place: 'any', floats: true,
    kin: ['seedpod', 'geode', 'armillary'], voice: ['whale', 'fm'],
    params(R, size) {
      const k = Math.min(1.12, Math.sqrt(size)), grand = size > 1.2;
      const P = {
        k, scales: grand ? 144 : R.pick([55, 89, 89, 144]), length: R.range(52, 66) * k, girth: R.range(17, 22) * k, hang: R.range(128, 150) * k,
        lattice: R.range(80, 96) * k, flat: R.range(0.5, 0.62), nodes: R.pick([89, 144, 144, 233]), cycle: R.range(260, 420), open: R.range(1.2, 1.6),
        turn: R.range(0.006, 0.014) * R.pick([-1, 1]), hue: R.range(50, 90), phase: R(),
      };
      P.text = `A seed ${Math.round(P.length)} meters long hangs ${Math.round(P.hang)} meters up with nothing holding it, closed in ${P.scales} scales set at the golden angle. About every ${numw(mins(P.cycle))} minutes its scales open from the tip upward and a lattice of ${P.nodes} lights, ${Math.round(P.lattice * 2)} meters across, unfolds out of it, holds a while, and folds back in before the seed closes.`;
      return P;
    },
    build: worldseed,
  },
};
