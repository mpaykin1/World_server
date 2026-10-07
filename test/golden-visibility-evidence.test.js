'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('../scripts/summarize-golden-visibility.cjs');

function report(statuses) {
  return { suites: [{ specs: statuses.map(([project, status], index) => ({
    title: `visible-${index}`,
    tests: [{ projectName: project, status }]
  })) }] };
}

test('visibility evidence is exact-SHA and threshold aware', () => {
  const evidence = summarize(report([
    ['desktop-chromium', 'expected'],
    ['mobile-chromium', 'expected'],
    ['mobile-webkit', 'expected'],
    ['tablet-chromium', 'expected']
  ]), 'a'.repeat(40));
  assert.equal(evidence.visibilityPercent, 100);
  assert.equal(evidence.exactSha, 'a'.repeat(40));
  assert.equal(evidence.ready, true);
});

test('one profile below 85 percent fails closed', () => {
  const evidence = summarize(report([
    ['desktop-chromium', 'expected'],
    ['mobile-webkit', 'unexpected']
  ]), 'b'.repeat(40));
  assert.equal(evidence.visibilityPercent, 50);
  assert.equal(evidence.ready, false);
});
