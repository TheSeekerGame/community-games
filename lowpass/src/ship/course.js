import { load, save } from '../core/store.js';
import { angleDelta, clamp } from '../core/math.js';
import { placeCode } from '../world/sites.js';

// A course: a place the ship flies to by itself (set at the Codex computer: on its MAP, from
// a record in the LOG, or from a place someone named on the BOARD). It turns the ship
// toward the place whenever nobody steers, inside or out, so a pilot can set one and go
// make coffee. Steering takes the controls back for as long as one steers; steering
// firmly a little while lets the course go.
// Arrived with nobody at the controls, the ship circles the place, slowly, until someone
// comes to the controls; then it turns in toward it and hands the controls over.

const ARRIVE = 320;           // meters: arrived
const ORBIT = 300;            // the circle it keeps about the place, waiting
const LET_GO = 1.6;           // seconds of firm steering that let the course go

export class Course {
  constructor(game) {
    this.game = game;
    const s = load('course', null);
    this.to = s && Number.isFinite(s.x) && Number.isFinite(s.z) ? s : null;
    this.phase = this.to && this.to.phase === 'hold' ? 'hold' : 'go';
    this._firm = 0;
    this._face = 0;
  }

  get on() { return !!this.to; }
  get code() { return this.to ? placeCode(this.to.x, this.to.z) : ''; }
  dist() { const s = this.game.ship; return this.to ? Math.hypot(this.to.x - s.x, this.to.z - s.z) : Infinity; }
  bearing() { const s = this.game.ship; return this.to ? angleDelta(s.heading, Math.atan2(this.to.x - s.x, this.to.z - s.z)) : 0; }

  _save() { save('course', this.to ? { ...this.to, phase: this.phase } : null); }

  // to (x, z); label: what is there, if known (a name), for the words
  set(x, z, label = '') {
    const g = this.game;
    this.to = { x: Math.round(x), z: Math.round(z), label: String(label || '').slice(0, 60) };
    this.phase = 'go';
    this._firm = 0;
    this._save();
    const d = this.dist();
    g.audio.play('ui', { h: 28 });
    g.hud.say('COURSE SET', `${this.to.label || this.code} · ${d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`} · the ship flies there by itself`, 5);
  }

  clear(words = '') {
    if (!this.to) return;
    this.to = null;
    this.phase = 'go';
    this._save();
    if (words) this.game.hud.say(words, '', 3);
  }

  // the steering, a frame of it: pilot (what the pilot asks, -1..1) -> what the ship does
  steer(dt, pilot) {
    const g = this.game, s = g.ship;
    if (!this.to) return pilot;
    const aboard = !g.landed && !g.landing.active && ['fly', 'seat', 'walk', 'coffee'].includes(g.mode);
    if (!aboard) return pilot;
    const atControls = (g.mode === 'fly' || g.mode === 'seat') && !g.terminal.open && !g.menu.open && !g.reader.open;
    // steering firmly a while lets it go
    if (Math.abs(pilot) > 0.6) this._firm += dt; else this._firm = Math.max(0, this._firm - dt * 2);
    if (this._firm > LET_GO) { this._firm = 0; this.clear('COURSE RELEASED'); return pilot; }
    const dx = this.to.x - s.x, dz = this.to.z - s.z, r = Math.hypot(dx, dz), toward = Math.atan2(dx, dz);
    let want = toward;
    if (this.phase === 'go' && r < ARRIVE) this._arrive(atControls);
    if (!this.to) return pilot;
    if (this.phase === 'hold') {
      // circling it, waiting; someone at the controls: turn in toward it, then let go
      if (atControls) {
        this._face += dt;
        if (this._face > 6 || r < 200 || Math.abs(pilot) > 0.3) { this.clear(); return pilot; }
      } else {
        this._face = 0;
        // (the place kept on one side, chosen on arrival; nearer than the circle, it bears
        // away, farther, in)
        want = toward + (this.to.side || 1) * (Math.PI / 2 - clamp((r - ORBIT) / ORBIT, -0.6, 0.6));
      }
    }
    const e = angleDelta(s.heading, want);
    const auto = -clamp(e * 2.5, -1, 1) * 0.85;
    const free = 1 - clamp(Math.abs(pilot) / 0.35, 0, 1);
    return clamp(pilot + auto * free, -1, 1);
  }

  _arrive(atControls) {
    const g = this.game, what = this.to.label || this.code;
    g.audio.play('chime');
    if (atControls) {
      g.hud.say('ARRIVED', `${what} · ahead of the ship`, 5);
      this.clear();
    } else {
      // (nobody at the controls: it waits here, circling)
      this.phase = 'hold';
      this._face = 0;
      // (circling with the place on the side it is turning to already)
      const s = g.ship, toward = Math.atan2(this.to.x - s.x, this.to.z - s.z);
      this.to.side = Math.sign(angleDelta(toward, s.heading)) || (s.yawRate > 0 ? -1 : 1);
      this._save();
      g.hud.toast('ARRIVED', `${what}. The ship circles here until you come to the controls.`);
    }
  }
}
