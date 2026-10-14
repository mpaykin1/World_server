/* =============================================================================
   32 · Loot: the twenty weapons lying around the island
============================================================================= */
let loot = [];
function buildLoot() {
  let a = 0, b = 0;
  const T = lootTables(world.biome);
  loot = world.loot.map((s) => ({ id: s.near ? T.near[a++] : T.far[b++], x: s.x, y: s.y + 1.0, z: s.z, gy: s.y, alive: true, phase: Math.random() * TAU }))
    .filter((L) => L.id && !combat.arsenal.includes(L.id));          // what the hero starts with does not lie around
}
function updateLoot() {
  if (G.state !== 'play' || player.respawn > 0) return;
  for (const L of loot) {
    if (!L.alive) continue;
    const dx = player.pos.x - L.x, dz = player.pos.z - L.z, dy = player.pos.y + 0.8 - L.y;
    if (Math.hypot(dx, dz) < 0.9 && Math.abs(dy) < 1.5) takeLoot(L);
  }
}
function takeLoot(L) {
  L.alive = false;
  const w = WEAPONS[L.id];
  if (!combat.arsenal.includes(L.id)) combat.arsenal.push(L.id);
  if (w.mag) combat.ammo[L.id] = w.mag;
  equip(L.id);
  SFX.loot();
  for (let k = 0; k < 24; k++) glow.emit(L.x, L.y, L.z, rr(-2.5, 2.5), rr(1, 4.5), rr(-2.5, 2.5), rr(0.5, 1), 0.16, 0.03, RAR[w.rar].col, 1, 6, 1.5, 2);
  showNew(w);
  hudWeapon();
  emit('loot', w);
  if (combat.arsenal.length === ARSENAL_ORDER.length) setTimeout(() => toast('Весь арсенал собран!', 3000, false, 2), 4000);
}
