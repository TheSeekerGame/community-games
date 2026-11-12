// Lets node load the game's modules (for the headless checks): 'three' from vendor/.
const THREE_URL = new URL('../../vendor/three.module.min.js', import.meta.url).href;
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: THREE_URL, shortCircuit: true, format: 'module' };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith('file:') && url.endsWith('.js')) { const r = await next(url, { ...ctx, format: 'module' }); return { ...r, format: 'module' }; }
  return next(url, ctx);
}
