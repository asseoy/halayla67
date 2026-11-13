// The opening, beat by beat. Written as one async script; waits resolve inside update() so pausing freezes the story.
import * as THREE from 'three';
import { G, hard, clamp } from './ctx.js';
import { input } from './input.js';
import { heightAt, PATH, BUSH, pathS, pathPoint, PATH_LEN } from './terrain.js';

const V = (x, z, y = null) => new THREE.Vector3(x, y === null ? heightAt(x, z) : y, z);
let run = 0;                                 // incremented on reset; old scripts stop at their next wait
const waits = [];
function wait(sec) { const id = run; return new Promise((res, rej) => waits.push({ t: G.time + sec * (hard() ? 1 : 1), res, rej, id })); }
function until(fn, every = 0) { const id = run; return new Promise((res, rej) => waits.push({ fn, res, rej, id })); }
/** until fn() or `sec` seconds pass, whichever comes first (no beat may hang on the player looking somewhere) */
function untilOr(fn, sec) { const t = G.time + sec; return until(() => fn() || G.time > t); }
const dist = (x, z) => Math.hypot(G.player.pos.x - x, G.player.pos.z - z);
const L = (s) => s * (hard() ? 1.5 : 1);     // longer silences in the strong mode

export async function init() {
  const S = { beat: -1, echo: false, pending: [] };
  const P = () => G.player, F = () => G.flash, A = () => G.audio, U = () => G.ui, W = () => G.world, PP = () => G.people;
  const camp = () => G.world.camp;

  /** a line: voice + subtitle; resolves when it ends */
  async function say(who, file, text, opts = {}) {
    const ppl = PP(), src = opts.at || (who === 'g' ? ppl.g : ppl.z);
    const d = A().say(file, src, opts) || (text.length * 0.07 + 0.8);
    (who === 'g' ? ppl.g : who === 'z' ? ppl.z : null)?.talk(d);
    U().sub(opts.mimic ? 'x' : who, text, d + 0.8, !!opts.mimic);
    await wait(d + (opts.gap ?? 0.35));
  }
  const setBeat = n => { S.beat = n; };
  // objective + a hint that appears only if you are still on it after a while
  const goal = (text, hint, after = 20) => { U().objective(text); S.hint = hint; S.hintAt = G.time + after; S.hintShown = false; };

  async function script() {
    const p = P(), f = F(), ppl = PP(), c = camp(), a = A(), u = U();
    // ---------- 0. by the fire ----------
    setBeat(0);
    c.fire.set(0.8, true); c.setTentLights(true); a.crickets = true; a.wind = 0.45; a.drone = 0; G.fear.setBase(0); G.fear.value = 0;
    W().sky.setCover(null); W().sky.darkTarget = 0;
    f.has = false; f.on = false; f.battery = 1; c.torch.reset(); W().tribe.reset(); S.sawScarf = S.sawRock = false; c.sandal.obj.visible = false; c.phone.setOn(true);
    const seat = c.seats[0]; p.setPose(seat[0], seat[1] + 0.25, p.yawTo ? Math.atan2(-(0 - seat[0]), -(0 - seat[1])) : Math.PI, -0.12);
    p.sitting = true; p.canMove = false; p.canLook = true; p.lookAt(null);
    ppl.g.show(true); ppl.z.show(true); ppl.thing.hide();
    ppl.g.place(c.seats[1][0], c.seats[1][1], Math.atan2(0 - c.seats[1][0], 0 - c.seats[1][1])); ppl.g.sit(true); ppl.g.lookAt('cam');
    ppl.z.place(c.seats[2][0], c.seats[2][1], Math.atan2(0 - c.seats[2][0], 0 - c.seats[2][1])); ppl.z.sit(true); ppl.z.lookAt(V(0, 0, 0.6));
    u.fadeIn(3.5); u.objective('');
    await wait(3.2);
    await say('g', 'g_hi', 'וואלה, האש הזאת עוד רגע נגמרת.');
    ppl.z.lookAt(ppl.g.position.clone().setY(1.4));
    await say('z', 'z_hi', 'אמרתי לכם להביא עוד עצים.');
    ppl.z.lookAt('cam');
    await say('g', 'g_tune', 'רגע, תקשיבו לשיר הזה.', { gap: 0.2 });
    S.tune = a.phoneTune(c.phone.pos);
    ppl.g.lookAt(c.phone.pos);
    await wait(7);
    ppl.g.lookAt('cam');
    await say('g', 'g_pee', 'יאללה, מי בא להשתין?');
    await say('z', 'z_ok', 'סבבה. אבל אתה מחזיק את הפנס.', { gap: 0.2 });
    // take the torch
    goal('לקחת את הפנס שליד המדורה', 'הפנס מונח על האדמה ליד המדורה. הסתכלו עליו ולחצו E.', 10);
    p.lookAt(c.torch.pos.clone(), 0.35);
    await until(() => { const near = dist(c.torch.pos.x, c.torch.pos.z) < 2.4; u.prompt(near ? 'לקחת את הפנס' : null); return near && input.usePressed; });
    u.prompt(null); c.torch.take(); f.has = true; f.on = true; p.lookAt(null); p.sitting = false; p.canMove = true; a.sting && 0;
    ppl.g.sit(false); ppl.z.sit(false); await wait(0.6);
    goal('ללכת אחרי גרעין וזיו בשביל, אל מאחורי הגבעה', 'לכו בשביל אחרי החברים עם W. אם חשוך – F מדליק את הפנס. Shift לרוץ.', 25);

    // ---------- 1. the walk ----------
    setBeat(1);
    const lane = (side, s0, s1, n = 7) => { const pts = []; for (let i = 0; i <= n; i++) { const q = pathPoint(s0 + (s1 - s0) * i / n, side); pts.push([q.x, q.z]); } return pts; };
    // they walk ahead, but wait for you if you lag behind
    let legend = false, legend2 = false, ahead = false;
    let sG = 0, sZ = 0; const goal = PATH_LEN - 3.5;
    S.leg = true;
    while (true) {
      const ps = pathS(p.pos.x, p.pos.z);
      const lead = Math.min(goal, ps + 4.5);
      if (lead > sG + 2) { sG = lead; ppl.g.walk(lane(-0.7, pathS(ppl.g.position.x, ppl.g.position.z), sG, 3), 1.3); }
      if (lead - 1.2 > sZ + 2) { sZ = lead - 1.2; ppl.z.walk(lane(0.8, pathS(ppl.z.position.x, ppl.z.position.z), sZ, 3), 1.25); }
      if (S.tune && ps > 14) { S.tune.stop(1.2); S.tune = null; }
      a.wind = 0.45 + clamp(ps / PATH_LEN, 0, 1) * 0.5;
      if (!legend && ps > 16) { legend = true; ppl.g.lookAt('cam'); await say('g', 'g_legend', 'שמעתם על הילד שהלך לאיבוד בטיול של שישים ושבע? אומרים שהוא עדיין פה.'); await say('z', 'z_legend', 'די, אחי. אל תתחיל עם השטויות שלך.'); ppl.g.lookAt(null); }
      if (legend && !ahead && ps > 34) { ahead = true; sG = Math.min(goal, ps + 12); ppl.g.walk(lane(-0.4, pathS(ppl.g.position.x, ppl.g.position.z), sG, 4), 2.6);
        await wait(2.2); ppl.g.lookAt('cam'); await say('g', 'g_mimic_src', 'יאללה, בואו. אני מחכה פה.'); }
      if (!legend2 && ps > 46) { legend2 = true; ppl.g.lookAt(V(-14, -48, 2)); await say('g', 'g_shh', 'שקט. אתם שומעים את זה?', { gap: 0.1 }); a.snapAt(V(-15, -47, 1)); G.fear.spike(0.25); await wait(1.4); ppl.g.lookAt(null); }
      if (ps > goal - 1) break;
      await wait(0.25);
    }
    // they turn away to give you privacy
    ppl.g.walk([[4.6, -63.2]], 1.2); ppl.z.walk([[5.4, -68.2]], 1.2);
    goal('ללכת אל השיח בסוף השביל ולהשתין', 'השיח הגדול נמצא בסוף השביל, ליד החברים. עמדו לידו והחזיקו E.', 15);

    // ---------- 2. the moment ----------
    setBeat(2);
    const bush = V(BUSH.x, BUSH.z, heightAt(BUSH.x, BUSH.z) + 0.5);
    await until(() => { const near = dist(BUSH.x, BUSH.z) < 2.6; u.prompt(near ? 'להחזיק E' : null, near ? 0 : null); return near && input.useHeld; });
    ppl.g.lookAt(V(2, -58, 1.5)); ppl.z.lookAt(V(2, -75, 1.5)); ppl.g.yaw = Math.PI * 0.2; ppl.z.yaw = Math.PI * 0.9;
    p.canMove = false; p.lookAt(bush, 0.9); u.objective('');
    const PEE = 4.2; let held = 0; a.pee(bush, PEE + 0.4);
    while (held < PEE) { if (input.useHeld) held += G.dt; u.prompt('להחזיק E', Math.min(1, held / PEE)); await wait(0); }
    u.prompt(null);
    // total silence: the crickets stop at once, the wind drops
    a.crickets = false; a.wind = 0.12; G.fear.setBase(0.1);
    await wait(L(3.2));
    a.snapAt(V(p.pos.x - 3, p.pos.z + 6, 1));
    G.fear.spike(0.3); await wait(1.2);
    p.lookAt(null); p.canMove = true;
    ppl.g.show(false); ppl.g.place(-40, 40);       // gone

    // ---------- 3. first crack ----------
    setBeat(3);
    ppl.z.lookAt('cam'); ppl.z.walk([[p.pos.x - 1.2, p.pos.z + 1.5]], 1.4);
    await untilOr(() => !P().sees(bush, 50), 12);       // wait until you turn around
    await wait(0.6);
    await say('z', 'z_turn', 'רגע. איפה גרעין?');
    f.flicker(1.6, 0.9); G.fear.spike(0.25);
    await say('z', 'z_joke', 'הוא סתם צוחק עלינו. גרעין! זה לא מצחיק!');
    c.fire.set(0); c.setTentLights(false); c.phone.setOn(false); W().tribe.showScarf(true); W().tribe.scrawl();   // back at camp, unseen: the fire dies, the lanterns and the phone go out
    goal('לחפש את גרעין בשביל חזרה', 'לכו בשביל חזרה לכיוון המחנה והאירו על האדמה עם הפנס.', 20);
    // the sandal lies on the path back
    const sq = pathPoint(PATH_LEN - 14, 0.6); c.sandal.obj.visible = true; c.sandal.obj.position.set(sq.x, heightAt(sq.x, sq.z) + 0.02, sq.z); c.sandal.obj.rotation.y = 0.8;
    // ziv follows you; your footsteps get an echo that stops when you stop
    S.echo = true; S.zFollow = true;
    { const sS = pathS(sq.x, sq.z), t0 = G.time; await until(() => dist(sq.x, sq.z) < 2.2 && P().sees(c.sandal.obj.position, 35) || dist(sq.x, sq.z) < 1.2 || pathS(P().pos.x, P().pos.z) < sS - 6 || G.time - t0 > 45); }
    G.fear.spike(0.35); a.sting('thump');
    await say('z', 'z_where', 'זה הסנדל שלו.');
    W().sky.setCover(0.95); W().sky.darkTarget = 0.6; G.fear.setBase(0.25);
    await wait(L(2));
    await say('z', 'z_call', 'גרעין! תענה לי!', { gap: 0.2 });
    await wait(L(2.6));
    // the wrong voice from the dark, to the left
    const lv = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), P().yaw);
    const mpos = P().pos.clone().addScaledVector(lv, 13); mpos.y += 1.2;
    a.drone = 0.6;
    await say('x', 'g_mimic_src', 'יאללה, בואו. אני מחכה פה.', { at: mpos, mimic: true, rate: 0.82, gap: 0.6 });
    G.fear.spike(0.5); f.flicker(2.2, 1); a.whisper(mpos, 2.6, 0.45);
    await wait(2.8);
    goal('לחזור למחנה, בשביל, לכיוון המדורה', 'המחנה נמצא בתחילת השביל – מאיפה שבאתם. לכו בשביל עד הסוף.', 25);

    // a glimpse on the way back (strong mode): between the trees, gone when you look again
    if (hard()) { await until(() => pathS(P().pos.x, P().pos.z) < PATH_LEN - 32);
      const gp = pathPoint(pathS(P().pos.x, P().pos.z) - 14, -7); ppl.thing.show(gp.x, gp.z); ppl.thing.step = 0.2;
      await untilOr(() => P().sees(ppl.thing.position.clone().setY(2), 22), 10); a.sting('rise'); G.fear.spike(0.4); await wait(0.5); ppl.thing.hide(); }

    // ---------- 4. the empty camp ----------
    await until(() => dist(0, 0) < 15);
    setBeat(4);
    S.zFollow = false; a.drone = 0.8;
    ppl.z.walk([[1.5, 4]], 1.3);
    await say('z', 'z_camp', 'למה הכל חשוך? איפה כולם?');
    c.phone.setOn(true); S.tune = a.phoneTune(c.phone.pos); setTimeout(() => { S.tune && S.tune.warp(); c.phone.setOn(false); }, 2600);
    u.objective('');
    await wait(L(4));
    // the silhouette between the tents, at the edge of the light
    const tp = V(-5, 9.5);
    await until(() => dist(0, 0) < 9);
    ppl.thing.show(tp.x, tp.z); ppl.thing.step = 0.12;
    await untilOr(() => P().sees(tp.clone().setY(tp.y + 2), 18) && F().level > 0.3, 14);
    a.sting('rise'); G.fear.spike(0.55); await wait(hard() ? 0.9 : 0.55); f.black(0.4); await wait(0.15); ppl.thing.hide();
    await wait(1.2);
    // separation: ziv is gone after a blackout, then screams from far away
    f.black(L(1.6)); await wait(0.4); ppl.z.show(false); await wait(L(1.4));
    const far = V(-26, 22, 3);
    await say('z', 'z_run', 'רוץ! אל תסתכל אחורה!', { at: far, gain: 1.6, gap: 0.6 });
    await say('z', 'z_scream', 'לא! לא!', { at: far, gain: 1.8, gap: 0 });
    S.tune && S.tune.stop(0.1); S.tune = null;
    G.fear.setBase(0.5); goal('לברוח! לרוץ ולא להסתכל אחורה', 'החזיקו Shift ו־W כדי לרוץ.', 6);
    await wait(L(5));
    // the final scare: when you turn around, it is right there
    const before = P().yaw, t0 = G.time;
    await until(() => Math.abs(((P().yaw - before + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.6 || G.time - t0 > 12);
    const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), P().yaw);
    const fp = P().pos.clone().addScaledVector(fwd, 1.9);
    ppl.thing.show(fp.x, fp.z); ppl.thing.lean(0.42); ppl.thing.step = 0.05; f.blackout = 0; f.flickerT = 0; f.on = true; f.dead = false;
    { const hp = P().pos.clone().addScaledVector(fwd, 0.85); hp.y = P().pos.y + 2.45; p.canMove = false; p.lookAt(hp, 3); }
    a.sting('hit'); G.fear.spike(1); P().shake = 1.2; f.flicker(0.6, 1);
    await wait(0.75);
    G.post && G.post.blackout(0.3); f.black(5); u.fadeOut(0.25); u.objective(''); u.clearSubs();
    a.crickets = false; a.wind = 0.3; a.drone = 0;
    await wait(2.5);
    u.card('הלילה רק התחיל...', 'הלילה של ה־67', true);
    await wait(7);
    u.card(''); await wait(1.5);
    u.toMenu();
  }

  S.start = () => { if (!S.compiled) { S.compiled = true; const th = G.people.thing; th.obj.visible = true; G.renderer.compile(G.scene, G.camera); th.obj.visible = false; }
    S.reset(); S.lastT = G.time; script().catch(e => { if (e !== 'reset') console.error(e); }); };
  S.reset = () => { run++; waits.splice(0).forEach(w => w.rej('reset')); S.echo = false; S.zFollow = false; S.tune && S.tune.stop(); S.tune = null; S.hint = null; G.ui && (G.ui.prompt(null), G.ui.objective('')); };
  S.update = dt => {
    if (S.hint && !S.hintShown && G.time > S.hintAt && G.ui && document.getElementById('objective').classList.contains('show')) { S.hintShown = true; G.ui.hint(S.hint); }
    S.lastT = S.lastT || G.time;
    for (let i = waits.length - 1; i >= 0; i--) { const w = waits[i]; if (w.id !== run) { waits.splice(i, 1); continue; }
      if (w.fn ? w.fn() : G.time >= w.t) { waits.splice(i, 1); w.res(); } }
    // tribe moments after גרעין is gone (never block the story)
    if (S.beat >= 3 && G.world && G.world.tribe) { const T = G.world.tribe, p = G.player;
      if (!S.sawScarf && p.pos.distanceTo(T.treePos) < 7 && p.sees(T.treePos, 25)) { S.sawScarf = true; G.fear.spike(0.35); G.audio.sting('thump'); G.audio.wind = 0.9; setTimeout(() => { if (G.audio) G.audio.wind = 0.3; }, 2500); }
      if (!S.sawRock && p.pos.distanceTo(T.rockPos) < 6 && p.sees(T.rockPos, 25) && G.flash.level > 0.3) { S.sawRock = true; G.fear.spike(0.4); G.audio.whisper(T.rockPos.clone().add(new THREE.Vector3(0, 0, -3)), 1.8, 0.4); } }
    // ziv sticks close behind you after גרעין is gone
    const z = G.people.z;
    if (S.zFollow && z.visible) { const p = G.player, back = new THREE.Vector3(0.9, 0, 1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw).add(p.pos);
      if (Math.hypot(z.position.x - back.x, z.position.z - back.z) > 1.2 && z.arrived()) z.walk([[back.x, back.z]], p.running ? 4 : 1.6); z.lookAt('cam'); }
  };
  // the echo: footsteps a few metres behind you, half a beat late; they stop when you stop
  G.player.onStep = (runFlag) => { G.audio && G.audio.step(runFlag);
    if (S.echo) { const p = G.player, back = new THREE.Vector3(0, 0, 7).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw).add(p.pos); back.y += 0.3;
      setTimeout(() => G.audio.step(false, back, 0.9), 240); } };
  G.story = S;
  if (G.dev) window.__h = Object.assign(window.__h || {}, { G, story: S, input, waits,
    beat: async n => { /* jump: restart and fast-forward through waits */ S.start(); G.timeScale = 12; await until(() => S.beat >= n); G.timeScale = 1; },
    tp: (x, z) => G.player.setPose(x, z, G.player.yaw), fear: v => { G.fear.value = G.fear.target = v; } });
}
