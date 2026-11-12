// Post-processing: soft bloom, then one pass for film grain, vignette, fear (desaturate, chromatic split, tunnel), black flash.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from './ctx.js';

const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uFear: { value: 0 }, uGrain: { value: 0.035 }, uVig: { value: 1 }, uFlash: { value: 0 }, uRed: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uT, uFear, uGrain, uVig, uFlash, uRed; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uT*7.13) * 43758.5453); }
    void main(){
      vec2 c = vUv - .5; float r = length(c);
      // chromatic split grows with fear, toward the edges
      float ca = (0.0012 + uFear*0.006) * r;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c*ca*2.).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c*ca*2.).b;
      // fear: desaturate a little, cold tint, and pull the edges into a tunnel
      float l = dot(col, vec3(.299,.587,.114));
      col = mix(col, vec3(l)*vec3(.92,.97,1.05), uFear*.45);
      float vig = smoothstep(.85, .18 - uFear*.08, r*(1. + uFear*.35)) ;
      col *= mix(1., vig, .85*uVig);
      // grain (stronger in the dark parts)
      float g = (h(vUv*uRes) - .5) * uGrain * (1.05 - l*.5);
      col += g;
      // red pulse at the edges (heartbeat at high fear)
      col.r += uRed * smoothstep(.25,.75,r) * .12;
      col = mix(col, vec3(0.), uFlash);
      gl_FragColor = vec4(col, 1.);
    }`
};

export async function init() {
  const comp = new EffectComposer(G.renderer);
  const rp = new RenderPass(G.scene, G.camera); comp.addPass(rp);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.78); comp.addPass(bloom);
  const film = new ShaderPass(FilmShader); comp.addPass(film);
  comp.addPass(new OutputPass());
  const P = { comp, bloom, film, black: 0 };
  P.setQuality = hi => { bloom.enabled = hi; film.uniforms.uGrain.value = hi ? 0.035 : 0.028; };
  P.resize = (w, h) => { comp.setPixelRatio(G.renderer.getPixelRatio()); comp.setSize(w, h); film.uniforms.uRes.value.set(w, h); };
  /** instant black frames for `dur` seconds (used on cuts and scares) */
  P.blackout = dur => { P.black = Math.max(P.black, dur); };
  P.render = dt => {
    const u = film.uniforms; u.uT.value = (u.uT.value + dt) % 1000;
    const f = G.fear ? G.fear.value : 0; u.uFear.value = f; u.uRed.value = G.fear ? G.fear.pulse : 0;
    if (P.black > 0) { P.black -= dt; u.uFlash.value = 1; } else u.uFlash.value = 0;
    comp.render(dt);
  };
  G.post = P;
  P.resize(innerWidth, innerHeight);
}
