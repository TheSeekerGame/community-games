import { tierOf } from '../artifacts/tiers.js';
import { el, clear } from './dom.js';
import { height, autumn, mountainEnv, riverOf, WATER, RCELL, RN } from '../world/terrain.js';
import { placeCode, placeOf } from '../world/sites.js';
import { stratum } from '../artifacts/strata.js';
import { clamp, TAU } from '../core/math.js';

// The Codex's MAP: the forest about the ship, north up, drawn from the same terrain the ship
// flies over (lakes, rivers, mountains, the turned stands), and on it only what this pilot
// knows of: what was recorded (in the color it was seen to; a ring where more is to see
// now), the signals the receiver hears, and the places other pilots have named on the
// BOARD. The rest of the world stays to be found. Choose one (or anywhere), and SET COURSE:
// the ship flies there by itself (course.js). A place code typed in does the same.

const RADII = [3000, 8000, 20000];         // meters from the ship to the map's edge
const N = 128;                             // the terrain's pixels across
const hexCss = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const CODE_RE = /\b[NS][0-9A-Z]{1,6}-[EW][0-9A-Z]{1,6}\b/g;

// place codes in a text (a board post's), each with where it is
export function placesIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(CODE_RE)) { const p = placeOf(m[0]); if (p) out.push({ code: m[0], ...p, index: m.index }); }
  return out;
}

// the terrain's colors, one sample
function shade(x, z, step) {
  const h = height(x, z);
  if (h < WATER) { const k = clamp((WATER - h) / 9, 0, 1); return [26 - 8 * k, 40 - 10 * k, 50 - 10 * k]; }
  const hx = height(x + step, z), hz = height(x, z + step);
  const light = clamp(1 + ((h - hx) * 0.9 + (h - hz) * 0.6) / step * 1.6, 0.55, 1.45);
  const m = mountainEnv(x, z), a = autumn(x, z), up = clamp((h + 40) / 220, 0, 1);
  let r = 30 + 22 * up, g = 37 + 22 * up, b = 36 + 24 * up;
  if (m > 0.3) { const k = clamp((m - 0.3) / 0.4, 0, 1), snow = clamp((h - 160) / 70, 0, 1); r += (88 - r) * k + 100 * snow; g += (94 - g) * k + 104 * snow; b += (104 - b) * k + 108 * snow; }
  if (a > 0.3) { const k = clamp((a - 0.3) / 0.4, 0, 1) * 0.8; r += (112 - r) * k; g += (80 - g) * k; b += (38 - b) * k; }
  return [r * light, g * light, b * light];
}

export class CodexMap {
  constructor(term) {
    this.t = term;
    this.ri = 1;
    this.sel = null;        // { x, z, kind, label, ... }
    this.raster = null;     // { key, canvas, x, z, r }
    this._job = 0;
  }
  get game() { return this.t.game; }
  get r() { return RADII[this.ri]; }

  // what is on the map: [{ x, z, kind: 'rec' | 'sig' | 'shared', label, color, more, e?, by? }]
  marks() {
    const g = this.game, out = [], seen = new Set(), att = g.progress.depth;
    for (const e of g.codex) {
      if (!e.site || !Number.isFinite(e.x) || seen.has(e.site)) continue;
      seen.add(e.site);
      // (in its tier's color, if above the common: tiers.js; else the color it was seen to)
      out.push({ x: e.x, z: e.z, kind: 'rec', label: e.name, e, color: e.tier ? tierOf(e.tier).color : e.depth ? hexCss(stratum(e.depth).light) : '#cfd6dc', more: (e.res || 0) > (e.depth || 0) && att > (e.depth || 0) });
    }
    for (const s of g.field.signals || []) {
      if (seen.has(s.key) || s.faint) continue;
      seen.add(s.key);
      const T = s.site.kind === 'artifact' ? s.site.tier || 0 : 0;
      out.push({ x: s.site.x, z: s.site.z, kind: 'sig', label: T ? `A signal · ${tierOf(T).name}` : 'A signal', color: T ? tierOf(T).color : '#d6edf5' });
    }
    const b = this.t.board;
    if (b) {
      const by = new Set();
      for (const p of b.posts) {
        const who = b.labelOf(p.address).name;
        const places = p.type === 'scan' && p.scan && p.scan.place ? [{ ...p.scan.place, label: p.scan.name }] : placesIn(p.type === 'scan' ? p.note : p.text).map((q) => ({ ...q, label: '' }));
        for (const q of places) {
          const k = `${Math.round(q.x / 50)},${Math.round(q.z / 50)}`;
          if (by.has(k)) continue;
          by.add(k);
          out.push({ x: q.x, z: q.z, kind: 'shared', label: q.label || 'A place named on the board', by: who, color: '#b9a87b' });
        }
      }
      // what other pilots found lately (finds.js), in its tier's color
      for (const f of b.finds.recent(0)) {
        if (seen.has(f.key) || !Number.isFinite(f.x)) continue;
        seen.add(f.key);
        out.push({ x: f.x, z: f.z, kind: 'shared', label: `${tierOf(f.tier).name} · ${f.name || 'a find'}`, by: b.labelOf(f.address).name, color: f.tier ? tierOf(f.tier).color : '#b9a87b' });
      }
    }
    return out;
  }

  render(body) {
    const g = this.game;
    const wrap = el('div', 'mapwrap', body);
    const left = el('div', 'mapleft', wrap);
    this.canvas = el('canvas', 'mapcv', left);
    this.canvas.width = this.canvas.height = 512;
    this.canvas.onclick = (ev) => this._click(ev);
    const zoom = el('div', 'filters mapzoom', left);
    RADII.forEach((r, i) => { const c = el('button', 'chip' + (i === this.ri ? ' sel' : ''), zoom, `${r / 1000} KM`); c.onclick = () => { this.ri = i; this.t.render(); }; });
    const legend = el('div', 'maplegend muted', left);
    for (const [cls, what] of [['rec', 'recorded'], ['sig', 'heard'], ['shared', 'found or named by others']]) { const s = el('span', '', legend); el('i', `lg ${cls}`, s); el('span', '', s, what); }
    this.panel = el('div', 'mappanel', wrap);
    this._panel();
    this.draw();
  }

  // the info beside the map: what is chosen, the course, a place code to fly to
  _panel() {
    const g = this.game, p = this.panel, c = g.course;
    if (!p || !p.isConnected) return;
    clear(p);
    const here = el('div', 'rows', p);
    const row = (k, v, cls) => { const r = el('div', 'row', here); el('span', 'k', r, k); return el('span', 'v ' + (cls || ''), r, v); };
    row('YOU ARE AT', placeCode(g.ship.x, g.ship.z));
    if (c.on) {
      const d = c.dist();
      row(c.phase === 'hold' ? 'HOLDING AT' : 'COURSE', `${c.to.label ? `${c.to.label} · ` : ''}${c.code} · ${km(d)}`, 'pos');
      const x = el('button', 'chip', p, 'CLEAR COURSE');
      x.onclick = () => { c.clear(); g.audio.play('ui', { h: 20 }); this._panel(); this.draw(); };
    }
    const s = this.sel;
    if (s) {
      const box = el('div', 'mapsel', p);
      el('div', 'name', box, s.label || 'A place');
      const rows = el('div', 'rows', box);
      const r2 = (k, v, cls) => { const r = el('div', 'row', rows); el('span', 'k', r, k); return el('span', 'v ' + (cls || ''), r, v); };
      r2('PLACE', placeCode(s.x, s.z));
      r2('DISTANCE', km(Math.hypot(s.x - g.ship.x, s.z - g.ship.z)));
      if (s.e) {
        const e = s.e;
        r2('RESONANCE', !e.res ? 'none' : `${stratum(e.res).numeral} · seen ${(e.depth || 0) >= e.res ? 'whole' : e.depth ? `to ${stratum(e.depth).numeral}` : 'not at all'}`);
        if (s.more) r2('', 'more to see there now', 'pos');
      }
      if (s.by) r2('NAMED BY', s.by);
      const b = el('button', 'btn', box, 'SET COURSE');
      b.onclick = () => this.go(s);
    } else el('div', 'muted', p, 'Choose a place on the map, or name one:');
    // a place code, typed
    const line = el('div', 'nameRow', p);
    const input = el('input', 'field one', line);
    input.placeholder = 'a place code, like N5G-E3K';
    input.maxLength = 16;
    input.addEventListener('focus', () => { g.input.uiCapture = true; });
    input.addEventListener('blur', () => { g.input.uiCapture = false; });
    const fly = el('button', 'chip', line, 'FLY THERE');
    const msg = el('div', 'msg muted', p);
    const go = () => {
      const q = placeOf(input.value);
      if (!q) { msg.className = 'msg neg'; msg.textContent = 'Not a place code.'; g.audio.play('error'); return; }
      input.blur();
      this.go({ ...q, label: '' });
    };
    input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') input.blur(); if (ev.key === 'Enter') go(); });
    fly.onclick = go;
  }

  go(s) {
    this.game.course.set(s.x, s.z, s.label && s.kind !== 'sig' ? s.label : '');
    this._panel();
    this.draw();
  }

  // the screen's scale: px per meter, about the ship
  _xf() { const g = this.game, W = this.canvas.width; return { cx: g.ship.x, cz: g.ship.z, k: W / 2 / this.r, W }; }

  _click(ev) {
    const rect = this.canvas.getBoundingClientRect(), { cx, cz, k, W } = this._xf();
    const px = ((ev.clientX - rect.left) / rect.width) * W, py = ((ev.clientY - rect.top) / rect.height) * W;
    const x = cx + (px - W / 2) / k, z = cz + (py - W / 2) / k;
    let best = null, bd = 22 * (W / rect.width);
    for (const m of this.marks()) { const d = Math.hypot((m.x - x) * k, (m.z - z) * k); if (d < bd) { bd = d; best = m; } }
    this.sel = best || { x, z, kind: 'point', label: '' };
    this.game.audio.play('ui', { h: 24 });
    this._panel();
    this.draw();
  }

  // ←→: the next mark by distance; ENTER: course to the chosen; Z: zoom
  keys(input) {
    const g = this.game;
    if (input.hit('KeyZ')) { this.ri = (this.ri + 1) % RADII.length; this.t.render(); return; }
    if (input.hit('Enter', 'Pad0') && this.sel) { this.go(this.sel); return; }
    const d = input.hit('ArrowRight', 'KeyD') ? 1 : input.hit('ArrowLeft', 'KeyA') ? -1 : 0;
    if (!d) return;
    const list = this.marks().sort((p, q) => Math.hypot(p.x - g.ship.x, p.z - g.ship.z) - Math.hypot(q.x - g.ship.x, q.z - g.ship.z));
    if (!list.length) return;
    const i = this.sel ? list.findIndex((m) => m.x === this.sel.x && m.z === this.sel.z) : -1;
    this.sel = list[(i + d + list.length) % list.length];
    g.audio.play('ui', { h: 24 });
    this._panel();
    this.draw();
  }

  // the terrain, drawn a few rows at a time (it is the slow part), kept while the ship is
  // near where it was drawn
  _terrain() {
    const g = this.game, r = this.r, step = (2 * r) / N;
    const key = `${Math.round(g.ship.x / (step * 4))},${Math.round(g.ship.z / (step * 4))},${r}`;
    if (this.raster && this.raster.key === key) return this.raster;
    if (this._pending === key) return this.raster && this.raster.r === r ? this.raster : null;
    this._pending = key;
    const job = ++this._job, x0 = g.ship.x - r, z0 = g.ship.z - r;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
    let j = 0;
    const slice = () => {
      if (job !== this._job) return;
      for (const end = Math.min(N, j + 10); j < end; j++) for (let i = 0; i < N; i++) {
        const [R, G, B] = shade(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step, step), o = (j * N + i) * 4;
        img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 255;
      }
      if (j < N) { setTimeout(slice, 0); return; }
      ctx.putImageData(img, 0, 0);
      // the rivers, too narrow for the pixels: drawn as lines
      ctx.strokeStyle = 'rgb(52,78,94)';
      ctx.lineCap = 'round';
      const kk = N / (2 * r);
      for (let cz = Math.floor((z0 - 4500) / RCELL); cz <= Math.floor((z0 + 2 * r + 4500) / RCELL); cz++) for (let cx = Math.floor((x0 - 4500) / RCELL); cx <= Math.floor((x0 + 2 * r + 4500) / RCELL); cx++) {
        const rv = riverOf(cx, cz);
        if (!rv) continue;
        ctx.lineWidth = Math.max(1.2, rv.rw * 2 * kk);
        ctx.beginPath();
        for (let i = 0; i <= RN; i++) { const X = (rv.xs[i] - x0) * kk, Z = (rv.zs[i] - z0) * kk; if (i) ctx.lineTo(X, Z); else ctx.moveTo(X, Z); }
        ctx.stroke();
      }
      this.raster = { key, canvas: c, x: x0 + r, z: z0 + r, r };
      this._pending = null;
      this.draw();
    };
    slice();
    return this.raster && this.raster.r === r ? this.raster : null;
  }

  draw() {
    const cv = this.canvas;
    if (!cv || !cv.isConnected) return;
    const g = this.game, ctx = cv.getContext('2d'), { cx, cz, k, W } = this._xf();
    const at = (x, z) => [W / 2 + (x - cx) * k, W / 2 + (z - cz) * k];
    ctx.fillStyle = '#0b0d13';
    ctx.fillRect(0, 0, W, W);
    const ras = this._terrain();
    if (ras) {
      ctx.imageSmoothingEnabled = false;
      const [x, y] = at(ras.x - ras.r, ras.z - ras.r);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(ras.canvas, x, y, 2 * ras.r * k, 2 * ras.r * k);
      ctx.globalAlpha = 1;
    } else { ctx.fillStyle = '#8a919e'; ctx.font = '14px monospace'; ctx.textAlign = 'center'; ctx.fillText('drawing the forest…', W / 2, W / 2 + 40); }
    // rings: the receiver's reach
    ctx.strokeStyle = 'rgba(214,237,245,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    const hear = [2500, 2900, 3300, 3800, 4400, 5000][Math.min(g.progress.gain, 5)];
    ctx.beginPath(); ctx.arc(W / 2, W / 2, hear * k, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // the course
    if (g.course.on) {
      const [x, y] = at(g.course.to.x, g.course.to.z);
      ctx.strokeStyle = 'rgba(201,162,107,0.85)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(W / 2, W / 2); ctx.lineTo(x, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.stroke();
    }
    // what this pilot knows of
    for (const m of this.marks()) {
      const [x, y] = at(m.x, m.z);
      if (x < -10 || y < -10 || x > W + 10 || y > W + 10) continue;
      ctx.fillStyle = m.color;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      if (m.kind === 'rec') { ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); if (m.more) { ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.stroke(); } }
      else if (m.kind === 'sig') { ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.stroke(); }
      else { ctx.fillRect(x - 4, y - 4, 8, 8); }
      if (this.sel && this.sel.x === m.x && this.sel.z === m.z) { ctx.strokeStyle = '#f0f2e8'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 11, y - 11, 22, 22); }
    }
    if (this.sel && this.sel.kind === 'point') { const [x, y] = at(this.sel.x, this.sel.z); ctx.strokeStyle = '#f0f2e8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke(); }
    // the ship, pointing the way it flies
    const h = g.ship.heading, fx = Math.sin(h), fz = Math.cos(h);
    ctx.fillStyle = '#f0f2e8';
    ctx.beginPath();
    ctx.moveTo(W / 2 + fx * 10, W / 2 + fz * 10);
    ctx.lineTo(W / 2 - fx * 6 + fz * 6, W / 2 - fz * 6 - fx * 6);
    ctx.lineTo(W / 2 - fx * 6 - fz * 6, W / 2 - fz * 6 + fx * 6);
    ctx.closePath();
    ctx.fill();
    // north
    ctx.fillStyle = '#8a919e'; ctx.font = '13px monospace'; ctx.textAlign = 'center'; ctx.fillText('N', W / 2, 16);
  }

  // a tick (twice a second): the ship moves on
  update() { this.draw(); }
}

function km(d) { return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`; }
