/* -----------------------------------------------------------------------------
   13 · HUD
----------------------------------------------------------------------------- */
const hud = {
  root: $('hud'), hearts: [...document.querySelectorAll('#hearts .heart')], coins: $('coins'), coinN: $('coinN'), coinT: $('coinT'),
  timer: $('timer'), toast: $('toast'), mm: $('minimap'),
};
const mmCtx = hud.mm.getContext('2d');
const mmBase = document.createElement('canvas'); mmBase.width = W; mmBase.height = D;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function toast(text, ms = 2600, warn = false, prio = 1) {
  if (G.toastT > 0 && prio < G.toastP) return;
  G.toastP = prio;
  const t = hud.toast;
  t.textContent = text; t.classList.toggle('warn', warn);
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  G.toastT = ms / 1000;
}
function updateHearts(hit) {
  const n = Math.max(1, Math.ceil(player.maxHp / 2));
  if (hud.hearts.length !== n) {                 // characters and relics change the number of hearts
    const box = $('hearts');
    box.replaceChildren(...Array.from({ length: n }, () => { const i = document.createElement('i'); i.className = 'heart'; return i; }));
    hud.hearts = [...box.children];
  }
  hud.hearts.forEach((el, i) => {
    el.dataset.v = String(clamp(player.hp - i * 2, 0, 2));
    if (hit) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
  });
}
function setCoinsHud(bump) {
  hud.coinN.textContent = String(G.collected);
  if (bump) { hud.coins.classList.remove('bump'); void hud.coins.offsetWidth; hud.coins.classList.add('bump'); }
}
const MM_COL = { water: '#16305c', shallow: '#2c6e9c' };
for (const d of BLK) if (d.num) MM_COL[d.num] = d.mm;
function drawMinimapBase() {
  const c = mmBase.getContext('2d');
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let top = 0, ty = -1;
    for (let y = H - 1; y >= 0; y--) { const b = world.vox[x + W * (z + D * y)]; if (b) { top = b; ty = y; break; } }
    const wet = ty + 1 < SEA && world.kind[x + z * W] !== 6;
    c.fillStyle = wet ? (ty + 1 <= 2 ? MM_COL.water : MM_COL.shallow) : (MM_COL[top] || '#000');
    c.fillRect(x, z, 1, 1);
  }
}
function drawMinimap() {
  mmCtx.imageSmoothingEnabled = false;
  mmCtx.drawImage(mmBase, 0, 0);
  const blink = Math.floor(G.time * 3) % 2 === 0;
  for (const L of loot) {                 // weapons: a small cross in the colour of their rarity
    if (!L.alive) continue;
    const x = Math.floor(L.x), z = Math.floor(L.z);
    mmCtx.fillStyle = RAR[WEAPONS[L.id].rar].css;
    mmCtx.fillRect(x - 1, z, 3, 1); mmCtx.fillRect(x, z - 1, 1, 3);
  }
  mmCtx.fillStyle = '#ffd246';
  for (const c of coins) if (c.alive) mmCtx.fillRect(Math.floor(c.x) - 1, Math.floor(c.z) - 1, 2, 2);
  mmCtx.fillStyle = '#ff6e5c';
  for (const h of heartsP) if (h.alive) mmCtx.fillRect(Math.floor(h.x) - 1, Math.floor(h.z) - 1, 2, 2);
  if (G.all && G.wardenDown && blink) { mmCtx.fillStyle = '#fff09a'; mmCtx.fillRect(Math.floor(world.ring.x) - 1, Math.floor(world.ring.z) - 1, 3, 3); }
  for (const f of foes) {
    if (!foeAlive(f)) continue;
    const hd = f.segs[0], x = Math.floor(hd.x), z = Math.floor(hd.z);
    if (f.def.boss) { mmCtx.fillStyle = blink ? '#e07bff' : '#9b3cff'; mmCtx.fillRect(x - 2, z - 2, 4, 4); continue; }
    if (Math.hypot(hd.x - player.pos.x, hd.z - player.pos.z) > 16) continue;
    mmCtx.fillStyle = f.type === 'imp' ? '#ff5468' : '#ff4fd8';
    mmCtx.fillRect(x - 1, z - 1, 2, 2);
  }
  const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
  mmCtx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let k = 2; k <= 4; k++) mmCtx.fillRect(Math.floor(player.pos.x - Math.sin(rig.yaw) * k), Math.floor(player.pos.z - Math.cos(rig.yaw) * k), 1, 1);
  mmCtx.fillStyle = '#ffffff';
  mmCtx.fillRect(px - 1, pz - 1, 2, 2);
}
