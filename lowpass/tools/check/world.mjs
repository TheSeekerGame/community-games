// The world, checked headlessly: node --import ./tools/check/reg.mjs tools/check/world.mjs [radius m]
// Every site within the radius of the start is described and built as pilots attuned to
// 0, 1, 2, 4, 9 and 30 see it, and run a few seconds: errors, NaNs, the heaviest.
const ROOT = new URL('../../', import.meta.url).href;
const THREE = await import('three');
const { describe, ALL_FAMILIES } = await import(ROOT + 'src/artifacts/generate.js');
const { buildArtifact } = await import(ROOT + 'src/artifacts/models.js');
const { sitesNear } = await import(ROOT + 'src/world/sites.js');
const R = Number(process.argv[2]) || 30000;
const all = sitesNear(1200, -800, R, 1e9).sites;
const count = (f) => { const m = {}; for (const x of all) { const k = f(x); m[k] = (m[k] || 0) + 1; } return JSON.stringify(m); };
console.log(`${all.length} sites within ${R / 1000} km (${(all.length / (Math.PI * (R / 1000) ** 2)).toFixed(3)} per km2)`);
console.log(' kinds', count((x) => x.kind), '\n places', count((x) => x.place), '\n resonance', count((x) => x.res ?? '-'));
console.log(' families', Object.entries(ALL_FAMILIES).map(([k, v]) => `${k} ${v.length}`).join(', '));
const moveOf = (site, att) => ({ tx: site.seed, wild: true, site: site.key, res: site.res || 0, depth: Math.min(att, site.res || 0), mountain: site.place === 'mountain', autumn: site.place === 'autumn', river: site.place === 'river', lake: site.place === 'lake', plus: !!site.plus, trace: !!site.trace, creature: site.kind === 'creature', landing: site.kind === 'landing', life: site.kind === 'life' ? site.species : null });
let n = 0, fails = 0, worst = 0, worstOf = '';
const fams = new Set(), forms = new Set(), t0 = performance.now();
for (const site of all) for (const att of [0, 1, 2, 4, 9, 30]) {
  if (att > 0 && !(site.res > 0)) continue;
  let d, m;
  try {
    d = describe(moveOf(site, att), null);
    m = buildArtifact(d, { ground: (x) => Math.sin(x * 0.05) * 1.5, ringY: 45, river: site.place === 'river' ? { rw: 30 } : null });
    for (let t = 0; t < 6; t += 0.7) m.update(t, t, { pulse: 1, reveal: 1, near: 0.5, shipLocal: new THREE.Vector3(100, 50, 100), fly: d.family === 'creature' ? { speed: 10, sprint: 0, turn: 0, v: 10 } : undefined });
  } catch (e) { fails++; console.log('FAIL', site.key, d && d.family, d && d.form, 'att', att, e.stack.split('\n').slice(0, 4).join(' | ')); continue; }
  n++; fams.add(d.family === 'creature' || d.family === 'life' ? `${d.family}:${d.species}` : d.family); if (d.form) forms.add(d.form);
  let tris = 0, bad = 0;
  m.group.traverse((o) => { if (!o.geometry) return; const p = o.geometry.attributes.position; if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3; for (const at of Object.values(o.geometry.attributes)) for (let i = 0; i < at.array.length; i += 7) if (!Number.isFinite(at.array[i])) bad++; });
  if (bad) { fails++; console.log('NaN', site.key, d.family, d.form, 'att', att); }
  if (tris > worst) { worst = tris; worstOf = `${d.family}${d.form ? ' + ' + d.form : ''}, attuned ${att} of ${site.res}: ${Math.round(tris)} triangles, ${Math.round(m.height)} m tall`; }
}
console.log(`built ${n} (${((performance.now() - t0) / n).toFixed(1)} ms each): ${fams.size} kinds of thing, ${forms.size} true forms; heaviest: ${worstOf}`);
console.log(fails ? `${fails} FAILURES` : 'all passed');
process.exit(fails ? 1 : 0);
