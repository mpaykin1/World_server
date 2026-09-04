'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const compiler = require('../lib/scoped-task-compiler');

const ROOT = path.resolve(__dirname, '..');

test('compileContext: level 1 finds an explicitly-named real file and puts it first', () => {
  const goal = 'In apps/ai3d-voxel-city/index.html, add viewport-fit=cover to the meta viewport tag.';
  const ctx = compiler.compileContext(ROOT, goal, 1);
  assert.equal(ctx.full, false);
  assert.equal(ctx.files[0], 'apps/ai3d-voxel-city/index.html');
  assert.ok(ctx.files.length <= 5, 'level 1 must stay small');
});

test('compileContext: level 1 never returns more files than the small cap', () => {
  const goal = 'fix the voxel world controls camera bug in apps and scripts and lib and data everywhere';
  const ctx = compiler.compileContext(ROOT, goal, 1);
  assert.ok(ctx.files.length <= 5);
});

test('compileContext: level 2 returns a bounded, larger set than level 1', () => {
  const goal = 'In apps/ai3d-voxel-city/index.html, add viewport-fit=cover to the meta viewport tag.';
  const l1 = compiler.compileContext(ROOT, goal, 1);
  const l2 = compiler.compileContext(ROOT, goal, 2);
  assert.ok(l2.files.length >= l1.files.length);
  assert.ok(l2.files.length <= 20);
  assert.ok(l2.files.includes('apps/ai3d-voxel-city/index.html'), 'level 2 must still include the explicit target file');
});

test('compileContext: level 3 is always the full-repo fallback with no file list', () => {
  const ctx = compiler.compileContext(ROOT, 'anything at all', 3);
  assert.equal(ctx.full, true);
  assert.deepEqual(ctx.files, []);
});

test('extractExplicitPaths: ignores a mentioned path that does not actually exist (no false confidence)', () => {
  const paths = compiler.extractExplicitPaths(ROOT, 'edit apps/this-app-does-not-exist-xyz/index.html please');
  assert.equal(paths.length, 0);
});

test('extractExplicitPaths: finds multiple real files mentioned in one goal', () => {
  const paths = compiler.extractExplicitPaths(ROOT, 'compare package.json and server.js for consistency');
  assert.ok(paths.includes('package.json'));
  assert.ok(paths.includes('server.js'));
});

test('keywordSearch: an empty/gibberish goal returns nothing rather than noise', () => {
  const results = compiler.keywordSearch(ROOT, 'zzqx flibbertigibbet qwzxjk', 8);
  assert.equal(results.length, 0);
});

test('compileContext: a goal with zero signal at level 1 still returns a small (possibly empty) set, never crashes', () => {
  const ctx = compiler.compileContext(ROOT, '', 1);
  assert.equal(ctx.full, false);
  assert.ok(Array.isArray(ctx.files));
});

// --- Regression: root cause found live this cycle via a real A/B trace.
// A real, single-file goal was pulling in lib/agent-adapters.js,
// lib/resource-scheduler.js, lib/ollama-patch-adapter.js and a benchmark
// JSON as "context" for a one-line HTML fix, because (1) plain substring
// matching matched "cover" inside "discover-ai3d-engines.js"/"discovery"
// and generic short words ("name","meta","existing") almost everywhere,
// and (2) this project's own knownErrors entries about the agent
// pipeline's OWN reliability mention its own lib/ source files in their
// rootCause text and share vocabulary with this exact recurring benchmark
// task. This directly explained real production 'timeout' classifications
// that were actually a router/context-compiler misroute, not a model
// failure - the bloated multi-file prompt blew past the timeout ceiling
// every time. ---

test('knownIssueFileRefs/keywordSearch: real word-boundary matching, not substring - "cover" must not match inside "discover"', () => {
  const refs = compiler.keywordSearch(ROOT, 'add viewport-fit=cover to the meta tag', 8);
  assert.ok(!refs.some((r) => r.includes('discover-ai3d-engines')), `must not match "cover" as a substring of "discover": got ${JSON.stringify(refs)}`);
});

test('compileContext: the exact real goal that exposed the bug now scopes to ONLY the explicit target file at level 1', () => {
  const goal = 'In apps/ai3d-voxel-city/index.html, add viewport-fit=cover to the content attribute of the existing <meta name="viewport"> tag.';
  const ctx = compiler.compileContext(ROOT, goal, 1);
  assert.deepEqual(ctx.files, ['apps/ai3d-voxel-city/index.html'], `level 1 must not attach unrelated pipeline-infrastructure files: got ${JSON.stringify(ctx.files)}`);
});

test('knownIssueFileRefs: never returns this agent pipeline\'s own lib/ source files, even when a registry entry mentions them', () => {
  const refs = compiler.knownIssueFileRefs(ROOT, 'meta viewport name existing cover ollama local patch');
  for (const r of refs) {
    assert.ok(!/^lib\/(agent-|ollama-|resource-scheduler|scoped-task-compiler|autonomous-issue-picker)/.test(r), `must not self-reference agent pipeline source: got ${r}`);
  }
});

test('knownIssueFileRefs: a single incidental generic-word overlap is not enough evidence to contribute a file ref', () => {
  const refs = compiler.knownIssueFileRefs(ROOT, 'the existing name of the cover');
  assert.deepEqual(refs, [], `a lone generic-word match must not pull in unrelated files: got ${JSON.stringify(refs)}`);
});

// --- Real relevance scoring + WHY_SELECTED transparency (this cycle) ---

test('scoreCandidate: an explicit mention always scores far above any keyword/knownIssue match', () => {
  const explicitScore = compiler.scoreCandidate({ file: 'apps/x/index.html', source: 'explicit', explicitPaths: ['apps/x/index.html'] }).score;
  const keywordScore = compiler.scoreCandidate({ file: 'apps/y/index.html', source: 'keyword', matchedWords: ['voxel', 'city', 'terrain'] }).score;
  assert.ok(explicitScore > keywordScore * 10, 'explicit must dominate even a strong multi-word keyword match');
});

test('scoreCandidate: a specific (>=6 char) matched word is weighted higher than a short generic one', () => {
  const specific = compiler.scoreCandidate({ file: 'a.js', source: 'keyword', matchedWords: ['viewport'] }).score;
  const generic = compiler.scoreCandidate({ file: 'a.js', source: 'keyword', matchedWords: ['meta'] }).score;
  assert.ok(specific > generic, `a specific word ("viewport") must score higher than a short generic one ("meta"): ${specific} vs ${generic}`);
});

test('scoreCandidate: a file sharing a top-level directory with an explicit file gets a real relevance bonus', () => {
  const withBonus = compiler.scoreCandidate({ file: 'apps/x/styles.css', source: 'keyword', matchedWords: ['style'], explicitPaths: ['apps/x/index.html'] }).score;
  const withoutBonus = compiler.scoreCandidate({ file: 'apps/y/styles.css', source: 'keyword', matchedWords: ['style'], explicitPaths: ['apps/x/index.html'] }).score;
  assert.ok(withBonus > withoutBonus, 'a sibling of an explicitly-named file must score higher than an unrelated file matched by the same keyword');
});

test('compileContext: a knownIssue candidate below the relevance floor is dropped, not silently truncated by the cap', () => {
  const ctx = compiler.compileContext(ROOT, 'the existing name of the cover apps/ai3d-voxel-city/index.html', 1);
  assert.ok(!ctx.files.some((f) => f !== 'apps/ai3d-voxel-city/index.html' && f.startsWith('lib/')), `a weak match must never occupy a context slot: got ${JSON.stringify(ctx.files)}`);
});

test('compileContext: a generic bug-description word ("broken") alone does not pull in unrelated test files - real bug found live checking a "broken navigation link" goal', () => {
  const ctx = compiler.compileContext(ROOT, 'In apps/catalog/index.html, fix a broken navigation link.', 1);
  assert.deepEqual(ctx.files, ['apps/catalog/index.html'], `a generic word like "broken" must not admit unrelated files: got ${JSON.stringify(ctx.files)}`);
});

test('compileContext: exposes a real, inspectable whySelected reason for every selected file', () => {
  const goal = 'In apps/ai3d-voxel-city/index.html, add viewport-fit=cover to the content attribute of the existing <meta name="viewport"> tag.';
  const ctx = compiler.compileContext(ROOT, goal, 1);
  assert.ok(ctx.whySelected, 'compileContext must return a whySelected map');
  const entry = ctx.whySelected['apps/ai3d-voxel-city/index.html'];
  assert.ok(entry, 'the selected file must have a real whySelected entry');
  assert.equal(entry.source, 'explicit');
  assert.ok(Array.isArray(entry.reasons) && entry.reasons.length > 0);
});
