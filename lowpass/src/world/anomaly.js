import * as THREE from 'three';
import { glowMaterial, U, STRANGE } from '../render/materials.js';
import { FOG, POST, LAYER_FX } from '../render/pipeline.js';
import { canopyTop } from './terrain.js';
import { clamp, damp, TAU } from '../core/math.js';
import { load, save } from '../core/store.js';
import * as art from '../chain/art.js';

// Anomalies: the world itself changed for a while, bought in the SHOP. While one lasts
// whatever rises wild wears its mark (fx.js), and every scan is worth ANOMALY_VALUE times
// more for each anomaly it was made in. Any of them may run at once, and then everything
// wears all their marks, and the way they meet besides: a mark of its own for every
// combination (combo, below), and the music changes with each of them, together.
//   inversion  the ship rolls over into a stranger world: the forest hangs overhead, pale
//              and drawn out and twisting, the ground a negative of itself ringed with
//              lines of light, the sky below an abyss of violet
//   slow       everything but the ship slows to a crawl; what rises is a burst stopped in
//              time
//   night      midnight, held, the aurora at its full; what rises burns with its own light
//   discharge  lightning walks the forest and charges the core; what rises crackles
// Some answer only to a pilot whose wallet holds a SEEKER NET seeker of the right kind
// (read from Robinhood Chain, nothing written): a trait of its art, or something it has
// done on the chain.

export const ANOMALIES = [
  { id: 'inversion', name: 'INVERSION', color: 0xc3ccff, mark: 'invert', line: 'The ship rolls over into a stranger world: a pale forest hanging overhead, an abyss below. What rises there is its own negative.' },
  { id: 'slow', name: 'SLOW TIME', color: 0x8fd8ff, mark: 'freeze', line: 'Everything but the ship slows to a crawl. What rises is a burst stopped in time.' },
  { id: 'night', name: 'LONG NIGHT', color: 0x6dffb0, mark: 'glow', line: 'Midnight, held, the aurora at its full. What rises burns with its own light.',
    key: { trait: 'Background', value: 'Nightfall', text: 'a seeker with the Nightfall background' } },
  { id: 'discharge', name: 'DISCHARGE', color: 0xa58cff, mark: 'charge', line: 'Lightning walks the forest and charges the core. What rises crackles with it.',
    key: { chain: 'discharge', text: 'a seeker that has discharged' } },
];
export const ANOMALY_SECS = 240;
export const ANOMALY_VALUE = 1.5;
export const AT_ONCE = 4;
export const anomalyCost = (depth) => 60 * (1 + depth);
export const anomalyById = (id) => ANOMALIES.find((a) => a.id === id);

// Which of the keyed anomalies the seekers an address holds open: { address, at, has: {
// id: token } }. Read-only: who holds what, their art's traits, their state on the chain.
export async function readKeys(chain, address) {
  const ids = await chain.holdings(address);
  await art.loadMeta();
  const st = ids.length ? await chain.tokens(ids) : [];
  const has = {};
  for (const a of ANOMALIES) {
    if (!a.key) continue;
    const tok = a.key.trait ? ids.find((t) => art.info(t).traits[a.key.trait] === a.key.value)
      : (st.find((x) => (x[a.key.chain] || 0) > 0) || {}).token;
    if (tok) has[a.id] = tok;
  }
  const out = { address: address.toLowerCase(), at: Date.now(), n: ids.length, has };
  save('keys', out);
  return out;
}

// Lightning, while a discharge lasts: a bolt now and then out in the forest about the
// ship, from the cloud to the canopy, a flash in the fog where it strikes, and its thunder
// as late as its distance makes it.
class Lightning {
  constructor(scene) {
    this.mat = glowMaterial({ opacity: 0, fog: 0.35, side: THREE.DoubleSide });
    this.mat.uniforms.uTint.value.setHex(0xd9ccff);
    this.geo = new THREE.BufferGeometry();
    const N = 64 * 6;
    this.pos = new Float32Array(N * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3).fill(1), 3));
    this.em = new Float32Array(N);
    this.geo.setAttribute('emissive', new THREE.BufferAttribute(this.em, 1));
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.layers.set(LAYER_FX);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.next = 2;
    this.life = 0;
    this.at = new THREE.Vector3();
  }

  // a jagged line from (x, top, z) down to the canopy, and a branch or two; quads facing cam
  _bolt(x, z, cam, origin) {
    const top = canopyTop(x + origin.x, z + origin.z), y0 = top + 230 + Math.random() * 80;
    const pts = [];
    let px = x + (Math.random() - 0.5) * 60, pz = z + (Math.random() - 0.5) * 60;
    for (let i = 0; i <= 16; i++) {
      const f = i / 16;
      pts.push([px + (x - px) * f + (Math.random() - 0.5) * 18 * Math.sin(Math.PI * f), y0 + (top - y0) * f, pz + (z - pz) * f + (Math.random() - 0.5) * 18 * Math.sin(Math.PI * f)]);
    }
    const lines = [pts];
    for (let b = 0; b < 2; b++) {
      const s = 3 + Math.floor(Math.random() * 8), br = [pts[s]];
      let [bx, by, bz] = pts[s];
      for (let i = 0; i < 5; i++) { bx += (Math.random() - 0.5) * 40; by -= 12 + Math.random() * 14; bz += (Math.random() - 0.5) * 40; br.push([bx, by, bz]); }
      lines.push(br);
    }
    let o = 0;
    const v = new THREE.Vector3(), d = new THREE.Vector3(), side = new THREE.Vector3();
    for (const [li, line] of lines.entries()) {
      const w = li ? 1.1 : 2.2;
      for (let i = 0; i < line.length - 1 && o < 64; i++, o++) {
        const a = line[i], b = line[i + 1];
        d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        v.set(a[0] - cam.x, a[1] - cam.y, a[2] - cam.z);
        side.crossVectors(d, v).normalize().multiplyScalar(w);
        const q = [[a, -1], [a, 1], [b, 1], [a, -1], [b, 1], [b, -1]];
        q.forEach(([p, s], k) => { this.pos.set([p[0] + side.x * s, p[1] + side.y * s, p[2] + side.z * s], (o * 6 + k) * 3); this.em[o * 6 + k] = li ? 0.6 : 1; });
      }
    }
    for (let i = o * 6; i < 64 * 6; i++) this.pos.set([0, -9999, 0], i * 3);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.emissive.needsUpdate = true;
    this.at.set(x, top + 12, z);
  }

  // k: how strong the discharge is now (0..1). Returns a strike's distance when one falls.
  update(dt, k, ship, cam, origin) {
    this.life = Math.max(0, this.life - dt);
    let struck = null;
    if (k > 0.5) {
      this.next -= dt;
      if (this.next <= 0) {
        this.next = 1.6 + Math.random() * 3.4;
        const a = ship.heading + (Math.random() - 0.5) * 2.6, r = 140 + Math.random() * 420;
        const sx = ship.root.position.x + Math.sin(a) * r, sz = ship.root.position.z + Math.cos(a) * r;
        this._bolt(sx, sz, cam.position, origin);
        this.life = 0.32;
        struck = r;
      }
    }
    const on = this.life > 0;
    this.mesh.visible = on;
    // a flicker: on, nearly off, on again, gone
    const f = this.life / 0.32, flick = f > 0.75 ? 1 : f > 0.6 ? 0.15 : f > 0.3 ? 0.9 : f * 2;
    this.mat.uniforms.uOpacity.value = on ? flick : 0;
    const P = U.uPointPos.value[7], C = U.uPointColor.value[7], F = FOG.uFogLights.value[3], FC = FOG.uFogLightColor.value[3];
    if (on) {
      P.set(this.at.x, this.at.y + 30, this.at.z, 260);
      C.setRGB(1.6, 1.3, 2.4).multiplyScalar(flick);
      F.set(this.at.x, this.at.y + 60, this.at.z, 220 * flick);
      FC.setRGB(0.75, 0.62, 1);
    } else if (this._was) { P.w = 0; F.w = 0; }
    this._was = on;
    return struck;
  }
}

// The anomalies running now: each eases in over a few seconds and out at its end.
export class Anomalies {
  constructor(game) {
    this.game = game;
    this.list = load('anomalies', []).filter((x) => anomalyById(x.id) && x.left > 0).map((x) => ({ id: x.id, left: x.left, k: 0 }));
    this.keys = load('keys', null);
    this.lightning = new Lightning(game.scene);
    this._saveT = 0;
    this._pulseT = 0;
  }

  running(id) { return this.list.some((x) => x.id === id && x.left > 0); }
  amount(id) { const x = this.list.find((y) => y.id === id); return x ? x.k : 0; }
  get any() { return this.list.some((x) => x.left > 0); }
  get count() { return this.list.filter((x) => x.left > 0).length; }
  // those a scan made now was made in
  get now() { return this.list.filter((x) => x.k > 0.5).map((x) => x.id); }

  // whether the pilot's seekers open it (a keyed one), and with which token
  unlocked(id) {
    const a = anomalyById(id);
    if (!a.key) return true;
    return !!(this.keys && this.keys.has && this.keys.has[id] && this.keys.address === this.owner());
  }

  owner() {
    const t = this.game.terminal, l = t && t.board && t.board.link;
    const a = (l && l.address) || this.game.walletAddress();
    return a ? a.toLowerCase() : null;
  }

  can(id) {
    return !this.running(id) && this.count < AT_ONCE && this.unlocked(id) && this.game.progress.data >= anomalyCost(this.game.progress.depth);
  }

  start(id) {
    if (!this.can(id)) return false;
    this.game.progress.data -= anomalyCost(this.game.progress.depth);
    this.game.progress.save();
    this.list = this.list.filter((x) => x.id !== id);
    this.list.push({ id, left: ANOMALY_SECS, k: 0 });
    this._save();
    // what is out there already wears its mark too (and on foot, what stands about)
    const g = this.game, things = [...g.field.active.filter((a) => a.model && !a.special && !a.scanned && a.d.family !== 'landing'), ...g.afoot.curios.filter((c) => !c.scanned)];
    for (const a of things) for (const m of this.mark()) g.markFx(a, m);
    return true;
  }

  _save() { save('anomalies', this.list.filter((x) => x.left > 0).map((x) => ({ id: x.id, left: Math.round(x.left) }))); }

  // whatever rises wild now (in flight or found on foot) wears the marks of the anomalies
  // running, and where two or more meet, the mark of their meeting ('combo:' and which)
  mark() {
    const on = this.list.filter((x) => x.left > 0).map((x) => x.id).sort();
    const marks = on.map((id) => anomalyById(id).mark).filter(Boolean);
    if (on.length > 1) marks.push(`combo:${on.join('+')}`);
    return marks;
  }

  update(dt) {
    const g = this.game, ship = g.ship;
    // (the ship rights itself to land, and while it stands)
    const down = !!g.landed || !!g.landing.active || g.mode === 'ground' || g.mode === 'landing' || g.mode === 'takeoff';
    for (const x of this.list) {
      x.left -= dt;
      const want = x.left > 0 ? 1 : 0;
      x.k = damp(x.k, want, want ? 0.9 : 1.3, dt);
      if (want && x.k > 0.995) x.k = 1;
    }
    const ended = this.list.filter((x) => x.left <= 0 && x.k < 0.01);
    if (ended.length) { this.list = this.list.filter((x) => !ended.includes(x)); this._save(); }
    this._saveT -= dt;
    if (this._saveT <= 0) { this._saveT = 5; this._save(); }

    // inversion: the ship rolls over (and flies a little higher, its camera above it)
    // (the ship rights itself to land and while it stands; the world stays as strange)
    const inv = this.amount('inversion');
    ship.flip = damp(ship.flip, down ? 0 : inv, 1.2, dt);
    if (Math.abs(ship.flip - inv) < 0.002) ship.flip = inv;
    ship.lift = 26 * ship.flip;
    // (the world turns strange a little behind the roll, and rights itself a little ahead)
    STRANGE.uStrange.value = Math.min(1, inv * inv * 1.2);
    g.atmo.strange = STRANGE.uStrange.value;
    // slow time
    const sl = this.amount('slow');
    g.slow = 1 - 0.75 * sl;
    // the long night: midnight, held, the aurora full and breathing
    const nt = this.amount('night');
    g.atmo.hold = nt > 0.001 ? { t: 0.0, k: nt } : null;
    g.atmo.auroraBoost = nt;
    if (nt > 0.5) { this._pulseT -= dt; if (this._pulseT <= 0) { this._pulseT = 3 + Math.random() * 5; g.atmo.networkPulse(0.5); } }
    // the discharge: lightning about the ship, and the core drinking from it
    const dc = this.amount('discharge');
    const struck = this.lightning.update(dt, dc, ship, g.cams.cam, g.world.origin);
    if (struck !== null) {
      g.audio.play('thunder', { delay: struck / 340, gain: clamp(1.4 - struck / 600, 0.3, 1), near: struck < 260 });
      POST.uFlash.value = Math.max(POST.uFlash.value, 0.18 * clamp(1 - struck / 700, 0.2, 1));
    }
    g.refillBoost = 1 + 1.5 * dc;
    // the whole view's tint: cold for slow time, violet for the discharge
    POST.uGrade.value.set(1 - 0.08 * sl + 0.02 * dc, 1 - 0.03 * sl - 0.05 * dc, 1 + 0.08 * sl + 0.1 * dc);
  }
}
