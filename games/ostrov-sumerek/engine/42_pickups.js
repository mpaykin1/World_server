/* -----------------------------------------------------------------------------
   16 · Pickups: coins (with magnet + pop) and hearts
----------------------------------------------------------------------------- */
let coins = [], heartsP = [];
let simDir = null;                       // automated-check steering (world space), null in normal play
function buildPickups() {
  for (const o of [coinObj, heartObj]) if (o) for (const m of o.meshes) { scene.remove(m); m.geometry.dispose(); }
  const make = (list, mats, withBeam) => {
    const n = Math.max(1, list.length);
    const pos = new Float32Array(n * 3), ph = new Float32Array(n), al = new Float32Array(n);
    list.forEach((c, i) => { ph[i] = Math.random(); al[i] = 1; pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z; });
    const inst = makeInstGeo(quadBase, list.length, { aPos: [pos, 3], aPhase: [ph, 1], aAlive: [al, 1] });
    const meshes = mats.map((mat, k) => {
      let geo = inst.geo;
      if (withBeam && k === mats.length - 1) {
        geo = new THREE.InstancedBufferGeometry();
        geo.index = beamBase.index;
        geo.setAttribute('position', beamBase.attributes.position);
        geo.setAttribute('uv', beamBase.attributes.uv);
        for (const nm in inst.attrs) geo.setAttribute(nm, inst.attrs[nm]);
        geo.instanceCount = list.length;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = mat.blending === THREE.AdditiveBlending ? 9 + k : 3;
      scene.add(mesh);
      return mesh;
    });
    return { meshes, attrs: inst.attrs, pos, al };
  };
  coins = world.coins.map((c) => ({ x: c.x, y: c.y + 0.62, z: c.z, alive: true, t: 1 }));
  heartsP = world.hearts.map((c) => ({ x: c.x, y: c.y + 0.6, z: c.z, alive: true, t: 1 }));
  coinObj = make(coins, [coinMat, coinHaloMat, coinBeamMat], true);
  heartObj = make(heartsP, [heartMat, heartHaloMat], false);
}
function syncPickups(list, o) {
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    o.pos[i * 3] = c.x; o.pos[i * 3 + 1] = c.y; o.pos[i * 3 + 2] = c.z;
    o.al[i] = c.alive ? 1 : c.t < 1 ? (1 - c.t) * (1 + 0.8 * Math.sin(c.t * Math.PI)) : 0;
  }
  o.attrs.aPos.needsUpdate = true; o.attrs.aAlive.needsUpdate = true;
}
function updatePickups(dt) {
  const px = player.pos.x, py = player.pos.y + 0.7, pz = player.pos.z;
  const active = G.state === 'play' && player.respawn <= 0;
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    if (c.alive) {
      if (!active) continue;
      const dx = px - c.x, dy = py - c.y, dz = pz - c.z, dh = Math.hypot(dx, dz);
      const mg = 1.9 * STATS.magnet;
      if (dh < mg && Math.abs(dy) < 1.6) { const k = damp(6, dt) * (1 - dh / mg); c.x += dx * k; c.z += dz * k; c.y += dy * k * 0.5; }
      if (dh < 0.75 && Math.abs(dy) < 1.15) collectCoin(i);
    } else if (c.t < 1) { c.t = Math.min(1, c.t + dt * 2.6); c.y += dt * 2.2 * (1 - c.t); }
  }
  for (let i = 0; i < heartsP.length; i++) {
    const h = heartsP[i];
    if (h.alive) {
      if (!active || player.hp >= player.maxHp) continue;
      const dx = px - h.x, dy = py - h.y, dz = pz - h.z;
      if (Math.hypot(dx, dz) < 0.8 && Math.abs(dy) < 1.2) collectHeart(i);
    } else if (h.t < 1) { h.t = Math.min(1, h.t + dt * 2.6); h.y += dt * 2 * (1 - h.t); }
  }
  syncPickups(coins, coinObj); syncPickups(heartsP, heartObj);
}
const MILESTONES = { 5: 'Солнце садится', 10: 'Половина пути. Темнеет', 15: 'Тени становятся смелее' };
function collectCoin(i) {
  const c = coins[i];
  c.alive = false; c.t = 0;
  G.collected++;
  G.combo = G.comboT > 0 ? G.combo + 1 : 0; G.comboT = 2.2;
  SFX.coin(G.combo);
  for (let k = 0; k < 20; k++) glow.emit(c.x, c.y, c.z, rr(-2.6, 2.6), rr(1, 4.8), rr(-2.6, 2.6), rr(0.5, 0.9), 0.2, 0.05, C.gold, 1, 7, 1.6, 2);
  for (let k = 0; k < 10; k++) glow.emit(c.x, c.y, c.z, rr(-1.5, 1.5), rr(0.5, 3), rr(-1.5, 1.5), rr(0.6, 1.1), 0.08, 0.04, C.goldHot, 1, 3, 1, 1);
  if (c.y < SEA + 1.2) ripple(c.x, c.z, 1);
  setCoinsHud(true);
  wisp.flash = 1;
  G.todT = 0.04 + 0.96 * (G.collected / G.total);
  emit('coin', c, G.collected, G.total);
  const left = G.total - G.collected;
  if (left === 0) { G.all = true; G.wardenT = 1.6; toast('Все монеты! Но маяк кто-то стережёт…', 3000, false, 3); }
  else if (MILESTONES[G.collected]) toast(MILESTONES[G.collected], 2600);
  else if (left === 3) toast('Осталось три монеты', 2400);
}
function collectHeart(i) {
  const h = heartsP[i];
  h.alive = false; h.t = 0;
  player.hp = Math.min(player.maxHp, player.hp + 2);
  updateHearts(false);
  SFX.heal();
  for (let k = 0; k < 16; k++) glow.emit(h.x, h.y, h.z, rr(-2, 2), rr(1, 4), rr(-2, 2), rr(0.5, 0.9), 0.18, 0.04, C.heart, 1, 6, 1.6, 2);
  toast('+1 сердце', 1600, false, 0);
}
