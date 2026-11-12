// Night sky dome: stars, moon, drifting clouds. Drives moonlight + ambient.
import * as THREE from 'three';
import { G, clamp, damp, noise2, smooth, hard } from './ctx.js';

export const MOON_DIR = new THREE.Vector3(-0.50, 0.50, -0.70).normalize();

const VS = `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.); gl_Position = p.xyww; }`;
const FS = `
uniform float uT; uniform float uCover; uniform vec3 uMoon; uniform vec3 uFog; uniform float uDark;
varying vec3 vD;
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n2(p);p=p*2.03+vec2(17.,9.);a*=.5;}return s;}
float stars(vec3 d, float sc, float th){
  vec3 p=d*sc; vec3 c=floor(p); float r=h3(c);
  if(r<th) return 0.;
  vec3 o=vec3(h3(c+1.3),h3(c+2.7),h3(c+4.1));
  float dist=length(p-(c+0.2+0.6*o));
  float b=(r-th)/(1.-th);
  float tw=0.75+0.25*sin(uT*(1.5+4.*o.x)+o.y*40.);
  return smoothstep(0.22,0.0,dist)*(0.25+0.75*b*b)*tw;
}
void main(){
  vec3 d=normalize(vD);
  float up=smoothstep(-0.06,0.55,d.y);
  vec3 col=mix(uFog, vec3(0.010,0.016,0.034), up);
  float md=dot(d,uMoon);
  // clouds
  vec2 uv=d.xz/(max(d.y,0.0)+0.22)*0.9 + vec2(uT*0.006,uT*0.0035);
  float dens=fbm(uv*1.4);
  float nearMoon=smoothstep(0.90,0.995,md);
  float cov=smoothstep(0.52,0.80,dens + uCover*nearMoon*0.55 + uCover*0.10);
  cov*=smoothstep(-0.02,0.12,d.y);
  // stars
  float st=stars(d,90.,0.90)+stars(d,170.,0.93)*0.6;
  col+=vec3(0.80,0.86,1.0)*st*(1.-cov)*smoothstep(0.0,0.25,d.y)*(1.-0.5*uDark);
  // moon disc + halo
  float vis=1.-uCover;
  float disc=smoothstep(0.99935,0.99965,md);
  float crater=0.78+0.22*n2(d.xy*260.)-0.25*smoothstep(0.55,0.75,n2(d.zy*120.+3.));
  col+=vec3(0.95,0.93,0.86)*disc*crater*(1.-cov*0.97)*1.5;
  float halo=pow(max(md,0.),90.)*0.20+pow(max(md,0.),900.)*0.5;
  col+=vec3(0.55,0.62,0.78)*halo*(0.25+0.75*vis);
  // cloud body: dark, silver-lined near the moon
  vec3 cc=vec3(0.012,0.016,0.026)+vec3(0.20,0.23,0.30)*pow(max(md,0.),14.)*(0.35+0.65*vis)*(0.5+dens);
  col=mix(col,cc,cov*0.92);
  col*=1.-0.6*uDark;
  gl_FragColor=vec4(col,1.);
}`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    uniforms: { uT: { value: 0 }, uCover: { value: 0 }, uMoon: { value: MOON_DIR }, uFog: { value: new THREE.Color(0x04060a) }, uDark: { value: 0 } } });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat); dome.frustumCulled = false; dome.renderOrder = -10; G.scene.add(dome);

  const moon = new THREE.DirectionalLight(0x7f95c4, 0); moon.position.copy(MOON_DIR).multiplyScalar(100); G.scene.add(moon);
  const hemi = new THREE.HemisphereLight(0x2c3a5c, 0x0b0a09, 0); G.scene.add(hemi);

  const S = { cover: 0.2, force: null, dark: 0, darkTarget: 0, moonVis: 1, mat };
  /** force cloud cover (0..1) or null for natural drift */
  S.setCover = v => { S.force = v; };
  S.update = dt => {
    const t = G.time; mat.uniforms.uT.value = t;
    // natural: the moon keeps slipping behind clouds
    const nat = smooth(0.42, 0.62, noise2(t * 0.045, 7.7) * 0.7 + noise2(t * 0.013, 2.2) * 0.45);
    const target = S.force !== null ? S.force : nat;
    S.cover = damp(S.cover, target, 0.5, dt);
    S.dark = damp(S.dark, S.darkTarget, 0.6, dt);
    S.moonVis = 1 - S.cover;
    mat.uniforms.uCover.value = S.cover; mat.uniforms.uDark.value = S.dark;
    const base = hard() ? 0.75 : 1;
    moon.intensity = (0.10 + 0.62 * S.moonVis) * base * (1 - 0.7 * S.dark);
    hemi.intensity = (0.55 + 0.55 * S.moonVis) * base * (1 - 0.6 * S.dark);
  };
  return S;
}
