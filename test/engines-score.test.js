'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { evaluate, nextSteps, regressions } = require('../scripts/engines-score.cjs');

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-'));
  for (const [p, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), t); }
  return root;
}
const gate = (p, re) => [{ t: 'has', p, re }];
const def = {
  gates: { G1: 'a', G2: 'b', G3: 'c', G4: 'd', G5: 'e' },
  engines: [
    { id: 'a', order: 1, title: 'A', after: [], blocked_by_owner: {}, checks: { G1: gate('a.md', 'x'), G2: gate('a.js', 'y'), G3: [], G4: [], G5: [] } },
    { id: 'b', order: 2, title: 'B', after: [{ engine: 'a', gate: 'G2' }], blocked_by_owner: { G2: ['Q1'] }, checks: { G1: gate('b.md', 'x'), G2: gate('b.js', 'y'), G3: [], G4: [], G5: [] } }
  ],
  infra: [], visible_backlog: [{ id: 'visible.one', title: 'v', checks: gate('v.txt', 'ok') }]
};

test('процент считается по фактам файлов, пустая проверка не засчитывается', () => {
  const root = fixture({ 'a.md': 'x', 'a.js': 'y' });
  const r = evaluate(def, { root, run: false });
  assert.strictEqual(r.engines.a.pct, 40);
  assert.strictEqual(r.engines.b.pct, 0);
  assert.strictEqual(r.engines.a.gates.G3, false);
});

test('проверка второй репы без META6_DIR даёт unknown и не засчитывается', () => {
  const root = fixture({});
  const d = { ...def, engines: [{ ...def.engines[0], checks: { ...def.engines[0].checks, G1: [{ t: 'has', repo: 'meta6', p: 'z', re: 'x' }] } }] };
  const r = evaluate(d, { root, meta6: null, run: false });
  assert.strictEqual(r.engines.a.gates.G1, false);
});

test('следующий шаг: контракт G1 не ждёт зависимостей, G2 ждёт верхний движок, вопрос владельца уходит в очередь', () => {
  const root = fixture({ 'a.md': 'x', 'a.js': 'y' });
  const r = evaluate(def, { root, run: false });
  const n = nextSteps(def, r);
  assert.strictEqual(n.ENGINES.id, 'a.G3');
  assert.strictEqual(n.VISIBLE.id, 'visible.one');
  const root2 = fixture({ 'a.md': 'x', 'a.js': 'y', 'b.md': 'x' });
  const n2 = nextSteps(def, evaluate(def, { root: root2, run: false }));
  assert.ok(n2.OWNER_QUEUE.some((s) => s.startsWith('b.G2')));
});

test('регрессия процента обнаруживается', () => {
  const root = fixture({ 'a.md': 'x' });
  const r = evaluate(def, { root, run: false });
  const drops = regressions(r, { engines: { a: { pct: 40 } } });
  assert.strictEqual(drops.length, 1);
});
