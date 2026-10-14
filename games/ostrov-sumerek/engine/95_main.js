/* -----------------------------------------------------------------------------
   23 · Main loop (delta-time everywhere; nothing is tied to frame count)
----------------------------------------------------------------------------- */
let last = 0, booted = false;
function perfMonitor(dt) {
  if (perf.lock) return;
  perf.acc += dt; perf.frames++;
  if (perf.acc >= 2) {
    const fps = perf.frames / perf.acc; perf.acc = 0; perf.frames = 0;
    let s = perf.scale;
    if (fps < 48 && s > 0.5) s = Math.max(0.5, Math.round((s - 0.1) * 100) / 100);
    else if (fps > 58 && s < 0.9) s = Math.min(0.9, Math.round((s + 0.05) * 100) / 100);
    if (s !== perf.scale) { perf.scale = s; resize(); }
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const raw = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 0.016;
  last = now;
  // hit-stop: a heavy blow freezes the simulation for a few frames; particles crawl, the camera keeps breathing
  const frozen = G.hitstop > 0;
  G.hitstop = Math.max(0, G.hitstop - raw);
  const dt = frozen ? 0 : raw * G.timeScale;
  G.time += raw;
  U.time.value = G.time;
  pollPad();
  glow.update(frozen ? raw * 0.12 : raw); dust.update(frozen ? raw * 0.12 : raw);
  const play = G.state === 'play';
  if (play) updateAim(raw);
  if (play || G.state === 'dead' || G.state === 'victory') updatePlayer(dt);
  if (play) { updateCombat(dt); updatePickups(dt); updateLoot(); updateRelics(dt); }
  else {
    input.pressed = input.released = false;
    if (coinObj) { syncPickups(coins, coinObj); syncPickups(heartsP, heartObj); }
  }
  if (G.state !== 'paused') { updateProjectiles(dt); updateFoes(dt); updateSouls(dt); updateFx(dt); }
  updateFlow(raw);
  updateEvents(raw);                 // world events + weather first: the palette below leans on them
  updateEnvironment(raw);
  updateBeacon(raw);
  updateCamera(raw);
  updateHeroMesh(raw);
  heroLight();
  updateNPCs(raw);
  updateWisp(raw);
  updateLeaves(raw);
  sprites.begin(); ribbons.begin();
  renderLoot(); renderRelics(); renderHeld(); renderProjectiles(); renderFx(raw); renderSouls();
  sprites.end(); ribbons.end();
  renderFoes();
  rebuildDirty();
  updatePost(raw);
  updateHUD(raw);
  updateCombatHud(raw);
  updateNpcHud(raw);
  glow.flush(); dust.flush();
  composer.render(raw);
  perfMonitor(raw);
}
function start(data) {
  if (booted) return;
  booted = true;
  data = data || {};
  try { SFX.muted = localStorage.getItem('isle.muted') === '1'; } catch (e) { /* storage may be blocked */ }
  if (typeof data.muted === 'boolean') SFX.muted = data.muted;
  updateMuteBtn();
  selectCharacter(readHero());
  emit('boot');
  const biome0 = REG.biomes.has(data.biome) ? data.biome : REG.biomes.has(readBiome()) ? readBiome() : DEFAULT_BIOME;
  buildWorld(Number.isFinite(data.seed) ? data.seed : DEFAULT_SEED, biome0);
  resetRun();
  G.state = 'title';
  renderMenu();
  const b = world.beacon, a = G.sunAz + 1.0;
  rig.pos.set(b.x + Math.cos(a) * 34, b.y + 5, b.z + Math.sin(a) * 34);
  rig.look.set(b.x, b.y - 4.5, b.z);
  requestAnimationFrame(frame);
  setTimeout(() => {
    loadingEl.classList.add('gone');
    $('scrTitle').hidden = false;
    renderMenu();
    setTimeout(() => loadingEl.remove(), 1400);
  }, 350);
}
try { window.claude?.hot?.snapshot?.(() => ({ seed: G.seed, muted: SFX.muted, biome: G.biome })); } catch (e) { /* viewer hook is optional */ }
const hot = window.claude?.hot;
if (hot?.ready) { try { hot.ready(start); } catch (e) { start({}); } } else start(hot?.data ?? {});
setTimeout(() => start({}), 2500);

// small handle for debugging / automated checks
window.__isle = {
  G, player, rig, perf, combat, aim, input, WEAPONS, ARSENAL_ORDER,
  get world() { return world; }, get foes() { return foes; }, get loot() { return loot; }, get projs() { return projs; },
  startGame, win, hurt: () => hurt(1), equip, cycleWeapon,
  setTod(v) { G.todT = G.tod = v; },
  get coins() { return coins; },
  rebuild(seed, biome) { buildWorld(seed, biome); resetRun(); if (G.state === 'title') renderMenu(); },
  REG, PACKS, STATS, BLK,
  registry() {
    const counts = {};
    for (const k in REG) counts[k] = REG[k].size;
    return { packs: PACKS.map((p) => p.id), counts, errors: REG_LOG.errors, warnings: REG_LOG.warnings,
      weapons: ARSENAL_ORDER.length, characters: CHAR_ORDER.length, biomes: [...REG.biomes.keys()] };
  },
  character(id) { selectCharacter(id); resetRun(); if (G.state === 'title') renderMenu(); return HERO.id; },
  sim(dt, x, z, jump, fight) {
    simDir = [x, z];
    if (jump) { if (!player.jumpHeld) onJumpPress(); } else onJumpRelease();
    if (fight) { G.time += dt; U.time.value = G.time; updateAim(dt); }
    updatePlayer(dt);
    if (fight) {
      updateCombat(dt);
      updateCamera(dt); updateHeroMesh(dt);
      sprites.begin(); ribbons.begin(); renderHeld();       // keeps the muzzle where the hand is
    }
    updatePickups(dt); updateLoot(); updateRelics(dt); updateProjectiles(dt); updateFoes(dt); updateSouls(dt); updateFx(dt); updateBeacon(dt);
    G.hitstop = 0;
    simDir = null;
  },
  foeNear(type = 'shade', dx = 3, dz = 3, hold = false) {
    const f = spawnFoe(type, player.pos.x + dx, player.pos.y + 1, player.pos.z + dz, false);
    if (!f) return null;
    const gy = Math.max(terrainTop(player.pos.x + dx, player.pos.z + dz), SEA);
    f.segs.forEach((sg, k) => sg.set(player.pos.x + dx + k * f.def.spacing * 0.8, gy + f.def.hover, player.pos.z + dz + k * 0.05));
    f.state = 'wander'; f.alpha = 1; f.t = 2; f.timer = 99; f.hold = hold; f.target.set(f.segs[0].x, 0, f.segs[0].z);
    if (type === 'warden') { G.warden = f; G.wardenSpawned = true; }
    return f;
  },
  shadeNear(dx = 3, dz = 3) { return this.foeNear('shade', dx, dz); },
  giveAll() {
    for (const id of ARSENAL_ORDER) {
      if (!combat.arsenal.includes(id)) combat.arsenal.push(id);
      const w = WEAPONS[id]; if (w.mag) combat.ammo[id] = w.mag;
    }
    for (const L of loot) L.alive = false;
    hudWeapon();
  },
  killWarden() { if (G.warden && foeAlive(G.warden)) damageFoe(G.warden, 1e6, 0, 0, { silent: true }); },
  killFoes() { for (const f of foes) if (foeAlive(f)) damageFoe(f, 1e6, 0, 0, { silent: true }); },
  hitFoe(f, dmg = 1, o = {}) { return damageFoe(f, dmg, 0, 0, o); },     // the real hit path (brain onDamaged included)
  attack(on) { setAttack('key', !!on); },
  boom(x, y, z) { explode(new THREE.Vector3(x, y, z), WEAPONS.bomb); },
  aimAt(x, z) { aim.dir.set(x - player.pos.x, 0, z - player.pos.z).normalize(); player.look.copy(aim.dir); },
  collectAll(keepOne) { coins.forEach((c, i) => { if (c.alive && !(keepOne && i === coins.length - 1)) collectCoin(i); }); },
  teleport(x, z) { const s = world.stand[Math.floor(x) + Math.floor(z) * W]; player.pos.set(x, Math.min(s, H - 2), z); player.vel.set(0, 0, 0); },
  // relics, NPCs, events (tools/shots.py and tools/check.py lean on these)
  get relics() { return relicSpots; }, get held() { return relicsHeld.map((r) => r.id); }, get npcs() { return npcs; },
  relicNear(id, dx = 2, dz = 0) {
    if (!REG.relics.has(id)) return null;
    const x = player.pos.x + dx, z = player.pos.z + dz, gy = groundBelow(x, H - 1, z);
    const R = { id, x, y: gy + 1.15, z, gy, alive: true, phase: 0 };
    relicSpots.push(R);
    return R;
  },
  giveRelic(id) { return !!giveRelic(id); },
  npcNear(id, dx = 2, dz = 1) {
    const n = npcs.find((m) => m.def.id === id);
    if (!n) return null;
    n.x = player.pos.x + dx; n.z = player.pos.z + dz; n.y = groundBelow(n.x, H - 1, n.z);
    return { x: n.x, y: n.y, z: n.z };
  },
  forceEvent(id, instant = true) { return forceEvent(id, instant); },
  endEvent() { if (EVT.cur) EVT.ending = true; },
  noEvents(on = true) { G.noEvents = !!on; if (on) eventsReset(); },
  get event() { return { id: EVT.cur && EVT.cur.id, k: +EVT.k.toFixed(3), weather: weather.kind, level: +weather.level.toFixed(3) }; },
  skyBolt(x, z) { skyBolt(x, z); },
};
