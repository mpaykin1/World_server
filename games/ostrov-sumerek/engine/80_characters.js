/* =============================================================================
   80 · Characters: playable heroes from the registry (sprite sheet + stats + perks)
        and STATS — the hero's numbers after the character and every relic held.
============================================================================= */
const STATS_BASE = { maxHp: 6, speed: 1, jump: 1, swim: 1, melee: 1, ranged: 1, wisp: 1, magnet: 1, soul: 0, regen: 0 };
const STATS = Object.assign({}, STATS_BASE);
let HERO = null;
const CHAR_ORDER = [];
function finalizeCharacters() {
  for (const d of REG.characters.values()) {
    if (!HERO_TEX[d.art]) { regError(`character '${d.id}': no sprite sheet '${d.art}' (draw it with @hero in packs/${d.pack}/art)`); continue; }
    for (const wid of d.start || []) if (!WEAPONS[wid]) regError(`character '${d.id}': unknown start weapon '${wid}'`);
    CHAR_ORDER.push(d.id);
  }
}
finalizeCharacters();
function selectCharacter(id) {
  if (!CHAR_ORDER.includes(id)) id = CHAR_ORDER[0];
  HERO = REG.characters.get(id);
  heroTex = HERO_TEX[HERO.art];
  heroMat.map = heroMat.emissiveMap = heroTex;
  heroMat.needsUpdate = true;
  setHeroFrame(player.frame || 4, player.facing || 1);
  try { localStorage.setItem('isle.hero', id); } catch (e) { /* storage may be blocked */ }
  return HERO;
}
// character stats first, then every relic on top (relics: 82_relics.js)
function recomputeStats() {
  Object.assign(STATS, STATS_BASE, (HERO && HERO.stats) || {});
  if (HERO && HERO.stats && HERO.stats.hp !== undefined) STATS.maxHp = HERO.stats.hp;
  for (const r of heldRelics()) applyRelicStats(r, STATS);
  STATS.maxHp = Math.max(2, Math.round(STATS.maxHp));
  const grow = STATS.maxHp - (player.maxHp || STATS.maxHp);
  player.maxHp = STATS.maxHp;
  if (grow > 0) player.hp = Math.min(player.maxHp, player.hp + grow);
  player.hp = Math.min(player.hp, player.maxHp);
  updateHearts(false);
}
function applyHero() {
  if (!HERO) selectCharacter(readHero());
  player.maxHp = 0;
  recomputeStats();
  if (HERO.onRun) HERO.onRun();
}
function readHero() { try { return localStorage.getItem('isle.hero') || 'wanderer'; } catch (e) { return 'wanderer'; } }
// a character may carry a light (lantern): pixel { x, y } in its 16×24 frame
function heroLight() {
  if (!HERO || !HERO.lantern || !hero.visible) return;
  const L = HERO.lantern, f = player.facing;
  hero.updateMatrixWorld();
  tmpA.set(((L.x + 0.5) / 16 - 0.5) * f, 1.5 - (L.y + 0.5) / 24 * 1.5, 0.08).applyMatrix4(hero.matrixWorld);
  const fl = 0.85 + 0.1 * Math.sin(G.time * 11) + 0.05 * Math.sin(G.time * 23);
  glow.spark(tmpA.x, tmpA.y, tmpA.z, 0.22, toColor(L.col, C.goldHot), fl, 0);
  glow.spark(tmpA.x, tmpA.y, tmpA.z, 1.0, toColor(L.halo, C.wispHalo), 0.25 * fl, 0);
}
