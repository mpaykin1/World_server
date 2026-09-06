#!/usr/bin/env node
'use strict';
// NATIVE_REGRESSION_LOOP — this cycle's explicit instruction: "Native сейчас
// WORKING и Web<->Native equivalence PASS. Не переписывай. Только добавь его
// в общий continuous regression loop... Запускай тяжёлые native проверки
// разумно, чтобы они не мешали LLM benchmark." (Native is working and
// equivalence passes. Don't rewrite it. Just add it to the general
// continuous regression loop... run the heavy native checks sensibly so
// they don't interfere with the LLM benchmark.)
//
// This deliberately does NOT touch scripts/godot-native-build.js or
// scripts/compare-worldgen.js's own logic - it just calls the existing,
// already-working run() (preflight -> headless-export ->
// artifact-verification -> smoke-test -> web-native-equivalence, unchanged)
// and adds the two things it was actually missing: (1) a real history
// record across runs, so "continuous" means something (a growing,
// inspectable track record, not a one-shot check that forgets itself), and
// (2) safe standalone invocation, kept entirely separate from
// lib/agent-adapters.js's implementGoal / the LLM benchmark scripts - this
// is never called from that hot path, only run on its own (by hand, or on
// whatever external schedule the operator sets up), so a slow ~3-4 minute
// native export/smoke-test never adds latency to an unrelated agent task.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'data', 'collective-brain', 'runtime', 'native-regression-history.jsonl');

function appendHistory(entry) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.appendFileSync(HISTORY_PATH, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  } catch { /* best effort - a history-write failure must never fail the actual regression check */ }
}

function readHistory(limit = 50) {
  try {
    const lines = fs.readFileSync(HISTORY_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function run() {
  const godotNativeBuild = require('./godot-native-build.js');
  // Portable, honest skip - not a failure: a host without Godot installed
  // (e.g. a CI runner, or a machine this project is cloned onto for the
  // first time) genuinely cannot run this check, and that is a different,
  // clearly-labeled outcome from a real regression.
  if (!fs.existsSync(godotNativeBuild.GODOT_BIN)) {
    const result = { status: 'NOT_APPLICABLE', reason: `Godot binary not found at ${godotNativeBuild.GODOT_BIN} on this host`, ok: null };
    appendHistory(result);
    return result;
  }
  const startedAt = Date.now();
  const report = godotNativeBuild.run();
  const durationMs = Date.now() - startedAt;
  const history = readHistory();
  const priorPasses = history.filter((h) => h.ok === true).length;
  const priorRuns = history.filter((h) => h.ok !== null).length;
  const result = {
    status: report.ok ? 'PASS' : 'FAIL', ok: report.ok, durationMs,
    steps: report.steps.map((s) => ({ step: s.step, ok: s.ok, durationMs: s.durationMs, error: s.error || null })),
    artifactPath: report.artifactPath,
    historicalPassRate: priorRuns ? `${priorPasses}/${priorRuns} (${((priorPasses / priorRuns) * 100).toFixed(0)}%) before this run` : 'no prior runs recorded',
  };
  appendHistory(result);
  return result;
}

if (require.main === module) {
  const result = run();
  console.log(JSON.stringify(result, null, 2));
  console.log(`[NATIVE_REGRESSION_LOOP] ${result.status}`);
  process.exitCode = result.status === 'FAIL' ? 1 : 0; // NOT_APPLICABLE is not a failure
}

module.exports = { run, appendHistory, readHistory, HISTORY_PATH };
