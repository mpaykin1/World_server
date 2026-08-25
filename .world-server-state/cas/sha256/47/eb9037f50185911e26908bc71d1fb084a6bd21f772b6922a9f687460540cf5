'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runAutopilot, nextQualityGoal } = require('../lib/quality-autopilot');

function fixture(html, js = 'console.log("ok")\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-autopilot-'));
  fs.mkdirSync(path.join(root, 'apps', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'demo', 'index.html'), html);
  fs.writeFileSync(path.join(root, 'apps', 'demo', 'app.js'), js);
  fs.writeFileSync(path.join(root, 'config', 'quality-autopilot.json'), JSON.stringify({
    projectRoots: ['apps'],
    entryFiles: ['index.html'],
    qualityGoals: [80, 90, 95, 98],
    safeFixes: ['html-meta-charset', 'html-meta-viewport', 'text-final-newline'],
    budget: { maxProjectsPerRun: 10, maxFixesPerProject: 4, maxRuntimeSeconds: 30, maxFileBytesToInspect: 2000000 },
    performance: { warnProjectBytes: 8000000, warnSingleFileBytes: 2000000 },
    protectedMetrics: { allowScoreDrop: 0, allowNewSyntaxErrors: 0, allowNewMissingEntries: 0 },
    golden: { minimumSuccessfulProjects: 3 },
    verificationCommands: []
  }, null, 2));
  return root;
}

test('observe mode never mutates source files', () => {
  const root = fixture('<!doctype html><html><head></head><body></body></html>');
  const file = path.join(root, 'apps', 'demo', 'index.html');
  const before = fs.readFileSync(file, 'utf8');
  const run = runAutopilot({ repoRoot: root, mode: 'observe' });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(run.summary.acceptedFixes, 0);
});

test('candidate mode adds safe mobile metadata and improves score', () => {
  const root = fixture('<!doctype html><html><head></head><body></body></html>');
  const run = runAutopilot({ repoRoot: root, mode: 'candidate', verify: false });
  const html = fs.readFileSync(path.join(root, 'apps', 'demo', 'index.html'), 'utf8');
  assert.match(html, /charset="utf-8"/i);
  assert.match(html, /name="viewport"/i);
  assert.ok(run.summary.acceptedFixes >= 2);
  assert.ok(run.summary.averageAfter >= run.summary.averageBefore);
  assert.ok(fs.existsSync(path.join(root, 'data', 'quality-autopilot', 'memory.json')));
  assert.ok(fs.existsSync(path.join(root, 'WORK_IN_PROGRESS.md')));
});

test('syntax errors are visible in protected quality metrics', () => {
  const root = fixture('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body></body></html>', 'function broken( {\n');
  const run = runAutopilot({ repoRoot: root, mode: 'observe' });
  assert.equal(run.projects[0].before.metrics.syntaxErrorCount, 1);
  assert.ok(run.projects[0].before.score < 100);
});

test('quality goals advance progressively', () => {
  assert.equal(nextQualityGoal(71, [80, 90, 95]), 80);
  assert.equal(nextQualityGoal(80, [80, 90, 95]), 90);
  assert.equal(nextQualityGoal(96, [80, 90, 95]), 100);
});
