/* -----------------------------------------------------------------------------
   21 · Flow: title → play ⇄ pause → victory / defeat
----------------------------------------------------------------------------- */
const bestKey = () => (G.biome === DEFAULT_BIOME ? `isle.best.${G.seed}` : `isle.best.${G.biome}.${G.seed}`);
function readBest() { try { const v = parseFloat(localStorage.getItem(bestKey())); return Number.isFinite(v) ? v : null; } catch (e) { return null; } }
function buildWorld(seed, biomeId = G.biome) {
  if (!REG.biomes.has(biomeId)) biomeId = DEFAULT_BIOME;
  G.seed = seed; G.biome = biomeId;
  const biome = REG.biomes.get(biomeId);
  world = generateWorld(seed, biomeId);
  biomePalettes(biome);
  setLeafColors(biome.leafColors);
  buildChunks();
  if (heightTex) heightTex.dispose();
  heightTex = makeHeightTexture(world);
  waterU.uHeight.value = heightTex;
  for (const m of mists) m.material.uniforms.uHeight.value = heightTex;
  buildPickups();
  placeFlies();
  flame.position.copy(world.beacon);
  beaconLight.position.copy(world.beacon).add(tmpA.set(0, 0.9, 0));
  ring.position.copy(world.ring).add(tmpA.set(0, 0.04, 0));
  lbeams.position.copy(world.beacon).add(tmpA.set(0, 0.7, 0));
  G.sunAz = Math.atan2(world.beacon.z - world.spawn.z, world.beacon.x - world.spawn.x) + 0.9;
  moonDir.set(Math.cos(0.75) * Math.cos(G.sunAz + 2.3), Math.sin(0.75), Math.cos(0.75) * Math.sin(G.sunAz + 2.3)).normalize();
  G.total = world.coins.length;
  hud.coinT.textContent = `/ ${G.total}`;
  drawMinimapBase();
  G.best = readBest();
}
function resetRun() {
  player.pos.copy(world.spawn); player.vis.copy(world.spawn); player.safe.copy(world.spawn); player.vel.set(0, 0, 0);
  buildRelics();                     // first: the hero's stats are computed with the (now empty) relic list
  applyHero();
  Object.assign(player, { hp: player.maxHp, invuln: 0, respawn: 0, step: 0, sq: 0, sqV: 0, facing: 1, onGround: false, jumpBuf: 0, frame: 4, lean: 0 });
  coins.forEach((c, i) => { const s = world.coins[i]; Object.assign(c, { x: s.x, y: s.y + 0.62, z: s.z, alive: true, t: 1 }); });
  heartsP.forEach((h, i) => { const s = world.hearts[i]; Object.assign(h, { x: s.x, y: s.y + 0.6, z: s.z, alive: true, t: 1 }); });
  syncPickups(coins, coinObj); syncPickups(heartsP, heartObj);
  player.look.set(world.beacon.x - world.spawn.x, 0, world.beacon.z - world.spawn.z).normalize();
  foes = [];
  Object.assign(G, { collected: 0, hits: 0, play: 0, todT: 0.04, tod: 0.04, dawn: 0, all: false, firstShade: false, warnedWater: false, endT: 0, timeScale: 1,
    desat: 0, danger: 0, dangerT: 0, hurt: 0, idle: 0, combo: 0, comboT: 0, newBest: false,
    hitstop: 0, kills: 0, spawnT: 2, wardenSpawned: false, wardenDown: false, warden: null, wardenT: 1.5, hintLoot: false, bossCam: 0 });
  resetCombat();
  buildLoot();
  buildNPCs(); eventsReset(); hudRelics();
  G.regenT = 0;
  releaseAll();
  beacon.level = 0.08; beacon.flare = 0; beacon.beam = 0;
  glow.clear(); dust.clear();
  wisp.pos.set(world.spawn.x, world.spawn.y + 2, world.spawn.z);
  updateHearts(false); setCoinsHud(false);
  hud.timer.textContent = '0:00';
  emit('run');
}
function startGame() {
  if (G.state !== 'title') return;
  SFX.init(); SFX.ui();
  $('scrTitle').hidden = true;
  hud.root.hidden = false;
  $('touch').hidden = !IS_TOUCH;
  G.state = 'play';
  rig.blend = 0;
  rig.yawT = rig.yaw = Math.atan2(world.spawn.x - world.beacon.x, world.spawn.z - world.beacon.z);
  rig.pitchT = rig.pitch = 0.62; rig.distT = rig.dist = rig.eff = 11; rig.spin = rig.pspin = 0;
  toast(`Собери ${G.total} монет и зажги маяк`, 3600, false, 2);
  canvas.focus();
}
function stopBeam() { if (combat.beam.on) { combat.beam.on = false; combat.beam.segs.length = 0; } SFX.beam(false); }
function setPaused(on) {
  if (on && G.state === 'play') {
    G.state = 'paused'; releaseAll(); stopBeam(); renderArsenal();
    hud.toast.classList.remove('show'); G.toastT = 0;
    $('scrPause').hidden = false; $('btnResume').focus(); SFX.ui();
  } else if (!on && G.state === 'paused') { G.state = 'play'; releaseAll(); $('scrPause').hidden = true; canvas.focus(); }
}
function win() {
  if (G.state !== 'play') return;
  G.state = 'victory'; G.endT = 0; rig.blend = 0;
  rig.vicA = Math.atan2(rig.pos.x - world.beacon.x, rig.pos.z - world.beacon.z);
  beacon.flare = 1.2; G.flash = 0.6; FX.uFlashColor.value.setRGB(1, 0.92, 0.75);
  SFX.ignite(); stopBeam(); releaseAll();
  for (const f of foes) if (f.state !== 'dissolve') { f.state = 'dissolve'; f.hp = 0; }
  for (let i = projs.length - 1; i >= 0; i--) if (projs[i].team === 1) projs.splice(i, 1);
  const b = world.beacon;
  for (let k = 0; k < 60; k++) glow.emit(b.x, b.y + 0.5, b.z, rr(-4, 4), rr(2, 7), rr(-4, 4), rr(0.8, 1.6), 0.18, 0.04, k % 2 ? C.gold : C.ember, 1, 4, 0.8, 2);
  $('touch').hidden = true;
  if (G.best === null || G.play < G.best) { G.best = G.play; G.newBest = true; try { localStorage.setItem(bestKey(), String(G.play)); } catch (e) { /* storage may be blocked */ } }
  emit('win');
}
function die() {
  if (G.state !== 'play') return;
  G.state = 'dead'; G.endT = 0;
  SFX.die(); stopBeam(); releaseAll();
  $('touch').hidden = true;
  emit('die');
}
function showEnd(won) {
  $('endTitle').textContent = won ? 'Маяк зажжён' : 'Ночь победила';
  $('endTitle').classList.toggle('lost', !won);
  $('endLede').textContent = won
    ? (G.newBest ? 'Новый рекорд этого острова.' : 'Тени растаяли в рассвете.')
    : (G.all ? 'Страж маяка оказался сильнее. Найди оружие помощнее.' : `Тени настигли тебя. Собрано ${G.collected} из ${G.total}.`);
  const found = `${combat.arsenal.length - 1}/${ARSENAL_ORDER.length - 1}`;
  const stats = won
    ? [[fmtTime(G.play), 'время'], [String(G.kills), 'врагов'], [found, 'оружие'], [G.best !== null ? fmtTime(G.best) : '—', 'рекорд']]
    : [[`${G.collected}/${G.total}`, 'монеты'], [String(G.kills), 'врагов'], [fmtTime(G.play), 'время']];
  const box = $('endStats');
  box.replaceChildren(...stats.map(([v, l]) => {
    const d = document.createElement('div'); d.className = 'stat';
    const bv = document.createElement('b'); bv.textContent = v;
    const sl = document.createElement('span'); sl.textContent = l;
    d.append(bv, sl); return d;
  }));
  $('scrEnd').hidden = false;
  $('btnAgain').focus();
}
function restart(newIsland) {
  $('scrEnd').hidden = true; $('scrPause').hidden = true;
  buildWorld(newIsland ? (Math.random() * 1e9) | 0 : G.seed);     // always rebuild: felled trees and blasted leaves grow back
  resetRun();
  G.fade = 0; G.state = 'title';
  startGame();
}
function updateFlow(dt) {
  if (G.state === 'dead') {
    G.endT += dt;
    G.timeScale += (0.25 - G.timeScale) * damp(3, dt);
    G.desat = Math.min(0.85, G.desat + dt * 0.6);
    if (G.endT > 2.4 && $('scrEnd').hidden) showEnd(false);
  } else if (G.state === 'victory') {
    G.endT += dt;
    if (G.endT > 4.2 && $('scrEnd').hidden) showEnd(true);
  }
}
function updateHUD(dt) {
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) hud.toast.classList.remove('show'); }
  if (G.state === 'play') {
    G.play += dt;
    if (!G.hintLoot && G.play > 5.5 && combat.arsenal.length === 1) {
      G.hintLoot = true;
      toast(IS_TOUCH ? 'Рядом лежит оружие. «Удар» — атака' : 'Рядом лежит оружие. ЛКМ или J — удар', 3400, false, 1);
    }
    G.timerT -= dt;
    if (G.timerT <= 0) { G.timerT = 0.25; hud.timer.textContent = fmtTime(G.play); }
  }
  G.mmT -= dt;
  if (G.mmT <= 0 && !hud.root.hidden) { G.mmT = 0.1; drawMinimap(); }
}

/* -----------------------------------------------------------------------------
   22 · Buttons, mute, fullscreen
----------------------------------------------------------------------------- */
function updateMuteBtn() { $('btnMute').setAttribute('aria-pressed', String(SFX.muted)); }
function toggleMute() {
  SFX.setMuted(!SFX.muted); updateMuteBtn();
  try { localStorage.setItem('isle.muted', SFX.muted ? '1' : '0'); } catch (e) { /* storage may be blocked */ }
}
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  try {
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const p = req && req.call(el);
      if (p && p.catch) p.catch(() => {});
    } else {
      const ex = d.exitFullscreen || d.webkitExitFullscreen;
      const p = ex && ex.call(d);
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) { /* fullscreen is optional */ }
}
if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) $('btnFull').hidden = true;
$('btnStart').addEventListener('click', startGame);
$('btnResume').addEventListener('click', () => setPaused(false));
$('btnRestart').addEventListener('click', () => restart(false));
$('btnAgain').addEventListener('click', () => restart(false));
$('btnNew').addEventListener('click', () => restart(true));
$('btnMute').addEventListener('click', () => { SFX.init(); toggleMute(); });
$('btnFull').addEventListener('click', toggleFullscreen);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (G.state === 'play') setPaused(true); if (SFX.ctx) SFX.ctx.suspend(); }
  else if (SFX.ctx) SFX.ctx.resume();
});
if (IS_TOUCH) { $('startHint').textContent = 'левый палец — идти, правый — камера, справа — удар и смена оружия'; }
