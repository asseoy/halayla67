// All sound through WebAudio. Positional sources use HRTF panners; everything else is synthesized.
import * as THREE from 'three';
import { G, clamp, lerp, damp, hard } from './ctx.js';

let C = null;
const A = { ready: false, buffers: {}, crickets: true, cricketVol: 1, wind: 0.5, drone: 0, fireOn: true, voices: [] };
const fwd = new THREE.Vector3(), upv = new THREE.Vector3();

function noiseBuffer(sec = 2, pink = false) {
  const n = Math.floor(C.sampleRate * sec), b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (pink) { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; } else d[i] = w; }
  return b;
}
function panner(pos, ref = 2, roll = 1.2) {
  const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 200;
  setPos(p, pos); return p;
}
const POOL = []; let poolI = 0;
/** a reusable panner for short one-shots (creating HRTF panners per sound stalls the audio thread) */
function pooled(pos) { if (!POOL.length) for (let i = 0; i < 8; i++) { const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.5; p.rolloffFactor = 1.2; p.maxDistance = 200; p.connect(A.sfx); POOL.push(p); }
  const p = POOL[poolI++ % POOL.length]; setPos(p, pos); return p; }
function setPos(p, v) { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z); }
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

async function init() {
  G.audio = A;
  A.start = () => {
    if (!C) {
      C = new (window.AudioContext || window.webkitAudioContext)();
      A.master = C.createGain(); A.lp = C.createBiquadFilter(); A.lp.type = 'lowpass'; A.lp.frequency.value = 20000;
      const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
      A.master.connect(A.lp).connect(comp).connect(C.destination);
      A.sfx = C.createGain(); A.sfx.connect(A.master);
      A.noise = noiseBuffer(2.5); A.pink = noiseBuffer(4, true);
      buildBeds(); A.ready = true; loadVoices();
    }
    if (C.state === 'suspended') C.resume();
    A.setVolume(G.settings.volume);
  };
  A.setVolume = v => { if (A.master) A.master.gain.value = (v / 100) * 0.9; };
  A.update = update;
}
export { init };

// ---------- beds: wind, cricket field, drone ----------
function buildBeds() {
  // wind: pink noise through a wandering band-pass
  const src = C.createBufferSource(); src.buffer = A.pink; src.loop = true;
  A.windF = C.createBiquadFilter(); A.windF.type = 'bandpass'; A.windF.frequency.value = 420; A.windF.Q.value = 0.6;
  A.windG = C.createGain(); A.windG.gain.value = 0.0;
  src.connect(A.windF).connect(A.windG).connect(A.master); src.start();
  // drone: two detuned low saws + a sub, through a low-pass, for tension
  A.droneG = C.createGain(); A.droneG.gain.value = 0; const dlp = C.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 260;
  [43.65, 44.1, 65.4].forEach((f, i) => { const o = C.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f; const g = C.createGain(); g.gain.value = i === 2 ? 0.5 : 0.18; o.connect(g).connect(dlp); o.start(); });
  dlp.connect(A.droneG).connect(A.master);
  // fire crackle source (gain driven by fire level)
  A.fireG = C.createGain(); A.fireG.gain.value = 0; A.fireP = panner(V3(0, 0.4, 0), 1.5, 1.4); A.fireG.connect(A.fireP).connect(A.master);
  const hiss = C.createBufferSource(); hiss.buffer = A.pink; hiss.loop = true; const hf = C.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 900; const hg = C.createGain(); hg.gain.value = 0.25;
  hiss.connect(hf).connect(hg).connect(A.fireG); hiss.start();
  A.nextCrackle = 0; A.nextChirp = 0; A.nextJackal = 6 + Math.random() * 10;
  A.cricketV = [-0.9, -0.5, -0.15, 0.2, 0.55, 0.9].map(pan => { const sp = C.createStereoPanner(); sp.pan.value = pan; const g = C.createGain(); g.gain.value = 0.6 + Math.random() * 0.5; g.connect(sp).connect(A.master); return { isCricket: true, node: g }; });
}

// ---------- one-shots ----------
function burst({ dur = 0.05, f = 2000, q = 1, type = 'bandpass', gain = 0.3, pos = null, at = 0, out = null, decay = 0.02 }) {
  const t = C.currentTime + at, s = C.createBufferSource(); s.buffer = A.noise; const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = C.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + decay);
  s.connect(fl).connect(g); if (pos && !out) g.connect(pooled(pos)); else g.connect(out || A.sfx);
  s.start(t, Math.random() * 2); s.stop(t + dur + decay + 0.05);
}
function tone({ f = 440, f2 = null, dur = 0.3, type = 'sine', gain = 0.2, at = 0, pos = null, attack = 0.005 }) {
  const t = C.currentTime + at, o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); if (pos) g.connect(pos.isCricket ? pos.node : pooled(pos)); else g.connect(A.sfx); o.start(t); o.stop(t + dur + 0.05); return o;
}
/** gravel footstep at the listener (player) or at a world position */
A.step = (run = false, pos = null, gainMul = 1) => { if (!A.ready) return;
  const g = (run ? 0.32 : 0.2) * gainMul;
  burst({ dur: 0.05, f: 2600 + Math.random() * 900, q: 0.7, gain: g, pos }); burst({ dur: 0.09, f: 500 + Math.random() * 200, q: 1.2, gain: g * 0.8, pos, at: 0.01 });
  for (let i = 0; i < 3; i++) burst({ dur: 0.012, f: 4000 + Math.random() * 3000, q: 4, gain: g * 0.5, pos, at: 0.02 + Math.random() * 0.06 }); };
A.heart = v => { if (!A.ready) return; const g = 0.25 + v * 0.45; tone({ f: 58, f2: 40, dur: 0.16, gain: g }); tone({ f: 52, f2: 38, dur: 0.2, gain: g * 0.7, at: 0.2 }); };
/** scare stingers */
A.sting = kind => { if (!A.ready) return; const loud = hard() ? 1 : 0.8;
  if (kind === 'hit') { burst({ dur: 0.6, f: 900, q: 0.3, type: 'lowpass', gain: 0.9 * loud, decay: 0.6 }); tone({ f: 70, f2: 30, dur: 1.4, type: 'sawtooth', gain: 0.6 * loud });
    [233, 247, 311, 466].forEach((f, i) => tone({ f, f2: f * 0.94, dur: 1.6, type: 'sawtooth', gain: 0.12 * loud, at: 0.01 * i })); burst({ dur: 0.9, f: 6000, q: 6, gain: 0.25 * loud, decay: 0.4 }); }
  else if (kind === 'rise') { const s = C.createBufferSource(); s.buffer = A.noise; const fl = C.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 3; const t = C.currentTime; fl.frequency.setValueAtTime(200, t); fl.frequency.exponentialRampToValueAtTime(5000, t + 2.6);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * loud, t + 2.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.7); s.connect(fl).connect(g).connect(A.sfx); s.start(t); s.stop(t + 2.8); }
  else if (kind === 'thump') { tone({ f: 48, f2: 30, dur: 0.6, gain: 0.7 * loud }); burst({ dur: 0.08, f: 300, q: 0.7, gain: 0.4 * loud }); }
  else if (kind === 'snap') { burst({ dur: 0.02, f: 3000, q: 1, gain: 0.6, pos: A._snapPos || null }); burst({ dur: 0.05, f: 1200, q: 2, gain: 0.4, at: 0.015, pos: A._snapPos || null }); }
};
/** a twig snapping somewhere in the dark */
A.snapAt = pos => { if (!A.ready) return; burst({ dur: 0.02, f: 3200, q: 1.2, gain: 0.7, pos }); burst({ dur: 0.06, f: 1300, q: 2, gain: 0.5, pos, at: 0.018 }); };
/** whisper from one exact direction: formant-filtered noise, syllable-like bursts */
A.whisper = (pos, dur = 2.4, gain = 0.5) => { if (!A.ready) return; const t0 = C.currentTime, s = C.createBufferSource(); s.buffer = A.noise; s.loop = true;
  const f1 = C.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5; const f2 = C.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
  const g = C.createGain(); g.gain.value = 0; const p = panner(pos, 1, 1.6); s.connect(f1).connect(g); s.connect(f2).connect(g); g.connect(p).connect(A.sfx);
  let t = t0; while (t < t0 + dur) { const sy = 0.08 + Math.random() * 0.16; const v = gain * (0.4 + Math.random() * 0.6);
    f1.frequency.setValueAtTime(600 + Math.random() * 900, t); f2.frequency.setValueAtTime(1800 + Math.random() * 1800, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + sy * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + sy); t += sy + Math.random() * 0.12; }
  s.start(t0); s.stop(t0 + dur + 0.3); };
/** someone walking at pos (fake footsteps; stop when you stop is handled by the story) */
A.stepsAt = (pos, n = 4, gap = 0.48, gain = 0.8) => { for (let i = 0; i < n; i++) setTimeout(() => A.step(false, pos, gain), i * gap * 1000); };
/** distant jackal howl */
function jackal(pos) { const t = C.currentTime; for (let k = 0; k < 2 + (Math.random() * 3 | 0); k++) { const o = C.createOscillator(); o.type = 'triangle'; const at = t + k * (0.3 + Math.random() * 0.5), d = 0.9 + Math.random() * 0.8, f0 = 620 + Math.random() * 300;
  o.frequency.setValueAtTime(f0 * 0.75, at); o.frequency.linearRampToValueAtTime(f0, at + d * 0.3); o.frequency.linearRampToValueAtTime(f0 * 0.82, at + d);
  const vib = C.createOscillator(); vib.frequency.value = 6 + Math.random() * 3; const vg = C.createGain(); vg.gain.value = 18; vib.connect(vg).connect(o.frequency);
  const fl = C.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 1.4; const g = C.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
  o.connect(fl).connect(g).connect(panner(pos, 25, 1)).connect(A.master); o.start(at); vib.start(at); o.stop(at + d + 0.1); vib.stop(at + d + 0.1); } }
/** the cheerful tune from someone's phone (positional, stoppable) */
A.phoneTune = (pos) => { if (!A.ready) return null; const out = C.createGain(); out.gain.value = 0.32; const lp = C.createBiquadFilter(); lp.type = 'highpass'; lp.frequency.value = 500; out.connect(lp).connect(panner(pos, 1.2, 1.4)).connect(A.master);
  const N = [[659, .25], [784, .25], [880, .5], [784, .25], [659, .25], [587, .5], [659, .25], [784, .25], [988, .5], [880, .25], [784, .25], [659, 1], [0, .5]];
  let t = C.currentTime + 0.1; const end = t + 40; const nodes = [];
  while (t < end) for (const [f, d] of N) { if (f) { const o = C.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.9); o.connect(g).connect(out); o.start(t); o.stop(t + d); nodes.push(o); } t += d * 0.42; }
  return { stop: (fade = 0.05) => { out.gain.setTargetAtTime(0, C.currentTime, fade); setTimeout(() => nodes.forEach(n => { try { n.stop() } catch (e) {} }), 1500); },
           warp: () => { const tt = C.currentTime; nodes.forEach(n => { try { n.detune.setValueAtTime(0, tt); n.detune.linearRampToValueAtTime(-1200, tt + 3) } catch (e) {} }); out.gain.setTargetAtTime(0, tt + 2, 0.6); } };
};
/** peeing: a soft filtered stream at a point in front of the player */
A.pee = (pos, dur) => { if (!A.ready) return; const t = C.currentTime, s = C.createBufferSource(); s.buffer = A.noise; s.loop = true; const fl = C.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 1400; fl.Q.value = 0.9;
  const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.3); g.gain.setValueAtTime(0.16, t + dur - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(panner(pos, 1)).connect(A.master); s.start(t); s.stop(t + dur + 0.1); };

// ---------- voices ----------
const VOICE_FILES = ['g_hi', 'z_hi', 'g_pee', 'z_ok', 'g_legend', 'z_legend', 'g_shh', 'z_turn', 'z_joke', 'z_where', 'z_call', 'g_far', 'z_run', 'g_mimic_src', 'z_scream', 'g_tune', 'z_camp'];
async function loadVoices() {
  await Promise.all(VOICE_FILES.map(async n => { try { const r = await fetch(`assets/voice/${n}.mp3`); if (!r.ok) return; A.buffers[n] = await C.decodeAudioData(await r.arrayBuffer()); } catch (e) {} }));
}
/** play a voice line at a position (or follow an object with .position). opts: rate, mimic, gain */
A.say = (name, at, opts = {}) => {
  if (!A.ready || !A.buffers[name]) return 0; const buf = opts.mimic ? mimicBuffer(A.buffers[name]) : A.buffers[name];
  const s = C.createBufferSource(); s.buffer = buf; s.playbackRate.value = opts.rate || 1;
  const g = C.createGain(); g.gain.value = opts.gain ?? 1.3;
  const p = panner(at.position ? at.position : at, 1.6, 1.1);
  let chain = s;
  if (opts.mimic) { const ws = C.createWaveShaper(); const k = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; k[i] = Math.round(x * 6) / 6; } ws.curve = k;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; s.connect(ws).connect(lp); chain = lp;
    const dl = C.createDelay(1); dl.delayTime.value = 0.23; const fb = C.createGain(); fb.gain.value = 0.35; lp.connect(dl).connect(fb).connect(dl); dl.connect(g); }
  chain.connect(g).connect(p).connect(A.master); s.start();
  if (at.position) A.voices.push({ p, obj: at, until: C.currentTime + buf.duration / (opts.rate || 1) + 0.2 });
  return buf.duration / (opts.rate || 1);
};
A.has = name => !!A.buffers[name];
/** wrong voice: slower, lower, with a reversed fragment spliced in the middle */
function mimicBuffer(b) {
  const sr = b.sampleRate, src = b.getChannelData(0), n = src.length, out = C.createBuffer(1, Math.floor(n * 1.22), sr), d = out.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const x = i / 1.22, j = Math.floor(x), f = x - j; d[i] = j + 1 < n ? src[j] * (1 - f) + src[j + 1] * f : 0; }
  const a = Math.floor(d.length * 0.42), L = Math.floor(sr * 0.32); for (let i = 0; i < L && a + i < d.length; i++) d[a + i] = d[a + L - i] * 0.9;
  return out;
}

// ---------- per-frame ----------
const lpos = new THREE.Vector3();
function update(dt) {
  if (!A.ready) return; const cam = G.camera, L = C.listener, t = C.currentTime;
  cam.getWorldPosition(lpos); cam.getWorldDirection(fwd); upv.set(0, 1, 0).applyQuaternion(cam.quaternion);
  if (L.positionX) { L.positionX.value = lpos.x; L.positionY.value = lpos.y; L.positionZ.value = lpos.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = upv.x; L.upY.value = upv.y; L.upZ.value = upv.z; }
  else { L.setPosition(lpos.x, lpos.y, lpos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, upv.x, upv.y, upv.z); }
  A.voices = A.voices.filter(v => { if (t > v.until) return false; setPos(v.p, v.obj.position.clone().setY(v.obj.position.y + 1.5)); return true; });
  // wind gusts
  const gust = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1);
  A.windG.gain.value = damp(A.windG.gain.value, (0.05 + 0.12 * gust) * A.wind * 2, 1, dt); A.windF.frequency.value = 280 + 520 * gust;
  // drone follows fear and the story's tension
  const f = G.fear ? G.fear.value : 0;
  A.droneG.gain.value = damp(A.droneG.gain.value, Math.min(0.5, A.drone * 0.35 + f * 0.25), 0.8, dt);
  A.lp.frequency.value = damp(A.lp.frequency.value, 20000 - f * 15500, 2, dt);
  // fire crackle
  const fire = G.world ? G.world.camp.fire.level : 0; A.fireG.gain.value = fire * 0.9;
  if (fire > 0.05 && t > A.nextCrackle) { A.nextCrackle = t + 0.04 + Math.random() * 0.25 / fire; burst({ dur: 0.008 + Math.random() * 0.02, f: 1800 + Math.random() * 4000, q: 2, gain: 0.35 * fire, out: A.fireG }); }
  // crickets: a field of chirps around the listener, which can stop all at once
  A.cricketVol = damp(A.cricketVol, A.crickets ? 1 : 0, A.crickets ? 0.3 : 6, dt);
  if (A.cricketVol > 0.02 && t > A.nextChirp) { A.nextChirp = t + 0.05 + Math.random() * 0.22;
    const pos = A.cricketV[(Math.random() * A.cricketV.length) | 0], base = 4200 + Math.random() * 600;
    for (let k = 0; k < 3; k++) tone({ f: base, dur: 0.035, type: 'sine', gain: 0.022 * A.cricketVol, at: k * 0.055, pos }); }
  // distant jackals now and then
  if (t > A.nextJackal) { A.nextJackal = t + 25 + Math.random() * 40; const a = Math.random() * 6.28; jackal(V3(lpos.x + Math.cos(a) * 80, lpos.y + 10, lpos.z + Math.sin(a) * 80)); }
}
