#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'data', 'quiet-quality-autopilot.json');
const REPORT_PATH = path.join(ROOT, 'QUIET_AUTOPILOT_REPORT.json');
const STATE_DIR = path.join(ROOT, '.quality-autopilot-state');
const STATE_PATH = path.join(STATE_DIR, 'state.json');
const HISTORY_PATH = path.join(STATE_DIR, 'history.jsonl');
const LOCK_PATH = path.join(STATE_DIR, 'lock.json');
const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'improve' : 'monitor';

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function nowIso() { return new Date().toISOString(); }
function clip(text, max) {
  const s = String(text || '').trim();
  return s.length <= max ? s : s.slice(-max);
}
function sha256(text) { return crypto.createHash('sha256').update(String(text || '')).digest('hex'); }
function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = deepMerge(out[k] || {}, v);
    else out[k] = v;
  }
  return out;
}

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('[QUIET_AUTOPILOT] missing data/quiet-quality-autopilot.json');
  process.exit(2);
}
const baseConfig = readJson(CONFIG_PATH);
const learnedPolicy = readJson(path.join(STATE_DIR, 'learned-policy.json'), {});
const config = deepMerge(baseConfig, learnedPolicy?.configOverrides || {});
const resources = config.resources || {};
const MAX_OUTPUT = Number(resources.maxCapturedOutputChars || 5000);
const MAX_TOTAL_MS = Number((APPLY ? resources.improveMaxMinutes : resources.monitorMaxMinutes) || 50) * 60 * 1000;
const DEFAULT_STEP_TIMEOUT = Number(resources.defaultStepTimeoutMinutes || 12) * 60 * 1000;
const startedWall = Date.now();

let state = readJson(STATE_PATH, {
  schemaVersion: '1.0.0',
  totalCycles: 0,
  healthyStreak: 0,
  degradedStreak: 0,
  breakerOpen: false,
  breakerHealthyCooldown: 0,
  lastStatus: null,
  lastDepth: null,
  lastRunAt: null,
  failedImproveStreak: 0,
  mutationBreakerUntil: null
});

const report = {
  system: config.system,
  schemaVersion: config.schemaVersion,
  mode: MODE,
  startedAt: nowIso(),
  productionBaseUrl: process.env.QUALITY_BASE_URL || config.productionBaseUrl,
  depth: null,
  steps: [],
  productionDegraded: false,
  candidate: null,
  candidateGuard: null,
  rollback: { attempted: false },
  verification: { score: 0, evidence: [] },
  circuitBreaker: null,
  mutationBreaker: null,
  adaptiveCadence: null,
  learnedPolicy: { mode: learnedPolicy?.mode || 'NONE', records: Number(learnedPolicy?.records || 0), blockedRecipeIds: learnedPolicy?.blockedRecipeIds || [] },
  resourceBudget: { maxTotalMs: MAX_TOTAL_MS, consumedMs: 0, exhausted: false },
  status: 'RUNNING'
};

function saveReport() {
  report.finishedAt = nowIso();
  report.resourceBudget.consumedMs = Date.now() - startedWall;
  writeJson(REPORT_PATH, report);
}
function appendHistory(summary) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  let lines = [];
  try { lines = fs.readFileSync(HISTORY_PATH, 'utf8').split(/\r?\n/).filter(Boolean); } catch (_) {}
  lines.push(JSON.stringify(summary));
  const limit = Number(resources.historyLimit || 120);
  fs.writeFileSync(HISTORY_PATH, lines.slice(-limit).join('\n') + '\n');
}
function persistState() {
  state.totalCycles = Number(state.totalCycles || 0) + 1;
  state.lastStatus = report.status;
  state.lastDepth = report.depth;
  state.lastRunAt = nowIso();
  if (MODE === 'improve') {
    const failedMutationStatuses = new Set([
      'AUTOFIX_FAILED_ROLLED_BACK',
      'CANDIDATE_REJECTED_ROLLED_BACK',
      'NO_AUTOFIX_EVIDENCE_ROLLED_BACK',
      'RELEASE_GATE_FAILED_ROLLED_BACK',
      'REGRESSION_TEST_FAILED_ROLLED_BACK',
      'INSUFFICIENT_IMPROVEMENT_EVIDENCE_ROLLED_BACK'
    ]);
    if (failedMutationStatuses.has(report.status)) {
      state.failedImproveStreak = Number(state.failedImproveStreak || 0) + 1;
      const threshold = Number(config.mutationBreaker?.openAfterFailedImproveCycles || 2);
      if (state.failedImproveStreak >= threshold) {
        const cooldownMs = Number(config.mutationBreaker?.cooldownHours || 24) * 60 * 60 * 1000;
        state.mutationBreakerUntil = new Date(Date.now() + cooldownMs).toISOString();
      }
    } else if (report.status === 'HEALTHY_NO_CHANGE') {
      state.failedImproveStreak = 0;
      state.mutationBreakerUntil = null;
    }
  }
  writeJson(STATE_PATH, state);
  appendHistory({
    at: state.lastRunAt,
    mode: MODE,
    depth: report.depth,
    status: report.status,
    productionDegraded: report.productionDegraded,
    breakerOpen: state.breakerOpen,
    verificationScore: report.verification.score,
    durationMs: Date.now() - startedWall
  });
}
function finalize(code) {
  saveReport();
  persistState();
  releaseLock();
  process.exit(code);
}

function acquireLock() {
  if (config.lock?.enabled === false) return;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const previous = readJson(LOCK_PATH);
  if (previous?.createdAt) {
    const age = Date.now() - Date.parse(previous.createdAt);
    const staleMs = Number(config.lock?.staleMinutes || 90) * 60 * 1000;
    if (Number.isFinite(age) && age >= 0 && age < staleMs) {
      report.status = 'SKIPPED_ALREADY_RUNNING';
      report.lock = previous;
      saveReport();
      process.exit(0);
    }
  }
  writeJson(LOCK_PATH, { pid: process.pid, createdAt: nowIso(), mode: MODE });
}
function releaseLock() {
  try {
    const lock = readJson(LOCK_PATH);
    if (!lock || lock.pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch (_) {}
}
process.on('SIGINT', () => finalize(130));
process.on('SIGTERM', () => finalize(143));
process.on('uncaughtException', (err) => {
  report.status = 'UNCAUGHT_EXCEPTION';
  report.error = String(err?.stack || err);
  try { finalize(99); } catch (_) { process.exit(99); }
});

function budgetLeft() { return MAX_TOTAL_MS - (Date.now() - startedWall); }
function run(label, command, args = [], options = {}) {
  const remaining = budgetLeft();
  if (remaining <= 0) {
    report.resourceBudget.exhausted = true;
    const record = { label, status: 124, durationMs: 0, skipped: true, reason: 'global budget exhausted' };
    report.steps.push(record);
    return record;
  }
  const timeout = Math.max(1000, Math.min(options.timeoutMs || DEFAULT_STEP_TIMEOUT, remaining));
  const started = Date.now();
  const result = cp.spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  });
  const record = {
    label,
    status: Number.isInteger(result.status) ? result.status : 1,
    durationMs: Date.now() - started,
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
    stdout: clip(result.stdout, MAX_OUTPUT),
    stderr: clip(result.stderr, MAX_OUTPUT)
  };
  report.steps.push(record);
  report.resourceBudget.consumedMs = Date.now() - startedWall;
  if (budgetLeft() <= 0) report.resourceBudget.exhausted = true;
  console.log(`[QUIET_AUTOPILOT] ${label}: ${record.status === 0 ? 'OK' : 'FAIL'} ${record.durationMs}ms`);
  return record;
}
function nodeScript(label, filename, args = [], options = {}) {
  return run(label, process.execPath, [path.join(ROOT, 'scripts', filename), ...args], options);
}
function npm(label, args, options = {}) {
  return run(label, process.platform === 'win32' ? 'npm.cmd' : 'npm', args, options);
}
function rawGit(args) {
  return cp.spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
}
function candidateRootStatus() {
  const r = rawGit(['status', '--porcelain', '--', 'apps', 'e2e', 'test']);
  return { status: r.status, text: String(r.stdout || '').trim(), stderr: clip(r.stderr, MAX_OUTPUT) };
}
function sourceDiff() {
  const r = rawGit(['diff', '--numstat', '--', 'apps', 'e2e', 'test']);
  if (r.status !== 0) return { files: [], lines: 0, error: clip(r.stderr, MAX_OUTPUT) };
  const rows = String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const files = [];
  let lines = 0;
  for (const row of rows) {
    const [a, d, ...rest] = row.split('\t');
    const file = rest.join('\t');
    const additions = a === '-' ? 0 : Number(a || 0);
    const deletions = d === '-' ? 0 : Number(d || 0);
    files.push({ file, additions, deletions });
    lines += additions + deletions;
  }
  return { files, lines, fingerprint: sha256(JSON.stringify(files)) };
}
function rollbackCandidate() {
  const r = rawGit(['checkout', '--', 'apps', 'e2e', 'test']);
  report.rollback = {
    attempted: true,
    status: Number.isInteger(r.status) ? r.status : 1,
    stderr: clip(r.stderr, MAX_OUTPUT)
  };
}
function chooseDepth() {
  if (APPLY && config.adaptive?.forceDeepOnImprove !== false) return 'deep';
  if (state.degradedStreak >= Number(config.adaptive?.deepModeAfterDegradedCycles || 1)) return 'deep';
  if (state.healthyStreak >= Number(config.adaptive?.healthyCyclesForLightMode || 4)) return 'light';
  return 'standard';
}
function adaptiveCadenceHours() {
  const c = config.adaptive?.cadenceHours || {};
  if (state.breakerOpen) return Number(c.breakerOpen || 1);
  if (Number(state.degradedStreak || 0) > 0) return Number(c.degraded || 1);
  if (Number(state.healthyStreak || 0) >= Number(config.adaptive?.healthyCyclesForLightMode || 4)) return Number(c.healthy || 6);
  return Number(c.standard || 3);
}
function shouldSkipScheduledMonitor() {
  if (APPLY || process.env.QUIET_AUTOPILOT_SCHEDULED !== '1' || !state.lastRunAt) return false;
  const previous = Date.parse(state.lastRunAt);
  if (!Number.isFinite(previous)) return false;
  const hours = adaptiveCadenceHours();
  const nextEligible = previous + hours * 60 * 60 * 1000;
  report.adaptiveCadence = { hours, previousRunAt: state.lastRunAt, nextEligibleAt: new Date(nextEligible).toISOString() };
  return Date.now() < nextEligible;
}
function mutationBreakerOpen() {
  const until = state.mutationBreakerUntil ? Date.parse(state.mutationBreakerUntil) : NaN;
  const open = Number.isFinite(until) && Date.now() < until;
  if (!open && state.mutationBreakerUntil) state.mutationBreakerUntil = null;
  report.mutationBreaker = {
    open,
    failedImproveStreak: Number(state.failedImproveStreak || 0),
    until: open ? state.mutationBreakerUntil : null
  };
  return open;
}
function updateBreaker() {
  const breaker = config.circuitBreaker || {};
  if (report.productionDegraded) {
    state.degradedStreak = Number(state.degradedStreak || 0) + 1;
    state.healthyStreak = 0;
    state.breakerHealthyCooldown = 0;
    if (state.degradedStreak >= Number(breaker.openAfterConsecutiveDegradedCycles || 3)) state.breakerOpen = true;
  } else {
    state.healthyStreak = Number(state.healthyStreak || 0) + 1;
    state.degradedStreak = 0;
    if (state.breakerOpen) {
      state.breakerHealthyCooldown = Number(state.breakerHealthyCooldown || 0) + 1;
      if (state.breakerHealthyCooldown >= Number(breaker.cooldownHealthyCycles || 2)) {
        state.breakerOpen = false;
        state.breakerHealthyCooldown = 0;
      }
    }
  }
  report.circuitBreaker = {
    open: Boolean(state.breakerOpen),
    healthyStreak: state.healthyStreak,
    degradedStreak: state.degradedStreak,
    healthyCooldown: state.breakerHealthyCooldown
  };
}
function addEvidence(name, points, detail) {
  report.verification.evidence.push({ name, points, detail });
  report.verification.score += points;
}

acquireLock();
report.depth = chooseDepth();
if (shouldSkipScheduledMonitor()) {
  report.status = 'SKIPPED_ADAPTIVE_CADENCE';
  finalize(0);
}
mutationBreakerOpen();

const baseUrl = report.productionBaseUrl;
const monitor = config.monitor || {};
const analysisFailures = [];

if (monitor.production) {
  const prod = nodeScript('production quality telemetry', 'production-quality-pull.js', [], {
    env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 60 * 1000
  });
  const smoke = nodeScript('production HTTP smoke', 'post-deploy-smoke.js', [], {
    env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 90 * 1000
  });
  report.productionDegraded = prod.status !== 0 || smoke.status !== 0;
  if (monitor.realDeviceRum) {
    const rum = nodeScript('real-device RUM gate', 'quality-real-device-rum.js', [], { env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 90 * 1000 });
    report.productionDegraded = report.productionDegraded || rum.status !== 0;
    if (rum.status === 0) addEvidence('real-device-rum', 1, 'RUM healthy or gathering minimum evidence');
  }
  if (monitor.geographicDeviceGate) {
    const geo = nodeScript('real-user geographic/device evidence', 'quality-geographic-device-gate.js', [], { env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 90 * 1000 });
    report.productionDegraded = report.productionDegraded || geo.status !== 0;
    if (geo.status === 0) addEvidence('geographic-device-evidence', 1, 'country/region + device evidence healthy or gathering samples');
  }
  if (monitor.mobileGpuProfiler) {
    const gpu = nodeScript('mobile WebGL/thermal-pressure gate', 'quality-mobile-gpu-profiler.js', [], { env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 90 * 1000 });
    report.productionDegraded = report.productionDegraded || gpu.status !== 0;
    if (gpu.status === 0) addEvidence('mobile-gpu-pressure', 1, 'real-device GPU/WebGL pressure healthy or gathering samples');
  }
  if (monitor.realDeviceVisualOracle) {
    const visual = nodeScript('real-device visual oracle', 'quality-real-device-visual-oracle.js', [], { env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 90 * 1000 });
    report.productionDegraded = report.productionDegraded || visual.status !== 0;
    if (visual.status === 0) addEvidence('real-device-visual-oracle', 1, 'privacy-preserving visual evidence healthy or gathering samples');
  }
  if (monitor.rendererTuner) {
    const tuner = nodeScript('adaptive renderer tuner evidence', 'quality-renderer-tuner-gate.js', [], { env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 90 * 1000 });
    report.productionDegraded = report.productionDegraded || tuner.status !== 0;
    if (tuner.status === 0) addEvidence('renderer-tuner', 1, 'safe runtime tuning evidence healthy');
  }
  if (monitor.traceCriticalPathOptimizer) {
    const traceOpt = nodeScript('trace critical-path optimizer', 'quality-trace-critical-path-optimizer.js', [], { timeoutMs: 120 * 1000 });
    if (traceOpt.status !== 0) analysisFailures.push({ label: 'trace critical-path optimizer', status: traceOpt.status });
    else addEvidence('trace-critical-path', 1, 'critical paths analyzed and prioritized');
  }
  if (monitor.chaosFailover && report.depth !== 'light') {
    const chaos = nodeScript('non-destructive chaos/failover proof', 'quality-chaos-failover.js', [], { env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 120 * 1000 });
    report.productionDegraded = report.productionDegraded || chaos.status !== 0;
    if (chaos.status === 0) addEvidence('chaos-failover', 1, 'isolated failure recovery and core live dependencies passed');
  }
  if (monitor.traceContinuity) {
    const otel = nodeScript('OpenTelemetry continuity', 'quality-otel-bridge-check.js', [], { timeoutMs: 90 * 1000 });
    report.productionDegraded = report.productionDegraded || otel.status !== 0;
    if (otel.status === 0) addEvidence('otel-continuity', 1, 'W3C trace bridge core healthy');
  }
  if (monitor.multiRegion) {
    const regions = nodeScript('multi-region production probes', 'quality-multi-region-probe.js', [], { env: { QUALITY_BASE_URL: baseUrl }, timeoutMs: 120 * 1000 });
    report.productionDegraded = report.productionDegraded || regions.status !== 0;
    if (regions.status === 0) addEvidence('multi-region-probes', 1, 'regional probes healthy or pending first deployment');
  }
  if (!report.productionDegraded) addEvidence('production-observation-healthy', 1, 'telemetry + smoke passed');
}
updateBreaker();

const depth = report.depth;
const analysisSteps = [];
if (monitor.runtimeTechnologyHealth) analysisSteps.push(['runtime technology health', 'technology-runtime-health.js', 'light']);
if (monitor.qualityTrend) analysisSteps.push(['quality trend', 'quality-trend-monitor.js', 'light']);
if (monitor.costOptimization) analysisSteps.push(['cost/performance optimization', 'quality-cost-optimizer.js', 'standard']);
if (monitor.riskPrediction) analysisSteps.push(['risk prediction', 'quality-risk-predictor.js', 'standard']);
if (monitor.technologyOrchestration) analysisSteps.push(['technology orchestration', 'technology-orchestrator.js', 'standard']);
if (monitor.rootCause) analysisSteps.push(['root-cause analysis', 'quality-root-cause.js', 'deep']);
if (monitor.testGapSynthesis) analysisSteps.push(['test-gap synthesis', 'test-gap-synthesizer.js', 'deep']);
if (monitor.selfEvolution) analysisSteps.push(['quality self-evolution', 'quality-self-evolve.js', 'deep']);
if (monitor.masterReport) analysisSteps.push(['quality master report', 'quality-master-report.js', 'deep']);

const rank = { light: 0, standard: 1, deep: 2 };
for (const [label, file, minimumDepth] of analysisSteps) {
  if (rank[depth] < rank[minimumDepth]) continue;
  const r = nodeScript(label, file);
  if (r.status !== 0) analysisFailures.push({ label, status: r.status });
  if (report.resourceBudget.exhausted) break;
}

if (analysisFailures.length) {
  report.analysisFailures = analysisFailures;
  report.productionDegraded = true;
  if (APPLY) {
    report.status = report.resourceBudget.exhausted ? 'RESOURCE_BUDGET_EXHAUSTED' : 'ANALYSIS_FAILED';
    finalize(20);
  }
  report.status = report.resourceBudget.exhausted ? 'MONITOR_DEGRADED_RESOURCE_BUDGET' : 'MONITOR_DEGRADED_ANALYSIS';
  finalize(0);
}
if (report.resourceBudget.exhausted) {
  report.status = 'RESOURCE_BUDGET_EXHAUSTED';
  finalize(25);
}
if (!APPLY) {
  report.status = state.breakerOpen ? 'MONITOR_CIRCUIT_OPEN' : (report.productionDegraded ? 'MONITOR_DEGRADED' : 'MONITOR_HEALTHY');
  finalize(0);
}

if (mutationBreakerOpen() && config.mutationBreaker?.blockAutoChangesWhileOpen !== false) {
  report.status = 'IMPROVEMENT_BLOCKED_BY_MUTATION_BREAKER';
  finalize(0);
}

if (state.breakerOpen && config.circuitBreaker?.blockAutoChangesWhileOpen !== false) {
  report.status = 'IMPROVEMENT_BLOCKED_BY_CIRCUIT_BREAKER';
  finalize(0);
}

if (config.policy?.requireCleanCandidateRoots !== false) {
  const dirty = candidateRootStatus();
  if (dirty.status !== 0 || dirty.text) {
    report.candidateGuard = { dirtyBeforeApply: dirty };
    report.status = 'IMPROVEMENT_SKIPPED_DIRTY_WORKTREE';
    finalize(0);
  }
}

const fix = nodeScript('deterministic safe autofix', 'quality-autofix.js', ['--apply']);
if (fix.status !== 0) {
  rollbackCandidate();
  report.status = 'AUTOFIX_FAILED_ROLLED_BACK';
  finalize(21);
}
const autofixReport = readJson(path.join(ROOT, 'AUTOFIX_REPORT.json'), {});
const appliedChanges = Array.isArray(autofixReport.changes) ? autofixReport.changes.filter(c => c.applied !== false).length : 0;
const autofixErrors = Array.isArray(autofixReport.errors) ? autofixReport.errors.length : 0;
if (autofixErrors === 0 && appliedChanges > 0) addEvidence('deterministic-autofix', 2, `${appliedChanges} evidence-backed changes`);

const diff = sourceDiff();
report.candidate = diff;
const policy = config.policy || {};
const allowedRoots = Array.isArray(policy.allowedAutoChangeRoots) ? policy.allowedAutoChangeRoots : ['apps/', 'e2e/', 'test/'];
const unsafeFiles = diff.files.filter(({ file }) => !allowedRoots.some(root => file.replaceAll('\\', '/').startsWith(root)));
const tooManyFiles = diff.files.length > Number(policy.maxAutoChangedFiles || 12);
const tooManyLines = diff.lines > Number(policy.maxAutoChangedLines || 400);
if (diff.error || unsafeFiles.length || tooManyFiles || tooManyLines) {
  report.candidateGuard = { diffError: diff.error || null, unsafeFiles, tooManyFiles, tooManyLines };
  rollbackCandidate();
  report.status = 'CANDIDATE_REJECTED_ROLLED_BACK';
  finalize(22);
}
if (diff.files.length === 0) {
  report.status = report.productionDegraded ? 'DEGRADED_NO_SAFE_AUTOFIX' : 'HEALTHY_NO_CHANGE';
  finalize(0);
}
if (config.proof?.requireAutofixEvidence !== false && (autofixErrors > 0 || appliedChanges === 0)) {
  rollbackCandidate();
  report.status = 'NO_AUTOFIX_EVIDENCE_ROLLED_BACK';
  finalize(26);
}

if (policy.requireReleaseGate !== false) {
  const gate = npm('full release gate', ['run', 'release:gate'], { timeoutMs: Math.min(30 * 60 * 1000, budgetLeft()) });
  if (gate.status !== 0) {
    rollbackCandidate();
    report.status = 'RELEASE_GATE_FAILED_ROLLED_BACK';
    finalize(23);
  }
  addEvidence('release-gate', 2, 'full source/no-regression gate passed');
}

if (config.proof?.requireFocusedRegressionTests !== false) {
  const focused = run('focused regression tests', process.execPath, [
    '--test',
    'test/quality-regression.test.js',
    'test/golden-physics.test.js',
    'test/quality-growth.test.js'
  ], { timeoutMs: Math.min(15 * 60 * 1000, budgetLeft()) });
  if (focused.status !== 0) {
    rollbackCandidate();
    report.status = 'REGRESSION_TEST_FAILED_ROLLED_BACK';
    finalize(24);
  }
  addEvidence('focused-regression-tests', 2, 'quality + physics + growth tests passed');
}

const minimumScore = Number(config.proof?.minimumVerificationScore || 5);
if (report.verification.score < minimumScore) {
  rollbackCandidate();
  report.status = 'INSUFFICIENT_IMPROVEMENT_EVIDENCE_ROLLED_BACK';
  finalize(27);
}

report.status = 'VERIFIED_IMPROVEMENT_READY_FOR_BROWSER_GATE';
saveReport();
console.log(`[QUIET_AUTOPILOT] candidate verified: ${diff.files.length} files / ${diff.lines} lines / score ${report.verification.score}`);
releaseLock();
persistState();
