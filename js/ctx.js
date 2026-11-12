// Shared game context + settings + small math helpers. Every module imports G.
export const G = {
  scene: null, camera: null, renderer: null,
  time: 0, dt: 0, timeScale: 1,
  running: false, paused: false, dev: /[?&]dev/.test(location.search),
  touch: false,
  settings: { intensity: 0, volume: 80, sens: 100, quality: 1, subs: 1 },
  // filled by modules:
  player: null, flash: null, world: null, audio: null, people: null, story: null, ui: null, post: null, fear: null,
};

const KEY = 'night67.settings';
export function loadSettings() {
  try { Object.assign(G.settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const q = /[?&]q=(\d)/.exec(location.search); if (q) G.settings.quality = +q[1];
  const i = /[?&]int=(\d)/.exec(location.search); if (i) G.settings.intensity = +i[1];
}
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(G.settings)); } catch (e) {}
}
/** true in "מפחיד באמת" mode */
export const hard = () => G.settings.intensity === 1;

// ---------- math ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** frame-rate independent approach */
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
export function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

// deterministic RNG
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// value noise 2D + fbm
function h2(x, y) { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
}
export function fbm(x, y, oct = 4) { let a = 0.5, s = 0, f = 1; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
