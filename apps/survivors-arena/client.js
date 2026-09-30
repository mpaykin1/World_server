import { ROLES, UPGRADES, hashSeed, createRun, pickUpgrade, stepRun } from '../../shared/survivors-arena-core.mjs';
import { createPainter } from './render.mjs';

const el = (id) => document.getElementById(id);
const painter = createPainter(el('arena'));
const query = new URLSearchParams(location.search);
const requestedWorld = query.get('world') || 'main';
const worldId = /^[a-z0-9_-]{1,40}$/i.test(requestedWorld) ? requestedWorld : 'main';
const world = { id: worldId, tags: [] };
let worldRevision = 1, worldConnected = false, run = null, attempts = 0;
let manualPause = false, soundOn = false, audio = null, lastSound = 0;
let effects = [], toastUntil = 0, last = performance.now(), accumulator = 0, hudAt = 0;
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set(), stick = { x: 0, y: 0 };
const touchDevice = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
const icons = { power:'⚔', haste:'⚡', salvo:'✦', aura:'◎', magnet:'◆', speed:'➤', health:'♥', chain:'↯', pulse:'◉' };

async function readCanonicalWorld() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2700);
  try {
    const response = await fetch('/api/voxel', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'macro_read', worldId }), signal: controller.signal
    });
    if (!response.ok) throw new Error('World service HTTP ' + response.status);
    const payload = await response.json();
    const entities = Array.isArray(payload?.emergence?.entities) ? payload.emergence.entities : [];
    world.tags = [...new Set(entities.map(item => item.type).filter(type => ['city','village','forest','volcano','desert'].includes(type)))].slice(0, 8);
    worldRevision = Number(payload?.emergence?.revision) || 1;
    worldConnected = true;
    el('world-name').textContent = 'WORLD SERVER · ' + worldId.toUpperCase();
    el('world-status').textContent = 'Общий мир подключён · ' + entities.length + ' объектов · версия ' + worldRevision;
  } catch {
    el('world-status').textContent = 'Автономный прототип · подключение к общему миру недоступно';
    worldConnected = false;
  } finally { clearTimeout(timeout); }
}
void readCanonicalWorld();

function say(text, duration = 1500) {
  el('toast').textContent = text;
  el('toast').classList.add('show');
  toastUntil = performance.now() + duration;
}
function sound(freq, duration = .07, type = 'sine', volume = .025) {
  if (!soundOn || !audio) return;
  const now = audio.currentTime;
  if (now - lastSound < .045) return;
  lastSound = now;
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * .68), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  osc.connect(gain); gain.connect(audio.destination);
  osc.start(now); osc.stop(now + duration + .015);
}
function addEffect(effect) {
  if (reducedMotion) return;
  effects.push({ ...effect, duration: effect.duration || .65, life: effect.duration || .65 });
  if (effects.length > 95) effects.splice(0, effects.length - 95);
}
function processEvents(events) {
  for (const event of events) {
    switch (event.type) {
      case 'kill':
        if (event.combo > 1 && event.combo % 12 === 0) say('СЕРИЯ ×' + event.combo, 950);
        if (run.kills % 3 === 0) addEffect({ type:'number', x:event.x, y:event.y, value:'✦', color:'#ffcf82', duration:.38 });
        if (run.kills % 4 === 0) sound(160, .052, 'triangle', .012);
        break;
      case 'hit':
        if (event.damage > 2.7 && Math.random() < .18) addEffect({ type:'number', x:event.x, y:event.y, value:event.damage, color:'#ffe8aa', duration:.4 });
        break;
      case 'gem': sound(480, .04, 'sine', .011); break;
      case 'fire': break;
      case 'pulse':
        addEffect({ type:'ring', x:event.x, y:event.y, radius:event.radius, color:'#7de8ec', duration:.8 });
        sound(155, .18, 'sine', .024); break;
      case 'chain':
        addEffect({ type:'arc', x:event.x, y:event.y, tx:event.tx, ty:event.ty, duration:.21 });
        break;
      case 'hurt':
        say('УКЛОНЯЙСЯ!', 750); sound(104, .15, 'sawtooth', .045);
        break;
      case 'boss': say('⚠ ПРИБЛИЖАЕТСЯ ГИГАНТ', 1900); sound(120, .4, 'sawtooth', .035); break;
      case 'boss-down':
        addEffect({ type:'ring', x:event.x, y:event.y, radius:6, color:'#e5b6ff', duration:1.1 });
        say('БОСС ПОБЕЖДЁН!', 1600); sound(880, .32, 'triangle', .035); break;
      case 'level':
        say('НОВЫЙ УРОВЕНЬ ' + event.level, 1900);
        sound(660, .25, 'triangle', .035); break;
      case 'evolution': say('ЭВОЛЮЦИЯ: РЕЗОНАНС РОЯ!', 2000); sound(1020, .35, 'sine', .042); break;
      case 'over': showEnding(); break;
    }
  }
}
function renderChoices() {
  if (!run?.paused || el('upgrade-modal').hidden === false) return;
  const options = el('upgrades'); options.replaceChildren();
  for (const id of run.choices) {
    const info = UPGRADES[id], button = document.createElement('button');
    button.type = 'button'; button.className = 'choice';
    const icon = document.createElement('span'); icon.className = 'symbol'; icon.textContent = icons[id];
    const name = document.createElement('strong'); name.textContent = info.label + ' · ' + (run.upgrades[id] + 1) + '/' + info.max;
    const hint = document.createElement('small'); hint.textContent = info.detail;
    button.append(icon, name, hint);
    button.addEventListener('click', () => choose(id));
    options.append(button);
  }
  el('upgrade-title').textContent = 'Уровень ' + run.level + ' — выбери силу';
  el('upgrade-modal').hidden = false;
  options.querySelector('button')?.focus();
}
function choose(id) {
  if (!run || !pickUpgrade(run, id)) return;
  processEvents(run.events); run.events = [];
  el('upgrade-modal').hidden = true;
  if (run.evolution) addEffect({ type:'ring', x:run.player.x, y:run.player.y, radius:6, duration:1.3 });
  hud(); accumulator = 0;
}
function showEnding() {
  if (!run) return;
  el('end-summary').textContent = 'Продержался ' + clock(run.t) + ' · ' + run.kills + ' противников · уровень ' + run.level +
    (run.evolution ? ' · открыта эволюция' : '') + '. Твой мир можно попробовать защитить иначе.';
  el('end-modal').hidden = false;
  try {
    const key = 'ws-survivors-best-' + worldId;
    localStorage.setItem(key, String(Math.max(run.kills, Number(localStorage.getItem(key)) || 0)));
  } catch { /* No storage is required for play. */ }
}
function start(role) {
  if (!ROLES[role]) return;
  const seed = hashSeed(worldId + ':' + worldRevision + ':' + role + ':' + attempts++);
  run = createRun({ seed, role, maxEnemies:touchDevice ? 90 : 190, world });
  effects = []; manualPause = false; accumulator = 0; keys.clear(); stick.x = stick.y = 0;
  el('knob').style.transform = '';
  el('role-modal').hidden = el('upgrade-modal').hidden = el('end-modal').hidden = true;
  el('pause').setAttribute('aria-pressed', 'false');
  el('pause').textContent = '⏸'; el('pause-note').classList.remove('show');
  say(ROLES[role].label + ' · ВЫЖИВАЙ!', 1550); hud();
}
function clock(t) {
  const sec = Math.floor(t);
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}
function hud() {
  if (!run) return;
  el('hp').textContent = Math.ceil(run.player.hp) + '/' + run.player.maxHp;
  el('level').textContent = String(run.level);
  el('clock').textContent = clock(run.t);
  el('kills').textContent = String(run.kills);
  el('streak').textContent = run.combo > 2 ? '×' + run.combo : '—';
  el('xp-bar').style.width = Math.max(0, Math.min(100, 100 * run.xp / run.nextXp)) + '%';
  el('hp').style.color = run.player.hp < 30 ? '#f66d74' : '#ffb4a0';
}
function pause() {
  if (!run || run.paused || run.over) return;
  manualPause = !manualPause; keys.clear(); stick.x = stick.y = 0;
  el('pause').setAttribute('aria-pressed', String(manualPause));
  el('pause').textContent = manualPause ? '▶' : '⏸';
  el('pause-note').classList.toggle('show', manualPause);
  accumulator = 0;
}
function movement() {
  const horizontal = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const vertical = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  return { x:Math.max(-1, Math.min(1, horizontal + stick.x)), y:Math.max(-1, Math.min(1, vertical + stick.y)) };
}
function frame(now) {
  const dt = Math.min(.08, Math.max(0, (now - last) / 1000));
  last = now;
  if (run && !manualPause && !run.paused && !run.over) {
    accumulator += dt; let steps = 0;
    while (accumulator >= 1 / 60 && steps < 5) {
      stepRun(run, movement(), 1 / 60);
      processEvents(run.events);
      accumulator -= 1 / 60; steps++;
      if (run.paused || run.over) { accumulator = 0; break; }
    }
    if (run.paused) renderChoices();
  } else accumulator = 0;
  for (const fx of effects) fx.life -= dt;
  effects = effects.filter(fx => fx.life > 0);
  if (now > toastUntil) el('toast').classList.remove('show');
  painter.paint(run, effects, now, reducedMotion);
  if (now - hudAt > 120) { hud(); hudAt = now; }
  requestAnimationFrame(frame);
}
for (const button of el('roles').querySelectorAll('[data-role]')) button.addEventListener('click', () => start(button.dataset.role));
el('again').addEventListener('click', () => {
  el('end-modal').hidden = true; el('role-modal').hidden = false;
});
el('pause').addEventListener('click', pause);
el('sound').addEventListener('click', () => {
  soundOn = !soundOn;
  if (soundOn) {
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); void audio.resume(); }
    catch { soundOn = false; }
  }
  el('sound').setAttribute('aria-pressed', String(soundOn));
  el('sound').textContent = soundOn ? '🔊' : '🔈';
  if (soundOn) sound(620, .09);
});
el('motion').addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  if (reducedMotion) effects.length = 0;
  el('motion').setAttribute('aria-pressed', String(reducedMotion));
  el('motion').textContent = reducedMotion ? '◯' : '✨';
});
addEventListener('keydown', (event) => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space' && !event.repeat && el('role-modal').hidden) { pause(); return; }
  if (run?.paused && ['Digit1','Digit2','Digit3'].includes(event.code)) {
    choose(run.choices[Number(event.code.at(-1)) - 1]); return;
  }
  keys.add(event.code);
}, { passive:false });
addEventListener('keyup', (event) => keys.delete(event.code));
addEventListener('blur', () => {
  keys.clear(); stick.x = stick.y = 0; el('knob').style.transform = '';
  if (run && !run.paused && !run.over && !manualPause) pause();
});
const pad = el('pad'), knob = el('knob');
let activePointer = null;
function movePointer(event) {
  if (event.pointerId !== activePointer) return;
  const box = pad.getBoundingClientRect();
  const dx = event.clientX - (box.left + box.width / 2);
  const dy = event.clientY - (box.top + box.height / 2);
  const radius = box.width * .32, factor = Math.min(1, radius / (Math.hypot(dx, dy) || 1));
  stick.x = dx * factor / radius; stick.y = dy * factor / radius;
  knob.style.transform = 'translate(' + dx * factor + 'px,' + dy * factor + 'px)';
}
pad.addEventListener('pointerdown', (event) => {
  event.preventDefault(); activePointer = event.pointerId;
  pad.setPointerCapture(event.pointerId); movePointer(event);
});
pad.addEventListener('pointermove', movePointer);
function releasePointer(event) {
  if (event.pointerId !== activePointer) return;
  activePointer = null; stick.x = stick.y = 0; knob.style.transform = '';
}
pad.addEventListener('pointerup', releasePointer);
pad.addEventListener('pointercancel', releasePointer);
addEventListener('resize', painter.resize);
window.__SURVIVORS_ARENA_READY__ = {
  ready:true, version:'poc-1',
  // Purely local fixture for the UI integration test. Cannot mutate the shared world.
  injectTestGem:() => {
    if (!run || query.get('e2e') !== '1' || !['localhost','127.0.0.1'].includes(location.hostname)) return false;
    run.gems.push({ x:run.player.x, y:run.player.y, amount:run.nextXp });
    return true;
  },
  snapshot:() => ({
    started:!!run, role:run?.role || null, worldConnected, worldId, worldRevision, time:run?.t || 0,
    sharedWorldReadOnly:true, tags:[...world.tags], canvas:painter.metrics,
    player:run ? { x:run.player.x, y:run.player.y, hp:run.player.hp } : null,
    level:run?.level || 0, kills:run?.kills || 0, enemies:run?.enemies.length || 0,
    paused:manualPause || Boolean(run?.paused), over:Boolean(run?.over)
  })
};
requestAnimationFrame(frame);
