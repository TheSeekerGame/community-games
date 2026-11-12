// A contact sheet of artifacts, for looking at many at once in development: open the game
// with ?dev&play&mute, then in the console
//   const s = await import('/tools/check/sheet.js'); await s.ready();
//   await s.sheet([{ family: 'ring' }, { family: 'shell', seen: 3, res: 5 }, ...]);  s.hide();
// Each is built ahead of the ship as a pilot attuned to `seen` sees it (res layers in it),
// photographed from above and to one side, and drawn into a grid over the page.
import * as THREE from 'three';
import { U } from '/src/render/materials.js';

const g = () => window.__game;
export const run = async (sec) => { for (let i = 0; i < sec * 2; i++) { window.__lp.run(0.5, 30); await new Promise((r) => setTimeout(r, 30)); } };

// the game stepped by hand from here on, its overlays out of the way
export async function ready() {
  const G = g();
  if (G.boot) { try { G.boot.done(); } catch { /* gone */ } G.boot = null; }
  document.querySelectorAll('.boot').forEach((e) => e.remove());
  const t = document.querySelector('#ui > .title');
  if (t) t.style.display = 'none';
  window.dispatchEvent(new Event('resize'));
  window.__lp.freeze(true);
  window.__lp.alert(1);
  await run(1);
}

let el = null;
export function hide() { if (el) el.style.display = 'none'; }

// one artifact, photographed: opts { dist, h, ang, up, k, w, hgt } -> a canvas
export function shoot(a, opts = {}) {
  const G = g(), m = a.model, W = opts.w || 366, H = opts.hgt || 350;
  const dist = (opts.dist || Math.max(m.span * 2.4, m.height * 1.5) + 25) * (opts.k || 1), ang = opts.ang ?? 0.7;
  const focus = m.focus.clone().applyMatrix4(m.group.matrixWorld);
  const cam = new THREE.PerspectiveCamera(34, W / H, 0.3, 3000);
  cam.position.set(focus.x + Math.sin(ang) * dist, focus.y + (opts.h ?? m.height * 0.3 + dist * (opts.up ?? 0.34)), focus.z + Math.cos(ang) * dist);
  cam.up.set(0, 1, 0);
  cam.lookAt(focus);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const px = U.uPxScale.value, o = G.world.origin, back = G.cams.cam.position;
  U.uPxScale.value = H / 2 / Math.tan((cam.fov * Math.PI) / 360);
  G.world.lods(cam.position.x + o.x, cam.position.z + o.z);
  const rgba = G.px.capture(G.scene, cam, W, H, { uFlash: 0, uDrowsy: 0, uBlink: 0, uLetterbox: 0, uFade: 0, uVignette: 0.2 });
  G.world.lods(back.x + o.x, back.z + o.z);
  U.uPxScale.value = px;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').putImageData(new ImageData(rgba, W, H), 0, 0);
  return c;
}

// items: [{ family, seen, res, opts (layer()'s: mountain, river, lake, autumn, plus, trace, seed), dist, h, ang, label, wait }]
export async function sheet(items, cols = 3, rows = 2, common = {}) {
  const G = g(), W = 732, H = 700;
  if (!el) { el = document.createElement('canvas'); el.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:99999;background:#000'; document.body.append(el); }
  el.style.display = 'block';
  el.width = cols * W; el.height = rows * H;
  const ctx = el.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, el.width, el.height);
  ctx.imageSmoothingEnabled = false;
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = { ...common, ...items[i] };
    let info;
    try { info = await window.__lp.layer(it.family || null, it.seen || 0, it.res ?? (it.seen || 0), it.opts || {}, it.ahead || 420); } catch (e) { out.push(`${it.family}: ${String((e && e.stack) || e).slice(0, 240)}`); continue; }
    window.__lp.inspect(null);
    const a = G.field.active[G.field.active.length - 1];
    await run(it.wait || 3);
    const shot = shoot(a, it), cx = (i % cols) * W, cy = Math.floor(i / cols) * H;
    ctx.drawImage(shot, cx, cy, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '26px monospace';
    const label = `${it.label || info.family}${info.form ? '+' + info.form : ''} s${it.seen || 0} h${info.height} w${info.span}`;
    ctx.fillText(label, cx + 10, cy + 30);
    out.push(label);
  }
  return out;
}
