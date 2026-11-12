// node --import tools/check/reg.mjs <a check>: the game's modules under node, with just
// enough of a browser stubbed for them to load (nothing is drawn).
import { register } from 'node:module';
register(new URL('./hook.mjs', import.meta.url).href);
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch { /* as it is */ }
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.devicePixelRatio = 1; globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.addEventListener = () => {}; globalThis.requestAnimationFrame = () => 0;
