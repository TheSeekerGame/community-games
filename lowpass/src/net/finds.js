import { checkEvent, signEvent } from './nostr.js';
import { checkLink } from './wallet.js';
import { PROTO } from './board.js';
import { load, save } from '../core/store.js';
import { WORLD, placeCode, siteByKey } from '../world/sites.js';
import { siteWorth } from '../core/progress.js';
import { tierOf } from '../artifacts/tiers.js';

// Finds: who came to each site first, and what that is worth to them.
//
// Transmitting a site's scan (for a holder who has linked a wallet) also tells the relays,
// in one small signed event, that this address found that site, and when: app data (Nostr
// kind 30078), one per address and site, carrying the same wallet proof as a board post.
// Every reader puts each site's finders in the same order: the earliest find of each
// address that holds a seeker now, first to last.
//
// The finders of a site share in everyone who comes after them: for each pilot who finds
// it later, the first finder gets SHARE of the site's whole worth (siteWorth: its tier,
// every layer of it seen), the second half that, the third half that again, and so on
// down the line. Nobody pays for it: it is new DATA, credited to each finder as the later
// finds reach their page. So the first to a rare site does best, and telling others of it
// pays: every pilot who flies there after is a share.
//
// And when anyone finds one of the rarest (EPIC and up), every ship that hears of it in
// the next hours is told, with the place to fly to (game.js, the HUD).
//
// (Every reader checks every find as it checks a post: its signature, its wallet proof,
// that the address holds a seeker; and that the site is there, as it says, of that tier. The time is the finder's own: a reader cannot know
// better, so the order is as honest as the finders' clocks; a find dated ahead of now is
// not counted.)

export const FINDS_TAG = 'lowpassfind';
export const SHARE = 0.1;           // the first finder's share of each later find; each next finder, half the last's
const DEPTH = 8;                    // finders past this many share nothing more
const RECENT = 7 * 86400;           // finds read from the relays, this far back (s)
const TELL = 6 * 3600;              // a rare find is told to every ship this long after (s)
const MINE_MAX = 200;               // own sites watched for later finders
const tag = (ev, name) => (Array.isArray(ev.tags) ? ev.tags.find((t) => Array.isArray(t) && t[0] === name) : null);
export const siteId = (key) => `${WORLD}|${key}`;
export const shareOf = (rank) => (rank < DEPTH ? SHARE / Math.pow(2, rank) : 0);

export class Finds {
  constructor(board) {
    this.board = board;
    this.game = board.game;
    this.sites = new Map();       // site id -> Map(address -> { at, pubkey, tier, res, place, name, code, key })
    this.waiting = [];            // finds waiting for their address's holdings
    this.told = new Set(load('finds.told', []));
    this.paid = load('finds.paid', {});         // site id -> how many later finders were paid for
    this.published = new Set(load('finds.sent', []));
    this.onChange = null;
    this.onRare = null;           // (find) one of the rarest, found lately by someone else
    this.onRoyalty = null;        // (data, pilots, sites)
  }

  start() {
    const pool = this.board.pool;
    pool.subscribe('lp-finds', { kinds: [30078], '#t': [FINDS_TAG], since: Math.floor(Date.now() / 1000) - RECENT, limit: 1000 });
    this.watchMine();
    this._timer = setInterval(() => this._check(), 2000);
  }

  // the sites this pilot has found, watched for anyone who comes after (all time)
  watchMine() {
    const ids = [...new Set(this.game.codex.filter((e) => e.site && e.sent).map((e) => siteId(e.site)))].slice(0, MINE_MAX);
    if (!ids.length) return;
    const key = ids.join(',');
    if (key === this._mineKey) return;
    this._mineKey = key;
    this.board.pool.subscribe('lp-finds-mine', { kinds: [30078], '#t': [FINDS_TAG], '#s': ids, limit: 2000 });
  }

  // ---------------------------------------------------------------- reading
  async event(ev) {
    const lp = tag(ev, 'lp'), proof = tag(ev, 'lp-proof'), f = tag(ev, 'lp-find'), s = tag(ev, 's');
    if (!lp || lp[1] !== PROTO || lp[2] !== 'find' || !proof || !f || !s) return;
    const id = String(s[1] || '');
    if (!id.startsWith(WORLD + '|') || id.length > 80 || f[1] !== id.slice(WORLD.length + 1)) return;
    const at = Number(ev.created_at) || 0;
    if (at > Date.now() / 1000 + 600 || at < 1.7e9) return;
    const address = String(proof[1] || '').toLowerCase();
    if (!(await checkEvent(ev))) return;
    if (!checkLink(address, ev.pubkey, String(proof[2] || ''))) return;
    // (what it claims, against the site itself: anyone can work a site out from its key)
    const site = siteByKey(f[1]);
    if (!site || site.kind !== 'artifact' || (site.tier || 0) !== (parseInt(f[2], 10) || 0) || (site.res || 0) !== (parseInt(f[3], 10) || 0)) return;
    const find = {
      id, key: f[1], address, pubkey: ev.pubkey, at,
      tier: site.tier || 0, res: site.res || 0,
      place: placeCode(site.x, site.z), x: site.x, z: site.z,
      name: String(f[5] || '').slice(0, 60), code: String(f[6] || '').slice(0, 14),
    };
    this.waiting.push(find);
  }

  // whether each waiting find's address holds a seeker now (the board's reading of it)
  async _check() {
    if (!this.waiting.length) return;
    const b = this.board, now = Date.now();
    const need = [...new Set(this.waiting.map((p) => p.address))].filter((a) => { const h = b.holders.get(a); return !h || now - h.at > 600000; });
    if (need.length) {
      try {
        const n = await this.game.chain.balances(need);
        if (b.devHolders) need.forEach((a, i) => { if (b.devHolders.has(a)) n[i] = Math.max(n[i], 1); });
        need.forEach((a, i) => b.holders.set(a, { n: n[i], at: Date.now() }));
      } catch { return; }
    }
    const still = [], fresh = [];
    for (const f of this.waiting) {
      const h = b.holders.get(f.address);
      if (!h) { still.push(f); continue; }
      if (h.n < 1) continue;
      let m = this.sites.get(f.id);
      if (!m) this.sites.set(f.id, (m = new Map()));
      const had = m.get(f.address);
      if (had && had.at <= f.at) continue;
      m.set(f.address, f);
      fresh.push(f);
    }
    this.waiting = still;
    if (!fresh.length) return;
    this._tell(fresh);
    this._royalties();
    if (this.onChange) this.onChange();
  }

  // a site's finders, first to last
  finders(id) {
    const m = this.sites.get(id);
    return m ? [...m.values()].sort((p, q) => p.at - q.at || (p.pubkey < q.pubkey ? -1 : 1)) : [];
  }
  // where this pilot stands among a site's finders (0: first; -1: not among them)
  rankOf(key) {
    const me = this.board.link && this.board.link.address;
    return me ? this.finders(siteId(key)).findIndex((f) => f.address === me) : -1;
  }

  // the recent finds, rarest and newest first (for the map, the board)
  recent(minTier = 0) {
    const out = [];
    for (const id of this.sites.keys()) { const fs = this.finders(id); if (fs.length && fs[0].tier >= minTier) out.push({ ...fs[0], count: fs.length }); }
    return out.sort((p, q) => q.tier - p.tier || q.at - p.at);
  }

  // the rarest, told to this ship once each, while they are fresh, unless it was here
  _tell(fresh) {
    const me = this.board.link && this.board.link.address, now = Date.now() / 1000;
    for (const f of fresh) {
      if (f.tier < 3 || now - f.at > TELL || f.address === me || this.told.has(f.id) || !Number.isFinite(f.x)) continue;
      if (this.game.codex.some((e) => e.site === f.key)) continue;
      // (the first of its finders only: the news is that it was found)
      if (this.finders(f.id)[0] !== f) continue;
      this.told.add(f.id);
      save('finds.told', [...this.told].slice(-300));
      if (this.onRare) this.onRare(f);
    }
  }

  // what this pilot is owed for those who came after it, credited
  _royalties() {
    const me = this.board.link && this.board.link.address;
    if (!me) return;
    let data = 0, pilots = 0, sites = 0;
    for (const id of this.sites.keys()) {
      const fs = this.finders(id), r = fs.findIndex((f) => f.address === me);
      if (r < 0 || r >= DEPTH) continue;
      const after = fs.length - 1 - r, was = this.paid[id] || 0;
      if (after <= was) continue;
      const mine = fs[r], worth = siteWorth(mine.tier, mine.res);
      const n = Math.round(shareOf(r) * worth * (after - was));
      this.paid[id] = after;
      if (n > 0) { data += n; pilots += after - was; sites++; }
    }
    if (!sites) return;
    save('finds.paid', this.paid);
    this.game.progress.credit(data);
    this.game.progress.royalties = (this.game.progress.royalties || 0) + data;
    this.game.progress.save();
    if (this.onRoyalty) this.onRoyalty(data, pilots, sites);
  }

  // ---------------------------------------------------------------- finding
  // Tell the relays this pilot found these sites (Codex entries, just transmitted): each
  // once. Without a linked holder's wallet, nothing is sent (and nothing is shared in).
  async publish(entries) {
    const b = this.board;
    if (!b.link) return 0;
    let n;
    try { n = await b.holdingsOf(b.link.address, true); } catch { return 0; }
    if (n < 1) return 0;
    let sent = 0;
    for (const e of entries) {
      if (!e.site || this.published.has(siteId(e.site))) continue;
      const id = siteId(e.site), place = Number.isFinite(e.x) ? placeCode(e.x, e.z) : '';
      const tags = [['d', `lowpass:find:${id}`], ['t', FINDS_TAG], ['s', id], ['client', 'Low Pass'], ['lp', PROTO, 'find'],
        ['lp-proof', b.link.address, b.link.signature], ['lp-find', e.site, String(e.tier || 0), String(e.res || 0), place, String(e.name || '').slice(0, 60), String(e.code || '').slice(0, 14)]];
      try {
        const ev = await signEvent({ kind: 30078, tags, content: '' }, b.key);
        const results = await b.pool.publish(ev);
        if (!results.some((r) => r.ok)) continue;
        this.published.add(id);
        sent++;
        await this.event(ev);
      } catch { /* tried again at the next transmit */ }
    }
    save('finds.sent', [...this.published]);
    this.watchMine();
    this._check();
    return sent;
  }

  // the whole worth of a site, as its finders' shares are reckoned
  static worth(e) { return siteWorth(e.tier || 0, e.res || 0); }
  static tierName(t) { return tierOf(t).name; }
}
