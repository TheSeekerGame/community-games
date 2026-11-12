// More forms of the deep (src/artifacts/deepforms2.js), checked headlessly:
//   node --import ./tools/check/reg.mjs tools/check/formtest.mjs src/artifacts/deepforms2.js [form]
// Each form is built at depths 1, 2, 4, 7, 11, standing, hanging, and as another's crown
// and court, and run: errors, NaNs, triangles, draw calls, its measured extents.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url).href;
const THREE = await import('three');
const { worldMaterial } = await import(ROOT + 'src/render/materials.js');
const { rng } = await import(ROOT + 'src/core/math.js');
const { stratum } = await import(ROOT + 'src/artifacts/strata.js');
const { buildDeep, registerForms } = await import(ROOT + 'src/artifacts/deepforms.js');
const { formParams } = await import(ROOT + 'src/artifacts/deep.js');
const file = path.resolve(process.argv[2]);
const F = (await import(pathToFileURL(file).href)).NEW_FORMS;
const only = process.argv[3];
if (!F) { console.error('FAIL: the file must export const NEW_FORMS = { ... }'); process.exit(1); }
registerForms(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, v.build])));
let fails = 0;
if (/Math\.random|Date\.now|performance\.now/.test(readFileSync(file, 'utf8'))) { fails++; console.log('FAIL: the file uses Math.random / Date.now / performance.now: everything must come from the seed'); }
const fail = (id, msg) => { fails++; console.log(`  FAIL ${id}: ${msg}`); };
const SETS = ['any', 'mountain', 'autumn', 'river', 'lake', 'plus'];
for (const [id, X] of Object.entries(F)) {
  if (only && id !== only) continue;
  console.log(`\n== ${id}`);
  if (!/^[A-Z]{3}$/.test(X.code || '')) fail(id, 'code must be three capital letters');
  if (typeof X.cls !== 'string') fail(id, 'cls missing');
  if (!Array.isArray(X.nouns) || X.nouns.length !== 6) fail(id, 'nouns must be six');
  if (!SETS.includes(X.set)) fail(id, `set must be one of ${SETS}`);
  if (!(X.from >= 1 && X.from <= 4)) fail(id, 'from must be 1..4');
  if (typeof X.params !== 'function' || typeof X.build !== 'function') { fail(id, 'params and build must be functions'); continue; }
  let stop = false;
  for (const depth of [1, 2, 4, 7, 11]) for (const mode of ['ground', 'mini', 'crown']) for (let n = 0; n < 3 && !stop; n++) {
    const seed = Array.from({ length: 8 }, (_, i) => ((n + 1 + depth * 13) * 2654435761 + i * 40503 * (n + 7)) >>> 0);
    let P;
    try { P = { form: id, ...X.params(rng(seed[1]), depth) }; } catch (e) { fail(id, `params threw at depth ${depth}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); stop = true; break; }
    if (typeof P.text !== 'string' || P.text.length < 20) { fail(id, 'params must return text'); stop = true; break; }
    const st = stratum(depth);
    const voice = { layers: ['bells', 'pad'], chord: [16, 20, 24], oct: 2, pool: [16, 18, 19, 24, 28] };
    let params;
    if (mode === 'crown') { const base = formParams('nest', rng(seed[2]), depth); params = { ...base, crown: P, court: { n: 4, form: P }, ornaments: ['motes'], voice }; }
    else params = { ...P, ornaments: ['motes', 'halo'], voice, float: mode === 'mini' };
    const d = { seed, depth, size: st.size * (0.88 + 0.24 * (n / 2)), params, form: params.form, accent: st.light, strength: st.glow, family: 'deep', kind: 'wild' };
    const mats = { body: worldMaterial({ unique: true }), glow: worldMaterial({ unique: true }) };
    let m;
    const t0 = performance.now();
    try {
      m = buildDeep(d, d.accent, mats, { ground: (x) => Math.sin(x * 0.05) * 1.5, ringY: 45, river: X.set === 'river' ? { rw: 30 } : null });
      for (let t = 0; t < 20; t += 0.41) m.update(t, t * 1.6, { pulse: 0.3 + (t % 1) * 0.9, reveal: 1, near: (Math.sin(t) + 1) / 2, shipLocal: new THREE.Vector3(Math.sin(t) * 200, 60, Math.cos(t) * 200) });
    } catch (e) { fail(id, `build/update threw (depth ${depth}, ${mode}): ${e.stack.split('\n').slice(0, 4).join(' | ')}`); stop = true; break; }
    const ms = performance.now() - t0;
    let tris = 0, objs = 0, bad = false;
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    m.group.traverse((o) => {
      if (!o.geometry || !o.geometry.attributes.position) return;
      objs++;
      const p = o.geometry.attributes.position;
      for (const at of Object.values(o.geometry.attributes)) for (let i = 0; i < at.array.length; i++) if (!Number.isFinite(at.array[i])) { bad = true; break; }
      if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
      o.geometry.computeBoundingBox();
      if (Number.isFinite(o.geometry.boundingBox.min.x)) box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    if (bad) { fail(id, `NaN in geometry (depth ${depth}, ${mode})`); stop = true; break; }
    if (n === 0 && mode !== 'crown') console.log(`  depth ${String(depth).padStart(2)} ${mode.padEnd(6)}: tris ${Math.round(tris)}, objects ${objs}, ${ms.toFixed(0)} ms; claimed span ${m.span.toFixed(0)} height ${m.height.toFixed(0)}; measured half-width ${(Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2).toFixed(0)}, y ${box.min.y.toFixed(0)}..${box.max.y.toFixed(0)}`);
    if (tris > 60000) console.log(`  warn: ${Math.round(tris)} triangles at depth ${depth} (${mode}): lighter, please`);
    if (objs > 60) console.log(`  warn: ${objs} draw calls at depth ${depth} (${mode}): use fewer kits`);
  }
}
console.log(fails ? `\n${fails} FAILURES` : '\nall passed');
process.exit(fails ? 1 : 0);
