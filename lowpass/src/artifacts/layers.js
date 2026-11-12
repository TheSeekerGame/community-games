import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { stratum } from './strata.js';
import { STONE, RIM, PULSE, flatSeg, motes, driftMotes } from './parts.js';
import { buildDeep } from './deepforms.js';

// What lies in a site's artifact, built over what stands at the surface (deep.js says what;
// models.js calls this once the core is built). The core is left as it is, for everyone;
// the layers a pilot is attuned to are drawn over and about it, in the colors of the
// stratum that pilot sees to:
//   I     its echo: the core's own shape again, larger, in light, standing about it; a ring
//         of that light on the ground, motes of it rising
//   II…   its true form (one of the deep's, deepforms.js), hanging over it, a thread of
//         light between them; then whatever gathers about that, layer by layer
// A trace's true form does not hang: it stands on the ground beside the little there is.
// And where more lies in it than this pilot sees, a few small lights flicker over it, one
// for each layer still hidden (six at most), each in the color of the stratum it waits in.

// the core's masses, as they stand, in one piece of light
function echoOf(out) {
  const one = new Builder();
  out.group.updateMatrixWorld(true);
  const inv = out.group.matrixWorld.clone().invert();
  out.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.layers.mask === 1 << LAYER_FX || !o.geometry.attributes.color || o.userData.noFx) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    one.merge(g, inv.clone().multiply(o.matrixWorld));
  });
  if (one.empty) return null;
  const geo = one.build();
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  geo.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  return geo;
}

function light(geo, opts) {
  const m = glowMaterial({ fog: 0.5, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  mesh.userData.noFx = true;
  return mesh;
}

// out: the core, built (models.js); d: its description (d.over: what lies over it for
// this pilot, d.depth: how many layers that is, d.res: how many there are)
export function addLayers(out, d, ctx) {
  const seen = d.depth, o = d.over, S0 = d.size;
  const fades = [], ups = [], mats = [];
  const group = new THREE.Group();
  out.group.add(group);
  let top = out.height;
  const solids = out.solid ? [out.solid] : [];
  if (o) {
    const st = stratum(seen), tint = new THREE.Color(st.light);
    // I: its echo, about it
    const geo = d.trace ? null : echoOf(out);
    if (geo) {
      const k = 1.3 + Math.min(0.3, 0.05 * (seen - 1));
      const e = light(geo, { opacity: 0.2, fresnel: 0.75, tint: tint.clone().multiplyScalar(2.2) });
      const holder = new THREE.Group();
      holder.add(e);
      group.add(holder);
      fades.push([e.material, 0.2]);
      ups.push((t, c) => {
        const b = k * (1 + 0.012 * Math.sin(t * 0.5)) + 0.02 * ((c.pulse ?? 1) - 0.6);
        holder.scale.set(b, b, b);
        holder.rotation.y = Math.sin(t * 0.21) * 0.09;
      });
      top = Math.max(top, out.height * k);
    }
    // its ring on the ground, and its motes
    const rr = Math.max(7, out.span * 1.25), rb = new Builder();
    for (let i = 0; i < 72; i++) {
      const a0 = (i / 72) * TAU, a1 = ((i + 1) / 72) * TAU;
      const p0 = new THREE.Vector3(Math.cos(a0) * rr, ctx.ground(Math.cos(a0) * rr, Math.sin(a0) * rr) + 0.3, Math.sin(a0) * rr);
      const p1 = new THREE.Vector3(Math.cos(a1) * rr, ctx.ground(Math.cos(a1) * rr, Math.sin(a1) * rr) + 0.3, Math.sin(a1) * rr);
      flatSeg(rb, p0, p1, 0.5, i % 9 === 0 ? 0xffffff : st.light, 1);
    }
    const ring = light(rb.build(), { opacity: 0.55, fog: 0.8 });
    group.add(ring);
    fades.push([ring.material, 0.55]);
    const mo = motes(mixHex(st.light, 0xffffff, 0.3), 30 + 6 * Math.min(seen, 6), rr, Math.max(14, out.height * 1.2), d.seed[6] ^ 77, 0.45);
    mo.userData.noFx = true;
    group.add(mo);
    mats.push(mo.material);
    ups.push((t) => driftMotes(mo, t));
    // II…: its true form
    if (o.form) {
      const pair = { body: worldMaterial({ unique: true }), glow: worldMaterial({ unique: true }) };
      const dd = { ...d, family: 'deep', depth: seen, size: o.size, params: o.params, form: o.form, accent: st.light, strength: st.glow, plus: d.marked };
      // a trace's stands beside it; else it hangs, its lowest part clear of the core's top
      // (a tall core reaches a little way up into it)
      const a = o.tilt * TAU, D = o.stand ? 26 * o.size : 0, dx = Math.cos(a) * D, dz = Math.sin(a) * D;
      const y0 = o.stand ? ctx.ground(dx, dz) : 0;
      const base = o.stand ? undefined : (out.height < 45 ? out.height : 45 + (out.height - 45) * 0.5) + 6 * o.size;
      const model = buildDeep(dd, st.light, pair, { ...ctx, ground: (x, z) => ctx.ground(x + dx, z + dz) - y0, floatOver: base });
      model.group.position.set(dx, y0, dz);
      group.add(model.group);
      mats.push(pair.body, pair.glow, ...model.mats);
      const off = new THREE.Vector3(dx, y0, dz);
      ups.push((t, c, beat) => model.update(t, beat, c.shipLocal ? { ...c, shipLocal: c.shipLocal.clone().sub(off) } : c));
      top = Math.max(top, y0 + model.height);
      solids.push({ ...model.solid, top: y0 + model.solid.top, low: y0 + model.solid.low, x: dx, z: dz });
      out.over = { model, x: dx, y: y0, z: dz };
      if (o.stand) out.clearings = [...(out.clearings || []), [dx, dz, model.clear]];
      else {
        // the thread between them
        const from = out.light.y, to = model.focus.y, tb = new Builder();
        if (to > from + 4) {
          tb.cyl(0.16, 0.16, to - from, 5, mat(out.light.x, (from + to) / 2, out.light.z), st.light, 1);
          const th = light(tb.build(), { opacity: 0.3 });
          group.add(th);
          fades.push([th.material, 0.3]);
        }
      }
      // what the camera frames, what the scanner reaches for: all of it
      out.span = Math.max(out.span, model.span, o.stand ? D + model.span : 0);
      out.focus = new THREE.Vector3(dx * 0.5, (out.focus.y + y0 + model.focus.y) / 2, dz * 0.5);
    }
  }
  // more in it than is seen: a small light for each layer still hidden, flickering
  const hidden = Math.min(6, d.res - seen);
  if (hidden > 0) {
    const hb = new Builder(), R = rng(d.seed[3] ^ 0x1234567);
    const y0 = top + (d.trace && !o ? 3 : 7), step = d.trace && !o ? 1.6 : 4.2, r = d.trace && !o ? 0.35 : 0.8;
    for (let i = 0; i < hidden; i++) hb.add(new THREE.OctahedronGeometry(r * (1 - i * 0.07), 0), mat(out.light.x, y0 + i * step, out.light.z, 0, R() * TAU, 0, 1, 1.6, 1), stratum(seen + 1 + i).light, 1);
    const h = light(hb.build(), { opacity: 0.5, fog: 0.35 });
    group.add(h);
    mats.push(h.material);
    const ph = R() * 10;
    ups.push((t, c) => {
      // (mostly faint, now and then bright for a moment: something there, not quite seen)
      const f = Math.max(0, Math.sin(t * 1.7 + ph) * Math.sin(t * 0.43 + ph * 2.3)) ** 2;
      h.material.uniforms.uOpacity.value = (0.1 + 0.75 * f) * (c.reveal ?? 1);
      h.rotation.y = t * 0.4;
    });
    top = Math.max(top, y0 + hidden * step);
    out.hidden = hidden;
  }
  // (the photograph frames it whole)
  if (o && o.form && !o.stand) out.span = Math.max(out.span, top * 0.52);
  out.height = Math.max(out.height, top);
  out.solids = solids;
  out.mats.push(...mats, ...fades.map(([m]) => m));
  const up = out.update;
  out.update = (t, beat, c) => {
    up(t, beat, c);
    const rv = c.reveal ?? 1, pulse = c.pulse ?? 1;
    for (const [m, base] of fades) m.uniforms.uOpacity.value = base * rv * (0.75 + pulse * 0.3);
    for (const u of ups) u(t, c, beat);
  };
}

// ------------------------------------------------------------------ a trace
// Next to nothing: what stands at the surface where a great deal lies under it.
export function trace(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]);
  const rock = (r, seed) => { const g = new THREE.IcosahedronGeometry(r, 1); roughen(g, r * 0.22, seed); return g; };
  let h = 1, lightY = 0.6;
  if (P.kind === 'monolith') {
    h = P.height;
    const g = new THREE.CylinderGeometry(0.42, 0.62, h, 5, 2);
    roughen(g, 0.05, 7);
    b.add(g, mat(0, h / 2 - 0.2, 0, 0.03, R() * TAU, 0.02), (x, y) => (y > h * 0.3 ? mixHex(STONE[2], RIM, 0.15) : STONE[1]), 0, { flat: true });
    b.box(0.07, h * 0.7, 0.07, mat(0, h * 0.48, 0.56), A, PULSE);
    lightY = h * 0.6;
  } else if (P.kind === 'pebbles') {
    for (let i = 0; i < P.n; i++) {
      const a = (i / P.n) * TAU, r = 0.75, s = 0.16 + 0.2 * R(), small = i === 0;
      b.add(rock(small ? 0.14 : s, i + 3), mat(Math.cos(a) * r, ctx.ground(Math.cos(a) * r, Math.sin(a) * r) + 0.08, Math.sin(a) * r, 0, R() * TAU, 0, 1, 0.7, 1), small ? A : STONE[1 + (i % 3)], small ? PULSE : 0, { flat: true });
    }
    h = 0.5; lightY = 0.3;
  } else if (P.kind === 'post') {
    h = P.height;
    b.box(0.16, h, 0.16, mat(0, h / 2, 0, 0.02, R() * TAU, 0.03), STONE[2]);
    b.ico(0.16, 0, mat(0, h + 0.14, 0), A, PULSE);
    lightY = h;
  } else if (P.kind === 'cup') {
    b.add(rock(1.5, 11), mat(0, 0.05, 0, 0, R() * TAU, 0, 1, 0.28, 0.85), STONE[2], 0, { flat: true });
    b.cyl(0.42, 0.42, 0.06, 12, mat(0, 0.46, 0), A, PULSE);
    h = 0.6; lightY = 0.5;
  } else {
    // a seam: a crack with light in it, wandering
    let x = -P.length / 2, z = 0;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const nx = x + P.length / n, nz = z + R.range(-1.1, 1.1);
      flatSeg(b, new THREE.Vector3(x, ctx.ground(x, z) + 0.05, z), new THREE.Vector3(nx, ctx.ground(nx, nz) + 0.05, nz), 0.22, A, i % 3 === 1 ? PULSE : 0.9);
      x = nx; z = nz;
    }
    h = 0.4; lightY = 0.3;
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.glow));
  return { group, update() {}, light: new THREE.Vector3(0, lightY, 0), focus: new THREE.Vector3(0, Math.max(1, h * 0.6), 0), span: P.kind === 'seam' ? P.length / 2 : 3, height: h + 0.5, clear: 9 };
}
