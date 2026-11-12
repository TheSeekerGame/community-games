import { load, save } from './store.js';
import { SHIPS } from '../ship/designs.js';
import { EFFECTS, FX_VALUE, PACK, fxPrice } from '../artifacts/fx.js';
import { ANOMALY_VALUE } from '../world/anomaly.js';
import { LIFE_VALUE } from '../artifacts/life.js';
import { RIVER_VALUE, THREADED_VALUE } from '../artifacts/river.js';
import { tierOf } from '../artifacts/tiers.js';

// Progress: DATA, and what it buys: how far into every artifact the pilot sees
// (attunement, without end), how much plasma the tank holds and how far off the ship
// hears a site (five levels each).
//
// Every scan in the Codex can be transmitted once, for DATA; it stays in the Codex (and on
// the leaderboard) either way. A wild scan is worth BASE, and BASE more for every layer of
// the artifact that was seen when it was scanned (linear); a witnessed one, WITNESSED.
// DATA buys attunement: the first level costs FIRST (twelve plain scans), each next one
// twice the last, without end.
//
// Attunement decides how much of each artifact there is to see. The artifacts stand at
// their sites, the same for every ship (sites.js); each holds layers under what stands at
// the surface, as many as its resonance (most a few, each one more rarer, without end:
// deep.js). A pilot attuned to n sees the first n of them: so every level adds something
// to most artifacts already found, which can be scanned again for the difference (what
// was transmitted for one before is not paid twice: owedFor), and the deepest ones are
// places worth telling another pilot of.
// Every site has a tier (tiers.js), and a scan is worth its tier's times as much: RARE
// five, EPIC fifteen, LEGENDARY sixty, MYTHIC four hundred. A creature that flees is worth
// CREATURE_VALUE times its layers'. (Scans of the marked (+), from before the tiers, keep
// their PLUS_VALUE.) A pilot who transmits a site before others also gets a share of each
// later pilot's find there (finds.js): siteWorth is what the shares are reckoned on.
// Witnessed seekers are never touched by any of it.
//
// Ships (designs.js): bought once with DATA, then boarded whenever one likes; the Seed is
// everyone's from the start.
//
// Effects (fx.js): the ship's emitters, bought PACK uses at a time (and bought again), fired
// at an artifact; a scan is worth FX_VALUE times more for every one it took.
//
// The plasma tank: seconds of a full boost (TANK, by level); the core gathers it back at
// REFILL seconds' worth a second (by level too, so a larger tank still fills from empty in
// about the same twenty seconds: each level is more boost, and sooner back). Signal gain: how far the
// ship's receiver hears a site not yet recorded (sites.js: HEAR, by level).

export const BASE = 10;
export const WITNESSED = 40;
export const FIRST = 120;
export const PLUS_VALUE = 10;      // one of the marked (+) is worth this many times its layers'
export const CREATURE_VALUE = 4;   // a creature that flees (species.js), likewise
export const LANDING_DEPTH = 3;    // a clearing's lanterns are seen once attuned this far (and nothing says so)
export const CURIO_VALUE = 2;      // a thing found on foot about a clearing (curios.js)

export const TANK = [5, 7, 9, 11, 13, 15];
export const REFILL = [0.24, 0.32, 0.4, 0.48, 0.56, 0.64];
// what each level of the capped ones costs (the first entry buys level one)
const COSTS = { tank: [40, 80, 130, 200, 300], gain: [80, 150, 250, 380, 550] };
export const MAX = { tank: COSTS.tank.length, gain: COSTS.gain.length };

export const costOf = (depth) => FIRST * Math.pow(2, depth - 1);     // to reach this depth
export const valueOf = (e) => (e.kind === 'wild'
  ? Math.round(BASE * (1 + (e.depth || 0)) * tierOf(e.tier).value * (e.plus ? PLUS_VALUE : 1) * (e.creature ? CREATURE_VALUE : e.ground ? CURIO_VALUE : e.life ? LIFE_VALUE : 1) * Math.pow(FX_VALUE, (e.fx || []).length) * Math.pow(ANOMALY_VALUE, (e.anomalies || []).length) * (e.river ? RIVER_VALUE : 1) * (e.family === 'naturalbridge' && e.passes > 0 ? THREADED_VALUE : 1))
  : e.special ? WITNESSED : BASE);

// what a site is worth, whole: its tier's worth, every layer in it seen (what the pilots
// before one at a site get their shares of: finds.js)
export const siteWorth = (tier, res) => BASE * tierOf(tier).value * (1 + (res || 0));

// what transmitting a scan brings now: its worth, less what was paid for it before
export const owedFor = (e) => Math.max(0, valueOf(e) - (e.paid || 0));

export class Progress {
  constructor() {
    const s = load('progress', {});
    this.data = s.data || 0;          // DATA in hand
    this.depth = s.depth || 0;        // attunement: how many layers of an artifact the pilot sees
    this.earned = s.earned || 0;      // all DATA ever received
    this.deepest = s.deepest || 0;    // the most layers ever seen in one artifact
    this.tank = s.tank || 0;          // the plasma tank's level
    this.gain = s.gain || 0;          // the signal gain's level
    this.royalties = s.royalties || 0; // all DATA ever received as a finder's share (finds.js)
    this.ships = s.ships || ['seed'];  // the ships bought
    // the effects: uses left of each ever bought ({ id: n }; once, the effects were bought
    // for good: those keep a pack)
    this.fx = Array.isArray(s.fx) ? Object.fromEntries(s.fx.map((id) => [id, PACK])) : s.fx || {};
    this.ship = this.ships.includes(s.ship) ? s.ship : 'seed';   // the one boarded
  }
  save() { save('progress', { data: this.data, depth: this.depth, earned: this.earned, deepest: this.deepest, tank: this.tank, gain: this.gain, royalties: this.royalties, ships: this.ships, ship: this.ship, fx: this.fx }); }
  owns(id) { return this.ships.includes(id); }
  canShip(id) { const d = SHIPS.find((x) => x.id === id); return !!d && !this.owns(id) && this.data >= d.price; }
  buyShip(id) {
    if (!this.canShip(id)) return false;
    this.data -= SHIPS.find((x) => x.id === id).price;
    this.ships.push(id);
    this.save();
    return true;
  }
  board(id) { if (!this.owns(id) || this.ship === id) return false; this.ship = id; this.save(); return true; }
  get tankSecs() { return TANK[Math.min(this.tank, TANK.length - 1)]; }
  get refill() { return REFILL[Math.min(this.tank, REFILL.length - 1)]; }
  // what the next step of an upgrade costs (null: at its last level)
  cost(kind) { return kind === 'depth' ? costOf(this.depth + 1) : COSTS[kind][this[kind]] ?? null; }
  can(kind) { const c = this.cost(kind); return c !== null && this.data >= c; }
  get anyCan() { return ['depth', 'tank', 'gain'].some((k) => this.can(k)) || SHIPS.some((d) => this.canShip(d.id)); }
  bought(id) { return id in this.fx; }
  usesOf(id) { return this.fx[id] || 0; }
  fxCost(id) { return fxPrice(EFFECTS.find((x) => x.id === id), this.depth); }
  canFx(id) { return !!EFFECTS.find((x) => x.id === id) && this.data >= this.fxCost(id); }
  buyFx(id) {
    if (!this.canFx(id)) return false;
    this.data -= this.fxCost(id);
    this.fx[id] = this.usesOf(id) + PACK;
    this.save();
    return true;
  }
  useFx(id) {
    if (!this.usesOf(id)) return false;
    this.fx[id]--;
    this.save();
    return true;
  }
  // the scans not yet transmitted, and what they are worth together
  // (one scanned again further in is owed only what it is worth more than before)
  unsent(codex) {
    const list = codex.filter((e) => !e.sent);
    return { list, value: list.reduce((s, e) => s + owedFor(e), 0) };
  }
  credit(n) { this.data += n; this.earned += n; this.save(); }
  buy(kind) {
    if (!this.can(kind)) return false;
    this.data -= this.cost(kind);
    this[kind]++;
    this.save();
    return true;
  }
  met(depth) { if (depth > this.deepest) { this.deepest = depth; this.save(); } }
}
