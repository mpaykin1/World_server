#!/usr/bin/env node
'use strict';
// ANYTHINGLLM_E2E_REPRODUCIBILITY
//
// Runs the same task through anythingllm-task-router.cjs N times (default 3), each
// in a fresh thread (so no run is biased by a prior failed attempt's history), and
// records every outcome into the model-suitability ledger. A single lucky PASS is
// not evidence the routing fix works - this is what actually proves it.
const { runTask } = require('./anythingllm-task-router.cjs');
const { recordOutcome } = require('../lib/model-suitability');
const { route } = require('../lib/mcp-intent-router');
const fs = require('fs');
const path = require('path');

const ANYTHINGLLM_URL = process.env.ANYTHINGLLM_URL || 'http://127.0.0.1:3001';
const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY;
const WORKSPACE_SLUG = process.env.ANYTHINGLLM_WORKSPACE || 'world';
const MODEL_NAME = process.env.ANYTHINGLLM_MODEL || 'qwen3:1.7b';

async function newThread() {
  const res = await fetch(`${ANYTHINGLLM_URL}/api/v1/workspace/${WORKSPACE_SLUG}/thread/new`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANYTHINGLLM_API_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const j = await res.json();
  return j.thread.slug;
}

async function runN(taskText, n = 3, opts = {}) {
  const { capabilityClass } = route(taskText);
  const runs = [];
  for (let i = 1; i <= n; i++) {
    const threadSlug = await newThread();
    const r = await runTask(taskText, { workspaceSlug: WORKSPACE_SLUG, threadSlug, timeoutMs: opts.timeoutMs, respectResourceGate: opts.respectResourceGate });
    recordOutcome(MODEL_NAME, capabilityClass, r.result);
    runs.push({ run: i, threadSlug, ...r });
    if (opts.onRun) opts.onRun(runs[runs.length - 1]);
  }
  const passCount = runs.filter((r) => r.result === 'PASS').length;
  const report = {
    test: 'ANYTHINGLLM_E2E_REPRODUCIBILITY',
    generatedAt: new Date().toISOString(),
    taskText,
    capabilityClass,
    model: MODEL_NAME,
    totalRuns: n,
    passCount,
    result: passCount === n ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
    runs: runs.map((r) => ({
      run: r.run,
      result: r.result,
      retries: r.retries,
      attempts: r.attempts.map((a) => ({ attemptNum: a.attemptNum, ok: a.ok, mismatchDetected: a.mismatchDetected, promptTokens: a.promptTokens, completionTokens: a.completionTokens, durationMs: a.durationMs, timedOut: a.timedOut, reason: a.reason })),
    })),
  };
  return report;
}

module.exports = { runN };

if (require.main === module) {
  const taskText = process.argv[2];
  const n = Number(process.argv[3] || 3);
  if (!taskText) { console.error('usage: node anythingllm-e2e-reproducibility.cjs "<task text>" [n]'); process.exit(1); }
  const respectResourceGate = process.env.ANYTHINGLLM_E2E_RESPECT_GATE !== 'false';
  runN(taskText, n, { respectResourceGate, onRun: (r) => console.error(`[run ${r.run}/${n}] ${r.result}`) })
    .then((report) => {
      fs.writeFileSync(path.join(__dirname, '..', 'ANYTHINGLLM_E2E_REPRODUCIBILITY.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.result === 'PASS' ? 0 : 1;
    })
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
