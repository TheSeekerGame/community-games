import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { glowMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { STONE, RIM, PULSE, beam } from './parts.js';

// Instruments the fog keeps: wild artifacts of the forest at large, each a piece of
// physics left running where nobody watches it.
//   pendulum   a pendulum on a gantry of stone, its plane turning with the planet, drawing
//              a rosette of light on the ground, stroke by stroke
//   hourglass  an hourglass as tall as the trees, its sand of light running down, and
//              turning itself over when it has run
//   mobile     a mobile hung from nothing: arms balanced on arms, discs at their ends,
//              each arm turning on its own
//   lens       a great lens held in a ring over a clearing, gathering the light of the sky
//              to one burning point on the ground

function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}
function finish(out, update) {
  return {
    ...out,
    mats: out.fx.map(([m]) => m),
    update(t, beat, c) {
      for (const [m, o] of out.fx) m.uniforms.uOpacity.value = o * (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      if (update) update(t, beat, c);
    },
  };
}
// a geometry made of lines of light (strips of quads lying flat), to be rewritten: n quads
function quads(n) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 6 * 3), col = new Float32Array(n * 6 * 3).fill(1), em = new Float32Array(n * 6).fill(1);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return { g, pos, em };
}

// ------------------------------------------------------------------ pendulum
function pendulum(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), S = d.size, H = P.height, W = P.span;
  // the gantry: two pillars and a beam
  for (const q of [-1, 1]) {
    b.box(2.4 * S, H + 2, 2.4 * S, mat(q * W / 2, H / 2 - 1, 0), STONE[2]);
    b.box(3.2 * S, 1 * S, 3.2 * S, mat(q * W / 2, H * 0.3, 0), RIM);
  }
  b.box(W + 4 * S, 2.2 * S, 2.6 * S, mat(0, H, 0), STONE[3]);
  // the floor it draws on: a disc of dark stone
  const floorY = ctx.ground(0, 0) + 0.3, Rf = Math.min(W * 0.42, H * 0.45);
  b.cyl(Rf + 2, Rf + 2.5, 1.2, 40, mat(0, floorY - 0.4, 0), STONE[0]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the bob on its wire
  const arm = new THREE.Group();
  arm.position.y = H - 1.2 * S;
  const ab = new Builder(), L = H - 1.2 * S - floorY - 3 * S;
  ab.box(0.12 * S, L, 0.12 * S, mat(0, -L / 2, 0), RIM);
  ab.ico(1.8 * S, 1, mat(0, -L, 0), A, PULSE);
  ab.cone(0.5 * S, 1.4 * S, 6, mat(0, -L - 2.2 * S, 0, Math.PI, 0, 0), RIM);
  arm.add(new THREE.Mesh(ab.build(), mats.glow));
  group.add(arm);
  // the rosette: the bob's point, kept as a line of light on the floor
  const N = 900, Q = quads(N), fx = [];
  const trace = lightMesh(Q.g, fx, 0.8);
  group.add(trace);
  for (let i = 0; i < Q.pos.length; i += 3) Q.pos[i + 1] = -9999;
  let n = 0, last = null;
  const amp = Math.asin(clamp(Rf / L, 0, 0.95)) * 0.95, w = Math.sqrt(9.8 / Math.max(L, 1)) * 1.4, prec = P.prec;
  return finish({ group, fx, light: new THREE.Vector3(0, H - L, 0), focus: new THREE.Vector3(0, H * 0.5, 0), span: W * 0.65, clear: W * 0.6 + 8, height: H + 2, solid: { r: W * 0.55, top: H + 2, low: 0 } }, (t) => {
    // its swing, a little open (a thin ellipse), its plane turning: a flower of strokes
    const th = amp * Math.sin(t * w), th2 = amp * 0.28 * Math.cos(t * w), plane = t * prec;
    const ax = Math.cos(plane) * th - Math.sin(plane) * th2, az = Math.sin(plane) * th + Math.cos(plane) * th2;
    arm.rotation.set(ax, 0, az, 'YXZ');
    const cur = [L * Math.sin(az), -L * Math.cos(az) * Math.sin(ax)];
    if (!last) { last = cur; return; }
    const dx = cur[0] - last[0], dz = cur[1] - last[1], l = Math.hypot(dx, dz);
    if (l < 0.6) return;
    const nx = (-dz / l) * 0.12 * S, nz = (dx / l) * 0.12 * S, y = floorY + 0.35;
    Q.pos.set([last[0] - nx, y, last[1] - nz, last[0] + nx, y, last[1] + nz, cur[0] + nx, y, cur[1] + nz, last[0] - nx, y, last[1] - nz, cur[0] + nx, y, cur[1] + nz, cur[0] - nx, y, cur[1] - nz], (n % N) * 18);
    n++;
    last = cur;
    Q.g.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ hourglass
function hourglass(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), S = d.size, H = P.height, Rb = H * 0.28;
  const base = ctx.ground(0, 0);
  // the frame: two plates and the posts between them
  const frame = new THREE.Group();
  frame.position.y = base + H / 2 + 2 * S;
  const fb = new Builder();
  for (const q of [-1, 1]) fb.cyl(Rb * 1.15, Rb * 1.15, 1.4 * S, P.posts * 2, mat(0, (q * H) / 2, 0), STONE[3]);
  for (let i = 0; i < P.posts; i++) { const a = (i / P.posts) * TAU; fb.box(1 * S, H, 1 * S, mat(Math.cos(a) * Rb * 1.05, 0, Math.sin(a) * Rb * 1.05), STONE[1]); }
  frame.add(new THREE.Mesh(fb.build(), mats.body));
  // the glass: two bulbs meeting at a waist
  const fx = [];
  const pts = [];
  for (let i = 0; i <= 24; i++) { const v = i / 24; pts.push(new THREE.Vector2(Rb * (0.1 + 0.9 * Math.pow(Math.sin(Math.PI * Math.abs(2 * v - 1)), 0.8)), (v - 0.5) * H * 0.96)); }
  const gg = new THREE.LatheGeometry(pts, 28);
  const nv = gg.attributes.position.count;
  gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3).fill(1), 3));
  gg.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(nv).fill(1), 1));
  const glass = lightMesh(gg, fx, 0.22, { fresnel: 0.9 });
  glass.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.6));
  frame.add(glass);
  // the sand: grains of light, running from the upper bulb to the lower
  const n = 260, pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(1), al = new Float32Array(n).fill(1);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  pg.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const pm = pointsMaterial({ color: mixHex(A, 0xfff1c9, 0.5), size: 0.7 * S, additive: true, opacity: 1 });
  fx.push([pm, 1]);
  const sand = new THREE.Points(pg, pm);
  sand.layers.set(LAYER_FX);
  sand.frustumCulled = false;
  frame.add(sand);
  const R = rng(d.seed[5]);
  const G = Array.from({ length: n }, (_, i) => ({ a: R() * TAU, r: Math.sqrt(R()), u: i / n }));
  const group = new THREE.Group();
  group.add(frame);
  const period = P.period, turn = 3;
  return finish({ group, fx, light: new THREE.Vector3(0, base + H / 2 + 2 * S, 0), focus: new THREE.Vector3(0, base + H / 2, 0), span: Math.max(Rb * 1.3, H * 0.45), clear: Rb * 1.5 + 8, height: base + H + 4 * S, solid: { r: Rb * 1.2, top: base + H + 3 * S, low: 0 } }, (t) => {
    const cyc = t % (period + turn), run = Math.min(1, cyc / period);
    // over, when it has run: a slow half turn about its waist
    frame.rotation.z = cyc > period ? Math.PI * (Math.floor(t / (period + turn)) + (1 - Math.cos(((cyc - period) / turn) * Math.PI)) / 2) : Math.PI * Math.floor(t / (period + turn));
    const flip = Math.floor(t / (period + turn)) % 2 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const g = G[i];
      // its grains: the heap above the waist going down, a thread falling, the heap below
      // growing (all as the glass stands now: it has been turned over as many times)
      let y, r;
      if (g.u >= run) { const f = (g.u - run) / Math.max(1e-3, 1 - run); y = H * 0.04 + f * H * 0.36 * (1 - run); r = Rb * 0.8 * g.r * (0.3 + 0.7 * f); }
      else if (g.u >= run - 0.04) { const f = (run - g.u) / 0.04; y = H * 0.04 - f * (H * 0.5 - H * 0.36 * run); r = 0.25 * S * g.r; }
      else { const f = g.u / Math.max(1e-3, run - 0.04); y = -H * 0.46 + f * H * 0.36 * run; r = Rb * 0.8 * g.r * (1 - 0.7 * f); }
      pos[i * 3] = Math.cos(g.a) * r; pos[i * 3 + 1] = y * flip; pos[i * 3 + 2] = Math.sin(g.a) * r;
    }
    pg.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ mobile
function mobile(d, A, mats, ctx) {
  const P = d.params, S = d.size, R = rng(d.seed[5]), H = P.height;
  const group = new THREE.Group(), arms = [];
  const top = new THREE.Group();
  top.position.y = ctx.ground(0, 0) + H;
  group.add(top);
  // an arm: a rod hung at a point, a disc (or another arm) at each end, balanced
  const hang = (parent, len, k) => {
    const piv = new THREE.Group();
    parent.add(piv);
    const b = new Builder(), wire = (2 + R() * 3) * S;
    b.box(0.1 * S, wire, 0.1 * S, mat(0, -wire / 2, 0), RIM);
    const l0 = len * (0.35 + R() * 0.3), l1 = len - l0;
    b.box(len, 0.35 * S, 0.35 * S, mat((l1 - l0) / 2, -wire, 0), STONE[3]);
    piv.add(new THREE.Mesh(b.build(), mats.body));
    for (const [x, side] of [[-l0, 0], [l1, 1]]) {
      const end = new THREE.Group();
      end.position.set(x, -wire, 0);
      piv.add(end);
      if (k > 0 && (side === 1 || R() < 0.5)) hang(end, len * 0.66, k - 1);
      else {
        const db = new Builder(), r = (1.2 + R() * 2.2) * S;
        db.box(0.08 * S, 2 * S, 0.08 * S, mat(0, -1 * S, 0), RIM);
        db.cyl(r, r, 0.4 * S, 18, mat(0, -2 * S - r, 0, Math.PI / 2, 0, 0), R() < 0.35 ? A : STONE[(arms.length) % 4], R() < 0.35 ? PULSE : 0);
        end.add(new THREE.Mesh(db.build(), mats.glow));
      }
    }
    arms.push({ piv, sp: (0.08 + R() * 0.15) * (R() < 0.5 ? 1 : -1), ph: R() * TAU });
  };
  hang(top, P.span, P.levels);
  const gb = new Builder();
  gb.ico(0.9 * S, 1, mat(0, 0, 0), mixHex(A, 0xffffff, 0.4), 1);
  const fx = [];
  top.add(lightMesh(gb.build(), fx, 0.9));
  return finish({ group, fx, light: new THREE.Vector3(0, top.position.y, 0), focus: new THREE.Vector3(0, top.position.y - P.span * 0.4, 0), span: P.span * 0.8, clear: P.span * 0.7 + 6, height: top.position.y + 3 }, (t) => {
    for (const a of arms) { a.piv.rotation.y = t * a.sp + a.ph; a.piv.rotation.z = Math.sin(t * 0.3 + a.ph) * 0.04; }
  });
}

// ------------------------------------------------------------------ lens
function lens(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), S = d.size, H = P.height, Rl = P.radius, R = rng(d.seed[5]);
  const base = ctx.ground(0, 0);
  // three legs holding the ring
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3, fx0 = Math.cos(a) * Rl * 1.6, fz0 = Math.sin(a) * Rl * 1.6;
    beam(b, new THREE.Vector3(fx0, ctx.ground(fx0, fz0) - 0.5, fz0), new THREE.Vector3(Math.cos(a) * Rl * 1.05, base + H, Math.sin(a) * Rl * 1.05), 1.4 * S, STONE[i % 4]);
  }
  const ring = new THREE.Group();
  ring.position.y = base + H;
  const rb = new Builder();
  rb.add(new THREE.TorusGeometry(Rl * 1.05, 0.9 * S, 6, 40), mat(0, 0, 0, Math.PI / 2, 0, 0), STONE[3]);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; rb.box(0.5 * S, 0.5 * S, 0.5 * S, mat(Math.cos(a) * Rl * 1.05, 1 * S, Math.sin(a) * Rl * 1.05), A, PULSE); }
  ring.add(new THREE.Mesh(rb.build(), mats.glow));
  // the glass: a lens, thin at its edge, clear but for its rim of light
  const fx = [];
  const lg = new THREE.SphereGeometry(Rl * 3, 32, 6, 0, TAU, 0, Math.asin(1 / 3));
  lg.translate(0, -Rl * 3 * Math.cos(Math.asin(1 / 3)), 0);
  const lg2 = lg.clone(); lg2.scale(1, -1, 1);
  for (const g of [lg, lg2]) {
    const nv = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3).fill(1), 3));
    g.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(nv).fill(1), 1));
    const m = lightMesh(g, fx, 0.2, { fresnel: 0.95 });
    m.material.uniforms.uTint.value.setHex(mixHex(A, 0xffffff, 0.7));
    ring.add(m);
  }
  // the light it gathers: a cone down to one point, and the point burning
  const cg = new THREE.ConeGeometry(Rl * 0.95, H - 1, 32, 1, true);
  cg.rotateX(Math.PI);
  cg.translate(0, -(H - 1) / 2, 0);
  const cn = cg.attributes.position.count, ca = new Float32Array(cn);
  for (let i = 0; i < cn; i++) ca[i] = 0.15 + 0.85 * clamp(1 - (cg.attributes.position.getY(i) + H) / H, 0, 1);
  cg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cn * 3).fill(1), 3));
  cg.setAttribute('emissive', new THREE.BufferAttribute(ca, 1));
  const cone = lightMesh(cg, fx, 0.35, { fresnel: 0.8 });
  cone.material.uniforms.uTint.value.setHex(mixHex(A, 0xfff1c9, 0.5));
  ring.add(cone);
  const pb = new Builder();
  pb.ico(1.2 * S, 1, mat(0, base + 0.8, 0), 0xffffff, 1);
  pb.add(new THREE.RingGeometry(1.6 * S, 2.6 * S, 24), mat(0, base + 0.3, 0, -Math.PI / 2, 0, 0), mixHex(A, 0xfff1c9, 0.4), 0.8);
  const point = lightMesh(pb.build(), fx, 1);
  // and what it burns: the ground scorched in a ring, stones blackened
  for (let i = 0; i < 9; i++) { const a = R() * TAU, r = (3 + R() * 4) * S; b.box(0.8 * S, 0.3, 0.8 * S, mat(Math.cos(a) * r, ctx.ground(Math.cos(a) * r, Math.sin(a) * r) + 0.1, Math.sin(a) * r, 0, a, 0), 0x16130f); }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(ring);
  group.add(point);
  return finish({ group, fx, light: new THREE.Vector3(0, base + 2, 0), focus: new THREE.Vector3(0, base + H * 0.55, 0), span: Rl * 1.7, clear: Rl * 1.8 + 6, height: base + H + 3 * S, solid: { r: Rl * 1.2, top: base + H + 2 * S, low: base + H - 2 * S } }, (t) => {
    ring.rotation.y = t * 0.03;
    point.scale.setScalar(1 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13) * 0.05);
  });
}

export const INSTRUMENTS = { pendulum, hourglass, mobile, lens };
