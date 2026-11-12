// The two friends (procedural low-poly teens in hoodies) and the tall thing.
import * as THREE from 'three';
import { G, clamp, lerp, damp, angDiff, noise2 } from './ctx.js';
import { heightAt, resolveCollide } from './terrain.js';

const cap = (r, l, s = 6) => new THREE.CapsuleGeometry(r, l, 3, s);
function limb(parent, geo, mat, len, at) {     // a pivot with a capsule hanging down from it
  const piv = new THREE.Group(); piv.position.copy(at); parent.add(piv);
  const m = new THREE.Mesh(geo, mat); m.position.y = -len / 2; m.castShadow = true; piv.add(m);
  return piv;
}


// ---------- tribe prints: worn screen-print on the hoodies, and a rotten old tribe shirt on the thing ----------
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function wear(g, W, H, k) {          // cracked, washed-out print: punch out flecks and fine cracks
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400 * k; i++) { g.globalAlpha = Math.random() * 0.6; const r = Math.random() * 3 + 0.5; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, r, 0, 7); g.fill(); }
  g.lineWidth = 1.2; for (let i = 0; i < 60 * k; i++) { g.globalAlpha = 0.5 + Math.random() * 0.5; let x = Math.random() * W, y = Math.random() * H; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 12; g.lineTo(x, y); } g.stroke(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function frontPrint(logo) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  if (logo) { g.filter = 'saturate(0.55) brightness(0.8) contrast(1.05)'; const w = 210, h = w * logo.height / logo.width; g.drawImage(logo, 128 - w / 2, 128 - h / 2, w, h); g.filter = 'none'; }
  wear(g, 256, 256, 0.6); return tex(c);
}
function backPrint() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 384; const g = c.getContext('2d');
  g.textAlign = 'center'; g.direction = 'rtl';
  g.fillStyle = '#d4cab6'; g.font = '900 104px "Frank Ruhl Libre", serif'; g.fillText('שבט הנשיא', 256, 150);
  g.fillStyle = '#d4cab6'; g.fillRect(70, 186, 372, 6);
  g.fillStyle = '#9b2a20'; g.font = '700 62px "Frank Ruhl Libre", serif'; g.fillText('טיול חנוכה · 67', 256, 280);
  wear(g, 512, 384, 1); return tex(c);
}
function ragShirt(logo) {           // the thing wears what is left of a tribe shirt: grey rag, torn hem, faded logo, dark stains
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#5d5850'; g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 0);
  for (let x = 256, y = 330; x >= 0; x -= 14) g.lineTo(x, 300 + Math.random() * 190 + (x % 56 === 0 ? 40 : 0));
  g.closePath(); g.fill();
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(20,16,14,${0.25 + Math.random() * 0.35})`; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 420, 10 + Math.random() * 40, 8 + Math.random() * 60, Math.random() * 3, 0, 7); g.fill(); }
  if (logo) { g.save(); g.globalAlpha = 0.55; g.filter = 'grayscale(0.85) brightness(0.65)'; const w = 150, h = w * logo.height / logo.width; g.drawImage(logo, 128 - w / 2, 70, w, h); g.restore(); }
  g.globalCompositeOperation = 'destination-out';   // holes
  for (let i = 0; i < 7; i++) { g.beginPath(); const x = Math.random() * 256, y = 120 + Math.random() * 300, r = 6 + Math.random() * 18; for (let a = 0; a < 7; a += 0.7) g.lineTo(x + Math.cos(a) * r * (0.6 + Math.random() * 0.6), y + Math.sin(a) * r * (0.6 + Math.random() * 0.6)); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  wear(g, 256, 512, 0.8); return tex(c);
}
// a patch that hugs an elliptic body (radius rx sideways, rz front-back): bend a plane around it
function wrapPatch(w, h, rx, rz, map, back = false) {
  const geo = new THREE.PlaneGeometry(w, h, 12, 1), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), a = Math.min(Math.abs(x) / rx, 0.98); pos.setZ(i, rz * Math.sqrt(1 - a * a) + 0.004); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.05, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  if (back) m.rotation.y = Math.PI;
  return m;
}

function makePerson(o) {
  const H = o.h || 1.0;              // scale
  const hood = new THREE.MeshStandardMaterial({ color: o.hoodie, roughness: 0.95 });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 1 });
  const root = new THREE.Group(), hips = new THREE.Group(); hips.position.y = 0.92 * H; root.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = new THREE.Mesh(cap(0.19 * H, 0.36 * H, 8), hood); chest.scale.set(1.05, 1, 0.72); chest.position.y = 0.3 * H; chest.castShadow = true; torso.add(chest);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.24 * H, 0.1 * H, 0.03), new THREE.MeshStandardMaterial({ color: new THREE.Color(o.hoodie).multiplyScalar(0.8), roughness: 1 })); pocket.position.set(0, 0.17 * H, 0.13 * H); torso.add(pocket);
  if (o.prints) {                     // tribe hoodie: logo on the chest, name on the back (worn, not shiny)
    const rx = 0.19 * H * 1.05, rz = 0.19 * H * 0.72;
    const f = wrapPatch(0.24 * H, 0.24 * H, rx, rz, o.prints.front); f.position.y = 0.36 * H; torso.add(f);
    const b = wrapPatch(0.3 * H, 0.225 * H, rx, rz, o.prints.back, true); b.position.y = 0.36 * H; torso.add(b);
  }
  if (o.scarf) { const sc = new THREE.Mesh(new THREE.TorusGeometry(0.11 * H, 0.035 * H, 5, 12), new THREE.MeshStandardMaterial({ color: o.scarf, roughness: 1 })); sc.rotation.x = Math.PI / 2; sc.position.y = 0.55 * H; torso.add(sc); }
  const neck = new THREE.Group(); neck.position.y = 0.6 * H; torso.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115 * H, 12, 10), skin); skull.scale.set(0.92, 1.08, 0.98); skull.position.y = 0.12 * H; skull.castShadow = true; head.add(skull);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.121 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: o.hair, roughness: 1 })); hair.position.y = 0.135 * H; hair.rotation.x = -0.25; head.add(hair);
  if (o.hoodUp) { const hd = new THREE.Mesh(new THREE.SphereGeometry(0.15 * H, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), hood); hd.position.set(0, 0.12 * H, -0.02); hd.rotation.x = -0.5; hd.material.side = THREE.DoubleSide; head.add(hd); }
  // eyes catch the flashlight
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, roughness: 0.2 }), pupil = new THREE.MeshBasicMaterial({ color: 0x050505 });
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.016 * H, 6, 5), eyeM); e.position.set(s * 0.04 * H, 0.135 * H, 0.1 * H); head.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.009 * H, 5, 4), pupil); p.position.set(s * 0.04 * H, 0.135 * H, 0.113 * H); head.add(p); });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018 * H, 0.04 * H, 4), skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.11 * H, 0.115 * H); head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.045 * H, 0.008 * H, 0.01), dark); mouth.position.set(0, 0.07 * H, 0.108 * H); head.add(mouth);
  const arm = (s) => { const up = limb(torso, cap(0.055 * H, 0.22 * H), hood, 0.3 * H, new THREE.Vector3(s * 0.24 * H, 0.5 * H, 0)); const lo = limb(up, cap(0.05 * H, 0.2 * H), hood, 0.28 * H, new THREE.Vector3(0, -0.29 * H, 0));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045 * H, 6, 5), skin); hand.position.y = -0.3 * H; lo.add(hand); return { up, lo }; };
  const leg = (s) => { const th = limb(hips, cap(0.075 * H, 0.32 * H), pants, 0.44 * H, new THREE.Vector3(s * 0.1 * H, 0, 0)); const sh = limb(th, cap(0.065 * H, 0.3 * H), pants, 0.42 * H, new THREE.Vector3(0, -0.44 * H, 0));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1 * H, 0.07 * H, 0.24 * H), dark); shoe.position.set(0, -0.44 * H, 0.05 * H); shoe.castShadow = true; sh.add(shoe); return { th, sh }; };
  const R = { root, hips, torso, neck, head, mouth, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1), H };
  return R;
}

function makeThing(rag) {
  const black = new THREE.MeshStandardMaterial({ color: 0x141215, roughness: 1, metalness: 0 });
  const face = new THREE.MeshStandardMaterial({ color: 0x8c877c, roughness: 0.9 });
  const root = new THREE.Group();
  const body = new THREE.Mesh(cap(0.16, 1.5, 6), black); body.scale.set(1, 1, 0.6); body.position.y = 1.75; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), black); head.scale.set(0.8, 1.35, 0.85); head.position.y = 2.72; root.add(head);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8, -0.9, 1.8, 0.5, 1.9), face); mask.scale.set(0.8, 1.45, 0.9); mask.position.set(0, 2.7, 0.025); root.add(mask);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.02), new THREE.MeshBasicMaterial({ color: 0x050505 })); mouth.position.set(0, 2.58, 0.16); root.add(mouth);
  if (rag) { const sh = wrapPatch(0.3, 0.6, 0.16, 0.096, rag); sh.position.y = 1.98; root.add(sh); const bk = wrapPatch(0.3, 0.6, 0.16, 0.096, rag, true); bk.position.y = 1.98; root.add(bk); }
  const parts = [];
  [-1, 1].forEach(s => { const a = new THREE.Mesh(cap(0.05, 1.5, 4), black); a.position.set(s * 0.26, 1.55, 0); a.rotation.z = s * 0.07; root.add(a); parts.push(a);
    const l = new THREE.Mesh(cap(0.07, 1.3, 4), black); l.position.set(s * 0.11, 0.65, 0); root.add(l); parts.push(l); });
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const eyes = new THREE.Group(); [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd8d4c8, fog: false })); e.position.set(s * 0.055, 2.76, 0.13); eyes.add(e); }); root.add(eyes);
  return { root, head, parts, eyes };
}

export async function init() {
  const S = G.scene, P = { list: [] };
  const logo = await loadImg('assets/logo.webp');
  try { await document.fonts.load('900 40px "Frank Ruhl Libre"'); await document.fonts.load('700 40px "Frank Ruhl Libre"'); } catch (e) {}
  const prints = { front: frontPrint(logo), back: backPrint() };
  function person(name, o) {
    const r = makePerson(o); S.add(r.root);
    const p = { name, r, position: r.root.position, yaw: 0, speed: 0, mode: 'stand', path: null, pathI: 0, walkSpeed: 1.25, phase: Math.random() * 6, look: null, talkT: 0, sitK: 0, visible: true, follow: null, gesture: 0 };
    p.place = (x, z, yaw = 0) => { p.position.set(x, heightAt(x, z), z); p.yaw = yaw; p.path = null; p.speed = 0; };
    p.walk = (pts, spd = 1.25) => { p.path = pts.map(([x, z]) => new THREE.Vector3(x, 0, z)); p.pathI = 0; p.walkSpeed = spd; p.mode = 'stand'; };
    p.sit = on => { p.mode = on ? 'sit' : 'stand'; };
    p.lookAt = v => { p.look = v; };
    p.talk = d => { p.talkT = Math.max(p.talkT, d); };
    p.show = v => { p.visible = v; r.root.visible = v; };
    p.arrived = () => !p.path;
    P.list.push(p); return p;
  }
  P.g = person('גרעין', { hoodie: 0x4b5a3a, pants: 0x2a2d33, skin: 0xc9956b, hair: 0x2a1d14, h: 0.97, scarf: 0x8e1b16, prints });
  P.z = person('זיפ', { hoodie: 0x26262b, pants: 0x3d3a34, skin: 0xb58060, hair: 0x120d0a, h: 1.03, hoodUp: true, prints });
  const T = makeThing(ragShirt(logo)); T.root.visible = false; S.add(T.root);
  P.thing = { obj: T.root, t: T, position: T.root.position, active: false, nextT: 0, step: 0.14 };
  P.thing.show = (x, z, faceCam = true) => { T.root.position.set(x, heightAt(x, z), z); T.root.visible = true; P.thing.active = true; if (faceCam) T.root.rotation.y = Math.atan2(G.camera.position.x - x, G.camera.position.z - z); };
  P.thing.hide = () => { T.root.visible = false; P.thing.active = false; T.root.rotation.x = 0; };
  T.root.rotation.order = 'YXZ'; P.thing.lean = a => { T.root.rotation.x = a; };

  const tmp = new THREE.Vector3(), camPos = new THREE.Vector3();
  P.update = dt => {
    const t = G.time; G.camera.getWorldPosition(camPos);
    for (const p of P.list) {
      if (!p.visible) continue; const r = p.r;
      // path following
      if (p.path) { const tg = p.path[p.pathI]; tmp.set(tg.x - p.position.x, 0, tg.z - p.position.z); const d = tmp.length();
        if (d < 0.25) { p.pathI++; if (p.pathI >= p.path.length) { p.path = null; } }
        else { const want = Math.atan2(tmp.x, tmp.z); p.yaw += angDiff(p.yaw, want) * (1 - Math.exp(-6 * dt)); p.speed = damp(p.speed, p.walkSpeed, 4, dt);
          p.position.x += Math.sin(p.yaw) * p.speed * dt; p.position.z += Math.cos(p.yaw) * p.speed * dt; resolveCollide(p.position, 0.3); } }
      else p.speed = damp(p.speed, 0, 6, dt);
      p.position.y = damp(p.position.y, heightAt(p.position.x, p.position.z), 12, dt);
      r.root.rotation.y = p.yaw;
      // pose
      p.sitK = damp(p.sitK, p.mode === 'sit' ? 1 : 0, 4, dt);
      const s = p.speed, run = clamp((s - 1.6) / 2, 0, 1); p.phase += dt * (2.2 + s * 2.6);
      const sw = Math.sin(p.phase) * clamp(s / 1.2, 0, 1) * (0.55 + run * 0.35);
      const H = r.H;
      r.hips.position.y = lerp(0.92 * H, 0.5 * H, p.sitK) + Math.abs(Math.cos(p.phase)) * 0.03 * clamp(s, 0, 1);
      r.legL.th.rotation.x = lerp(sw, -1.45, p.sitK); r.legR.th.rotation.x = lerp(-sw, -1.4, p.sitK);
      r.legL.sh.rotation.x = lerp(Math.max(0, -Math.sin(p.phase + 0.6)) * 0.9 * clamp(s, 0, 1), 1.5, p.sitK); r.legR.sh.rotation.x = lerp(Math.max(0, Math.sin(p.phase + 0.6)) * 0.9 * clamp(s, 0, 1), 1.45, p.sitK);
      const breathe = Math.sin(t * 1.7 + p.phase * 0.01) * 0.02;
      r.torso.rotation.x = lerp(0.04 + run * 0.18, 0.25, p.sitK) + breathe; r.torso.rotation.y = Math.sin(p.phase) * 0.06 * clamp(s, 0, 1);
      // arms: swing when walking, gesture when talking, hands on knees when sitting
      p.talkT = Math.max(0, p.talkT - dt); const talk = p.talkT > 0 ? 1 : 0; p.gesture = damp(p.gesture, talk, 4, dt);
      const g = p.gesture * (0.5 + 0.5 * Math.sin(t * 3.1 + p.phase));
      r.armL.up.rotation.x = lerp(-sw * 0.9, -0.9, p.sitK) - g * 0.6; r.armR.up.rotation.x = lerp(sw * 0.9, -0.85, p.sitK);
      r.armL.up.rotation.z = 0.12 + g * 0.25; r.armR.up.rotation.z = -0.12;
      r.armL.lo.rotation.x = -0.25 - g * 0.9 - p.sitK * 0.5; r.armR.lo.rotation.x = -0.25 - p.sitK * 0.6;
      // head: look at a target (or the player), small nods while talking
      const lt = p.look === 'cam' ? camPos : p.look; let hy = 0, hp = 0;
      if (lt) { const dx = lt.x - p.position.x, dz = lt.z - p.position.z, dy = lt.y - (p.position.y + 1.55 * H); hy = clamp(angDiff(p.yaw, Math.atan2(dx, dz)), -1.1, 1.1); hp = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.5); }
      r.neck.rotation.y = damp(r.neck.rotation.y, hy, 5, dt); r.neck.rotation.x = damp(r.neck.rotation.x, hp + Math.sin(t * 6) * 0.05 * talk, 5, dt);
      r.mouth.scale.y = talk ? 1 + Math.abs(Math.sin(t * 17 + p.phase)) * 3 : 1;
    }
    // the thing: stutter motion, a pose update only every few frames
    const th = P.thing; if (th.active) { th.nextT -= dt; if (th.nextT <= 0) { th.nextT = th.step * (0.6 + Math.random());
      th.t.head.rotation.z = (Math.random() - 0.5) * 0.5; th.t.head.rotation.y = (Math.random() - 0.5) * 0.6; th.t.parts.forEach(m => { m.rotation.x = (Math.random() - 0.5) * 0.18; });
      th.obj.position.x += (Math.random() - 0.5) * 0.04; } th.t.eyes.visible = G.settings.intensity === 1 || th.obj.position.distanceTo(camPos) < 4; }
  };
  G.people = P;
}
