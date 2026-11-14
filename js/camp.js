// The camp: tents, campfire, logs, flag, phone, torch prop, the sandal.
import * as THREE from 'three';
import { G, rng, noise2, damp, clamp } from './ctx.js';
import { heightAt, addCollider, pathPoint, PATH_LEN } from './terrain.js';

const R = rng(99);

function fabricTex() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#b9b9b9'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`; g.fillRect(i, 0, 1, S); g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`; g.fillRect(0, i, S, 1); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * S, Math.random() * S, 3 + Math.random() * 14, 2 + Math.random() * 10); }
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, S / 2 - 1, S, 2);                 // seam
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function tentGeo() {
  const L = 3.1, w = 1.3, h = 1.5, pos = [], uv = [], idx = [];
  const NX = 6, NZ = 6;
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const u = i / NX, v = j / NZ;
      const sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.11 + Math.sin(u * Math.PI) * 0.03;
      pos.push(side * (u * w - sag * 0.75), h * (1 - u) - sag * 0.65, (v - 0.5) * L); uv.push(u * 2, v * 2);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = base + j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  }
  const tri = (ax, ay, bx, by, cx, cy, z) => { const b = pos.length / 3; pos.push(ax, ay, z, bx, by, z, cx, cy, z); uv.push(ax, ay, bx, by, cx, cy); idx.push(b, b + 1, b + 2); };
  tri(-w, 0, w, 0, 0, h, -L / 2);                                   // back wall
  tri(-w, 0, -0.34, 0, 0, h, L / 2); tri(0.34, 0, w, 0, 0, h, L / 2);  // front flaps, open in the middle
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildCamp() {
  const C = { tents: [], fire: null, group: new THREE.Group() };
  G.scene.add(C.group);
  const fab = fabricTex(), tg = tentGeo();
  const defs = [ // x, z, colour, lit
    [-8.4, 2.2, 0x5b6248, 1], [-6.6, 8.2, 0x6d6654, 0], [-0.8, 10.8, 0x4d5661, 1], [5.4, 9.4, 0x7a2a24, 0], [8.8, 3.6, 0x5b6248, 1], [9.6, -3.4, 0x6d6654, 0],
  ];
  const bagM = [0x34506a, 0x6a3a34, 0x3f5a44].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const bagG = new THREE.CapsuleGeometry(0.27, 1.3, 3, 8); bagG.rotateX(Math.PI / 2); bagG.scale(1, 0.4, 1);
  const pegM = new THREE.LineBasicMaterial({ color: 0x8a8578, transparent: true, opacity: 0.5 });
  defs.forEach((d, i) => {
    const grp = new THREE.Group(), y = heightAt(d[0], d[1]); grp.position.set(d[0], y - 0.02, d[1]);
    grp.rotation.y = Math.atan2(-d[0], -d[1]) + (R() - 0.5) * 0.35;                      // door (+z local) faces the fire
    const mat = new THREE.MeshStandardMaterial({ map: fab, color: d[2], roughness: 0.95, side: THREE.DoubleSide, emissive: 0xffb060, emissiveMap: fab, emissiveIntensity: 0 });
    const m = new THREE.Mesh(tg, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    if (d[2] === 0x7a2a24) {                                                           // tribe tent: black ridge band
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 3.14), new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 1 })); band.position.y = 1.47; grp.add(band);
    }
    for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(bagG, bagM[(i + k) % 3]); b.position.set(-0.45 + k * 0.9, 0.12, -0.2 + R() * 0.2); b.rotation.y = (R() - 0.5) * 0.3; b.receiveShadow = true; grp.add(b); }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.0), new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03; floor.receiveShadow = true; grp.add(floor);
    // guy ropes
    const lp = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) lp.push(0, 1.5, sz * 1.55, sx * 0.9, 0, sz * 2.5);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); grp.add(new THREE.LineSegments(lg, pegM));
    // lamp inside
    const lamp = new THREE.PointLight(0xffb469, 0, 7, 2); lamp.position.set(0, 0.9, 0.6); grp.add(lamp);
    C.group.add(grp);
    const door = new THREE.Vector3(0, 0.9, 2.2).applyEuler(grp.rotation).add(grp.position);
    const T = { grp, mat, lamp, lit: d[3], glow: d[3], target: d[3], x: d[0], z: d[1], door, phase: R() * 10 };
    C.tents.push(T); addCollider(d[0], d[1], 1.55);
  });
  C.setTentLights = on => C.tents.forEach(t => { t.target = on ? t.lit : 0; });

  // ----- logs to sit on -----
  const barkM = new THREE.MeshStandardMaterial({ color: 0x4a3c2e, roughness: 1 });
  const logG = new THREE.CylinderGeometry(0.2, 0.22, 1.7, 9); logG.rotateZ(Math.PI / 2);
  C.seats = [[0, 2.25, 0], [-2.05, -0.55, 1.25], [2.05, -0.45, -1.25]];
  for (const s of C.seats) { const l = new THREE.Mesh(logG, barkM); l.position.set(s[0], heightAt(s[0], s[1]) + 0.19, s[1]); l.rotation.y = s[2]; l.castShadow = l.receiveShadow = true; C.group.add(l); addCollider(s[0], s[1], 0.5); }

  C.fire = buildFire(C.group);
  buildFlag(C);
  buildSmallProps(C);

  C.update = dt => {
    const t = G.time;
    for (const T of C.tents) {
      T.glow = damp(T.glow, T.target, 6, dt);
      const fl = 0.9 + 0.1 * noise2(t * 2 + T.phase, T.phase);
      T.mat.emissiveIntensity = 0.16 * T.glow * fl; T.lamp.intensity = 5 * T.glow * fl; T.lamp.visible = T.glow > 0.01;
    }
    C.fire.update(dt); C.flagUpdate(t);
  };
  return C;
}

// ---------------- campfire ----------------
const flameVS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const flameFS = `uniform float uT; uniform float uP; uniform float uSeed; varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 u=vUv; float x=(u.x-0.5)*2.;
  float t=uT*1.7+uSeed;
  float w=n(vec2(u.x*3.+uSeed, u.y*2.2 - t*1.3))*0.6 + n(vec2(u.x*7., u.y*5. - t*2.4))*0.4;
  x += (w-0.5)*0.55*u.y;
  float hgt = uP*(0.55+0.45*n(vec2(t*0.9,uSeed)));
  float shape = 1.-smoothstep(0.0, 1.0, abs(x)/(0.50*(1.-u.y/hgt*0.85)+0.02));
  shape *= smoothstep(hgt, hgt*0.25, u.y) * smoothstep(0.0,0.06,u.y);
  float f = clamp(shape*(0.55+0.9*w),0.,1.);
  vec3 col = mix(vec3(0.9,0.16,0.02), vec3(1.0,0.62,0.12), smoothstep(0.15,0.6,f));
  col = mix(col, vec3(1.0,0.93,0.7), smoothstep(0.7,1.0,f));
  gl_FragColor = vec4(col*f*f*1.6, 1.);
}`;
const emberVS = `uniform float uT; uniform float uP; uniform float uPx; attribute vec4 aR; varying float vA;
void main(){
  float life = fract(uT*(0.10+aR.x*0.14) + aR.y);
  vec3 p = vec3((aR.z-0.5)*0.5, 0.15 + life*(1.6+aR.x*2.2), (aR.w-0.5)*0.5);
  p.x += sin(uT*1.3+aR.y*30.)*0.18*life + life*life*0.5; p.z += cos(uT*1.1+aR.z*30.)*0.18*life;
  vA = (1.-life)*smoothstep(0.,0.08,life)*step(aR.w, uP*1.2)*(0.5+0.5*sin(uT*9.+aR.y*50.));
  vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = uPx*(0.5+aR.x)/max(0.3,-mv.z);
}`;
const emberFS = `varying float vA; void main(){ float a=smoothstep(0.5,0.0,length(gl_PointCoord-0.5))*vA; if(a<0.01) discard; gl_FragColor=vec4(vec3(1.,0.45,0.1)*a*2.2,1.); }`;

function buildFire(parent) {
  const g = new THREE.Group(); g.position.set(0, heightAt(0, 0), 0); parent.add(g);
  const stoneM = new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 1, flatShading: true });
  const sg = new THREE.IcosahedronGeometry(0.17, 0);
  for (let i = 0; i < 11; i++) { const a = i / 11 * 6.283, s = new THREE.Mesh(sg, stoneM); s.position.set(Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62); s.rotation.set(R() * 3, R() * 3, R() * 3); s.scale.set(1 + R() * 0.5, 0.7 + R() * 0.4, 1 + R() * 0.5); s.castShadow = s.receiveShadow = true; g.add(s); }
  const coalM = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 1, emissive: 0xff4a10, emissiveIntensity: 0.5 });
  const lg = new THREE.CylinderGeometry(0.055, 0.07, 0.95, 6);
  for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(lg, coalM); const a = i / 5 * 6.283 + 0.3; l.position.set(Math.cos(a) * 0.17, 0.2, Math.sin(a) * 0.17); l.rotation.set(Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05); l.castShadow = true; g.add(l); }
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 1, emissive: 0xff3a08, emissiveIntensity: 0.25 })); ash.rotation.x = -Math.PI / 2; ash.position.y = 0.025; g.add(ash);
  const flames = [], fmesh = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.ShaderMaterial({ vertexShader: flameVS, fragmentShader: flameFS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uP: { value: 0.6 }, uSeed: { value: i * 3.7 } } });
    const pg = new THREE.PlaneGeometry(0.85 - i * 0.12, 1.25); pg.translate(0, 0.62, 0);
    const f = new THREE.Mesh(pg, m); f.position.set((i - 1) * 0.11, 0.1, (i === 1 ? 0.07 : -0.05)); f.renderOrder = 4; f.frustumCulled = false; g.add(f); flames.push(m); fmesh.push(f);
  }
  const N = 46, ar = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) ar[i] = R();
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); eg.setAttribute('aR', new THREE.BufferAttribute(ar, 4));
  const em = new THREE.ShaderMaterial({ vertexShader: emberVS, fragmentShader: emberFS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, uniforms: { uT: { value: 0 }, uP: { value: 0.6 }, uPx: { value: 30 } } });
  const embers = new THREE.Points(eg, em); embers.frustumCulled = false; embers.renderOrder = 4; g.add(embers);
  const light = new THREE.PointLight(0xff8a3c, 0, 26, 1.7); light.position.set(0, 0.75, 0); g.add(light);

  const F = { level: 0.62, target: 0.62, light, pos: new THREE.Vector3(0, g.position.y + 0.5, 0) };
  F.set = (v, instant) => { F.target = v; if (instant) F.level = v; };
  F.update = dt => {
    const t = G.time; F.level = damp(F.level, F.target, F.target < F.level ? 2.2 : 0.8, dt);
    const fl = 0.72 + 0.28 * noise2(t * 7.3, 1.1) + 0.12 * (noise2(t * 23, 4.2) - 0.5);
    light.intensity = 30 * F.level * fl; light.position.x = (noise2(t * 5, 9) - 0.5) * 0.16; light.position.z = (noise2(t * 4.3, 2) - 0.5) * 0.16;
    const ry = Math.atan2(G.camera.position.x - g.position.x, G.camera.position.z - g.position.z); for (const f of fmesh) f.rotation.y = ry;
    for (const m of flames) { m.uniforms.uT.value = t; m.uniforms.uP.value = F.level; }
    em.uniforms.uT.value = t; em.uniforms.uP.value = F.level; em.uniforms.uPx.value = 30 * G.renderer.getPixelRatio() * (innerHeight / 800);
    coalM.emissiveIntensity = 0.06 + 0.9 * F.level * fl; ash.material.emissiveIntensity = 0.03 + 0.4 * F.level * fl;
  };
  addCollider(0, 0, 0.8);
  return F;
}

// ---------------- flag ----------------
function buildFlag(C) {
  const x = 5.2, z = -5.6, y = heightAt(x, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 3.3, 6), new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.6, metalness: 0.4 })); pole.position.set(x, y + 1.65, z); pole.castShadow = true; C.group.add(pole);
  const fg = new THREE.PlaneGeometry(1.0, 0.66, 10, 5); const base = fg.attributes.position.array.slice();
  const tex = new THREE.TextureLoader().load('assets/logo.webp'); tex.colorSpace = THREE.SRGBColorSpace;
  // red field, black stripe, logo in the middle
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 198; const g = cv.getContext('2d');
  const paint = img => { g.fillStyle = '#7d1c18'; g.fillRect(0, 0, 300, 198); g.fillStyle = '#0c0c0c'; g.fillRect(0, 150, 300, 48); if (img) g.drawImage(img, 95, 22, 110, 106); ft.needsUpdate = true; };
  const ft = new THREE.CanvasTexture(cv); ft.colorSpace = THREE.SRGBColorSpace; paint(null);
  const im = new Image(); im.onload = () => paint(im); im.src = 'assets/logo.webp';
  const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(x + 0.52, y + 2.9, z); flag.castShadow = true; C.group.add(flag);
  addCollider(x, z, 0.15);
  C.flagUpdate = t => {
    const p = fg.attributes.position;
    for (let i = 0; i < p.count; i++) { const bx = base[i * 3], by = base[i * 3 + 1], u = (bx + 0.5); const w = G.audio && typeof G.audio.wind === 'number' ? Math.min(1, G.audio.wind) : 0.5;
      p.setZ(i, Math.sin(u * 5 - t * (2 + w * 3) + by * 2) * 0.09 * u * (0.4 + w)); p.setY(i, by - u * u * 0.16 * (1 - w * 0.7)); }
    p.needsUpdate = true;
  };
}

// ---------------- phone, torch, sandal ----------------
function buildSmallProps(C) {
  // phone leaning on the log next to זיפ
  const ph = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.155, 0.009), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4 }));
  const scrM = new THREE.MeshBasicMaterial({ color: 0x9fc4d8 }); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.14), scrM); scr.position.z = 0.0052; ph.add(body, scr);
  ph.position.set(1.45, heightAt(1.45, 0.75) + 0.085, 0.75); ph.rotation.set(-0.5, -2.2, 0); C.group.add(ph);
  const phl = new THREE.PointLight(0x8fb8d0, 0.35, 2.2, 2); phl.position.copy(ph.position).add(new THREE.Vector3(-0.1, 0.1, -0.1)); C.group.add(phl);
  C.phone = { obj: ph, pos: ph.position, setOn: v => { scrM.color.setHex(v ? 0x5f7a88 : 0x050505); phl.intensity = v ? 0.18 : 0; } };

  // the torch lying by the player's log
  const tg = new THREE.Group(); const tm = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.45, metalness: 0.6 });
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.17, 10), tm), b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.022, 0.05, 10), tm); b2.position.y = 0.105;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 12), new THREE.MeshBasicMaterial({ color: 0xfff0cf })); lens.rotation.x = -Math.PI / 2; lens.position.y = 0.131;
  tg.add(b1, b2, lens); tg.rotation.set(0, 0.6, Math.PI / 2); tg.position.set(0.95, heightAt(0.95, 1.75) + 0.035, 1.75); C.group.add(tg);
  const tl = new THREE.SpotLight(0xffe9c8, 9, 7, 0.4, 0.6, 1.6); tl.position.copy(tg.position); tl.position.y += 0.03;
  tl.target.position.set(tg.position.x - 3 * Math.cos(0.6), tg.position.y - 0.25, tg.position.z + 3 * Math.sin(0.6)); C.group.add(tl, tl.target);
  C.torch = { obj: tg, pos: tg.position, take: () => { tg.visible = false; tl.visible = false; } , reset: () => { tg.visible = true; tl.visible = true; } };

  // גרעין's sandal
  const sd = new THREE.Group(); const sole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.022, 0.27), new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9 }));
  const strapM = new THREE.MeshStandardMaterial({ color: 0x5e2a22, roughness: 0.8 });
  const s1 = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 5, 10, Math.PI), strapM); s1.position.set(0, 0.011, -0.05);
  const s2 = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 5, 10, Math.PI), strapM); s2.position.set(0, 0.011, 0.06);
  sd.add(sole, s1, s2); sole.castShadow = true;
  const sp = pathPoint(PATH_LEN - 19, 0.25); sd.position.set(sp.x, heightAt(sp.x, sp.z) + 0.02, sp.z); sd.rotation.set(0.06, 1.9, 0.5); sd.visible = false; C.group.add(sd);
  C.sandal = { obj: sd, pos: sd.position };
}
