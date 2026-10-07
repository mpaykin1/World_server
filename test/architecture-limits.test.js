const test = require('node:test');
const assert = require('node:assert/strict');
const { metrics, regressions } = require('../scripts/check-architecture-limits.cjs');

test('counts imports across supported common forms', () => {
  const result = metrics('import x from "x";\nfrom y import z\nconst q = require("q");\nconst n = 1;');
  assert.equal(result.imports, 3);
});

test('blocks a new file-size violation', () => {
  assert.deepEqual(regressions({ lines: 401, imports: 0 }, { lines: 399, imports: 0 }), ['401 lines > 400']);
});

test('allows legacy debt that improves or stays flat', () => {
  assert.deepEqual(regressions({ lines: 800, imports: 12 }, { lines: 900, imports: 12 }), []);
  assert.deepEqual(regressions({ lines: 900, imports: 12 }, { lines: 900, imports: 12 }), []);
});

test('blocks worsening legacy debt', () => {
  assert.deepEqual(regressions({ lines: 901, imports: 13 }, { lines: 900, imports: 12 }), [
    '901 lines > 400',
    '13 imports > 10',
  ]);
});
