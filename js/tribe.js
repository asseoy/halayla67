// Tribe symbols that serve the fear: a camp sign, the logo painted on a rock (later "67" in fresh red paint under it),
// and גרעין's red-black scarf hanging on a dead tree after he is gone.
import * as THREE from 'three';
import { G, noise2 } from './ctx.js';
import { heightAt, addCollider, pathPoint } from './terrain.js';

const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function weather(g, W, H, k = 0.55) {            // chipped paint: punch soft holes into what was drawn
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900 * k; i++) { g.globalAlpha = Math.random() * 0.5; const r = Math.random() * 6 + 1; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, r, 0, 7); g.fill(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

export async function buildTribe() {
  const S = G.scene, logo = await loadImg('assets/logo.webp');
  const T = { scrawled: false };

  // ---------- 1. the camp sign: a post with a painted board ----------
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#4a3726'; g.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 3) { g.fillStyle = `rgba(0,0,0,${0.05 + 0.08 * Math.abs(Math.sin(y * 0.21))})`; g.fillRect(0, y, 512, 1); }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 84, 512, 3); g.fillRect(0, 170, 512, 3);
    if (logo) { g.globalAlpha = 0.9; g.drawImage(logo, 352, 28, 150, 150 * logo.height / logo.width); g.globalAlpha = 1; }
    g.direction = 'rtl'; g.textAlign = 'right'; g.fillStyle = '#e6dcc8'; g.font = '700 58px "Frank Ruhl Libre", serif'; g.fillText('שבט הנשיא', 340, 105);
    g.fillStyle = '#b62a22'; g.font = '700 38px "Frank Ruhl Libre", serif'; g.fillText('טיול חנוכה · 67', 340, 165);
    weather(g, 512, 256, 0.35);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const q = pathPoint(5.5, 2.6), y = heightAt(q.x, q.z), grp = new THREE.Group(); grp.position.set(q.x, y, q.z);
    grp.rotation.y = Math.atan2(-q.dz, q.dx) + Math.PI / 2;      // face the path
    const wood = new THREE.MeshStandardMaterial({ color: 0x3b2b1e, roughness: 1 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), wood); post.position.y = 0.8; post.castShadow = true; grp.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.04), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), wood]);
    board.position.set(0, 1.35, 0.06); board.rotation.z = 0.04; board.castShadow = true; grp.add(board);
    S.add(grp); addCollider(q.x, q.z, 0.25);
  }

  // ---------- 2. the painted rock on the path ----------
  const rockQ = pathPoint(37, -3.4);
  const paint = (scrawl) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
    if (logo) { g.save(); g.filter = 'saturate(0.45) brightness(0.72) contrast(1.1)'; g.globalAlpha = 0.72; const w = 360, h = w * logo.height / logo.width; g.drawImage(logo, 76, 18, w, h); g.restore(); }
    weather(g, 512, 512, 0.9);
    if (scrawl) {                    // fresh red paint, dripping
      g.fillStyle = '#7d0d0a'; g.font = '900 205px "Frank Ruhl Libre", serif'; g.textAlign = 'center'; g.direction = 'ltr'; g.fillText('67', 256, 460);
      for (let i = 0; i < 14; i++) { const x = 150 + Math.random() * 220, y = 420 + Math.random() * 30, l = 20 + Math.random() * 70; g.fillRect(x, y, 4 + Math.random() * 4, l); g.beginPath(); g.arc(x + 3, y + l, 4, 0, 7); g.fill(); }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  {
    const geo = new THREE.BoxGeometry(2.6, 1.9, 1.5, 6, 5, 4), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = noise2(x * 1.7 + 4, y * 1.7 + z) - 0.5; p.setXYZ(i, x * (1 + n * 0.25), y * (1 + n * 0.2), z + (z < 0 ? n * 0.3 : n * 0.1)); }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x77695a, roughness: 1, flatShading: true }));
    const y = heightAt(rockQ.x, rockQ.z); rock.position.set(rockQ.x, y + 0.75, rockQ.z);
    rock.rotation.y = Math.atan2(-rockQ.dz, rockQ.dx) + Math.PI / 2 + Math.PI;  // front face toward the path
    rock.castShadow = rock.receiveShadow = true; S.add(rock); addCollider(rockQ.x, rockQ.z, 1.3);
    const dm = new THREE.MeshStandardMaterial({ map: paint(false), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), dm); decal.position.set(0, 0.05, 0.8); rock.add(decal);
    T.scrawl = () => { if (T.scrawled) return; T.scrawled = true; dm.map.dispose(); dm.map = paint(true); dm.needsUpdate = true; };
    T.unscrawl = () => { if (!T.scrawled) return; T.scrawled = false; dm.map.dispose(); dm.map = paint(false); dm.needsUpdate = true; };
    T.rockPos = new THREE.Vector3(rockQ.x, y + 1, rockQ.z);
  }

  // ---------- 3. a dead tree; גרעין's scarf appears on it after he is gone ----------
  {
    const q = pathPoint(23, 3.2), y = heightAt(q.x, q.z), grp = new THREE.Group(); grp.position.set(q.x, y, q.z); grp.rotation.y = 0.6;
    const bark = new THREE.MeshStandardMaterial({ color: 0x2c241d, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 2.5, 6), bark); trunk.position.y = 1.25; trunk.rotation.z = 0.08; trunk.castShadow = true; grp.add(trunk);
    [[0.6, 1.7, 0.9], [-0.5, 2.0, -0.8], [0.2, 2.3, 0.4]].forEach(([x, yy, r]) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 1.1, 5), bark); b.position.set(x * 0.5, yy, 0); b.rotation.z = r; b.castShadow = true; grp.add(b); });
    // the scarf: a red/black striped cloth strip, hanging from the left branch, moved by the wind in update()
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#0e0d0f' : '#8e1b16'; g.fillRect(0, i * 32, 64, 32); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sg = new THREE.PlaneGeometry(0.16, 0.9, 1, 10); sg.translate(0, -0.45, 0);
    const scarf = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }));
    scarf.position.set(-0.42, 2.12, 0); scarf.visible = false; scarf.castShadow = true; grp.add(scarf);
    S.add(grp); addCollider(q.x, q.z, 0.2);
    T.scarf = scarf; T.scarfBase = sg.attributes.position.array.slice();
    T.showScarf = v => { scarf.visible = v; };
    T.treePos = new THREE.Vector3(q.x, y + 1.8, q.z);
  }

  T.reset = () => { T.showScarf(false); T.unscrawl(); };
  T.update = dt => {
    if (!T.scarf.visible) return; const t = G.time, p = T.scarf.geometry.attributes.position, b = T.scarfBase;
    for (let i = 0; i < p.count; i++) { const yv = b[i * 3 + 1], k = -yv / 0.9; p.array[i * 3 + 2] = Math.sin(t * 2.6 + yv * 5) * 0.12 * k + Math.sin(t * 6.1 + yv * 11) * 0.03 * k; p.array[i * 3] = b[i * 3] + Math.sin(t * 1.7 + yv * 3) * 0.05 * k; }
    p.needsUpdate = true;
  };
  return T;
}
