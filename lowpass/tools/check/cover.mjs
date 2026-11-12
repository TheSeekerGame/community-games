// What share of the world each kind of place covers (sampled on a coarse grid):
//   node --import ./tools/check/reg.mjs tools/check/cover.mjs
const ROOT = new URL('../../', import.meta.url).href;
const T = await import(ROOT + 'src/world/terrain.js');
const { fbm2, smoothstep } = await import(ROOT + 'src/core/math.js');
let n = 0, m = 0, a = 0, d = 0, l = 0;
const field = (f, ox, oz) => (x, z) => fbm2(x * f + ox, z * f + oz, 3);
const df = field(0.0002, 911.3, -377.1), lf = field(0.0002, -223.9, 641.7);
const vals = { d: [], l: [] };
for (let z = -400000; z < 400000; z += 1500) for (let x = -400000; x < 400000; x += 1500) {
  n++;
  if (T.mountainEnv(x, z) > 0.5) m++;
  if (T.autumn(x, z) > 0.5) a++;
  if (T.desertEnv) { if (T.desertEnv(x, z) > 0.5) d++; if (T.lakeEnv(x, z) > 0.5) l++; }
  vals.d.push(df(x, z)); vals.l.push(lf(x, z));
}
const q = (arr, p) => { const s = [...arr].sort((p, q) => p - q); return s[Math.floor(s.length * p)].toFixed(3); };
console.log(`mountain ${(m / n * 100).toFixed(2)}%  autumn ${(a / n * 100).toFixed(2)}%  desert ${(d / n * 100).toFixed(2)}%  great lake ${(l / n * 100).toFixed(2)}%`);
console.log('field quantiles 0.97/0.98/0.99: desert', q(vals.d, 0.97), q(vals.d, 0.98), q(vals.d, 0.99), ' lake', q(vals.l, 0.97), q(vals.l, 0.98), q(vals.l, 0.99));
