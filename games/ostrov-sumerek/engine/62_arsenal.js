/* =============================================================================
   25 · Arsenal: 10 melee + 10 ranged weapons, plus fists
============================================================================= */
const WM = ASSETS.wmeta;
const rectUV = (r) => [r[0] / WM.size[0], 1 - (r[1] + r[3]) / WM.size[1], r[2] / WM.size[0], r[3] / WM.size[1]];
const RAR = {
  common: { name: 'обычное', css: '#d9d2bd', col: col3(0.95, 0.88, 0.7) },
  rare: { name: 'редкое', css: '#62b6ff', col: col3(0.35, 0.65, 1.0) },
  epic: { name: 'эпическое', css: '#c47bff', col: col3(0.72, 0.4, 1.0) },
  legend: { name: 'легендарное', css: '#ffc845', col: col3(1.0, 0.75, 0.25) },
};
// resolve a colour given as a THREE.Color, a hex string, a C key (engine VFX palette) or [r, g, b, k]
function toColor(v, fallback) {
  if (!v) return fallback;
  if (v.isColor) return v;
  if (Array.isArray(v)) return col3(v[0], v[1], v[2], v[3] ?? 1);
  if (typeof v === 'string') return C[v] || new THREE.Color(v);
  return fallback;
}
const WEAPONS = {};
const PUV = {}; for (const k in WM.proj) PUV[k] = rectUV(WM.proj[k]);
const ICON_UV = {}; for (const k in WM.icons || {}) ICON_UV[k] = rectUV(WM.icons[k]);
function finalizeWeapons() {
  for (const d of REG.weapons.values()) {
    const meta = WM.weapons[d.art || d.id];
    if (!meta) { regError(`weapon '${d.id}': no art cell '${d.art || d.id}' (draw it with @weapon in packs/${d.pack}/art)`); continue; }
    if (!RAR[d.rar]) { regError(`weapon '${d.id}': unknown rarity '${d.rar}'`); continue; }
    d.meta = meta; d.uv = rectUV(meta.cell); d.ranged = d.kind === 'ranged'; d.hs = d.held ?? 1.4;
    if (d.kind === 'melee') {
      d.A = REG.anims.get(d.anim);
      if (!d.A) { regError(`weapon '${d.id}': unknown anim '${d.anim}'`); continue; }
      d.hold = !!d.A.hold;
    } else {
      d.F = REG.fires.get(d.fire);
      if (!d.F) { regError(`weapon '${d.id}': unknown fire mode '${d.fire}'`); continue; }
      if (d.fire === 'proj' && !REG.projectiles.has(d.proj)) { regError(`weapon '${d.id}': unknown projectile '${d.proj}'`); continue; }
      if (d.ric && !REG.ricochets.has(d.ric)) { regError(`weapon '${d.id}': unknown ricochet '${d.ric}'`); continue; }
    }
    if (d.chargeArt) {
      const cm = WM.weapons[d.chargeArt];
      if (cm) { d.chargeMeta = cm; d.chargeUV = rectUV(cm.cell); } else regWarn(`weapon '${d.id}': chargeArt '${d.chargeArt}' not drawn`);
    }
    d.trail = toColor(d.trail, null);
    d.color = toColor(d.color, null);
    WEAPONS[d.id] = d;
  }
  // melee first, then ranged; inside a group the order of registration (base pack first)
  const all = Object.values(WEAPONS);
  ARSENAL_ORDER.push(...all.filter((w) => w.kind === 'melee').map((w) => w.id), ...all.filter((w) => w.kind !== 'melee').map((w) => w.id));
  STARTERS.push(...all.filter((w) => w.starter).map((w) => w.id));
  if (!STARTERS.length) STARTERS.push(ARSENAL_ORDER[0]);
}
const ARSENAL_ORDER = [], STARTERS = [];
// weapons lying on the island: 'near' ones a few steps from the beach, the rest by tier (farther = stronger)
function lootTables(biomeId) {
  const ok = (w) => w.loot && !w.starter && (!w.biomes || w.biomes.includes(biomeId));
  const all = ARSENAL_ORDER.map((id) => WEAPONS[id]).filter(ok);
  const near = all.filter((w) => w.loot.near).map((w) => w.id);
  const far = all.filter((w) => !w.loot.near).sort((a, b) => (a.loot.tier ?? 50) - (b.loot.tier ?? 50)).map((w) => w.id).slice(0, 24);
  return { near, far };
}
function lootCounts(biomeId) { const t = lootTables(biomeId); return { near: t.near.length, far: t.far.length }; }
const UPV = new THREE.Vector3(0, 1, 0);
const FLAIL_GRIP = WM.weapons.flail ? { uv: rectUV([WM.weapons.flail.cell[0], WM.weapons.flail.cell[1] + 16, 16, 16]), grip: [6, 10], top: [13, 3] } : null;
const LINK_UV = WM.weapons.flail ? rectUV([WM.weapons.flail.cell[0] + 14, WM.weapons.flail.cell[1] + 15, 3, 3]) : [0, 0, 0, 0];
Object.assign(C, {
  brass: new THREE.Color('#e2a83a'), chip: new THREE.Color('#9d6a40'), leaf: new THREE.Color('#5ea443'),
  flashWarm: new THREE.Color(1, 0.75, 0.35).multiplyScalar(3), spark: new THREE.Color(1, 0.85, 0.5).multiplyScalar(2.5),
  dash: new THREE.Color(0.35, 1, 1).multiplyScalar(2), ice: new THREE.Color(0.6, 0.9, 1).multiplyScalar(2.2),
  fire: new THREE.Color(1, 0.45, 0.1).multiplyScalar(3), smokeLight: new THREE.Color(0.36, 0.3, 0.36),
  zapCore: new THREE.Color(0.85, 1, 1).multiplyScalar(3), zapGlow: new THREE.Color(0.2, 0.75, 1).multiplyScalar(1.6),
  beamCore: new THREE.Color(1, 0.9, 1).multiplyScalar(3), beamGlow: new THREE.Color(1, 0.25, 0.85).multiplyScalar(1.6),
  orbCore: new THREE.Color(1, 0.4, 1).multiplyScalar(3), orbHalo: new THREE.Color(0.6, 0.15, 1).multiplyScalar(1.4),
  soul: new THREE.Color(0.75, 1, 0.85).multiplyScalar(3), soulHalo: new THREE.Color(0.3, 1, 0.6).multiplyScalar(1.2),
  hitSpark: new THREE.Color(1, 0.95, 0.85).multiplyScalar(2.6), reticle: new THREE.Color(1, 0.95, 0.85).multiplyScalar(0.9),
  lock: new THREE.Color(1, 0.35, 0.6).multiplyScalar(1.4), white: new THREE.Color(2, 2, 2),
});
finalizeWeapons();
