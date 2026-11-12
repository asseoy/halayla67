// First-person controller: walk/run, head bob, breathing, scripted soft look, sitting.
import * as THREE from 'three';
import { G, clamp, lerp, damp, angDiff, noise2 } from './ctx.js';
import { input } from './input.js';
import { heightAt, walkable, resolveCollide } from './terrain.js';

const EYE = 1.64, EYE_SIT = 0.98, WALK = 2.15, RUN = 4.3;

export function createPlayer() {
  const P = {
    pos: new THREE.Vector3(0, 0, 3), yaw: 0, pitch: 0,
    vel: new THREE.Vector3(), speed: 0, moving: false, running: false,
    sitting: false, canMove: true, canLook: true,
    eye: EYE, bobT: 0, bobAmt: 0, stepSide: 1,
    lookTarget: null, lookStrength: 0,      // scripted: soft pull of the view toward a world point
    shake: 0, kick: 0,                      // extra camera shake (fear / scares)
    onStep: null,                           // callback(run)
    noise: 0,                               // how loud the player is (0..1)
    fwd: new THREE.Vector3(),
  };
  const tmp = new THREE.Vector3();

  P.setPose = (x, z, yaw, pitch = 0) => { P.pos.set(x, heightAt(x, z), z); P.yaw = yaw; P.pitch = pitch; P.vel.set(0, 0, 0); };
  /** softly turn the view toward a point; strength 0..1 (1 = hard lock) */
  P.lookAt = (v, strength = 0.6) => { P.lookTarget = v ? v.clone() : null; P.lookStrength = strength; };
  P.yawTo = (x, z) => Math.atan2(-(x - P.pos.x), -(z - P.pos.z));

  P.update = dt => {
    const cam = G.camera, sens = 0.0021 * (G.settings.sens / 100);
    // --- look ---
    if (P.canLook) {
      P.yaw -= input.mx * sens; P.pitch -= input.my * sens;
    }
    if (P.lookTarget) {
      const dx = P.lookTarget.x - P.pos.x, dz = P.lookTarget.z - P.pos.z, dy = P.lookTarget.y - (P.pos.y + P.eye);
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
      const k = 1 - Math.exp(-P.lookStrength * 5 * dt);
      P.yaw += angDiff(P.yaw, ty) * k; P.pitch += (tp - P.pitch) * k;
    }
    P.pitch = clamp(P.pitch, -1.35, 1.35);

    // --- move ---
    let mx = 0, mz = 0;
    if (P.canMove && !P.sitting) { mx = input.moveX; mz = input.moveZ; }
    const run = input.run && mz < 0;
    const sp = run ? RUN : WALK, s = Math.sin(P.yaw), c = Math.cos(P.yaw);
    const wx = (mx * c + mz * s) * sp, wz = (-mx * s + mz * c) * sp;
    const acc = (mx || mz) ? 9 : 11;
    P.vel.x = damp(P.vel.x, wx, acc, dt); P.vel.z = damp(P.vel.z, wz, acc, dt);
    const nx = P.pos.x + P.vel.x * dt, nz = P.pos.z + P.vel.z * dt;
    if (walkable(nx, nz)) { P.pos.x = nx; P.pos.z = nz; }
    else if (walkable(nx, P.pos.z)) { P.pos.x = nx; P.vel.z = 0; }
    else if (walkable(P.pos.x, nz)) { P.pos.z = nz; P.vel.x = 0; }
    else { P.vel.set(0, 0, 0); }
    resolveCollide(P.pos, 0.38);
    P.pos.y = damp(P.pos.y, heightAt(P.pos.x, P.pos.z), 14, dt);
    P.speed = Math.hypot(P.vel.x, P.vel.z); P.moving = P.speed > 0.5; P.running = run && P.speed > 2.8;
    P.noise = damp(P.noise, P.running ? 1 : P.moving ? 0.35 : 0, 3, dt);

    // --- head bob + footsteps ---
    const prev = P.bobT; P.bobT += P.speed * dt * (P.running ? 1.05 : 1.25);
    P.bobAmt = damp(P.bobAmt, P.moving ? (P.running ? 1.7 : 1) : 0, 8, dt);
    if (P.moving && Math.floor(P.bobT / Math.PI) !== Math.floor(prev / Math.PI)) { P.stepSide *= -1; P.onStep && P.onStep(P.running, P.stepSide); }
    const bobY = Math.abs(Math.sin(P.bobT)) * -0.045 * P.bobAmt, bobX = Math.cos(P.bobT) * 0.022 * P.bobAmt;
    // breathing + micro sway (slow noise), stronger with fear
    const f = G.fear ? G.fear.value : 0, t = G.time;
    const br = Math.sin(t * (1.25 + f * 1.6)) * (0.006 + f * 0.007);
    const swY = (noise2(t * 0.35, 3.1) - 0.5) * 0.012, swP = (noise2(t * 0.3, 9.7) - 0.5) * 0.010;
    // shake
    P.shake = damp(P.shake, 0, 2.2, dt); P.kick = damp(P.kick, 0, 7, dt);
    const sh = P.shake + f * 0.0035 + P.kick;
    const shx = (noise2(t * 31, 1.7) - 0.5) * sh, shy = (noise2(t * 29, 5.3) - 0.5) * sh;

    P.eye = damp(P.eye, P.sitting ? EYE_SIT : EYE, 3.2, dt);
    cam.position.set(P.pos.x + c * bobX, P.pos.y + P.eye + bobY + br, P.pos.z - s * bobX);
    cam.rotation.set(P.pitch + swP + shy + br * 0.5, P.yaw + swY + shx, Math.cos(P.bobT) * 0.004 * P.bobAmt + shx * 0.5, 'YXZ');
    cam.getWorldDirection(P.fwd);
  };
  /** is a world point within `deg` of the view centre? */
  P.sees = (v, deg = 30) => { tmp.copy(v).sub(G.camera.position).normalize(); return tmp.dot(P.fwd) > Math.cos(deg * Math.PI / 180); };
  G.player = P; return P;
}
