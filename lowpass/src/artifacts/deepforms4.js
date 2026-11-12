import * as THREE from 'three';
import { mat, Builder } from '../render/build.js';
import { glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { TAU, clamp, damp, smoothstep } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { PULSE } from './parts.js';
import { GOLDEN, orient, bar, petal, cloud, strips } from './deepkit.js';

// The tiers' own true forms (EPIC and LEGENDARY; tiers.js assigns them): a fibration of
// linked rings of light, a glass vessel with no inside, a drum that writes its own history,
// a nodding seed-head hung with threads of light, and a loom that weaves a cloth of light and
// lets it go again. Each is built of the Kit's four kinds of stuff in its stratum's colors,
// stands at its origin (or, built `mini`, hangs centered in the air with nothing on the
// ground), and moves only by t and dt.

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pale = (h, k = 0.3) => mixHex(h, 0xffffff, k);
const put = (cl, i, x, y, z) => { const p = cl.pos, j = i * 3; p[j] = x; p[j + 1] = y; p[j + 2] = z; };
const nearOf = (ctx) => (ctx && ctx.near) || 0;
const frac = (x) => x - Math.floor(x);
const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen'];
const num = (n) => NUMW[n] || String(n);
const Num = (n) => { const s = num(n); return s[0].toUpperCase() + s.slice(1); };
const GOLD = 0xffd27a, VIOLET = 0xb48cff;
const _rx = new THREE.Matrix4().makeRotationX(Math.PI / 2);

// a closed ring of points (for a tube about a circle)
const ringPts = (f, n) => { const p = []; for (let i = 0; i <= n; i++) p.push(f(((i % n) / n) * TAU)); return p; };

// A field of quads of light whose brightness (and color) can be rewritten every frame: the
// cells of the drum, the cloth on the loom, the rule on the lid. quads: [p0, p1, p2, p3]
// (each [x, y, z]); colors: a hex per quad. Brightness 0 is dark (never 0 itself: the glow
// shader reads 0 as full).
function cellMesh(art, parent, quads, colors, opacity = 0.9) {
  const n = quads.length, pos = new Float32Array(n * 18), col = new Float32Array(n * 18), em = new Float32Array(n * 6).fill(0.0001);
  const c = new THREE.Color();
  quads.forEach(([a, b, d, e], i) => {
    let o = i * 18;
    for (const v of [a, b, d, a, d, e]) { pos[o] = v[0]; pos[o + 1] = v[1]; pos[o + 2] = v[2]; o += 3; }
  });
  const setColor = (i, hex) => { c.setHex(hex); for (let k = 0; k < 6; k++) { const o = i * 18 + k * 3; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; } };
  colors.forEach((h, i) => setColor(i, h));
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
  return {
    n, mesh,
    set(i, e) { const v = e > 0.0001 ? e : 0.0001, o = i * 6; for (let k = 0; k < 6; k++) em[o + k] = v; },
    setColor,
    commit(colors2 = false) { g.attributes.emissive.needsUpdate = true; if (colors2) g.attributes.color.needsUpdate = true; },
  };
}

// a mesh of the light kind with an edge glow of its own (glass): built from a Builder
function glassMesh(art, parent, b, opacity) {
  if (b.empty) return null;
  const m = glowMaterial({ opacity, fog: 0.5, fresnel: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(b.build(), m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  parent.add(mesh);
  art.fades.push([m, opacity]);
  art.mats.extra.push(m);
  return mesh;
}

// ------------------------------------------------------------------ HOPF
// HOPF: the Hopf fibration made of light. The three-sphere filled with circles, any two of
// them linked once, brought down into the air by stereographic projection: nested tori, each
// woven of circles that all pass through one another, about one circle of light (the fibre of
// the equator) and an axis of light (the fibre through the pole, which goes to infinity). Each
// torus turns about the axis at its own speed, and that is the fibration flowing into itself:
// the circles slide along one another and stay circles. Beads run round every circle; at the
// heart, the sphere of which each circle is one point, its points lit and turning with them.
function hopf(k, P, S, art, mini) {
  const c = art.pal, U = S * (mini ? 0.6 : 1);
  const n = mini ? Math.min(3, P.tori) : P.tori, etaMax = 0.95, sc = (17 * U) / ((1 + Math.sin(etaMax)) / Math.cos(etaMax));
  const halfH = Math.tan(etaMax) * sc, H = mini ? 0 : 24 * U, axisUp = mini ? 14 * U : 20 * U;
  const hub = k.sub(0, H, 0);
  const cols = [c.light, VIOLET, c.second, c.third];
  // the fibre over (eta, alpha) at angle th along it, projected (the axis of the tori is y)
  const proj = (eta, al, th, out) => {
    const x1 = Math.cos(eta) * Math.cos(al + th), x2 = Math.cos(eta) * Math.sin(al + th);
    const x3 = Math.sin(eta) * Math.cos(th), x4 = Math.sin(eta) * Math.sin(th), d = sc / (1 - x4);
    return out.set(x1 * d, x3 * d, x2 * d);
  };
  const tori = [];
  const NS = mini ? 32 : 56;
  for (let i = 0; i < n; i++) {
    const eta = etaMax * Math.pow((i + 1) / n, 0.8), kf = Math.max(5, Math.round(P.fibres * (0.45 + (0.55 * (i + 1)) / n) * (mini ? 0.45 : 1)));
    const tk = hub.sub(), al0 = i * 0.37, col = cols[i % 4];
    for (let j = 0; j < kf; j++) {
      const al = al0 + (j / kf) * TAU, pts = [];
      for (let q = 0; q <= NS; q++) pts.push(proj(eta, al, ((q % NS) / NS) * TAU, V3()));
      if (j % 3 === 0) tk.shell.tube(pts, 0.42 * U, mini ? 3 : 4, mixHex(c.shellLo, c.shellHi, 0.3 + (0.6 * j) / kf));
      else tk.glow.tube(pts, 0.2 * U, 3, pale(mixHex(col, cols[(i + 1) % 4], (0.5 * j) / kf), 0.2), 0.9);
      // its point on the base sphere (polar angle twice eta), lit, turning with it
      const rS = 2.6 * U;
      tk.lit.ico(0.32 * U, 0, mat(Math.sin(2 * eta) * Math.cos(al) * rS, Math.cos(2 * eta) * rS, Math.sin(2 * eta) * Math.sin(al) * rS), col, PULSE);
    }
    const nm = mini ? 0 : kf * 2, beads = nm ? cloud(art, tk.group, nm, pale(col, 0.45), 1.3 * U, 1) : null;
    tori.push({ tk, eta, kf, al0, beads, nm, sp: (0.045 + 0.022 * i) * (i % 2 ? -1 : 1) });
  }
  // the fibre of the equator, the axis, the base sphere
  hub.lit.add(new THREE.TorusGeometry(sc, 0.36 * U, 5, 64), mat(0, 0, 0, Math.PI / 2, 0, 0), c.light, PULSE);
  hub.glow.add(new THREE.TorusGeometry(sc, 0.9 * U, 3, 64), mat(0, 0, 0, Math.PI / 2, 0, 0), pale(c.light, 0.3), 0.35);
  hub.shell.ico(2.4 * U, 2, null, mixHex(c.shellLo, c.shellHi, 0.6));
  hub.glow.ico(3.4 * U, 1, null, pale(VIOLET, 0.3), 0.3);
  const yA = mini ? -axisUp : -H + 0.4 * U;
  bar(hub.glow, V3(0, yA, 0), V3(0, axisUp, 0), 0.45 * U, pale(c.light, 0.35), 0.8);
  bar(hub.glow, V3(0, yA, 0), V3(0, axisUp, 0), 1.3 * U, VIOLET, 0.18);
  hub.lit.ico(0.9 * U, 0, mat(0, axisUp, 0), c.second, PULSE);
  if (mini) hub.lit.ico(0.9 * U, 0, mat(0, -axisUp, 0), c.second, PULSE);
  // standing: a ring of low stones about the foot of the axis, a circle of light within
  if (!mini) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, r = 7.5 * U;
      k.stone.box(2.6 * U, (1.2 + 0.6 * (i % 2)) * U, 1.6 * U, mat(Math.cos(a) * r, 0.4 * U, Math.sin(a) * r, 0, -a, 0), c.stone[1 + (i % 3)]);
    }
    k.glow.add(new THREE.RingGeometry(5.6 * U, 6.1 * U, 48), mat(0, 0.35 * U, 0, -Math.PI / 2, 0, 0), c.light, 0.7);
    k.lit.add(new THREE.TorusGeometry(1.6 * U, 0.3 * U, 4, 20), mat(0, 0.3 * U, 0, Math.PI / 2, 0, 0), c.second, PULSE);
  }
  const _p = V3();
  let nearS = 0;
  art.updates.push((t, dt, ctx) => {
    nearS = damp(nearS, nearOf(ctx), 1.2, dt);
    tori.forEach((q, i) => {
      q.tk.group.rotation.y = t * q.sp;
      q.tk.group.scale.setScalar(1 + 0.05 * nearS * (i + 1) + 0.015 * Math.sin(t * 0.3 + i));
      for (let m = 0; m < q.nm; m++) {
        const j = m >> 1, th = (m & 1 ? Math.PI : 0) + t * 0.22 * (1 + 0.15 * (j % 3)) + j * 0.9;
        proj(q.eta, q.al0 + (j / q.kf) * TAU, th, _p);
        put(q.beads, m, _p.x, _p.y, _p.z);
      }
      if (q.nm) q.beads.attr.needsUpdate = true;
    });
    hub.group.rotation.x = 0.1 * Math.sin(t * 0.05);
    hub.group.rotation.z = 0.1 * Math.sin(t * 0.041 + 1.3);
  });
  const ext = sc * (1 + Math.sin(etaMax)) / Math.cos(etaMax);
  return { light: V3(0, H, 0), focus: V3(0, H, 0), span: ext * 1.05, height: H + axisUp + U, solid: ext * 0.85, low: H - halfH - 2 * U };
}

// ------------------------------------------------------------------ VESSEL
// VESSEL: a Klein bottle of glass, the size of a hall: a body that narrows to a neck, the neck
// arching over and down its side and in through its own wall, down through the body's
// inside and out at its foot, where it flares back into the body's outer wall. One surface,
// no inside. Rings of light travel it without end: down the throat, out round the lip, up
// the body, over the arch and in through the wall again; motes run the same road.
function vessel(k, P, S, art, mini) {
  const c = art.pal, U = S * (mini ? 0.6 : 1), sc = 11 * U, rn = 0.2;
  // the turned part (inner throat, lip, body) as a profile (radius, height), in the vessel's
  // own measure; and the arch, a curve in the xy plane
  const prof = [[rn, 1.3], [rn, 0.9], [rn, 0.5]];
  for (let i = 0; i <= 6; i++) { const f = (i / 6) * Math.PI; prof.push([rn + 0.2 - 0.2 * Math.cos(f), 0.28 - 0.2 * Math.sin(f)]); }
  prof.push([0.72, 0.45], [0.9, 0.7], [1.0, 1.0], [0.95, 1.3], [0.75, 1.62], [0.48, 1.9], [0.3, 2.12], [rn, 2.35]);
  const lathe = new THREE.CatmullRomCurve3(prof.map(([r, y]) => V3(r, y, 0)), false, 'centripetal');
  const arch = [[0, 2.35], [0, 2.6]];
  for (let i = 1; i <= 8; i++) { const a = Math.PI - (i / 8) * Math.PI; arch.push([0.9 + 0.9 * Math.cos(a), 2.6 + 0.9 * Math.sin(a)]); }
  arch.push([1.8, 2.1], [1.72, 1.62], [1.45, 1.36], [1.0, 1.38], [0.55, 1.5], [0.22, 1.56], [0.04, 1.46], [0, 1.3]);
  const handle = new THREE.CatmullRomCurve3(arch.map(([x, y]) => V3(x, y, 0)), false, 'centripetal');
  const LA = lathe.getLength(), LB = handle.getLength(), sA = LA / (LA + LB);
  const y0 = mini ? -1.89 * sc : 3.6 * U - 0.08 * sc + 0.1 * U, x0 = mini ? -0.5 * sc : 0;
  const pivot = k.sub(), vk = pivot.sub(x0, y0, 0);
  // where the loop is at s (0..1): a circle (center, two axes, radius), in vk's measure
  const _t = V3(), _q = V3();
  const at = (s, o) => {
    if (s < sA) {
      lathe.getPointAt(clamp(s / sA, 0, 1), _q);
      o.c.set(0, _q.y * sc, 0); o.e1.set(1, 0, 0); o.e2.set(0, 0, 1); o.r = _q.x * sc;
    } else {
      const u = clamp((s - sA) / (1 - sA), 0, 1);
      handle.getPointAt(u, _q); handle.getTangentAt(u, _t);
      o.c.set(_q.x * sc, _q.y * sc, 0); o.e1.set(_t.y, -_t.x, 0).normalize(); o.e2.set(0, 0, 1); o.r = rn * sc;
    }
    return o;
  };
  const circ = (o, th, f, out) => out.copy(o.c).addScaledVector(o.e1, Math.cos(th) * o.r * f).addScaledVector(o.e2, Math.sin(th) * o.r * f);
  const st = () => ({ c: V3(), e1: V3(), e2: V3(), r: 0 });
  // the glass: both parts, station by station (the lip in the sheen); ribs every few
  const glass = new Builder();
  const SEG = mini ? 20 : 28, NA = mini ? 44 : 64, NB = mini ? 40 : 56;
  const A = st(), B = st(), p00 = V3(), p01 = V3(), p10 = V3(), p11 = V3();
  const piece = (s0, s1, N, ribEvery) => {
    for (let i = 0; i < N; i++) {
      const sa = s0 + ((s1 - s0) * i) / N, sb = s0 + ((s1 - s0) * (i + 1)) / N;
      at(sa, A); at(sb, B);
      const g = (sa + sb) / 2, lip = sb <= sA && A.c.y < 0.29 * sc && B.c.y < 0.29 * sc;
      const col = lip ? mixHex(c.shellLo, c.shellHi, 0.7) : mixHex(mixHex(pale(c.light, 0.2), VIOLET, smoothstep(0.1, 0.6, g)), c.second, smoothstep(0.6, 1, g));
      for (let j = 0; j < SEG; j++) {
        const t0 = (j / SEG) * TAU, t1 = ((j + 1) / SEG) * TAU;
        circ(A, t0, 1, p00); circ(A, t1, 1, p01); circ(B, t0, 1, p10); circ(B, t1, 1, p11);
        (lip ? vk.shell : glass).quad(p00.toArray(), p10.toArray(), p11.toArray(), p01.toArray(), col, 0.42);
      }
      if (i % ribEvery === 0 && !lip) {
        const pts = ringPts((th) => circ(A, th, 1.015, V3()), SEG);
        if (i % (ribEvery * 3) === 0) vk.lit.tube(pts, 0.2 * U, 3, i % 2 ? c.second : c.light, PULSE);
        else vk.shell.tube(pts, 0.16 * U, 3, c.shellHi);
      }
    }
  };
  piece(0, sA, NA, 4);
  piece(sA, 1, NB, 4);
  glassMesh(art, vk.group, glass, 0.55);
  // the lip's rim, and the collar where the arch goes in through the wall
  vk.lit.add(new THREE.TorusGeometry(0.6 * sc, 0.28 * U, 4, 48), mat(0, 0.28 * sc, 0, Math.PI / 2, 0, 0), c.second, PULSE);
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 80; i++) { handle.getPointAt(i / 80, _q); const d = Math.hypot(_q.x - 0.96, _q.y - 1.38); if (d < bd) { bd = d; best = i / 80; } }
  handle.getPointAt(best, _q); handle.getTangentAt(best, _t);
  const cp = V3(_q.x * sc, _q.y * sc, 0);
  vk.lit.add(new THREE.TorusGeometry(rn * sc * 1.3, 0.34 * U, 5, 28), orient(cp, _t).multiply(_rx), c.light, PULSE);
  vk.glow.add(new THREE.TorusGeometry(rn * sc * 1.6, 0.7 * U, 3, 28), orient(cp, _t).multiply(_rx), pale(VIOLET, 0.2), 0.45);
  // the rings of light that travel it, and the motes
  const NBND = mini ? 3 : 5, NPB = SEG + 1, ds = 0.022;
  const bands = strips(art, vk.group, NBND, NPB, (s, u, side) => (side ? pale(c.light, 0.4) : VIOLET), (s, u, side) => (side ? 0.95 : 0.12), 0.85);
  const nm = mini ? 90 : P.motes, motes = cloud(art, vk.group, nm, pale(c.second, 0.35), 1.1 * U, 1);
  const M = Array.from({ length: nm }, (_, i) => ({ s: frac(i * 0.618034), th: frac(i * 0.754877) * TAU, f: 0.3 + 0.4 * frac(i * 0.569840) }));
  const BA = st(), BB = st(), qa = V3(), qb = V3(), rate = 1 / P.lap;
  art.updates.push((t) => {
    pivot.group.rotation.y = t * 0.035;
    if (mini) vk.group.rotation.z = 0.04 * Math.sin(t * 0.13);
    for (let b = 0; b < NBND; b++) {
      const s = frac(t * rate + b / NBND);
      let s2 = s + ds;
      if (s < sA && s2 >= sA) s2 = sA - 1e-4;
      if (s2 >= 1) s2 = 1 - 1e-4;
      at(s, BA); at(s2, BB);
      for (let i = 0; i < NPB; i++) {
        const th = (i / (NPB - 1)) * TAU;
        circ(BA, th, 1.03, qa); circ(BB, th, 1.03, qb);
        bands.set(b, i, qa.x, qa.y, qa.z, qb.x, qb.y, qb.z);
      }
    }
    bands.commit();
    for (let i = 0; i < nm; i++) {
      const q = M[i];
      at(frac(q.s + t * rate * 1.3), BA);
      circ(BA, q.th + t * 0.4, q.f, qa);
      put(motes, i, qa.x, qa.y, qa.z);
    }
    if (nm) motes.attr.needsUpdate = true;
  });
  // standing: a stepped plinth of stone under its foot, a pool of light in its open mouth
  if (!mini) {
    k.stone.cyl(8.6 * U, 9.6 * U, 1.4 * U, 24, mat(0, 0.7 * U, 0), c.stone[1]);
    k.stone.cyl(5.8 * U, 6.8 * U, 2.2 * U, 24, mat(0, 2.5 * U, 0), c.stone[2]);
    k.lit.add(new THREE.TorusGeometry(6.4 * U, 0.22 * U, 4, 40), mat(0, 1.45 * U, 0, Math.PI / 2, 0, 0), c.light, PULSE);
    k.glow.add(new THREE.CircleGeometry(2.1 * U, 24), mat(0, 3.62 * U, 0, -Math.PI / 2, 0, 0), pale(c.second, 0.2), 0.7);
  }
  const top = y0 + 3.7 * sc;
  return { light: V3(0, y0 + 1.0 * sc, 0), focus: V3(0, y0 + 1.6 * sc, 0), span: 2.05 * sc, height: top, solid: 1.0 * sc, low: mini ? y0 : 0 };
}

// ------------------------------------------------------------------ DRUM
// DRUM: a drum of cells that writes its own history. Round its waist, row under row, the
// generations of a one-dimensional cellular automaton on a ring of cells: each beat the head
// at its top writes the next row by the rule (a cell's next state from itself and its two
// neighbours), and all that was written moves down one row and is lost at the foot. The
// rule's eight answers are set in a ring on its lid; now and then the rule changes, and the
// patterns that flow down the drum change with it.
function drum(k, P, S, art, mini) {
  const R = art.R, c = art.pal, U = S * (mini ? 0.6 : 1);
  const Nc = P.cells, M = P.rows, Rd = 15 * U, Hd = 30 * U, h = Hd / M, Rc = Rd + 0.15 * U;
  const headH = 1.25 * h, lidY = Hd + headH + 0.4 * U, spire = 9 * U;
  const yB = mini ? -(Hd + headH + 10.15 * U) / 2 : 7 * U;
  const dk = k.sub(0, yB, 0);
  // the drum: its dark sheen, stone rims, ribs, the head (a band that hides the row being
  // written), the lid
  dk.shell.add(new THREE.CylinderGeometry(Rd - 0.1 * U, Rd - 0.1 * U, Hd + h, Math.min(Nc, 64), 1, true), mat(0, Hd / 2, 0), (x, y) => mixHex(c.shellLo, mixHex(c.shellLo, c.shellHi, 0.45), clamp(y / Hd + 0.5, 0, 1)));
  dk.stone.add(new THREE.TorusGeometry(Rd + 0.3 * U, 1.05 * U, 6, 64), mat(0, -0.2 * U, 0, Math.PI / 2, 0, 0), c.stone[2]);
  dk.stone.add(new THREE.TorusGeometry(Rd + 0.55 * U, 0.6 * U, 5, 64), mat(0, Hd + headH, 0, Math.PI / 2, 0, 0), c.stone[3]);
  const nRib = Nc % 8 === 0 ? 8 : Nc % 6 === 0 ? 6 : 4;
  for (let i = 0; i < nRib; i++) {
    const a = (i / nRib) * TAU;
    dk.stone.box(0.45 * U, Hd, 0.45 * U, mat(Math.cos(a) * (Rc + 0.2 * U), Hd / 2, Math.sin(a) * (Rc + 0.2 * U), 0, -a, 0), c.stone[1]);
  }
  dk.shell.add(new THREE.CylinderGeometry(Rd + 0.55 * U, Rd + 0.55 * U, headH, 64, 1, true), mat(0, Hd + headH / 2, 0), mixHex(c.shellLo, c.shellHi, 0.8));
  dk.lit.add(new THREE.TorusGeometry(Rd + 0.62 * U, 0.16 * U, 3, 64), mat(0, Hd + 0.05 * U, 0, Math.PI / 2, 0, 0), c.light, PULSE);
  dk.glow.add(new THREE.TorusGeometry(Rd + 0.9 * U, 0.5 * U, 3, 64), mat(0, Hd, 0, Math.PI / 2, 0, 0), pale(c.light, 0.3), 0.4);
  dk.stone.cyl(Rd + 0.6 * U, Rd + 0.6 * U, 0.8 * U, 48, mat(0, lidY, 0), c.stone[0]);
  dk.shell.cyl(0.42 * Rd, 0.5 * Rd, 1.0 * U, 24, mat(0, lidY + 0.9 * U, 0), mixHex(c.shellLo, c.shellHi, 0.5));
  // its spire: a stem of light, and a light on it
  bar(dk.glow, V3(0, lidY + 1.4 * U, 0), V3(0, lidY + spire, 0), 0.5 * U, pale(c.light, 0.35), 0.85);
  dk.lit.ico(1.1 * U, 1, mat(0, lidY + spire, 0), c.second, PULSE);
  dk.glow.ico(2.0 * U, 1, mat(0, lidY + spire, 0), pale(VIOLET, 0.3), 0.4);
  // the cells: M + 1 rows (the one being written, under the head, and the one going out at the foot)
  const quads = [], cols = [], gw = 0.06, gh = 0.08 * h;
  for (let i = 0; i <= M; i++) {
    const yc = Hd - (i + 0.5) * h, q = i / M;
    const col = mixHex(mixHex(pale(c.light, 0.45), VIOLET, smoothstep(0, 0.55, q)), c.second, smoothstep(0.55, 1, q));
    for (let j = 0; j < Nc; j++) {
      const a0 = ((j + gw) / Nc) * TAU, a1 = ((j + 1 - gw) / Nc) * TAU, ya = yc - h / 2 + gh, yb = yc + h / 2 - gh;
      quads.push([[Math.cos(a0) * Rc, ya, Math.sin(a0) * Rc], [Math.cos(a1) * Rc, ya, Math.sin(a1) * Rc], [Math.cos(a1) * Rc, yb, Math.sin(a1) * Rc], [Math.cos(a0) * Rc, yb, Math.sin(a0) * Rc]]);
      cols.push(col);
    }
  }
  const ck = dk.sub();
  const cells = cellMesh(art, ck.group, quads, cols, 0.95);
  // the rule's eight answers on the lid: plates of sheen, lit from above when the answer is one
  const rq = [], rc = [];
  for (let b = 0; b < 8; b++) {
    const a0 = ((b + 0.08) / 8) * TAU, a1 = ((b + 0.92) / 8) * TAU, r0 = 0.58 * Rd, r1 = 0.9 * Rd, y = lidY + 0.45 * U;
    dk.shell.box((r1 - r0) * 0.98, 0.3 * U, 0.55 * r1 * (TAU / 8), mat(Math.cos((a0 + a1) / 2) * (r0 + r1) / 2, y - 0.1 * U, Math.sin((a0 + a1) / 2) * (r0 + r1) / 2, 0, -(a0 + a1) / 2, 0), c.shellHi);
    rq.push([[Math.cos(a0) * r0, y + 0.1 * U, Math.sin(a0) * r0], [Math.cos(a1) * r0, y + 0.1 * U, Math.sin(a1) * r0], [Math.cos(a1) * r1, y + 0.1 * U, Math.sin(a1) * r1], [Math.cos(a0) * r1, y + 0.1 * U, Math.sin(a0) * r1]]);
    rc.push(b % 2 ? pale(c.light, 0.3) : pale(VIOLET, 0.2));
  }
  const rule = cellMesh(art, dk.group, rq, rc, 0.95);
  // standing: on six stone columns over a ring of stone
  if (!mini) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26, r = Rd - 1.2 * U;
      k.stone.cyl(1.0 * U, 1.4 * U, yB - 1.0 * U, 8, mat(Math.cos(a) * r, (yB - 1.0 * U) / 2, Math.sin(a) * r), c.stone[1 + (i % 2)]);
      k.lit.box(1.6 * U, 0.4 * U, 1.6 * U, mat(Math.cos(a) * r, yB * 0.62, Math.sin(a) * r, 0, -a, 0), c.second, PULSE);
    }
    k.stone.add(new THREE.TorusGeometry(Rd - 1.2 * U, 1.3 * U, 5, 48), mat(0, 0.3 * U, 0, Math.PI / 2, 0, 0), c.stone[0]);
    k.glow.add(new THREE.RingGeometry(3 * U, 3.5 * U, 32), mat(0, 0.4 * U, 0, -Math.PI / 2, 0, 0), c.light, 0.6);
  }
  // sparks thrown up off the head as each row is written
  const ns = mini ? 0 : P.sparks, sparks = ns ? cloud(art, dk.group, ns, pale(c.light, 0.45), 1.0 * U, 1) : null;
  const SP = Array.from({ length: ns }, (_, i) => ({ a: frac(i * 0.618034) * TAU, ph: frac(i * 0.754877), w: 0.25 + 0.2 * frac(i * 0.41) }));
  // the automaton: rows kept in a ring, as many as are shown; generation g is written at
  // t = g * step (the drum full already at t = 0)
  const init = new Uint8Array(Nc);
  for (let j = 0; j < Nc; j++) init[j] = R() < 0.5 ? 1 : 0;
  const rows = Array.from({ length: M + 1 }, () => new Uint8Array(Nc));
  let gen = null;
  const ruleAt = (g) => P.rules[((Math.floor(g / P.epoch) % P.rules.length) + P.rules.length) % P.rules.length];
  const rowOf = (g) => rows[((g % (M + 1)) + M + 1) % (M + 1)];
  const reset = (g0) => { rowOf(g0).set(init); gen = g0; };
  const advance = () => {
    const a = rowOf(gen), b = rowOf(gen + 1), r = ruleAt(gen + 1);
    let s = 0;
    for (let j = 0; j < Nc; j++) { const v = (r >> ((a[(j + Nc - 1) % Nc] << 2) | (a[j] << 1) | a[(j + 1) % Nc])) & 1; b[j] = v; s += v; }
    // (a ring gone all dark or all lit is struck once, where the generation says)
    if (s === 0 || s === Nc) b[(((gen * 7) % Nc) + Nc) % Nc] ^= 1;
    gen++;
  };
  const G0 = -(M + 2);
  let shownRule = -1;
  art.updates.push((t) => {
    const x = t / P.step, G = Math.floor(x), f = x - G, e = smoothstep(0, 0.35, f);
    if (gen === null || G < gen) reset(G0);
    while (gen < G) advance();
    // the rows slide down one in the first third of each beat
    ck.group.position.y = h * (1 - e);
    for (let i = 0; i <= M; i++) {
      const row = rowOf(G - i), fade = i === 0 ? e : i === M ? 1 - e : 1, br = (1.05 - (0.5 * i) / M) * fade + (i === 0 ? 0.6 * (1 - f) : 0);
      const o = i * Nc;
      for (let j = 0; j < Nc; j++) cells.set(o + j, row[j] ? br : 0);
    }
    cells.commit();
    const r = ruleAt(G);
    if (r !== shownRule) { shownRule = r; for (let b = 0; b < 8; b++) rule.set(b, (r >> b) & 1 ? 1 : 0.06); rule.commit(); }
    dk.group.rotation.y = t * 0.03;
    for (let i = 0; i < ns; i++) {
      const q = SP[i], u = frac(q.ph + t * q.w), rr = Rd + 0.8 * U + u * 3 * U, a = q.a + u * 0.4;
      put(sparks, i, Math.cos(a) * rr, Hd + headH + u * u * 9 * U, Math.sin(a) * rr);
    }
    if (ns) sparks.attr.needsUpdate = true;
  });
  const top = yB + lidY + spire + 2 * U;
  return { light: V3(0, yB + lidY + spire, 0), focus: V3(0, yB + Hd * 0.55, 0), span: Rd + 1.6 * U, height: top, solid: Rd, low: mini ? yB - 1.3 * U : 0 };
}

// ------------------------------------------------------------------ SEED-HEAD
// SEED-HEAD: a seed-head the size of a chapel, nodding from a great curved stalk: its face
// set with hundreds of seeds at the golden angle, each a little further out than the last, so
// that they fall into spirals both ways (thirteen, twenty-one, thirty-four, fifty-five: the
// Fibonacci numbers). Over a minute the spirals of one count after another are lit in gold and
// turn about the face, a ring of ripening light runs from its heart to its rim, and the
// crown of gold petals about it opens wide and folds down again; from its seeds hang
// threads of light, drops of gold sliding down them.
function seedhead(k, P, S, art, mini) {
  const c = art.pal, U = S * (mini ? 0.55 : 1.15);
  const Rh = 20 * U, N = mini ? Math.min(P.seeds, 377) : P.seeds, nu = mini ? 0.35 : 0.55, Lp = 9 * U;
  const C = mini ? V3(0, 0, 0) : V3(0, 34 * U, 0);
  const body = k.sub();
  // (the head's nod is built into its geometry, not given to its group)
  const hk = body.sub(C.x, C.y, C.z);
  const Mh = mat(C.x, C.y, C.z, 0, 0, nu), Rz = new THREE.Matrix4().makeRotationZ(nu), cn = Math.cos(nu), sn = Math.sin(nu);
  const tz = (m) => (m ? Rz.clone().multiply(m) : Rz.clone());
  const Rs = 2.4 * Rh, cap0 = Math.sqrt(Rs * Rs - Rh * Rh);
  const capY = (r) => -(Math.sqrt(Rs * Rs - r * r) - cap0);
  let lo = Infinity, hi = -Infinity;
  const ext = (v) => { lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); };
  // the face (a shallow dome, underneath), its back (a bowl up to the collar), its rim
  const face = [], back = [];
  for (let i = 0; i <= 10; i++) { const r = (Rh * i) / 10; face.push(new THREE.Vector2(r, capY(r))); }
  hk.shell.add(new THREE.LatheGeometry(face, 64), tz(), mixHex(c.shellLo, c.stone[1], 0.5));
  for (const [r, y] of [[Rh * 1.01, 0], [Rh * 0.92, 0.12 * Rh], [Rh * 0.7, 0.24 * Rh], [Rh * 0.42, 0.33 * Rh], [Rh * 0.2, 0.4 * Rh], [Rh * 0.12, 0.44 * Rh]]) back.push(new THREE.Vector2(r, y));
  hk.shell.add(new THREE.LatheGeometry(back, 64), tz(), (x, y) => mixHex(c.shellLo, c.shellHi, 0.25 + (0.6 * y) / (0.44 * Rh)));
  hk.stone.add(new THREE.TorusGeometry(Rh, 0.8 * U, 5, 72), tz(mat(0, 0, 0, Math.PI / 2, 0, 0)), c.stone[2]);
  hk.lit.add(new THREE.TorusGeometry(Rh * 1.035, 0.22 * U, 3, 72), tz(mat(0, -0.3 * U, 0, Math.PI / 2, 0, 0)), GOLD, PULSE);
  for (let i = 0; i < 4; i++) hk.lit.add(new THREE.TorusGeometry(Rh * (0.2 + 0.18 * i), 0.1 * U, 3, 48), tz(mat(0, 0.1 * U + 0.03 * Rh * i, 0, Math.PI / 2, 0, 0)), c.light, PULSE);
  hk.lit.cyl(0.13 * Rh, 0.1 * Rh, 1.2 * U, 16, tz(mat(0, 0.45 * Rh, 0)), c.second, PULSE);
  for (const [x, y] of [[Rh, 0], [-Rh, 0], [0, 0.45 * Rh], [-0.5 * Rh, 0.3 * Rh]]) ext(V3(x, y, 0).applyMatrix4(Mh));
  // (and where the petals' tips go, open and folded)
  for (const tu of [0.34, 2.55]) for (const sd of [1, -1]) ext(V3(sd * (Rh + Lp * Math.cos(tu)), -Lp * Math.sin(tu), 0).applyMatrix4(Mh));
  // the seeds, at the golden angle; a light on each (two clouds: the spirals, and the ripening)
  const d = Rh * 0.95 * Math.sqrt(Math.PI / N), seeds = [];
  for (let n = 0; n < N; n++) {
    const r = Rh * 0.95 * Math.sqrt((n + 0.5) / N), a = n * GOLDEN, x = Math.cos(a) * r, z = Math.sin(a) * r, y = capY(r);
    hk.shell.add(new THREE.OctahedronGeometry(d * 0.55), tz(mat(x, y - 0.15 * d, z, 0, a, 0, 1, 0.6, 1)), mixHex(c.shellLo, c.shellHi, 0.15 + (0.75 * r) / Rh));
    seeds.push({ x, y, z, r: r / Rh, n });
  }
  // (hanging, as another's crown, the spirals alone)
  const spir = cloud(art, hk.group, N, pale(GOLD, 0.15), 1.5 * U, 1), ripe = mini ? null : cloud(art, hk.group, N, pale(c.light, 0.35), 1.2 * U, 1);
  const putR = (cl, i, x, y, z) => put(cl, i, x * cn - y * sn, x * sn + y * cn, z);
  seeds.forEach((q, i) => { putR(spir, i, q.x, q.y - 0.7 * d, q.z); if (ripe) putR(ripe, i, q.x, q.y - 0.5 * d, q.z); });
  spir.attr.needsUpdate = true;
  if (ripe) ripe.attr.needsUpdate = true;
  const aS = spir.p.geometry.attributes.aAlpha, aR = ripe ? ripe.p.geometry.attributes.aAlpha : null;
  // the pendants: threads of light, hanging straight down from every eighth seed, longest at
  // the heart; a drop of gold at each end
  const pk = body.sub(), pend = [];
  for (const q of seeds) {
    if (q.n % 8 !== 3 || q.r < 0.12) continue;
    const top = V3(q.x, q.y - 0.4 * d, q.z).applyMatrix4(Mh), L = (4 + 12 * Math.pow(1 - q.r, 1.3)) * U, bot = top.clone().add(V3(0, -L, 0));
    bar(pk.glow, top, bot, 0.1 * U, pale(c.light, 0.3), 0.7);
    pk.lit.add(new THREE.OctahedronGeometry(0.5 * U), mat(bot.x, bot.y, bot.z, 0, 0, 0, 1, 1.6, 1), GOLD, PULSE);
    pk.glow.ico(0.9 * U, 0, mat(bot.x, bot.y, bot.z), GOLD, 0.35);
    pend.push({ top, L, ph: frac(q.n * 0.618034) });
    ext(bot);
  }
  const np = mini ? 0 : pend.length, drops = np ? cloud(art, pk.group, np, pale(GOLD, 0.25), 1.0 * U, 1) : null;
  // the crown of gold petals: strips of light about the rim, opening and closing
  const NP = mini ? Math.min(P.petals, 34) : P.petals, PS = 7;
  const pet = strips(art, hk.group, NP, PS, (s, u) => mixHex(GOLD, pale(c.light, 0.3), u * 0.6), (s, u, side) => 0.9 - 0.35 * u, 0.8);
  const W = Math.min(2.6 * U, ((TAU * Rh) / NP) * 0.75);
  // standing: the stalk, out of the ground beside it and over, into the collar; leaves; roots
  if (!mini) {
    const back2 = V3(-Math.sin(nu), Math.cos(nu), 0), K = C.clone().addScaledVector(back2, 0.42 * Rh);
    const P0 = V3(-13 * U, -1.5 * U, 0), P1 = V3(-16 * U, 26 * U, 0), P2 = K.clone().addScaledVector(back2, 11 * U), P3 = K;
    const bez = (t) => { const s = 1 - t; return V3().addScaledVector(P0, s * s * s).addScaledVector(P1, 3 * s * s * t).addScaledVector(P2, 3 * s * t * t).addScaledVector(P3, t * t * t); };
    const pts = [];
    for (let i = 0; i <= 28; i++) { pts.push(bez(i / 28)); ext(pts[i]); }
    body.shell.tube(pts, (t) => (2.6 - 1.2 * t) * U, 8, (t) => mixHex(c.shellLo, c.shellHi, 0.2 + 0.6 * t));
    body.glow.tube(pts.map((p, i) => p.clone().add(V3(0, 0, (2.65 - (1.2 * i) / 28) * U))), 0.16 * U, 3, pale(c.light, 0.3), 0.75);
    for (let i = 0; i < 6; i++) { const p = bez(0.1 + i * 0.15); body.lit.add(new THREE.TorusGeometry((2.6 - 1.2 * (0.1 + i * 0.15)) * U * 1.02, 0.18 * U, 3, 16), orient(p, bez(0.11 + i * 0.15).sub(p)).multiply(_rx), i % 2 ? GOLD : c.light, PULSE); }
    for (const [tq, side] of [[0.22, 1], [0.38, -1], [0.55, 1]]) {
      const p = bez(tq), lk = body.sub(p.x, p.y, p.z);
      petal(lk.shell, 15 * U, 4.8 * U, 1.05, side > 0 ? Math.PI / 2 : -Math.PI / 2, 1.6 * U, 0, 0.5, 0.35, c.shellLo, c.shellHi, 7, 4, { b: lk.glow, color: pale(c.light, 0.3) }, 0.1 * U);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, far = 11 * U;
      const f = (t) => V3(P0.x + Math.cos(a) * far * t, art.ground(P0.x + Math.cos(a) * far * t, Math.sin(a) * far * t) + 1.0 * U * Math.sin(Math.PI * t) - t * t * 1.5 * U, Math.sin(a) * far * t);
      const rp = []; for (let j = 0; j <= 6; j++) rp.push(f(j / 6));
      body.stone.tube(rp, (t) => (1.8 - 1.4 * t) * U, 5, c.stone[1]);
    }
  }
  // (hanging, it is centered by what it is made of)
  const lift = mini ? -(lo + hi) / 2 : 0;
  body.group.position.y = lift;
  const fams = P.families, T = P.period, nf = fams.length;
  const _a = V3(), _b = V3(), rad = V3(), tan = V3();
  art.updates.push((t) => {
    // the spirals of one count at a time, a few of them lit and turning about the face
    const ph = frac(t / T), fi = Math.floor(ph * nf), tau = ph * nf - fi, F = fams[fi], env = Math.pow(Math.sin(Math.PI * tau), 0.6);
    const ring = ph * 1.25 - 0.1;
    for (let i = 0; i < N; i++) {
      const q = seeds[i], pk2 = frac(((q.n % F) * GOLDEN) / TAU) * 3 - t * 0.05;
      aS.array[i] = env * Math.pow(0.5 + 0.5 * Math.cos(TAU * pk2), 8);
      const dr = (q.r - ring) / 0.07;
      if (aR) aR.array[i] = 0.1 + 0.9 * Math.exp(-dr * dr);
    }
    aS.needsUpdate = true;
    if (aR) aR.needsUpdate = true;
    // the petals: open on the minute, folded down under the face between
    const open = 0.5 - 0.5 * Math.cos(TAU * frac(ph + 0.12)), tau0 = 2.05 + (0.14 - 2.05) * smoothstep(0, 1, open);
    for (let s = 0; s < NP; s++) {
      const a = (s / NP) * TAU + 0.5 * (TAU / NP);
      rad.set(Math.cos(a), 0, Math.sin(a)); tan.set(-Math.sin(a), 0, Math.cos(a));
      for (let i = 0; i < PS; i++) {
        const u = i / (PS - 1), tu = tau0 + 0.5 * u * (1 - 0.6 * open), w = W * Math.sqrt(Math.max(0, Math.sin(Math.PI * (0.08 + 0.9 * u))));
        const L = Lp * u, cx = rad.x * (Rh + L * Math.cos(tu)), cy = -L * Math.sin(tu) - 0.2 * U, cz = rad.z * (Rh + L * Math.cos(tu));
        _a.set(cx, cy, cz).addScaledVector(tan, -w); _b.set(cx, cy, cz).addScaledVector(tan, w);
        pet.set(s, i, _a.x * cn - _a.y * sn, _a.x * sn + _a.y * cn, _a.z, _b.x * cn - _b.y * sn, _b.x * sn + _b.y * cn, _b.z);
      }
    }
    pet.commit();
    for (let i = 0; i < np; i++) {
      const q = pend[i], u = frac(q.ph + t * 0.07);
      put(drops, i, q.top.x, q.top.y - q.L * u * u, q.top.z);
    }
    if (np) drops.attr.needsUpdate = true;
  });
  const cy = C.y + lift;
  return { light: V3(0, cy - 2 * U, 0), focus: V3(0, cy, 0), span: Rh + Lp, height: hi + lift + 2 * U, solid: Rh, low: mini ? lo + lift : 0 };
}

// ------------------------------------------------------------------ SKY LOOM
// the weaves (warp i, weft row r): true where the gold weft lies over the warp
const FIBW = (() => { let a = '1', b = '10'; while (b.length < 200) [a, b] = [b, b + a]; return b; })();
const DRAFTS = {
  twill: (i, r) => (i + r) % 4 < 2,
  chevron: (i, r) => (Math.abs((i % 16) - 8) + r) % 4 < 2,
  diamond: (i, r) => (Math.abs((i % 20) - 10) + Math.abs((r % 20) - 10)) % 4 < 2,
  basket: (i, r) => ((i >> 1) + (r >> 1)) % 2 === 0,
  fibonacci: (i, r) => (FIBW[i % 200] === '1') !== (FIBW[r % 200] === '1'),
  thue: (i, r) => { let x = 0; for (let v = i >> 1; v; v >>= 1) x ^= v & 1; for (let v = r >> 1; v; v >>= 1) x ^= v & 1; return x === 1; },
};
const DRAFT_NAME = { twill: 'a twill', chevron: 'a chevron twill', diamond: 'nested diamonds', basket: 'a basket weave', fibonacci: 'the Fibonacci word, both ways', thue: 'the Thue-Morse sequence, both ways' };

// SKY LOOM: an upright loom of stone and sheen, taller than the trees, strung with warp threads
// of light. A shuttle of gold crosses and crosses again, the heddles part the warp one way and
// the other, the reed beats each pass home, and a cloth of light grows up the frame row by
// row in a weave that follows a rule. Over a minute the cloth is finished; it hangs a while,
// then lets go from the top down, its threads going up as motes; the next is woven in
// another weave.
function skyloom(k, P, S, art, mini) {
  const c = art.pal, U = S * (mini ? 0.55 : 1);
  const Nw = P.warps, M = P.rows, Wc = 40 * U, Hcl = 32 * U, cw = Wc / Nw, ch = Hcl / M, xL = -Wc / 2;
  const yC0 = mini ? -(Hcl + 12.7 * U) / 2 : 7 * U;
  const yH = yC0 + Hcl + 5 * U, yTop = yH + 7 * U, xP = Wc / 2 + 2.6 * U, yPost0 = mini ? yC0 - 3 * U : 0, yPost1 = yTop + 2.5 * U;
  // the frame: posts, beams, feet and braces when it stands; gold finials
  for (const s of [-1, 1]) {
    k.stone.box(1.8 * U, yPost1 - yPost0, 1.8 * U, mat(s * xP, (yPost0 + yPost1) / 2, 0), c.stone[2]);
    k.shell.box(2.2 * U, 1.2 * U, 2.2 * U, mat(s * xP, yPost1 - 0.4 * U, 0), c.shellHi);
    k.lit.ico(1.3 * U, 1, mat(s * xP, yPost1 + 1.3 * U, 0), GOLD, PULSE);
    k.glow.ico(2.4 * U, 1, mat(s * xP, yPost1 + 1.3 * U, 0), pale(GOLD, 0.2), 0.3);
    for (const y of [yC0, yH, yTop]) k.lit.box(2.0 * U, 0.35 * U, 2.0 * U, mat(s * xP, y + 1.4 * U, 0), c.light, PULSE);
    if (!mini) {
      k.stone.box(3.2 * U, 1.6 * U, 15 * U, mat(s * xP, 0.5 * U, 0), c.stone[1]);
      for (const z of [-1, 1]) bar(k.stone, V3(s * xP, 0.9 * U, z * 6.5 * U), V3(s * xP, 14 * U, 0), 0.9 * U, c.stone[3]);
    } else {
      k.shell.cone(1.2 * U, 2.6 * U, 6, mat(s * xP, yPost0 - 1.2 * U, 0, Math.PI, 0, 0), c.shellLo);
    }
  }
  const beam = (y, r, col, b) => b.cyl(r, r, 2 * xP + 2 * U, 16, mat(0, y, 0, 0, 0, Math.PI / 2), col);
  beam(yTop, 1.3 * U, mixHex(c.shellLo, c.shellHi, 0.6), k.shell);
  beam(yC0 - 1.1 * U, 1.5 * U, c.stone[3], k.stone);
  k.lit.add(new THREE.CylinderGeometry(0.3 * U, 0.3 * U, Wc + 1 * U, 8), mat(0, yTop - 1.4 * U, 0.6 * U, 0, 0, Math.PI / 2), GOLD, PULSE);
  // the heddles: two bars, one for the odd warps and one for the even, moving apart and through
  const hA = k.sub(0, yH, 0), hB = k.sub(0, yH, 0);
  for (const [hk, col] of [[hA, c.light], [hB, c.second]]) {
    hk.shell.box(Wc + 3 * U, 0.6 * U, 0.6 * U, null, mixHex(c.shellLo, c.shellHi, 0.7));
    hk.glow.box(Wc + 2 * U, 0.2 * U, 0.2 * U, mat(0, -0.45 * U, 0), pale(col, 0.3), 0.8);
  }
  // the reed: a bar that beats each pass of the weft home
  const reed = k.sub(0, yC0, 0);
  reed.shell.box(Wc + 2 * U, 0.8 * U, 1.0 * U, null, mixHex(c.shellLo, c.shellHi, 0.45));
  reed.lit.box(Wc + 1 * U, 0.18 * U, 1.1 * U, mat(0, -0.45 * U, 0), c.light, PULSE);
  // the shuttle: a spindle of sheen, its middle of gold
  const sh = k.sub(xP + 3 * U, yC0, 0);
  for (const s of [-1, 1]) sh.shell.cone(0.9 * U, 2.8 * U, 8, mat(s * 1.6 * U, 0, 0, 0, 0, -s * Math.PI / 2), c.shellHi);
  sh.lit.cyl(0.95 * U, 0.95 * U, 0.6 * U, 10, mat(0, 0, 0, 0, 0, Math.PI / 2), GOLD, PULSE);
  sh.glow.ico(1.5 * U, 1, null, pale(GOLD, 0.25), 0.45);
  // the cloth, cell by cell; the warp above the fell, as ribbons of light through the heddles
  const quads = [];
  for (let r = 0; r < M; r++) for (let i = 0; i < Nw; i++) {
    const x0 = xL + i * cw + 0.07 * cw, x1 = xL + (i + 1) * cw - 0.07 * cw, y0 = yC0 + r * ch + 0.06 * ch, y1 = yC0 + (r + 1) * ch - 0.06 * ch;
    quads.push([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
  }
  const cloth = cellMesh(art, k.group, quads, quads.map(() => GOLD), 0.95);
  const warpCol = (r) => mixHex(pale(c.light, 0.15), c.second, 0.25 + 0.5 * Math.pow(r / M, 1.2));
  const ww = Math.min(0.14 * U, cw * 0.22);
  const warp = strips(art, k.group, Nw, 3, (s) => (s % 2 ? pale(c.light, 0.3) : pale(c.second, 0.3)), (s, u) => 0.55 + 0.25 * u, 0.7);
  // motes of gold: trailing the shuttle, going up off the cloth as it lets go
  const nm = mini ? 0 : P.motes, motes = nm ? cloud(art, k.group, nm, pale(GOLD, 0.2), 1.0 * U, 1) : null;
  const T = P.period, WEAVE = 0.8, HOLD = 0.9, D = 2.2 * U;
  const draftAt = (t) => P.drafts[((Math.floor(t / T) % P.drafts.length) + P.drafts.length) % P.drafts.length];
  // where the work is at t: rows done (fractional), the fell
  const state = (t) => {
    const ph = frac(t / T);
    if (ph < WEAVE) { const rf = (ph / WEAVE) * M; return { ph, rf, rows: Math.floor(rf), q: rf - Math.floor(rf), weave: true, keep: M }; }
    if (ph < HOLD) return { ph, rf: M, rows: M, q: 0, weave: false, keep: M };
    return { ph, rf: M, rows: M, q: 0, weave: false, keep: M * (1 - (ph - HOLD) / (1 - HOLD)) };
  };
  const shuttleX = (r, q) => { const e = smoothstep(0.05, 0.8, q), x = -Wc / 2 - 3 * U + e * (Wc + 6 * U); return r % 2 ? -x : x; };
  let shown = null;
  art.updates.push((t) => {
    const s = state(t), dr = draftAt(t), over = DRAFTS[dr];
    if (dr !== shown) {
      shown = dr;
      for (let r = 0; r < M; r++) for (let i = 0; i < Nw; i++) cloth.setColor(r * Nw + i, over(i, r) ? (r % 2 ? GOLD : pale(GOLD, 0.2)) : warpCol(r));
      cloth.commit(true);
    }
    // the cloth: rows done lit, the row in work lit behind the shuttle, the rows let go dark
    const sx = s.weave ? shuttleX(s.rows, s.q) : xP + 3 * U;
    for (let r = 0; r < M; r++) {
      const fade = clamp(s.keep - r, 0, 1);
      for (let i = 0; i < Nw; i++) {
        let e = 0;
        if (r < s.rows) e = 0.85 + (r === s.rows - 1 ? 0.3 * (1 - s.q) : 0);
        else if (r === s.rows && s.weave) { const xc = xL + (i + 0.5) * cw; e = (s.rows % 2 ? xc > sx : xc < sx) ? 1.15 : 0; }
        cloth.set(r * Nw + i, e * fade);
      }
    }
    cloth.commit();
    // the fell, the shed, the reed, the shuttle
    const fellW = yC0 + (s.weave ? s.rows : Math.min(M, s.keep)) * ch;
    const sg = (r) => (r % 2 ? 1 : -1), open = s.weave ? sg(s.rows - 1) + (sg(s.rows) - sg(s.rows - 1)) * smoothstep(0, 0.12, s.q) : 0;
    hA.group.position.z = D * open; hB.group.position.z = -D * open;
    for (let i = 0; i < Nw; i++) {
      const x = xL + (i + 0.5) * cw, z = (i % 2 ? 1 : -1) * D * open;
      warp.set(i, 0, x - ww, fellW, 0, x + ww, fellW, 0);
      warp.set(i, 1, x - ww, yH - 0.5 * U, z, x + ww, yH - 0.5 * U, z);
      warp.set(i, 2, x - ww, yTop, 0, x + ww, yTop, 0);
    }
    warp.commit();
    const beat = s.weave ? smoothstep(0.82, 0.93, s.q) * (1 - smoothstep(0.93, 1, s.q)) : 0;
    reed.group.position.y = fellW + ch + 0.6 * U + (1 - beat) * 3.2 * U;
    if (s.weave) sh.group.position.set(sx, fellW + ch * 0.5, 0);
    else sh.group.position.set(xP + 3.2 * U, yC0 + Math.min(M, s.keep) * ch * 0.5, 0);
    sh.group.rotation.x = t * 0.8;
    for (let i = 0; i < nm; i++) {
      const g1 = frac(i * 0.618034), g2 = frac(i * 0.754877);
      if (s.weave) {
        const back = g1 * 1.4, tt = t - back, s2 = state(tt);
        const x = s2.weave ? shuttleX(s2.rows, s2.q) : sx;
        put(motes, i, x + (g2 - 0.5) * 1.5 * U, yC0 + (s2.rows + 0.5) * ch + back * 1.6 * U, Math.sin(i * 1.7) * back * 2 * U);
      } else {
        const u = frac(g1 + t * 0.12), y0 = yC0 + Math.min(M, s.keep) * ch;
        put(motes, i, xL + g2 * Wc, y0 + u * 14 * U, Math.sin(i * 2.3 + t * 0.4) * 2.5 * U * u);
      }
    }
    if (nm) motes.attr.needsUpdate = true;
  });
  const top = yPost1 + 3.7 * U;
  return { light: V3(0, yC0 + Hcl * 0.6, 0), focus: V3(0, yC0 + Hcl * 0.55, 0), span: xP + 2 * U, height: top, solid: Wc / 2, low: mini ? yPost0 - 2.5 * U : 0 };
}

// ------------------------------------------------------------------ the forms
const RULES = [30, 45, 54, 73, 90, 105, 110, 126, 150, 22];
const FIBS = [13, 21, 34, 55, 89];

export const NEW_FORMS = {
  // EPIC
  hopf: {
    code: 'HPF', cls: 'Hopf fibration', nouns: ['Fibration', 'Fibre', 'Linkage', 'Torus', 'Bundle', 'Circlework'], set: 'plus', from: 1,
    params(R, depth) {
      const tori = Math.min(4, 2 + Math.floor(depth / 3) + (R() < 0.35 ? 1 : 0)), fibres = Math.min(24, 12 + depth + R.int(0, 2));
      return { tori, fibres,
        text: `${Num(tori)} nested tori woven of circles of light, every circle linked once with every other, about one bright circle and an axis that goes up out of sight; each torus turns at its own pace, and the circles slide along one another and stay circles.` };
    },
    build: hopf,
  },
  vessel: {
    code: 'KLN', cls: 'Klein vessel', nouns: ['Vessel', 'Bottle', 'Flask', 'Ampulla', 'Throat', 'Inside'], set: 'plus', from: 1,
    params(R, depth) {
      const motes = Math.min(420, 160 + depth * 24), lap = R.range(15, 21);
      return { motes, lap,
        text: `A bottle of glass the size of a hall whose neck arches over, goes in through its own side and opens at its foot into its outside: one surface, no inside. Rings of light travel it, once round in about ${Math.round(lap)} seconds, with ${motes} motes on the same road.` };
    },
    build: vessel,
  },
  drum: {
    code: 'AUT', cls: 'Rule drum', nouns: ['Drum', 'Rule', 'Generation', 'Register', 'Automaton', 'Ledger'], set: 'plus', from: 1,
    params(R, depth) {
      const cells = Math.min(80, 40 + 8 * Math.floor(depth / 2)), rows = Math.min(34, 20 + Math.floor(depth * 1.4));
      const pool = RULES.slice(), rules = [];
      const nr = Math.min(3, 1 + Math.floor((depth + 1) / 3));
      while (rules.length < nr) rules.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
      const step = R.range(1.1, 1.7), epoch = R.int(36, 60), sparks = Math.min(220, 90 + depth * 12);
      return { cells, rows, rules, step, epoch, sparks,
        text: `A drum of ${cells} cells round and ${rows} rows deep: each beat its head writes the next generation of ${rules.length > 1 ? `a rule (by turns ${rules.slice(0, -1).join(', ')} and ${rules[rules.length - 1]})` : `rule ${rules[0]}`}, and all that was written moves down one row and is lost at its foot.` };
    },
    build: drum,
  },
  // LEGENDARY
  seedhead: {
    code: 'CPT', cls: 'Seed-head', nouns: ['Seed-head', 'Capitulum', 'Spiral', 'Ripening', 'Whorl', 'Phyllotaxis'], set: 'plus', from: 1,
    params(R, depth) {
      const seeds = Math.min(987, 377 + depth * 60), petals = R.pick([34, 55]), period = R.range(56, 68);
      const families = seeds > 640 ? FIBS.slice() : FIBS.slice(0, 4);
      return { seeds, petals, period, families,
        text: `A seed-head nodding from a great stalk, ${seeds} seeds set at the golden angle on its face; over a minute the spirals of ${families.slice(0, -1).join(', ')} and ${families[families.length - 1]} are lit in gold one count after another, ripening runs from its heart to its rim, and its crown of ${petals} gold petals opens and folds again.` };
    },
    build: seedhead,
  },
  skyloom: {
    code: 'WFT', cls: 'Sky loom', nouns: ['Loom', 'Weft', 'Warp', 'Shuttle', 'Cloth', 'Heddle'], set: 'plus', from: 1,
    params(R, depth) {
      const warps = Math.min(92, 52 + depth * 4), rows = Math.min(48, 28 + depth * 2), period = R.range(64, 78), motes = Math.min(260, 120 + depth * 14);
      const pool = Object.keys(DRAFTS), drafts = [];
      while (drafts.length < 3) drafts.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
      return { warps, rows, period, motes, drafts,
        text: `An upright loom taller than the trees, strung with ${warps} warp threads of light: a gold shuttle crosses and crosses again and a cloth of light grows up it row by row, in ${DRAFT_NAME[drafts[0]]}, then ${DRAFT_NAME[drafts[1]]}, then ${DRAFT_NAME[drafts[2]]}; each, finished, hangs a while and lets go from the top down.` };
    },
    build: skyloom,
  },
};
