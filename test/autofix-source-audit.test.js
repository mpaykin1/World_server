'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../scripts/autofix-source-audit.cjs');
function report(files, extras = {}) {
  return { mode: 'apply', changes: files.map(file => ({ file, applied: true })),
    errors: [], ...extras };
}
test('no repair but 34 regenerated reports = no PR', () => {
  assert.deepEqual(classify(report([]), ['AUTOFIX_REPORT.json']), []);
});
test('real file verified against actual git diff, including root config', () => {
  assert.deepEqual(classify(report(['package.json', 'apps/city/index.html']),
    ['AUTOFIX_REPORT.json', 'package.json', 'apps/city/index.html']),
    ['package.json', 'apps/city/index.html']);
});
test('report-only source claim cannot generate PR', () => {
  assert.deepEqual(classify(report(['package.json']), ['AUTOFIX_REPORT.json']), []);
});
test('undeclared modified file is rejected rather than silently published', () => {
  assert.throws(() => classify(report(['test/a.js']), ['.github/workflows/bot.yml']),
    /Unreported/);
});
test('invalid report, failed repair and path traversal are rejected', () => {
  assert.throws(() => classify(report(['../escape.js']), []), /Invalid/);
  assert.throws(() => classify(report(['\nunsafe']), []), /Invalid/);
  assert.throws(() => classify(report([], { errors: [{ recipe: 'fail' }] }), []), /Invalid/);
  assert.throws(() => classify(report([], { mode: 'plan' }), []), /Invalid/);
  assert.throws(() => classify({ changes: [] }, []), /Invalid/);
});
