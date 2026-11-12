import { TIERS } from '../artifacts/tiers.js';
import { el, clear, key } from './dom.js';
import { stratum } from '../artifacts/strata.js';
import { TANK } from '../core/progress.js';
import { DONE } from '../artifacts/fx.js';

const hexCss = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

// The HUD: as little as the flight needs. A bearing to the signal along the top while it
// is out in the fog (and a smaller mark for each other one of a sweep); brackets around
// it once it is near, and the scan's hold beneath them; the alertness meter; one notice
// at a time; the keys that work right now. And, over everything, even the Codex: the
// alert that seekers moved while you are inside, with the way out.

export class Hud {
  constructor(root) {
    this.root = el('div', 'hud', root);
    this.signal = el('div', 'signal', this.root);
    this.sigMark = el('div', 'mark', this.signal);
    this.sigLabel = el('div', 'label', this.signal);
    this.sigOthers = [];
    this.sigDists = [];
    this.bracket = el('div', 'bracket', this.root);
    for (const c of ['tl', 'tr', 'bl', 'br']) el('i', c, this.bracket);
    this.brLabel = el('div', 'blabel', this.bracket);
    this.brBar = el('div', 'bbar', this.bracket);
    this.brFill = el('i', '', this.brBar);
    this.alert = el('div', 'alert', this.root);
    this.cup = el('div', 'cup', this.alert);
    this.alertBar = el('div', 'abar', this.alert);
    this.alertFill = el('i', '', this.alertBar);
    this.alertText = el('div', 'atext', this.alert);
    // the boost's plasma, over it: spent by the burn, gathered back slowly
    this.fuel = el('div', 'alert fuel', this.root);
    el('div', 'pico', this.fuel);
    this.fuelBar = el('div', 'abar', this.fuel);
    this.fuelFill = el('i', '', this.fuelBar);
    this.fuelText = el('div', 'atext', this.fuel);
    this.status = el('div', 'status', this.root);
    // the anomalies running, each with its time left
    this.anoms = el('div', 'anoms', this.root);
    this._anomKey = '';
    this.notice = el('div', 'notice', this.root);
    this.card = el('div', 'card', this.root);
    // along the bottom: the next thing to learn above the keys that work now
    this.bottom = el('div', 'bottom', this.root);
    this.speech = el('div', 'speech', this.bottom);
    this.speechWho = el('div', 'who', this.speech);
    this.speechText = el('div', 'said', this.speech);
    this.tip = el('div', 'tip', this.bottom);
    this.keys = el('div', 'keys', this.bottom);
    // the emitters, while something they can be fired at is in reach: a button each (its
    // key on a keyboard), lit once fired, faint while the plasma is short
    this.fxRow = el('div', 'fxrow', null);
    this.bottom.prepend(this.fxRow);
    this.onFire = null;
    this._fxKey = '';
    this.prompt = el('div', 'prompt', this.root);
    this.cross = el('div', 'cross', this.root);
    this.marks = [];
    // the alert: outside the HUD, so nothing that hides the HUD hides it
    this.alarm = el('div', 'alarm', root);
    el('i', 'amark', this.alarm);
    this.alarmTitle = el('div', 'at', this.alarm);
    this.alarmText = el('div', 'as muted', this.alarm);
    const row = el('div', 'arow', this.alarm);
    this.alarmBtn = el('button', 'btn', row, 'GO OUTSIDE');
    this.alarmKey = el('span', 'muted', row);
    key(this.alarmKey, 'V');
    const later = el('button', 'chip', row, 'NOT NOW');
    this.onAlarm = null;
    this.alarmBtn.onclick = () => { if (this.onAlarm) this.onAlarm(); };
    // waved off: quiet for these ones (the next seekers to move bring it back)
    this._waved = new Set();
    later.onclick = () => { for (const a of this._alarmList || []) this._waved.add(a); this.setAlarm(this._alarmList); };
    this.alarmOn = false;
    // its lighter kin for a wild artifact, which goes by itself after a while
    this.toastEl = el('div', 'alarm toast', root);
    el('i', 'amark', this.toastEl);
    this.toastTitle = el('div', 'at', this.toastEl);
    this.toastText = el('div', 'as muted', this.toastEl);
    const trow = el('div', 'arow', this.toastEl);
    this.toastGo = el('button', 'btn', trow, 'GO OUTSIDE');
    this.toastKey = el('span', 'muted', trow);
    key(this.toastKey, 'V');
    this.toastLater = el('button', 'chip', trow, 'NOT NOW');
    this.toastLater.onclick = () => this.hideToast();
    this.toastGo.onclick = () => { const act = this._toastAct; this.hideToast(); if (act) act.run(); else if (this.onAlarm) this.onAlarm(); };
    this._toastT = 0;
    this._noticeT = 0;
    this._cardT = 0;
    this._keysKey = '';
    this.visible = true;
  }

  show(v) {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
  }

  // one line, for a few seconds; a newer one replaces it
  say(text, sub = '', secs = 4.5) {
    clear(this.notice);
    el('div', 't', this.notice, text);
    if (sub) el('div', 's muted', this.notice, sub);
    this.notice.classList.add('on');
    this._noticeT = secs;
  }

  // the recorded card: the photograph and its name
  recorded(entry) {
    clear(this.card);
    el('div', 'k', this.card, 'RECORDED');
    const img = el('img', 'photo', this.card);
    img.src = entry.photo;
    img.alt = entry.name;
    el('div', 'n', this.card, entry.name);
    el('div', 'c muted', this.card, `${entry.code} · ${entry.cls}`);
    if (entry.depth) {
      const st = stratum(entry.depth);
      const dl = el('div', 'c deep', this.card, entry.site ? `SEEN TO ${st.numeral}${entry.plus ? '+ · MARKED' : ''}${entry.res > entry.depth ? ` OF ${stratum(entry.res).numeral}` : ''} · ${st.title}` : `DEPTH ${st.numeral}${entry.plus ? '+ · MARKED' : ''} · ${st.title}`);
      dl.style.color = hexCss(st.light);
    }
    if (entry.fx && entry.fx.length) el('div', 'c fxl', this.card, entry.fx.map((id) => (DONE[id] || id).toUpperCase()).join(' · '));
    el('div', 'c muted', this.card, 'Logged on the Codex computer, in the cabin');
    this.card.classList.add('on');
    this._cardT = 6;
  }

  // list: [{ id, name, key, color, done, low }] or null; keys: whether to show key caps
  setFx(list, keys) {
    const k = list ? list.map((e) => `${e.id}${e.done ? 1 : 0}${e.n}`).join() + keys : '';
    this.fxRow.classList.toggle('on', !!list);
    if (k === this._fxKey) return;
    // (the buttons stay as they were while the row fades out)
    if (!list) { this._fxKey = ''; return; }
    this._fxKey = k;
    clear(this.fxRow);
    for (const e of list) {
      const b = el('button', 'fx' + (e.done ? ' done' : '') + (e.low && !e.done ? ' low' : ''), this.fxRow);
      b.style.setProperty('--fx', hexCss(e.color));
      if (keys) key(b, e.key);
      el('i', 'fxdot', b);
      el('span', '', b, e.name);
      el('span', 'fxn', b, String(e.n));
      const go = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (this.onFire) this.onFire(e.id); };
      b.addEventListener('touchstart', go, { passive: false });
      b.addEventListener('mousedown', go);
    }
  }

  setKeys(list) {
    const k = list.map((x) => x.join(':')).join('|');
    if (k === this._keysKey) return;
    this._keysKey = k;
    clear(this.keys);
    for (const [cap, what] of list) {
      const row = el('span', 'kr', this.keys);
      for (const c of cap.split(' ')) key(row, c);
      el('span', 'kw', row, what);
    }
  }

  // the one thing to learn next: key caps (groups, 'or' between) and a few words
  setTip(caps, text) {
    if (!caps) { this.tip.classList.remove('on'); return; }
    const k = JSON.stringify(caps) + text;
    if (k !== this._tipKey) {
      this._tipKey = k;
      clear(this.tip);
      caps.forEach((group, i) => {
        if (i) el('span', 'muted', this.tip, 'or');
        const g = el('span', 'kg', this.tip);
        for (const c of group) key(g, c);
      });
      el('span', '', this.tip, text);
    }
    this.tip.classList.add('on');
  }

  // what the seeker aboard is saying (null: nothing)
  setSpeech(who, text = '', done = false) {
    if (!who) { this.speech.classList.remove('on'); return; }
    if (this.speechWho.textContent !== who) this.speechWho.textContent = who;
    if (this.speechText.textContent !== text) this.speechText.textContent = text;
    this.speech.classList.toggle('done', done);
    this.speech.classList.add('on');
  }

  // marks over things worth finding: [{ id, x, y, label, edge }]
  // a mark off the strip's end (behind, to one side) is an arrow pointing round
  _edge(mk, b) { mk.classList.toggle('edgeL', b > 1.2); mk.classList.toggle('edgeR', b < -1.2); }

  setMarks(list) {
    while (this.marks.length < list.length) {
      const m = el('div', 'mk', this.root);
      m.label = el('span', 'ml', m);
      el('i', '', m);
      this.marks.push(m);
    }
    this.marks.forEach((m, i) => {
      const k = list[i];
      m.classList.toggle('on', !!k);
      if (!k) return;
      const text = k.edge === 'l' ? `◂ ${k.label}` : k.edge === 'r' ? `${k.label} ▸` : k.label;
      if (m.label.textContent !== text) m.label.textContent = text;
      m.classList.toggle('edge', !!k.edge);
      m.style.left = `${Math.round(k.x)}px`;
      m.style.top = `${Math.round(k.y)}px`;
    });
  }

  setPrompt(text, cap) {
    if (!text) { this.prompt.classList.remove('on'); return; }
    if (this._prompt !== text + cap) {
      this._prompt = text + cap;
      clear(this.prompt);
      if (cap) key(this.prompt, cap);
      el('span', '', this.prompt, text);
    }
    this.prompt.classList.add('on');
  }

  // list: the witnessed artifacts still to scan while the player is away from the ship's
  // view (null: none)
  setAlarm(list) {
    this._alarmList = list;
    if (!list || !list.length) this._waved.clear();
    const on = !!(list && list.length) && list.some((a) => !this._waved.has(a));
    if (on) {
      const n = list.length;
      const t = n > 1 ? `${n} SEEKERS MOVED` : `SEEKER #${list[0].d.lead} MOVED`;
      if (this.alarmTitle.textContent !== t) this.alarmTitle.textContent = t;
      const s = n > 1 ? 'They are rising ahead of the ship, giant. Go out and scan them before they are behind you.' : 'It is rising ahead of the ship, giant. Go out and scan it before it is behind you.';
      if (this.alarmText.textContent !== s) this.alarmText.textContent = s;
    }
    if (on !== this.alarmOn) { this.alarmOn = on; this.alarm.classList.toggle('on', on); }
  }

  // over everything, for a few seconds (unless the alert is up)
  // (act: { label, run, color }: its own button in place of GO OUTSIDE, and a NOT NOW)
  toast(title, text, secs = 7, act = null) {
    if (this.alarmOn) return;
    this.toastTitle.textContent = title;
    this.toastText.textContent = text;
    this._toastAct = act;
    this.toastGo.textContent = act ? act.label : 'GO OUTSIDE';
    this.toastKey.style.display = act ? 'none' : '';
    this.toastLater.style.display = act ? '' : 'none';
    this.toastEl.style.setProperty('--tc', act && act.color ? act.color : '');
    this.toastEl.classList.toggle('tinted', !!(act && act.color));
    this.toastEl.classList.add('on');
    this._toastT = secs;
  }
  hideToast() { this._toastT = 0; this.toastEl.classList.remove('on'); }
  get toastOn() { return this._toastT > 0 && !this._toastAct; }

  // list: [{ name, color, left (s) }]
  setAnomalies(list) {
    const k = list.map((a) => `${a.name}${Math.ceil(a.left)}`).join();
    if (k === this._anomKey) return;
    this._anomKey = k;
    clear(this.anoms);
    for (const a of list) {
      const r = el('div', 'an', this.anoms);
      r.style.setProperty('--a', hexCss(a.color));
      el('i', '', r);
      const s = Math.max(0, Math.ceil(a.left));
      el('span', '', r, `${a.name} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    }
  }

  setStatus(text, cls) {
    if (this._status === text + cls) return;
    this._status = text + cls;
    clear(this.status);
    el('i', 'dot ' + cls, this.status);
    el('span', '', this.status, text);
  }

  // field: the artifact field; cam: camera; px: pipeline; mode: game mode
  update(dt, g) {
    this._noticeT -= dt;
    if (this._noticeT <= 0) this.notice.classList.remove('on');
    this._cardT -= dt;
    if (this._cardT <= 0) this.card.classList.remove('on');
    if (this._toastT > 0) {
      this._toastT -= dt;
      // gone by itself, or once one is where it can be seen from
      if (this._toastT <= 0 || this.alarmOn || (!this._toastAct && (g.mode === 'fly' || g.mode === 'seat') && !g.terminal.open && !g.menu.open && !g.reader.open)) this.hideToast();
    }

    const ground = g.mode === 'ground';
    const f = ground ? g.afoot : g.field, t = f.target;
    const flying = g.mode === 'fly' || g.mode === 'seat' || ground;
    // a witnessed artifact's marks are gold
    const sp = !!(t && t.special);
    this.bracket.classList.toggle('special', sp);
    // a deep one's marks are in its stratum's light
    const dp = t && t.d.depth ? stratum(t.d.depth) : null;
    if (dp !== this._dp) {
      this._dp = dp;
      this.bracket.classList.toggle('deep', !!dp);
      if (dp) this.bracket.style.setProperty('--deep', hexCss(dp.light));
    }
    // the bearing strip: to the one the scanner looks at, and a smaller mark for each
    // other one still out there (a sweep's)
    const open = flying ? f.open : [];
    let marks = [];
    // (rolled over by an inversion, the view is mirrored, and so is the strip)
    const mir = !ground && g.ship.flip > 0.5 ? -1 : 1;
    const at = (b) => `${(1 - (0.5 + Math.max(-1, Math.min(1, (b * mir) / 1.2)) * 0.5)) * 100}%`;
    // in sight: an artifact built and within what the fog lets one see (a yellow ring)
    const vis = flying ? f.visibility() : 0;
    const inSight = (x) => { const a = x.a; return !!(a && a.model && !a.building && a.dist < vis); };
    const far = (d) => (d >= 1000 ? `${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}` : `${Math.round(d / 50) * 50}m`);
    if (ground) {
      // on foot: the ship's way, once it is a little way off
      const sh = g.afoot.ship();
      if (sh.dist > 30) {
        this.signal.classList.add('on');
        this.sigMark.style.left = at(sh.bearing);
        this.sigMark.classList.toggle('edge', Math.abs(sh.bearing) > 1.2);
        this.sigLabel.textContent = `SHIP · ${Math.round(sh.dist / 10) * 10} m`;
      } else this.signal.classList.remove('on');
    } else if (flying && !ground) {
      // what is out there to fly to: the sites heard and not yet recorded (nearest first),
      // and whatever has risen for the ship (the witnessed); the large mark is the one the
      // scanner looks at if it is still far, else the nearest signal; small marks, the rest
      const sig = f.signals || [], risen = open.filter((a) => !a.site);
      const list = [...risen.map((a) => ({ a, dist: a.dist, bearing: a.bearing, gold: !!a.special })), ...sig];
      list.sort((p, q) => p.dist - q.dist);
      const held = t && (f.state === 'near' || f.state === 'lock') ? t : null;
      const rest = list.filter((x) => x.a !== held || !held);
      // (what has risen for the ship will not wait: it leads)
      // (a course set leads, unless something has risen for the ship)
      const course = g.course && g.course.on ? { course: true, dist: g.course.dist(), bearing: g.course.bearing() } : null;
      // (a rare one heard leads, the rarest: it is what the pilot would fly to; tiers.js)
      const tierOfX = (x) => (x.site && x.site.kind === 'artifact' ? x.site.tier || 0 : 0);
      const rare = rest.filter((x) => tierOfX(x) >= 2 && !x.faint).sort((p, q) => tierOfX(q) - tierOfX(p) || p.dist - q.dist)[0];
      const lead = rest.find((x) => x.gold) || course || (held ? null : (t && rest.find((x) => x.a === t)) || rare || rest[0] || null);
      if (course && lead !== course) rest.unshift(course);
      marks = rest.filter((x) => x !== lead).slice(0, 6);
      if (lead) {
        this.signal.classList.add('on');
        this.signal.classList.toggle('special', !!lead.gold);
        this.sigMark.style.display = '';
        this.sigMark.style.left = at(lead.bearing);
        this.sigMark.classList.toggle('edge', Math.abs(lead.bearing) > 1.2);
        this._edge(this.sigMark, lead.bearing * mir);
        this.sigMark.classList.toggle('insight', inSight(lead));
        const m = lead.dist >= 1000 ? `${(lead.dist / 1000).toFixed(1)} km` : `${Math.round(lead.dist / 10) * 10} m`;
        const n = rest.length;
        const gold = rest.filter((x) => x.gold).length;
        if (lead.course) this.sigLabel.textContent = `${g.course.phase === 'hold' ? 'HOLDING' : 'COURSE'} · ${m}`;
        else {
          const T = tierOfX(lead);
          this.sigLabel.textContent = `${lead.gold ? (gold > 1 ? `${gold} WITNESSED` : 'WITNESSED') : lead.faint ? 'FAINT SIGNAL' : T >= 1 ? `${TIERS[T].name}${n > 1 ? ` · ${n} SIGNALS` : ''}` : n > 1 ? `${n} SIGNALS` : 'SIGNAL'} · ${m}`;
        }
        const LT = lead.course || lead.gold ? 0 : tierOfX(lead);
        this.signal.style.setProperty('--tc', LT >= 1 ? TIERS[LT].color : '');
        this.signal.classList.toggle('tiered', LT >= 1);
        this.signal.classList.toggle('faint', !!lead.faint);
        this.signal.classList.toggle('course', !!lead.course);
      } else if (marks.length) {
        this.signal.classList.add('on');
        this.sigMark.style.display = 'none';
        this.sigLabel.textContent = '';
      } else this.signal.classList.remove('on');
    } else this.signal.classList.remove('on');
    if (ground) this.sigMark.style.display = '';
    const others = this.signal.classList.contains('on') && !ground ? marks : [];
    while (this.sigOthers.length < others.length) this.sigOthers.push(el('div', 'mark other', this.signal));
    while (this.sigDists.length < others.length) this.sigDists.push(el('div', 'mdist', this.signal));
    // each one's distance under it (km; meters close by), nearer ones larger; where two
    // would overlap, the nearer keeps its number
    const taken = [];
    this.sigOthers.forEach((mk, i) => {
      const a = others[i], dl = this.sigDists[i];
      mk.style.display = a ? '' : 'none';
      dl.style.display = a ? '' : 'none';
      if (!a) return;
      mk.style.left = at(a.bearing);
      mk.classList.toggle('edge', Math.abs(a.bearing) > 1.2);
      this._edge(mk, a.bearing * mir);
      mk.classList.toggle('insight', inSight(a));
      mk.style.setProperty('--s', Math.max(0.75, Math.min(1.6, 1.7 - a.dist / 3500)).toFixed(2));
      const pos = parseFloat(at(a.bearing));
      const clash = taken.some((p) => Math.abs(p - pos) < 7);
      dl.style.left = `${pos}%`;
      dl.textContent = clash ? '' : far(a.dist);
      if (!clash) taken.push(pos);
      mk.classList.toggle('gold', !!a.gold);
      mk.classList.toggle('course', !!a.course);
      const T = a.site && a.site.kind === 'artifact' ? a.site.tier || 0 : 0;
      mk.classList.toggle('tiered', T >= 1);
      if (T >= 1) mk.style.setProperty('--tc', TIERS[T].color);
    });
    // brackets
    let shown = false;
    // (a creature's from farther off: it is scanned only close by)
    if (t && flying && (f.state === 'near' || f.state === 'lock' || (t.fly && t.dist < 420 && t.revealed))) {
      const p = g.screenOf(t);
      if (p) {
        shown = true;
        const size = Math.max(14, Math.min(60, p.r));
        const u = g.ui.u;
        const x = Math.round(p.x / u) * u, y = Math.round(p.y / u) * u, s = Math.round(size) * u;
        this.bracket.style.left = `${x - s}px`;
        this.bracket.style.top = `${y - s}px`;
        this.bracket.style.width = `${s * 2}px`;
        this.bracket.style.height = `${s * 2}px`;
        this.bracket.classList.toggle('lock', f.state === 'lock');
        // low in the view (a short screen held sideways), the words go above it
        this.bracket.classList.toggle('up', y + s + u * 32 > innerHeight);
        const land = t.d.family === 'landing';
        this.brLabel.textContent = (sp ? `SEEKER #${t.d.lead} · ` : dp ? `${dp.numeral}${t.d.plus ? '+' : ''}${t.d.res > t.d.depth ? `/${stratum(t.d.res).numeral}` : ''} · ` : t.d.family === 'life' ? `${t.d.cls.toUpperCase()} · ` : '') + (f.state === 'lock'
          ? (f.scan > 0 ? (land ? 'LANDING' : 'SCANNING') : g.input.touchMode ? (land ? 'HOLD SCAN · LAND' : 'HOLD SCAN') : (land ? 'HOLD SPACE · LAND' : 'HOLD SPACE · SCAN'))
          : ground ? 'CLOSER' : 'STEER TO IT');
        this.brFill.style.width = `${f.scan * 100}%`;
      }
    }
    this.bracket.classList.toggle('on', shown);
    // alertness
    const a = g.alertness;
    this.alertFill.style.width = `${Math.round(a * 20) * 5}%`;
    this.alert.classList.toggle('low', a < 0.3);
    this.alert.classList.toggle('crit', a < 0.12);
    this.alertText.textContent = a < 0.3 ? 'TIRED · COFFEE IN THE CABIN' : 'ALERT';
    // plasma: the meter as long as the tank is large
    const tk = g.tankSecs;
    if (tk !== this._tank) { this._tank = tk; this.fuelBar.style.width = `calc(var(--u) * ${Math.round((52 * tk) / TANK[TANK.length - 1])})`; }
    const p = g.plasmaLeft ?? 1, burning = g.ship.boost > 0.05 && !g._spent;
    this.fuelFill.style.width = `${Math.round(p * 40) * 2.5}%`;
    this.fuel.classList.toggle('burn', burning);
    this.fuel.classList.toggle('spent', !!g._spent);
    const ft = g._spent ? 'PLASMA SPENT · GATHERING' : burning ? 'PLASMA · BURNING' : 'PLASMA';
    if (this.fuelText.textContent !== ft) this.fuelText.textContent = ft;
  }
}
