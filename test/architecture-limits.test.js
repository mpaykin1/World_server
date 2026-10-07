const test = require('node:test');
const assert = require('node:assert/strict');
const { metrics, regressions, resolveBaseRef } = require('../scripts/check-architecture-limits.cjs');

test('counts imports across supported common forms', () => {
  const result = metrics('import x from "x";\nfrom y import z\nconst q = require("q");\nconst n = 1;');
  assert.equal(result.imports, 3);
});

test('does not count ordinary const/arrow assignments as imports', () => {
  const result = metrics('const myFunc = () => 1;\nconst x = (y) => y;\nlet value = compute();');
  assert.equal(result.imports, 0);
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

test('PR base resolves through merge-base so multi-commit branches are checked as a whole', () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    if (args.join(' ') === 'merge-base HEAD origin/master') return 'base-sha';
    return '';
  };
  assert.equal(resolveBaseRef({
    env: { GITHUB_BASE_REF: 'master' },
    branch: 'HEAD',
    runGit,
  }), 'base-sha');
  assert.ok(calls.some((args) => args.join(' ') === 'merge-base HEAD origin/master'));
});

test('local feature branches also use origin/master merge-base', () => {
  const runGit = (args) => args[0] === 'merge-base' ? 'local-base-sha' : '';
  assert.equal(resolveBaseRef({ env: {}, branch: 'feature/test', runGit }), 'local-base-sha');
});

test('master falls back to previous commit when no explicit base exists', () => {
  assert.equal(resolveBaseRef({ env: {}, branch: 'master', runGit: () => '' }), 'HEAD^');
});
