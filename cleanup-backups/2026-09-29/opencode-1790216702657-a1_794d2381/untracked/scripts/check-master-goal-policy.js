'use strict';
// CHECK_MASTER_GOAL_POLICY
//
// Executable gate for the master-goal work-governance policy
// (data/master-goal-policy.json):
//   1. Fresh-bootstrap contract - canonical files must exist in the repo.
//   2. Coordinator governance invariants - the machine-readable policy must
//      stay the single source of truth for agent cost classes and offline
//      automation locks (no programmatic ChatGPT Work / Computer Use).
//   3. Zero-Chaos PC-health guard contract - desktop-ai-policy thresholds and
//      the mandatory pre/postflight library surface must be in place.
//   4. Codex daily share - real evidence only. A missing report log is
//      UNKNOWN (never a fabricated PASS, never a guessed zero); a measured
//      share above the cap is a hard FAIL.
//
// Deliberately deterministic and tolerant: on a fresh checkout with no
// runtime report log it returns PASS or UNKNOWN (exit 0), so `npm run check`
// stays green while any real cap violation still fails CI.
const fs = require('fs');
const path = require('path');

const ledger = require('../lib/agent-work-ledger');

const ROOT = path.resolve(__dirname, '..');
const POLICY_PATH = path.join(ROOT, 'data', 'master-goal-policy.json');

function evaluate(opts = {}) {
  const policy = ledger.loadPolicy(opts.policyPath || POLICY_PATH);
  const checks = {};

  // 1) Fresh-bootstrap contract -------------------------------------------------
  checks.bootstrap = { ok: true, foundation: {}, files: {} };
  for (const rel of policy.freshBootstrapFiles || []) {
    const exists = fs.existsSync(path.join(opts.root || ROOT, rel));
    checks.bootstrap.files[rel] = { exists };
    if (!exists) checks.bootstrap.ok = false;
  }

  // 2) Coordinator governance invariants ---------------------------------------
  checks.coordinator = {};
  let mc = null;
  try {
    mc = require('../scripts/master-coordinator.cjs');
  } catch (err) {
    checks.coordinator.ok = false;
    checks.coordinator.error = String((err && err.message) || err);
  }
  if (mc) {
    const classes = policy.agentCostClasses || { free: [], paidFallback: [], offlineOnly: [] };
    const paidFromCode = [...mc.PAID_FALLBACK_AGENTS].sort();
    const offlineFromCode = [...mc.OFFLINE_ONLY_AGENTS].sort();
    checks.coordinator.paidFallbackMatchesPolicy =
      JSON.stringify(paidFromCode) === JSON.stringify([...(classes.paidFallback || [])].sort());
    checks.coordinator.offlineOnlyMatchesPolicy =
      JSON.stringify(offlineFromCode) === JSON.stringify([...(classes.offlineOnly || [])].sort());
    const automated = [...mc.LOCAL_MODEL_AGENTS, ...mc.CLOUD_MODEL_AGENTS, ...mc.SELF_EXECUTE_AGENTS, ...mc.PAID_FALLBACK_AGENTS];
    checks.coordinator.noProgrammaticOfflineAgents = offlineFromCode.every((id) => !automated.includes(id));
    checks.coordinator.codexIsPaidFallbackOnly =
      !mc.LOCAL_MODEL_AGENTS.has('codex') && !mc.CLOUD_MODEL_AGENTS.has('codex') && !mc.SELF_EXECUTE_AGENTS.has('codex') && mc.PAID_FALLBACK_AGENTS.has('codex');
    let planAgents = [];
    try {
      planAgents = mc.buildDefaultSubtasks('master-goal governance target', {}).map((s) => s.agent);
    } catch { /* keep planAgents empty; the gate still reports the invariant */ }
    checks.coordinator.defaultPlanExcludesCodex = !planAgents.includes('codex');
    checks.coordinator.defaultPlanStartsWithFreeAgents = planAgents.length >= 2 &&
      planAgents.slice(0, 2).every((id) => ledger.classifyAgent(id, policy).costClass === 'free');
    checks.coordinator.ok = Object.keys(checks.coordinator)
      .filter((k) => k !== 'ok' && !k.endsWith('Error'))
      .every((k) => checks.coordinator[k] === true);
  }

  // 3) Zero-Chaos PC-health guard contract --------------------------------------
  checks.zeroChaos = { ok: true };
  try {
    const dap = JSON.parse(fs.readFileSync(path.join(opts.root || ROOT, 'data', 'desktop-ai-policy.json'), 'utf8'));
    const hygiene = dap.sessionHygiene || {};
    checks.zeroChaos.worktreesRootOffDesktop = /World_server_worktrees/i.test(String(hygiene.worktreesRoot || ''));
    checks.zeroChaos.aiRootOffDesktop = /WorldServerAI|World_server_worktrees/i.test(String(hygiene.aiRoot || ''));
    checks.zeroChaos.ramFloorPresent = typeof hygiene.minFreeRamPercent === 'number' && hygiene.minFreeRamPercent >= 15;
    checks.zeroChaos.ramWarnAt25 = hygiene.warnFreeRamPercent === 25;
    checks.zeroChaos.diskFloorPresent = typeof hygiene.minFreeDiskGB === 'number' && hygiene.minFreeDiskGB >= 5;
    let guard = null;
    try {
      guard = require('../lib/agent-session-guard');
    } catch (err) {
      checks.zeroChaos.error = String((err && err.message) || err);
    }
    checks.zeroChaos.prePostflightSurface = Boolean(guard && typeof guard.preflight === 'function' && typeof guard.postflight === 'function');
    let coverageOk = false;
    if (guard) {
      try {
        coverageOk = guard.coverageFor(['openhuman', 'anythingllm', 'opencode']).every((c) => c.preflight && c.postflight);
      } catch {
        coverageOk = false;
      }
    }
    checks.zeroChaos.localAgentsCovered = coverageOk;
    checks.zeroChaos.ok = ['worktreesRootOffDesktop', 'aiRootOffDesktop', 'ramFloorPresent', 'ramWarnAt25', 'diskFloorPresent', 'prePostflightSurface', 'localAgentsCovered']
      .every((k) => checks.zeroChaos[k] === true);
  } catch (err) {
    checks.zeroChaos.ok = false;
    checks.zeroChaos.error = String((err && err.message) || err);
  }

  // 4) Codex daily share from the shared coordinator report log -----------------
  const reportLog = process.env.AI_AGENT_REPORTS_PATH || path.join(opts.root || ROOT, policy.reportLogRelativePath || 'state/ai-agent-reports.jsonl');
  let share;
  if (!fs.existsSync(reportLog)) {
    share = {
      state: 'UNKNOWN',
      codexCount: 0,
      totalCount: 0,
      unknownClassCount: 0,
      share: 0,
      cap: Number(policy.codexDailyShareCap),
      logPath: reportLog,
      missingLog: true,
      reason: 'report log not present; absence of evidence treated as UNKNOWN, not as PASS',
    };
  } else {
    const { records, invalidLines } = ledger.readReportRecords(reportLog);
    share = ledger.codexShare(ledger.dailyRecords(records, new Date().toISOString()), policy);
    share.logPath = reportLog;
    share.invalidLines = invalidLines;
    share.recordsTotal = records.length;
  }
  checks.codexShare = share;

  const hardFails = [
    ...(checks.bootstrap.ok ? [] : ['bootstrap']),
    ...(checks.coordinator.ok ? [] : ['coordinator']),
    ...(checks.zeroChaos.ok ? [] : ['zeroChaos']),
    ...(share.state === 'FAIL' ? ['codexShare'] : []),
  ];
  const overall = hardFails.length ? 'FAIL' : share.state === 'UNKNOWN' ? 'UNKNOWN' : 'PASS';
  return {
    gate: 'master-goal-policy',
    policyId: policy.policyId,
    schemaVersion: policy.schemaVersion,
    overall,
    checks,
    at: new Date().toISOString(),
  };
}

function main() {
  const report = evaluate();
  console.log(JSON.stringify(report, null, 2));
  const summary = Object.entries(report.checks).map(([k, v]) => `${k}=${Object.prototype.hasOwnProperty.call(v, 'state') ? v.state : (v.ok ? 'PASS' : 'FAIL')}`).join(' ');
  console.log(`master-goal-policy gate: ${report.overall} (${summary})`);
  if (report.overall === 'FAIL') {
    process.stderr.write('MASTER-GOAL-POLICY GATE FAILED (hard invariant or measured Codex-share cap violation)\n');
    process.exitCode = 1;
  }
}

module.exports = { evaluate, main, ROOT, POLICY_PATH };

if (require.main === module) main();