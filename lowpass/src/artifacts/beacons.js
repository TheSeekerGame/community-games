import * as THREE from 'three';
import { glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { clamp } from '../core/math.js';
import { tierOf } from './tiers.js';

// The light over a rare site: a pillar standing up out of the forest in its tier's color
// (tiers.js), RARE and up, seen from as far as the site is heard, so a pilot told of one
// can fly to it by eye. The higher the tier, the taller and brighter; a MYTHIC one turns
// through every color. Close by it fades, leaving the artifact itself.
// (The camera sees 2.6 km: a pillar farther off is drawn nearer, on its true bearing, at
// the size it would look from where it is.)

const MAX = 8;
const DRAW_AT = 2100;
const HEIGHT = [0, 0, 260, 420, 640, 900];
const WIDTH = [0, 0, 10, 15, 21, 28];
const GLOW = [0, 0, 0.5, 0.65, 0.8, 1];

function pillarGeo() {
  // a tall open cylinder, light at its foot fading to nothing at the top, and a second
  // wider, fainter one about it
  const geos = [];
  for (const [r, k] of [[0.5, 1], [1.6, 0.35]]) {
    const g = new THREE.CylinderGeometry(r, r * 0.6, 1, 10, 8, true);
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position, n = pos.count;
    const em = new Float32Array(n), col = new Float32Array(n * 3).fill(1);
    for (let i = 0; i < n; i++) { const y = pos.getY(i); em[i] = k * Math.pow(1 - y, 1.6) * (0.25 + 0.75 * Math.min(1, y * 8)); }
    g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  return geos;
}

export class Beacons {
  constructor(scene) {
    this.items = [];
    const [inner, outer] = pillarGeo();
    for (let i = 0; i < MAX; i++) {
      const m = glowMaterial({ fog: 0.35, opacity: 0 });
      const group = new THREE.Group();
      for (const g of [inner, outer]) {
        const mesh = new THREE.Mesh(g, m);
        mesh.layers.set(LAYER_FX);
        mesh.frustumCulled = false;
        group.add(mesh);
      }
      group.visible = false;
      scene.add(group);
      this.items.push({ group, m, key: null, a: 0 });
    }
    this._c = new THREE.Color();
  }

  // list: [{ key, x, z, y (ground), tier, done (recorded whole) }], the ship's place,
  // the world's origin
  update(dt, list, ship, origin, time) {
    const want = list.filter((s) => s.tier >= 2).sort((p, q) => q.tier - p.tier || p.d - q.d).slice(0, MAX);
    const keys = new Set(want.map((s) => s.key));
    // (those no longer wanted fade out; the wanted keep their slot or take a free one)
    for (const it of this.items) if (it.key && !keys.has(it.key)) it.gone = true;
    for (const s of want) {
      let it = this.items.find((x) => x.key === s.key);
      if (!it) { it = this.items.find((x) => !x.key) || null; if (!it) continue; it.key = s.key; it.a = 0; }
      it.gone = false;
      it.s = s;
    }
    for (const it of this.items) {
      if (!it.key) continue;
      const s = it.s;
      const d = Math.hypot(s.x - ship.x, s.z - ship.z);
      // fades in as it is heard, out close by (the artifact is there), and when it goes
      const near = clamp((d - 260) / 500, 0, 1);
      const target = it.gone ? 0 : near * (s.done ? 0.45 : 1);
      it.a += (target - it.a) * Math.min(1, dt * (it.gone ? 1.5 : 0.8));
      if (it.gone && it.a < 0.01) { it.key = null; it.group.visible = false; continue; }
      const k = d > DRAW_AT ? DRAW_AT / d : 1;
      const x = ship.x + (s.x - ship.x) * k, z = ship.z + (s.z - ship.z) * k;
      const T = s.tier, h = HEIGHT[T] * k, w = WIDTH[T] * k * Math.max(1, Math.sqrt(1 / k) * 0.6);
      it.group.position.set(x - origin.x, (s.y || 0) * k + ship.y * (1 - k), z - origin.z);
      it.group.scale.set(w, h, w);
      it.group.visible = it.a > 0.01;
      const pulse = 0.85 + 0.15 * Math.sin(time * (0.6 + T * 0.1) + (s.x % 7));
      it.m.uniforms.uOpacity.value = GLOW[T] * it.a * pulse;
      if (T >= 5) this._c.setHSL((time * 0.03) % 1, 0.75, 0.72); else this._c.setHex(tierOf(T).hex);
      it.m.uniforms.uTint.value.copy(this._c);
    }
  }
}
