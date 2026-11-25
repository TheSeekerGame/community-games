import * as THREE from 'three';
import { Pipeline, FOG, POST } from './render/pipeline.js';
import { U } from './render/materials.js';
import { World } from './world/chunks.js';
import { autumn, mountain, mountainEnv, canopyTop, riverAt, height, WATER, desertEnv, lakeEnv } from './world/terrain.js';
import { Atmosphere } from './world/atmosphere.js';
import { Ship } from './ship/ship.js';
import { shipById } from './ship/designs.js';
import { Interior } from './ship/interior.js';
import { Seeker } from './ship/seeker.js';
import { CoffeeScene } from './ship/coffee.js';
import { Plasma } from './ship/plasma.js';
import { Teleport } from './ship/teleport.js';
import { Obelisk } from './world/obelisk.js';
import { homeTop, homeStart, homeDist, UPLINK_R } from './world/home.js';
import { Cameras } from './ship/camera.js';
import { Input } from './core/input.js';
import { Audio, BPM } from './core/audio.js';
import { load, save, codexAll, codexPut } from './core/store.js';
import { clamp, damp, angleDelta, formatInt } from './core/math.js';
import { Progress, valueOf } from './core/progress.js';
import { tierOf, CLEARING } from './artifacts/tiers.js';
import { sitesNear, siteByKey } from './world/sites.js';
import { worthOf, worthWords } from './ui/worth.js';
import { Course } from './ship/course.js';
import { SPECIES } from './artifacts/species.js';
import { stratum } from './artifacts/strata.js';
import { Chain } from './chain/chain.js';
import { MoveWatcher } from './chain/moves.js';
import { ChainClock } from './chain/clock.js';
import * as art from './chain/art.js';
import { Field } from './artifacts/field.js';
import { takePhoto } from './artifacts/photo.js';
import { GENERATOR_VERSION, ALL_FAMILIES } from './artifacts/generate.js';
import { ArtifactFx, EFFECTS, Shot, effectById } from './artifacts/fx.js';
import { Anomalies, anomalyById } from './world/anomaly.js';
import { connected } from './net/wallet.js';
import { Hud } from './ui/hud.js';
import { Terminal } from './ui/terminal.js';
import { Menu, Title } from './ui/menu.js';
import { TouchControls } from './ui/touch.js';
import { Tips } from './ui/tips.js';
import { Reader } from './ui/reader.js';
import { Landing } from './ground/landing.js';
import { Afoot } from './ground/afoot.js';
import { Companion } from './companion/companion.js';
import { Boot } from './ui/boot.js';

// Low Pass: the flight, the cabin, the coffee, the Codex. One frame loop, a few modes:
//   title   the forest from cinematic angles until a key is pressed
//   fly     outside, behind the ship: steer, scan
//   walk    inside, on foot: the coffee machine, the Codex computer, the controls
//   seat    inside, at the controls: steer and scan through the windshield
//   coffee  the coffee scene
// The Codex computer (terminal) and the pause menu lie over whichever mode is current.

const DECAY = 1 / 600;          // alertness lost a second: full to empty in ten minutes
// (how long the tank's plasma lasts, how fast it comes back, and how long between wild
// artifacts are bought in the SHOP: progress.js)
const RELIGHT = 0.15;            // once spent, the boost lights again at this much
const WAVE = 12;                 // a sweep's artifacts at once, at most (the rest come next)
const VOICES = 4;                // artifacts heard at once, the nearest
const WALK = 2.0, RUN = 3.3;
const FIRE_PAD = ['Pad12', 'Pad15', 'Pad13', 'Pad14'];   // the pad's cross: up, right, down, left
const EYE = 1.58;

export class Game {
  async init() {
    const canvas = document.getElementById('game');
    const q = new URLSearchParams(location.search);
    this.dev = q.has('dev');
    this.stats = q.has('stats');
    this.px = new Pipeline(canvas);
    this.px.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.world = new World(this.scene);
    FOG.tCanopy.value = this.world.canopy.texture;
    this.atmo = new Atmosphere();
    this.progress = new Progress();     // DATA, depth, upgrades, ships
    this.clearings = load('clearings', {});   // how many things each clearing landed in holds (afoot.js)
    this.ship = new Ship(this.scene, this.world, shipById(this.progress.ship));
    this.interior = new Interior(this.ship);
    this.seeker = new Seeker(this.interior.group);
    this.cams = new Cameras(this.px.width / this.px.height);
    // the outside cameras keep over the trees (render space in, render space out)
    this.cams.floor = (x, z) => canopyTop(x + this.world.origin.x, z + this.world.origin.z) + 3;
    this.input = new Input(canvas);
    this.audio = new Audio();
    // (?mute: no sound at all, ever: for testing)
    if (q.has('mute')) this.audio.unlock = () => {};
    this.plasma = new Plasma(this.scene);
    this.plasma.setColors(...this.ship.design.look.plasma);
    this._back = new THREE.Vector3();
    this._autumn = 0;           // how turned the stand about the eye is, eased
    this._autumnSaid = false;
    this.landing = new Landing(this);
    this.afoot = new Afoot(this);
    this.landed = null;         // the clearing the ship stands in, if it has landed
    this.world.onShift = (dx, dz) => { this.cams.shift(dx, dz); this.plasma.shift(dx, dz); this.landing.dust.shift(dx, dz); };

    // the interface shares the world's pixel
    this.uiRoot = document.getElementById('ui');
    this.ui = { u: 3 };
    const onResize = (w, h) => {
      this.cams.setAspect(w / h);
      this.ui.u = this.px.uiUnit || 3;
      document.documentElement.style.setProperty('--u', `${this.ui.u}px`);
      this.input.stickR = Math.round(this.ui.u * 30);
    };
    this.px.onResize = onResize;
    onResize(this.px.width, this.px.height);
    // the loading screen, until the forest is grown and the hour is read from the chain
    this.boot = new Boot(this.uiRoot);
    this.boot.step(0.05, '');
    this.hud = new Hud(this.uiRoot);
    this.hud.onAlarm = () => this.goOutside();
    this.hud.onFire = (id) => { if (!this.terminal.open && !this.menu.open && !this.reader.open && (this.mode === 'fly' || this.mode === 'seat' || this.mode === 'ground')) this.fire(id); };
    this.tips = new Tips(this);
    this.terminal = new Terminal(this);
    this.reader = new Reader(this);
    this.menu = new Menu(this);
    this.title = new Title(this);
    this.touch = new TouchControls(this);
    // touch or keys: the hints and buttons follow whichever was used last
    const touchMode = (on) => {
      document.documentElement.classList.toggle('touchmode', on);
      this.title.setTouch(on);
      if (this.menu.open) this.menu.render();
    };
    this.input.onMode = touchMode;
    touchMode(this.input.touchMode);
    document.addEventListener('fullscreenchange', () => { if (this.menu.open) this.menu.render(); });

    // SEEKER NET: the clock, the moves, the art
    this.chain = new Chain();
    this.clock = new ChainClock();
    this.atmo.clock = this.clock;
    this.moves = new MoveWatcher(this.chain, this.clock);
    // the hour: asked of the chain at once (the loading screen waits for it); the shipped
    // snapshot is the fallback when the chain does not answer
    const seeded = fetch('assets/moves.json').then((r) => r.json()).then((s) => this.clock.seed(s.block, s.at)).catch(() => {});
    if (!q.has('offline')) this.moves.start();
    else this.moves.status = 'offline';
    art.loadMeta().then(() => { this.artReady = true; }).catch(() => {});
    this.field = new Field(this);
    this.obelisk = new Obelisk(this.scene);     // home: where every ship first takes off (home.js)
    this.teleport = new Teleport(this);
    this.shot = new Shot(this.scene);
    // anomalies bought in the SHOP (anomaly.js): how fast the world's time runs, how fast
    // the core gathers plasma back, while they last
    this.slow = 1;
    this.wtime = 0;
    this.refillBoost = 1;
    this.anomalies = new Anomalies(this);
    this.field.record = (tx) => this.recorded(tx);
    this.field.onSignal = (s) => this._signal(s);
    this.field.onNear = (a) => this._met(a);
    this.field.onAppear = (a) => this._appear(a);
    this.field.onWave = (list) => this._appear(list[0], list);
    this.field.onScanned = (a) => this._scanned(a);
    // (and the Obelisk, its roof and the air it stands in: home.js)
    this.ship.obstacle = (x, z, cruise) => Math.max(this.field.topAt(x, z, cruise), homeTop(x, z));
    // one missed alone is said; a sweep's, quietly (there were more than one could scan)
    this.field.onMissed = (a) => { if (!a.wave) this.hud.say('LOST IN THE FOG', 'It has gone back into the fog', 4); };
    // a creature that saw the ship, and a creature's scan let go: heard, never said (the
    // creatures are for finding out)
    this.field.onFlee = () => this.audio.play('flee');
    this.field.onScanLost = () => this.audio.play('lost');
    this.field.onGate = (a, n) => { for (let i = 0; i < n; i++) this.audio.play('gate', { i: a.pass + i }); };
    // a seeker moved while you fly: the next artifact is its witnessed one; a wild one
    // still out of sight gives way to it at once
    this.moves.onMove = () => {
      this.atmo.networkPulse(0.6);
      this.field.next = Math.min(this.field.next, 6);
    };
    this.moves.onActivated = () => this.atmo.networkPulse(1.2);
    this.coffee = new CoffeeScene(this);
    // a place to fly to by itself (course.js)
    this.course = new Course(this);
    // a seeker brought aboard from the Codex computer, if any
    this.companion = new Companion(this);
    // music the player kept comes back; kept in this browser
    this.audio.kept = load('music.kept', []);
    this.audio.onKept = (k) => save('music.kept', k);

    // saved state
    const s = load('state', {});
    this.alertness = s.alertness ?? 0.6;
    this.plasmaLeft = s.plasma ?? 1;    // the boost's plasma, 0..1
    this._spent = false;
    this.warm = 0;
    this.stats_ = s.stats || { cups: 0, scans: 0, distance: 0 };
    const saved = load('settings', {});
    if ((saved.v || 0) < 2) delete saved.ambience;   // the beds were remade quieter
    this.settings = Object.assign({ master: 0.85, music: 0.85, sfx: 0.8, ambience: 0.5, pixel: 'auto', shafts: true, hud: true }, saved, { v: 2 });
    this.applySettings();
    this.codex = (await codexAll()).sort((a, b) => b.scannedAt - a.scannedAt);
    for (const e of this.codex) { e.img = new Image(); e.img.src = e.photo; }
    this.interior.drawScreen(this.codex, 'connecting');

    // a new pilot starts on the Obelisk's roof (home.js); one who has flown before, where
    // they left off
    // (a saved place that is not a place, too, is home)
    const H = homeStart(), was = Number.isFinite(s.x) && Number.isFinite(s.z);
    const x = q.has('x') ? Number(q.get('x')) : was ? s.x : H.x;
    const z = q.has('z') ? Number(q.get('z')) : was ? s.z : H.z;
    this.ship.place(x, z, !was && !q.has('x') ? H.heading : Number.isFinite(s.heading) ? s.heading : 0.4);
    this.boot.step(0.2, 'growing the forest');
    await new Promise((r) => setTimeout(r, 30));     // let the screen show first
    while (this.world.update(this.ship.x, this.ship.z, 0, 1, 64) > 0);
    // from here on, what is made as the ship flies comes into view in the dither
    this.world.instant = false;
    if (q.has('t')) this._devTime = Number(q.get('t'));
    if (this.dev) this._devHooks();
    // wait (a few seconds at most) for the chain's block, so the sky opens at the hour
    // everyone shares instead of jumping to it
    this.boot.step(0.6, 'reading the hour from Robinhood Chain');
    const until = performance.now() + (q.has('offline') ? 0 : 6000);
    while (this.clock.source !== 'chain' && performance.now() < until) await new Promise((r) => setTimeout(r, 80));
    await seeded;
    if (this.clock.source !== 'chain') this.boot.step(0.85, 'the chain is quiet: the hour is reckoned');
    this.atmo.update(0, this.world.origin);

    this.mode = 'title';
    this.cams.auto = true;
    this.fp = { x: 0, z: 5, yaw: 0, pitch: -0.05, walked: 0, bob: 0 };
    this.lookOff = { yaw: 0, pitch: 0 };
    this.time = 0;
    this.beat = 0;
    this.sleep = { next: 20, t: 0, dur: 0, deep: false };
    this.asleep = false;
    this.paused = false;
    this.last = performance.now();
    this.input.onAny = () => this.audio.unlock();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._save(); });
    addEventListener('pagehide', () => this._save());
    if (q.has('play')) this.start();
    this._bootFrames = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  applySettings() {
    const st = this.settings;
    this.audio.setVolumes({ master: st.master, music: st.music, sfx: st.sfx, ambience: st.ambience });
    this.px.setPixelSize(st.pixel);
    FOG.uShafts.value = st.shafts ? 1 : 0;
    this.hud.show(st.hud);
    save('settings', st);
  }

  // seconds of a full boost: the upgraded tank, as large as this ship carries
  get tankSecs() { return this.progress.tankSecs * this.ship.design.fly.tank; }

  // go aboard another ship one owns: it is built around whoever stands in the galley
  board(id) {
    if (!this.progress.board(id)) return false;
    const d = shipById(id);
    this.ship.setDesign(d);
    this.interior.setDesign(d);
    this.plasma.setColors(...d.look.plasma);
    this.cams._cut = true;
    return true;
  }

  _save() {
    save('state', { alertness: this.alertness, plasma: this.plasmaLeft, x: this.ship.x, z: this.ship.z, heading: this.ship.heading, stats: this.stats_ });
  }

  // ---------------------------------------------------------------- modes
  start() {
    if (this.mode !== 'title') return;
    this.audio.unlock();
    this.audio.mood.title = 0;
    this.title.hide();
    this.mode = 'fly';
    this.cams.auto = false;
    this.cams._cut = true;
    if (homeDist(this.ship.x, this.ship.z) < 2500) this.hud.say('THE OBELISK', 'every ship takes off from its roof · come back within sight of it to transmit what you find', 6);
    else this.hud.say('THE FOG BELT', 'A survey flight over the planet’s warm band', 5);
    this._keysShown = this.time;
    // the relays, a little after (news of rare finds, finders' shares: finds.js)
    if (!new URLSearchParams(location.search).has('nonet')) setTimeout(() => { try { this.terminal.ensureBoard(); } catch (e) { console.warn('board', e); } }, 4000);
  }

  // Into one of the two reaches (terrain.js): said once on the way in.
  _reach(dt) {
    this._rt = (this._rt || 0) - dt;
    if (this._rt > 0 || this.mode === 'title') return;
    this._rt = 1;
    // (and back within reach of the Obelisk's uplink, with scans to send: home.js)
    const near = homeDist(this.ship.x, this.ship.z) <= UPLINK_R;
    if (near !== this._nearHome) {
      const was = this._nearHome;
      this._nearHome = near;
      const n = this.progress.unsent(this.codex).list.length;
      if (near && was === false && n && !this.terminal.open) this.hud.say('UPLINK IN REACH', `the Obelisk hears you · ${n} scan${n === 1 ? '' : 's'} to transmit at the Codex computer`, 6);
      if (!near && was === true && !this.terminal.open) this.hud.say('OUT OF THE UPLINK', 'scans keep in the Codex until you are back within reach of the Obelisk', 5);
    }
    const s = this.ship, de = desertEnv(s.x, s.z), le = lakeEnv(s.x, s.z);
    const now = de > 0.6 ? 'desert' : le > 0.6 ? 'greatlake' : de < 0.2 && le < 0.2 ? null : this._inReach;
    if (now === this._inReach) return;
    this._inReach = now;
    if (!now || this.terminal.open) return;
    if (now === 'desert') this.hud.say('THE GREY WASTE', 'the forest gives out · what stands out here is the Waste’s own', 5);
    else this.hud.say('THE GREAT LAKE', 'water to the horizon · what stands out here is the Lake’s own', 5);
  }

  // One of the rarest found lately by another pilot: told, with the way there.
  rareFound(f) {
    // (not over the open Codex: it waits until it is closed, the newest only)
    if (this.terminal.open) { this._rareLater = f; return; }
    const T = tierOf(f.tier), km = Math.hypot(f.x - this.ship.x, f.z - this.ship.z) / 1000;
    this.audio.play('witness', {});
    this.atmo.networkPulse(f.tier >= 5 ? 1.6 : 1.1);
    const w = worthOf(this, siteByKey(f.key));
    this.hud.toast(`${T.name} FOUND`, `${f.name || 'Something rare'} · ${f.place} · ${km < 10 ? km.toFixed(1) : Math.round(km)} km from here${w ? ` · worth ${worthWords(w, formatInt).toLowerCase()} to you` : ''}. Every pilot who comes after the first gives the first a share.`, 40,
      { label: 'SET COURSE', color: T.color, run: () => this.course.set(f.x, f.z, f.name) });
  }

  // DATA come in as a finder's share: pilots who came after this one to its sites.
  royalty(data, pilots, sites) {
    this.audio.play('transmit', { n: 1 });
    this.hud.say(`+${formatInt(data)} DATA · FINDER'S SHARE`, `${pilots} pilot${pilots > 1 ? 's' : ''} came after you to ${sites > 1 ? `${sites} places` : 'a place'} you found`, 6);
  }

  enterCabin(seat = false) {
    this.mode = seat ? 'seat' : 'walk';
    this.fp.x = 0; this.fp.z = seat ? 6.3 : 4.9; this.fp.yaw = 0; this.fp.pitch = -0.08;
    this.lookOff.yaw = 0; this.lookOff.pitch = 0;
    this.audio.play('door');
    this.input.dragLook = true;
    this.tips.learn('cabin');
  }

  exitCabin() {
    // landed, the way out is the door
    if (this.landed) { this.goOut(); return; }
    this.mode = 'fly';
    this.input.unlock();
    this.input.dragLook = false;
    this.cams._cut = true;
    this.audio.play('door');
    this.tips.learn('outside');
  }

  // out to the ship's view from wherever one is: the Codex, the menu, the coffee, the
  // cabin (the alert's button, or V while it is up)
  goOutside() {
    if (this.menu.open) this.menu.hide();
    if (this.terminal.open) this.terminal.hide();
    if (this.reader.open) this.reader.hide();
    if (this.mode === 'coffee') this.coffee.finish();
    if (this.mode === 'walk' && !this.landed) this.exitCabin();
  }

  // ---------------------------------------------------------------- landing
  // The ship comes down into a clearing (landing.js), and the one aboard walks out into
  // the forest (afoot.js); back aboard, the controls take it up again.
  land(site) {
    if (this.landed || this.landing.active) return;
    if (this.terminal.open) this.terminal.hide();
    if (this.reader.open) this.reader.hide();
    this.input.unlock();
    this.mode = 'landing';
    this.cams._cut = true;
    this.landing.down(site);
  }

  // the forest about (zone) made over for walking in, or back as it was (null): rebuilt
  // at once, behind a cut
  walkZone(zone) {
    const w = this.world, [fx, fz] = this.ship.forward(), was = w.instant;
    w.setWalk(zone);
    w.instant = true;
    for (let i = 0; i < 12 && w.update(this.ship.x, this.ship.z, fx, fz, 64, this.ship.x, this.ship.z, 0) > 0; i++);
    w.instant = was;
  }

  // down, and out: standing at (x, z) facing yaw
  landedAt(site, at) {
    this.landed = { site };
    this.interior.setLanded(true);
    this.afoot.populate(site);
    this.afoot.enter(at.x, at.z, at.yaw);
    this.mode = 'ground';
    this.input.dragLook = true;
    this._fadeIn = 0.6;
    POST.uFade.value = 1;
  }

  // up the ramp, aboard: just inside the door, facing in
  goAboard() {
    const h = this.interior.spots.find((s) => s.id === 'hatch');
    this.mode = 'walk';
    this.fp.x = h.at.x + 0.7; this.fp.z = h.at.z; this.fp.yaw = Math.PI / 2; this.fp.pitch = -0.05;
    this.audio.play('door');
    this._fadeIn = 0.4;
    POST.uFade.value = 1;
  }

  // out of the door, down the ramp: at its foot, facing away from the ship
  goOut() {
    const s = this.ship, f = s.rampFoot(), c = Math.cos(s.heading), si = Math.sin(s.heading);
    const x = s.x + (f.x - 1.2) * c + f.z * si, z = s.z - (f.x - 1.2) * si + f.z * c;
    this.afoot.enter(x, z, s.heading - Math.PI / 2);
    this.mode = 'ground';
    this.input.dragLook = true;
    this.audio.play('door');
    this._fadeIn = 0.4;
    POST.uFade.value = 1;
  }

  // from the controls, up again
  takeoff() {
    this.input.unlock();
    this.afoot.clear();
    this.interior.setLanded(false);
    this.mode = 'takeoff';
    this.landing.up();
  }

  tookOff() {
    const site = this.landed && this.landed.site;
    // (the clearing stays where it is, to come down into again another time)
    if (site && site.site) site.scanned = true;
    else if (site && !site.passed) { site.passed = true; site.fading = true; }
    this.landed = null;
    this.mode = 'fly';
    this.cams._cut = true;
    this.input.dragLook = false;
  }

  startCoffee() {
    this.mode = 'coffee';
    this.input.unlock();
    this.tips.learn('coffee');
    this.coffee.start(this.fp);
  }

  endCoffee(at, yaw) {
    this.mode = 'walk';
    this.fp.x = at.x; this.fp.z = at.z; this.fp.yaw = yaw; this.fp.pitch = 0;
    this.stats_.cups++;
    this._save();
  }

  drink() {
    this.alertness = 1;
    this.warm = 90;
    this.sleep.next = 60;
    this.hud.say('WARM', 'Alertness restored', 3);
  }

  // the whole screen, on phones and tablets: asked for on the first tap, and in the menu
  get canFullscreen() {
    const d = document.documentElement;
    return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(d.requestFullscreen || d.webkitRequestFullscreen);
  }

  get isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  setFullscreen(on) {
    const d = document.documentElement;
    try {
      let p = null;
      if (on && !this.isFullscreen) p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen();
      else if (!on && this.isFullscreen) p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch { /* not allowed here */ }
  }

  // a light tap of the phone's motor for the moments that matter (where phones have one)
  buzz(pattern) {
    if (!this.input.touchMode || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch { /* not allowed */ }
  }

  // ---------------------------------------------------------------- music to keep
  keepMusic() {
    const n = this.audio.keep();
    if (n) this.hud.say('KEPT', 'This music will come back as it is', 3.5);
  }

  async saveSound() {
    this.hud.say('SAVING THE LAST MINUTE OF SOUND', '', 2.5);
    const blob = await this.audio.saveRecent();
    if (!blob) { this.hud.say('NOTHING TO SAVE YET', '', 2.5); return; }
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `low-pass-${d.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.wav`;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    this.hud.say('SAVED', a.download, 3);
  }

  // ---------------------------------------------------------------- artifacts
  // a: the one that appeared (or the first of a sweep's: list)
  _appear(a, list = [a]) {
    if (a.special) {
      const ids = list.map((x) => x.d.lead);
      const who = ids.length > 1 ? `SEEKERS ${ids.slice(0, 5).map((t) => '#' + t).join(' ')}${ids.length > 5 ? ` and ${ids.length - 5} more` : ''}` : `SEEKER #${a.d.lead}`;
      const title = ids.length > 1 ? `${ids.length} SEEKERS MOVED · WITNESSED` : 'A SEEKER MOVED · WITNESSED';
      this.audio.play('witness', { pan: clamp(-(a.bearing || 0), -1, 1) });
      this.atmo.networkPulse(ids.length > 1 ? 1.4 : 1);
      this._witnessedAt = this.time;
      // anywhere aboard the cabin calls; away from the ship's view (on foot, at the Codex,
      // over coffee) the alert says it too, where it cannot be missed (the HUD's alarm)
      if (this._aboard()) this.audio.play('alarm');
      if (this.mode !== 'fly' && this.mode !== 'seat' || this.terminal.open || this.menu.open || this.reader.open) this.buzz([30, 90, 30, 90, 60]);
      else this.hud.say(title, `${who} moved ${a.move.time ? agoShort(a.move.time) : 'just now'}; every ship flying now sees ${ids.length > 1 ? 'them' : 'it'}`, 8);
    } else {
      // (anything else brought to the ship: only in development; the wild ones stand at
      // their sites, and are spoken for as they are met: _met)
      this.audio.play('signal', { pan: clamp(-(a.bearing || 0), -1, 1) });
    }
  }

  // a site's Codex entry, by its seed (if it was recorded)
  recorded(tx) {
    if (this._cx !== this.codex) { this._cx = this.codex; this._cm = new Map((this.codex || []).map((e) => [e.tx, e])); }
    return this._cm.get(tx) || null;
  }

  // A site heard for the first time: a low swell from its side; the first times, a word
  // on what the mark along the top is for.
  _signal(s) {
    if (this.mode === 'title' || s.faint) return;
    // (several heard at once: one swell for them all)
    if (this.time - (this._signalAt ?? -9) > 3) this.audio.play('signal', { pan: clamp(-(s.bearing || 0), -1, 1) });
    this._signalAt = this.time;
    this._signals = (this._signals || 0) + 1;
    if (this._signals <= 2 && (this.mode === 'fly' || this.mode === 'seat') && !this.terminal.open && !this.menu.open) this.hud.say('A SIGNAL', 'something stands that way · follow the mark above · it will wait', 6);
  }

  // A site's artifact come into sight: a word on what it is, the first few of each kind
  // (the layered ones always: their stratum, and whether more lies in them than is seen).
  _met(a) {
    const d = a.d, fly = (this.mode === 'fly' || this.mode === 'seat') && !this.terminal.open && !this.menu.open && !this.reader.open;
    const pan = clamp(-(a.bearing || 0), -1, 1);
    this._metN = this._metN || {};
    const first = (k, n = 2) => { this._metN[k] = (this._metN[k] || 0) + 1; return this._metN[k] <= n; };
    if (d.family === 'landing') { this.audio.play('signal', { pan }); if (fly && first('landing', 3)) this.hud.say('A CLEARING', 'lanterns among the trees · hold the scanner on it to land', 5); return; }
    if (d.family === 'life') { if (fly && first('life')) this.hud.say(d.cls.toUpperCase(), 'life in the forest: it can be scanned too', 4); return; }
    if (d.family === 'creature') return;      // (the creatures are for finding out)
    // a rare one (tiers.js): its tier first, always, in its color
    const T = d.tier >= 2 ? tierOf(d.tier) : null;
    if (T && fly) this.atmo.networkPulse(0.4 + d.tier * 0.2);
    const head = (t) => (T ? `${T.name} · ${t}` : t);
    if (d.depth) {
      const st = stratum(d.depth);
      this.audio.play('deep', { depth: d.depth, chord: d.params.voice && d.params.voice.chord, glimpse: d.plus, pan });
      if (d.plus) this.atmo.networkPulse(0.8);
      if (fly) this.hud.say(head(`${a.again ? 'MORE TO SEE · ' : ''}RESONANCE ${st.numeral}${d.plus ? '+' : ''} · ${st.name.toUpperCase()}`), `${d.cls}${d.overClass ? ` · at heart, ${d.overClass.toLowerCase()}` : ''}${d.res > d.depth ? ' · it resonates deeper than you are attuned' : ''}`, 5);
    } else if (d.res > 0) {
      this.audio.play('signal', { pan });
      if (fly && (T || first('deeper', 3))) this.hud.say(head('IT RESONATES'), `${d.cls} · more lies in it than you can see yet · attune at the Codex computer`, 6);
    } else if (fly && T) this.hud.say(T.name, `${d.cls} · worth ${T.value} times a common one`, 5);
    else if (fly && d.trace && first('trace')) this.hud.say('ALMOST NOTHING', 'a trace: little at the surface', 4);
  }

  // what was fired at an artifact before it was put away, laid on it again
  refire(a, ids) {
    if (!a.fx) a.fx = new ArtifactFx(a);
    for (const id of ids) if (!a.fx.has(id)) a.fx.add(id);
  }

  // What the emitters can be fired at now: the one the scanner holds, near enough to
  // scan, seen, not yet recorded; never a witnessed seeker (the network's) nor a clearing.
  get fxTarget() {
    // (on foot, whatever the visor holds)
    if (this.mode === 'ground') { const a = this.afoot, t = a.target; return t && !t.scanned && (a.state === 'lock' || a.state === 'near') ? t : null; }
    if (this.mode !== 'fly' && this.mode !== 'seat') return null;
    const f = this.field, t = f.target;
    return t && t.model && !t.building && !t.scanned && !t.special && t.d.family !== 'landing' && (f.state === 'lock' || f.state === 'near') ? t : null;
  }

  // an anomaly's mark laid on an artifact (or the mark of anomalies meeting: 'combo:' and
  // which, colored in theirs)
  markFx(a, id) {
    if (!a.fx) a.fx = new ArtifactFx(a);
    if (id.startsWith('combo:')) { const ids = id.slice(6).split('+'); a.fx.combo(id, ids.map((x) => anomalyById(x).color)); }
    else a.fx.mark(id);
  }

  // An emitter fired at it: the artifact changes where it stands, and one use is spent
  // (none left: nothing happens, and a word says where more are).
  fire(id) {
    const t = this.fxTarget, e = effectById(id);
    if (!e || !this.progress.bought(id) || !t) return false;
    if (t.fx && t.fx.has(id)) return false;
    if (!this.progress.useFx(id)) { this.audio.play('error'); this.hud.say(`NO ${e.name} LEFT`, 'more in the SHOP, on the Codex computer', 3); return false; }
    if (!t.fx) t.fx = new ArtifactFx(t);
    t.fx.add(id);
    t.revealed = true;          // (it stays where it is now, with what was fired at it)
    if (this.mode !== 'ground') { this.shot.fire(e.color); this._shotAt = this.field.lightPos(t).clone(); }
    this.audio.play('fx', { id, pan: clamp(-(t.bearing || 0), -1, 1) });
    this.buzz(18);
    this.tips.learn('fx');
    return true;
  }

  // A turned stand: the air about it warms a little; flying into one the first time in
  // a while, a word about it.
  _turned(dt, eye, overlay) {
    const ex = eye.x + this.world.origin.x, ez = eye.z + this.world.origin.z;
    this._autumn = damp(this._autumn, autumn(ex, ez), 1.2, dt);
    // the fog lays its mist through any stand within its reach (looked for now and then)
    this._mistT = (this._mistT || 0) - dt;
    if (this._mistT <= 0) {
      this._mistT = 0.5;
      let near = autumn(ex, ez) > 0;
      for (let i = 0; i < 12 && !near; i++) for (const r of [450, 900]) near = near || autumn(ex + Math.cos(i * 0.5236) * r, ez + Math.sin(i * 0.5236) * r) > 0;
      FOG.uMist.value = near ? 1 : 0;
    }
    this.atmo.autumn = this._autumn;
    // and into the mountains, the same
    const mt = mountain(ex, ez);
    if (mt < 0.1) this._mountainSaid = false;
    else if (mt > 0.5 && !this._mountainSaid && !overlay && (this.mode === 'fly' || this.mode === 'seat')) {
      this._mountainSaid = true;
      this.hud.say('MOUNTAINS', 'peaks rising out of the fog', 4);
    }
    if (this._autumn < 0.1) this._autumnSaid = false;
    else if (this._autumn > 0.5 && !this._autumnSaid && !overlay && (this.mode === 'fly' || this.mode === 'seat')) {
      this._autumnSaid = true;
      this.hud.say('A TURNED STAND', 'birches gone to gold among the spruce', 4);
    }
  }

  // Rivers and canyons (terrain.js): seen ahead, a word on how to follow one (turn along
  // it); turned along one, near its middle, the ship follows it (ship.js: down in its cut,
  // along its bends), steering itself gently toward its middle a little way on, until the
  // pilot steers firmly away or turns off it; and on by itself while the pilot is inside
  // (walking, over coffee, at the Codex) until the river ends. steer: what the pilot asks;
  // returns what the ship does.
  _river(dt, steer) {
    const s = this.ship, overlay = this.terminal.open || this.menu.open || this.reader.open;
    const aboard = !this.landed && !this.landing.active && ['fly', 'seat', 'walk', 'coffee'].includes(this.mode);
    const flying = aboard && (this.mode === 'fly' || this.mode === 'seat');
    this._riverT = (this._riverT || 0) - dt;
    if (this._riverT <= 0) {
      this._riverT = 0.1;
      const R = riverAt(s.x, s.z), [fx, fz] = s.forward(), sg = Math.sign(R.v) || 1;
      const cx = s.x - sg * R.gx * R.d, cz = s.z - sg * R.gz * R.d;
      // (once following, carried well off its middle, too fast for its bends, it lets go and
      // climbs out over what is ahead, rather than meet the walls)
      const real = R.d < (this._riverOn ? R.rw + 22 : R.rw + 90) && height(cx, cz) < WATER - 1 && mountainEnv(cx, cz) < 0.1;
      const align = Math.abs(fx * -R.gz + fz * R.gx);
      const was = this._riverOn;
      // (it takes a river up only at the controls or outside; it keeps one from anywhere aboard)
      this._riverOn = (was ? aboard : flying) && real && align > (was ? 0.5 : 0.8) && Math.abs(steer) < 0.7;
      // a canyon (deep in the hills) or a river (between banks)
      const canyon = () => Math.max(height(cx + R.gx * 130, cz + R.gz * 130), height(cx - R.gx * 130, cz - R.gz * 130)) - WATER > 45;
      if (this._riverOn && !was && flying && !overlay && this.time - (this._riverSaidAt ?? -99) > 40) {
        this._riverSaidAt = this.time;
        this.hud.say(canyon() ? 'FOLLOWING THE CANYON' : 'FOLLOWING THE RIVER', 'steer away to climb out', 3.5);
      }
      // one ahead, not yet followed: how to
      if (!this._riverOn && flying && !overlay) {
        const ahead = [150, 260, 370].find((d) => { const x = s.x + fx * d, z = s.z + fz * d, Q = riverAt(x, z); return Q.d < Q.rw && height(x, z) < WATER - 1 && mountainEnv(x, z) < 0.1; });
        if (ahead && !this._riverAheadSaid) {
          this._riverAheadSaid = true;
          const x = s.x + fx * ahead, z = s.z + fz * ahead, Q = riverAt(x, z);
          const deep = Math.max(height(x + Q.gx * 130, z + Q.gz * 130), height(x - Q.gx * 130, z - Q.gz * 130)) - WATER > 45;
          this.hud.say(deep ? 'A CANYON AHEAD' : 'A RIVER AHEAD', 'turn along it, and the ship follows it down', 4.5);
        } else if (!ahead && R.d > 500) this._riverAheadSaid = false;
      }
    }
    s.follow = damp(s.follow, this._riverOn ? 1 : 0, this._riverOn ? 0.7 : 3.5, dt);
    if (s.follow > 0.2) {
      // toward its middle a little way on (near enough to keep to it through the bends);
      // the harder the pilot steers, the less
      const [[px, pz]] = s.riverPath([65 * Math.max(1, s.speed / 24)]);
      const e = angleDelta(s.heading, Math.atan2(px - s.x, pz - s.z));
      const free = 1 - clamp(Math.abs(steer) / 0.7, 0, 1);
      steer = clamp(steer - clamp(e * 3, -1, 1) * s.follow * free, -1, 1);
    }
    return steer;
  }

  // the wallet that has shared its address with this browser, if any
  walletAddress() { return connected(); }

  // inside the ship: on foot (at the Codex too), at the controls, over coffee
  _aboard() {
    return this.mode === 'walk' || this.mode === 'seat' || this.mode === 'coffee';
  }

  // a: what was scanned; from: where the photograph is taken from (render space; on foot,
  // the eye), else the ship's nose
  async _scanned(a, from = null) {
    // a clearing held in the scanner is not recorded: the ship comes down into it
    if (a.d.family === 'landing') { this.land(a); return; }
    this.audio.play('shutter');
    const photo = takePhoto(this, a, from);
    POST.uFlash.value = 0.9;
    const d = a.d;
    // kept by its key: the transaction (or seed), or for one of a sweep's seekers the
    // transaction and its token; hash: the transaction itself, when that differs
    const entry = {
      tx: d.key, ...(d.key !== d.tx ? { hash: d.tx, total: d.total } : {}), grand: !!d.grand,
      v: GENERATOR_VERSION, kind: d.kind, special: !!d.special, name: d.name, code: d.code, cls: d.cls, family: d.family, notes: d.notes,
      accent: d.accent, tokens: d.tokens, lead: d.lead, charge: d.charge, recipients: d.recipients, pool: d.pool,
      block: d.block, time: (a.move && a.move.time) || null, scannedAt: Date.now(), clock: this.atmo.clockString(), photo,
      passes: a.pass || 0, song: { degrees: d.song.degrees, k: d.song.k, n: d.song.n }, fund: d.fund,
      ...(d.depth ? { depth: d.depth, form: d.form, glimpse: !!d.glimpse } : {}),
      // a site's: where it stands (for anyone), how much lies in it
      ...(a.site ? { site: a.site.key, x: Math.round(a.x), z: Math.round(a.z), res: d.res || 0, place: a.site.place || 'any' } : {}),
      ...(d.plus ? { plus: true } : {}),
      ...(d.tier ? { tier: d.tier } : {}),
      ...(d.family === 'creature' ? { creature: d.species } : {}),
      ...(d.family === 'life' ? { life: d.species } : {}),
      ...(d.family === 'curio' ? { ground: true, curio: d.curio } : {}),
      // a thing about a clearing that is a site: told as the clearing (finds.js, the MAP),
      // its worth a share of the clearing's (progress.js)
      ...(a.clearing ? { site: a.clearing.key, x: Math.round(a.clearing.x), z: Math.round(a.clearing.z), of: a.clearing.of, tier: CLEARING, res: d.res || 0, landing: true, place: a.clearing.place || 'any' } : {}),
      ...(d.mountain ? { mountain: true } : {}),
      ...(d.autumn ? { autumn: true } : {}),
      ...(d.river ? { river: true } : {}),
      ...(a.fx && a.fx.list.length ? { fx: [...a.fx.list] } : {}),
      ...(this.anomalies.now.length && d.kind === 'wild' ? { anomalies: this.anomalies.now } : {}),
    };
    if (d.depth) this.progress.met(d.depth);
    // scanned again, further in: what was transmitted for it before is not paid twice
    const was = this.recorded(entry.tx);
    if (was) { entry.paid = was.sent ? Math.max(was.paid || 0, valueOf(was)) : was.paid || 0; entry.first = was.first || was.scannedAt; }
    entry.img = new Image();
    entry.img.src = photo;
    this.codex = [entry, ...this.codex.filter((e) => e.tx !== entry.tx)];
    this.stats_.scans++;
    this.tips.learn('scan');
    this.hud.recorded(entry);
    this.audio.play('recorded');
    this.buzz([14, 70, 22]);
    const { img, ...stored } = entry;
    await codexPut(stored);
    entry.img.onload = () => this.interior.drawScreen(this.codex, this.moves.status);
    this._save();
  }

  // where an artifact is on screen, in CSS pixels, and how big (render pixels)
  screenOf(a) {
    const cam = this.cams.cam;
    const p = a.model.focus.clone().applyMatrix4(a.model.group.matrixWorld);
    const v = p.clone().applyMatrix4(cam.matrixWorldInverse);
    if (v.z > -1) return null;
    p.project(cam);
    if (Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) return null;
    const o = this.px.origin;
    const w = this.px.width * o.css, h = this.px.height * o.css;
    const r = (a.model.span / -v.z) * U.uPxScale.value;
    return { x: o.x + (p.x * 0.5 + 0.5) * w, y: o.y + (0.5 - p.y * 0.5) * h, r };
  }

  // ---------------------------------------------------------------- the frame
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (this._frozen) return;
    this.px.adapt(dt * 1000, now);
    this.step(Math.min(dt, 0.1));
    // the loading screen goes once a couple of frames are drawn (shaders compiled)
    if (this.boot && ++this._bootFrames >= 3) { this.boot.done(); this.boot = null; }
  }

  step(dt) {
    this.px.renderer.info.reset();
    const input = this.input;
    input.pollPad();
    input.mode = this.mode;
    const overlay = this.terminal.open || this.menu.open || this.reader.open;
    if (this.paused) dt = 0;
    this.time += dt;
    // the beat follows the score's clock when there is one
    const ab = this.audio.beatNow();
    this.beat = ab !== null ? ab : this.beat + (dt * BPM) / 60;
    // (the world's own time: an anomaly may slow it, never the ship's)
    this.wtime += dt * this.slow;
    U.uTime.value = this.wtime;
    U.uAnim.value = Math.floor(this.wtime * 12) / 12;
    U.uBeat.value = this.beat;

    // seekers moved (or a wild one rose) while away from the ship's view: V goes out to
    // them from anywhere
    if ((this.hud.alarmOn || this.hud.toastOn) && !input.uiCapture && input.hit('KeyV', 'Pad2') && (this.mode === 'coffee' || overlay)) {
      this.goOutside();
      input.pressed.delete('KeyV');
      input.pressed.delete('Pad2');
    }
    // keys that work everywhere
    if (this.mode === 'title') {
      if (input.pressed.size || input.mouseDown) this.start();
    } else if (!overlay) {
      if (input.hit('Escape', 'KeyP', 'Pad9')) this.menu.show();
      else if (input.hit('KeyK', 'Pad8')) {
        // the Codex lives on the computer in the cabin, nowhere else
        if (this.mode === 'walk') this.hud.say('THE CODEX COMPUTER', 'On the right wall, across from the coffee machine', 3.5);
        else if (this.mode !== 'coffee') this.hud.say('THE CODEX IS ON THE CABIN COMPUTER', this.mode === 'seat' ? 'Press E to stand up' : 'Press V to go inside', 3.5);
      } else if (input.hit('KeyH')) {
        this.settings.hud = !this.settings.hud;
        this.applySettings();
        this.hud.say(this.settings.hud ? 'INTERFACE SHOWN' : 'INTERFACE HIDDEN', this.settings.hud ? '' : 'Press H to show it again', 3);
      }
      else if (input.hit('KeyM')) this.keepMusic();
      else if (input.hit('KeyR')) this.saveSound();
    } else {
      if (this.terminal.open) this.terminal.keys(input);
      else if (this.reader.open) this.reader.keys(input);
      else this.menu.keys(input);
    }
    this.terminal.update(dt);

    // the ship flies on whatever happens inside; outside or at the controls, W boosts
    let steer = 0;
    if (!overlay && (this.mode === 'fly' || this.mode === 'seat')) steer = input.steer();
    // (rolled over, left is still left on the screen)
    if (this.ship.flip > 0.5) steer = -steer;
    // a course set: toward it whenever nobody steers (course.js)
    steer = this.course.steer(dt, steer);
    // following a river: turned along one, the ship keeps to it until steered away
    steer = this._river(dt, steer);
    if (this.mode === 'title') steer = Math.sin(this.time * 0.05) * 0.25;
    // the boost burns plasma; spent, it waits until the core has gathered some back
    if (this.plasmaLeft <= 0) this._spent = true;
    else if (this._spent && this.plasmaLeft >= RELIGHT) this._spent = false;
    const boosting = !overlay && !this._spent && !this.teleport.active && (this.mode === 'fly' || this.mode === 'seat') && input.boostHeld();
    // (the burn fades in with its own sound; letting go has a soft fall)
    if (boosting !== this._boosting) {
      if (!boosting && this.ship.boost > 0.4) this.audio.play('release');
      this._boosting = boosting;
    }
    if (boosting) { this._boosted = (this._boosted || 0) + dt; if (this._boosted > 1) this.tips.learn('boost'); }
    this._alertness(dt);
    this._reach(dt);
    this.anomalies.update(dt);
    if (this.teleport.active) steer = 0;
    this.ship.update(dt, steer, boosting);
    this.teleport.update(dt);
    const tank = this.tankSecs;
    if (boosting) this.plasmaLeft = Math.max(0, this.plasmaLeft - (dt * this.ship.boost) / tank);
    else if (this.mode !== 'title') this.plasmaLeft = Math.min(1, this.plasmaLeft + (dt * this.progress.refill * this.refillBoost) / tank);
    const [fx, fz] = this.ship.forward();
    const cp = this.cams.cam.position;
    this.world.update(this.ship.x, this.ship.z, fx, fz, 2, cp.x + this.world.origin.x, cp.z + this.world.origin.z, dt);
    if (this._devTime !== undefined && this.clock.source !== 'none') { this.atmo.setTime(this._devTime); this._devTime = undefined; }
    this.atmo.update(dt, this.world.origin);
    this.obelisk.update(this.cams.cam.position, this.world.origin, this.time);
    this.ship.sync(this.world.origin, this.beat);
    // the boost's plasma, shed from the core behind the ship, and its roar
    if (this.ship.corePos) this.plasma.emit(this.ship.corePos, this._back.set(-fx, 0, -fz), this.ship.boost, dt);
    this.audio.engine(this.ship.boost);
    this.stats_.distance += this.ship.speed * dt;

    // The wild artifacts stand where they stand (sites.js; the field builds the near ones).
    // What still comes to the ship: when seekers moved on chain, their witnessed ones (a
    // sweep's together) rise ahead of it. Inside the ship they rise farther off, to give
    // time to come out to them. (Not while the ship is down, nor coming down or going up.)
    const down = !!this.landed || !!this.landing.active;
    if (!down) this.field.next -= dt;
    if (this.mode !== 'title' && !down && this.field.next <= 0 && !this._spawning) {
      this.field.next = 6;
      if (this.moves.waiting && !this.field.active.some((a) => a.special && !a.scanned && !a.passed)) {
        const wave = this.moves.takeWave(WAVE);
        const away = this.mode !== 'fly' && this.mode !== 'seat' || overlay;
        if (wave.length) {
          this._spawning = true;
          this.field.spawnWave(wave, { far: away ? this.ship.speed * 30 : 0 }).finally(() => { this._spawning = false; });
        }
      }
    }
    const canScan = !overlay && !this.teleport.active && (this.mode === 'fly' || this.mode === 'seat');
    const prevState = this.field.state;
    this.field.update(dt, canScan && input.scanHeld());
    if (this.field.state === 'lock' && prevState !== 'lock') { this.audio.play('lock'); this.buzz(10); }
    if (this.field.scan > 0 && input.scanHeld() && Math.floor(this.time * 6) !== this._scanTick) {
      this._scanTick = Math.floor(this.time * 6);
      this.audio.play('scan', { progress: this.field.scan });
    }
    // the emitters: 1 to 4 (the pad's cross, the HUD's buttons) at what the scanner holds
    // (on foot too)
    if (canScan || (this.mode === 'ground' && !overlay)) EFFECTS.forEach((e, i) => { if (input.hit(`Digit${i + 1}`, `Numpad${i + 1}`, FIRE_PAD[i])) this.fire(e.id); });
    const ft = this.mode === 'ground' ? null : this.fxTarget;
    this.shot.update(dt, this.ship.lensPos ? this.ship.lensPos() : this.ship.root.position, ft ? this.field.lightPos(ft) : this._shotAt);

    // the camera, by mode
    const inside = this.mode === 'walk' || this.mode === 'seat' || this.mode === 'coffee';
    this.ship.exterior.visible = !inside;
    this.interior.group.visible = inside;
    this.interior.lights(inside, this.beat);
    if (this._inspect && this._inspect.a.model.group.parent) this._inspectCam();
    else if (this.landing.active || this.mode === 'landing' || this.mode === 'takeoff') {
      // a key (not the menu's) hurries the scene along
      if (!overlay && [...input.pressed].some((k) => k !== 'Escape' && k !== 'KeyP' && k !== 'Pad9')) this.landing.hurry();
      this.landing.update(dt);
    } else if (this.mode === 'ground') this.afoot.update(dt, overlay);
    else if (this.mode === 'coffee') this.coffee.update(dt);
    else if (this.mode === 'walk') this._walk(dt, overlay);
    else if (this.mode === 'seat') this._seat(dt, overlay);
    else {
      if (!overlay && input.hit('KeyC', 'Pad3')) {
        const m = this.cams.cycle();
        this.tips.learn('camera');
        this.hud.say(m === 'cinematic' ? 'CINEMATIC' : `${m.toUpperCase()} CAMERA`, '', 1.5);
      }
      if (!overlay && input.hit('KeyV', 'Pad2')) this.enterCabin();
      // idle for a minute: the cinematic director takes over until a key is pressed
      if (this.mode === 'fly') this.cams.auto = this.mode === 'fly' && performance.now() - input.lastInput > 60000 && !this.field.pending;
      this.cams.exterior(this.ship, dt);
    }
    // stepping through a door, or out of a scene: a moment of dark
    if (this._fadeIn > 0) { this._fadeIn = Math.max(0, this._fadeIn - dt); POST.uFade.value = clamp(this._fadeIn / 0.45, 0, 1); }
    if (this.mode === 'coffee' && !overlay && this.coffee.t > 0.6 && input.hit('Escape', 'KeyE', 'Space', 'Enter', 'Pad0', 'Pad1', 'Tap')) this.coffee.skip();
    this.cams.cam.updateMatrixWorld();
    this.companion.update(dt, this.time);
    const cw = this.cams.cam.position;
    this.world.lods(cw.x + this.world.origin.x, cw.z + this.world.origin.z);
    this._turned(dt, cw, overlay);
    U.uPxScale.value = this.px.height / 2 / Math.tan((this.cams.cam.fov * Math.PI) / 360);

    // the score listens to the world
    const m = this.audio.mood;
    m.night = this.atmo.night;
    m.fog = clamp((U.uFogDensity.value - 0.003) / 0.008, 0, 1);
    m.drowsy = clamp(1 - this.alertness / 0.35, 0, 1);
    m.inside = inside ? 1 : 0;
    // and the anomalies running
    for (const k of Object.keys(this.audio.anom)) this.audio.anom[k] = this.anomalies.amount(k);
    m.turn = this.ship.yawRate;
    m.warm = this.mode === 'coffee' ? 1 : Math.max(0, this.warm / 90);
    const t = this.field.target;
    m.near = t ? clamp(1 - t.dist / 600, 0, 1) : 0;
    if (this.mode !== 'ground') this.audio.artifacts = this.field.active.filter((a) => !a.building && a.model).sort((p, q) => p.dist - q.dist).slice(0, VOICES)
      .map((a) => ({ key: `${a.d.key}:${a.d.depth || 0}`, d: a.d, dist: a.dist, bearing: a.bearing || 0, reveal: a.revealed ? a.reveal : 0 }));

    POST.uFlash.value = Math.max(0, POST.uFlash.value - dt * 2.5);
    this.px.render(this.scene, this.cams.cam);
    this._hud(dt, inside, overlay);
    this.touch.update();
    if (this.stats) this._stats(dt);
    if (input.hit('F3')) { this.stats = !this.stats; if (this._statsEl) this._statsEl.style.display = this.stats ? '' : 'none'; }
    if (Math.floor(this.time / 10) !== this._saveTick) { this._saveTick = Math.floor(this.time / 10); this._save(); this.interior.drawScreen(this.codex, this.moves.status); }
    input.endFrame();
  }

  // drowsiness: the edges close in, blinks grow longer, and below a tenth come short
  // sleeps in which the ship wanders and nothing can be scanned
  _alertness(dt) {
    if (this.mode === 'title' || this.mode === 'coffee') { POST.uDrowsy.value = damp(POST.uDrowsy.value, 0, 3, dt); POST.uBlink.value = 0; return; }
    this.warm = Math.max(0, this.warm - dt);
    this.alertness = Math.max(0, this.alertness - dt * DECAY * (this.warm > 0 ? 0.4 : 1));
    const a = this.alertness;
    POST.uDrowsy.value = damp(POST.uDrowsy.value, clamp((0.35 - a) / 0.35, 0, 1) * 0.85, 1, dt);
    const s = this.sleep;
    if (a < 0.3 && dt > 0) {
      if (s.t > 0) {
        s.t -= dt;
        const k = s.t / s.dur;
        POST.uBlink.value = Math.min(1, Math.sin(clamp(1 - k, 0, 1) * Math.PI) * (s.deep ? 1.6 : 1.3));
        this.asleep = s.deep && POST.uBlink.value > 0.95;
        if (s.deep) this.ship.drift = damp(this.ship.drift, Math.sin(this.time * 0.7) * 0.5, 1, dt);
        if (s.t <= 0) {
          s.next = 4 + a * 40 + Math.random() * 8;
          this.ship.drift = 0;
          this.asleep = false;
          if (s.deep) this.audio.play('yawn');
        }
      } else {
        s.next -= dt;
        POST.uBlink.value = 0;
        if (s.next <= 0) {
          s.deep = a < 0.1 && Math.random() < 0.6;
          s.dur = s.deep ? 2.5 + Math.random() * 2 : 0.35 + (0.3 - a) * 2.5;
          s.t = s.dur;
        }
      }
    } else {
      POST.uBlink.value = 0;
      this.ship.drift = 0;
      this.asleep = false;
    }
  }

  // ---------------------------------------------------------------- inside
  _lookInput(scale = 0.0024) {
    const l = this.input.takeLook();
    let k = 0;
    if (this.input.down('ArrowLeft') && this.mode === 'walk') k -= 1;
    if (this.input.down('ArrowRight') && this.mode === 'walk') k += 1;
    return { x: l.x * scale + k * 0.03, y: l.y * scale };
  }

  _walk(dt, overlay) {
    const fp = this.fp, input = this.input, I = this.interior;
    if (!overlay) {
      const l = this._lookInput();
      fp.yaw -= l.x;
      fp.pitch = clamp(fp.pitch - l.y, -1.3, 1.2);
      if (input.hit('Mouse0') && !input.locked && matchMedia('(pointer: fine)').matches) input.lock();
      const w = input.walk();
      const keysTurn = input.down('ArrowLeft', 'ArrowRight');
      const sx = keysTurn ? 0 : w.x;
      const speed = (input.down('ShiftLeft', 'ShiftRight') ? RUN : WALK) * dt;
      // forward is +z at yaw 0; +x is to the left
      const fwdX = Math.sin(fp.yaw), fwdZ = Math.cos(fp.yaw);
      const dx = (fwdX * w.y - fwdZ * sx) * speed, dz = (fwdZ * w.y + fwdX * sx) * speed;
      const moved = Math.hypot(dx, dz);
      if (I.free(fp.x + dx, fp.z + dz)) { fp.x += dx; fp.z += dz; }
      else if (I.free(fp.x + dx, fp.z)) fp.x += dx;
      else if (I.free(fp.x, fp.z + dz)) fp.z += dz;
      fp.walked += moved;
      fp.bob = damp(fp.bob, moved > 0.001 ? 1 : 0, 6, dt);
      if (fp.walked > 0.62) { fp.walked = 0; this.audio.play('step', { gain: 0.8 }); }
      // the nearest thing to use: in reach and roughly ahead, the more roughly the closer
      // one stands (right beside it, any way one faces); the one already offered stays
      // offered until one has clearly turned or stepped away
      // A station (the Codex computer, the coffee machine, the controls) comes before the
      // seeker aboard, which hovers by the computer, however near it is.
      const was = this._spot;
      this._spot = null;
      let best = Infinity;
      for (const s of I.spots) {
        const d = Math.hypot(s.at.x - fp.x, s.at.z - fp.z);
        const ang = Math.atan2(s.at.x - fp.x, s.at.z - fp.z);
        let da = ang - fp.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const keep = s === was ? 1.15 : 1;
        const reach = s.r * keep;
        const cone = (d < 0.9 ? Math.PI : 0.9 + (1 - d / reach) * 1.3) + (keep > 1 ? 0.35 : 0);
        const rank = d + (s.id === 'companion' ? 100 : 0);
        if (d < reach && Math.abs(da) < cone && rank < best) { best = rank; this._spot = s; }
      }
      // what one faces comes first (the Codex computer, the coffee machine, the controls);
      // else E hears the seeker aboard out, or asks it to talk
      const station = this._spot && this._spot.id !== 'companion';
      if (station && input.hit('KeyE', 'Enter', 'Pad0')) this._use(this._spot);
      else if (this.companion.talking && input.hit('KeyE', 'Enter', 'Pad0')) this.companion.advance();
      else if (this._spot && input.hit('KeyE', 'Enter', 'Pad0')) this._use(this._spot);
      else if (input.hit('KeyV', 'Pad2')) this.exitCabin();
    }
    const bob = Math.sin(this.time * 9.4) * 0.025 * fp.bob;
    this.cams.firstPerson(this.ship, new THREE.Vector3(fp.x, EYE + bob, fp.z), fp.yaw, fp.pitch, 72);
  }

  _use(s) {
    if (s.id === 'coffee') this.startCoffee();
    else if (s.id === 'codex') { this.terminal.show(); this.tips.learn('codex'); }
    else if (s.id === 'companion') this.companion.talk();
    else if (s.id === 'books') this.reader.show(this.ship.design.cabin.books);
    else if (s.id === 'hatch') this.goOut();
    else if (s.id === 'seat' && this.landed) this.takeoff();
    else if (s.id === 'seat') { this.mode = 'seat'; this.lookOff.yaw = 0; this.lookOff.pitch = 0; this.audio.play('ui', { h: 16 }); }
  }

  _seat(dt, overlay) {
    const lo = this.lookOff, input = this.input;
    if (!overlay) {
      const l = this._lookInput();
      lo.yaw = clamp(lo.yaw - l.x, -1.3, 1.3);
      lo.pitch = clamp(lo.pitch - l.y, -0.8, 0.6);
      if (!input.mouseDown && !input.locked) { lo.yaw = damp(lo.yaw, 0, 1.2, dt); lo.pitch = damp(lo.pitch, 0, 1.2, dt); }
      if (input.hit('KeyE', 'Pad1')) { this.tips.learn('stand'); this.mode = 'walk'; this.fp.x = 0; this.fp.z = 5.35; this.fp.yaw = 0; this.fp.pitch = -0.05; }
      else if (input.hit('KeyV', 'Pad2')) this.exitCabin();
    }
    this.cams.firstPerson(this.ship, new THREE.Vector3(0, 1.3, 6.4), lo.yaw, -0.06 + lo.pitch, 68 + this.ship.boost * 7);
  }

  _inspectCam() {
    const { a, dist, height, ang: fixed } = this._inspect;
    const c = new THREE.Vector3().copy(a.model.focus).applyMatrix4(a.model.group.matrixWorld);
    const r = dist || a.model.span * 2.6 + 12;
    const ang = fixed ?? this.time * 0.12;
    this.cams.cam.position.set(c.x + Math.sin(ang) * r, c.y + (height ?? r * 0.6), c.z + Math.cos(ang) * r);
    this.cams.cam.up.set(0, 1, 0);
    this.cams.cam.lookAt(c);
  }

  // ---------------------------------------------------------------- the HUD
  _hud(dt, inside, overlay) {
    const h = this.hud;
    h.root.classList.toggle('away', this.mode === 'title' || this.mode === 'coffee' || this.mode === 'landing' || this.mode === 'takeoff' || overlay);
    h.update(dt, this);
    const st = this.moves.status;
    const away = this.mode === 'walk' || this.mode === 'coffee' || overlay;
    h.setAlarm(away && this.mode !== 'title' ? this.field.open.filter((a) => a.special) : null);
    h.setStatus(st === 'live' ? 'SEEKER NET LIVE' : st === 'offline' ? 'SEEKER NET OFFLINE · ARCHIVE' : st === 'retrying' ? 'SEEKER NET RETRYING' : 'SEEKER NET …', st === 'live' ? 'live' : st === 'offline' ? 'off' : '');
    let keys = [];
    if (this.input.touchMode) keys = [];     // the buttons on screen say it
    else if (this.mode === 'fly') keys = [['A D', 'steer'], ['W', 'boost'], ['SPACE', 'scan'], ['V', 'go inside'], ['C', 'camera'], ['ESC', 'menu']];
    else if (this.mode === 'walk') keys = [['W A S D', 'walk'], ['E', 'use'], ['V', 'outside'], ['ESC', 'menu']];
    else if (this.mode === 'ground') keys = [['W A S D', 'walk'], ['SHIFT', 'run'], ['SPACE', 'scan'], ['E', 'use'], ['ESC', 'menu']];
    else if (this.mode === 'seat') keys = [['A D', 'steer'], ['W', 'boost'], ['SPACE', 'scan'], ['E', 'stand up'], ['V', 'outside']];
    h.setKeys(keys);
    h.setAnomalies(this.anomalies.list.filter((x) => x.left > 0).map((x) => { const a = anomalyById(x.id); return { name: a.name, color: a.color, left: x.left }; }));
    // the emitters bought, with their uses left, while something they can be fired at is in
    // reach
    const ft = !overlay ? this.fxTarget : null;
    const owned = ft ? EFFECTS.filter((e) => this.progress.bought(e.id)) : [];
    h.setFx(owned.length ? owned.map((e) => { const n = this.progress.usesOf(e.id); return { id: e.id, name: e.name, key: e.key, color: e.color, n, done: !!(ft.fx && ft.fx.has(e.id)), low: !n }; }) : null, !this.input.touchMode);
    // the teaching line and the marks; the keys stay a while after each change of place
    // (the tips reset the clock), and come back when an idle key is pressed
    this.tips.update(dt, overlay);
    h.keys.classList.toggle('dim', this.time - (this._keysShown || 0) > 20 && this.mode !== 'walk');
    h.cross.classList.toggle('on', (this.mode === 'walk' || this.mode === 'ground') && !overlay);
    // (on a touch screen the button that appears says it)
    if (this.input.touchMode) h.setPrompt(null);
    else if (this.mode === 'ground' && this.afoot.spot && !overlay) h.setPrompt(this.afoot.spot.label, 'E');
    else if (this.mode === 'walk' && this._spot && this._spot.id !== 'companion' && !overlay) h.setPrompt(this._spot.label, 'E');
    else if (this.mode === 'walk' && this.companion.talking && !overlay) h.setPrompt('Next', 'E');
    else if (this.mode === 'walk' && this._spot && !overlay) h.setPrompt(this._spot.label, 'E');
    else h.setPrompt(null);
  }

  _stats(dt) {
    if (!this._statsEl) {
      this._statsEl = document.createElement('pre');
      this._statsEl.style.cssText = 'position:absolute;left:8px;top:8px;margin:0;font:12px monospace;color:#abe3d9;text-shadow:1px 1px 0 #000;pointer-events:none;z-index:5';
      this.uiRoot.append(this._statsEl);
      this._fps = 60;
    }
    this._fps = this._fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    const i = this.px.renderer.info;
    this._statsEl.textContent = `${this._fps.toFixed(0)} fps  ${this.px.width}x${this.px.height}\ncalls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k\nchunks ${this.world.chunks.size}  y ${this.ship.y.toFixed(0)}  fog ${U.uFogBase.value.toFixed(0)} ${U.uFogDensity.value.toFixed(4)}\nt ${this.atmo.time.toFixed(3)} ${this.atmo.clockString()} ${this.clock.source}  alert ${this.alertness.toFixed(2)}`;
  }

  // ---------------------------------------------------------------- development
  seekerInfo(t) {
    return this.artReady ? art.info(t) : null;
  }

  async seekerPixels(token) {
    try {
      await art.loadMeta();
      return art.decode(token, await art.cell(token), { activated: true });
    } catch { return null; }
  }

  _devHooks() {
    window.__lp = {
      spawn: async (i = 0, ahead, lateral) => {
        const snap = this._snap || (this._snap = await fetch('assets/moves.json').then((r) => r.json()));
        const m = typeof i === 'object' ? i : snap.moves[i % snap.moves.length];
        return this.field.spawn(m, ahead ? { ahead, lateral: lateral || 0 } : {});
      },
      // a wild artifact of a family, or (witness) a stand-in for a move seen now
      fake: (family, ahead, witness = false) => {
        const tx = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const move = witness || family === 'echo'
          ? { tx, block: 1, tokens: [1 + Math.floor(Math.random() * 2222)], charge: 800, recipients: 2200, pool: family === 'echo' ? 'activated' : 'dormant', time: Date.now(), live: true }
          : { tx, wild: true };
        return this.field.spawn(move, ahead ? { ahead, lateral: 0, family } : { family });
      },
      // as if a seeker moved on chain this moment (the move watcher's path)
      witness: (token = 1 + Math.floor(Math.random() * 2222)) => {
        const tx = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const m = { tx, block: 1, tokens: [token], charge: 1200, recipients: 2200, pool: 'dormant', time: Date.now() };
        this.moves._enqueue(m);
        if (this.moves.onMove) this.moves.onMove(m);
        return tx;
      },
      // as if n seekers moved in one transaction this moment (a sweep)
      sweep: (n = 7) => {
        const tx = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const tokens = [];
        while (tokens.length < n) { const t = 1 + Math.floor(Math.random() * 2222); if (!tokens.includes(t)) tokens.push(t); }
        const m = { tx, block: 1, tokens, charge: 3000, recipients: 2200, pool: 'dormant', time: Date.now() };
        this.moves._enqueue(m);
        if (this.moves.onMove) this.moves.onMove(m);
        return tx;
      },
      clear: () => { for (const a of [...this.field.active]) this.field.remove(a); },
      // effects on the newest artifact, as if fired (marks: as an anomaly lays them)
      fx: (...ids) => {
        const a = this.field.active[this.field.active.length - 1];
        if (!a) return null;
        if (!a.fx) a.fx = new ArtifactFx(a);
        for (const id of ids) { if (['charge', 'glow', 'freeze', 'invert'].includes(id)) a.fx.mark(id); else a.fx.add(id); }
        return [...a.fx.list, ...a.fx.marks];
      },
      // aboard a ship of the hangar, as if bought
      ship: (id) => { if (!this.progress.owns(id)) this.progress.ships.push(id); this.board(id); return this.ship.design.name; },
      inspect: (a, dist = null, height = null, ang = null) => { this._inspect = a ? { a, dist, height, ang } : null; },
      // a deep one: of a depth, and a form if asked (orbited, like look); mountain: one of
      // the mountains' own (a surface one too, depth 0, family named as form)
      deep: async (depth = 1, form = null, ahead = 700, mountain = false, plus = false) => {
        for (const a of [...this.field.active]) this.field.remove(a);
        const a = depth > 0 ? await this.field.spawnWild({ depth, form, ahead, lateral: 0, mountain, plus }) : await this.field.spawnWild({ ahead, lateral: 0, mountain: true, family: form || undefined });
        this._inspect = { a };
        return { name: a.d.name, code: a.d.code, form: a.d.form, notes: a.d.notes, params: a.d.params };
      },
      // life in the forest, of a kind, at a depth, ahead (orbited)
      life: async (sp = 'flock', depth = 0, ahead = 300) => {
        for (const a of [...this.field.active]) this.field.remove(a);
        const a = await this.field.spawnWild({ life: sp, depth, ahead, lateral: 0, quiet: true });
        this._inspect = { a };
        return { name: a.d.name, code: a.d.code, notes: a.d.notes, x: Math.round(a.x), z: Math.round(a.z) };
      },
      // one of the rivers' own, at a depth (0: a surface family, named as form), on the
      // river nearest the ship
      river: async (depth = 0, form = null) => {
        for (const a of [...this.field.active]) this.field.remove(a);
        const R = riverAt(this.ship.x, this.ship.z), s = Math.sign(R.v) || 1;
        const at = { x: this.ship.x - s * R.gx * R.d, z: this.ship.z - s * R.gz * R.d };
        const opts = depth > 0 ? { depth, form, river: true } : { river: true, family: form || undefined };
        const a = await this.field.spawnWild({ ...opts, ahead: 300, lateral: 0 });
        this._inspect = { a };
        return { name: a.d.name, code: a.d.code, form: a.d.form || a.d.family, notes: a.d.notes, x: Math.round(a.x), z: Math.round(a.z), at };
      },
      // a clearing to land in, ahead
      site: async (ahead = 320) => {
        for (const a of [...this.field.active]) this.field.remove(a);
        const a = await this.field.spawnWild({ landing: true, ahead, lateral: 0 });
        return { name: a.d.name, x: a.x, z: a.z };
      },
      // a creature of a species, at a depth, ahead
      creature: async (species = null, depth = 0, ahead = 300) => {
        for (const a of [...this.field.active]) this.field.remove(a);
        const a = await this.field.spawnWild({ depth, ahead, lateral: 0, creature: true, species });
        return { name: a.d.name, code: a.d.code, species: a.d.species, notes: a.d.notes };
      },
      look: async (family, ahead = 700) => {
        for (const a of [...this.field.active]) this.field.remove(a);
        const a = await window.__lp.fake(family, ahead);
        this._inspect = { a };
        return { name: a.d.name, code: a.d.code, notes: a.d.notes, params: a.d.params };
      },
      // a site's artifact as a pilot attuned to `seen` sees it: of a family (or any), holding
      // `res` layers, ahead (orbited); opts: { mountain, autumn, river, lake, plus, trace, seed }
      // (the sites themselves are held off meanwhile: sitesOff(false) brings them back)
      layer: async (family = null, seen = 0, res = seen, opts = {}, ahead = 420) => {
        this.field.noSites = true;
        for (const a of [...this.field.active]) this.field.remove(a);
        const tx = opts.seed || '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const move = { tx, wild: true, site: 'dev', res, depth: Math.min(seen, res), mountain: !!opts.mountain, autumn: !!opts.autumn, river: !!opts.river, lake: !!opts.lake, plus: !!opts.plus, trace: !!opts.trace, form: opts.form, tier: opts.tier };
        const a = await this.field.spawn(move, { ahead, lateral: 0, family: family || undefined, quiet: true });
        this._inspect = { a };
        return { name: a.d.name, code: a.d.code, family: a.d.family, form: a.d.form, layers: a.d.over && a.d.over.layers, height: Math.round(a.model.height), span: Math.round(a.model.span), seed: tx, notes: a.d.notes };
      },
      sitesOff: (v = true) => { this.field.noSites = v; if (v) for (const a of [...this.field.active]) if (a.site) this.field.remove(a); },
      // the sites heard and built now; attune to n; put the ship near a place
      sites: () => ({ signals: this.field.signals.map((s) => ({ key: s.key, kind: s.site.kind, place: s.site.place, res: s.site.res, dist: Math.round(s.dist), built: !!s.a })), built: [...this.field.sites.values()].map((a) => ({ key: a.site.key, name: a.d.name, family: a.d.family, depth: a.d.depth, res: a.d.res, dist: Math.round(a.dist), scanned: a.scanned })) }),
      // the nearest site of a tier (tiers.js) within r: put the ship `back` meters short of it
      rare: (tier = 2, back = 1500, r = 60000) => {
        const all = sitesNear(this.ship.x, this.ship.z, r, 1e9).sites.filter((s) => s.kind === 'artifact' && (s.tier || 0) === tier);
        all.sort((p, q) => Math.hypot(p.x - this.ship.x, p.z - this.ship.z) - Math.hypot(q.x - this.ship.x, q.z - this.ship.z));
        const s = all[0];
        if (!s) return null;
        const h = Math.atan2(s.x - this.ship.x, s.z - this.ship.z);
        this.ship.place(s.x - Math.sin(h) * back, s.z - Math.cos(h) * back, h);
        return { key: s.key, tier: s.tier, res: s.res, x: Math.round(s.x), z: Math.round(s.z), of: all.length };
      },
      // the nearest point well inside a reach ('desert' or 'greatlake'), the ship put there
      reach: (which = 'desert', max = 400000) => {
        const f = which === 'desert' ? desertEnv : lakeEnv;
        for (let r = 0; r < max; r += 3000) for (let i = 0; i < Math.max(1, Math.round(r / 2000)); i++) {
          const a = (i / Math.max(1, Math.round(r / 2000))) * Math.PI * 2, x = this.ship.x + Math.cos(a) * r, z = this.ship.z + Math.sin(a) * r;
          if (f(x, z) > 0.95) { this.ship.place(x, z, this.ship.heading); return [Math.round(x), Math.round(z)]; }
        }
        return null;
      },
      att: (n) => { this.progress.depth = n; this.progress.save(); this.field.reattune(); return n; },
      goto: (x, z, heading) => { this.ship.place(x, z, heading ?? this.ship.heading); return [x, z]; },
      families: () => ALL_FAMILIES,
      time: (t) => { this.atmo.setTime(t); },
      alert: (v) => { this.alertness = v; },
      // a stand-in wallet with a throwaway key, for testing the board's flow locally
      mockWallet: async (skHex, holder = true) => {
        const noble = await import('../vendor/noble-secp256k1.js');
        const { keccak256, toHex, fromHex } = await import('./core/keccak.js');
        const sk = fromHex(skHex);
        const address = '0x' + toHex(keccak256(noble.getPublicKey(sk, false).slice(1))).slice(24);
        const provider = {
          request: async ({ method, params }) => {
            if (method === 'eth_requestAccounts') return [address];
            if (method === 'personal_sign') {
              const msg = fromHex(params[0]);
              const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msg.length}`);
              const sig = await noble.signAsync(keccak256(new Uint8Array([...prefix, ...msg])), sk);
              return '0x' + sig.r.toString(16).padStart(64, '0') + sig.s.toString(16).padStart(64, '0') + (27 + sig.recovery).toString(16);
            }
            throw new Error('not supported: ' + method);
          },
        };
        window.ethereum = provider;
        if (!this.terminal.board) this.terminal.show('seekers');
        if (holder) this.terminal.board.devHolders = new Set([address]);
        return address;
      },
      // advance the game without the browser's frames (a hidden pane does not draw)
      run: (sec, fps = 30) => { for (let i = 0; i < sec * fps; i++) this.step(1 / fps); },
      // stop the browser's frames from moving the game (run() still does)
      freeze: (on = true) => { this._frozen = on; },
      // the coffee scene at a moment (seconds), for looking at it
      coffeeAt: (t, fps = 30) => {
        this._frozen = true;
        if (this.mode !== 'coffee') { this.mode = 'walk'; this.fp.x = 1.2; this.fp.z = 0.8; this.fp.yaw = Math.PI / 2; this.startCoffee(); }
        if (t < this.coffee.t) { this.coffee.start(this.fp); }
        while (this.coffee.t < t - 1e-6) this.step(Math.min(1 / fps, t - this.coffee.t));
        return this.coffee.t;
      },
      key: (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
    };
  }
}

function agoShort(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

