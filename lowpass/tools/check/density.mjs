// How many sites, of which kinds and tiers, over a large square of the world:
//   node --import ./tools/check/reg.mjs tools/check/density.mjs [km]
const ROOT = new URL('../../', import.meta.url).href;
const { sitesNear } = await import(ROOT + 'src/world/sites.js');
const { TIERS } = await import(ROOT + 'src/artifacts/tiers.js');
const km = Number(process.argv[2] || 60), half = km * 500;
const seen = new Map();
for (let z = -half; z < half; z += 8000) for (let x = -half; x < half; x += 8000) {
  let r;
  do { r = sitesNear(x + 4000, z + 4000, 5700, 1e9); } while (!r.done);
  for (const s of r.sites) if (Math.abs(s.x) < half && Math.abs(s.z) < half) seen.set(s.key, s);
}
const all = [...seen.values()], area = km * km;
const by = (f) => all.reduce((m, s) => { const k = f(s); m[k] = (m[k] || 0) + 1; return m; }, {});
console.log(`${all.length} sites in ${area} km² (${(all.length / area * 100).toFixed(1)} per 100 km²)`);
console.log('kinds', by((s) => s.kind));
console.log('tiers', by((s) => (s.kind === 'artifact' ? TIERS[s.tier || 0].name : '-')));
console.log('res', by((s) => s.res || 0));
