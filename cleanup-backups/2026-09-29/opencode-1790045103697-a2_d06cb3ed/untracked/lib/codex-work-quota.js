'use strict';
// CODEX_WORK_QUOTA - enforce the master-goal rule that Codex is a paid
// fallback only and must stay at or below 30 percent of DAILY AI-agent work,
// with Claude/OpenCode preferred for the remaining share.
//
// Accounting source: the EXISTING shared coordination ledger
// (state/ai-agent-reports.jsonl, written by master-coordinator's
// reportAutomatedAgentResult/reportSelfExecuted/assignOffline and by
// openhuman-subtask's runSubtask). This quota intentionally does NOT create a
// second log or a parallel accounting stack - it reads the same ledger every
// agent already writes to, so the number it reports is exactly what the rest
// of the system records.
//
// What counts as "work": only entries whose status means a real dispatched
// attempt happened ('done' or 'failed'). 'assigned' offline handoffs (ChatGPT
// browser / Claude desktop) are not work performed, 'queued' pending
// dispatches are not work yet, and a quota-blocked Codex dispatch never
// reaches the ledger at all (it was never dispatched), so blocking one does
// not corrupt the ratio. SELF_EXECUTE 'done'/'failed' entries (claude-code,
// desktop-ai) DO count toward the denominator - they are real AI-agent work,
// which is exactly what the "prefer Claude/OpenCode" rule needs the share to
// be measured against.
//
// Day definition: a TRAILING 24h window (windowMs) rather than a UTC calendar
// day. A calendar-day boundary is deterministic but creates a midnight cliff
// (a session that dispatches Codex at 23:59 and OpenCode at 00:02 would be
// split into two accounting days). A trailing window counts the same
// continuous session as one day, which is the honest interpretation of
// "daily AI-agent work" for enforcement.
//
// Blocking semantics (deliberately strict, no fudge floor): dispatch is
// allowed when there is no recorded work in the window yet (no baseline to
// compute a share from) or Codex <= maxShare of the window's work. "At or
// below 30 percent" means exactly 30% is still allowed.
const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_DAILY_SHARE = 0.3;
const DEFAULT_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

function readAgentReports(agentReportsPath) {
  let text;
  try {
    text = fs.readFileSync(agentReportsPath, 'utf8');
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null; // corrupt line is ignored, never fatal and never counted
      }
    })
    .filter(Boolean);
}

function isWorkEntry(entry) {
  return (
    !!entry &&
    typeof entry === 'object' &&
    typeof entry.at === 'string' &&
    typeof entry.agent === 'string' &&
    (entry.status === 'done' || entry.status === 'failed')
  );
}

// Counts dispatched AI-agent work inside the trailing window, returning the
// Codex count, the total and the per-agent breakdown. Entries from outside
// the window, or entries that are not dispatched work, are never counted.
function dailyCounts(entries, { now = Date.now(), windowMs = DEFAULT_DAY_WINDOW_MS } = {}) {
  const since = Number(now) - Number(windowMs || 0);
  let codex = 0;
  let total = 0;
  const byAgent = new Map();
  for (const entry of entries) {
    if (!isWorkEntry(entry)) continue;
    const atMs = Date.parse(entry.at);
    if (!Number.isFinite(atMs) || atMs < since) continue;
    total += 1;
    const agent = String(entry.agent);
    byAgent.set(agent, (byAgent.get(agent) || 0) + 1);
    if (agent === 'codex') codex += 1;
  }
  return { codex, total, since, byAgent: Object.fromEntries(byAgent) };
}

// Pure decision over a provided entries array - no I/O, fully deterministic,
// the core this module's tests pin down.
function decideFromEntries(entries, opts = {}) {
  const windowMs = Number(opts.windowMs || DEFAULT_DAY_WINDOW_MS);
  const maxShare = opts.maxShare == null ? DEFAULT_MAX_DAILY_SHARE : Number(opts.maxShare);
  const counts = dailyCounts(entries, { now: opts.now, windowMs });
  const { codex, total, since } = counts;
  const share = total > 0 ? codex / total : 0;
  const allowed = total === 0 || share <= maxShare;
  const windowHours = Math.round(windowMs / 3600000);
  const pct = (x) => `${Math.round(x * 100 * 10) / 10}%`;
  const label = `the last ${windowHours}h of AI-agent work`;
  const reason = total === 0
    ? `no dispatched AI-agent work recorded in ${label} yet - first Codex dispatch allowed`
    : allowed
      ? `Codex is ${pct(share)} of ${label} (${codex}/${total}), within the ${pct(maxShare)} daily cap`
      : `Codex is ${pct(share)} of ${label} (${codex}/${total}), above the ${pct(maxShare)} daily cap - prefer Claude/OpenCode`;
  return { allowed, codex, total, share, maxShare, windowMs, since, reason };
}

// I/O wrapper for the coordinator: reads the shared ledger path, filters to
// dispatches inside the window, and returns the dispatch decision.
function codexDispatchDecision({ agentReportsPath, now, windowMs, maxShare } = {}) {
  if (!agentReportsPath) {
    return { allowed: false, error: 'agentReportsPath is required', reason: 'no shared agent-report ledger path provided' };
  }
  return decideFromEntries(readAgentReports(agentReportsPath), { now, windowMs, maxShare });
}

module.exports = {
  readAgentReports,
  isWorkEntry,
  dailyCounts,
  decideFromEntries,
  codexDispatchDecision,
  DEFAULT_MAX_DAILY_SHARE,
  DEFAULT_DAY_WINDOW_MS,
};

if (require.main === module) {
  // Read-only monitoring CLI: reports today's (trailing 24h) Codex share and
  // exits non-zero only if the share is already above the 30% cap, so the
  // policy is observable and falsifiable without touching any file. Without
  // an explicit path it reads the canonical shared ledger under state/.
  const autoPath = path.join(__dirname, '..', 'state', 'ai-agent-reports.jsonl');
  const decision = codexDispatchDecision({ agentReportsPath: process.argv[2] || autoPath });
  console.log(JSON.stringify(decision, null, 2));
  if (decision.error) {
    process.exitCode = 2;
  } else if (decision.total > 0 && !decision.allowed) {
    process.exitCode = 1;
  }
}