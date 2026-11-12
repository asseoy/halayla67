// The flashlight: shadowed spotlight with cookie, sway, flicker, battery, volumetric cone and dust motes.
import * as THREE from 'three';
import { G, clamp, damp, noise2, hard } from './ctx.js';

function cookie() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.22, '#e8e8e8'); gr.addColorStop(0.3, '#9a9a9a'); gr.addColorStop(0.55, '#6e6e6e');
  gr.addColorStop(0.62, '#8a8a8a'); gr.addColorStop(0.72, '#505050'); gr.addColorStop(0.9, '#1c1c1c'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  // faint filament artefact, like a cheap torch
  g.globalAlpha = 0.12; g.strokeStyle = '#000'; g.lineWidth = 5; g.beginPath(); g.arc(S / 2 + 7, S / 2 - 4, 22, 0.3, 2.6); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const coneVS = `varying vec3 vP; varying vec3 vW; varying vec3 vN;
void main(){ vP=position; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`;
const coneFS = `uniform float uI; uniform float uT; uniform vec3 uCol; varying vec3 vP; varying vec3 vW; varying vec3 vN;
float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
  float along = clamp(-vP.y,0.,1.);                 // 0 at the lens, 1 at the far end
  vec3 V = normalize(cameraPosition - vW);
  float rim = abs(dot(normalize(vN),V));            // soft edges
  float a = pow(rim,1.6) * (1.-along)*(1.-along) * smoothstep(0.0,0.06,along);
  float dust = 0.55 + 0.9*n3(vW*1.7 + vec3(uT*0.12,-uT*0.07,uT*0.05)) * n3(vW*0.6 - vec3(0.,uT*0.03,0.));
  gl_FragColor = vec4(uCol * a * dust * uI, 1.);
}`;

const dustVS = `uniform vec3 uCam; uniform vec3 uLP; uniform vec3 uLD; uniform float uCos; uniform float uI; uniform float uT; uniform float uPx;
attribute float aS; varying float vA;
void main(){
  vec3 p = position; p.y += sin(uT*0.3 + aS*40.)*0.15; p.x += sin(uT*0.21 + aS*17.)*0.2;
  p = uCam + mod(p - uCam + 6.0, 12.0) - 6.0;        // wrap a 12 m box around the camera
  vec3 L = p - uLP; float d = length(L); float c = dot(L/d, uLD);
  float cone = smoothstep(uCos, uCos+0.045, c);
  vA = cone * uI * clamp(1.4/(0.35+d*d*0.09),0.,1.) * smoothstep(0.35,1.2,d) * (0.4+0.6*aS);
  vec4 mv = viewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
  gl_PointSize = uPx * (0.6+aS) / max(0.3,-mv.z);
}`;
const dustFS = `varying float vA; void main(){ vec2 q=gl_PointCoord-0.5; float a=smoothstep(0.5,0.1,length(q))*vA; if(a<0.003) discard; gl_FragColor=vec4(vec3(1.,0.93,0.8)*a,1.); }`;

export function createFlashlight() {
  const BASE = 95;
  const light = new THREE.SpotLight(0xffe9c8, 0, 55, 0.48, 0.45, 1.4);
  light.map = cookie();
  light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.camera.near = 0.3; light.shadow.camera.far = 42;
  light.shadow.bias = -0.0008; light.shadow.normalBias = 0.03;
  G.scene.add(light, light.target);
  // tiny fill so the hand-side of nearby things isn't pure black
  const spill = new THREE.PointLight(0xffe2b8, 0, 3.2, 2); G.scene.add(spill);

  // volumetric cone (unit: apex at origin, pointing -Y, length 1)
  const cg = new THREE.ConeGeometry(Math.tan(0.40), 1, 40, 1, true); cg.translate(0, -0.5, 0);
  const coneMat = new THREE.ShaderMaterial({ vertexShader: coneVS, fragmentShader: coneFS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uI: { value: 0 }, uT: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.9, 0.74) } } });
  const cone = new THREE.Mesh(cg, coneMat); cone.scale.set(13, 13, 13); cone.frustumCulled = false; cone.renderOrder = 5; G.scene.add(cone);

  // dust motes
  const N = 520, dp = new Float32Array(N * 3), ds = new Float32Array(N);
  for (let i = 0; i < N; i++) { dp[i * 3] = Math.random() * 12; dp[i * 3 + 1] = Math.random() * 12; dp[i * 3 + 2] = Math.random() * 12; ds[i] = Math.random(); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aS', new THREE.BufferAttribute(ds, 1));
  const dustMat = new THREE.ShaderMaterial({ vertexShader: dustVS, fragmentShader: dustFS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uLP: { value: new THREE.Vector3() }, uLD: { value: new THREE.Vector3() }, uCos: { value: Math.cos(0.42) }, uI: { value: 0 }, uT: { value: 0 }, uPx: { value: 9 } } });
  const dust = new THREE.Points(dg, dustMat); dust.frustumCulled = false; dust.renderOrder = 6; G.scene.add(dust);

  const F = {
    light, cone, dust, has: false, on: false, battery: 1, dead: false,
    level: 0,            // smoothed 0..1 output
    flickerT: 0, flickerAmt: 0, blackout: 0, dimTo: 1,
    dir: new THREE.Vector3(0, 0, -1), pos: new THREE.Vector3(),
    onToggle: null,
  };
  const q = new THREE.Quaternion(), off = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let init = false;

  F.toggle = () => { if (!F.has || F.dead) { F.onToggle && F.onToggle(false); return; } F.on = !F.on; F.onToggle && F.onToggle(true); };
  /** unstable light for `dur` seconds; amt 0..1 */
  F.flicker = (dur = 1.2, amt = 0.8) => { F.flickerT = Math.max(F.flickerT, dur); F.flickerAmt = amt; };
  /** hard off for `dur` seconds */
  F.black = dur => { F.blackout = Math.max(F.blackout, dur); };
  F.setQuality = hi => { light.castShadow = true; light.shadow.mapSize.set(hi ? 1024 : 512, hi ? 1024 : 512); if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; } cone.visible = hi; };

  F.update = dt => {
    const cam = G.camera, P = G.player, t = G.time;
    // the torch lags behind the view a little (hand sway) and trembles when running / afraid
    if (!init) { q.copy(cam.quaternion); init = true; }
    q.slerp(cam.quaternion, 1 - Math.exp(-13 * dt));
    const f = G.fear ? G.fear.value : 0, tr = (P.running ? 0.035 : P.moving ? 0.012 : 0.004) + f * 0.012;
    const jx = (noise2(t * 5.1, 2.2) - 0.5) * tr * 2 + Math.cos(P.bobT) * 0.012 * P.bobAmt;
    const jy = (noise2(t * 4.7, 8.8) - 0.5) * tr * 2 + Math.abs(Math.sin(P.bobT)) * -0.02 * P.bobAmt + Math.sin(t * 1.3) * 0.004;
    F.dir.set(jx, jy - 0.02, -1).normalize().applyQuaternion(q);
    off.set(0.24, -0.26, -0.15).applyQuaternion(cam.quaternion);
    F.pos.copy(cam.position).add(off);
    light.position.copy(F.pos); light.target.position.copy(F.pos).addScaledVector(F.dir, 10);
    spill.position.copy(F.pos).addScaledVector(F.dir, 0.4);

    // battery
    if (F.on && F.has && !F.dead) F.battery = Math.max(0.05, F.battery - dt / (hard() ? 520 : 700));
    // output
    let target = (F.on && F.has && !F.dead) ? 1 : 0;
    if (F.blackout > 0) { F.blackout -= dt; target = 0; }
    let k = 1;
    if (F.flickerT > 0) {
      F.flickerT -= dt;
      const n = noise2(t * 23, 4.4), n2 = noise2(t * 61, 7.1);
      k = n < 0.42 * F.flickerAmt ? 0.04 + 0.2 * n2 : (0.7 + 0.3 * n2);
    }
    // low battery: slow sag + rare dips
    const lowB = clamp((0.3 - F.battery) / 0.3, 0, 1);
    k *= 1 - lowB * (0.35 + 0.2 * Math.sin(t * 2.3)); if (lowB > 0 && noise2(t * 9, 1.1) < 0.12 * lowB) k *= 0.3;
    F.level = target === 0 ? damp(F.level, 0, 40, dt) : damp(F.level, target * k * F.dimTo, 30, dt);
    light.intensity = BASE * F.level * (0.94 + 0.06 * noise2(t * 3, 0.5));
    light.visible = F.level > 0.003; spill.intensity = 0.5 * F.level;
    // cone + dust
    cone.position.copy(F.pos); cone.quaternion.setFromUnitVectors(up.set(0, -1, 0), F.dir);
    coneMat.uniforms.uI.value = 0.13 * F.level; coneMat.uniforms.uT.value = t;
    const du = dustMat.uniforms; du.uCam.value.copy(cam.position); du.uLP.value.copy(F.pos); du.uLD.value.copy(F.dir); du.uI.value = F.level; du.uT.value = t;
    du.uPx.value = 9 * (G.renderer.getPixelRatio()) * (innerHeight / 800);
    dust.visible = F.level > 0.01;
  };
  G.flash = F; return F;
}
