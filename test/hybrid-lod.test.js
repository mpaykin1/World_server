'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createHybridLOD, importance } = require('../lib/hybrid-lod');

const cam = { x: 0, y: 0, z: 0 };
const ent = (z, extra) => Object.assign({ id: 'e1', x: 0, y: 0, z, radius: 0.5 }, extra);

test('importance падает с расстоянием и растёт с приоритетом', () => {
  const a = importance(ent(5), cam, 1, 800), b = importance(ent(50), cam, 1, 800);
  assert.ok(a > b);
  assert.ok(importance(ent(5, { priority: 2 }), cam, 1, 800) > a);
});

test('уровни: близко 3d, средне 2.5d, далеко 2d, очень далеко culled', () => {
  const l = createHybridLOD();
  const tiers = [200, 60, 10, 1].map((imp, i) =>
    l.update({ id: 'x' + i, x: 0, y: 0, z: 1, radius: 1 }, imp, 0, 0.016).tier);
  assert.deepStrictEqual(tiers, ['3d', '2.5d', '2d', 'culled']);
});

test('гистерезис: дрожание у порога не мерцает', () => {
  const l = createHybridLOD();
  const e = { id: 'a', x: 0, y: 0, z: 1, radius: 1 };
  let t = 0; let switches = 0; let prev = l.update(e, 130, t, 0.016).tier;
  for (let i = 0; i < 200; i++) {
    t += 0.1;
    const imp = 120 + Math.sin(i) * 10; // колеблется вокруг порога near3d
    const cur = l.update(e, imp, t, 0.1).tier;
    if (cur !== prev) switches++;
    prev = cur;
  }
  assert.ok(switches <= 2, 'переключений: ' + switches);
});

test('фаза анимации непрерывна при смене уровня', () => {
  const l = createHybridLOD();
  const e = { id: 'b', x: 0, y: 0, z: 1, radius: 1, phase: 0.1 };
  let t = 0, last = l.update(e, 200, t, 0).phase;
  for (const imp of [200, 200, 5, 5, 5, 200, 200]) {
    t += 0.3;
    const r = l.update(e, imp, t, 0.3);
    const d = (r.phase - last + 1) % 1;
    assert.ok(Math.abs(d - 0.3) < 1e-9, 'скачок фазы ' + d);
    last = r.phase;
  }
});

test('слабое устройство (budgetScale>1) уводит в более дешёвый уровень', () => {
  const e = { id: 'c', x: 0, y: 0, z: 1, radius: 1 };
  assert.strictEqual(createHybridLOD().update(e, 130, 0, 0).tier, '3d');
  assert.strictEqual(createHybridLOD().update(e, 130, 0, 0, 2).tier, '2.5d');
});

test('minDwell не даёт переключаться чаще', () => {
  const l = createHybridLOD({ minDwell: 1 });
  const e = { id: 'd', x: 0, y: 0, z: 1, radius: 1 };
  l.update(e, 200, 0, 0);
  assert.strictEqual(l.update(e, 5, 0.5, 0.5).tier, '3d');
  assert.strictEqual(l.update(e, 5, 1.1, 0.6).tier, '2d');
});

test('forget освобождает состояние, counts считает уровни', () => {
  const l = createHybridLOD();
  l.update({ id: 'z', x: 0, y: 0, z: 1, radius: 1 }, 200, 0, 0);
  assert.strictEqual(l.counts()['3d'], 1);
  l.forget('z');
  assert.strictEqual(l.size(), 0);
});
