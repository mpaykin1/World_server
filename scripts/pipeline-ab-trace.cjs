#!/usr/bin/env node
'use strict';
// PIPELINE_AB_TRACE - point 1 this cycle's explicit mandate: for the SAME
// task/file/model/context, run Path A (direct isolated adapter call,
// exactly what the opt-in live test in test/ollama-patch-adapter.test.js
// does) and Path B (the real, full agent_implement production pipeline),
// and log every stage transition with hashes/bytes/timeouts/durations/exact
// failure reasons - not a guess, a real side-by-side measurement.
//
// Usage: node scripts/pipeline-ab-trace.cjs [--goal "..." --file "relPath"]
// With no args, picks a real, currently-unresolved candidate from the error
// -prevention registry via the existing autonomous issue picker (never
// fabricates a task).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function now() { return Date.now(); }

function resetWorktree(dir) {
  spawnSync('git', ['checkout', '--', '.'], { cwd: dir, encoding: 'utf8', timeout: 15000 });
  spawnSync('git', ['clean', '-fd'], { cwd: dir, encoding: 'utf8', timeout: 15000 });
}

async function main() {
  const args = process.argv.slice(2);
  const goalIdx = args.indexOf('--goal');
  const fileIdx = args.indexOf('--file');
  const skipVerify = args.includes('--no-verify');

  let goal, relFile;
  if (goalIdx !== -1 && fileIdx !== -1) {
    goal = args[goalIdx + 1];
    relFile = args[fileIdx + 1];
  } else {
    const picker = require('../lib/autonomous-issue-picker');
    const c = picker.findCandidate(ROOT);
    if (!c.found) { console.error('No real candidate found in the registry - nothing to trace.'); process.exit(1); }
    goal = c.goal;
    relFile = c.details.file;
    console.log(`Picked real candidate ${c.id}: ${relFile}`);
  }

  const report = { goal, relFile, goalHash: sha256(goal), startedAt: new Date().toISOString(), pathA: null, pathB: null };

  const adapters = require('../lib/agent-adapters');
  const ollamaAdapter = require('../lib/ollama-patch-adapter');
  const stc = require('../lib/scoped-task-compiler');

  // One isolated worktree, reused for both paths (reset between them) so
  // file content/hashes are byte-identical across A and B.
  const wt = adapters.createIsolatedWorktree(ROOT, 'ab-trace');
  if (!wt.ok) { console.error('worktree creation failed:', wt.error); process.exit(1); }
  console.log(`Worktree: ${wt.worktreePath} (${wt.branch})`);

  const model = ollamaAdapter.DEFAULT_PATCH_MODEL;

  try {
    // ---------------- PATH A: direct isolated adapter ----------------
    console.log('\n=== PATH A: direct isolated adapter (invokeOllamaPatch, no orchestration) ===');
    const absFile = path.join(wt.worktreePath, relFile);
    const preContent = fs.readFileSync(absFile, 'utf8');
    const preHash = sha256(preContent);
    const aStart = now();
    const aResult = await ollamaAdapter.invokeOllamaPatch(model, goal, wt.worktreePath, [relFile], { timeoutMs: 150000 });
    const aDuration = now() - aStart;
    report.pathA = {
      model, scopedFiles: [relFile], preContentHash: preHash, preContentBytes: Buffer.byteLength(preContent, 'utf8'),
      durationMs: aDuration, ok: aResult.ok, classification: aResult.classification, error: aResult.error,
      attempts: (aResult.attempts || []).map((a) => ({ attempt: a.attempt, ok: a.ok, durationMs: a.durationMs, error: a.error, context: a.context })),
      editsApplied: aResult.editsApplied, touchedFiles: aResult.touchedFiles,
    };
    console.log(JSON.stringify(report.pathA, null, 2));
    resetWorktree(wt.worktreePath);

    // ---------------- PATH B: full production agent_implement ----------------
    console.log('\n=== PATH B: full production implementGoal (real pipeline, unmodified) ===');
    // Log the SAME context-compilation stage production will use internally
    // (pure function, deterministic - calling it separately here does not
    // change what implementGoal itself does, just lets us see it).
    const level1Ctx = stc.compileContext(ROOT, goal, 1);
    console.log('Level-1 scoped context (this is what production will actually hand the model):', JSON.stringify(level1Ctx.files));
    const bStart = now();
    const bResult = await adapters.implementGoal({
      mainRoot: ROOT, goal, targetWorktree: wt.worktreePath,
      models: [`ollama:${model.startsWith('ollama:') ? model.slice('ollama:'.length) : model}`],
      verifyScript: skipVerify ? null : 'check', maxContextLevel: 2,
    });
    const bDuration = now() - bStart;
    report.pathB = {
      level1ScopedFiles: level1Ctx.files, verifyScript: skipVerify ? null : 'check',
      durationMs: bDuration, ok: bResult.ok, needsEscalation: bResult.needsEscalation,
      attempts: bResult.attempts, ollamaHealth: bResult.ollamaHealth, error: bResult.error,
    };
    console.log(JSON.stringify(report.pathB, null, 2));
  } finally {
    resetWorktree(wt.worktreePath);
    adapters.removeIsolatedWorktree(ROOT, wt.worktreePath);
    console.log(`\nWorktree cleaned up: ${wt.worktreePath}`);
  }

  const outPath = path.join(ROOT, 'scratch-ab-trace-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to ${outPath}`);

  console.log('\n=== SUMMARY ===');
  console.log(`Path A (direct):     ok=${report.pathA.ok} classification=${report.pathA.classification} durationMs=${report.pathA.durationMs}`);
  console.log(`Path B (production): ok=${report.pathB.ok} durationMs=${report.pathB.durationMs} attempts=${JSON.stringify((report.pathB.attempts || []).map(a => a.classification))}`);
  if (report.pathA.ok !== report.pathB.ok) {
    console.log(`GAP CONFIRMED: direct succeeded=${report.pathA.ok}, production succeeded=${report.pathB.ok}`);
  } else {
    console.log('No gap on this run: both paths agree.');
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
