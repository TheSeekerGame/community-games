import { el, clear, ago, dateStr, short, key } from './dom.js';
import { Board, hasLink } from '../net/board.js';
import { Ranks } from '../net/ranks.js';
import { load, save, codexPut } from '../core/store.js';
import { valueOf, owedFor, MAX, KIT_PRICE, KIT_JUMPS } from '../core/progress.js';
import { placeCode } from '../world/sites.js';
import { tierOf, CLEARING } from '../artifacts/tiers.js';
import { siteId as siteIdOf } from '../net/finds.js';
import { siteAt, siteOfKey, worthOf, worthWords } from './worth.js';
import { HOME, UPLINK_R, homeDist } from '../world/home.js';
import { commissionsOf, answers, untilTomorrow } from '../core/commissions.js';
import { CodexMap, placesIn } from './map.js';
import { stratum, harmonicOf } from '../artifacts/strata.js';
import { discover, connect, connected, disconnect } from '../net/wallet.js';
import * as art from '../chain/art.js';
import { formatInt, formatNum, clamp } from '../core/math.js';
import { SHIPS, pips } from '../ship/designs.js';
import { EFFECTS, DONE, PACK } from '../artifacts/fx.js';
import { ANOMALIES, ANOMALY_SECS, AT_ONCE, anomalyCost, readKeys } from '../world/anomaly.js';

// the SHOP's shelves, left to right
const SHELVES = [['upgrades', 'UPGRADES'], ['fx', 'EFFECTS'], ['anomalies', 'ANOMALIES'], ['ships', 'SHIPS']];
import { portrait } from '../ship/portrait.js';

// The Codex computer. Four tabs, and along the top, always: the DATA in hand, TRANSMIT
// (the scans not yet sent, for DATA: they stay in the log; a holder's sites go to the
// relays as found, finds.js) and the pilot (the wallet: your SEEKER NET seekers, your name).
//   LOG      what you have recorded: each photograph, its name, its tier, where it stands,
//            who found it first; set course back to it, share it; its notes, folded away.
//   MAP      the forest about the ship, and what you know of it (map.js): set a course.
//   BOARD    the seekers' board on Nostr, three ways: POSTS (scans and words from
//            holders), FINDS (who found what lately, rarest first: fly there), LEADERS
//            (the holders who submitted their scans, ranks.js).
//   OBELISK  home (home.js): whether its uplink is in reach (scans are transmitted only
//            within it), the way home, and the day's commissions (commissions.js).
//   SHOP     spend DATA on attunement, the plasma tank and the signal gain (progress.js),
//            effects, anomalies, ships (designs.js).
// SEEKERS (the pilot's page) opens from the pilot at the top right.
// Keys: TAB changes tab, arrows move, ENTER chooses, ESC closes. Text fields take the keys
// while they have focus.

const TABS = ['log', 'map', 'board', 'home', 'shop'];
const NAMES = { log: 'LOG', map: 'MAP', board: 'BOARD', home: 'OBELISK', shop: 'SHOP' };
// the board's three pages under its one tab; the pilot's page under none
const GROUP = { finds: 'board', ranks: 'board', seekers: null };
const groupOf = (t) => (t in GROUP ? GROUP[t] : t);
const ORD = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH'];
const hexCss = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const depthColor = (d) => (d ? hexCss(stratum(d).light) : 'var(--muted)');
const DAY = 86400000;
const EXPLORER = 'https://robinhoodchain.blockscout.com/tx/';

export class Terminal {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.tab = 'log';
    this.sel = 0;
    this.boardFilter = 'all';
    this._openPhotos = new Set();  // board posts whose photograph has been opened
    this.gallery = null;         // the holder whose gallery is open on the LEADERS page
    this.gsel = 0;
    this.root = el('div', 'term', game.uiRoot);
    this.win = el('div', 'win', this.root);
    const head = el('div', 'thead', this.win);
    el('div', 'ttitle', head, 'CODEX');
    this.tabsEl = el('div', 'ttabs', head);
    this.tabBtns = {};
    for (const t of TABS) {
      const b = el('button', 'ttab', this.tabsEl, NAMES[t]);
      b.onclick = () => this.setTab(t);
      this.tabBtns[t] = b;
    }
    // DATA, TRANSMIT, the pilot
    const right = el('div', 'tright', head);
    this.dataPill = el('button', 'datap', right);
    this.dataPill.onclick = () => this.setTab('shop');
    this.sendBtn = el('button', 'btn sendp', right);
    this.sendBtn.onclick = () => this._transmit();
    this.pilotBtn = el('button', 'pilot', right);
    this.pilotBtn.onclick = () => this.setTab('seekers');
    const x = el('button', 'tclose', head, 'X');
    x.onclick = () => this.hide();
    this.body = el('div', 'tbody', this.win);
    this.foot = el('div', 'tfoot', this.win);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.hide(); });
    this.board = null;
    this.seekers = { address: null, ids: null, state: new Map(), loading: false, err: '', sel: 0, view: null, net: null };
    this._tick = 0;
    this.map = new CodexMap(this);
  }

  // the board, its relays and the finds (created once: at the Codex, or soon after the
  // flight begins, so news of rare finds reaches the ship in the air)
  ensureBoard() {
    const g = this.game;
    if (!this.board) {
      // a test relay on this machine, for development only (never a stranger's link)
      const q = new URLSearchParams(location.search);
      const relay = q.has('dev') && /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q.get('relay') || '') ? q.get('relay') : null;
      this.board = new Board(g, relay ? [relay] : undefined);
      this.board.onChange = () => {
        if (!this.open) return;
        if (this.tab === 'board') { this._renderBoardList(); save('board.seen', Date.now()); }
        if (this.tab === 'seekers') this._renderWalletLine();
        if (this.tab === 'finds' && !this._findsT) this._findsT = setTimeout(() => { this._findsT = null; if (this.open && this.tab === 'finds') this.render(); }, 800);
        this._head();
        this._dots();
      };
      const l = this.board.link;
      this.seekers.address = l ? l.address : connected();
      const F = this.board.finds;
      F.onRare = (f) => g.rareFound(f);
      F.onRoyalty = (data, pilots, sites) => g.royalty(data, pilots, sites);
      F.onChange = () => { if (!this.open) return; if (this.tab === 'map') this.map.update(); else if (this.tab === 'log' || this.tab === 'finds') this.render(); };
    }
    this.board.start();
    return this.board;
  }

  show(tab) {
    const g = this.game;
    this.ensureBoard();
    g.input.unlock();
    this.open = true;
    if (tab) this.tab = tab;
    this.root.classList.add('on');
    g.audio.play('open');
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on');
    this.game.input.uiCapture = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.game.audio.play('close');
    // news of a rare find that came while the Codex was open
    const f = this.game._rareLater;
    if (f) { this.game._rareLater = null; setTimeout(() => this.game.rareFound(f), 600); }
  }

  setTab(t) {
    if (t !== 'seekers') this._linkFrom = null;
    this.tab = t;
    this.sel = 0;
    this.game.audio.play('ui', { h: 20 });
    this.render();
  }

  // to the wallet, from a page that needs it: linked, it comes back there
  _toLink() {
    const from = this.tab;
    this.setTab('seekers');
    this._linkFrom = from;
  }

  // quiet marks on the tabs: new words on the board since it was last read; scans not
  // yet submitted to the leaderboard (for a linked holder)
  _dots() {
    const b = this.board, g = this.game;
    if (!b) return;
    const seen = load('board.seen', 0);
    const newest = b.posts.length ? b.posts[0].at : 0;
    this.tabBtns.board.classList.toggle('dot', groupOf(this.tab) !== 'board' && newest > seen);
    this.tabBtns.shop.classList.toggle('dot', this.tab !== 'shop' && g.progress.anyCan);
    // (a commission answered, waiting to be claimed at the Obelisk)
    this.tabBtns.home.classList.toggle('dot', this.tab !== 'home' && commissionsOf().some((c) => !g.progress.claimed.includes(c.id) && g.codex.some((e) => answers(c, e))));
  }

  keys(input) {
    if (input.uiCapture) return;
    if (this.tab === 'ranks' && this.gallery && input.hit('Escape', 'Pad1')) { this._closeGallery(); return; }
    if (input.hit('Escape', 'KeyX', 'KeyK', 'Pad1')) { this.hide(); return; }
    if (input.hit('Tab', 'Pad5')) {
      const at = TABS.indexOf(groupOf(this.tab));
      this.setTab(TABS[(at + 1) % TABS.length]);
      return;
    }
    if (this.tab === 'ranks') { this._rankKeys(input); return; }
    if (this.tab === 'map') { this.map.keys(input); return; }
    if (this.tab === 'shop') { this._shopKeys(input); return; }
    const n = this.tab === 'log' ? this.game.codex.length : this.tab === 'seekers' ? (this.seekers.ids || []).length : 0;
    if (!n) return;
    const cols = this._cols || 3;
    let d = 0;
    if (input.hit('ArrowRight', 'KeyD')) d = 1;
    if (input.hit('ArrowLeft', 'KeyA')) d = -1;
    if (input.hit('ArrowDown', 'KeyS')) d = cols;
    if (input.hit('ArrowUp', 'KeyW')) d = -cols;
    if (d) {
      if (this.tab === 'log') { this.sel = clamp(this.sel + d, 0, n - 1); this.render(); }
      else { this.seekers.sel = clamp(this.seekers.sel + d, 0, n - 1); this._renderSeekerDetail(); this._markSel(); }
      this.game.audio.play('ui', { h: 24 });
    }
  }

  // tick: live numbers (charges) refresh twice a second
  update(dt) {
    if (!this.open) return;
    this._tick += dt;
    if (this._tick > 0.5) {
      this._tick = 0;
      if (this.tab === 'seekers' && this._chargeEl) this._renderCharge();
      if (this.tab === 'map') this.map.update();
    }
  }

  render() {
    for (const t of TABS) this.tabBtns[t].classList.toggle('sel', t === groupOf(this.tab));
    this.win.dataset.tab = groupOf(this.tab) || this.tab;
    this._head();
    clear(this.body);
    clear(this.foot);
    this._chargeEl = null;
    if (this.tab === 'board') save('board.seen', Date.now());
    if (this.tab === 'log') this._log();
    else if (this.tab === 'board') this._board();
    else if (this.tab === 'map') this.map.render(this.body);
    else if (this.tab === 'ranks') this._ranks();
    else if (this.tab === 'shop') this._shop();
    else if (this.tab === 'finds') this._finds();
    else if (this.tab === 'home') this._home();
    else this._seekersTab();
    const f = this.foot;
    const k = (cap, what) => { const s = el('span', 'kr', f); key(s, cap); el('span', '', s, what); };
    k('TAB', 'tab');
    if (this.tab === 'ranks') k(this.gallery ? '←→' : '↑↓', 'choose');
    else if (this.tab === 'map') { k('←→', 'choose'); k('ENTER', 'set course'); k('Z', 'zoom'); }
    else if (this.tab === 'log' || this.tab === 'seekers') k('←→', 'choose');
    if (this.tab === 'ranks' && !this.gallery) k('ENTER', 'their scans');
    if (this.tab === 'shop') { k('←→', 'shelves'); k('↑↓', 'choose'); k('ENTER', 'select'); }
    k('ESC', this.tab === 'ranks' && this.gallery ? 'back' : 'close');
    this._dots();
  }

  // the top right: DATA in hand, TRANSMIT while there is something to send, the pilot
  _head() {
    const g = this.game, pr = g.progress;
    clear(this.dataPill);
    el('span', 'muted', this.dataPill, 'DATA ');
    this._dataEl = el('span', '', this.dataPill, formatInt(pr.data));
    this.dataPill.classList.toggle('sel', this.tab === 'shop');
    const un = pr.unsent(g.codex), d = homeDist(g.ship.x, g.ship.z), near = d <= UPLINK_R;
    this.sendBtn.style.display = un.list.length ? '' : 'none';
    // (out of the Obelisk's reach, how far it is: the uplink is there)
    this.sendBtn.textContent = near ? `TRANSMIT +${formatInt(un.value)}` : `UPLINK · ${km(d - UPLINK_R)}`;
    this.sendBtn.classList.toggle('far', !near);
    this.sendBtn.title = near ? `${un.list.length} scan${un.list.length === 1 ? '' : 's'} to send; they stay in your log` : `scans are transmitted within ${UPLINK_R / 1000} km of the Obelisk`;
    const b = this.board, link = b && b.link;
    const name = link ? b.nameOf(link.address) || `${link.address.slice(0, 6)}…${link.address.slice(-4)}` : 'LINK WALLET';
    this.pilotBtn.textContent = link ? name : this.seekers.address ? 'MY SEEKERS' : 'LINK WALLET';
    this.pilotBtn.classList.toggle('sel', this.tab === 'seekers');
    this.pilotBtn.classList.toggle('linked', !!link);
  }

  // SET COURSE (or FLY THERE), and with jumps in hand TELEPORT, for a place. What each did
  // is said at once: the button changes, and a line along the bottom of the Codex says it.
  // A jump asks once more first (a jump is dear).
  goButtons(parent, x, z, label = '', o = {}) {
    const g = this.game, cls = o.cls || 'chip inl';
    const isSet = () => g.course.on && g.course.to && Math.abs(g.course.to.x - x) < 8 && Math.abs(g.course.to.z - z) < 8;
    const go = el('button', cls + (isSet() ? ' done' : ''), parent, isSet() ? 'COURSE SET' : o.words || 'FLY THERE');
    go.onclick = (ev) => {
      ev.stopPropagation();
      g.course.set(x, z, label);
      g.audio.play('ui', { h: 28 });
      go.textContent = 'COURSE SET';
      go.classList.add('done');
      this.notice(`Course set${label ? ` for ${label}` : ''} · ${placeCode(x, z)} · ${km(Math.hypot(x - g.ship.x, z - g.ship.z))} away. The ship flies there by itself whenever nobody steers.`);
      if (o.after) o.after();
    };
    if (g.progress.jumps > 0 && !o.noJump) {
      const tp = el('button', cls + ' tele', parent, `TELEPORT · ${g.progress.jumps}`);
      let armed = 0;
      tp.onclick = (ev) => {
        ev.stopPropagation();
        if (!armed || Date.now() - armed > 3000) {
          armed = Date.now();
          tp.textContent = 'JUMP NOW?';
          tp.classList.add('armed');
          g.audio.play('ui', { h: 31 });
          this.notice(`Press JUMP NOW? again to teleport${label ? ` to ${label}` : ''}: it uses one of your ${g.progress.jumps} jumps.`);
          setTimeout(() => { if (tp.isConnected && Date.now() - armed >= 2900) { tp.textContent = `TELEPORT · ${g.progress.jumps}`; tp.classList.remove('armed'); } }, 3000);
          return;
        }
        g.teleport.start(x, z, label);
      };
    }
    return go;
  }

  // a place's tier and what flying there would bring this pilot (worth.js), as a tag
  _worthTag(parent, site, badge = true) {
    const w = worthOf(this.game, site);
    if (!w) return null;
    const box = el('span', 'worth', parent);
    if (badge) { const b = el('span', 'tbadge', box, w.T.name); b.style.setProperty('--tc', w.T.color); }
    el('span', w.recorded && !w.more ? 'muted' : 'pos', box, `${worthWords(w, formatInt)}${w.recorded && !w.more ? '' : ' FOR YOU'}`);
    box.title = w.recorded ? (w.more ? 'you recorded it, and would see more of it now' : 'you have recorded it as far as you see') : `a scan of it would bring you about this, attuned as you are (${w.seen} of its ${w.res} layers)`;
    return w;
  }

  // a line along the bottom of the Codex, for a few seconds: what was just done
  notice(text) {
    if (!this.noteEl) this.noteEl = el('div', 'tnote', this.win);
    this.noteEl.textContent = text;
    this.noteEl.classList.add('on');
    clearTimeout(this._noteT);
    this._noteT = setTimeout(() => this.noteEl.classList.remove('on'), 4500);
  }

  // CHAT · FINDS · LEADERS: the board's pages
  _boardNav(parent) {
    const nav = el('div', 'subnav', parent);
    for (const [t, label] of [['board', 'CHAT'], ['finds', 'FINDS'], ['ranks', 'LEADERS']]) {
      const c = el('button', 'chip' + (this.tab === t ? ' sel' : ''), nav, label);
      c.onclick = () => { if (this.tab !== t) this.setTab(t); };
    }
    return nav;
  }

  // ---------------------------------------------------------------- FINDS
  // Everything found and shared, one row a thing found: every scan shared on the board
  // (with its photograph) and every find told to the relays (finds.js), gathered by what
  // they are of: a site's artifact (a clearing's things all under the clearing), or a
  // witnessed seeker. Each row: the photograph of the first who shared one, its tier,
  // what it would bring this pilot, who found it first, how many have, where it is; open
  // it for everyone's photographs of it, in a row to scroll.
  _findGroups() {
    const b = this.board, F = b.finds, groups = new Map();
    const add = (key, init) => {
      let gr = groups.get(key);
      if (!gr) groups.set(key, (gr = { key, posts: [], finders: [], at: 0, ...init }));
      return gr;
    };
    for (const id of F.sites.keys()) {
      const fs = F.finders(id);
      if (!fs.length) continue;
      const f0 = fs[0], site = siteOfKey(f0.key);
      const gr = add(`s:${f0.key}`, { site, x: f0.x, z: f0.z, name: site && site.kind === 'landing' ? 'A clearing' : f0.name, tier: f0.tier });
      gr.finders = fs;
      gr.at = Math.max(gr.at, fs[fs.length - 1].at * 1000);
    }
    for (const p of b.posts) {
      if (p.type !== 'scan' || !p.scan) continue;
      const sc = p.scan;
      let gr = null;
      if (sc.kind === 'wild' && sc.place) {
        const st = siteAt(sc.place.x, sc.place.z, sc.tx);
        if (st) gr = add(`s:${st.key}`, { site: st, x: st.x, z: st.z, name: st.kind === 'landing' ? 'A clearing' : sc.name, tier: st.tier || 0 });
      }
      if (!gr) gr = add(`t:${sc.tx}:${sc.tokens[0] || ''}`, { name: sc.name, witnessed: sc.kind === 'witnessed', tier: 0 });
      gr.posts.push(p);
      gr.at = Math.max(gr.at, p.at);
    }
    for (const gr of groups.values()) {
      gr.posts.sort((p, q) => p.at - q.at);
      gr.clearing = !!(gr.site && gr.site.kind === 'landing');
      // who found it first: the first of its finders, else the first to share a photograph
      const first = gr.finders[0] ? gr.finders[0].address : gr.posts[0] ? gr.posts[0].address : null;
      gr.first = first ? b.labelOf(first).name : '';
      gr.count = new Set([...gr.finders.map((f) => f.address), ...gr.posts.map((p) => p.address)]).size;
    }
    return [...groups.values()].sort((p, q) => q.at - p.at);
  }

  _finds() {
    const g = this.game, b = this.board;
    const top = el('div', 'boardtop', this.body);
    this._boardNav(top);
    el('div', 'muted fine', top, b.link ? `Your finder's shares: ${formatInt(g.progress.royalties || 0)} DATA` : 'Link a wallet to be counted among the finders');
    // ALL · RARE AND UP · CLEARINGS · WITNESSED
    const filt = el('div', 'filters findfilt', this.body);
    this.findFilter = this.findFilter || 'all';
    for (const [f, label] of [['all', 'ALL'], ['rare', 'RARE AND UP'], ['clearing', 'CLEARINGS'], ['witnessed', 'WITNESSED']]) {
      const x = el('button', 'chip' + (this.findFilter === f ? ' sel' : ''), filt, label);
      x.onclick = () => { this.findFilter = f; this.render(); };
    }
    el('span', 'fine muted findwhy', filt, 'The first to find a place gets a share of every find there after.');
    const list = el('div', 'findlist', this.body);
    const keep = this._findScroll || 0;
    list.addEventListener('scroll', () => { this._findScroll = list.scrollTop; });
    const ok = { all: () => true, rare: (gr) => gr.tier >= 2 && gr.tier <= 5, clearing: (gr) => gr.clearing, witnessed: (gr) => gr.witnessed };
    const rows = this._findGroups().filter(ok[this.findFilter] || ok.all);
    if (!rows.length) {
      if (b.loaded) el('div', 'muted empty', list, this.findFilter === 'all' ? 'Nothing found and shared yet. Transmit a site you have found, or share a scan from your LOG, and it is the first here.' : 'None of these yet.');
      else loader(list, 'Listening to the relays');
      return;
    }
    this._openFinds = this._openFinds || new Set();
    for (const gr of rows.slice(0, 80)) {
      const T = tierOf(gr.tier), open = this._openFinds.has(gr.key) && gr.posts.length > 1;
      const r = el('div', 'find' + (open ? ' open' : '') + (gr.posts.length > 1 ? ' opens' : ''), list);
      r.style.setProperty('--tc', gr.witnessed ? 'var(--gold)' : T.color);
      // the first photograph (or its tier where there is none)
      const ph = el('div', 'fphoto', r);
      if (gr.posts[0] && gr.posts[0].photo) { const im = el('img', '', ph); im.src = gr.posts[0].photo; im.alt = gr.name || ''; }
      else ph.classList.add('empty');
      if (gr.posts.length > 1) el('span', 'fcount', ph, `${gr.posts.length}`);
      const mid = el('div', 'fmid', r);
      const head = el('div', 'fhead', mid);
      const bd = el('span', 'tbadge', head, gr.witnessed ? 'WITNESSED' : T.name);
      bd.style.setProperty('--tc', gr.witnessed ? 'var(--gold)' : T.color);
      el('span', 'fname', head, gr.name || 'A find');
      if (gr.site) this._worthTag(el('div', 'wline', mid), gr.site, false);
      const here = gr.site && g.codex.some((e) => e.site === gr.site.key);
      const dist = Number.isFinite(gr.x) ? km(Math.hypot(gr.x - g.ship.x, gr.z - g.ship.z)) : '';
      el('div', 'fine', mid, [gr.first ? `first: ${gr.first}` : '', `${gr.count} pilot${gr.count === 1 ? '' : 's'}`, gr.posts.length ? `${gr.posts.length} photo${gr.posts.length === 1 ? '' : 's'}` : '', Number.isFinite(gr.x) ? placeCode(gr.x, gr.z) : '', dist, ago(gr.at), here ? 'you have been' : ''].filter(Boolean).join(' · '));
      const acts = el('div', 'facts', r);
      if (Number.isFinite(gr.x)) this.goButtons(acts, gr.x, gr.z, gr.name, { cls: 'chip', words: 'SET COURSE' });
      if (gr.posts.length > 1) {
        r.onclick = (ev) => {
          if (ev.target.closest('button')) return;
          if (this._openFinds.has(gr.key)) this._openFinds.delete(gr.key); else this._openFinds.add(gr.key);
          this.game.audio.play('ui', { h: 24 });
          this.render();
        };
      }
      // opened: everyone's photographs of it, the first first, in a row to scroll
      if (open) {
        const strip = el('div', 'fstrip', r);
        for (const p of gr.posts) {
          const card = el('div', 'fshot', strip);
          if (p.photo) { const im = el('img', '', card); im.src = p.photo; im.alt = p.scan.name || ''; }
          el('div', 'fwho', card, `${b.labelOf(p.address).name} · ${ago(p.at)}`);
          if (gr.clearing) el('div', 'fine muted', card, p.scan.name || '');
          if (p.note) this._words(el('div', 'fine', card), p.note);
        }
      }
    }
    requestAnimationFrame(() => { list.scrollTop = keep; });
  }

  // ---------------------------------------------------------------- OBELISK
  // Home: the uplink (in reach or how far), the way back, and the day's commissions.
  _home() {
    const g = this.game, pr = g.progress, d = homeDist(g.ship.x, g.ship.z), near = d <= UPLINK_R;
    const wrap = el('div', 'home', this.body);
    const st = el('div', 'hcard', wrap);
    el('div', 'name', st, 'THE OBELISK');
    el('div', near ? 'pos' : 'muted', st, near ? `UPLINK IN REACH · ${km(d)} from it` : `OUT OF REACH · ${km(d)} from it · the uplink reaches ${UPLINK_R / 1000} km`);
    el('div', 'fine muted', st, 'Every ship took off from its roof. Scans are transmitted for DATA only within reach of its uplink, and the first to transmit a place is its first finder.');
    const acts = el('div', 'acts', st);
    const un = pr.unsent(g.codex);
    if (un.list.length) {
      const b = el('button', 'btn', acts, near ? `TRANSMIT ${un.list.length} · +${formatInt(un.value)}` : `${un.list.length} SCAN${un.list.length === 1 ? '' : 'S'} TO TRANSMIT HERE`);
      b.disabled = !near;
      b.onclick = () => this._transmit();
    }
    if (d > 1500) this.goButtons(acts, HOME.x, HOME.z, 'The Obelisk', { cls: 'btn', words: 'SET COURSE HOME' });
    // the day's commissions
    const cm = el('div', 'hcard', wrap);
    const left = untilTomorrow(), h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
    const hd = el('div', 'uhead', cm);
    el('div', 'uname', hd, "TODAY'S COMMISSIONS");
    el('div', 'fine muted', hd, `new ones in ${h ? `${h} h ` : ''}${m} min`);
    el('div', 'fine muted', cm, 'Bring back something found today that answers one, and claim its bonus here. Each, once.');
    for (const c of commissionsOf()) {
      const row = el('div', 'comm', cm);
      const done = pr.claimed.includes(c.id), match = !done && g.codex.find((e) => answers(c, e));
      const T = c.clearing ? tierOf(CLEARING) : tierOf(c.tier);
      row.style.setProperty('--tc', T.color);
      const mid = el('div', 'fmid', row);
      el('div', '', mid, c.words);
      el('div', 'fine ' + (done ? 'muted' : match ? 'pos' : 'muted'), mid, done ? 'claimed' : match ? `${match.landing ? 'found on foot' : match.name} answers it` : 'bring one back today');
      el('span', done ? 'muted' : 'gold', row, `+${formatInt(c.bonus)} DATA`);
      if (match) {
        const b = el('button', 'chip', row, near ? 'CLAIM' : 'CLAIM AT THE OBELISK');
        b.disabled = !near;
        b.onclick = () => this._claim(c);
      }
    }
  }

  // a commission's bonus, for a scan that answers it (at the Obelisk)
  _claim(c, quiet = false) {
    const g = this.game, pr = g.progress;
    if (pr.claimed.includes(c.id) || homeDist(g.ship.x, g.ship.z) > UPLINK_R || !g.codex.some((e) => answers(c, e))) return 0;
    pr.claimed.push(c.id);
    pr.credit(c.bonus);
    if (!quiet) { g.audio.play('transmit', { n: 2 }); this.notice(`Commission claimed: +${formatInt(c.bonus)} DATA.`); this.render(); }
    return c.bonus;
  }
  // every one that can be, as scans are transmitted
  _claimAll() {
    let n = 0;
    for (const c of commissionsOf()) n += this._claim(c, true);
    if (n) this.notice(`Commissions claimed too: +${formatInt(n)} DATA.`);
  }

  // ---------------------------------------------------------------- LOG
  _log() {
    const g = this.game;
    const list = g.codex;
    if (!list.length) {
      const e = el('div', 'empty', this.body);
      el('div', 'big', e, 'NOTHING RECORDED YET');
      el('div', 'muted', e, `Artifacts stand in the forest, each at its own place, the same for every ship. The mark along the top of the view points to the nearest one you have not recorded. Fly to it, and hold ${g.input.touchMode ? 'SCAN' : 'SPACE'} while it is in your sights. When a SEEKER NET seeker moves on chain while you fly, that seeker itself rises out of the fog, giant: witnessed, the same for every ship flying then.`);
      if (g.moves.waiting) el('div', 'muted', e, `${g.moves.waiting} witnessed move${g.moves.waiting === 1 ? '' : 's'} waiting in the fog.`);
      return;
    }
    this.sel = clamp(this.sel, 0, list.length - 1);
    const cols = el('div', 'cols', this.body);
    const grid = el('div', 'grid photos', cols);
    this._cols = 3;
    list.forEach((e, i) => {
      const w = el('button', 'well' + (i === this.sel ? ' sel' : '') + (e.special ? ' witnessed' : ''), grid);
      const img = el('img', '', w);
      img.src = e.photo;
      img.alt = e.name;
      // its tier, if above the common (tiers.js); else how far it was seen into
      const T = e.kind === 'wild' && e.tier ? tierOf(e.tier) : null;
      if (e.special) el('span', 'wtag', w, 'WITNESSED');
      else if (T) { const tg = el('span', 'wtag', w, T.name); tg.style.color = T.color; w.style.borderColor = T.color; }
      else if (e.depth) { const tg = el('span', 'wtag', w, stratum(e.depth).numeral); tg.style.color = depthColor(e.depth); }
      w.onclick = () => { this.sel = i; this._shareOpen = false; this.render(); this.game.audio.play('ui', { h: 24 }); };
    });
    const e = list[this.sel];
    const d = el('div', 'detail', cols);
    const ph = el('img', 'bigphoto', d);
    ph.src = e.photo;
    ph.alt = e.name;
    el('div', 'name', d, e.name);
    // what it is, in a few marks: its tier, how far into it this pilot has seen
    const tags = el('div', 'badges', d);
    const badge = (text, color) => { const x = el('span', 'tbadge', tags, text); x.style.setProperty('--tc', color); return x; };
    if (e.special) badge('WITNESSED', 'var(--gold)');
    else if (e.kind === 'wild' && e.site) badge(tierOf(e.tier).name, tierOf(e.tier).color);
    if (e.depth) badge(`${stratum(e.depth).numeral} · ${stratum(e.depth).name.toUpperCase()}`, depthColor(e.depth));
    if (e.kind === 'wild' && e.site && e.res > (e.depth || 0)) badge('MORE TO SEE', 'var(--muted)');
    // one line: what, where; one line: who came first, what it is worth
    const where = e.site && e.x !== undefined ? `${placeCode(e.x, e.z)} · ${km(Math.hypot(e.x - g.ship.x, e.z - g.ship.z))}` : '';
    const what = e.special || e.kind !== 'wild' ? (e.tokens.length > 1 ? `SEEKER ${e.tokens.slice(0, 6).map((t) => '#' + t).join(' ')}` : `SEEKER #${e.lead}`) + (e.time ? ` · moved ${ago(e.time)}` : '') : e.cls;
    el('div', 'muted', d, [what, where].filter(Boolean).join(' · '));
    if (e.site && this.board) {
      const fs = this.board.finds.finders(siteIdOf(e.site)), r = this.board.finds.rankOf(e.site);
      let line = '';
      if (r >= 0) line = `${r < ORD.length ? ORD[r] : `#${r + 1}`} TO FIND IT${fs.length - 1 - r > 0 ? ` · ${fs.length - 1 - r} came after you` : ''}`;
      else if (fs.length) line = `${fs.length} pilot${fs.length > 1 ? 's' : ''} found it before you`;
      if (line) el('div', r === 0 ? 'gold' : 'muted', d, line);
    }
    el('div', e.sent ? 'muted' : 'pos', d, `${formatInt(valueOf(e))} DATA · ${e.sent ? 'transmitted' : e.paid ? `${formatInt(owedFor(e))} more to transmit` : 'not transmitted yet'}`);
    // what to do with it
    const acts = el('div', 'acts', d);
    if (e.site && e.x !== undefined) {
      this.goButtons(acts, e.x, e.z, e.name, { cls: 'btn', words: 'SET COURSE' });
    }
    if (e.shared) el('span', 'pos fine', acts, `SHARED ${ago(e.shared.at).toUpperCase()}`);
    else if (this.board && this.board.link) {
      const sh = el('button', 'btn ghost' + (this._shareOpen ? ' sel' : ''), acts, 'SHARE');
      sh.onclick = () => { this._shareOpen = !this._shareOpen; this.render(); };
    } else {
      const lk = el('button', 'btn ghost', acts, 'LINK WALLET TO SHARE');
      lk.onclick = () => this._toLink();
    }
    if (this._shareOpen && !e.shared && this.board && this.board.link) this._shareBox(d, e);
    // the Codex's notes and the particulars, folded
    const more = el('details', 'more', d);
    if (this._notesOpen) more.open = true;
    more.addEventListener('toggle', () => { this._notesOpen = more.open; });
    el('summary', '', more, 'NOTES');
    const notes = el('div', 'notes', more);
    for (const n of e.notes) el('div', '', notes, n);
    const o = el('div', 'rows', more);
    const row = (k, v, cls) => { const r = el('div', 'row', o); el('span', 'k', r, k); return el('span', 'v ' + (cls || ''), r, v); };
    if (e.kind === 'wild') {
      if (e.fx && e.fx.length) row('EFFECTS', e.fx.map((id) => DONE[id] || id).join(', '));
      if (e.site) row('RESONANCE', !e.res ? 'none' : `${stratum(e.res).numeral}${(e.depth || 0) >= e.res ? ' · seen whole' : ''}`);
      row('SEED', `${e.tx.slice(0, 10)}…${e.tx.slice(-6)}`, 'muted');
    } else {
      if (e.block) row('BLOCK', formatInt(e.block));
      const tx = row('TX', '');
      const h = e.hash || e.tx;
      const a = el('a', 'tx', tx, `${h.slice(0, 10)}…${h.slice(-6)}`);
      a.href = EXPLORER + h;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    row('RECORDED', `${dateStr(e.scannedAt)} · ${e.clock} on the planet`);
  }

  // a note for the board, and SEND, under a scan being shared
  _shareBox(d, e) {
    const share = el('div', 'share', d);
    const input = this._textField(share, 'A note for the board (optional, no links)', 200);
    const b = el('button', 'btn', share, 'SEND TO BOARD');
    const msg = el('div', 'msg', share);
    b.onclick = async () => {
      b.disabled = true;
      msg.textContent = 'Signing and sending…';
      msg.className = 'msg muted';
      try {
        const r = await this.board.send(input.value, e);
        e.shared = { id: r.id, at: Date.now() };
        const { img, ...stored } = e;
        codexPut(stored);
        this.game.audio.play('send');
        msg.textContent = `Sent to ${r.ok} of ${r.of} relays.`;
        msg.className = 'msg pos';
        this._shareOpen = false;
        setTimeout(() => { if (this.open && this.tab === 'log') this.render(); }, 1600);
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'msg neg';
        this._countdown(b, 'SEND TO BOARD', 'SEND IN', () => this.board.sendWait);
        this.game.audio.play('error');
      }
    };
    this._countdown(b, 'SEND TO BOARD', 'SEND IN', () => this.board.sendWait);
  }

  // a post's words, with any place codes in them made buttons that set a course there
  _words(parent, text) {
    let at = 0;
    for (const q of placesIn(text)) {
      if (q.index > at) parent.append(document.createTextNode(text.slice(at, q.index)));
      const b = el('button', 'chip inl place', parent, q.code);
      b.title = 'set a course there';
      b.onclick = (ev) => {
        ev.stopPropagation();
        this.game.course.set(q.x, q.z, '');
        this.game.audio.play('ui', { h: 28 });
        b.classList.add('done');
        this.notice(`Course set · ${q.code} · ${km(Math.hypot(q.x - this.game.ship.x, q.z - this.game.ship.z))} away. The ship flies there by itself whenever nobody steers.`);
      };
      at = q.index + q.code.length;
    }
    if (at < text.length) parent.append(document.createTextNode(text.slice(at)));
  }

  _textField(parent, placeholder, max) {
    const input = el('textarea', 'field', parent);
    input.placeholder = placeholder;
    input.maxLength = max;
    input.rows = 2;
    input.addEventListener('focus', () => { this.game.input.uiCapture = true; });
    input.addEventListener('blur', () => { this.game.input.uiCapture = false; });
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') input.blur();
    });
    input.addEventListener('input', () => {
      input.classList.toggle('bad', hasLink(input.value));
    });
    return input;
  }

  // A button that cannot be pressed again yet says when it can, counting down each
  // second, and keeps one width while it does.
  _countdown(btn, label, waiting, left) {
    if (!btn.isConnected) return;
    if (!btn.style.minWidth) {
      btn.textContent = `${waiting} 20`;
      btn.style.minWidth = `${btn.offsetWidth}px`;
    }
    clearTimeout(btn._tick);
    const tick = () => {
      if (!btn.isConnected) return;
      const ms = left();
      btn.disabled = ms > 0;
      btn.textContent = ms > 0 ? `${waiting} ${Math.ceil(ms / 1000)}` : label;
      if (ms > 0) btn._tick = setTimeout(tick, (ms % 1000) + 20);
    };
    tick();
  }

  // ---------------------------------------------------------------- SHOP
  // As few words as it can: DATA and the scans to send, then two shelves. UPGRADES: how
  // deep the scanner reaches (its stratum's name; no last one), the plasma tank and the
  // signal gain (a pip for each level), each with what its next step costs. SHIPS: the
  // hangar, each ship's portrait, its pips, what is inside it, and BUY, BOARD or ABOARD.
  _shopItems() {
    const g = this.game;
    const shelf = this.shelf === 'ships' ? SHIPS.map((d) => d.id) : this.shelf === 'fx' ? EFFECTS.map((e) => e.id) : this.shelf === 'anomalies' ? ANOMALIES.map((a) => a.id) : ['depth', 'tank', 'gain'];
    return this.shelf === 'ships' || this.shelf === 'fx' || this.shelf === 'anomalies' ? shelf : [...shelf, 'kit'];
  }

  _shop() {
    const g = this.game, pr = g.progress;
    const items = this._shopItems();
    this.shopSel = clamp(this.shopSel || 0, 0, items.length - 1);
    const sel = items[this.shopSel];
    const wrap = el('div', 'shop' + (this.shelf === 'ships' ? ' wide' : ''), this.body);
    // (DATA and TRANSMIT are along the top, on every page)
    // the shelves
    const sw = el('div', 'shelves', wrap);
    for (const [k, label] of SHELVES) {
      const c = el('button', 'chip' + ((this.shelf || 'upgrades') === k ? ' sel' : ''), sw, label);
      c.onclick = () => this._shelf(k);
    }
    if (this.shelf === 'ships') { this._ships(wrap, sel); return; }
    if (this.shelf === 'fx') { this._effects(wrap, sel); return; }
    if (this.shelf === 'anomalies') { this._anomalies(wrap, sel); return; }
    const card = (kind, name, verb, what = '') => {
      const c = el('div', 'upg' + (sel === kind ? ' sel' : ''), wrap);
      const head = el('div', 'uhead', c);
      el('div', 'uname', head, name);
      if (what) el('div', 'fine uwhat', c, what);
      if (kind === 'depth') {
        const cur = el('div', 'ucur', head, pr.depth ? `${stratum(pr.depth).numeral} · ${stratum(pr.depth).name.toUpperCase()}` : 'UNATTUNED');
        cur.style.color = depthColor(pr.depth);
      } else {
        const pips = el('div', 'pips', head);
        for (let i = 0; i < MAX[kind]; i++) el('i', i < pr[kind] ? 'on' : '', pips);
      }
      const cost = pr.cost(kind);
      const row = el('div', 'ubuy', c);
      const bar = el('div', 'ubar', row);
      el('i', '', bar).style.width = cost === null ? '100%' : `${Math.min(100, (pr.data / cost) * 100)}%`;
      const b = el('button', 'btn', row, cost === null ? 'MAX' : `${verb} · ${formatInt(cost)}`);
      b.disabled = !pr.can(kind);
      b.onclick = () => this._buy(kind);
      if (this._shopMsg && this._shopMsg.kind === kind) { const m = el('div', 'msg', c, this._shopMsg.text); m.style.color = kind === 'depth' ? depthColor(pr.depth) : 'var(--acc)'; this._shopMsg = null; }
    };
    card('depth', 'ATTUNEMENT', 'ATTUNE FURTHER', 'how far into every artifact you see · each layer makes its scan worth more');
    card('tank', 'PLASMA TANK', 'UPGRADE', 'more boost, and it comes back faster');
    card('gain', 'SIGNAL GAIN', 'UPGRADE', 'how far off the ship hears a site');
    // the teleporter kit: three jumps to anywhere (teleport.js)
    {
      const c = el('div', 'upg' + (sel === 'kit' ? ' sel' : ''), wrap);
      const head = el('div', 'uhead', c);
      el('div', 'uname', head, 'TELEPORTER KIT');
      el('div', 'ucur', head, pr.jumps ? `${pr.jumps} JUMP${pr.jumps === 1 ? '' : 'S'} LEFT` : 'NONE');
      el('div', 'fine uwhat', c, `${KIT_JUMPS} jumps to anywhere: TELEPORT appears beside every place you can set a course to`);
      const row = el('div', 'ubuy', c);
      const bar = el('div', 'ubar', row);
      el('i', '', bar).style.width = `${Math.min(100, (pr.data / KIT_PRICE) * 100)}%`;
      const b = el('button', 'btn', row, `BUY · ${formatInt(KIT_PRICE)}`);
      b.disabled = !pr.canKit();
      b.onclick = () => this._buy('kit');
      if (this._shopMsg && this._shopMsg.kind === 'kit') { el('div', 'msg', c, this._shopMsg.text).style.color = 'var(--acc)'; this._shopMsg = null; }
    }
  }

  // the emitters: a card each, its color, what it does, BUY or OWNED; and once, how
  // they are used
  _effects(wrap, sel) {
    const g = this.game, pr = g.progress;
    el('div', 'fine shopnote', wrap, `Fired at an artifact before it is scanned (${g.input.touchMode ? 'its button' : 'keys 1 to 4'}), in flight or on foot. Every one it takes makes its scan worth half as much again, and they all go together. ${PACK} uses at a time.`);
    for (const e of EFFECTS) {
      const n = pr.usesOf(e.id), cost = pr.fxCost(e.id);
      const c = el('div', 'upg fxc' + (sel === e.id ? ' sel' : ''), wrap);
      c.style.setProperty('--fx', hexCss(e.color));
      const head = el('div', 'uhead', c);
      const nm = el('div', 'uname', head);
      el('i', 'fxdot', nm);
      el('span', '', nm, e.name);
      el('div', 'ucur', head, pr.bought(e.id) ? `${n} LEFT · KEY ${e.key}` : '');
      el('div', 'sline', c, e.line);
      const row = el('div', 'ubuy', c);
      const bar = el('div', 'ubar', row);
      el('i', '', bar).style.width = `${Math.min(100, (pr.data / cost) * 100)}%`;
      const b = el('button', 'btn', row, `BUY ${PACK} · ${formatInt(cost)}`);
      b.disabled = !pr.canFx(e.id);
      b.onclick = () => this._buyFx(e.id);
      if (this._shopMsg && this._shopMsg.kind === e.id) { el('div', 'msg', c, this._shopMsg.text).style.color = hexCss(e.color); this._shopMsg = null; }
      if (sel === e.id && this._scrollTo) { const cc = c; requestAnimationFrame(() => cc.scrollIntoView({ block: 'nearest' })); }
    }
    this._scrollTo = false;
  }

  // the anomalies: a card each, what it does, and START for what it costs at this depth;
  // those a seeker opens say which kind, and once a wallet has shared its address, whether
  // one of its seekers is of that kind (read from the chain when the shelf opens)
  _anomalies(wrap, sel) {
    const g = this.game, pr = g.progress, A = g.anomalies, owner = A.owner();
    const cost = anomalyCost(pr.depth);
    el('div', 'fine shopnote', wrap, `For ${ANOMALY_SECS / 60} minutes the world is changed: what rises wears its mark, and every scan made in it is worth half as much again. Run them together and they combine, in flight and on foot, and so does the music.`);
    // (the seekers of the wallet that shared its address, read once in a while)
    const k = A.keys;
    if (owner && !this._keysBusy && (!k || k.address !== owner || Date.now() - k.at > 15 * 60000)) {
      this._keysBusy = true;
      readKeys(g.chain, owner).then((r) => { A.keys = r; }).catch(() => { this._keysErr = true; }).finally(() => { this._keysBusy = false; if (this.open && this.tab === 'shop' && this.shelf === 'anomalies') this.render(); });
    }
    for (const a of ANOMALIES) {
      const run = A.list.find((x) => x.id === a.id && x.left > 0), open = A.unlocked(a.id);
      const c = el('div', 'upg fxc' + (sel === a.id ? ' sel' : ''), wrap);
      c.style.setProperty('--fx', hexCss(a.color));
      const head = el('div', 'uhead', c);
      const nm = el('div', 'uname', head);
      el('i', 'fxdot', nm);
      el('span', '', nm, a.name);
      if (run) { const s = Math.ceil(run.left); el('div', 'ucur', head, `RUNNING · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`).style.color = hexCss(a.color); }
      else if (a.key && open) el('div', 'ucur', head, `SEEKER #${A.keys.has[a.id]}`);
      el('div', 'sline', c, a.line);
      const row = el('div', 'ubuy', c);
      if (a.key && !open && !run) {
        el('span', 'fine', row, `Opened by ${a.key.text}.`);
        const msg = el('div', 'msg muted', c);
        if (!owner) {
          const b = el('button', 'btn', row, 'CONNECT TO CHECK');
          b.onclick = () => this._withWallet(row, msg, (w, m) => this._connectOnly(w, m));
        } else if (this._keysBusy) msg.textContent = 'Reading your seekers from the chain…';
        else if (A.keys && A.keys.address === owner) {
          msg.textContent = A.keys.n ? `None of the ${A.keys.n} seekers this wallet holds is of that kind.` : 'This wallet holds no seekers.';
          const b = el('button', 'btn ghost', row, 'CHECK AGAIN');
          b.onclick = () => { A.keys = null; this.render(); };
        } else if (this._keysErr) msg.textContent = 'The chain did not answer. Try again in a moment.';
        continue;
      }
      const bar = el('div', 'ubar', row);
      el('i', '', bar).style.width = run ? `${(run.left / ANOMALY_SECS) * 100}%` : `${Math.min(100, (pr.data / cost) * 100)}%`;
      const b = el('button', 'btn', row, run ? 'RUNNING' : `START · ${formatInt(cost)}`);
      b.disabled = !A.can(a.id);
      b.onclick = () => this._startAnomaly(a.id);
      if (!run && A.count >= AT_ONCE) el('span', 'fine', row, `${AT_ONCE} are running`);
      if (this._shopMsg && this._shopMsg.kind === a.id) { el('div', 'msg', c, this._shopMsg.text).style.color = hexCss(a.color); this._shopMsg = null; }
      if (sel === a.id && this._scrollTo) { const cc = c; requestAnimationFrame(() => cc.scrollIntoView({ block: 'nearest' })); }
    }
    this._scrollTo = false;
  }

  _startAnomaly(id) {
    const g = this.game, a = ANOMALIES.find((x) => x.id === id);
    if (!g.anomalies.start(id)) { g.audio.play('error'); return; }
    g.audio.play('anomaly', { lift: ANOMALIES.indexOf(a) * 2 });
    this._shopMsg = { kind: id, text: `${a.name} has begun. It is outside now.` };
    this.render();
  }

  _buyFx(id) {
    const g = this.game, pr = g.progress, e = EFFECTS.find((x) => x.id === id);
    if (!pr.buyFx(id)) { g.audio.play('error'); return; }
    g.audio.play('buy', {});
    this._shopMsg = { kind: id, text: `${pr.usesOf(id)} ${e.name} ready. Key ${e.key}, at whatever the scanner holds.` };
    this.render();
  }

  // the hangar: a card for each ship
  _ships(wrap, sel) {
    const g = this.game, pr = g.progress;
    const list = el('div', 'hangar', wrap);
    for (const d of SHIPS) {
      const own = pr.owns(d.id), here = pr.ship === d.id;
      const c = el('div', 'shipc' + (sel === d.id ? ' sel' : '') + (here ? ' here' : ''), list);
      c.style.setProperty('--core', hexCss(d.look.core));
      const img = el('img', 'sport', c);
      img.src = portrait(d);
      img.alt = d.name;
      const info = el('div', 'sinfo', c);
      const head = el('div', 'uhead', info);
      el('div', 'uname', head, d.name);
      if (here) el('div', 'stag', head, 'ABOARD');
      el('div', 'sline', info, d.line);
      const stats = el('div', 'sstats', info);
      for (const [k, v] of Object.entries(pips(d))) {
        const r = el('div', 'srow', stats);
        el('span', 'muted', r, k);
        const pp = el('span', 'pips', r);
        for (let i = 0; i < 5; i++) el('i', i < v ? 'on' : '', pp);
      }
      el('div', 'sin muted', info, d.inside);
      const row = el('div', 'ubuy', info);
      const b = el('button', 'btn', row, here ? 'ABOARD' : own ? 'BOARD' : `BUY · ${formatInt(d.price)}`);
      b.disabled = here || (!own && !pr.canShip(d.id));
      b.onclick = () => this._ship(d.id);
      if (!own && !pr.canShip(d.id)) el('span', 'fine', row, `${formatInt(Math.max(0, d.price - pr.data))} more DATA`);
      if (this._shopMsg && this._shopMsg.kind === d.id) { el('div', 'msg', info, this._shopMsg.text).style.color = 'var(--core)'; this._shopMsg = null; }
      if (sel === d.id && this._scrollTo) { const cc = c; requestAnimationFrame(() => cc.scrollIntoView({ block: 'nearest' })); }
    }
    this._scrollTo = false;
  }

  _shelf(k) {
    if (typeof k === 'number') {
      const i = SHELVES.findIndex(([x]) => x === (this.shelf || 'upgrades'));
      k = SHELVES[clamp(i + k, 0, SHELVES.length - 1)][0];
    }
    if ((this.shelf || 'upgrades') === k) return;
    this.shelf = k;
    this.shopSel = this.game.codex.some((e) => !e.sent) ? 1 : 0;
    if (k === 'ships') { const i = SHIPS.findIndex((d) => d.id === this.game.progress.ship); this.shopSel += Math.max(0, i); this._scrollTo = true; }
    this.game.audio.play('ui', { h: 27 });
    this.render();
  }

  // buy a ship (and go aboard it at once), or board one already bought
  _ship(id) {
    const g = this.game, pr = g.progress, d = SHIPS.find((x) => x.id === id);
    if (pr.ship === id) return;
    if (!pr.owns(id)) {
      if (!pr.buyShip(id)) { g.audio.play('error'); return; }
      g.audio.play('buy', {});
    } else g.audio.play('ui', { h: 30 });
    g.board(id);
    this._shopMsg = { kind: id, text: `You are aboard the ${d.name}.` };
    this.render();
  }

  // up and down choose, left and right change the shelf, ENTER does it
  _shopKeys(input) {
    if (input.hit('ArrowLeft', 'KeyA', 'Pad14')) { this._shelf(-1); return; }
    if (input.hit('ArrowRight', 'KeyD', 'Pad15')) { this._shelf(1); return; }
    const items = this._shopItems();
    let d = 0;
    if (input.hit('ArrowDown', 'KeyS')) d = 1;
    if (input.hit('ArrowUp', 'KeyW')) d = -1;
    if (d) { this.shopSel = clamp((this.shopSel || 0) + d, 0, items.length - 1); this._scrollTo = true; this.game.audio.play('ui', { h: 24 }); this.render(); }
    if (input.hit('Enter', 'Space', 'Pad0')) {
      const it = items[clamp(this.shopSel || 0, 0, items.length - 1)];
      if (it === 'send') this._transmit(); else if (this.shelf === 'ships') this._ship(it); else if (this.shelf === 'fx') this._buyFx(it); else if (this.shelf === 'anomalies') this._startAnomaly(it); else this._buy(it);
    }
  }

  _transmit() {
    const g = this.game, pr = g.progress;
    // (only within reach of the Obelisk's uplink: home.js)
    if (homeDist(g.ship.x, g.ship.z) > UPLINK_R) { this.setTab('home'); return; }
    const { list, value } = pr.unsent(g.codex);
    if (!list.length) return;
    this._claimAll();
    for (const e of list) { e.paid = valueOf(e); e.sent = true; const { img, ...stored } = e; codexPut(stored); }
    // (a linked holder's sites go to the relays as found: finds.js)
    if (this.board) this.board.finds.publish(list.filter((e) => e.site)).then((n) => { if (n) this.render(); });
    const from = pr.data;
    pr.credit(value);
    g.audio.play('transmit', { n: list.length });
    this.render();
    // the number counts up to it
    const elx = this._dataEl, to = pr.data, t0 = performance.now();
    const tick = () => {
      if (!elx.isConnected) return;
      const k = Math.min(1, (performance.now() - t0) / 900);
      elx.textContent = formatInt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  _buy(kind) {
    const g = this.game, pr = g.progress;
    if (kind === 'kit') {
      if (!pr.buyKit()) { g.audio.play('error'); return; }
      g.audio.play('buy', {});
      this._shopMsg = { kind, text: `${pr.jumps} jumps ready. TELEPORT is beside every place now: the LOG, the MAP, the BOARD.` };
      this.render();
      return;
    }
    if (!pr.buy(kind)) { g.audio.play('error'); return; }
    g.audio.play('buy', kind === 'depth' ? { harm: harmonicOf(pr.depth) } : {});
    if (kind === 'depth') g.field.reattune();
    const text = kind === 'depth' ? `Attuned to ${stratum(pr.depth).numeral}, ${stratum(pr.depth).title}. Every artifact shows you more.` : kind === 'tank' ? (pr.tank >= MAX.tank ? 'The tank is as large as it gets.' : 'A larger tank, and it fills faster.') : (pr.gain >= MAX.gain ? 'The gain is as high as it goes.' : 'The ship hears farther.');
    this._shopMsg = { kind, text };
    this.render();
  }

  // ---------------------------------------------------------------- BOARD
  _board() {
    const b = this.board;
    const top = el('div', 'boardtop', this.body);
    this._boardNav(top);
    this._boardStatus = el('div', 'muted fine', top);
    this._boardList = el('div', 'posts', this.body);
    // a conversation: oldest at the top, newest at the bottom, opened at the newest;
    // it follows new posts while you are at the bottom, and stays put while you read up
    this._boardPinned = true;
    this._boardList.addEventListener('scroll', () => {
      const l = this._boardList;
      this._boardPinned = l.scrollTop + l.clientHeight >= l.scrollHeight - 24;
    });
    // the box changes size as the page around it settles: stay at the newest
    if (window.ResizeObserver) {
      const l = this._boardList;
      new ResizeObserver(() => { if (this._boardPinned) l.scrollTop = l.scrollHeight; }).observe(l);
    }
    const comp = el('div', 'compose', this.body);
    if (b.link) {
      const input = this._textField(comp, 'Words for the board: text only, no links (280)', 280);
      // where you are, in words anyone can fly to
      const here = el('button', 'chip', comp, '+ WHERE I AM');
      here.onclick = () => { const c = placeCode(this.game.ship.x, this.game.ship.z); input.value = `${input.value.trim()}${input.value.trim() ? ' ' : ''}${c}`.slice(0, 280); input.focus(); };
      const send = el('button', 'btn', comp, 'SEND');
      const msg = el('div', 'msg', comp);
      send.onclick = async () => {
        send.disabled = true;
        msg.textContent = 'Sending…';
        msg.className = 'msg muted';
        try {
          const r = await b.send(input.value);
          this._boardPinned = true;
          input.value = '';
          msg.textContent = `Sent to ${r.ok} of ${r.of} relays.`;
          msg.className = 'msg pos';
          this.game.audio.play('send');
        } catch (err) {
          msg.textContent = err.message;
          msg.className = 'msg neg';
          this.game.audio.play('error');
        }
        this._countdown(send, 'SEND', 'SEND IN', () => b.sendWait);
      };
      this._countdown(send, 'SEND', 'SEND IN', () => b.sendWait);
    } else {
      el('div', 'muted', comp, 'Read only. To post, link a wallet that holds a SEEKER NET seeker.');
      const l = el('button', 'btn ghost', comp, 'LINK WALLET');
      l.onclick = () => this._toLink();
    }
    this._renderBoardList();
  }

  _renderBoardList() {
    if (!this._boardList || !this._boardList.isConnected) return;
    const b = this.board;
    const n = b.pool.connected();
    const words = b.posts.filter((p) => p.type === 'msg').length;
    this._boardStatus.textContent = `${n} of ${b.pool.relays.length} relays · ${words} message${words === 1 ? '' : 's'} from holders${b.loaded ? '' : ' · reading…'}`;
    const list = this._boardList;
    const keep = list.scrollTop, pinned = this._boardPinned;
    const toEnd = () => { if (this._boardPinned) list.scrollTop = list.scrollHeight; };
    clear(list);
    // (words only: shared scans are on FINDS, gathered by what they are of)
    const posts = b.posts.filter((p) => p.type === 'msg');
    if (!posts.length) {
      if (b.loaded) el('div', 'muted empty', list, 'Nothing said here yet. Scans shared are on FINDS.');
      else loader(list, 'Listening to the relays');
      return;
    }
    // the newest 120, in the order they were written
    for (const p of posts.slice(0, 120).reverse()) {
      const card = el('div', 'post' + (b.mine.has(p.id) ? ' mine' : ''), list);
      const h = el('div', 'phead', card);
      // who: their name (and a mark that tells same names apart), else a short address
      const who = b.labelOf(p.address);
      if (who.named) el('i', `pmark c${who.color}`, h);
      el('span', 'who', h, who.name);
      if (who.tag) el('span', 'muted', h, ` ·${who.tag}`);
      el('span', 'muted', h, ` holds ${p.holds} · ${ago(p.at)}`);
      if (b.canDelete(p)) {
        const del = el('button', 'chip pdel', h, 'DELETE');
        del.onclick = async () => {
          if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'DELETE FOR EVERYONE?'; setTimeout(() => { if (del.isConnected) { del.dataset.sure = ''; del.textContent = 'DELETE'; } }, 4000); return; }
          del.disabled = true;
          del.textContent = 'DELETING…';
          try { await b.remove(p); this.game.audio.play('close'); this._renderBoardList(); } catch (err) { del.textContent = err.message.slice(0, 40); this.game.audio.play('error'); }
        };
      }
      if (p.type === 'scan' && p.scan) {
        // a scan's photograph is a thumbnail beside its words, so the conversation reads
        // easily; a touch anywhere on the message opens it where it is (and closes it)
        const row = el('div', 'pscan' + (this._openPhotos.has(p.id) ? ' open' : ''), card);
        if (p.photo) {
          const img = el('img', '', row);
          img.onload = toEnd;
          img.src = p.photo;
          img.alt = p.scan.name;
          card.classList.add('opens');
          card.onclick = (e) => {
            if (e.target.closest('button')) return;
            if (String(window.getSelection && window.getSelection()) !== '') return;   // selecting words
            const open = row.classList.toggle('open');
            if (open) this._openPhotos.add(p.id); else this._openPhotos.delete(p.id);
            requestAnimationFrame(toEnd);
          };
        }
        const t = el('div', 'ptext', row);
        el('div', 'name', t, p.scan.name || 'An artifact');
        el('div', 'muted', t, `${p.scan.code}${p.scan.kind === 'wild' ? `${p.scan.depth ? ` · SEEN TO ${stratum(p.scan.depth).numeral}${p.scan.plus ? '+' : ''}` : ''} · WILD` : p.scan.tokens.length ? ` · ${p.scan.kind === 'witnessed' ? 'WITNESSED · ' : ''}SEEKER #${p.scan.tokens[0]}` : ''}`);
        if (p.scan.place) {
          const pl = el('div', 'muted', t, `${p.scan.place.code} · ${km(Math.hypot(p.scan.place.x - this.game.ship.x, p.scan.place.z - this.game.ship.z))} `);
          this.goButtons(pl, p.scan.place.x, p.scan.place.z, p.scan.name);
          if (p.scan.kind === 'wild') this._worthTag(el('div', 'wline', t), siteAt(p.scan.place.x, p.scan.place.z, p.scan.tx));
        }
        if (p.note) this._words(el('div', '', t), p.note);
        const known = this.game.codex.find((e) => (e.hash || e.tx) === p.scan.tx && (e.kind === 'wild' || !p.scan.tokens.length || e.lead === p.scan.tokens[0]));
        if (known) el('div', 'pos', t, 'You recorded this one too.');
      } else {
        this._words(el('div', 'ptext', card), p.text);
      }
    }
    if (pinned) { list.scrollTop = list.scrollHeight; requestAnimationFrame(toEnd); }
    else list.scrollTop = keep;
  }

  // ---------------------------------------------------------------- LEADERS
  _ranks() {
    const b = this.board;
    if (!b.ranks) b.ranks = new Ranks(b);
    const R = b.ranks;
    R.onChange = () => { if (this.open && this.tab === 'ranks') { this._renderRanks(); this._renderSubmit(); } };
    R.onPhoto = () => { if (this.open && this.tab === 'ranks' && this.gallery) this._renderRanks(); };
    R.start();
    const top = el('div', 'boardtop', this.body);
    this._boardNav(top);
    this._rankStatus = el('div', 'muted fine', top);
    this._rankArea = el('div', 'ranks', this.body);
    this._rankFoot = el('div', 'rsubmit', this.body);
    this._renderRanks();
    this._renderSubmit();
  }

  _renderRanks() {
    const area = this._rankArea;
    if (!area || !area.isConnected) return;
    const R = this.board.ranks;
    const rows = R.rows();
    const pending = rows.reduce((n, r) => n + r.pending, 0);
    this._rankStatus.textContent = `${rows.length} holder${rows.length === 1 ? '' : 's'} · witnessed scans count first, then wild${pending ? ` · checking ${pending} witnessed on the chain` : ''}${R.loaded ? '' : ' · reading…'}`;
    const keep = area.scrollTop;
    clear(area);
    if (this.gallery) { this._renderGallery(rows); return; }
    if (!rows.length) {
      if (!R.loaded) loader(area, 'Listening to the relays');
      else if (R.checking) loader(area, 'Checking who holds a seeker, on Robinhood Chain');
      else el('div', 'muted empty', area, 'No holder has submitted their scans yet. Yours could be the first.');
      return;
    }
    const head = el('div', 'rrow rhead muted', area);
    for (const t of ['#', 'HOLDER', 'WITNESSED', 'WILD', '']) el('span', '', head, t);
    this.rsel = clamp(this.rsel || 0, 0, rows.length - 1);
    rows.forEach((r, i) => {
      const row = el('div', 'rrow' + (r.you ? ' you' : '') + (i === this.rsel ? ' sel' : ''), area);
      row.onclick = () => this._openGallery(r.address, i);
      el('span', 'rk', row, String(i + 1));
      const who = el('span', 'rwho', row);
      if (r.label.named) el('i', `pmark c${r.label.color}`, who);
      el('span', 'who', who, r.label.name);
      if (r.label.tag) el('span', 'muted', who, ` ·${r.label.tag}`);
      if (r.you) el('span', 'pos', who, ' · YOU');
      el('span', 'rs gold', row, String(r.special));
      el('span', 'rw', row, String(r.regular));
      const g = el('button', 'rgal', row);
      g.title = 'Their scans';
      g.setAttribute('aria-label', `${r.label.name}: their scans`);
      for (let k = 0; k < 4; k++) el('i', '', g);
      g.onclick = (e) => { e.stopPropagation(); this._openGallery(r.address, i); };
    });
    area.scrollTop = keep;
  }

  // one holder's scans: their photographs (fetched as the gallery opens), the witnessed
  // ones marked, and the one chosen, large
  _renderGallery(rows) {
    const R = this.board.ranks, area = this._rankArea, g = this.game;
    const r = rows.find((x) => x.address === this.gallery);
    const head = el('div', 'ghead', area);
    const back = el('button', 'chip', head, '‹ BACK');
    back.onclick = () => this._closeGallery();
    if (!r) { el('div', 'muted empty', area, 'Their scans are not counted here now.'); return; }
    if (r.label.named) el('i', `pmark c${r.label.color}`, head);
    el('span', 'who', head, r.label.name);
    el('span', 'muted', head, ` · ${r.special} witnessed · ${r.regular} wild`);
    const local = new Map(r.you ? g.codex.map((e) => [e.tx, e.photo]) : []);
    const photoOf = (s) => R.photos.get(s.key) || local.get(s.key) || null;
    const cols = el('div', 'cols', area);
    const grid = el('div', 'grid photos', cols);
    this.gsel = clamp(this.gsel, 0, r.scans.length - 1);
    r.scans.forEach((s, i) => {
      const w = el('button', 'well' + (i === this.gsel ? ' sel' : '') + (s.kind === 's' && s.counted ? ' witnessed' : '') + (s.counted ? '' : ' uncounted'), grid);
      const ph = photoOf(s);
      if (ph) { const img = el('img', '', w); img.src = ph; img.alt = s.name; }
      else el('span', 'wcode muted', w, s.code || '…');
      if (s.kind === 's' && s.counted) el('span', 'wtag', w, s.token ? `#${s.token}` : 'WITNESSED');
      w.onclick = () => { this.gsel = i; this.game.audio.play('ui', { h: 24 }); this._renderRanks(); };
    });
    const s = r.scans[this.gsel];
    const d = el('div', 'detail', cols);
    const ph = photoOf(s);
    if (ph) { const img = el('img', 'bigphoto', d); img.src = ph; img.alt = s.name; }
    else el('div', 'bigphoto gwait muted', d, 'The photograph is on its way, or was not sent.');
    el('div', 'name', d, s.name || 'An artifact');
    const what = s.kind === 's' ? (s.counted ? `WITNESSED · SEEKER #${s.token}` : 'WITNESSED · NOT CONFIRMED ON THE CHAIN') : s.kind === 'w' ? 'WILD · FOUND BY ONE SHIP' : 'RECORDED';
    el('div', s.kind === 's' && s.counted ? 'gold' : 'muted', d, `${s.code}${s.code ? ' · ' : ''}${what}`);
    el('div', 'muted', d, `Scanned ${dateStr(s.at * 1000)} · ${ago(s.at * 1000)}${s.counted ? '' : ' · not counted'}`);
  }

  _openGallery(address, i = 0) {
    this.rsel = i;
    this.gallery = address;
    this.gsel = 0;
    this.board.ranks.openGallery(address);
    this.game.audio.play('ui', { h: 24 });
    this.render();
  }

  _closeGallery() {
    this.gallery = null;
    this.board.ranks.closeGallery();
    this.game.audio.play('ui', { h: 20 });
    this.render();
  }

  // the leaderboard by keys: up and down choose a holder, ENTER opens their scans; in a
  // gallery the arrows move through them
  _rankKeys(input) {
    const R = this.board.ranks;
    if (!R) return;
    const rows = R.rows();
    if (this.gallery) {
      const r = rows.find((x) => x.address === this.gallery);
      const n = r ? r.scans.length : 0;
      let d = 0;
      if (input.hit('ArrowRight', 'KeyD')) d = 1;
      if (input.hit('ArrowLeft', 'KeyA')) d = -1;
      if (input.hit('ArrowDown', 'KeyS')) d = 3;
      if (input.hit('ArrowUp', 'KeyW')) d = -3;
      if (d && n) { this.gsel = clamp(this.gsel + d, 0, n - 1); this.game.audio.play('ui', { h: 24 }); this._renderRanks(); }
      return;
    }
    if (!rows.length) return;
    let d = 0;
    if (input.hit('ArrowDown', 'KeyS')) d = 1;
    if (input.hit('ArrowUp', 'KeyW')) d = -1;
    if (d) {
      this.rsel = clamp((this.rsel || 0) + d, 0, rows.length - 1);
      this.game.audio.play('ui', { h: 24 });
      this._renderRanks();
      const el_ = this._rankArea && this._rankArea.querySelector('.rrow.sel');
      if (el_ && el_.scrollIntoView) el_.scrollIntoView({ block: 'nearest' });
    }
    if (input.hit('Enter', 'Space', 'Pad0')) { const r = rows[clamp(this.rsel || 0, 0, rows.length - 1)]; if (r) this._openGallery(r.address, this.rsel); }
  }

  _renderSubmit() {
    const f = this._rankFoot;
    if (!f || !f.isConnected) return;
    clear(f);
    const b = this.board, R = b.ranks, g = this.game;
    // a gallery has the whole page
    f.style.display = this.gallery ? 'none' : '';
    if (this.gallery) return;
    if (!b.link) {
      el('div', 'muted', f, 'Holders put their own scans here: link a wallet that holds a SEEKER NET seeker (one free signature, not a transaction).');
      const l = el('button', 'btn ghost', f, 'LINK WALLET');
      l.onclick = () => this._toLink();
      return;
    }
    const n = R.unsent, all = g.codex.length;
    el('div', 'muted', f, !all ? 'Scan something first: what you record can be submitted here.' : n ? `${n} of your ${all} scan${all === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} not on the leaderboard yet.` : `All ${all} of your scans are on the leaderboard.`);
    const label = `SUBMIT ${n} SCAN${n === 1 ? '' : 'S'}`;
    const btn = el('button', 'btn', f, label);
    if (!n) btn.style.display = 'none';
    const msg = el('div', 'msg muted', f);
    const r = R.lastResult;
    if (r) {
      msg.className = 'msg pos';
      msg.textContent = `Submitted ${r.scans} scan${r.scans === 1 ? '' : 's'} to ${r.ok} of ${r.of} relays.${R.photoJob ? ` Sending their photographs: ${R.photoJob.done} of ${R.photoJob.of}.` : ''}`;
    }
    if (!all) btn.disabled = true;
    else this._countdown(btn, label, 'SUBMIT IN', () => R.submitWait);
    btn.onclick = async () => {
      btn.disabled = true;
      msg.className = 'msg muted';
      msg.textContent = 'Signing and sending…';
      try {
        await R.submit(() => { if (this.open && this.tab === 'ranks') this._renderSubmit(); });
        this.game.audio.play('send');
        this._renderSubmit();
      } catch (err) {
        msg.className = 'msg neg';
        msg.textContent = err.message;
        this.game.audio.play('error');
        this._countdown(btn, label, 'SUBMIT IN', () => R.submitWait);
      }
    };
  }

  // ---------------------------------------------------------------- SEEKERS
  _seekersTab() {
    const S = this.seekers;
    this._nameRow();
    const top = el('div', 'wallet', this.body);
    this._walletEl = top;
    this._renderWalletLine();
    const area = el('div', 'cols', this.body);
    this._seekGrid = el('div', 'grid seekers', area);
    this._seekDetail = el('div', 'detail', area);
    this._cols = 4;
    if (S.address && !S.ids && !S.loading) this._loadSeekers(S.address);
    this._renderSeekerGrid();
    if (!S.net) this._loadNetwork();
  }

  // your name on the board (a linked holder's): shown instead of your address, on every
  // post, old and new, and on your finds
  _nameRow() {
    const b = this.board;
    if (!b || !b.link) return;
    const comp = el('div', 'compose namebox', this.body);
      // your name on the board: shown instead of your address, on every post, old and new
      const nm = el('div', 'nameRow', comp);
      el('span', 'muted', nm, 'NAME');
      const nameIn = el('input', 'field one', nm);
      nameIn.maxLength = 24;
      nameIn.placeholder = 'a name instead of your address (2 to 20)';
      nameIn.value = b.myName || b.nameOf(b.link.address) || '';
      nameIn.addEventListener('focus', () => { this.game.input.uiCapture = true; });
      nameIn.addEventListener('blur', () => { this.game.input.uiCapture = false; });
      nameIn.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') nameIn.blur(); if (ev.key === 'Enter') nameBtn.click(); });
      const nameBtn = el('button', 'chip', nm, 'SAVE');
      const nameMsg = el('div', 'msg muted', comp, b.nameOf(b.link.address) ? `Posting as ${b.nameOf(b.link.address)}. Every post of yours shows it, old ones too.` : 'No name yet: your posts show a shortened address.');
      nameBtn.onclick = async () => {
        nameBtn.disabled = true;
        nameMsg.className = 'msg muted';
        nameMsg.textContent = 'Signing and sending…';
        try {
          const r = await b.setName(nameIn.value);
          nameMsg.className = 'msg pos';
          nameMsg.textContent = r.name ? `Posting as ${r.name}, on every post of yours, old ones too (sent to ${r.ok} of ${r.of} relays).` : 'Name cleared: your posts show a shortened address again.';
          this.game.audio.play('send');
          this._renderBoardList();
        } catch (err) {
          nameMsg.className = 'msg neg';
          nameMsg.textContent = err.message;
          this.game.audio.play('error');
        }
        this._countdown(nameBtn, 'SAVE', 'SAVE IN', () => b.nameWait);
      };
      this._countdown(nameBtn, 'SAVE', 'SAVE IN', () => b.nameWait);
  }

  // pick a wallet (EIP-6963), then do something with it; a phone's browser has none, so
  // there it says where one is (the wallet app's own browser)
  async _withWallet(row, msg, fn) {
    msg.className = 'msg muted';
    msg.textContent = 'Looking for wallets…';
    const ws = await discover();
    if (!ws.length) {
      const phone = this.game.input.touchMode || matchMedia('(pointer: coarse)').matches;
      if (!phone) { msg.className = 'msg neg'; msg.textContent = 'No browser wallet found. MetaMask, Rabby and other EIP-6963 wallets work.'; return; }
      // a phone's browser has no wallet in it: the wallet app has a browser of its own
      msg.className = 'msg muted';
      msg.textContent = 'No wallet in this browser. On a phone, open Low Pass in your wallet app’s own browser. ';
      const a = el('a', '', msg, 'OPEN IN METAMASK');
      a.href = `https://metamask.app.link/dapp/${location.host}${location.pathname}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return;
    }
    const go = async (w) => {
      try { await fn(w, msg); } catch (err) {
        msg.className = 'msg neg';
        msg.textContent = err && err.message ? err.message.slice(0, 120) : 'Not connected';
      }
    };
    if (ws.length === 1) go(ws[0]);
    else {
      clear(row);
      for (const w of ws) { const x = el('button', 'btn ghost', row, w.name.toUpperCase()); x.onclick = () => go(w); }
      msg.textContent = 'Choose a wallet.';
    }
  }

  // connect only: the wallet's address, for its seekers to come aboard
  async _connectOnly(w, msg) {
    const S = this.seekers;
    msg.className = 'msg muted';
    msg.textContent = `Asking ${w.name} for your address…`;
    const a = await connect(w.provider);
    S.address = a;
    S.ids = null;
    S.sel = 0;
    this.game.audio.play('send');
    this.render();
  }

  _renderWalletLine() {
    const top = this._walletEl;
    if (!top || !top.isConnected) return;
    clear(top);
    const b = this.board, S = this.seekers;
    const msgRow = () => el('div', 'msg', top);
    const withWallet = (row, msg, fn) => this._withWallet(row, msg, fn);
    const sign = async (w, msg) => {
      msg.className = 'msg muted';
      msg.textContent = `Asking ${w.name} for the signature…`;
      const link = await this.board.linkWallet(w.provider);
      connected(link.address);
      S.address = link.address;
      S.ids = null;
      this.game.audio.play('send');
      // back to the page that asked for it
      const back = this._linkFrom;
      this._linkFrom = null;
      if (back && back !== 'seekers') this.setTab(back);
      else this.render();
    };
    const plain = connected();
    if (b && b.link) {
      el('div', '', top, `LINKED ${short(b.link.address)}`);
      el('div', 'muted', top, 'This browser can post on the board and submit its scans to the leaderboard for this address while it holds a seeker, and its seekers can come aboard.');
      const u = el('button', 'chip', top, 'UNLINK');
      u.onclick = () => { b.unlink(); disconnect(); this.render(); };
    } else if (plain) {
      el('div', '', top, `CONNECTED ${short(plain)}`);
      el('div', 'muted', top, 'Its seekers can come aboard. To post on the board and put your scans on the leaderboard as well, sign once: free, and not a transaction.');
      const row = el('div', 'wrow', top);
      const sb = el('button', 'btn', row, 'SIGN ONCE');
      const dc = el('button', 'chip', row, 'DISCONNECT');
      const msg = msgRow();
      sb.onclick = () => withWallet(row, msg, sign);
      dc.onclick = () => { disconnect(); if (S.address === plain) { S.address = null; S.ids = null; } this.render(); };
    } else {
      el('div', '', top, 'CONNECT A WALLET');
      el('div', 'muted', top, 'CONNECT brings your seekers aboard. CONNECT AND SIGN also lets you post and join the leaderboard: one free signature, never a transaction.');
      const row = el('div', 'wrow', top);
      const c = el('button', 'btn', row, 'CONNECT');
      const l = el('button', 'btn ghost', row, 'CONNECT AND SIGN');
      // MetaMask's site scanner flags every *.github.io host, so say so before it does
      if (/\.github\.io$/.test(location.hostname) || this.game.dev) {
        const note = el('div', 'muted wnote', top, 'MetaMask may warn you here. It does that for every github.io site, not this game in particular. You can check the ');
        const src = el('a', '', note, 'source code');
        src.href = 'https://github.com/TheSeekerGame/community-games/tree/main/lowpass';
        src.target = '_blank';
        src.rel = 'noopener noreferrer';
        note.append(' yourself.');
      }
      const msg = msgRow();
      c.onclick = () => withWallet(row, msg, (w, m) => this._connectOnly(w, m));
      l.onclick = () => withWallet(row, msg, sign);
      const view = el('div', 'wrow', top);
      const input = el('input', 'field one', view);
      input.placeholder = 'or view any address: 0x… (read only)';
      input.addEventListener('focus', () => { this.game.input.uiCapture = true; });
      input.addEventListener('blur', () => { this.game.input.uiCapture = false; });
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') input.blur();
        if (ev.key === 'Enter') look.click();
      });
      const look = el('button', 'chip', view, 'VIEW');
      look.onclick = () => {
        const a = input.value.trim().toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(a)) { msg.className = 'msg neg'; msg.textContent = 'That is not an address.'; return; }
        S.address = a;
        S.ids = null;
        S.sel = 0;
        this.render();
      };
    }
    if (S.net) {
      const n = S.net;
      const r = el('div', 'net muted', top);
      r.textContent = `NETWORK · ${formatInt(n.activated)} of 2,222 activated · ${n.moves} moves in the last day · shares +${formatNum(n.shareRate, 1)} a day per dormant seeker${n.avg ? ` · average charge ${formatInt(n.avg)}` : ''}`;
    }
  }

  async _loadNetwork() {
    const g = this.game, S = this.seekers;
    try {
      const t = await g.chain.totals();
      S.net = { ...t, moves: g.moves.movesToday(), shareRate: 0, at: Date.now() };
      this._renderWalletLine();
      // the last day's moves, read for themselves: how many, and the shares each dormant
      // seeker received from them (what speeds its activation)
      const head = await g.chain.block('latest');
      const ev = await g.chain.events(head.number - Math.round(DAY / g.moves.rate), head.number);
      const moves = ev.filter((e) => e.kind === 'move' && !e.burn);
      S.net.moves = moves.length;
      S.net.shareRate = moves.reduce((sum, m) => sum + (m.pool === 'dormant' && m.recipients ? m.charge / m.recipients : 0), 0);
      this._renderWalletLine();
      if (this.tab === 'seekers') this._renderCharge();
      const all = await g.chain.allCharges();
      let sum = 0, n = 0;
      for (let i = 0; i < all.charges.length; i++) if (all.status[i] !== 3) { sum += Math.min(all.charges[i], 9000); n++; }
      S.net.avg = n ? sum / n : 0;
      this._renderWalletLine();
    } catch { /* offline: no network line */ }
  }

  async _loadSeekers(address) {
    const S = this.seekers, g = this.game;
    S.loading = true;
    S.err = '';
    this._renderSeekerGrid();
    try {
      await art.loadMeta();
      const ids = await g.chain.holdings(address);
      if (S.address !== address) return;
      S.ids = ids;
      S.sel = 0;
      if (ids.length) {
        const st = await g.chain.tokens(ids);
        for (const s of st) S.state.set(s.token, s);
      }
    } catch (e) {
      S.err = 'Robinhood Chain did not answer. Try again in a moment.';
    }
    S.loading = false;
    if (this.open && this.tab === 'seekers') { this._renderSeekerGrid(); }
  }

  _renderSeekerGrid() {
    const S = this.seekers, grid = this._seekGrid;
    if (!grid || !grid.isConnected) return;
    clear(grid);
    if (!S.address) {
      el('div', 'muted empty', grid, 'Link a wallet, or view an address, to see its seekers.');
      clear(this._seekDetail);
      return;
    }
    if (S.loading) {
      loader(grid, `Reading ${short(S.address)} from Robinhood Chain`);
      // where the seekers will be, breathing in turn until they come
      for (let i = 0; i < this._cols * 2; i++) el('div', 'well ghost', grid).style.animationDelay = `${i * 0.12}s`;
      clear(this._seekDetail);
      return;
    }
    if (S.err) { el('div', 'neg empty', grid, S.err); return; }
    if (!S.ids) return;
    if (!S.ids.length) { el('div', 'muted empty', grid, `${short(S.address)} holds no SEEKER NET seekers.`); clear(this._seekDetail); return; }
    S.ids.forEach((id, i) => {
      const w = el('button', 'well' + (i === S.sel ? ' sel' : ''), grid);
      const c = el('canvas', 'pix', w);
      const st = S.state.get(id);
      const look = lookOf(st);
      art.drawCrop(c, id, look).catch(() => {});
      el('span', 'tid', w, '#' + id);
      w.onclick = () => {
        S.sel = i;
        this._renderSeekerDetail();
        this._markSel();
        this.game.audio.play('ui', { h: 24 });
        // stacked (a phone held upright), its page is below the list: go to it
        if (matchMedia('(max-aspect-ratio: 1/1)').matches) this._seekDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    this._renderSeekerDetail();
  }

  _markSel() {
    const S = this.seekers;
    [...this._seekGrid.children].forEach((w, i) => w.classList.toggle('sel', i === S.sel));
  }

  _renderSeekerDetail() {
    const S = this.seekers, d = this._seekDetail;
    if (!d || !S.ids || !S.ids.length) return;
    clear(d);
    const id = S.ids[S.sel];
    const st = S.state.get(id);
    const info = art.info(id);
    const look = lookOf(st);
    const head = el('div', 'shead', d);
    const c = el('canvas', 'pix portrait', head);
    art.drawInto(c, id, look, 2).catch(() => {});
    const t = el('div', '', head);
    el('div', 'name', t, `SEEKER #${id}`);
    el('div', 'muted', t, `${info.traits.Loadout} · Charge Rank ${formatInt(info.chargeRank)} (0 = rarest)`);
    this._statusEl = el('div', '', t);
    this._chargeEl = el('div', 'charge', t);
    this._barEl = el('div', 'cbar', t);
    el('i', '', this._barEl);
    this._aboard(d, id);
    this._rowsEl = el('div', 'rows', d);
    const tr = el('div', 'traits', d);
    for (const k of ['Base', 'Colorway', 'Eyes', 'Floating Object', 'Head', 'Flank', 'Back', 'Background']) {
      const r = el('div', 'row', tr);
      el('span', 'k', r, k.toUpperCase());
      el('span', 'v', r, info.traits[k] || 'None');
    }
    this._renderCharge();
  }

  // bring one of your own seekers aboard (one at a time), or send it back
  _aboard(d, id) {
    const g = this.game, S = this.seekers, c = g.companion;
    const owner = (this.board && this.board.link && this.board.link.address) || connected();
    const box = el('div', 'aboard', d);
    if (owner && S.address === owner) {
      if (c.token === id) {
        el('span', 'pos', box, 'ABOARD · hovering by this computer ');
        const b = el('button', 'chip', box, 'SEND BACK');
        b.onclick = () => { c.recall(); this.render(); };
      } else {
        const b = el('button', 'btn', box, 'BRING ABOARD');
        if (c.token) el('span', 'muted', box, ` replaces SEEKER #${c.token}`);
        b.onclick = async () => {
          b.disabled = true;
          const st = S.state.get(id);
          await c.deploy(id, owner, { look: lookOf(st) });
          this.render();
        };
      }
    } else if (S.address) {
      const row = el('div', 'wrow', box);
      const b = el('button', 'btn', row, 'CONNECT TO BRING ABOARD');
      const msg = el('div', 'msg muted', box, 'Connect the wallet that holds it.');
      b.onclick = () => this._withWallet(row, msg, (w, m) => this._connectOnly(w, m));
    }
  }

  _renderCharge() {
    const S = this.seekers;
    if (!S.ids || !S.ids.length || !this._chargeEl || !this._chargeEl.isConnected) return;
    const id = S.ids[S.sel];
    const st = S.state.get(id);
    const info = art.info(id);
    const net = S.net;
    const rows = this._rowsEl;
    clear(rows);
    const row = (k, v, cls) => { const r = el('div', 'row', rows); el('span', 'k', r, k); el('span', 'v ' + (cls || ''), r, v); };
    if (!st) {
      this._statusEl.textContent = 'Reading…';
      return;
    }
    const now = Date.now();
    const charge = st.status === 0 ? st.charge + (50 * (now - st.at)) / DAY : st.status === 2 ? st.charge + (50 * (now - st.at)) / DAY : st.charge;
    const act = st.status !== 0 || charge >= 9000;
    const stage = Math.min(Math.floor((Math.min(charge, 9000) * 6) / 9000), 5) + 1;
    this._statusEl.textContent = st.status === 2 ? 'ACTIVATED · RECORDED' : act ? 'ACTIVATED · NOT RECORDED YET' : `DORMANT · STAGE ${stage} OF 6`;
    this._statusEl.className = act ? 'pos' : '';
    this._chargeEl.textContent = `CHARGE ${formatNum(charge, 2)}`;
    this._barEl.firstChild.style.width = `${Math.min(100, (charge / 9000) * 100)}%`;
    this._barEl.classList.toggle('full', act);
    row('STARTING CHARGE', formatInt(info.startingCharge));
    if (!act) {
      const shares = st.lastMove ? (net ? net.accD - st.snap : null) : net ? net.accD : null;
      row('DISCHARGE', formatNum(st.discharge, 1), st.discharge > 0 ? '' : 'muted');
      row('UPLINK', formatNum(st.uplink, 1), st.uplink > 0 ? '' : 'muted');
      if (shares !== null && shares >= 0) row(st.lastMove ? 'SHARES SINCE LAST MOVE' : 'SHARES SINCE THE REVEAL', '+' + formatNum(shares, 1));
      row('LAST MOVED', st.lastMove ? `${dateStr(st.lastMove)} · ${ago(st.lastMove)}` : 'not since the reveal');
      const left = 9000 - charge;
      const plain = left / 50;
      row('ACTIVATES AT +50 A DAY', `${dateStr(now + plain * DAY).split(' ').slice(0, 3).join(' ')} · ${formatNum(plain, 1)} days`);
      if (net && net.shareRate > 0) {
        const days = left / (50 + net.shareRate);
        row(`WITH TODAY’S SHARES (+${formatNum(net.shareRate, 1)})`, `${dateStr(now + days * DAY).split(' ').slice(0, 3).join(' ')} · ${formatNum(days, 1)} days`, 'pos');
      }
      row('IF IT MOVES', `keeps 75%: ${formatInt(charge * 0.75)}, gives ${formatInt(charge * 0.25)} to the others`, 'muted');
    } else {
      row('ABOVE 9,000', `+${formatNum(Math.max(0, charge - 9000), 1)}`);
      row('LAST MOVED', st.lastMove ? `${dateStr(st.lastMove)} · ${ago(st.lastMove)}` : '—');
      if (st.status === 1) row('RECORDING', 'anyone can record it on chain; its charge above 9,000 counts from then', 'muted');
    }
  }
}

// Waiting: three marks lit in turn beside the words.
function loader(parent, words) {
  const w = el('div', 'loader', parent);
  const m = el('span', 'lmarks', w);
  for (let i = 0; i < 3; i++) el('i', '', m);
  el('span', 'muted', w, words);
  return w;
}

function lookOf(st) {
  if (!st) return { activated: false, stage: 1 };
  const charge = st.charge + (st.status === 0 ? (50 * (Date.now() - st.at)) / DAY : 0);
  if (st.status === 1 || st.status === 2 || charge > 9000) return { activated: true };
  return { activated: false, stage: Math.min(Math.floor((charge * 6) / 9000), 5) + 1 };
}

function km(d) { return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`; }
