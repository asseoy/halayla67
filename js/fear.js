// Fear level 0..1: rises on scripted scares and in the dark, falls slowly in the light.
// It drives FOV, camera shake, heartbeat, the post FX and an audio low-pass (audio reads G.fear).
import { G, clamp, damp, hard } from './ctx.js';

export async function init() {
  const F = { value: 0, target: 0, base: 0, pulse: 0, beatT: 0, rate: 1 };
  /** add a spike (0..1); it decays back to base */
  F.spike = v => { F.target = clamp(Math.max(F.target, F.value) + v * (hard() ? 1.15 : 0.9), 0, 1); };
  /** the floor fear decays toward (rises as the story gets darker) */
  F.setBase = v => { F.base = v; };
  F.update = dt => {
    const fl = G.flash, dark = fl && fl.level < 0.2 ? 0.12 : 0;
    F.target = damp(F.target, F.base + dark, 0.18, dt);
    F.value = damp(F.value, F.target, F.target > F.value ? 3 : 0.6, dt);
    // heartbeat: faster with fear; audio plays the beat, post pulses red
    const bpm = 64 + F.value * 80; F.beatT += dt * bpm / 60;
    if (F.beatT >= 1) { F.beatT -= 1; if (F.value > 0.35) G.audio && G.audio.heart(F.value); }
    const ph = F.beatT; F.pulse = F.value > 0.5 ? Math.max(0, 1 - ph * 5) * (F.value - 0.5) * 2 : 0;
    // camera: tunnel FOV + tremble
    const cam = G.camera, fov = 70 - F.value * 9;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 2, dt); cam.updateProjectionMatrix(); }
    if (G.player) G.player.shake = Math.max(G.player.shake * Math.exp(-3 * dt), F.value > 0.6 ? (F.value - 0.6) * 0.5 : 0);
  };
  G.fear = F;
}
