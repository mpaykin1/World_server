'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const engine = require(path.resolve(__dirname, '../scripts/gap-closure-engine.js'));

test('adds viewport-fit=cover to existing viewport meta exactly once', () => {
  const input = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>';
  const first = engine.addViewportFit(input);
  assert.equal(first.changed, true);
  assert.match(first.content, /viewport-fit=cover/);
  const second = engine.addViewportFit(first.content);
  assert.equal(second.changed, false);
  assert.equal((second.content.match(/viewport-fit=cover/g) || []).length, 1);
});

test('adds viewport meta when absent', () => {
  const input = '<html><head><title>x</title></head><body></body></html>';
  const out = engine.addViewportFit(input);
  assert.equal(out.changed, true);
  assert.match(out.content, /name="viewport"/);
  assert.match(out.content, /viewport-fit=cover/);
});

test('deduplicates gaps and keeps higher severity', () => {
  const rows = engine.dedupeGaps([
    { key: 'x', severity: 'warning', evidence: { a: 1 } },
    { key: 'x', severity: 'blocker', evidence: { b: 2 } }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].severity, 'blocker');
  assert.equal(rows[0].evidence.b, 2);
});

test('release gate blocks releaseBlocking gaps and blockers only', () => {
  const failures = engine.gateFailures([
    { key: 'a', severity: 'warning', releaseBlocking: false },
    { key: 'b', severity: 'major', releaseBlocking: true },
    { key: 'c', severity: 'blocker', releaseBlocking: false }
  ], {}, 'release');
  assert.deepEqual(failures.map((x) => x.key), ['b', 'c']);
});

test('perfect gate requires zero warning-or-higher gaps', () => {
  const failures = engine.gateFailures([
    { key: 'a', severity: 'warning' },
    { key: 'b', severity: 'info' }
  ], { gates: { perfectReadiness: ['blocker', 'major', 'warning'] } }, 'perfect');
  assert.deepEqual(failures.map((x) => x.key), ['a']);
});
