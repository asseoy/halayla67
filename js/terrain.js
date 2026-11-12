// Wadi terrain: height function, ground mesh, path, colliders.
import * as THREE from 'three';
import { G, clamp, lerp, smooth, fbm, noise2 } from './ctx.js';

export const HILL = { x: 6, z: -50, r: 6.0, h: 4.2 };
export const BUSH = { x: 8.5, z: -65 };          // the player's bush
export const FIRE = { x: 0, z: 0 };
// path from the fire to the bush (around the hill on its west side)
export const PATH = [[0.5, -3.5], [-2, -12], [-6, -24], [-8.5, -38], [-7.5, -50], [-3, -60], [3, -65.5], [7.2, -66.6]];

const wadiCx = z => 3.2 * Math.sin(z * 0.021) + 1.2 * Math.sin(z * 0.05 + 1.3);
const wadiHw = z => 20 + 3.5 * Math.sin(z * 0.033 + 0.6);

export function heightAt(x, z) {
  const d = Math.abs(x - wadiCx(z)), hw = wadiHw(z);
  let h = (fbm(x * 0.06, z * 0.06, 3) - 0.5) * 1.1 + (fbm(x * 0.33, z * 0.33, 2) - 0.5) * 0.16;
  // dry stream channel meandering through the floor
  const ch = Math.abs(x - wadiCx(z) - 5 * Math.sin(z * 0.045));
  h -= 0.35 * (1 - smooth(0.5, 4, ch));
  // camp clearing: flatten
  const dc = Math.hypot(x - FIRE.x, z - FIRE.z);
  h = lerp(0, h, smooth(7, 16, dc));
  // scree slope then cliffs
  const s = smooth(hw - 3, hw + 12, d);
  h += s * s * 7;
  const c = smooth(hw + 9, hw + 22, d);
  if (c > 0) {
    let ch2 = c * 30 + fbm(x * 0.05, z * 0.05, 3) * 10 * c;
    // strata steps
    const st = 3.2; const q = Math.floor(ch2 / st) * st, f = (ch2 - q) / st;
    ch2 = q + st * smooth(0.25, 0.75, f);
    h += ch2;
  }
  // the low hill
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  h += HILL.h * Math.exp(-(dh * dh) / (2 * HILL.r * HILL.r)) * (0.85 + 0.3 * noise2(x * 0.3, z * 0.3));
  return h;
}

/** walkable? (keeps the player inside the wadi) */
export function walkable(x, z) {
  if (z < -92 || z > 34) return false;
  const d = Math.abs(x - wadiCx(z));
  return d < wadiHw(z) + 4;
}

// ---------- colliders (circles) ----------
export const colliders = [];
export function addCollider(x, z, r) { colliders.push({ x, z, r }); }
export function resolveCollide(pos, rad) {
  for (const c of colliders) {
    const dx = pos.x - c.x, dz = pos.z - c.z, rr = c.r + rad, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; pos.x += dx * k; pos.z += dz * k; }
  }
}

// ---------- path helpers ----------
const segLen = []; let pathLen = 0;
for (let i = 0; i < PATH.length - 1; i++) { const l = Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]); segLen.push(l); pathLen += l; }
export const PATH_LEN = pathLen;
/** point at distance s along the path, with optional sideways offset */
export function pathPoint(s, side = 0, out = { x: 0, z: 0, dx: 0, dz: 1 }) {
  s = clamp(s, 0, pathLen - 0.001); let i = 0;
  while (s > segLen[i]) { s -= segLen[i]; i++; }
  const a = PATH[i], b = PATH[i + 1], t = s / segLen[i];
  const dx = (b[0] - a[0]) / segLen[i], dz = (b[1] - a[1]) / segLen[i];
  out.x = lerp(a[0], b[0], t) - dz * side; out.z = lerp(a[1], b[1], t) + dx * side; out.dx = dx; out.dz = dz;
  return out;
}
/** nearest path distance for a world point */
export function pathS(x, z) {
  let best = 1e9, bs = 0, acc = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1], l = segLen[i];
    const t = clamp(((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (l * l), 0, 1);
    const px = lerp(a[0], b[0], t), pz = lerp(a[1], b[1], t), d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) { best = d; bs = acc + t * l; }
    acc += l;
  }
  return bs;
}

// ---------- textures ----------
function groundTextures() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S);
  const per = (x, y, f) => { // tileable fbm
    const u = x / S, v = y / S;
    const a = fbm(u * f, v * f, 4), b = fbm((u - 1) * f, v * f, 4), cc = fbm(u * f, (v - 1) * f, 4), dd = fbm((u - 1) * f, (v - 1) * f, 4);
    return lerp(lerp(a, b, u), lerp(cc, dd, u), v);
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = per(x, y, 9), n2 = per(x + 77, y + 31, 40);
    let peb = per(x + 200, y + 90, 70); peb = smooth(0.56, 0.7, peb);   // pebbles
    const v = 0.55 + 0.35 * n + 0.18 * (n2 - 0.5) + 0.22 * peb + (Math.random() - 0.5) * 0.07;
    hgt[y * S + x] = n * 0.6 + n2 * 0.25 + peb * 0.9;
    const i = (y * S + x) * 4;
    d[i] = clamp(v * 186, 0, 255); d[i + 1] = clamp(v * 163, 0, 255); d[i + 2] = clamp(v * 128, 0, 255); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  // normal map from height
  const c2 = document.createElement('canvas'); c2.width = c2.height = S; const g2 = c2.getContext('2d'), im2 = g2.createImageData(S, S), e = im2.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = hgt[y * S + ((x + S - 1) % S)], r = hgt[y * S + ((x + 1) % S)], u = hgt[((y + S - 1) % S) * S + x], dn = hgt[((y + 1) % S) * S + x];
    let nx = (l - r) * 2.6, ny = (u - dn) * 2.6, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
    const i = (y * S + x) * 4; e[i] = (nx * 0.5 + 0.5) * 255; e[i + 1] = (ny * 0.5 + 0.5) * 255; e[i + 2] = (nz * 0.5 + 0.5) * 255; e[i + 3] = 255;
  }
  g2.putImageData(im2, 0, 0);
  const nrm = new THREE.CanvasTexture(c2); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.anisotropy = 4;
  return { map, nrm };
}

export function buildTerrain() {
  const W = 190, D = 260, sx = 170, sz = 230;
  const geo = new THREE.PlaneGeometry(W, D, sx, sz); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -30);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z); p.setY(i, h);
    uv.setXY(i, x / 7, z / 7);
    // tint: pale gravel in the channel, warmer sand elsewhere, darker banded rock up high
    const ch = Math.abs(x - wadiCx(z) - 5 * Math.sin(z * 0.045));
    const bed = 1 - smooth(1, 6, ch);
    let r = lerp(0.80, 1.0, bed), g = lerp(0.74, 0.97, bed), b = lerp(0.62, 0.92, bed);
    const up = smooth(6, 12, h);
    if (up > 0) { const band = 0.72 + 0.28 * Math.sin(h * 1.9 + noise2(x * 0.1, z * 0.1) * 3); r = lerp(r, 0.62 * band, up); g = lerp(g, 0.5 * band, up); b = lerp(b, 0.4 * band, up); }
    const v = 0.85 + 0.3 * noise2(x * 0.15, z * 0.15);
    col[i * 3] = r * v; col[i * 3 + 1] = g * v; col[i * 3 + 2] = b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const t = groundTextures();
  const mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.nrm, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, metalness: 0, vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.name = 'terrain';
  G.scene.add(mesh);
  return mesh;
}
