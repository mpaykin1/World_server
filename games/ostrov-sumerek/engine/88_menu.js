/* =============================================================================
   88 · Title menu: island (biome) and hero pickers, built from the registry.
        A row hides itself while there is only one choice. Picking an island
        rebuilds the world under the title camera (a short dip to dark).
============================================================================= */
const menu = { box: $('picks'), biome: $('pickBiome'), hero: $('pickHero') };
function readBiome() { try { return localStorage.getItem('isle.biome') || DEFAULT_BIOME; } catch (e) { return DEFAULT_BIOME; } }
function menuChip(label, sub, pressed, onPick, deco, tip) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip';
  b.setAttribute('aria-pressed', String(pressed));
  if (tip) b.title = tip;
  if (deco) b.append(deco);
  const t = document.createElement('span');
  t.textContent = label;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; t.append(s); }
  b.append(t);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (G.state !== 'title') return;
    SFX.init(); SFX.ui();
    onPick();
  });
  return b;
}
function menuLabel(text) { const l = document.createElement('small'); l.className = 'pick-l'; l.textContent = text; return l; }
function renderMenu() {
  if (!menu.box) return;
  const biomes = [...REG.biomes.values()];
  const heroes = CHAR_ORDER.map((id) => REG.characters.get(id));
  menu.box.hidden = biomes.length < 2 && heroes.length < 2;
  menu.biome.hidden = biomes.length < 2;
  menu.hero.hidden = heroes.length < 2;
  menu.biome.replaceChildren(menuLabel('Остров'), ...biomes.map((b) => {
    // swatch: the island's dusk sky, top to horizon to fog
    const p = Object.assign({}, PALETTES.dusk, (b.palette && b.palette.dusk) || {});
    const sw = document.createElement('i'); sw.className = 'sw';
    sw.style.setProperty('--a', p.skyTop); sw.style.setProperty('--b', p.skyHor); sw.style.setProperty('--c', p.fog);
    return menuChip(b.name, b.short || '', b.id === G.biome, () => pickBiome(b.id), sw, b.desc);
  }));
  menu.hero.replaceChildren(menuLabel('Герой'), ...heroes.map((h) => {
    const pt = document.createElement('i'); pt.className = 'pt';
    pt.style.setProperty('--sheet', `url("${ASSETS.heroes[h.art]}")`);
    return menuChip(h.name, h.perk || '', HERO && h.id === HERO.id, () => pickHero(h.id), pt, h.desc);
  }));
  const lc = lootCounts(G.biome);
  const nw = lc.near + lc.far;
  $('eyebrow').textContent = `16×16 · ${G.total} ${ruPlural(G.total, 'монета', 'монеты', 'монет')} · ${nw} ${ruPlural(nw, 'вид', 'вида', 'видов')} оружия`;
  $('best').textContent = G.best !== null ? `Рекорд этого острова — ${fmtTime(G.best)}` : '';
  const biome = REG.biomes.get(G.biome);
  if (biome && biome.lede) $('lede').textContent = biome.lede;
  else $('lede').textContent = 'Собери все монеты, вооружись тем, что лежит на острове, и одолей Стража маяка.';
}
function pickBiome(id) {
  if (id === G.biome || !REG.biomes.has(id)) return;
  G.fade = Math.min(G.fade, 0.3);               // a dip to dark while the new island rises
  buildWorld(G.seed, id);
  resetRun();
  try { localStorage.setItem('isle.biome', id); } catch (e) { /* storage may be blocked */ }
  renderMenu();
  focusChip(menu.biome);
}
function pickHero(id) {
  if (HERO && id === HERO.id) return;
  selectCharacter(id);
  resetRun();
  renderMenu();
  focusChip(menu.hero);
}
// keep keyboard focus on the row that was just used (the chips are rebuilt)
function focusChip(row) { const on = row.querySelector('[aria-pressed="true"]'); if (on && document.activeElement && document.activeElement.classList.contains('chip')) on.focus(); }
// Enter / Space on a chip picks it; they must not also start the game (the title listens on window)
if (menu.box) menu.box.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') e.stopPropagation(); });
