/* =============================================================================
   34 · Combat HUD: weapon panel, hotbar, boss bar, damage numbers, foe bars
============================================================================= */
const whud = {
  panel: $('wpanel'), icon: $('wIcon'), name: $('wName'), stat: $('wStat'), fill: $('wFill'), ammo: $('wAmmo'), meter: $('wMeter'),
  hot: $('hotbar'), boss: $('boss'), bossFill: $('bossFill'), bossLag: $('bossLag'), layer: $('dmgLayer'), ars: $('arsenal'), arsCount: $('arsCount'),
  swap: $('swapIcon'), lastFill: -1, lastText: '', lastState: '', lag: 1,
  nw: $('wNew'), nwRar: $('wNewRar'), nwName: $('wNewName'), nwDesc: $('wNewDesc'), nwT: 0,
};
// "new weapon" card next to the weapon panel (instead of a centre-screen toast)
function showNew(w, label = 'новое оружие') {
  const el = whud.nw;
  el.style.setProperty('--rar', RAR[w.rar].css);
  whud.nwRar.textContent = `${label} · ${RAR[w.rar].name}`;
  whud.nwName.textContent = w.name;
  whud.nwDesc.textContent = w.desc;
  el.hidden = false; el.classList.remove('out');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  whud.nwT = 4.4;
}
{
  const rs = document.documentElement.style;
  rs.setProperty('--img-weapons', `url("${ASSETS.weapons}")`);
  rs.setProperty('--wa-w', `${WM.size[0]}px`); rs.setProperty('--wa-h', `${WM.size[1]}px`);
}
// icons are CSS sprites: the element's class sets the scale (--s), this sets which 32×32 cell shows
function iconStyle(el, w) {
  const c = w.meta.cell;
  el.style.setProperty('--cx', c[0]); el.style.setProperty('--cy', c[1]);
}
function hudWeapon() {
  const w = curWeapon();
  iconStyle(whud.icon, w); iconStyle(whud.swap, w);
  whud.name.textContent = w.name; whud.name.style.color = RAR[w.rar].css;
  whud.stat.textContent = w.stat;
  whud.lastText = ''; whud.lastFill = -1;
  const frag = document.createDocumentFragment();
  combat.arsenal.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = 'slot' + (id === combat.cur ? ' on' : '');
    b.type = 'button';
    b.title = WEAPONS[id].name;
    b.setAttribute('aria-label', WEAPONS[id].name);
    const ic = document.createElement('i'); ic.className = 'wico'; iconStyle(ic, WEAPONS[id]);
    b.append(ic);
    if (i < 10) { const s = document.createElement('span'); s.textContent = String((i + 1) % 10); b.append(s); }
    b.addEventListener('click', (e) => { e.stopPropagation(); equip(id); canvas.focus(); });
    frag.append(b);
  });
  whud.hot.replaceChildren(frag);
}
function updateWeaponMeter() {
  const w = curWeapon();
  let fill = 1, text = '∞', state = '';
  if (combat.reload > 0) { fill = 1 - combat.reload / combat.reloadDur; text = 'перезарядка'; state = 'reload'; }
  else if (w.meter) { const m = w.meter(); fill = m.fill; text = m.text; state = m.state || ''; }
  else if (w.heat) { fill = 1 - combat.heat / w.heat; text = combat.over ? 'перегрев' : `${Math.round(fill * 100)}%`; state = combat.over ? 'hot' : ''; }
  else if (w.charge) { fill = combat.charging ? combat.charge : 0; text = combat.charging ? (combat.charge >= 1 ? 'полное натяжение' : 'натяжение') : 'держи атаку'; }
  else if (w.mag) { fill = combat.ammo[w.id] / w.mag; text = `${combat.ammo[w.id]} / ${w.mag}`; }
  else if (w.A && w.A.meter) { const m = w.A.meter(w); fill = m.fill; text = m.text; }
  else if (w.combo) { fill = combat.comboT > 0 || combat.atk ? (combat.combo + 1) / w.combo : 0; text = `комбо ${combat.atk || combat.comboT > 0 ? combat.combo + 1 : 0}/${w.combo}`; }
  else { fill = w.cd ? clamp(1 - combat.cd / w.cd, 0, 1) : 1; text = w.ranged ? '∞' : combat.cd > 0 ? '' : 'готово'; }
  const f = Math.round(fill * 100) / 100;
  if (f !== whud.lastFill) { whud.fill.style.transform = `scaleX(${f})`; whud.lastFill = f; }
  if (text !== whud.lastText) { whud.ammo.textContent = text; whud.lastText = text; }
  if (state !== whud.lastState) { whud.meter.dataset.state = state; whud.lastState = state; }
}
const BARS = [];
for (let i = 0; i < 8; i++) { const el = document.createElement('span'); el.className = 'hpbar'; const fill = document.createElement('i'); el.append(fill); whud.layer.append(el); BARS.push({ el, fill }); }
const NUMS = [];
for (let i = 0; i < 28; i++) { const el = document.createElement('span'); el.className = 'dmg'; whud.layer.append(el); NUMS.push({ el, pos: new THREE.Vector3(), life: 0, vy: 0 }); }
let numIdx = 0;
function dmgNumber(pos, value, kind) {
  const n = NUMS[numIdx++ % NUMS.length];
  n.pos.copy(pos); n.pos.x += rr(-0.4, 0.4); n.pos.y += 0.25; n.life = 0.9; n.vy = 1.9;
  n.el.textContent = kind === 'heal' ? '+1' : String(Math.max(1, Math.round(value)));
  n.el.className = 'dmg' + (kind ? ' ' + kind : '');
}

function project(v) {
  tmpE.copy(v).project(camera);
  return tmpE.z < 1 ? [(tmpE.x * 0.5 + 0.5) * innerWidth, (-tmpE.y * 0.5 + 0.5) * innerHeight] : null;
}
function updateCombatHud(dt) {
  if (whud.nwT > 0) {
    whud.nwT -= dt;
    if (whud.nwT <= 0.5 && !whud.nw.classList.contains('out')) whud.nw.classList.add('out');
    if (whud.nwT <= 0) whud.nw.hidden = true;
  }
  for (const n of NUMS) {
    if (n.life <= 0) { if (n.el.style.opacity !== '0') n.el.style.opacity = '0'; continue; }
    n.life -= dt; n.pos.y += n.vy * dt; n.vy *= Math.exp(-2.5 * dt);
    const s = project(n.pos);
    if (!s) { n.el.style.opacity = '0'; continue; }
    const k = n.life / 0.9;
    n.el.style.opacity = String(Math.min(1, k * 2.5));
    n.el.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%, -50%) scale(${(0.75 + 0.45 * Math.min(1, (1 - k) * 6)).toFixed(2)})`;
  }
  let i = 0;
  for (const f of foes) {
    if (i >= BARS.length) break;
    if (f.def.boss || f.hitT <= 0 || !foeAlive(f)) continue;
    const h = f.segs[0];
    const s = project(tmpA.set(h.x, h.y + f.def.rad + 0.75, h.z));
    if (!s) continue;
    const b = BARS[i++];
    b.el.style.opacity = String(Math.min(1, f.hitT * 1.5));
    b.el.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%, -50%)`;
    b.fill.style.transform = `scaleX(${Math.max(0, f.hp / f.maxHp).toFixed(3)})`;
  }
  for (; i < BARS.length; i++) if (BARS[i].el.style.opacity !== '0') BARS[i].el.style.opacity = '0';
  const boss = G.warden && foeAlive(G.warden) ? G.warden : null;
  if (whud.boss.hidden === !!boss) {
    whud.boss.hidden = !boss; hud.root.classList.toggle('boss-on', !!boss); whud.lag = 1;
    if (boss) whud.boss.firstElementChild.textContent = boss.def.name;
  }
  if (boss) {
    // the white "lag" bar trails the health, so each blow reads as a chunk bitten out of the bar
    const k = boss.hp / boss.maxHp;
    whud.lag = Math.max(k, whud.lag - Math.max(0.02, (whud.lag - k) * 2.5) * dt * (boss.hitT > 2.2 ? 0 : 1));
    whud.bossFill.style.transform = `scaleX(${k.toFixed(3)})`;
    whud.bossLag.style.transform = `scaleX(${whud.lag.toFixed(3)})`;
  }
  updateWeaponMeter();
}
function renderArsenal() {
  const frag = document.createDocumentFragment();
  for (const id of ARSENAL_ORDER) {
    const w = WEAPONS[id], have = combat.arsenal.includes(id);
    const card = document.createElement('div');
    card.className = 'acard' + (have ? '' : ' unknown') + (id === combat.cur ? ' on' : '');
    const ic = document.createElement('i'); ic.className = 'wico'; iconStyle(ic, w);
    const box = document.createElement('div');
    const nm = document.createElement('b'); nm.textContent = have ? w.name : '???'; nm.style.color = RAR[w.rar].css;
    const rar = document.createElement('small'); rar.textContent = `${w.kind === 'melee' ? 'ближний бой' : 'стрелковое'} · ${RAR[w.rar].name}`;
    const ds = document.createElement('span'); ds.textContent = have ? `${w.stat}. ${w.desc}` : 'Лежит где-то на острове.';
    box.append(nm, rar, ds);
    card.append(ic, box);
    if (have) card.addEventListener('click', () => { equip(id); renderArsenal(); });
    frag.append(card);
  }
  renderRelicCards(frag);
  whud.ars.replaceChildren(frag);
  whud.arsCount.textContent = `${combat.arsenal.length} / ${ARSENAL_ORDER.length}`;
}
// relics found on this island (and the ones still resting on shrines) close the pause list
function renderRelicCards(frag) {
  const here = relicSpots.map((R) => R.id);
  const list = [...new Set([...relicsHeld.map((r) => r.id), ...here])].map((id) => REG.relics.get(id));
  if (!list.length) return;
  const head = document.createElement('div');
  head.className = 'ars-sub';
  head.textContent = `Реликвии · ${relicsHeld.length} / ${list.length}`;
  frag.append(head);
  for (const r of list) {
    const have = relicsHeld.includes(r);
    const card = document.createElement('div');
    card.className = 'acard relic' + (have ? '' : ' unknown');
    const ic = document.createElement('i'); ic.className = 'ico16';
    const c = WM.icons[r.icon]; ic.style.setProperty('--cx', c[0]); ic.style.setProperty('--cy', c[1]);
    const box = document.createElement('div');
    const nm = document.createElement('b'); nm.textContent = have ? r.name : '???'; nm.style.color = RAR[r.rar].css;
    const rar = document.createElement('small'); rar.textContent = `реликвия · ${RAR[r.rar].name}`;
    const ds = document.createElement('span'); ds.textContent = have ? r.desc : 'Ждёт на алтаре где-то на острове.';
    box.append(nm, rar, ds);
    card.append(ic, box);
    frag.append(card);
  }
}
