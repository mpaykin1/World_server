const test = require('node:test');
const assert = require('node:assert/strict');
const { EMPTY_TREE, metrics, regressions, resolveBaseRef } = require('../scripts/check-architecture-limits.cjs');

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

test('local feature branches prefer origin/master merge-base', () => {
  const runGit = (args) => args.join(' ') === 'merge-base HEAD origin/master' ? 'remote-base-sha' : '';
  assert.equal(resolveBaseRef({ env: {}, branch: 'feature/test', runGit }), 'remote-base-sha');
});

test('local feature branches without origin fall back to local master merge-base', () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    if (args.join(' ') === 'merge-base HEAD master') return 'local-base-sha';
    return '';
  };
  assert.equal(resolveBaseRef({ env: {}, branch: 'feature/test', runGit }), 'local-base-sha');
  assert.ok(calls.some((args) => args.join(' ') === 'merge-base HEAD origin/master'));
  assert.ok(calls.some((args) => args.join(' ') === 'merge-base HEAD master'));
});

test('master uses a verified parent when one exists', () => {
  const runGit = (args) => args.join(' ') === 'rev-parse --verify HEAD^' ? 'parent-sha' : '';
  assert.equal(resolveBaseRef({ env: {}, branch: 'master', runGit }), 'parent-sha');
});

test('single-commit or shallow checkout uses git empty tree instead of invalid HEAD parent', () => {
  assert.equal(resolveBaseRef({ env: {}, branch: 'master', runGit: () => '' }), EMPTY_TREE);
});
