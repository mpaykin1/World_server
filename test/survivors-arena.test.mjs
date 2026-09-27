import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ROLES, UPGRADES, hashSeed, createRun, pickUpgrade, stepRun } from '../shared/survivors-arena-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (name) => readFileSync(path.join(root, name), 'utf8');

test('all three inhabitant roles have distinct playable stats', () => {
  assert.deepEqual(Object.keys(ROLES), ['warrior', 'worker', 'mayor']);
  const a = createRun({ role:'warrior' });
  const b = createRun({ role:'worker' });
  const c = createRun({ role:'mayor' });
  assert.ok(a.player.damage > b.player.damage);
  assert.ok(b.player.magnet > a.player.magnet);
  assert.equal(b.upgrades.aura, 1);
  assert.equal(c.upgrades.salvo, 1);
  assert.throws(() => createRun({ role:'dragon' }), /Unknown/);
});

test('same seed and same movements reproduce exact entities, gems, upgrades, and rng state', () => {
  const opts = { seed:'main-forest-2026', role:'mayor', world:{id:'main', tags:['forest','city']} };
  const first = createRun(opts), second = createRun(opts);
  for (let frame = 0; frame < 1800; frame++) {
    const move = frame % 240 < 120 ? { x:1, y:.2 } : { x:-.6, y:-.6 };
    stepRun(first, move); stepRun(second, move);
    if (first.paused || second.paused) {
      assert.deepEqual(first.choices, second.choices);
      if (first.choices.length) {
        assert.equal(pickUpgrade(first, first.choices[0]), true);
        assert.equal(pickUpgrade(second, second.choices[0]), true);
      }
    }
  }
  assert.deepEqual(first, second);
  assert.equal(hashSeed('repeatable'), hashSeed('repeatable'));
  assert.ok(first.enemies.length > 0 || first.kills > 0);
});

test('auto targeting fires while moving and drops collectable experience on kill', () => {
  const state = createRun({ seed:4 });
  state.enemies.push({ id:999, x:.5, y:0, hp:1, maxHp:1, radius:.4, speed:0, damage:1, kind:'shade', boss:false });
  state.fireTimer = 0;
  for (let frame = 0; frame < 12; frame++) stepRun(state, { x:1 });
  assert.equal(state.kills, 1);
  assert.ok(state.xp > 0 || state.gems.length > 0);
  assert.ok(state.player.x > 0);
});

test('three distinct choices pause the entire simulation and invalid upgrades are rejected', () => {
  const state = createRun({ seed:17 });
  state.xp = state.nextXp - 1;
  state.gems.push({ x:0, y:0, amount:1 });
  stepRun(state);
  assert.equal(state.level, 2);
  assert.equal(state.paused, true);
  assert.equal(state.choices.length, 3);
  assert.equal(new Set(state.choices).size, 3);
  const time = state.t, x = state.player.x, choice = state.choices[0];
  stepRun(state, { x:1 }, .3);
  assert.equal(state.t, time); assert.equal(state.player.x, x);
  assert.equal(pickUpgrade(state, 'nonexistent'), false);
  assert.equal(pickUpgrade(state, choice), true);
  assert.equal(state.upgrades[choice], choice === 'aura' ? 1 : 1);
  assert.equal(state.paused, false);
  stepRun(state, { x:1 });
  assert.ok(state.t > time);
});

test('magnet+aura synergy evolves and character can be healed using the existing choice system', () => {
  const state = createRun({ seed:19, role:'warrior' });
  state.upgrades.aura = 2;
  state.upgrades.magnet = 1;
  state.paused = true; state.choices = ['magnet'];
  assert.equal(pickUpgrade(state, 'magnet'), true);
  assert.equal(state.evolution, true);
  assert.ok(state.events.some(event => event.type === 'evolution'));
  state.player.hp = 45;
  state.paused = true; state.choices = ['health'];
  assert.equal(pickUpgrade(state, 'health'), true);
  assert.equal(state.player.maxHp, 124);
  assert.equal(state.player.hp, 83);
});

test('enemy count and projectile/gem allocation are hard capped for mobile', () => {
  const state = createRun({ seed:12, maxEnemies:5, role:'worker', world:{tags:['volcano','arbitrary']} });
  assert.equal(state.maxEnemies, 30);
  assert.deepEqual(state.world.tags, ['volcano']);
  state.player.invuln = 999;
  state.fireTimer = 999; state.auraTimer = 999;
  for (let i = 0; i < 180; i++) {
    state.spawnTimer = 0; stepRun(state);
  }
  assert.equal(state.enemies.length, 30);
  assert.ok(state.shots.length <= 100);
  assert.ok(state.gems.length <= 210);
  assert.ok(state.events.length < 100);
  assert.equal(createRun({ maxEnemies:9999 }).maxEnemies, 260);
});

test('elite enemy appears on a predictable 42 second milestone', () => {
  const state = createRun({ seed:9 });
  state.player.invuln = 100;
  state.t = 41.99; state.spawnTimer = 10;
  stepRun(state, {}, 1/30);
  assert.equal(state.bossWave, 1);
  assert.ok(state.enemies.some(enemy => enemy.boss));
});

test('new app is opt-in; only reads canonical world, keeps assets original and exposes diagnostic evidence', () => {
  const js = source('apps/survivors-arena/client.js');
  const html = source('apps/survivors-arena/index.html');
  const render = source('apps/survivors-arena/render.mjs');
  const registry = JSON.parse(source('data/app-release-registry.json'));
  assert.match(js, /action: 'macro_read'/);
  assert.doesNotMatch(js, /macro_place|macro_tick|set_block|player_save/);
  assert.match(js, /__SURVIVORS_ARENA_READY__/);
  for (const id of ['pad','knob','role-modal','upgrade-modal','end-modal','xp-bar']) assert.ok(html.includes('id="' + id + '"'));
  assert.ok(render.includes('createPainter'));
  assert.ok(!registry.apps['survivors-arena'] || registry.apps['survivors-arena'].status !== 'certified');
  assert.equal(Object.keys(UPGRADES).length, 9);
});
