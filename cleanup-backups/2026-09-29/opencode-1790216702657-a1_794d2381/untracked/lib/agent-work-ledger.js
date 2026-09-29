'use strict';
// AGENT_WORK_LEDGER
//
// Pure, testable accounting for the master-goal work-governance policy
// (data/master-goal-policy.json):
//   - Codex is paid fallback only and must stay at or below
//     `codexDailyShareCap` of daily AI-agent work.
//   - ChatGPT Work / Computer Use (chatgpt, claude-desktop) are offline-only
//     agents: never driven programmatically, only assigned for a human-side
//     agent to pick up.
//   - Absence of evidence is UNKNOWN, never a fabricated PASS or a guessed
//     zero (consistent with the repository's VNO/science rules).
//
// The single runtime data source is the coordinator's shared report log
// (state/ai-agent-reports.jsonl, see REPORT_LOG_PATH in
// scripts/master-coordinator.cjs). This module only READS it; it never
// duplicates the append path.
const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY_PATH = path.join(__dirname, '..', 'data', 'master-goal-policy.json');

function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  const raw = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const cap = Number(raw.codexDailyShareCap);
  return {
    ...raw,
    codexDailyShareCap: Number.isFinite(cap) && cap > 0 ? cap : 0.3,
    enforced: raw.enforceCodexDispatchCap !== false,
    agentCostClasses: raw.agentCostClasses || { free: [], paidFallback: [], offlineOnly: [] },
    refusedWorkStatuses: raw.refusedWorkStatuses || [],
    automatedWorkStatuses: raw.automatedWorkStatuses || ['done', 'failed', 'queued', 'assigned'],
  };
}

// costClass: 'free' | 'paid-fallback' | 'offline' | 'unknown'.
function classifyAgent(agentId, policy = loadPolicy()) {
  const id = String(agentId || '').toLowerCase();
  const classes = policy.agentCostClasses;
  if (classes.free.includes(id)) return { agentId: id, costClass: 'free' };
  if (classes.paidFallback.includes(id)) return { agentId: id, costClass: 'paid-fallback' };
  if (classes.offlineOnly.includes(id)) return { agentId: id, costClass: 'offline' };
  return { agentId: id, costClass: 'unknown' };
}

// Reads a JSONL report log. Blank lines and malformed lines are skipped and
// counted as `invalidLines`; a corrupt line must never crash accounting.
function readReportRecords(logPath) {
  const records = [];
  let invalidLines = 0;
  if (!logPath) return { records, invalidLines };
  let content = '';
  try {
    content = fs.readFileSync(logPath, 'utf8');
  } catch {
    return { records, invalidLines, missing: true };
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      invalidLines += 1;
    }
  }
  return { records, invalidLines };
}

// UTC calendar day (YYYY-MM-DD) of an ISO-8601 timestamp. Coordinator report
// entries carry UTC (`Z`) timestamps, so taking the first 10 characters is an
// honest UTC-day label, not a local-time guess.
function utcDayOf(iso) {
  const s = String(iso || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

// Filters report records to a single UTC day (empty state = no evidence for
// that day, which codexShare reports as UNKNOWN rather than PASS).
function dailyRecords(records, nowIso, { dayWindowUtc = true } = {}) {
  const today = utcDayOf(nowIso);
  if (!today) return [];
  return (records || []).filter((r) => utcDayOf(r && r.at) === today);
}

function isRefused(entry, policy = loadPolicy()) {
  const tag = entry && entry.findings && entry.findings.result;
  if (!tag) return false;
  return (policy.refusedWorkStatuses || []).includes(tag);
}

// Counts actual agent work (automated 'done'/'failed'/'queued'  or offline
// 'assigned') that reached a dispatcher. Refused outcomes (disabled paid
// fallback, cap-refused, not-available, unknown-agent, zero-chaos blocked)
// are NOT work and never count toward any agent's share. Unknown-class agents
// still count toward the denominator (a new agent can never inflate Codex's
// measured share by being ignored) and are surfaced for policy drift review.
function workCounts(records, policy = loadPolicy()) {
  const automated = new Set(policy.automatedWorkStatuses || []);
  let totalCount = 0;
  let codexCount = 0;
  let unknownClassCount = 0;
  for (const entry of records || []) {
    if (!entry || typeof entry.at !== 'string') continue;
    if (!automated.has(String(entry.status || ''))) continue;
    if (isRefused(entry, policy)) continue;
    const cls = classifyAgent(entry.agent, policy).costClass;
    totalCount += 1;
    if (cls === 'paid-fallback') codexCount += 1;
    if (cls === 'unknown') unknownClassCount += 1;
  }
  return { totalCount, codexCount, unknownClassCount };
}

function round4(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

// Codex share of the given day's AI-agent work.
//   state PASS    share <= cap  (real evidence present)
//   state FAIL    share >  cap  (real evidence present; gate must fail)
//   state UNKNOWN zero tracked work for the day (absence of evidence is
//                  never a fabricated PASS)
function codexShare(records, policy = loadPolicy()) {
  const cap = Number(policy.codexDailyShareCap);
  const counts = workCounts(records, policy);
  const { totalCount, codexCount, unknownClassCount } = counts;
  if (totalCount === 0) {
    return {
      state: 'UNKNOWN',
      codexCount: 0,
      totalCount: 0,
      unknownClassCount,
      share: 0,
      cap,
      reason: 'no tracked AI-agent work for the day; absence of evidence treated as UNKNOWN, not as PASS',
    };
  }
  const share = round4(codexCount / totalCount);
  return {
    state: share <= cap + 1e-9 ? 'PASS' : 'FAIL',
    codexCount,
    totalCount,
    unknownClassCount,
    share,
    cap,
    reason: `codex=${codexCount} of total=${totalCount} daily agent work; share=${share} cap=${cap}`,
  };
}

// Dispatch-time decision: is one more Codex task allowed today without the
// day's Codex share ending above the cap? The very first Codex task of a day
// is always allowed (a single task cannot violate a "share", and blocking it
// would make the cap unenforceable); every later task must keep the projected
// (codexCount+1)/(totalCount+1) at or below the cap.
function codexDispatchAllowed(counts, policy = loadPolicy()) {
  const cap = Number(policy.codexDailyShareCap);
  const codexCount = Number(counts && counts.codexCount) || 0;
  const totalCount = Number(counts && counts.totalCount) || 0;
  const projectedCodex = codexCount + 1;
  const projectedTotal = totalCount + 1;
  const projectedShare = round4(projectedCodex / projectedTotal);
  const ok = totalCount === 0 || projectedShare <= cap + 1e-9;
  return {
    ok,
    codexCount,
    totalCount,
    projectedCodex,
    projectedTotal,
    projectedShare,
    cap,
    reason: ok
      ? `Codex daily share after dispatch would be ${projectedShare} (cap ${cap})`
      : `dispatch would push Codex daily share to ${projectedShare} (cap ${cap})`,
  };
}

// Coordinator integration helper: read today's share from the report log and
// decide whether a new Codex dispatch is permitted. The log is never created
// here; a missing/unreadable log means "no evidence of a violation" and
// dispatches remain allowed while the same absence is honestly surfaced as
// UNKNOWN by the share gate. A read error must never crash the coordinator.
function codexDispatchGate(logPath, policy = loadPolicy()) {
  if (policy.enforced === false) return { result: 'ALLOWED', enforced: false };
  let counts = { totalCount: 0, codexCount: 0 };
  let logState = 'missing';
  try {
    if (logPath) {
      const { records, missing } = readReportRecords(logPath);
      logState = missing ? 'missing' : 'read';
      counts = workCounts(dailyRecords(records, new Date().toISOString()), policy);
    }
  } catch {
    counts = { totalCount: 0, codexCount: 0 };
    logState = 'unreadable';
  }
  const decision = codexDispatchAllowed(counts, policy);
  return decision.ok
    ? { result: 'ALLOWED', logState, ...decision }
    : { result: 'CODEX_DAILY_CAP_EXCEEDED', logState, ...decision };
}

module.exports = {
  DEFAULT_POLICY_PATH,
  loadPolicy,
  classifyAgent,
  readReportRecords,
  utcDayOf,
  dailyRecords,
  isRefused,
  workCounts,
  codexShare,
  codexDispatchAllowed,
  codexDispatchGate,
  round4,
};