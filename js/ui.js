// Screens (warning, menu, pause), settings, subtitles, objective line, interaction prompt, fades and title cards.
import { G, saveSettings, clamp, damp } from './ctx.js';
import { lock, unlock, input } from './input.js';

const $ = id => document.getElementById(id);
export async function init() {
  const U = { fade: 1, fadeTo: 1, fadeRate: 1, subs: [], prompting: false };
  const show = (id, v) => $(id).classList.toggle('hidden', !v);
  const segs = () => {
    document.querySelectorAll('[data-int]').forEach(b => b.classList.toggle('on', +b.dataset.int === G.settings.intensity));
    document.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', +b.dataset.q === G.settings.quality));
    document.querySelectorAll('[data-sub]').forEach(b => b.classList.toggle('on', +b.dataset.sub === G.settings.subs));
    $('sVol').value = G.settings.volume; $('sSens').value = G.settings.sens;
  };
  document.querySelectorAll('[data-int]').forEach(b => b.onclick = () => { G.settings.intensity = +b.dataset.int; saveSettings(); segs(); });
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { G.settings.quality = +b.dataset.q; saveSettings(); segs(); G.applyQuality && G.applyQuality(); });
  document.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { G.settings.subs = +b.dataset.sub; saveSettings(); segs(); });
  $('sVol').oninput = e => { G.settings.volume = +e.target.value; saveSettings(); G.audio && G.audio.setVolume && G.audio.setVolume(G.settings.volume); };
  $('sSens').oninput = e => { G.settings.sens = +e.target.value; saveSettings(); };
  segs();

  // warning -> menu
  $('warnOk').onclick = () => { show('warn', false); show('menu', true); $('btnStart').focus(); };
  $('loadMsg').textContent = '';
  $('btnSettings').onclick = () => { show('menu', false); show('pause', true); $('pauseTitle').textContent = 'הגדרות'; $('btnResume').textContent = 'חזרה'; U.settingsFromMenu = true; };
  $('btnStart').onclick = () => {
    if (!U.howSeen) { show('menu', false); show('howto', true); $('howOk').onclick = () => { U.howSeen = true; show('howto', false); $('btnStart').onclick(); }; return; }
    G.audio && G.audio.start && G.audio.start();
    show('menu', false); show('hud', true); if (G.touch) show('touch', true);
    G.running = true; G.paused = false; lock();
    G.story && G.story.start();
  };
  $('btnResume').onclick = () => { if (U.settingsFromMenu) { U.settingsFromMenu = false; show('pause', false); show('menu', true); $('pauseTitle').textContent = 'הפסקה'; $('btnResume').textContent = 'המשך'; return; } U.pause(false); };
  $('btnQuit').onclick = () => { U.toMenu(); };
  U.pause = v => {
    if (!G.running) return; G.paused = v; show('pause', v); $('pauseTitle').textContent = 'הפסקה'; $('btnResume').textContent = 'המשך';
    G.audio && G.audio.setPaused && G.audio.setPaused(v);
    if (v) { unlock(); } else { lock(); }
  };
  U.toMenu = () => { G.running = false; G.paused = false; unlock(); show('pause', false); show('hud', false); show('touch', false); show('menu', true); U.card(''); G.story && G.story.reset && G.story.reset(); U.fadeTo = 1; };
  // menu: a slow look across the wadi while waiting
  G.menuTick = dt => { G.time += dt * 0.6; const t = G.time; G.camera.position.set(Math.sin(t * 0.05) * 3, 2.4, 9); G.camera.rotation.set(-0.08, Math.sin(t * 0.04) * 0.15, 0); G.world && G.world.update(dt); };

  // ---------- subtitles ----------
  /** who: 'g' | 'z' | 'x' (the wrong voice) | '' ; dur in seconds */
  U.sub = (who, text, dur = 3, wrong = false) => {
    if (!G.settings.subs) return; const box = $('subs'), ln = document.createElement('span'); ln.className = 'ln';
    const names = { g: 'גרעין', z: 'זיפ', x: 'גרעין' };
    ln.innerHTML = (who ? `<span class="who ${who}">${names[who]}:</span>` : '') + `<span class="txt${wrong ? ' wrong' : ''}">${text}</span>`;
    box.appendChild(ln); while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => { ln.style.transition = 'opacity .6s'; ln.style.opacity = 0; setTimeout(() => ln.remove(), 700); }, dur * 1000);
  };
  U.note = (text, dur = 3) => { if (!G.settings.subs) return; const box = $('subs'), ln = document.createElement('span'); ln.className = 'ln note'; ln.textContent = text; box.appendChild(ln); setTimeout(() => ln.remove(), dur * 1000); };
  U.clearSubs = () => { $('subs').innerHTML = ''; };
  U.objective = text => { const o = $('objective'); $('objHint').classList.remove('show'); if (!text) { o.classList.remove('show'); return; } $('objText').textContent = text; o.classList.add('show'); };
  U.hint = text => { const h = $('objHint'); if (!text) { h.classList.remove('show'); return; } h.textContent = text; h.classList.add('show'); };
  /** interaction prompt; hold = progress 0..1 or null */
  U.prompt = (text, hold = null) => { const p = $('prompt'); if (!text) { p.classList.add('hidden'); return; } p.classList.remove('hidden'); $('promptText').textContent = text;
    $('holdBar').style.display = hold === null ? 'none' : 'block'; if (hold !== null) $('holdBar').firstElementChild.style.width = (hold * 100) + '%'; };
  U.fadeOut = (dur = 1.5) => { U.fadeTo = 1; U.fadeRate = 1 / dur; };
  U.fadeIn = (dur = 2) => { U.fadeTo = 0; U.fadeRate = 1 / dur; };
  U.card = (text, small = '', logo = false) => { const c = $('cardText'); if (!text) { c.classList.remove('show'); return; } show('card', true); c.innerHTML = (logo ? '<img class="cardLogo" src="assets/logo.webp" alt="">' : '') + text + (small ? `<small>${small}</small>` : ''); requestAnimationFrame(() => c.classList.add('show')); };
  U.update = dt => {
    if (U.fade !== U.fadeTo) { const s = Math.sign(U.fadeTo - U.fade); U.fade = clamp(U.fade + s * U.fadeRate * dt, 0, 1); if ((s > 0 && U.fade >= U.fadeTo) || (s < 0 && U.fade <= U.fadeTo)) U.fade = U.fadeTo; }
    $('fade').style.opacity = G.running ? U.fade : 0;
    const b = $('battery'); if (G.flash) { b.firstElementChild.style.width = (G.flash.battery * 100) + '%'; b.classList.toggle('low', G.flash.battery < 0.25); b.style.display = G.flash.has ? '' : 'none'; }
  };
  G.ui = U;
  window.__ready = true;
}
