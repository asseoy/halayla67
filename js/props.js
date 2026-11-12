// Instanced desert props: rocks, acacia trees, shrubs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, rng, noise2, lerp } from './ctx.js';
import { heightAt, addCollider, pathS, pathPoint, BUSH, HILL } from './terrain.js';

const R = rng(6767);
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3();

function rockGeo(seed) {
  let g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V.fromBufferAttribute(p, i);
    const n = noise2(V.x * 1.3 + seed, V.y * 1.3 + V.z * 0.9) * 0.55 + noise2(V.x * 3.1 + seed, V.z * 3.1 + V.y) * 0.2;
    V.multiplyScalar(0.62 + n); V.y *= 0.62; if (V.y < -0.25) V.y = -0.25 - (V.y + 0.25) * 0.2;
    p.setXYZ(i, V.x, V.y, V.z);
  }
  g = g.toNonIndexed(); g.computeVertexNormals(); return g;
}

function distToPath(x, z) { const s = pathS(x, z), q = pathPoint(s); return Math.hypot(x - q.x, z - q.z); }

function buildRocks() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x7d6f5c, roughness: 1, flatShading: true });
  const sets = [0, 1].map(k => ({ geo: rockGeo(k * 13.7), list: [] }));
  const put = (x, z, s, k) => {
    const y = heightAt(x, z) - s * 0.08; E.set((R() - 0.5) * 0.5, R() * 6.28, (R() - 0.5) * 0.5); Q.setFromEuler(E);
    SC.set(s * (0.8 + R() * 0.5), s * (0.6 + R() * 0.6), s * (0.8 + R() * 0.5));
    sets[k].list.push(new THREE.Matrix4().compose(V.set(x, y, z), Q, SC));
    if (s > 0.55) addCollider(x, z, s * 0.78);
  };
  let n = 0, guard = 0;
  while (n < 420 && guard++ < 5000) {
    const x = (R() - 0.5) * 70, z = -100 + R() * 140;
    const big = R() < 0.1, s = big ? 0.8 + R() * 1.6 : 0.1 + R() * R() * 0.5;
    const dc = Math.hypot(x, z); if (dc < (big ? 14 : 3.2)) continue;
    const dp = distToPath(x, z); if (dp < (big ? 3.2 : s > 0.3 ? 1.4 : 0.5)) continue;
    if (Math.hypot(x - BUSH.x, z - BUSH.z) < 2.2) continue;
    if (big && Math.abs(x) < 12 && R() < 0.6) continue;         // keep boulders mostly near the walls
    put(x, z, s, n & 1); n++;
  }
  // hand-placed: the rocks the friends go behind, and two framing the path
  put(-9.5, -63, 1.5, 0); put(-10.6, -61.6, 0.9, 1); put(13.5, -60.5, 1.3, 1); put(-12, -30, 1.9, 0); put(-2.5, -45, 1.1, 1);
  for (const s of sets) {
    const im = new THREE.InstancedMesh(s.geo, mat, s.list.length);
    s.list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; G.scene.add(im);
  }
}

function acaciaGeo(seed) {
  const r = rng(seed), trunk = [], leaf = [];
  const limb = (x0, y0, z0, x1, y1, z1, r0, r1) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1); g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())); g.translate(x0, y0, z0); trunk.push(g);
  };
  const lean = (r() - 0.5) * 0.9, lz = (r() - 0.5) * 0.6;
  limb(0, -0.3, 0, lean * 0.5, 1.5, lz * 0.5, 0.2, 0.15);
  const tips = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + r() * 0.8, rad = 1.2 + r() * 1.3, x = lean * 0.5 + Math.cos(a) * rad, z = lz * 0.5 + Math.sin(a) * rad, y = 2.9 + r() * 0.7;
    limb(lean * 0.5, 1.45, lz * 0.5, x, y, z, 0.11, 0.045); tips.push([x, y, z]);
  }
  tips.push([lean * 0.5, 3.4, lz * 0.5]);
  for (const t of tips) {
    let g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { V.fromBufferAttribute(p, i).multiplyScalar(0.75 + noise2(V.x * 2 + seed, V.z * 2 + V.y) * 0.6); p.setXYZ(i, V.x, V.y, V.z); }
    g.scale(1.5 + r() * 0.7, 0.28 + r() * 0.12, 1.5 + r() * 0.7); g.translate(t[0], t[1] + 0.15, t[2]); g = g.toNonIndexed(); g.computeVertexNormals(); leaf.push(g);
  }
  const tg = mergeGeometries(trunk.map(g => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; }));
  return { trunk: tg, leaf: mergeGeometries(leaf) };
}

function buildTrees() {
  const spots = [[-13, 9, 1.15], [12.5, -9, 1.0], [-15, -19, 1.25], [14, -34, 0.95], [-14.5, -47, 1.1], [15.5, -71, 1.2], [-9, -78, 1.0], [10, 22, 1.1], [-17, 26, 0.9], [2, -84, 1.3]];
  const tm = new THREE.MeshStandardMaterial({ color: 0x4b3d30, roughness: 1, flatShading: true });
  const lm = new THREE.MeshStandardMaterial({ color: 0x353d27, roughness: 1, flatShading: true });
  [11, 29].forEach((seed, k) => {
    const g = acaciaGeo(seed), mine = spots.filter((_, i) => i % 2 === k);
    const a = new THREE.InstancedMesh(g.trunk, tm, mine.length), b = new THREE.InstancedMesh(g.leaf, lm, mine.length);
    mine.forEach((s, i) => { Q.setFromEuler(E.set(0, R() * 6.28, 0)); M.compose(V.set(s[0], heightAt(s[0], s[1]), s[1]), Q, SC.setScalar(s[2])); a.setMatrixAt(i, M); b.setMatrixAt(i, M); addCollider(s[0], s[1], 0.35); });
    for (const m of [a, b]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; G.scene.add(m); }
  });
}

function shrubTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const r = rng(5);
  g.lineCap = 'round';
  const branch = (x, y, a, len, w, depth) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.strokeStyle = depth > 2 ? `rgb(${95 + r() * 40},${100 + r() * 45},${70 + r() * 25})` : `rgb(${92 + r() * 25},${78 + r() * 20},${60 + r() * 15})`;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (depth < 5) { const n = depth < 2 ? 3 : 2; for (let i = 0; i < n; i++) branch(x2, y2, a + (r() - 0.5) * 1.1, len * (0.62 + r() * 0.25), Math.max(1.4, w * 0.72), depth + 1); }
    if (depth >= 3) for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${105 + r() * 40},${115 + r() * 45},${78 + r() * 25},1)`; g.beginPath(); g.ellipse(x2 + (r() - 0.5) * 14, y2 + (r() - 0.5) * 14, 2.5 + r() * 3, 1.5 + r() * 1.5, r() * 3, 0, 6.3); g.fill(); }
  };
  for (let i = 0; i < 7; i++) branch(S / 2 + (r() - 0.5) * 30, S - 2, -Math.PI / 2 + (i - 3) * 0.3 + (r() - 0.5) * 0.2, 46 + r() * 22, 5, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const shrubSpots = [];
function buildShrubs() {
  const parts = []; for (let i = 0; i < 4; i++) { const g = new THREE.PlaneGeometry(1.5, 1.2); g.translate(0, 0.58, 0); g.rotateY(i * Math.PI / 4 + 0.2); parts.push(g); }
  const geo = mergeGeometries(parts);
  // normals pointing up-ish so both faces catch the torch evenly
  const nrm = geo.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, nrm.getX(i) * 0.4, 0.9, nrm.getZ(i) * 0.4);
  const mat = new THREE.MeshStandardMaterial({ map: shrubTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xbdb7a6 });
  const list = [];
  const put = (x, z, s) => { Q.setFromEuler(E.set(0, R() * 6.28, 0)); list.push(new THREE.Matrix4().compose(V.set(x, heightAt(x, z) - 0.05, z), Q, SC.set(s, s * (0.8 + R() * 0.4), s))); shrubSpots.push({ x, z, s }); };
  put(BUSH.x, BUSH.z, 1.75); put(BUSH.x + 0.9, BUSH.z - 0.7, 1.2); put(BUSH.x - 0.8, BUSH.z - 0.9, 1.0);
  put(-9.2, -64.6, 1.4); put(14.2, -62, 1.3);
  let n = 0, guard = 0;
  while (n < 90 && guard++ < 3000) {
    const x = (R() - 0.5) * 56, z = -98 + R() * 134; if (Math.hypot(x, z) < 11) continue; if (distToPath(x, z) < 1.8) continue;
    if (Math.hypot(x - BUSH.x, z - BUSH.z) < 4) continue;
    put(x, z, 0.5 + R() * 0.9); n++;
  }
  const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; G.scene.add(im);
  addCollider(BUSH.x, BUSH.z, 0.8);
}

export function buildProps() { buildRocks(); buildTrees(); buildShrubs(); }
