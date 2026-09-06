'use strict';
// Regression tests for scripts/lib/dockerignore-guard.cjs — the matcher used
// by `scripts/google-ai-studio-slots.cjs build-guard` to make sure a future
// .dockerignore edit never silently excludes a file the running container
// actually needs (see AGENTS.md Cloud Run readiness notes).

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDockerignore, isIgnored, findIgnoredRequiredPaths } = require('../scripts/lib/dockerignore-guard.cjs');
test('recursive patterns include root paths and descendants of matching directories', () => {
  const rules = parseDockerignore('**/node_modules\n**/.env*\n**/shared');
  for (const p of ['node_modules/a/index.js','nested/node_modules/a.js','.env','nested/.env.local','shared/common.js']) {
    assert.equal(isIgnored(rules,p),true,p);
  }
  assert.deepEqual(findIgnoredRequiredPaths('**/shared',['shared/common.js']),['shared/common.js']);
  assert.equal(isIgnored(rules,'server.js'),false);
});

test('a directory-prefix pattern ignores everything under it, not just the exact name', () => {
  const rules = parseDockerignore('scripts/\n');
  assert.equal(isIgnored(rules, 'scripts/foo.js'), true);
  assert.equal(isIgnored(rules, 'scripts/nested/bar.js'), true);
  assert.equal(isIgnored(rules, 'scripts-other/foo.js'), false, 'must not match a sibling dir with a shared prefix');
  assert.equal(isIgnored(rules, 'not-scripts/scripts/foo.js'), false, 'must not match scripts/ nested somewhere unrelated');
});

test('an exact filename pattern matches only that path, not files that merely start with it', () => {
  const rules = parseDockerignore('.env\n');
  assert.equal(isIgnored(rules, '.env'), true);
  assert.equal(isIgnored(rules, '.env.local'), false);
});

test('a glob pattern matches by suffix within a path segment', () => {
  const rules = parseDockerignore('*.log\n');
  assert.equal(isIgnored(rules, 'server.log'), true);
  assert.equal(isIgnored(rules, 'nested/dir/server.log'), true);
  assert.equal(isIgnored(rules, 'server.log.txt'), false);
});

test('negation un-ignores a path even after a broader ignore rule, in file order', () => {
  const rules = parseDockerignore('.env*\n!.env.example\n');
  assert.equal(isIgnored(rules, '.env'), true);
  assert.equal(isIgnored(rules, '.env.example'), false);
});

test('a later rule overrides an earlier one for the same path (last match wins)', () => {
  const rules = parseDockerignore('server.js\n!server.js\n');
  assert.equal(isIgnored(rules, 'server.js'), false);
});

test('comments and blank lines are ignored, not treated as patterns', () => {
  const rules = parseDockerignore('# comment\n\n  \nnode_modules/\n');
  assert.equal(rules.length, 1);
});

test('findIgnoredRequiredPaths reports only the required paths a real .dockerignore would exclude', () => {
  const content = [
    '.git/',
    'node_modules/',
    'test/',
    'scripts/',
  ].join('\n');
  const required = ['server.js', 'package.json', 'scripts/google-ai-studio-slots.cjs', 'shared/common.js'];
  assert.deepEqual(findIgnoredRequiredPaths(content, required), ['scripts/google-ai-studio-slots.cjs']);
});

test('findIgnoredRequiredPaths returns empty when nothing required is shadowed', () => {
  const content = ['.git/', 'node_modules/', '.env*', '!.env.example'].join('\n');
  const required = ['server.js', 'package.json', 'google-ai-studio/cloudrun-entry.cjs'];
  assert.deepEqual(findIgnoredRequiredPaths(content, required), []);
});
