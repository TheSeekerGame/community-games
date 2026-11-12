import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { glowMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { TAU } from '../core/math.js';

// The small things found on foot about a clearing (curios.js, and the reaches' own:
// curios_desert.js, curios_lake.js) are built with these: a Part (what is lit like the
// world, what glows on the pulse, pure light), lights, motes, rocks, tubes, a stump, moss.

const BARK = 0x3a3530, MOSS = 0x49573d, MOSS2 = 0x5b6e3e, METAL = 0x8a9198;

function lightMesh(geo, fx, opacity) {
  const m = glowMaterial({ opacity, fog: 0.6, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}

// a part: what is lit like the world, what glows on the pulse, and pure light
class Part {
  constructor(parent, x = 0, y = 0, z = 0) {
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    parent.add(this.group);
    this.body = new Builder();
    this.lit = new Builder();
    this.glow = new Builder();
  }
  finish(mats, fx, opacity = 0.7) {
    if (!this.body.empty) this.group.add(new THREE.Mesh(this.body.build(), mats.body));
    if (!this.lit.empty) this.group.add(new THREE.Mesh(this.lit.build(), mats.glow));
    if (!this.glow.empty) this.group.add(lightMesh(this.glow.build(), fx, opacity));
  }
}

// motes that move (steam, rain, snow): points, their places written each frame
function motes(parent, n, color, size, fx, opacity = 0.8) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  parent.add(p);
  fx.push([m, opacity]);
  return { pos, alpha: g.attributes.aAlpha.array, commit() { g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; } };
}

const rock = (r, seed, amount = 0.3, detail = 0) => { const g = new THREE.IcosahedronGeometry(r, detail); roughen(g, r * amount, seed); return g; };
const curve = (b, pts, r, color, em = 0) => b.tube(pts.map((p) => new THREE.Vector3(...p)), r, 5, color, em);
// a stump to stand something on
function stump(b, r, h, R) { b.cyl(r, r * 1.15, h, 8, mat(0, h / 2 - 0.1, 0), BARK); b.cyl(r * 0.92, r * 0.92, 0.02, 8, mat(0, h - 0.09, 0), 0x8a6a4a); for (let i = 0; i < 4; i++) { const a = i * 1.7 + R(); curve(b, [[Math.cos(a) * r, 0.2, Math.sin(a) * r], [Math.cos(a) * r * 1.8, -0.1, Math.sin(a) * r * 1.8]], 0.12 * r / 0.4, BARK); } }
// a bed of moss and ferns at its foot
function moss(b, r, R, n = 6) {
  for (let i = 0; i < n; i++) { const a = R() * TAU, d = r * (0.3 + R() * 0.8); b.add(rock(0.35 + R() * 0.3, i + 7, 0.25), mat(Math.cos(a) * d, -0.05, Math.sin(a) * d, 0, 0, 0, 1.4, 0.35, 1.4), i % 2 ? MOSS : MOSS2, 0, { flat: true }); }
}
function fern(b, x, z, s, R) { for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + R() * 0.4; b.cone(0.05 * s, 0.7 * s, 3, mat(x + Math.cos(a) * 0.12 * s, 0.3 * s, z + Math.sin(a) * 0.12 * s, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9), i % 2 ? MOSS : MOSS2); } }

export { BARK, MOSS, MOSS2, METAL, lightMesh, Part, motes, rock, curve, stump, moss, fern };
