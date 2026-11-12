import * as THREE from 'three';
import { Builder, mat, roughen } from '../../render/build.js';
import { worldMaterial, glowMaterial, pointsMaterial } from '../../render/materials.js';
import { LAYER_FX } from '../../render/pipeline.js';
import { rng, TAU, clamp, smoothstep } from '../../core/math.js';
import { mixHex } from '../../core/palette.js';
import { STONE, RIM, PULSE, beam } from '../parts.js';

// The Great Lake's own families of the high tiers (place 'greatlake', each with its tier):
// all of them stand in the open water, the origin on its surface (y = 0). The water is
// drawn solid, so what lies "under" it is laid a hand's breadth over it, as light.
//   tidemoon    (EPIC) a moon of stone circling over the lake with nothing holding it; the
//               water rises to it in two mounds of light, one under it and one on the far
//               side under nothing, and a ring of gauge posts marks the tide as it passes;
//               the lower it comes the higher the tide, by the cube of its nearness
//   dropper     (EPIC) a water tower of stone on a pier lets fall two streams of drops,
//               each through a ring wired to the other's basin: the charge builds by
//               itself, the streams fan apart as it grows, until a spark leaps between the
//               basins' spheres, and it begins again (Kelvin's thunderstorm)
//   lockflight  (LEGENDARY) a staircase of locks climbing out of the lake on arches to
//               nothing, a lamp at its end: a boat is let in at its foot and lifted chamber
//               by chamber, each filling in gold as the one above it falls; at the top it
//               turns and waits, then is let down, the chambers pouring gold into the lake
//   upwelling   (MYTHIC) a well-head of stone in the open lake and a ring of tall stone
//               rain-gauges; every few minutes the lake gathers and rises out of the well
//               in a column of light two hundred meters high, which opens and falls in
//               arcs onto the ring; in its rain hangs a whole round rainbow and a fainter
//               second, turned to whoever watches; the gauges fill in every color, and drain

const VIOLET = 0xb48cff, GOLD = 0xffd27a;
const TIMBER = [0x2c2622, 0x3d3530];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Zax = new THREE.Vector3(0, 0, 1), Yax = new THREE.Vector3(0, 1, 0);
const frac = (x) => x - Math.floor(x);
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const hash = (n) => frac(Math.sin(n * 12.9898 + 4.1414) * 43758.5453);
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const numw = (n) => NUMW[n] ?? String(n);
const Cap = (s) => s[0].toUpperCase() + s.slice(1);
const mins = (s) => Math.max(3, Math.round(s / 60));
const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3();
const prism = (h, s = 0.7, l = 0.62) => _c.setHSL(frac(h), s, l);
const setCol = (col, v, c) => { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; };
// one box of a row of boxes (36 vertices each) set to a color and a brightness
function setBox(col, em, i, c, e) {
  for (let v = i * 36; v < (i + 1) * 36; v++) { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; em[v] = Math.max(0.004, e); }
}

// light drawn after the fog, faded in with the artifact; its entry's g is a gain set per frame
function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.5, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  const f = { m, o: opacity, g: 1 };
  fx.push(f);
  mesh.userData.fx = f;
  return mesh;
}
// soft points of light, placed by the caller (sz: meters across)
function lights(n, color, fx, opacity = 1) {
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
// a geometry of light rewritten every frame (nv vertices, optionally indexed)
function dyn(nv, index = null) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1), em = new Float32Array(nv).fill(0.004);
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
// paths of light as two crossed strips, four vertices a node: the index for paths of these node counts
function pathIndex(counts) {
  const idx = [];
  let base = 0;
  for (const n of counts) {
    for (let j = 0; j < n - 1; j++) {
      const b = (base + j) * 4, c = b + 4;
      idx.push(b, b + 1, c + 1, b, c + 1, c, b + 2, b + 3, c + 3, b + 2, c + 3, c + 2);
    }
    base += n;
  }
  return idx;
}
// node o of such paths: at (px, py, pz), running along (tx, ty, tz), half-width w
function node4(pos, o, px, py, pz, tx, ty, tz, w) {
  let s1x = -tz, s1z = tx;
  let l = Math.hypot(s1x, s1z);
  if (l < 1e-6) { s1x = 1; s1z = 0; l = 1; }
  s1x /= l; s1z /= l;
  const tl = Math.hypot(tx, ty, tz) || 1, ux = tx / tl, uy = ty / tl, uz = tz / tl;
  const s2x = uy * s1z, s2y = uz * s1x - ux * s1z, s2z = -uy * s1x;
  o *= 12;
  pos[o] = px + s1x * w; pos[o + 1] = py; pos[o + 2] = pz + s1z * w;
  pos[o + 3] = px - s1x * w; pos[o + 4] = py; pos[o + 5] = pz - s1z * w;
  pos[o + 6] = px + s2x * w; pos[o + 7] = py + s2y * w; pos[o + 8] = pz + s2z * w;
  pos[o + 9] = px - s2x * w; pos[o + 10] = py - s2y * w; pos[o + 11] = pz - s2z * w;
}
function finish(out, update) {
  const res = {
    ...out,
    mats: [...out.fx.map((f) => f.m), ...(out.own || [])],
    update(t, beat, c) {
      if (update) update(t, beat, c);
      const k = (c.reveal ?? 1) * (0.8 + (c.pulse ?? 1) * 0.25);
      for (const f of out.fx) f.m.uniforms.uOpacity.value = f.o * f.g * k;
    },
  };
  // (so that nothing is ever drawn where it was built rather than where it belongs)
  res.update(0, 0, { pulse: 1, reveal: 0, near: 0, shipLocal: V(0, 9999, 9999) });
  return res;
}
// a solid of revolution seen from both sides (profile [r, y] pairs)
function lathe(b, prof, seg, M, color) {
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  b.add(new THREE.LatheGeometry(pts, seg), M, color, 0, { flat: true });
  const m2 = M ? M.clone().multiply(new THREE.Matrix4().makeScale(-1, 1, 1)) : new THREE.Matrix4().makeScale(-1, 1, 1);
  b.add(new THREE.LatheGeometry(pts, seg), m2, color, 0, { flat: true });
}

// ================================================================== tide moon
function tidemoon(d, A, mats, ctx) {
  const P = d.params, k = P.k, R = rng(d.seed[5]), fx = [];
  const R0 = P.radius, n = P.posts, Ab = P.amp, sig2 = 2 * (0.3 * R0) ** 2, ro = P.orbit * R0;
  const H0 = P.alt, Hd = P.nod * H0, rm = P.moon, M = P.marks;
  const group = new THREE.Group();
  const b = new Builder(), gb = new Builder(), mb = new Builder(), edge = mixHex(STONE[3], RIM, 0.3);
  // the gauge posts in their ring, standing in the water, marks up their inner faces
  const Rg = R0 + 1.1 * k, top = 0.82 * Ab, Hp = top + 2.6 * k, markY = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a), x = ca * Rg, z = sa * Rg;
    b.box(1.7 * k, Hp + 3, 1.7 * k, mat(x, (Hp - 3) / 2, z, 0, -a, 0), STONE[1 + (i % 3)]);
    b.box(2.3 * k, 0.6 * k, 2.3 * k, mat(x, Hp + 0.3 * k, z, 0, -a, 0), edge);
    b.box(2.1 * k, 0.35 * k, 2.1 * k, mat(x, 0.25 * k, z, 0, -a, 0), STONE[3]);
    if (i % 4 === 0) gb.ico(0.6 * k, 0, mat(x, Hp + 1.2 * k, z), A, PULSE);
    const rf = Rg - 0.85 * k - 0.1 * k;
    for (let j = 0; j < M; j++) {
      const y = ((j + 0.5) / M) * top;
      mb.box(0.2 * k, 0.24 * k, (j % 2 ? 1.25 : 0.8) * k, mat(ca * rf, y, sa * rf, 0, -a, 0), 0xffffff, 0.05);
      if (i === 0) markY.push(y);
    }
  }
  // the anchor in the middle, between the mounds: a low rock and a violet lamp on a post
  b.cyl(4.2 * k, 5 * k, 4.5 * k, 10, mat(0, -0.25 * k, 0), STONE[0]);
  b.cyl(4.45 * k, 4.45 * k, 0.4 * k, 10, mat(0, 2 * k, 0), edge);
  b.cyl(1.1 * k, 1.5 * k, 3 * k, 8, mat(0, 3.5 * k, 0), STONE[2]);
  gb.ico(1 * k, 1, mat(0, 5.8 * k, 0), VIOLET, PULSE);
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(gb.build(), mats.glow));
  const mg = mb.build(), mcol = mg.attributes.color.array, mem = mg.attributes.emissive.array;
  group.add(lightMesh(mg, fx, 1));
  // the moon: rough dark stone, pale where the sun would be, keeping one face to the middle
  const mgeo = new THREE.IcosahedronGeometry(rm, 2);
  roughen(mgeo, 0.14 * rm, d.seed[6] % 997);
  const moonB = new Builder();
  moonB.add(mgeo, null, (x, y, z) => (Math.sin(x * 0.5 / k + 1) + Math.sin(y * 0.6 / k + 2) + Math.sin(z * 0.55 / k) > 1.1 ? STONE[0] : STONE[3]), 0, { flat: true });
  const moon = new THREE.Mesh(moonB.build(), mats.body);
  group.add(moon);
  const sun = V(Math.cos(P.sun) * 0.93, 0.36, Math.sin(P.sun) * 0.93).normalize();
  const hb = new Builder(), rl = rm * 1.05;
  hb.add(new THREE.SphereGeometry(rl, 28, 14, 0, Math.PI), null, mixHex(A, 0xffffff, 0.6), (x, y, z) => 0.06 + 0.7 * Math.pow(Math.max(0, z / rl), 0.6));
  const lit = lightMesh(hb.build(), fx, 0.8, { fresnel: 0.2 });
  lit.quaternion.setFromUnitVectors(Zax, sun);
  group.add(lit);
  const halo = lights(1, mixHex(A, 0xffffff, 0.5), fx, 0.45);
  halo.sz[0] = 5.5 * rm;
  group.add(halo.p);
  // the water of light: a disc to the posts, lifted in two mounds; a skirt down at its edge
  const NR = 30, NS = 96, idx = [];
  for (let j = 0; j <= NR; j++) for (let s = 0; s < NS; s++) {
    const a = j * NS + s, b2 = j * NS + ((s + 1) % NS), c2 = a + NS, d2 = b2 + NS;
    idx.push(a, c2, d2, a, d2, b2);
  }
  const W = dyn((NR + 2) * NS, idx);
  const CS = Array.from({ length: NS }, (_, s) => [Math.cos((s / NS) * TAU), Math.sin((s / NS) * TAU)]);
  const RR = Array.from({ length: NR + 2 }, (_, j) => R0 * Math.min(1, j / NR));
  group.add(lightMesh(W.g, fx, 0.75, { fog: 0.45 }));
  // spray drawn up off the mound under the moon toward it; a little off the other, toward nothing
  const NP = 150, SP = lights(NP, mixHex(VIOLET, 0xffffff, 0.35), fx, 0.9);
  const SD = Array.from({ length: NP }, (_, i) => ({ far: i % 3 === 2, a: R() * TAU, r: Math.sqrt(R()) * 0.3 * R0, ph: R(), sp: 0.05 + R() * 0.06 }));
  for (let i = 0; i < NP; i++) SP.sz[i] = (0.9 + R() * 0.9) * k;
  group.add(SP.p);
  const cA = new THREE.Color(mixHex(A, 0xffffff, 0.2)), cV = new THREE.Color(VIOLET), cD = new THREE.Color(A);
  const height = H0 + Hd + rm + 1;
  return finish({
    group, fx, light: V(0, top * 0.6, 0), focus: V(0, H0 * 0.4, 0), span: Rg + 1.5 * k, clear: Math.min(100, Rg + 8 * k), height,
    solid: { r: Rg + 1.2 * k, top: Hp + 1.5 * k, low: 0 },
  }, (t) => {
    const psi = P.ph + (TAU * t) / P.period, hm = H0 + Hd * Math.sin((TAU * t) / (P.period * P.beat) + P.ph2);
    const amp = (Ab * Math.pow(H0 / hm, 3)) / 1.3;
    const mx = Math.cos(psi) * ro, mz = Math.sin(psi) * ro;
    moon.position.set(mx, hm, mz);
    moon.rotation.y = -psi;
    lit.position.set(mx, hm, mz);
    halo.pos[0] = mx; halo.pos[1] = hm; halo.pos[2] = mz; halo.al[0] = 0.6; halo.touch();
    const G = (x, z) => Math.exp(-((x - mx) ** 2 + (z - mz) ** 2) / sig2) + Math.exp(-((x + mx) ** 2 + (z + mz) ** 2) / sig2);
    // the disc
    for (let j = 0; j < NR + 2; j++) {
      const r = RR[j], skirt = j === NR + 1, line = 0.07 * Math.pow(0.5 + 0.5 * Math.sin((r * 0.4) / k - t * 0.7), 10);
      const fade = skirt ? 0.25 : 1;
      for (let s = 0; s < NS; s++) {
        const x = r * CS[s][0], z = r * CS[s][1], g = G(x, z), v = j * NS + s;
        const y = skirt ? 0.12 : 0.25 + amp * g + 0.12 * k * Math.sin((r * 0.4) / k - t * 0.7);
        W.pos[v * 3] = x; W.pos[v * 3 + 1] = y; W.pos[v * 3 + 2] = z;
        const hh = clamp((amp * g) / Ab, 0, 1.5);
        W.em[v] = Math.max(0.004, fade * (0.05 + 0.75 * Math.pow(hh, 1.5) + line));
        _c2.copy(cA).lerp(cV, clamp(hh * 1.1, 0, 1));
        setCol(W.col, v, _c2);
      }
    }
    W.touch(true);
    // the posts read it
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, hp = 0.25 + amp * G(Math.cos(a) * Rg, Math.sin(a) * Rg);
      for (let j = 0; j < M; j++) {
        const on = markY[j] < hp, edgeL = on && markY[j + 1] === undefined ? 1 : on && markY[j + 1] >= hp ? 1 : 0;
        setBox(mcol, mem, i * M + j, on ? cV : cD, on ? 0.75 + 0.6 * edgeL : 0.06);
      }
    }
    mg.attributes.color.needsUpdate = true;
    mg.attributes.emissive.needsUpdate = true;
    // the spray
    const peak = 0.25 + amp * (1 + Math.exp(-(4 * ro * ro) / sig2)), my = hm - rm * 0.9;
    for (let i = 0; i < NP; i++) {
      const q = SD[i], u = frac(t * q.sp + q.ph), jx = Math.cos(q.a) * q.r, jz = Math.sin(q.a) * q.r;
      let x, y, z, al;
      if (!q.far) {
        const e = Math.pow(u, 1.2);
        x = mx + jx * (1 - e); z = mz + jz * (1 - e); y = peak * 0.9 + (my - peak * 0.9) * e;
        al = Math.pow(Math.sin(Math.PI * u), 1.5) * 0.8 * clamp(amp / Ab, 0.3, 1.4);
      } else {
        x = -mx + jx; z = -mz + jz; y = peak * 0.85 + u * 10 * k;
        al = Math.sin(Math.PI * u) * 0.45;
      }
      SP.pos[i * 3] = x; SP.pos[i * 3 + 1] = y; SP.pos[i * 3 + 2] = z; SP.al[i] = al;
    }
    SP.touch();
  });
}

// ================================================================== dropper (Kelvin's thunderstorm)
function dropper(d, A, mats, ctx) {
  const P = d.params, k = P.k, R = rng(d.seed[5]), fx = [];
  const inner = new THREE.Group();
  inner.rotation.y = P.bearing;
  const out3 = (v) => v.clone().applyAxisAngle(Yax, P.bearing);
  const yN = P.tall, s2 = P.sep / 2, yR = P.ringY, yB = 8 * k, g2 = P.gap / 2, zf = 7.5 * k, rs = 1.3 * k, ySp = yB + 6 * k;
  const Rt = 6 * k, ht = 5 * k, Rp = s2 + 6 * k, top0 = 1.4 * k, step = 2.6 * k;
  const b = new Builder(), gb = new Builder(), edge = mixHex(STONE[3], RIM, 0.3), wire = mixHex(STONE[3], RIM, 0.5);
  // the pier: an octagon in the lake, a step on it
  b.cyl(Rp, Rp + 1 * k, top0 + 3, 8, mat(0, (top0 - 3) / 2, 0, 0, Math.PI / 8, 0), STONE[0]);
  b.cyl(Rp + 0.15 * k, Rp + 0.15 * k, 0.4 * k, 8, mat(0, top0 - 0.2 * k, 0, 0, Math.PI / 8, 0), edge);
  b.cyl(5.5 * k, 6 * k, step - top0 + 0.1, 8, mat(0, (step + top0) / 2, 0, 0, Math.PI / 8, 0), STONE[1]);
  // the tower and its tank
  const rAt = (y) => 3.2 * k + (2.2 * k - 3.2 * k) * clamp((y - step) / (yN - step), 0, 1);
  b.cyl(2.2 * k, 3.2 * k, yN - step, 12, mat(0, (yN + step) / 2, 0), STONE[2]);
  for (let y = step + 7 * k; y < yN - 4 * k; y += 7 * k) {
    b.cyl(rAt(y) + 0.25 * k, rAt(y) + 0.25 * k, 0.5 * k, 12, mat(0, y, 0), edge);
    for (const q of [-1, 1]) gb.box(0.5 * k, 0.9 * k, 0.5 * k, mat(0, y + 2.8 * k, q * (rAt(y + 2.8 * k) + 0.1 * k)), A, 1);
  }
  b.cyl(Rt * 0.9, 2.3 * k, 3 * k, 16, mat(0, yN - 1.5 * k, 0), STONE[1]);
  b.cyl(Rt, Rt * 0.94, ht, 20, mat(0, yN + ht / 2, 0), STONE[2]);
  b.cyl(Rt + 0.2 * k, Rt + 0.2 * k, 0.5 * k, 20, mat(0, yN + ht, 0), edge);
  b.cyl(Rt + 0.15 * k, Rt + 0.15 * k, 0.4 * k, 20, mat(0, yN + 0.3 * k, 0), edge);
  b.cone(Rt * 1.06, 3.2 * k, 20, mat(0, yN + ht + 1.85 * k, 0), STONE[3]);
  b.cyl(0.7 * k, 0.9 * k, 1.6 * k, 8, mat(0, yN + ht + 3.6 * k, 0), STONE[3]);
  gb.ico(0.9 * k, 1, mat(0, yN + ht + 5 * k, 0), A, PULSE);
  const yE = yN - 0.7 * k, yW = yB + 0.8 * k;
  const sideB = [new Builder(), new Builder()];
  for (const q of [-1, 1]) {
    const lb = sideB[q > 0 ? 1 : 0], col = q < 0 ? mixHex(A, 0xffffff, 0.15) : VIOLET;
    // the spout and its nozzle
    const xa = q * Rt * 0.95, xc = q * s2;
    b.cyl(0.6 * k, 0.6 * k, Math.abs(xc - xa) + 0.6 * k, 8, mat((xa + xc) / 2, yN + 1 * k, 0, 0, 0, Math.PI / 2), wire);
    b.cone(0.9 * k, 1.6 * k, 8, mat(xc, yN + 0.2 * k, 0, Math.PI, 0, 0), STONE[3]);
    // the ring the stream falls through, held out from a slender post standing behind it
    b.torus(2.4 * k, 0.45 * k, 6, 28, mat(xc, yR, 0, Math.PI / 2, 0, 0), STONE[3]);
    b.cyl(0.45 * k, 0.65 * k, yR + 0.6 * k - top0, 8, mat(xc, (yR + 0.6 * k + top0) / 2, -4 * k), STONE[2]);
    b.box(1.4 * k, 1.4 * k, 1.4 * k, mat(xc, yR + 0.9 * k, -4 * k), edge);
    beam(b, V(xc, yR, -3.6 * k), V(xc, yR, -2.55 * k), 0.5 * k, wire);
    lb.torus(2.4 * k, 0.75 * k, 6, 28, mat(xc, yR, 0, Math.PI / 2, 0, 0), col, 0.8);
    // the basin it falls into, on a pillar, and its sphere on an arm toward the other's
    b.cyl(1 * k, 1.3 * k, yB - 1.2 * k - top0, 8, mat(xc, (yB - 1.2 * k + top0) / 2, 0), STONE[1]);
    b.cyl(3 * k, 2 * k, 2.4 * k, 16, mat(xc, yB, 0), STONE[2], 0, true);
    b.cyl(2.8 * k, 1.85 * k, 2.3 * k, 16, mat(xc, yB + 0.05 * k, 0, 0, 0, 0, -1, 1, 1), STONE[1], 0, true);
    b.add(new THREE.CircleGeometry(2 * k, 16), mat(xc, yB - 1.1 * k, 0, -Math.PI / 2, 0, 0), STONE[0]);
    lb.add(new THREE.CircleGeometry(2.55 * k, 20), mat(xc, yW, 0, -Math.PI / 2, 0, 0), col, 0.6);
    lb.torus(3 * k, 0.28 * k, 4, 32, mat(xc, yB + 1.2 * k, 0, Math.PI / 2, 0, 0), col, 1);
    const sx = q * g2;
    beam(b, V(q * (s2 - 1.6 * k), yB + 1 * k, 1.2 * k), V(sx + q * rs * 0.6, ySp - 0.4 * k, zf), 0.5 * k, wire);
    b.ico(rs, 1, mat(sx, ySp, zf), RIM);
    lb.ico(rs * 1.3, 1, mat(sx, ySp, zf), col, 1);
    // the wire from this ring across to the other basin: one passes before the tower, one behind
    const wa = V(q * (s2 - 2.6 * k), yR - 0.4 * k, 0), wc = V(-q * (s2 - 2.4 * k), yB + 1.3 * k, 0), pts = [];
    for (let i = 0; i <= 18; i++) {
      const u = i / 18, bow = 4 * u * (1 - u);
      pts.push(V(wa.x + (wc.x - wa.x) * u, wa.y + (wc.y - wa.y) * u - bow * 1.5 * k, q * 3.8 * k * bow));
    }
    b.tube(pts, 0.14 * k, 4, wire);
  }
  inner.add(new THREE.Mesh(b.build(), mats.body));
  inner.add(new THREE.Mesh(gb.build(), mats.glow));
  const side = sideB.map((lb) => lightMesh(lb.build(), fx, 0.9, { fresnel: 0.35 }));
  inner.add(...side);
  // the streams of drops
  const ND = P.drops, L = yE - yW, Tf = Math.sqrt((2 * L) / 9.8);
  const pale = new THREE.Color(0xdde8ff), sideC = [new THREE.Color(A), new THREE.Color(VIOLET)];
  const streams = [-1, 1].map((q, si) => {
    const S = lights(ND, 0xffffff, fx, 0.85);
    const D = Array.from({ length: ND }, (_, i) => {
      const th = (R() - 0.5) * 2.2;
      return { ph: i / ND + R() * 0.01, dx: q * (0.55 + 0.45 * Math.cos(th)), dz: Math.sin(th) * 0.9, m: 0.4 + R() * 0.6 };
    });
    for (let i = 0; i < ND; i++) S.sz[i] = (0.5 + R() * 0.35) * k;
    inner.add(S.p);
    return { S, D, q, c: sideC[si] };
  });
  // the spark: one bolt and three branches, re-struck
  const NB = 18, NBR = 3, NBN = 7, SPK = dyn((NB + NBR * NBN) * 4, pathIndex([NB, ...Array(NBR).fill(NBN)]));
  const spark = lightMesh(SPK.g, fx, 1, { fog: 0.35 });
  spark.material.uniforms.uTint.value.setHex(mixHex(VIOLET, 0xffffff, 0.55));
  inner.add(spark);
  const flash = lights(2, mixHex(VIOLET, 0xffffff, 0.5), fx, 1);
  flash.pos.set([0, ySp, zf, 0, 0.6, zf]);
  flash.sz[0] = 60 * k; flash.sz[1] = 34 * k;
  const corona = lights(28, mixHex(VIOLET, 0xffffff, 0.6), fx, 1);
  inner.add(flash.p, corona.p);
  const group = new THREE.Group();
  group.add(inner);
  const Tc = P.period, q0 = 0.035, path = new Float32Array(NB * 3), br = new Float32Array(NBN * 3);
  const height = yN + ht + 6 * k;
  const writeBolt = (pts, nodes, at, w, e) => {
    for (let j = 0; j < nodes; j++) {
      const a = Math.max(0, j - 1), c = Math.min(nodes - 1, j + 1);
      node4(SPK.pos, at + j, pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2], pts[c * 3] - pts[a * 3], pts[c * 3 + 1] - pts[a * 3 + 1], pts[c * 3 + 2] - pts[a * 3 + 2], w);
      for (let v = 0; v < 4; v++) SPK.em[(at + j) * 4 + v] = e;
    }
  };
  return finish({
    group, fx, light: out3(V(0, ySp, zf)), focus: V(0, yN * 0.45, 0), span: Rp + 1 * k, clear: Math.min(100, Rp + 8 * k), height,
    solid: { r: Rp, top: yN + ht + 4 * k, low: 0 },
  }, (t) => {
    const w = t / Tc + P.phase, u = frac(w), jn = Math.floor(w), ts = u * Tc;
    const q = Math.exp((1 - u) * Math.log(q0));
    // the drops, flung wider as the charge grows
    for (const st of streams) {
      const { S, D } = st;
      for (let i = 0; i < ND; i++) {
        const o = D[i], tau = frac(t / Tf + o.ph), f = tau * tau, dev = P.spread * q * q * Math.pow(tau, 1.5) * o.m;
        S.pos[i * 3] = st.q * s2 + o.dx * dev; S.pos[i * 3 + 1] = yE - L * f; S.pos[i * 3 + 2] = o.dz * dev;
        S.al[i] = tau < 0.97 ? 0.8 : 0;
      }
      S.touch();
      S.m.uniforms.uColor.value.copy(pale).lerp(st.c, clamp(q * 1.2, 0, 1));
    }
    // the glow of the charge on each side; the flash after a strike
    const fl = ts < 1.2 ? Math.exp(-ts / 0.18) : 0;
    for (const m of side) m.userData.fx.g = 0.12 + 0.88 * q + 0.8 * fl;
    flash.al[0] = 1.2 * fl; flash.al[1] = 0.6 * fl; flash.touch();
    // the corona as it nears the strike
    const cor = smoothstep(0.55, 1, q), fk = Math.floor(t * 14);
    for (let i = 0; i < 28; i++) {
      const sgn = i < 14 ? -1 : 1, h1 = hash(fk * 7.3 + i), h2 = hash(fk * 3.1 + i * 1.7), h3 = hash(fk * 1.9 + i * 2.3);
      const th = h1 * TAU, ph = Math.acos(2 * h2 - 1), r = rs * (1.05 + 0.6 * h3);
      corona.pos[i * 3] = sgn * g2 + Math.sin(ph) * Math.cos(th) * r;
      corona.pos[i * 3 + 1] = ySp + Math.cos(ph) * r;
      corona.pos[i * 3 + 2] = zf + Math.sin(ph) * Math.sin(th) * r;
      corona.sz[i] = (0.6 + h3) * k;
      corona.al[i] = cor * (h1 > 0.45 ? 0.9 : 0.25);
    }
    corona.touch();
    // the bolt: three strokes in the first moments after the strike, each its own way
    const on = ts < 0.42, sub = Math.min(2, Math.floor(ts / 0.13)), key = jn * 17.13 + sub * 3.71;
    const e = on ? 1.6 * (0.55 + 0.45 * hash(Math.floor(ts * 45) + jn)) * Math.pow(1 - ts / 0.42, 0.5) : 0.004;
    const x0 = -g2 + rs * 0.9, x1 = g2 - rs * 0.9;
    let oy = 0, oz = 0;
    for (let j = 0; j < NB; j++) {
      const uu = j / (NB - 1), pin = Math.pow(Math.sin(Math.PI * uu), 0.6);
      oy = oy * 0.55 + (hash(key + j * 1.37) - 0.5) * 1.8 * k;
      oz = oz * 0.55 + (hash(key + j * 2.11 + 9) - 0.5) * 1.8 * k;
      path[j * 3] = x0 + (x1 - x0) * uu; path[j * 3 + 1] = ySp + (oy + 0.9 * k * Math.sin(Math.PI * uu)) * pin; path[j * 3 + 2] = zf + oz * pin;
    }
    writeBolt(path, NB, 0, on ? 0.22 * k : 0.001, e);
    for (let r = 0; r < NBR; r++) {
      const from = 3 + Math.floor(hash(key + r * 5.3) * (NB - 6)), bx = path[from * 3], by = path[from * 3 + 1], bz = path[from * 3 + 2];
      const dy = -(1 + 2.5 * hash(key + r * 7.7)) * k, dz = (hash(key + r * 4.1) - 0.5) * 4 * k, dx = (hash(key + r * 2.9) - 0.5) * 2 * k;
      for (let j = 0; j < NBN; j++) {
        const uu = j / (NBN - 1), jit = j > 0 ? (hash(key + r * 11 + j) - 0.5) * 0.7 * k : 0;
        br[j * 3] = bx + dx * uu + jit; br[j * 3 + 1] = by + dy * uu; br[j * 3 + 2] = bz + dz * uu - jit;
      }
      writeBolt(br, NBN, NB + r * NBN, on ? 0.12 * k : 0.001, on ? e * 0.6 : 0.004);
    }
    SPK.touch();
  });
}

// ================================================================== lock flight
function lockflight(d, A, mats, ctx) {
  const P = d.params, k = P.k, fx = [], own = [];
  const N = P.n, h = P.rise, D = 3 * k, fb = 1.2 * k, tw = 1.8 * k, tg = 2.4 * k, Wc = P.width, Lc = P.chamber, Lp = P.pound, W2 = Wc / 2;
  const Ltot = N * (Lc + tg) + tg + Lp + 2.2 * k, x0 = -Ltot / 2 + tg / 2, base = -3;
  const xg = (g) => x0 + g * (Lc + tg);
  const yF = (i) => i * h - D, yWt = (i) => (i + 1) * h + fb;
  const xpA = xg(N) + tg / 2, xpB = xpA + Lp, xEnd = xpB + 2.2 * k;
  const yPF = N * h - D, yPW = N * h + fb, Wt = Wc + 2 * tw;
  const inner = new THREE.Group();
  inner.rotation.y = P.bearing;
  const out3 = (v) => v.clone().applyAxisAngle(Yax, P.bearing);
  const b = new Builder(), edge = mixHex(STONE[3], RIM, 0.25), lb = new Builder();
  // a wall of masonry under a trough, from the lake up, an arch through it if it is high enough
  const spandrel = (xa, xb, top, color) => {
    if (top - base < 1) return;
    const sh = new THREE.Shape();
    sh.moveTo(xa, base); sh.lineTo(xb, base); sh.lineTo(xb, top); sh.lineTo(xa, top); sh.lineTo(xa, base);
    const rA = Math.min((xb - xa - 1.6 * k) / 2, top - 1.4 * k - 0.5);
    if (rA > 2 * k) {
      const xm = (xa + xb) / 2, yc = top - 1.4 * k - rA, hole = new THREE.Path();
      hole.moveTo(xm - rA, base + 0.3); hole.lineTo(xm + rA, base + 0.3); hole.lineTo(xm + rA, yc);
      hole.absarc(xm, yc, rA, 0, Math.PI, false); hole.lineTo(xm - rA, base + 0.3);
      sh.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: Wt, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -Wt / 2);
    b.add(g, null, color);
    // a string-course along each face at the arch's crown
    for (const s of [-1, 1]) b.box(xb - xa, 0.35 * k, 0.4 * k, mat((xa + xb) / 2, top - 0.6 * k, s * (Wt / 2 + 0.15 * k)), edge);
  };
  // a trough: its floor, its two walls and their coping, the masonry under it
  const trough = (xa, xb, floor, wall, i) => {
    const xm = (xa + xb) / 2, L = xb - xa;
    b.box(L, 1.2 * k, Wt, mat(xm, floor - 0.6 * k, 0), STONE[0]);
    for (const s of [-1, 1]) {
      const bot = floor - 1.2 * k;
      b.box(L, wall - bot, tw, mat(xm, (wall + bot) / 2, s * (W2 + tw / 2)), STONE[1 + (i % 2)]);
      b.box(L + 0.05, 0.35 * k, tw + 0.5 * k, mat(xm, wall + 0.17 * k, s * (W2 + tw / 2)), edge);
      for (const f of [0.25, 0.75]) b.cyl(0.3 * k, 0.36 * k, 0.6 * k, 6, mat(xa + L * f, wall + 0.65 * k, s * (W2 + 0.55 * k)), STONE[3]);
    }
    spandrel(xa, xb, floor - 1.2 * k, STONE[1 + ((i + 1) % 3)]);
  };
  for (let i = 0; i < N; i++) trough(xg(i) + tg / 2, xg(i + 1) - tg / 2, yF(i), yWt(i), i);
  trough(xpA, xpB, yPF, yPW, N);
  // the end wall, and beyond it the lamp tower on its own pier, looking out over nothing
  b.box(2.2 * k, yPW - (yPF - 1.2 * k), Wt, mat(xpB + 1.1 * k, (yPW + yPF - 1.2 * k) / 2, 0), STONE[2]);
  spandrel(xpB, xEnd, yPF - 1.2 * k, STONE[2]);
  const xT = xEnd + 3 * k, TH = P.tower, yT = yPW + TH;
  b.box(6 * k, yPW + 0.6 * k - base, 6 * k, mat(xT, (yPW + 0.6 * k + base) / 2, 0), STONE[3]);
  b.box(6.4 * k, 0.4 * k, 6.4 * k, mat(xT, yPW + 0.8 * k, 0), edge);
  b.add(new THREE.CylinderGeometry(2.1 * k * 0.7071 * 2 * 0.8, 2.1 * k * 0.7071 * 2, TH - 4 * k, 4, 1).rotateY(Math.PI / 4), mat(xT, yPW + 1 + (TH - 4 * k) / 2, 0), STONE[2]);
  b.box(4.4 * k, 0.5 * k, 4.4 * k, mat(xT, yT - 4 * k + 1, 0), edge);
  for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) b.box(0.45 * k, 2.9 * k, 0.45 * k, mat(xT + cx * 1.7 * k, yT - 2.3 * k + 1, cz * 1.7 * k), STONE[3]);
  b.add(new THREE.ConeGeometry(3 * k, 2.4 * k, 4).rotateY(Math.PI / 4), mat(xT, yT + 0.35 * k + 1, 0), STONE[3]);
  const glowB = new Builder();
  glowB.ico(1 * k, 1, mat(xT, yT - 2.5 * k + 1, 0), GOLD, 1);
  // the gate heads: piers either side, a breast wall under each sill, lamps on posts
  for (let g = 0; g <= N; g++) {
    const xc = xg(g), top = g < N ? yWt(g) + 0.5 * k : yPW + 0.5 * k, sill = g < N ? yF(g) : yPF, wz = tw + 0.8 * k;
    for (const s of [-1, 1]) {
      const zc = s * (W2 + wz / 2);
      b.box(tg + 0.6 * k, top - base, wz, mat(xc, (top + base) / 2, zc), STONE[3]);
      b.box(tg + 0.9 * k, 0.4 * k, wz + 0.3 * k, mat(xc, top + 0.2 * k, zc), edge);
      const zl = s * (W2 + wz - 0.4 * k);
      b.box(0.45 * k, 2.4 * k, 0.45 * k, mat(xc + 0.6 * k, top + 0.4 * k + 1.2 * k, zl), STONE[2]);
      lb.box(0.9 * k, 0.9 * k, 0.9 * k, mat(xc + 0.6 * k, top + 0.4 * k + 2.85 * k, zl), 0xffffff, 0.3);
    }
    if (sill > base) b.box(tg, sill - base, Wc, mat(xc, (sill + base) / 2, 0), STONE[2]);
  }
  // wing walls at the foot, opening to the lake
  for (const s of [-1, 1]) {
    const a = s * 0.42, L = 7 * k, xa = xg(0) - tg / 2 - 0.3 * k, za = s * (W2 + tw / 2);
    b.box(L, h + fb + 3, tw, mat(xa - (Math.cos(a) * L) / 2, (h + fb - 3) / 2, za + (Math.sin(a) * L) / 2, 0, a, 0), STONE[1]);
  }
  inner.add(new THREE.Mesh(b.build(), mats.body));
  inner.add(new THREE.Mesh(glowB.build(), mats.glow));
  const lg = lb.build(), lcol = lg.attributes.color.array, lem = lg.attributes.emissive.array;
  inner.add(lightMesh(lg, fx, 1));
  // the gate leaves, mitred: all of them one geometry, each moved on its own
  const mu = 0.32, wl = W2 / Math.cos(mu) + 0.15 * k, hg = h + D + fb;
  const leafB = new Builder();
  leafB.box(wl, hg, 0.7 * k, mat(wl / 2, hg / 2, 0), TIMBER[1]);
  for (const f of [0.3, 0.68]) leafB.box(wl * 0.98, 0.3 * k, 0.9 * k, mat(wl / 2, hg * f, 0), TIMBER[0]);
  leafB.box(0.6 * k, 1.5 * k, 0.6 * k, mat(0.3 * k, hg + 0.7 * k, 0), TIMBER[0]);
  leafB.box(6 * k, 0.6 * k, 0.6 * k, mat(-2.6 * k, hg + 1.25 * k, 0), TIMBER[0]);
  const leafMat = worldMaterial({ unique: true });
  own.push(leafMat);
  const NL = 2 * (N + 1), leaves = new THREE.InstancedMesh(leafB.build(), leafMat, NL);
  leaves.frustumCulled = false;
  inner.add(leaves);
  // the water: a surface of gold in every chamber and the pound; sheets pouring in at the head
  // of each chamber as it fills, and out of its side into the lake as it empties
  const NQ = (N + 1) + 2 * N, WQ = dyn(NQ * 6);
  const water = lightMesh(WQ.g, fx, 0.85, { fog: 0.45 });
  water.material.uniforms.uTint.value.setHex(GOLD);
  inner.add(water);
  const quad = (qi, a, b2, c, d2) => {
    const o = qi * 18, p = WQ.pos;
    for (const [i, v] of [a, b2, c, a, c, d2].entries()) { p[o + i * 3] = v[0]; p[o + i * 3 + 1] = v[1]; p[o + i * 3 + 2] = v[2]; }
  };
  const quadE = (qi, top, bot) => { const e = WQ.em, o = qi * 6; e[o] = top; e[o + 1] = top; e[o + 2] = bot; e[o + 3] = top; e[o + 4] = bot; e[o + 5] = bot; };
  const zo = W2 + tw + 0.15 * k, yOut = (i) => Math.max(yF(i) + 0.8 * k, 1.2 * k);
  for (let i = 0; i < N; i++) {
    const xm = (xg(i) + xg(i + 1)) / 2, hw = Lc * 0.12;
    quad(N + 1 + N + i, [xm - hw, yOut(i), zo], [xm + hw, yOut(i), zo], [xm + hw, 0.1, zo + 0.8 * k], [xm - hw, 0.1, zo + 0.8 * k]);
  }
  const splash = lights(N, mixHex(GOLD, 0xffffff, 0.3), fx, 0.9);
  for (let i = 0; i < N; i++) { splash.pos.set([(xg(i) + xg(i + 1)) / 2, 0.5, zo + 1.6 * k], i * 3); splash.sz[i] = 8 * k; }
  const beacon = lights(1, GOLD, fx, 1);
  beacon.pos.set([xT, yT - 2.5 * k + 1, 0]); beacon.sz[0] = 22 * k;
  inner.add(splash.p, beacon.p);
  // the boat: a hull, a cabin with lit windows, a lamp at its bow
  const Lb = Math.min(0.62 * Lc, 10 * k), Bb = 2.8 * k, boat = new THREE.Group(), bb = new Builder();
  bb.box(Lb, 1.4 * k, Bb, mat(0, 0.1 * k, 0), TIMBER[0]);
  bb.cone(Bb * 0.55, 2.6 * k, 4, mat(Lb / 2 + 1.25 * k, 0.1 * k, 0, 0, 0, -Math.PI / 2, 0.5, 1, 1.05), TIMBER[0]);
  bb.box(Lb * 1.01, 0.25 * k, Bb * 1.04, mat(0, 0.75 * k, 0), TIMBER[1]);
  bb.box(Lb * 0.45, 1.6 * k, Bb * 0.8, mat(-Lb * 0.12, 1.6 * k, 0), TIMBER[1]);
  bb.box(Lb * 0.5, 0.25 * k, Bb * 0.95, mat(-Lb * 0.12, 2.5 * k, 0), STONE[3]);
  for (const s of [-1, 1]) for (const f of [-0.28, -0.02]) bb.box(0.7 * k, 0.55 * k, 0.1 * k, mat(Lb * f, 1.75 * k, s * Bb * 0.41), GOLD, 1);
  bb.box(0.2 * k, 3.2 * k, 0.2 * k, mat(Lb * 0.38, 2.4 * k, 0), RIM);
  bb.ico(0.5 * k, 1, mat(Lb * 0.38, 4.3 * k, 0), A, PULSE);
  boat.add(new THREE.Mesh(bb.build(), mats.glow));
  const bl = lights(1, mixHex(A, 0xffffff, 0.4), fx, 0.8);
  bl.pos.set([Lb * 0.38, 4.3 * k, 0]); bl.sz[0] = 9 * k; bl.al[0] = 1;
  boat.add(bl.p);
  inner.add(boat);
  // its passage: a list of events, each changing the state from where the last left it
  const tG = 4, tF = 5 + h / 1.1, pace = P.pace;
  const far = xg(0) - 34 * k, posOf = (p) => (p < 0 ? xg(0) - tg / 2 - Lb / 2 - 5 * k : p < N ? (xg(p) + xg(p + 1)) / 2 : (xpA + xpB) / 2);
  const ev = [];
  let T = 0;
  const add = (dur, f) => { ev.push({ t0: T, d: dur, f }); T += dur; };
  const move = (p, q) => add(2 + Math.abs(posOf(q) - posOf(p)) / pace, (S, u) => { S.bx = posOf(p) + (posOf(q) - posOf(p)) * ease(u); S.loc = u < 0.5 ? p : q; });
  const gate = (g, open) => add(tG, (S, u) => { S.gate[g] = open ? ease(u) : 1 - ease(u); });
  const flow = (i, a, c, a2, c2, pin, dur) => add(dur, (S, u) => {
    const e = ease(u);
    S.lev[i] = a + (c - a) * e;
    if (a2 !== null) S.lev[i + 1] = a2 + (c2 - a2) * e;
    const f = u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 0.5) : 0;
    if (pin) S.pin[i] = f; else S.pout[i] = f;
  });
  add(12, (S, u) => { S.bx = far + (posOf(-1) - far) * ease(u); S.loc = -1; });
  for (let i = 0; i < N; i++) {
    gate(i, true); move(i - 1, i); gate(i, false);
    flow(i, i * h, (i + 1) * h, i + 1 < N ? (i + 2) * h : null, (i + 1) * h, true, tF);
  }
  gate(N, true); move(N - 1, N);
  add(6, (S, u) => { S.yaw = Math.PI * ease(u); });
  add(P.hold, (S, u) => { S.top = Math.sin(Math.PI * u); });
  for (let i = N - 1; i >= 0; i--) {
    move(i + 1, i); gate(i + 1, false);
    flow(i, (i + 1) * h, i * h, null, 0, false, tF);
    gate(i, true);
  }
  move(0, -1); gate(0, false);
  add(14, (S, u) => { S.bx = posOf(-1) + (far - posOf(-1)) * ease(u); });
  for (let i = N - 1; i >= 1; i--) flow(i, i * h, (i + 1) * h, null, 0, true, tF * 0.7);
  add(7, (S, u) => { S.yaw = Math.PI * (1 + ease(u)); });
  add(3, () => {});
  const Tcy = T;
  const S = { lev: new Float64Array(N), gate: new Float64Array(N + 1), pin: new Float64Array(N), pout: new Float64Array(N), bx: far, loc: -1, yaw: 0, top: 0 };
  const levOf = (p) => (p < 0 ? 0 : p < N ? S.lev[p] : N * h);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const cA = new THREE.Color(A), cG = new THREE.Color(GOLD);
  const group = new THREE.Group();
  group.add(inner);
  const height = yT + 1.6 * k + 1;
  return finish({
    group, fx, own, light: out3(V(xg(N), yPW, 0)), focus: out3(V(0, N * h * 0.45, 0)), span: Ltot / 2 + 6 * k, clear: Math.min(100, Ltot / 2 + 8 * k), height,
    solid: { r: Ltot / 2 + 6 * k, top: yPW + 1, low: 0 },
  }, (t) => {
    const tau = frac(t / Tcy + P.phase) * Tcy;
    for (let i = 0; i < N; i++) S.lev[i] = i === 0 ? 0 : (i + 1) * h;
    S.gate.fill(0); S.pin.fill(0); S.pout.fill(0);
    S.bx = far; S.loc = -1; S.yaw = 0; S.top = 0;
    for (const e of ev) {
      if (tau >= e.t0 + e.d) e.f(S, 1);
      else { e.f(S, Math.max(0, (tau - e.t0) / e.d)); break; }
    }
    // the leaves: hinged at the walls, mitred upstream when shut, folded back along the walls when open
    for (let g = 0; g <= N; g++) {
      const sill = g < N ? yF(g) : yPW - hg, sy = 1;   // (the top gate's foot is hidden in the pound's floor)
      for (const s of [-1, 1]) {
        const th = s * (Math.PI / 2 - mu) * (1 - S.gate[g]);
        _p.set(xg(g) - 0.6 * k, sill, s * (W2 - 0.4 * k));
        _q.setFromAxisAngle(Yax, th);
        _m.compose(_p, _q, _s.set(1, sy, 1));
        leaves.setMatrixAt(g * 2 + (s > 0 ? 1 : 0), _m);
        // its lamp: gold while it stands open
        _c2.copy(cA).lerp(cG, S.gate[g]);
        setBox(lcol, lem, g * 2 + (s > 0 ? 1 : 0), _c2, 0.3 + 0.9 * S.gate[g]);
      }
    }
    leaves.instanceMatrix.needsUpdate = true;
    lg.attributes.color.needsUpdate = true;
    lg.attributes.emissive.needsUpdate = true;
    // the surfaces
    const zw = W2 - 0.05;
    for (let i = 0; i <= N; i++) {
      const xa = i < N ? xg(i) + tg / 2 : xpA, xb = i < N ? xg(i + 1) - tg / 2 : xpB, y = (i < N ? S.lev[i] : N * h) + 0.05;
      quad(i, [xa, y, -zw], [xb, y, -zw], [xb, y, zw], [xa, y, zw]);
      const busy = i < N ? Math.max(S.pin[i], S.pout[i]) : 0;
      quadE(i, 0.32 + 0.35 * busy, 0.32 + 0.35 * busy);
    }
    // what pours in at the head of a filling chamber, from the level above it down to its own
    for (let i = 0; i < N; i++) {
      const x = xg(i + 1) - tg / 2 - 0.15 * k, yt = levOf(i + 1) + 0.05, yb = S.lev[i] + 0.05, I = S.pin[i];
      if (I > 0.01 && yt - yb > 0.2) {
        quad(N + 1 + i, [x, yt, -W2 * 0.5], [x, yt, W2 * 0.5], [x, yb, W2 * 0.5], [x, yb, -W2 * 0.5]);
        quadE(N + 1 + i, 0.9 * I, 0.45 * I);
      } else { quad(N + 1 + i, [x, yb, 0], [x, yb, 0], [x, yb, 0], [x, yb, 0]); quadE(N + 1 + i, 0.004, 0.004); }
      const O = S.pout[i];
      quadE(N + 1 + N + i, Math.max(0.004, 0.95 * O), Math.max(0.004, 0.6 * O));
      splash.al[i] = O * (0.7 + 0.3 * Math.sin(t * 9 + i));
    }
    WQ.touch();
    splash.touch();
    beacon.al[0] = 0.45 + 0.9 * S.top;
    beacon.touch();
    boat.position.set(S.bx, levOf(S.loc), 0);
    boat.rotation.y = -S.yaw;
  });
}

// ================================================================== upwelling
function upwelling(d, A, mats, ctx) {
  const P = d.params, K = P.k, R = rng(d.seed[5]), fx = [];
  const H = P.height, Rr = P.ring, M = P.gauges, Hg = P.gauge, J = P.jets, C = P.cycle, Rw = P.well, rc = P.col, Mk = 12;
  const group = new THREE.Group();
  const b = new Builder(), gb = new Builder(), mb = new Builder(), edge = mixHex(STONE[3], RIM, 0.28);
  // the well-head: a broad ring wall of stone breaking the surface, a pool of light in it
  lathe(b, [[Rw + 3.6 * K, -3], [Rw + 2.9 * K, 2.2 * K], [Rw + 2.4 * K, 2.9 * K], [Rw + 0.5 * K, 2.9 * K], [Rw, 2.2 * K], [Rw, -3]], 48, null, STONE[1]);
  b.torus(Rw + 1.45 * K, 0.35 * K, 3, 48, mat(0, 2.95 * K, 0, Math.PI / 2, 0, 0), edge);
  for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * TAU, r = Rw + 1.45 * K; gb.box(0.8 * K, 0.6 * K, 0.8 * K, mat(Math.cos(a) * r, 3.3 * K, Math.sin(a) * r, 0, -a, 0), A, PULSE); }
  const pb = new Builder();
  pb.add(new THREE.CircleGeometry(Rw, 48), mat(0, 0.3, 0, -Math.PI / 2, 0, 0), mixHex(A, 0xffffff, 0.35), (x, y) => 0.25 + 0.75 * (1 - Math.hypot(x, y) / Rw));
  const pool = lightMesh(pb.build(), fx, 0.8, { fog: 0.4 });
  group.add(pool);
  // the gauges: tall stone vessels in a ring where the rain comes down, marks up their inner faces
  const marksY = [];
  for (let j = 0; j < Mk; j++) marksY.push(2.5 * K + ((j + 0.5) / Mk) * (Hg - 5 * K));
  const rAt = (y) => 2.6 * K - 0.6 * K * clamp((y + 3) / (Hg + 3), 0, 1);
  const GA = [];
  for (let i = 0; i < M; i++) {
    const a = (i / M) * TAU + P.turn, ca = Math.cos(a), sa = Math.sin(a), x = ca * Rr, z = sa * Rr;
    GA.push(a);
    b.cyl(2 * K, 2.6 * K, Hg + 3, 14, mat(x, (Hg - 3) / 2, z), STONE[1 + (i % 3)]);
    b.cyl(3.4 * K, 4 * K, 2.5 * K, 10, mat(x, 0.25 * K, z), STONE[0]);
    for (const f of [0.36, 0.7]) { const y = Hg * f; b.cyl(rAt(y) + 0.25 * K, rAt(y) + 0.25 * K, 0.5 * K, 14, mat(x, y, z), edge); }
    b.cyl(4.2 * K, 2 * K, 3 * K, 14, mat(x, Hg + 1.5 * K, z), STONE[3], 0, true);
    b.cyl(4.0 * K, 1.85 * K, 2.9 * K, 14, mat(x, Hg + 1.55 * K, z, 0, 0, 0, -1, 1, 1), STONE[2], 0, true);
    b.torus(4.2 * K, 0.3 * K, 3, 20, mat(x, Hg + 3 * K, z, Math.PI / 2, 0, 0), edge);
    gb.ico(1.1 * K, 1, mat(x, Hg + 1.4 * K, z), A, PULSE);
    for (let j = 0; j < Mk; j++) {
      const y = marksY[j], rf = Rr - rAt(y) - 0.12 * K;
      mb.box(0.25 * K, 0.55 * K, (j % 3 === 2 ? 1.6 : 1.1) * K, mat(ca * rf, y, sa * rf, 0, -a, 0), 0xffffff, 0.05);
    }
  }
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(gb.build(), mats.glow));
  const mg = mb.build(), mcol = mg.attributes.color.array, mem = mg.attributes.emissive.array;
  group.add(lightMesh(mg, fx, 1, { fog: 0.4 }));
  const glamps = lights(M, mixHex(A, 0xffffff, 0.4), fx, 0.9);
  GA.forEach((a, i) => { glamps.pos.set([Math.cos(a) * Rr, Hg + 2.2 * K, Math.sin(a) * Rr], i * 3); glamps.sz[i] = 9 * K; });
  group.add(glamps.p);
  // the thread: a faint line of light always standing over the well, beads climbing it
  const tb = new Builder();
  tb.add(new THREE.CylinderGeometry(0.5 * K, 0.5 * K, H - 3 * K, 6, 12, true), mat(0, 3 * K + (H - 3 * K) / 2, 0), mixHex(A, 0xffffff, 0.5), (x, y) => 0.6 - 0.45 * (y / (H - 3 * K) + 0.5));
  const thread = lightMesh(tb.build(), fx, 0.35, { fog: 0.3 });
  group.add(thread);
  const beads = lights(7, mixHex(A, 0xffffff, 0.6), fx, 0.9);
  group.add(beads.p);
  const crown = lights(2, 0xffffff, fx, 1);
  crown.sz[0] = 30 * K; crown.sz[1] = 18 * K;
  group.add(crown.p);
  // the column: a tube of light rising out of the well, rewritten as it climbs and falls
  const CSg = 24, CR = 72, cidx = [];
  for (let r = 0; r < CR - 1; r++) for (let s = 0; s < CSg; s++) {
    const a = r * CSg + s, b2 = r * CSg + ((s + 1) % CSg);
    cidx.push(a, a + CSg, b2 + CSg, a, b2 + CSg, b2);
  }
  const COL = dyn(CR * CSg, cidx);
  const column = lightMesh(COL.g, fx, 0.7, { fog: 0.3, fresnel: 0.55 });
  group.add(column);
  const cTh = Array.from({ length: CSg }, (_, s) => (s / CSg) * TAU);
  // the arcs it falls in: from the crown to the ring
  const NN = 28, JET = dyn(J * NN * 4, pathIndex(Array(J).fill(NN)));
  const JD = Array.from({ length: J }, (_, j) => ({ a: (j / J) * TAU + (R() - 0.5) * 0.04, land: Rr * (0.9 + 0.13 * R()), vy: H * 0.3 * (0.85 + 0.3 * R()), ph: R() * TAU }));
  const jets = lightMesh(JET.g, fx, 0.8, { fog: 0.3 });
  group.add(jets);
  // the bows: a whole round rainbow and a second outside it, the spectrum reversed, a little
  // brighter within the first; turned each moment to whoever watches
  const yc = 0.4 * H, Rb1 = 0.6 * Rr, NA = 120, bpos = [], bcol = [], bem = [];
  const ring = (r0, r1, rev, gain) => {
    const NBd = 8;
    for (let s = 0; s < NA; s++) {
      const a0 = (s / NA) * TAU, a1 = ((s + 1) / NA) * TAU;
      for (let q = 0; q < NBd; q++) {
        const f0 = q / NBd, f1 = (q + 1) / NBd, ra = r0 + (r1 - r0) * f0, rb2 = r0 + (r1 - r0) * f1;
        const vs = [[a0, ra, f0], [a1, ra, f0], [a1, rb2, f1], [a0, ra, f0], [a1, rb2, f1], [a0, rb2, f1]];
        for (const [a, r, f] of vs) {
          bpos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
          const hue = rev ? 0.78 * f : 0.78 * (1 - f);
          _c.setHSL(hue, 0.8, 0.6);
          bcol.push(_c.r, _c.g, _c.b);
          bem.push(gain * (0.15 + 0.85 * Math.pow(Math.sin(Math.PI * f), 0.8)));
        }
      }
    }
  };
  ring(Rb1 * 0.925, Rb1 * 1.0, false, 1);
  ring(Rb1 * 1.27, Rb1 * 1.37, true, 0.42);
  for (let s = 0; s < NA; s++) {
    const a0 = (s / NA) * TAU, a1 = ((s + 1) / NA) * TAU, r = Rb1 * 0.92;
    bpos.push(0, 0, 0, Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
    for (let v = 0; v < 3; v++) { bcol.push(1, 1, 1); bem.push(v === 0 ? 0.02 : 0.07); }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3));
  bg.setAttribute('emissive', new THREE.Float32BufferAttribute(bem, 1));
  const bow = lightMesh(bg, fx, 0.6, { fog: 0.3 });
  bow.position.y = yc;
  group.add(bow);
  // rings on the lake: drawn in to the well before it rises, sent out from the ring after the rain
  const NRg = 6, SR = 96, RG = dyn(NRg * SR * 6);
  const rings = lightMesh(RG.g, fx, 0.8, { fog: 0.4 });
  rings.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.3));
  group.add(rings);
  const RCS = Array.from({ length: SR + 1 }, (_, s) => [Math.cos((s / SR) * TAU), Math.sin((s / SR) * TAU)]);
  // the rain on the lake where the arcs come down, and the mist of it
  const NSp = 260, SPL = lights(NSp, mixHex(A, 0xffffff, 0.55), fx, 0.9), SPD = [];
  for (let i = 0; i < NSp; i++) {
    const a = R() * TAU, r = Rr * (0.86 + 0.2 * R());
    SPL.pos.set([Math.cos(a) * r, 0.6, Math.sin(a) * r], i * 3);
    SPD.push({ rate: 0.6 + R() * 0.9, ph: R() });
  }
  const NM = 200, MI = lights(NM, 0xffffff, fx, 0.4), MD = [];
  for (let i = 0; i < NM; i++) {
    const a = R() * TAU, r = Rr * (0.55 + 0.5 * R());
    MD.push({ a, r, y: R() * 0.3 * H, ph: R() * TAU, sp: (0.004 + R() * 0.006) * (R() < 0.5 ? -1 : 1) });
    MI.sz[i] = (8 + R() * 10) * K;
  }
  group.add(SPL.p, MI.p);
  const level = new Float32Array(M), GH = Array.from({ length: M }, (_, i) => 0.78 + 0.22 * hash(i * 3.7 + P.turn));
  const cA = new THREE.Color(mixHex(A, 0xffffff, 0.35)), cD = new THREE.Color(A), Tf = clamp(0.06 * C, 16, 26);
  const ton = 0.28 * C, toff = 0.66 * C, tLand = ton + Tf, tStop = toff + Tf;
  const rTop = rc * 1.1, height = H * 1.03 + 2 * K;
  return finish({
    group, fx, light: V(0, Hg, 0), focus: V(0, H * 0.35, 0), span: Rr + 5 * K, clear: Math.min(100, Rw + 12 * K), height,
    solid: { r: Rr + 4.5 * K, top: Hg + 3.5 * K, low: 0 },
  }, (t, beat, c) => {
    const q = frac(t / C + P.phase), tau = q * C, hue = t / P.hue;
    // the column: up, held, and back down into the well
    let topY = 0;
    if (q >= 0.14 && q < 0.66) topY = H * ease((q - 0.14) / 0.14);
    else if (q >= 0.66 && q < 0.77) topY = H * (1 - ease((q - 0.66) / 0.11));
    const rising = q >= 0.14 && q < 0.28, on = topY > 1;
    for (let r = 0; r < CR; r++) {
      const v = r / (CR - 1), y = v * topY, fy = y / H;
      const head = rising ? 1 + 0.45 * Math.exp(-(topY - y) / (5 * K)) : 1;
      const rad = rc * (1 + 1.3 * Math.exp(-y / (6 * K))) * (1 + 0.5 * smoothstep(0.92, 1, fy)) * head * (1 + 0.05 * Math.sin(y * 0.2 / K - t * 1.3));
      prism(hue + fy * 0.4);
      _c2.copy(cA).lerp(_c, 0.3 * fy);
      for (let s = 0; s < CSg; s++) {
        const o = r * CSg + s, th = cTh[s];
        COL.pos[o * 3] = Math.cos(th) * rad; COL.pos[o * 3 + 1] = y; COL.pos[o * 3 + 2] = Math.sin(th) * rad;
        const st = Math.pow(0.5 + 0.5 * Math.sin(TAU * (y / (14 * K) - t * 0.35) + 3 * th), 3);
        COL.em[o] = on ? 0.22 + 0.5 * st + (rising ? 0.8 * Math.exp(-(topY - y) / (4 * K)) : 0) : 0.004;
        setCol(COL.col, o, _c2);
      }
    }
    COL.touch(true);
    thread.userData.fx.g = on ? 0.25 : 1;
    // the arcs: water leaves the crown from ton to toff and takes Tf to reach the lake
    const spin = t * 0.004 * P.spin;
    for (let j = 0; j < J; j++) {
      const o = JD[j], a = o.a + spin + 0.015 * Math.sin(t * 0.13 + o.ph), ca = Math.cos(a), sa = Math.sin(a), G = 2 * (H + o.vy);
      for (let m = 0; m < NN; m++) {
        const s = m / (NN - 1), r = rTop + (o.land - rTop) * s, y = H + o.vy * s - 0.5 * G * s * s;
        const dr = o.land - rTop, dy = o.vy - G * s;
        node4(JET.pos, j * NN + m, ca * r, y, sa * r, ca * dr, dy, sa * dr, (0.45 + 1.2 * s) * K);
        const left = tau - s * Tf;
        const wet = smoothstep(ton, ton + 1.5, left) * (1 - smoothstep(toff - 1.5, toff, left));
        const front = left >= ton ? Math.exp(-(((left - ton) / 1.4) ** 2)) : 0;
        const streak = Math.pow(0.5 + 0.5 * Math.sin(TAU * (s * 6 - t * 0.5) + o.ph), 4);
        const e = wet * (0.25 + 0.35 * streak) + 0.9 * front * wet;
        prism(hue + s * 0.35 + (j / J) * 0.2);
        _c2.copy(cA).lerp(_c, 0.85 * smoothstep(0.3, 0.95, s));
        for (let v = 0; v < 4; v++) { JET.em[(j * NN + m) * 4 + v] = Math.max(0.004, e); setCol(JET.col, (j * NN + m) * 4 + v, _c2); }
      }
    }
    JET.touch(true);
    // what reaches the lake now, and the bows in it
    const rain = smoothstep(tLand - 1, tLand + 3, tau) * (1 - smoothstep(tStop - 3, tStop + 1, tau));
    const rb = smoothstep(tLand, tLand + 0.06 * C, tau) * (1 - smoothstep(tStop - 0.06 * C, tStop, tau));
    bow.userData.fx.g = rb;
    const sl = c.shipLocal;
    if (sl) {
      _v.set(sl.x, sl.y - yc, sl.z);
      if (_v.lengthSq() > 1) bow.quaternion.setFromUnitVectors(Zax, _v.normalize());
    }
    // the crown's glow, and the head of the climbing water
    crown.pos.set([0, H, 0, 0, topY, 0]);
    crown.al[0] = 0.22 + 0.9 * smoothstep(0.26, 0.3, q) * (1 - smoothstep(0.64, 0.7, q));
    crown.al[1] = rising ? 1 : 0;
    crown.touch();
    crown.m.uniforms.uColor.value.copy(prism(hue + 0.1, 0.4, 0.8));
    for (let i = 0; i < 7; i++) {
      const u = frac(t / 45 + i / 7);
      beads.pos.set([0, 3 * K + u * (H - 3 * K), 0], i * 3);
      beads.sz[i] = 4 * K; beads.al[i] = on ? 0 : Math.sin(Math.PI * u) * 0.8;
    }
    beads.touch();
    pool.userData.fx.g = 0.3 + 0.7 * smoothstep(0.05, 0.14, q) * (1 - smoothstep(0.7, 0.8, q));
    // rings: three drawn inward to the well, three sent outward from the ring
    for (let i = 0; i < NRg; i++) {
      let r = 0, al = 0;
      if (i < 3) {
        const p = clamp((q - 0.04 - i * 0.025) / 0.08, 0, 1);
        r = Rr * 1.1 + (Rw + 2 * K - Rr * 1.1) * ease(p); al = p > 0 && p < 1 ? Math.sin(Math.PI * p) * 0.8 : 0;
      } else {
        const p = clamp((q - 0.76 - (i - 3) * 0.03) / 0.13, 0, 1);
        r = Rr + 70 * K * Math.pow(p, 0.8); al = p > 0 && p < 1 ? Math.pow(1 - p, 1.5) * smoothstep(0, 0.05, p) * 0.8 : 0;
      }
      const wd = (0.6 + (i < 3 ? 0.6 : 1.4)) * K, ri = Math.max(0, r - wd), ro2 = r + wd;
      let o = i * SR * 18;
      for (let s = 0; s < SR; s++) {
        const [c0, s0] = RCS[s], [c1, s1] = RCS[s + 1];
        for (const [qx, qz] of [[c0 * ri, s0 * ri], [c0 * ro2, s0 * ro2], [c1 * ro2, s1 * ro2], [c0 * ri, s0 * ri], [c1 * ro2, s1 * ro2], [c1 * ri, s1 * ri]]) {
          RG.pos[o++] = qx; RG.pos[o++] = 0.25; RG.pos[o++] = qz;
        }
      }
      RG.em.fill(Math.max(0.004, al), i * SR * 6, (i + 1) * SR * 6);
    }
    RG.touch();
    // splashes where it lands, and the mist hanging in the colors
    for (let i = 0; i < NSp; i++) {
      const f = frac(t * SPD[i].rate + SPD[i].ph);
      SPL.al[i] = rain * Math.pow(1 - f, 3) * 0.9;
      SPL.sz[i] = (2 + 6 * f) * K;
    }
    SPL.touch();
    for (let i = 0; i < NM; i++) {
      const m = MD[i], a = m.a + t * m.sp;
      MI.pos[i * 3] = Math.cos(a) * m.r; MI.pos[i * 3 + 1] = m.y + 3 * K * Math.sin(t * 0.07 + m.ph); MI.pos[i * 3 + 2] = Math.sin(a) * m.r;
      MI.al[i] = rain * (0.3 + 0.2 * Math.sin(t * 0.3 + m.ph));
    }
    MI.touch();
    MI.m.uniforms.uColor.value.copy(prism(hue * 1.7, 0.55, 0.75));
    // the gauges fill while the rain comes down, each a little differently, and drain at the end
    const fill = Math.pow(clamp((tau - tLand) / (tStop - tLand), 0, 1), 0.9), drain = 1 - ease((q - 0.84) / 0.12);
    for (let i = 0; i < M; i++) {
      level[i] = fill * GH[i] * drain;
      const lit = level[i] * Mk;
      for (let j = 0; j < Mk; j++) {
        const onj = j < lit;
        if (onj) { _c.setHSL((0.78 * j) / (Mk - 1), 0.8, 0.6); setBox(mcol, mem, i * Mk + j, _c, j + 1 >= lit ? 1.4 : 0.95); }
        else setBox(mcol, mem, i * Mk + j, cD, 0.06);
      }
      glamps.al[i] = 0.3 + 0.7 * level[i];
    }
    mg.attributes.color.needsUpdate = true;
    mg.attributes.emissive.needsUpdate = true;
    glamps.touch();
  });
}

export const SET = {
  tidemoon: {
    code: 'VTD', cls: 'Tide moon', nouns: ['Moon', 'Tide', 'Pull', 'Swell', 'Flood', 'Ebb'], place: 'greatlake', tier: 3,
    kin: ['planet', 'halo', 'tidegate'], voice: ['whale', 'breath'],
    params(R, size) {
      const k = 0.75 + 0.25 * size;
      const P = {
        k, radius: R.range(30, 36) * k, posts: R.pick([16, 20, 24, 28]), amp: R.range(8, 10.5) * k, orbit: R.range(0.64, 0.72), alt: R.range(32, 38) * k,
        nod: R.range(0.13, 0.18), moon: R.range(6, 8) * k, marks: R.int(7, 10), period: R.range(55, 85), beat: R.range(2.4, 3.6), sun: R() * TAU, ph: R() * TAU, ph2: R() * TAU,
      };
      P.text = `A moon of stone ${Math.round(2 * P.moon)} meters across circles ${Math.round(P.alt)} meters over the lake with nothing holding it, once in ${Math.round(P.period)} seconds, and the water rises to it in two mounds of light, one under it and one on the far side under nothing; ${numw(P.posts)} posts in a ring mark the tide as it passes. When it comes lower the tide runs higher, by the cube of its nearness.`;
      return P;
    },
    build: tidemoon,
  },
  dropper: {
    code: 'VKL', cls: 'Thunder of drops', nouns: ['Dropper', 'Spark', 'Charge', 'Streams', 'Thunder', 'Influence'], place: 'greatlake', tier: 3,
    kin: ['storm', 'fountain', 'chandelier'], voice: ['grains', 'glitch'],
    params(R, size) {
      const k = 0.75 + 0.25 * size;
      const P = {
        k, tall: R.range(40, 48) * k, sep: R.range(15, 19) * k, ringY: R.range(17, 21) * k, gap: R.range(5.5, 7.5) * k, period: R.range(16, 28),
        drops: R.int(80, 110), spread: R.range(5.5, 8) * k, bearing: R() * TAU, phase: R(),
      };
      P.text = `A water tower of stone on a pier in the lake lets fall two streams of drops ${Math.round(P.sep)} meters apart, each through a ring wired to the other's basin, so that what one gathers urges the other on. The charge builds by itself and the streams fan apart as it grows, until about every ${Math.round(P.period)} seconds a spark leaps the ${Math.round(P.gap)} meters between the basins' spheres, and it begins again.`;
      return P;
    },
    build: dropper,
  },
  lockflight: {
    code: 'ULK', cls: 'Flight of locks', nouns: ['Locks', 'Flight', 'Staircase', 'Passage', 'Gates', 'Ascent'], place: 'greatlake', tier: 4,
    kin: ['helicon', 'tidegate', 'clockwork'], voice: ['breath', 'whale'],
    params(R, size) {
      const k = 0.7 + 0.3 * size;
      const n = R.pick([5, 6, 6]), len = R.range(104, 120) * k, pound = R.range(14, 17) * k;
      const P = {
        k, n, rise: R.range(5.2, 6.4) * k, width: R.range(8, 9.5) * k, pound, chamber: (len - 2.4 * k - pound - 2.2 * k) / n - 2.4 * k,
        tower: R.range(16, 22) * k, hold: R.range(12, 18), pace: R.range(2.2, 3) * k, bearing: R() * TAU, phase: R(),
      };
      P.text = `A staircase of ${numw(n)} locks climbs ${Math.round(n * P.rise)} meters out of the lake on arches, to a lamp at its end and nothing beyond. A boat with one lamp is let in at its foot and lifted chamber by chamber, the gold water in each rising as the one above it falls; at the top it turns and waits a while, looking out, and is let down again, the emptied chambers pouring gold from their sides into the lake.`;
      return P;
    },
    build: lockflight,
  },
  upwelling: {
    code: 'UPW', cls: 'Upwelling', nouns: ['Upwelling', 'Fountain', 'Rainbow', 'Column', 'Rain', 'Return'], place: 'greatlake', tier: 5,
    kin: ['fountain', 'prism', 'spire'], voice: ['glass', 'breath'],
    params(R, size) {
      const k = Math.min(1.12, Math.sqrt(size));
      const P = {
        k, height: R.range(175, 215) * k, ring: R.range(72, 88) * k, gauges: R.pick([9, 11, 12, 13]), gauge: R.range(26, 34) * k, jets: R.pick([56, 64, 72, 80]),
        cycle: R.range(300, 420), well: R.range(11, 14) * k, col: R.range(4.5, 6) * k, hue: R.range(50, 90), spin: R.pick([-1, 1]), turn: R() * TAU, phase: R(),
      };
      P.text = `A well-head of stone in the open lake, and about it ${numw(P.gauges)} stone rain-gauges ${Math.round(P.gauge)} meters tall in a ring ${Math.round(2 * P.ring)} meters across. About every ${numw(mins(P.cycle))} minutes the lake gathers to the well and rises out of it in a column of light ${Math.round(P.height)} meters high, which opens at the top and falls in ${P.jets} arcs onto the ring; in its rain hangs a whole round rainbow with a fainter second about it, both turned to whoever watches, and the gauges fill in every color before they drain.`;
      return P;
    },
    build: upwelling,
  },
};
