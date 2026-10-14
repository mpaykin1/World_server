/* =============================================================================
   82 · Relics: passive artifacts resting on shrines around the island.
        defineRelic(id, { name, desc, icon, rar, stats, biomes?, onPickup?, onTick? })
        stats: multipliers (speed, jump, swim, melee, ranged, wisp, magnet) and additions
        (maxHp in half-hearts, soul chance, regen = seconds per half-heart).
============================================================================= */
const relicsHeld = [];
let relicSpots = [];          // { id, x, y, z, gy, alive, phase }
const ADDITIVE_STATS = new Set(['maxHp', 'soul']);
function heldRelics() { return relicsHeld; }
function applyRelicStats(r, S) {
  const e = r.stats || {};
  for (const k in e) {
    if (k === 'regen') S.regen = S.regen ? Math.min(S.regen, e.regen) : e.regen;
    else if (ADDITIVE_STATS.has(k)) S[k] += e[k];
    else S[k] *= e[k];
  }
}
function finalizeRelics() {
  for (const d of REG.relics.values()) {
    if (!ICON_UV[d.icon]) regError(`relic '${d.id}': no icon '${d.icon}' (draw it with @icon in packs/${d.pack}/art)`);
    if (d.rar && !RAR[d.rar]) regError(`relic '${d.id}': unknown rarity '${d.rar}'`);
    d.rar = d.rar || 'rare';
  }
}
finalizeRelics();
// which relics lie on this island: a seeded pick from the relics allowed in the biome
function buildRelics() {
  relicsHeld.length = 0;
  const pool = [...REG.relics.values()].filter((r) => ICON_UV[r.icon] && (!r.biomes || r.biomes.includes(world.biome)));
  const rnd = mulberry32((world.seed ^ 0x5eed) >>> 0);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  relicSpots = (world.relicSpots || []).slice(0, pool.length).map((s, i) => ({ id: pool[i].id, x: s.x, y: s.y + 1.15, z: s.z, gy: s.y, alive: true, phase: rnd() * TAU }));
}
function updateRelics(dt) {
  if (G.state !== 'play' || player.respawn > 0) return;
  for (const R of relicSpots) {
    if (!R.alive) continue;
    if (Math.hypot(player.pos.x - R.x, player.pos.z - R.z) < 0.9 && Math.abs(player.pos.y + 0.8 - R.y) < 1.6) takeRelic(R);
  }
  if (STATS.regen > 0 && player.hp < player.maxHp) {
    G.regenT = (G.regenT || 0) + dt;
    if (G.regenT >= STATS.regen) { G.regenT = 0; player.hp++; updateHearts(false); dmgNumber(tmpE.set(player.pos.x, player.pos.y + 1.6, player.pos.z), 1, 'heal'); }
  }
  for (const r of relicsHeld) if (r.onTick) r.onTick(dt);
}
function giveRelic(id) {
  const r = REG.relics.get(id);
  if (!r || relicsHeld.includes(r)) return null;
  relicsHeld.push(r);
  recomputeStats();
  if (r.onPickup) r.onPickup();
  showNew(r, 'реликвия');
  hudRelics();
  emit('relic', r);
  return r;
}
function takeRelic(R) {
  R.alive = false;
  const r = giveRelic(R.id);
  if (!r) return;
  SFX.loot(); SFX.heal();
  for (let k = 0; k < 30; k++) glow.emit(R.x, R.y, R.z, rr(-2.5, 2.5), rr(1, 5), rr(-2.5, 2.5), rr(0.6, 1.2), 0.18, 0.03, RAR[r.rar].col, 1, 5, 1.4, 2);
  G.flash = Math.max(G.flash, 0.18); FX.uFlashColor.value.copy(RAR[r.rar].col).multiplyScalar(0.4);
}
// shrine look: the icon floats over a slowly turning rune ring, a pillar of light marks it from afar
function renderRelics() {
  const li = lightTint();
  for (const R of relicSpots) {
    if (!R.alive) continue;
    const r = REG.relics.get(R.id), rc = RAR[r.rar].col;
    const bob = Math.sin(G.time * 1.7 + R.phase) * 0.14;
    sprites.add(R.x, R.y + bob, R.z, 0.95, 0.95, 0, ICON_UV[r.icon], 0, 0, 1, 1, li, li, li, 0.35 + 0.15 * Math.sin(G.time * 3 + R.phase));
    glow.spark(R.x, R.y + bob, R.z, 2.0, rc, 0.2 + 0.1 * G.tod, 0);
    const rot = G.time * 0.8 + R.phase;
    for (let i = 0; i < 6; i++) {
      const a0 = rot + i * TAU / 6, a1 = a0 + 0.55;
      _ja.set(R.x + Math.cos(a0) * 0.7, R.gy + 0.06, R.z + Math.sin(a0) * 0.7);
      _jb.set(R.x + Math.cos(a1) * 0.7, R.gy + 0.06, R.z + Math.sin(a1) * 0.7);
      ribbons.seg(_ja, _jb, 0.09, 0.09, rc, 0.6);
    }
    _ja.set(R.x, R.gy, R.z); _jb.set(R.x, R.gy + 7, R.z);
    ribbons.seg(_ja, _jb, 0.45, 0.06, rc, 0.28 + 0.2 * G.tod, rc, 0);
  }
}
const relicHud = $('relics');
function hudRelics() {
  if (!relicHud) return;
  relicHud.replaceChildren(...relicsHeld.map((r) => {
    const i = document.createElement('i');
    i.className = 'ico16';
    const c = WM.icons[r.icon];
    i.style.setProperty('--cx', c[0]); i.style.setProperty('--cy', c[1]);
    i.title = `${r.name} — ${r.desc}`;
    return i;
  }));
}
