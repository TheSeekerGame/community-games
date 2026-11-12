// A set of families (src/artifacts/sets/*.js), checked headlessly:
//   node --import ./tools/check/reg.mjs tools/check/settest.mjs src/artifacts/sets/<file>.js [family]
// Each family is built for 24 seeds and run: the contract, NaNs, triangles, draw calls,
// and that what it says of its size is what was built.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url).href;
const THREE = await import('three');
const { worldMaterial } = await import(ROOT + 'src/render/materials.js');
const { rng } = await import(ROOT + 'src/core/math.js');
const { DEEP_CODE } = await import(ROOT + 'src/artifacts/deep.js');
const file = path.resolve(process.argv[2]);
const only = process.argv[3];
const SET = (await import(pathToFileURL(file).href)).SET;
if (!SET) { console.error('FAIL: the file must export const SET = { ... }'); process.exit(1); }
const PLACES = ['any', 'mountain', 'autumn', 'river', 'lake', 'desert', 'greatlake'];
const VOICES = ['glass', 'fm', 'grains', 'breath', 'whale', 'chirp', 'glitch'];
const LIGHTS = [0x91cbde, 0xd6edf5, 0x8ca893, 0x7bacbc, 0x97acb0, 0xcfdde4, 0x8f7aa8, 0xaf634b];
let fails = 0;
if (/Math\.random|Date\.now|performance\.now/.test(readFileSync(file, 'utf8'))) { fails++; console.log('FAIL: the file uses Math.random / Date.now / performance.now: everything must come from the seed'); }
const fail = (id, msg) => { fails++; console.log(`  FAIL ${id}: ${msg}`); };
const warn = (id, msg) => console.log(`  warn ${id}: ${msg}`);
const codes = new Set();
for (const [id, F] of Object.entries(SET)) {
  if (only && id !== only) continue;
  console.log(`\n== ${id}`);
  if (!/^[A-Z]{3}$/.test(F.code || '')) fail(id, 'code must be three capital letters');
  if (codes.has(F.code)) fail(id, 'code repeats within this set'); codes.add(F.code);
  if (typeof F.cls !== 'string' || !F.cls) fail(id, 'cls missing');
  if (!Array.isArray(F.nouns) || F.nouns.length !== 6) fail(id, 'nouns must be six');
  if (!PLACES.includes(F.place)) fail(id, `place must be one of ${PLACES}`);
  if (F.tier !== undefined && !(Number.isInteger(F.tier) && F.tier >= 0 && F.tier <= 5)) fail(id, 'tier, if given, must be 0..5');
  if (!Array.isArray(F.kin) || F.kin.length < 2 || F.kin.some((k) => !DEEP_CODE[k])) fail(id, `kin must be 2-3 of: ${Object.keys(DEEP_CODE).join(' ')}`);
  if (!Array.isArray(F.voice) || F.voice.length !== 2 || F.voice.some((v) => !VOICES.includes(v))) fail(id, `voice must be two of ${VOICES}`);
  if (typeof F.params !== 'function' || typeof F.build !== 'function') { fail(id, 'params and build must be functions'); continue; }
  let maxTris = 0, maxMeshes = 0, ms = 0;
  const texts = new Set(), spans = [], heights = [], bw = [], bh = [];
  for (let n = 0; n < 24; n++) {
    const seed = Array.from({ length: 8 }, (_, i) => ((n + 1) * 2654435761 + i * 40503 * (n + 7)) >>> 0);
    const R = rng(seed[1] ^ 0x9e3779b9), R0 = rng(seed[0]);
    const grand = n % 7 === 6, size = (0.8 + R0() * 0.35) * (grand ? 1.45 : 1);
    let P;
    try { P = F.params(R, size); } catch (e) { fail(id, `params threw: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); break; }
    if (!P || typeof P.text !== 'string' || P.text.length < 20) { fail(id, 'params must return an object with text (a sentence for the Codex)'); break; }
    texts.add(P.text);
    const d = { seed, params: P, size, accent: LIGHTS[n % LIGHTS.length], strength: 1, family: id, grand, depth: 0, kind: 'wild' };
    const mats = { body: worldMaterial({ unique: true }), glow: worldMaterial({ unique: true }) };
    const bump = (x, z) => (F.place === 'lake' || F.place === 'greatlake' ? 0 : F.place === 'desert' ? Math.sin(x * 0.03 + z * 0.012 + n) * 2.2 + Math.sin(x * 0.09) * 0.3 : F.place === 'river' ? Math.max(0, (Math.abs(x) - 30) * 0.5) + Math.sin(z * 0.05) * 0.5 : Math.sin(x * 0.07 + n) * 1.2 + Math.cos(z * 0.05) * 1.2 + (F.place === 'mountain' ? -Math.hypot(x, z) * 0.35 : 0));
    const ctx = { ground: (x, z) => bump(x, z) - bump(0, 0), ringY: 45, river: F.place === 'river' ? { rw: 26 + (n % 4) * 6 } : null, seeker: null };
    let m;
    const t0 = performance.now();
    try {
      m = F.build(d, d.accent, mats, ctx);
      for (let t = 0; t < 24; t += 0.37) m.update(t, t * 1.6, { pulse: 0.3 + (t % 1) * 0.9, reveal: Math.min(1, t / 2), near: (Math.sin(t) + 1) / 2, shipLocal: new THREE.Vector3(Math.sin(t) * 200, 60, Math.cos(t) * 200) });
    } catch (e) { fail(id, `build/update threw (seed ${n}): ${e.stack.split('\n').slice(0, 4).join(' | ')}`); break; }
    ms += performance.now() - t0;
    for (const k of ['group', 'update', 'light', 'focus', 'span', 'height', 'clear']) if (m[k] === undefined) fail(id, `build must return ${k}`);
    if (!(m.light && m.light.isVector3) || !(m.focus && m.focus.isVector3)) { fail(id, 'light and focus must be THREE.Vector3 (local)'); break; }
    if (m.mats && m.mats.some((x) => !x || !x.uniforms)) fail(id, 'mats must be ShaderMaterials (glowMaterial/pointsMaterial/deepMaterial/worldMaterial)');
    let tris = 0, meshes = 0, bad = false;
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    m.group.traverse((o) => {
      if (!o.geometry) return;
      meshes++;
      const p = o.geometry.attributes.position;
      if (!p) return;
      for (const at of Object.values(o.geometry.attributes)) for (let i = 0; i < at.array.length; i++) if (!Number.isFinite(at.array[i])) { bad = true; break; }
      if (o.isMesh) {
        tris += ((o.geometry.index ? o.geometry.index.count : p.count) / 3) * (o.isInstancedMesh ? o.count : 1);
        if (!o.geometry.attributes.color) fail(id, 'a mesh has no color attribute (build with Builder, or set color + emissive attributes)');
        if (!o.material || !o.material.isShaderMaterial) fail(id, 'a mesh uses a non-shader material (use mats.body / mats.glow / glowMaterial / deepMaterial)');
      }
      if (!o.isPoints) {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox.clone();
        // (parts parked far away, the usual trick for hiding quads, are not counted)
        if (bb.min.y > -2000 && Number.isFinite(bb.min.x)) box.union(bb.applyMatrix4(o.matrixWorld));
      }
    });
    if (bad) { fail(id, `NaN/Infinity in geometry (a position, color, emissive or other attribute; seed ${n}): look for Math.pow of a negative, a division by zero`); break; }
    maxTris = Math.max(maxTris, tris); maxMeshes = Math.max(maxMeshes, meshes);
    spans.push(m.span / size); heights.push(m.height / size);
    bw.push(Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 / size); bh.push(box.max.y / size);
    if (m.solid && (typeof m.solid.r !== 'number' || typeof m.solid.top !== 'number')) fail(id, 'solid must be { r, top, low }');
  }
  if (!spans.length) continue;
  const mm = (a) => `${Math.min(...a).toFixed(0)}..${Math.max(...a).toFixed(0)}`;
  console.log(`  tris max ${Math.round(maxTris)}, objects max ${maxMeshes}, build+65 updates ${(ms / 24).toFixed(1)} ms avg`);
  console.log(`  claimed span ${mm(spans)} m, height ${mm(heights)} m  |  measured half-width ${mm(bw)} m, top ${mm(bh)} m  (per unit size)`);
  if (texts.size < 6) warn(id, `only ${texts.size} distinct texts over 24 seeds: let more of it vary by the seed`);
  if (maxTris > 26000) warn(id, 'over 26k triangles: make it lighter');
  if (maxMeshes > 14) warn(id, 'over 14 draw calls: merge more parts per Builder');
  if (Math.max(...bh) > 140) warn(id, 'taller than 140 m: too tall');
  if (Math.max(...bh) < 5) warn(id, 'under 5 m tall: it will not read from the air');
  const k = spans.map((s, i) => bw[i] / s);
  if (Math.max(...k) > 2.4 || Math.min(...k) < 0.4) warn(id, `span should be about its half-width (measured/claimed ${mm(k.map((x) => x * 100))} %)`);
}
console.log(fails ? `\n${fails} FAILURES` : '\nall passed');
process.exit(fails ? 1 : 0);
