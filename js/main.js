// Bootstrap + main loop. Modules attach themselves to G (see ctx.js).
import * as THREE from 'three';
import { G, loadSettings, clamp } from './ctx.js';
import { initInput, pollInput, endFrameInput, input } from './input.js';
import { buildTerrain } from './terrain.js';
import { createPlayer } from './player.js';
import { createFlashlight } from './light.js';

const showErr = m => { const e = document.getElementById('err'); e.classList.remove('hidden'); e.textContent += m + '\n'; };
addEventListener('error', e => showErr(e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));
addEventListener('unhandledrejection', e => showErr('promise: ' + (e.reason && e.reason.message || e.reason)));

const optional = async name => { try { return await import(`./${name}.js`); } catch (e) { if (!/Failed to fetch|404|Cannot find/.test(String(e))) showErr(name + ': ' + e.message); console.warn('module missing', name, e); return null; } };

async function boot() {
  loadSettings();
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.scene.background = new THREE.Color(0x020305);
  G.scene.fog = new THREE.FogExp2(0x070a10, 0.02);
  G.camera = new THREE.PerspectiveCamera(70, 1, 0.08, 400);
  G.camera.rotation.order = 'YXZ';

  buildTerrain();
  createPlayer();
  createFlashlight();

  const mods = {};
  for (const n of ['world', 'post', 'fear', 'audio', 'people', 'ui', 'story', 'dev']) mods[n] = await optional(n);
  for (const n of ['world', 'post', 'fear', 'audio', 'people', 'ui', 'story', 'dev']) if (mods[n] && mods[n].init) await mods[n].init();

  if (!mods.ui) {                       // bare skeleton mode: just walk around
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('fade').style.opacity = 0;
    G.running = true; G.flash.has = G.flash.on = true;
    G.scene.add(new THREE.HemisphereLight(0x33405a, 0x0a0806, 0.5));
  }
  initInput(canvas, v => G.ui && G.ui.pause(v));
  resize(); addEventListener('resize', resize);

  let last = performance.now(), acc = 0, frames = 0, slow = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = Math.min(0.1, (now - last) / 1000); last = now;
    // fps watchdog -> automatic quality fallback
    acc += raw; frames++;
    if (acc >= 2) { const fps = frames / acc; acc = 0; frames = 0; G.fps = fps;
      if (G.running && !G.paused && !G.dev && fps < 27) { if (++slow >= 3 && G.settings.quality === 1) { G.settings.quality = 0; applyQuality(); slow = 0; } } else slow = 0; }
    if (G.frozen) return;
    step(raw);
  }
  requestAnimationFrame(frame);
  G.step = step; G.applyQuality = applyQuality; applyQuality();
  G.ready = true; window.__ready = true; if (G.dev && !window.__h) window.__h = { G };
}

function step(raw) {
  const dt = (G.paused ? 0 : raw) * G.timeScale; G.dt = dt;
  pollInput();
  if (G.running && !G.paused) {
    G.time += dt;
    if (input.lightPressed) G.flash.toggle();
    G.story && G.story.update(dt);
    G.player.update(dt);
    G.people && G.people.update(dt);
    G.flash.update(dt);
    G.fear && G.fear.update(dt);
    G.world && G.world.update(dt);
    G.audio && G.audio.update(dt);
  } else if (G.menuTick) G.menuTick(raw);
  G.ui && G.ui.update(raw);
  endFrameInput();
  if (G.post) G.post.render(raw); else G.renderer.render(G.scene, G.camera);
}

function applyQuality() {
  const hi = G.settings.quality === 1;
  G.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, hi ? 1.5 : 1) * (hi ? 1 : 0.75));
  G.flash && G.flash.setQuality(hi);
  G.world && G.world.setQuality && G.world.setQuality(hi);
  resize();
  G.post && G.post.setQuality(hi);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  G.renderer.setSize(w, h, false);
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  G.post && G.post.resize(w, h);
}

boot().catch(e => { showErr('boot: ' + (e.stack || e)); console.error(e); });
