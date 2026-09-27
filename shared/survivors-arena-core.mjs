// Seeded, deterministic, framework-free survivors mode. No shared-world writes.
export const ROLES = Object.freeze({
  warrior: { label: 'Воин', detail: 'Сильный автоматический выстрел', damage: 1.3, speed: 4.45, magnet: 2.2, aura: 0 },
  worker: { label: 'Рабочий', detail: 'Быстрее собирает опыт, создаёт ударные волны', damage: 1, speed: 4.7, magnet: 3.8, aura: 1 },
  mayor: { label: 'Мэр', detail: 'Помощники, дополнительный залп', damage: .85, speed: 4.2, magnet: 2.4, aura: 0 }
});
export const UPGRADES = Object.freeze({
  power: { label: 'Ударная сила', detail: '+35% урона', max: 4 },
  haste: { label: 'Темп огня', detail: 'Выстрелы чаще', max: 4 },
  salvo: { label: 'Ополчение', detail: 'Дополнительный снаряд', max: 3 },
  aura: { label: 'Ударная волна', detail: 'Периодический круговой урон', max: 4 },
  magnet: { label: 'Магнит', detail: 'Кристаллы летят к герою', max: 4 },
  speed: { label: 'Манёвр', detail: '+13% к скорости', max: 3 },
  health: { label: 'Укрытие', detail: '+24 к максимуму и лечению', max: 4 },
  chain: { label: 'Цепная реакция', detail: 'Повторный выстрел после уничтожения врага', max: 3 },
  pulse: { label: 'Резонанс', detail: 'Расширяет ударную волну и магнит', max: 3 }
});
const UPGRADE_KEYS = Object.keys(UPGRADES);
const TAU = Math.PI * 2;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function hashSeed(value) {
  let h = 2166136261;
  for (const ch of String(value)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0 || 1;
}
function rand(state) {
  let x = state.rng >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0 || 1;
  return state.rng / 4294967296;
}
export function createRun({ seed = 1, role = 'warrior', maxEnemies = 140, world = {} } = {}) {
  if (!ROLES[role]) throw new Error('Unknown survivor role');
  const base = ROLES[role];
  const tags = Array.isArray(world.tags) ? world.tags.filter(tag => ['city', 'forest', 'volcano', 'village', 'desert'].includes(tag)).slice(0, 8) : [];
  const levels = Object.fromEntries(UPGRADE_KEYS.map(key => [key, 0]));
  levels.aura = base.aura;
  levels.salvo = role === 'mayor' ? 1 : 0;
  return {
    seed: hashSeed(seed), rng: hashSeed(seed), role, world: { id: String(world.id || 'main').slice(0, 40), tags },
    t: 0, level: 1, xp: 0, nextXp: 7, kills: 0, combo: 0, comboTime: 0,
    maxEnemies: clamp(Math.trunc(maxEnemies) || 140, 30, 260), enemyId: 0,
    player: { x: 0, y: 0, hp: 100, maxHp: 100, invuln: 0, speed: base.speed, damage: base.damage, magnet: base.magnet },
    enemies: [], gems: [], shots: [], events: [], upgrades: levels,
    fireTimer: 0.18, auraTimer: 3.3, spawnTimer: 0.65, bossWave: 0,
    choices: [], paused: false, over: false, evolution: false
  };
}
function spawnEnemy(state, boss = false) {
  if (state.enemies.length >= state.maxEnemies) return;
  const angle = rand(state) * TAU, radius = 14 + rand(state) * 5, growth = 1 + state.t / 58;
  const hasVolcano = state.world.tags.includes('volcano');
  const hp = (boss ? 45 : 2.4 + state.t * .065) * growth;
  state.enemies.push({
    id: ++state.enemyId, x: state.player.x + Math.cos(angle) * radius,
    y: state.player.y + Math.sin(angle) * radius, hp, maxHp: hp,
    radius: boss ? 1.14 : .42 + rand(state) * .16,
    speed: (boss ? .67 : .95 + rand(state) * .35) * Math.min(1.65, 1 + state.t / 260),
    damage: boss ? 20 : 10, boss, kind: boss ? 'boss' : hasVolcano && rand(state) < .22 ? 'ember' : 'shade'
  });
  if (boss) state.events.push({ type: 'boss', x: state.player.x, y: state.player.y });
}
function nearest(state, x, y, maxRadius, except = -1) {
  let target = null, best = maxRadius * maxRadius;
  for (const e of state.enemies) {
    if (e.hp <= 0 || e.id === except) continue;
    const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; target = e; }
  }
  return target;
}
function fire(state) {
  const count = 1 + state.upgrades.salvo;
  const damage = 2.3 * state.player.damage * (1 + state.upgrades.power * .35);
  for (let i = 0; i < count; i++) {
    const target = nearest(state, state.player.x, state.player.y, 14);
    if (!target) break;
    const a = Math.atan2(target.y - state.player.y, target.x - state.player.x) + (i - (count - 1) / 2) * .16;
    state.shots.push({ x: state.player.x, y: state.player.y, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, damage, life: 1.06, chain: state.upgrades.chain });
  }
  if (state.shots.length > 100) state.shots.splice(0, state.shots.length - 100);
  if (count) state.events.push({ type: 'fire', x: state.player.x, y: state.player.y });
}
function eliminate(state, enemy) {
  enemy.hp = 0;
  state.kills++;
  state.combo = state.comboTime > 0 ? state.combo + 1 : 1;
  state.comboTime = 2.3;
  const amount = enemy.boss ? 9 : 1;
  state.gems.push({ x: enemy.x, y: enemy.y, amount });
  if (state.gems.length > 210) {
    const old = state.gems.shift();
    state.gems[0].amount += old.amount;
  }
  state.events.push({ type: enemy.boss ? 'boss-down' : 'kill', x: enemy.x, y: enemy.y, combo: state.combo });
}
function damageEnemy(state, enemy, damage, chain = 0) {
  if (enemy.hp <= 0) return;
  enemy.hp -= damage;
  state.events.push({ type: 'hit', x: enemy.x, y: enemy.y, damage: Math.round(damage * 10) / 10 });
  if (enemy.hp > 0) return;
  eliminate(state, enemy);
  if (chain <= 0) return;
  const next = nearest(state, enemy.x, enemy.y, 6 + chain * 1.5, enemy.id);
  if (next) {
    damageEnemy(state, next, damage * .75, chain - 1);
    state.events.push({ type: 'chain', x: enemy.x, y: enemy.y, tx: next.x, ty: next.y });
  }
}
function updateShots(state, dt) {
  for (const shot of state.shots) {
    shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
    if (shot.life <= 0) continue;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const dx = enemy.x - shot.x, dy = enemy.y - shot.y;
      if (dx * dx + dy * dy > (enemy.radius + .16) ** 2) continue;
      damageEnemy(state, enemy, shot.damage, shot.chain);
      shot.life = 0; break;
    }
  }
  state.shots = state.shots.filter(shot => shot.life > 0);
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
}
function pulse(state) {
  const level = state.upgrades.aura;
  if (!level) return;
  const radius = 2.8 + level * .85 + state.upgrades.pulse * .9;
  const damage = (2 + level * 1.65) * state.player.damage * (state.evolution ? 1.5 : 1);
  for (const e of state.enemies) {
    const dx = e.x - state.player.x, dy = e.y - state.player.y;
    if (dx * dx + dy * dy < (radius + e.radius) ** 2) damageEnemy(state, e, damage);
  }
  state.enemies = state.enemies.filter(e => e.hp > 0);
  state.events.push({ type: 'pulse', x: state.player.x, y: state.player.y, radius });
}
function drawChoices(state) {
  const available = UPGRADE_KEYS.filter(key => state.upgrades[key] < UPGRADES[key].max);
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(rand(state) * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  state.choices = available.slice(0, 3);
  state.paused = state.choices.length > 0;
  if (state.paused) state.events.push({ type: 'level', level: state.level });
}
export function pickUpgrade(state, id) {
  if (!state.paused || !state.choices.includes(id)) return false;
  const upgrade = UPGRADES[id];
  if (!upgrade || state.upgrades[id] >= upgrade.max) return false;
  state.upgrades[id]++;
  if (id === 'health') {
    state.player.maxHp += 24; state.player.hp = Math.min(state.player.maxHp, state.player.hp + 38);
  }
  if (id === 'magnet') state.player.magnet += 1.2;
  if (id === 'speed') state.player.speed *= 1.13;
  state.choices = []; state.paused = false;
  if (!state.evolution && state.upgrades.aura >= 2 && state.upgrades.magnet >= 2) {
    state.evolution = true; state.events.push({ type: 'evolution' });
  }
  state.events.push({ type: 'upgrade', id });
  return true;
}
function updateGems(state, dt) {
  const magnet = state.player.magnet + state.upgrades.pulse * .45;
  for (const gem of state.gems) {
    const dx = state.player.x - gem.x, dy = state.player.y - gem.y, dist = Math.hypot(dx, dy);
    if (dist < magnet && dist > .001) {
      const step = Math.min(dist, (3 + (magnet - dist) * 6) * dt);
      gem.x += dx / dist * step; gem.y += dy / dist * step;
    }
    if (Math.hypot(gem.x - state.player.x, gem.y - state.player.y) < .55) {
      gem.collected = true; state.xp += gem.amount; state.events.push({ type: 'gem', amount: gem.amount });
    }
  }
  state.gems = state.gems.filter(gem => !gem.collected);
  if (state.xp >= state.nextXp) {
    state.xp -= state.nextXp; state.level++;
    state.nextXp = Math.ceil(7 + state.level * 3.8 + state.level ** 1.3);
    drawChoices(state);
  }
}
export function stepRun(state, move = {}, dt = 1 / 60) {
  state.events = [];
  if (state.paused || state.over) return state;
  const delta = clamp(Number(dt) || 0, 0, 1 / 30);
  if (!delta) return state;
  state.t += delta;
  const mx = clamp(Number(move.x) || 0, -1, 1), my = clamp(Number(move.y) || 0, -1, 1);
  const magnitude = Math.max(1, Math.hypot(mx, my));
  state.player.x += mx / magnitude * state.player.speed * delta;
  state.player.y += my / magnitude * state.player.speed * delta;
  state.player.invuln = Math.max(0, state.player.invuln - delta);
  state.comboTime = Math.max(0, state.comboTime - delta);
  if (!state.comboTime) state.combo = 0;
  state.spawnTimer -= delta;
  if (state.spawnTimer <= 0) {
    const waveSize = 1 + Math.min(3, Math.floor(state.t / 55));
    for (let i = 0; i < waveSize; i++) spawnEnemy(state);
    state.spawnTimer += Math.max(.10, .52 - state.t * .0021);
  }
  if (state.t >= (state.bossWave + 1) * 42) { state.bossWave++; spawnEnemy(state, true); }
  for (const enemy of state.enemies) {
    const dx = state.player.x - enemy.x, dy = state.player.y - enemy.y, dist = Math.hypot(dx, dy) || .001;
    enemy.x += dx / dist * enemy.speed * delta;
    enemy.y += dy / dist * enemy.speed * delta;
    if (dist < enemy.radius + .43 && state.player.invuln <= 0) {
      state.player.hp = Math.max(0, state.player.hp - enemy.damage);
      state.player.invuln = .8;
      state.events.push({ type: 'hurt', hp: state.player.hp });
    }
  }
  state.fireTimer -= delta;
  if (state.fireTimer <= 0) { fire(state); state.fireTimer += Math.max(.16, .59 * Math.pow(.83, state.upgrades.haste)); }
  state.auraTimer -= delta;
  if (state.auraTimer <= 0) { pulse(state); state.auraTimer += Math.max(1.3, 3.4 - state.upgrades.aura * .28); }
  updateShots(state, delta);
  updateGems(state, delta);
  if (state.player.hp <= 0) { state.over = true; state.paused = false; state.events.push({ type: 'over', kills: state.kills }); }
  return state;
}
