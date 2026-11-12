// Keyboard, mouse (pointer lock) and basic touch input.
import { G, clamp } from './ctx.js';

export const input = {
  keys: {}, mx: 0, my: 0,           // accumulated look delta (pixels)
  moveX: 0, moveZ: 0, run: false,   // resolved each frame
  usePressed: false, useHeld: false, lightPressed: false,
  stickX: 0, stickY: 0, touchRun: false, touchUse: false,
  locked: false,
};
let canvas, onPause = () => {};

export function initInput(cv, pauseCb) {
  canvas = cv; onPause = pauseCb;
  addEventListener('keydown', e => {
    if (e.repeat) return;
    input.keys[e.code] = true;
    if (e.code === 'KeyE') input.usePressed = true;
    if (e.code === 'KeyF') input.lightPressed = true;
    if (e.code === 'Escape' && G.running && !G.paused && !document.pointerLockElement) onPause(true);
    if (G.running && ['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { input.keys[e.code] = false; });
  addEventListener('blur', () => { input.keys = {}; });
  document.addEventListener('mousemove', e => {
    if (!input.locked) return;
    input.mx += e.movementX || 0; input.my += e.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    const was = input.locked; input.locked = document.pointerLockElement === canvas;
    if (was && !input.locked && G.running && !G.paused) onPause(true);   // Esc pressed
  });
  canvas.addEventListener('click', () => { if (G.running && !G.paused && !G.touch) lock(); });
  initTouch();
}
export function lock() {
  if (G.touch || !canvas.requestPointerLock) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
export function unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

export function pollInput() {
  const k = input.keys;
  let x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  let z = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
  x += input.stickX; z += input.stickY;
  const m = Math.hypot(x, z); if (m > 1) { x /= m; z /= m; }
  input.moveX = x; input.moveZ = z;
  input.run = !!(k.ShiftLeft || k.ShiftRight) || input.touchRun;
  input.useHeld = !!k.KeyE || input.touchUse;
}
export function endFrameInput() { input.usePressed = false; input.lightPressed = false; input.mx = 0; input.my = 0; }

// ---------- touch ----------
function initTouch() {
  const root = document.getElementById('touch'), stick = document.getElementById('stick'), nub = stick.firstElementChild;
  const enable = () => { if (G.touch) return; G.touch = true; document.body.classList.add('touch'); };
  addEventListener('touchstart', enable, { passive: true, once: true });
  let sid = null, lid = null, lx = 0, ly = 0, sx = 0, sy = 0;
  stick.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sid = t.identifier; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) {
        const dx = clamp((t.clientX - sx) / 50, -1, 1), dy = clamp((t.clientY - sy) / 50, -1, 1);
        input.stickX = dx; input.stickY = dy; nub.style.transform = `translate(${dx * 36}px,${dy * 36}px)`;
      } else if (t.identifier === lid) {
        input.mx += (t.clientX - lx) * 2.2; input.my += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) { sid = null; input.stickX = input.stickY = 0; nub.style.transform = ''; }
      if (t.identifier === lid) lid = null;
    }
  };
  addEventListener('touchend', end, { passive: true }); addEventListener('touchcancel', end, { passive: true });
  document.getElementById('gl').addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
  }, { passive: true });
  const btn = (id, down, up) => {
    const b = document.getElementById(id);
    b.addEventListener('touchstart', e => { e.preventDefault(); b.classList.add('on'); down(); }, { passive: false });
    b.addEventListener('touchend', e => { e.preventDefault(); b.classList.remove('on'); up && up(); }, { passive: false });
  };
  btn('tUse', () => { input.usePressed = true; input.touchUse = true; }, () => { input.touchUse = false; });
  btn('tLight', () => { input.lightPressed = true; });
  btn('tRun', () => { input.touchRun = !input.touchRun; document.getElementById('tRun').classList.toggle('on', input.touchRun); }, () => { document.getElementById('tRun').classList.toggle('on', input.touchRun); });
  btn('tPause', () => { if (G.running && !G.paused) onPause(true); });
  root.addEventListener('contextmenu', e => e.preventDefault());
}
