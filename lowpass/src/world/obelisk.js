import * as THREE from 'three';
import { U, glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { HOME, HOME_W } from './home.js';

// The Obelisk itself (home.js says where and how large): two dark slabs, the taller and
// broader one and a narrower beside it, a slit of sky between them, sunk into the forest
// and rising out of the fog nine hundred meters; on the taller one's roof, the pad the
// ships take off from (a ring of light), and small red lights on its corners blinking.
//
// It is seen from far further than the world is drawn (the camera sees 2.6 km): beyond
// NEAR it is drawn nearer, on its true bearing, at the size it would look from where it
// is; its fog is reckoned for where it truly stands, and only partly (the fog pass's mask,
// in alpha), so it stays a dark shape on the sky from tens of kilometers, its foot lost in
// the mist as on the cover.

const NEAR = 1900;
const SINK = 45;

const VERT = /* glsl */ `
uniform float uK;
uniform vec3 uEye;
varying vec3 vN;
varying vec3 vTrue;
varying float vH;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vTrue = uEye + (w.xyz - uEye) / uK;
  vN = normalize(mat3(modelMatrix) * normal);
  vH = position.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FRAG = /* glsl */ `
uniform vec3 uSunDir, uSunColor, uSkyColor, uGroundColor;
uniform float uTop;
varying vec3 vN;
varying vec3 vTrue;
varying float vH;
void main() {
  vec3 n = normalize(vN);
  float sun = max(dot(n, uSunDir), 0.0);
  float sky = n.y * 0.5 + 0.5;
  // dark stone, the faintest sheen of the sky on it, a little of the sun on its faces;
  // a hair lighter toward the top, where the fog does not reach
  vec3 base = vec3(0.062, 0.066, 0.078);
  vec3 c = base * (0.7 + 0.3 * mix(uGroundColor, uSkyColor, sky) / max(0.2, length(uSkyColor)));
  c += base * uSunColor * sun * 0.7;
  c *= 0.85 + 0.25 * smoothstep(0.0, uTop, vH);
  // the fog over it: all of it low down, about half of it high up
  float mask = mix(1.0, 0.42, smoothstep(80.0, 520.0, vH));
  gl_FragColor = vec4(c, mask);
}
`;

export class Obelisk {
  constructor(scene) {
    this.group = new THREE.Group();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uK: { value: 1 }, uEye: { value: new THREE.Vector3() }, uTop: { value: HOME.slabs[0].h + SINK } },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    // the slabs, along x (its length), from the left
    let u = -HOME_W / 2;
    for (const [i, s] of HOME.slabs.entries()) {
      const g = new THREE.BoxGeometry(s.w, s.h + SINK, HOME.depth);
      g.translate(u + s.w / 2, (s.h + SINK) / 2, 0);
      const m = new THREE.Mesh(g, this.mat);
      m.frustumCulled = false;
      this.group.add(m);
      if (i === 0) this.pad = { u: u + s.w / 2, y: s.h + SINK };
      u += s.w + HOME.slit;
    }
    // the pad: a ring of light on the roof, and a finer one inside it
    this.lights = [];
    const ring = (r, w, o) => {
      const geo = new THREE.RingGeometry(r, r + w, 96, 1);
      geo.rotateX(-Math.PI / 2);
      const n = geo.attributes.position.count;
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      geo.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
      const m = glowMaterial({ tint: 0x9fe6ff, opacity: o, fog: 0.4 });
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(this.pad.u, this.pad.y + 0.4, 0);
      mesh.layers.set(LAYER_FX);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.lights.push({ m, o, pulse: false });
    };
    ring(46, 2.2, 0.75);
    ring(30, 0.8, 0.5);
    // the corners: red, blinking slowly, so the roofline shows by night
    const dot = new THREE.SphereGeometry(2.4, 8, 6);
    const n = dot.attributes.position.count;
    dot.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    dot.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    u = -HOME_W / 2;
    for (const s of HOME.slabs) {
      for (const cu of [u + 3, u + s.w - 3]) for (const cv of [-HOME.depth / 2 + 3, HOME.depth / 2 - 3]) {
        const m = glowMaterial({ tint: 0xff4a3a, opacity: 1, fog: 0.25 });
        const mesh = new THREE.Mesh(dot, m);
        mesh.position.set(cu, s.h + SINK + 3, cv);
        mesh.layers.set(LAYER_FX);
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.lights.push({ m, o: 1.4, pulse: true });
      }
      u += s.w + HOME.slit;
    }
    this.group.rotation.y = HOME.yaw;
    scene.add(this.group);
    this._p = new THREE.Vector3();
  }

  // eye: the camera's position (render space); origin: the world's floating origin
  update(eye, origin, time) {
    const p = this._p.set(HOME.x - origin.x, HOME.ground - SINK, HOME.z - origin.z);
    const mid = Math.hypot(p.x - eye.x, p.y + 450 - eye.y, p.z - eye.z);
    const k = mid > NEAR ? NEAR / mid : 1;
    this.group.position.set(eye.x + (p.x - eye.x) * k, eye.y + (p.y - eye.y) * k, eye.z + (p.z - eye.z) * k);
    this.group.scale.setScalar(k);
    this.mat.uniforms.uK.value = k;
    this.mat.uniforms.uEye.value.copy(eye);
    const blink = Math.sin(time * 2.1) > 0.6 ? 1 : 0.15;
    for (const l of this.lights) l.m.uniforms.uOpacity.value = l.o * (l.pulse ? blink : 0.8 + 0.2 * Math.sin(time * 0.9));
  }
}
