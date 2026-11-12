import * as THREE from 'three';
import { glowMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX, POST } from '../render/pipeline.js';
import { clamp, smoothstep, TAU } from '../core/math.js';

// The teleporter kit (bought in the SHOP, three jumps a kit: progress.js): from wherever
// one is aboard, out to the ship's view, and the ship goes. It gathers itself in rings of
// light that close about it and spin up, the view stretching wide; then a white flash,
// and it is somewhere else, a little short of the place, facing it, so what stands there
// is ahead in the fog: the rings open out from it again and fall away.
//
// (Not while landed, nor coming down or going up: the ship must be in the air.)

const CHARGE = 1.9;          // gathering itself (s)
const ARRIVE = 2.2;          // coming out the other side
export const APPROACH = 420; // how far short of the place it comes out (m)
const RINGS = 5;

export class Teleport {
  constructor(game) {
    this.game = game;
    this.phase = null;           // null | 'charge' | 'arrive'
    this.t = 0;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const geo = new THREE.TorusGeometry(1, 0.035, 4, 72);
      const n = geo.attributes.position.count;
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      geo.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
      const m = glowMaterial({ fog: 0.2, opacity: 0, tint: i % 2 ? 0xb9a6ff : 0x9fe6ff });
      const mesh = new THREE.Mesh(geo, m);
      mesh.layers.set(LAYER_FX);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push(mesh);
    }
    // streaks of light drawn in toward the ship, then flung out
    const N = 260, pos = new Float32Array(N * 3);
    this.seeds = [];
    for (let i = 0; i < N; i++) {
      const a = (i * 2.399963) % TAU, u = ((i * 0.618034) % 1), r = 12 + u * 38;
      this.seeds.push({ a, y: (((i * 0.381966) % 1) - 0.5) * 30, r });
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(pg, pointsMaterial({ color: 0xd8f2ff, size: 2.4, additive: true, opacity: 0 }));
    this.points.layers.set(LAYER_FX);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    game.scene.add(this.group);
  }

  get active() { return !!this.phase; }

  // Jump to near (x, z): false (and why, said) if it cannot now.
  start(x, z, label = '') {
    const g = this.game;
    if (this.phase) return false;
    if (g.landed || (g.landing && g.landing.active)) { g.hud.say('NOT FROM THE GROUND', 'take off first, then jump', 3.5); g.audio.play('error'); return false; }
    if (!g.progress.useJump()) { g.audio.play('error'); return false; }
    // out to the ship's view, from wherever one is aboard
    g.goOutside();
    if (g.mode === 'walk' || g.mode === 'seat') g.exitCabin();
    // where it comes out: short of the place, on the line from here, facing it
    const s = g.ship, dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz) || 1;
    const back = Math.min(APPROACH, d * 0.5);
    this.to = { x: x - (dx / d) * back, z: z - (dz / d) * back, heading: Math.atan2(dx, dz), label };
    if (g.course.on) g.course.clear();
    this.phase = 'charge';
    this.t = 0;
    this.group.visible = true;
    g.audio.play('teleport');
    return true;
  }

  update(dt) {
    if (!this.phase) return;
    const g = this.game, s = g.ship, o = g.world.origin;
    this.t += dt;
    const P = this.points.geometry.attributes.position;
    // the rings and streaks follow the ship
    this.group.position.set(s.x - o.x, s.y, s.z - o.z);
    this.group.rotation.y = s.heading;
    if (this.phase === 'charge') {
      const k = clamp(this.t / CHARGE, 0, 1), e = k * k;
      s.warp = smoothstep(0.2, 1, k);
      this.rings.forEach((r, i) => {
        const f = i / (RINGS - 1);
        const rad = (34 - 24 * e) * (0.7 + 0.5 * f);
        r.scale.setScalar(rad);
        r.position.set(0, (f - 0.5) * 18 * (1 - e), 0);
        r.rotation.set(Math.PI / 2 + Math.sin(this.t * (1.5 + i)) * 0.5 * (1 - e), this.t * (2 + i * 1.3) * (1 + 4 * e), 0);
        r.material.uniforms.uOpacity.value = smoothstep(0, 0.25, k) * (0.6 + 0.9 * e);
      });
      this.seeds.forEach((q, i) => {
        const r = q.r * (1 - 0.9 * e), a = q.a + this.t * (1 + 3 * e);
        P.setXYZ(i, Math.cos(a) * r, q.y * (1 - e), Math.sin(a) * r);
      });
      P.needsUpdate = true;
      this.points.material.uniforms.uOpacity.value = smoothstep(0, 0.3, k) * 1.4;
      POST.uFlash.value = Math.max(POST.uFlash.value, Math.pow(smoothstep(0.75, 1, k), 2) * 0.85);
      if (k >= 1) {
        // the jump: white, and it is somewhere else
        POST.uFlash.value = 1.15;
        s.place(this.to.x, this.to.z, this.to.heading);
        s.vy = 0;
        g.cams._cut = true;
        this.phase = 'arrive';
        this.t = 0;
        g.audio.play('arrive');
      }
    } else {
      const k = clamp(this.t / ARRIVE, 0, 1), e = 1 - Math.pow(1 - k, 3);
      s.warp = 1 - smoothstep(0, 0.7, k);
      this.rings.forEach((r, i) => {
        const f = i / (RINGS - 1);
        r.scale.setScalar(10 + e * (60 + f * 90));
        r.position.set(0, (f - 0.5) * 6 * e, 0);
        r.rotation.set(Math.PI / 2, this.t * (0.6 + i * 0.4), 0);
        r.material.uniforms.uOpacity.value = (1 - k) * 1.2;
      });
      this.seeds.forEach((q, i) => {
        const r = 4 + e * (q.r * 4), a = q.a - this.t * 0.6;
        P.setXYZ(i, Math.cos(a) * r, q.y * e * 1.5, Math.sin(a) * r);
      });
      P.needsUpdate = true;
      this.points.material.uniforms.uOpacity.value = (1 - k) * 1.2;
      if (k >= 1) {
        this.phase = null;
        this.group.visible = false;
        s.warp = 0;
        g.hud.say('ARRIVED', this.to.label ? `${this.to.label} is ahead` : 'what stands here is ahead', 4);
      }
    }
  }
}
