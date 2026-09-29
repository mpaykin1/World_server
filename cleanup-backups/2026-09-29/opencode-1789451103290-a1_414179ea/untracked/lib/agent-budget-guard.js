'use strict';
// Agent work-budget guard for the master-goal operating contract.
//
// Enforces the "paid fallback <= 30% of daily AI-agent work" rule from
// AGENTS.md / the master-coordinator prompt by reading the SHARED agent
// report ledger (state/ai-agent-reports.jsonl) that master-coordinator,
// openhuman-subtask and every other registered adapter already write.
//
// Rule (from the master goal, enforced here in code):
//   - Codex is a PAID fallback only and must stay at or below 30 percent of
//     daily AI-agent work; prefer Claude/OpenCode and free cloud agents.
//   - Never use paid APIs or paid GPU.
//
// The metric is deterministic and documented: one unit of "work" = one ledger
// entry in the window whose status means real dispatched effort was performed
// or owned (done / failed / assigned / dispatched / running). Non-work logos
// like resource-gate "queued" retries or "skipped" entries are NOT counted as
// work, so queue noise cannot hide a genuine paid-fallback overrun.

const PAID_FALLBACK_AGENT = 'codex';

const AGENT_CLASS = Object.freeze({
  codex: 'paid-fallback',
  opencode: 'free',
  'claude-code': 'free',
  claude: 'free',
  'desktop-ai': 'free',
  'claude-desktop': 'free',
  chatgpt: 'free',
  openhuman: 'free',
  'openhuman-anythingllm': 'free',
  anythingllm: 'free',
  'world-cloud-ai': 'free',
  jules: 'free',
});

// Statuses that represent real dispatched/owned work in the shared ledger.
const WORK_STATUS = Object.freeze(new Set(['done', 'failed', 'assigned', 'dispatched', 'running']));

const DEFAULT_MAX_PAID_SHARE_PERCENT = 30;
const DEFAULT_WINDOW_HOURS = 24;

function classifyAgentId(agentId) {
  return AGENT_CLASS[agentId] || 'unknown';
}

function isWorkEntry(entry) {
  return entry && WORK_STATUS.has(String(entry.status || '').toLowerCase());
}

function parseLedger(jsonlText) {
  const entries = [];
  if (!jsonlText) return entries;
  for (const rawLine of String(jsonlText).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') {
        entries.push({
          at: typeof parsed.at === 'string' ? parsed.at : null,
          agentId: typeof parsed.agent === 'string' ? parsed.agent : null,
          taskId: typeof parsed.task_id === 'string' ? parsed.task_id : null,
          status: typeof parsed.status === 'string' ? parsed.status : null,
        });
      }
    } catch {
      // Malformed ledger lines are skipped: one garbage line must never crash
      // the guard or fabricate a reading from the rest of the log.
    }
  }
  return entries;
}

// Analyze a ledger text. Pure and deterministic: pass a fixed nowIso for tests.
function analyzeLedger(jsonlText, opts = {}) {
  const windowHours = opts.windowHours || DEFAULT_WINDOW_HOURS;
  const maxPaidSharePercent = opts.maxPaidSharePercent || DEFAULT_MAX_PAID_SHARE_PERCENT;
  const nowIso = opts.nowIso || new Date().toISOString();
  const baseMs = opts.baseMs || Date.parse(nowIso);
  const windowStartMs = baseMs - windowHours * 60 * 60 * 1000;

  const parsed = parseLedger(jsonlText);
  const perAgent = {};
  let paidWork = 0;
  let freeWork = 0;
  let unknownWork = 0;
  const paidEntries = [];

  for (const entry of parsed) {
    const atMs = entry.at ? Date.parse(entry.at) : NaN;
    if (!Number.isFinite(atMs) || atMs < windowStartMs || atMs > baseMs) continue;
    if (!isWorkEntry(entry)) continue;
    const agentId = entry.agentId || 'unknown';
    perAgent[agentId] = (perAgent[agentId] || 0) + 1;
    const klass = classifyAgentId(agentId);
    if (klass === 'paid-fallback') {
      paidWork += 1;
      paidEntries.push({ agentId, at: entry.at, taskId: entry.taskId, status: entry.status });
    } else if (klass === 'unknown') {
      unknownWork += 1;
    } else {
      freeWork += 1;
    }
  }

  const totalWork = paidWork + freeWork + unknownWork;
  const paidSharePercent = totalWork === 0 ? 0 : Math.round((paidWork / totalWork) * 1000) / 10;
  let verdict;
  if (totalWork === 0) verdict = 'NO_WORK';
  else if (paidSharePercent > maxPaidSharePercent) verdict = 'BUDGET_EXCEEDED';
  else verdict = 'OK';

  return {
    windowHours,
    maxPaidSharePercent,
    nowIso,
    windowStartIso: new Date(windowStartMs).toISOString(),
    totalWork,
    paidWork,
    freeWork,
    unknownWork,
    paidSharePercent,
    paidEntries,
    perAgent,
    verdict,
    message: summarize(verdict, totalWork, paidSharePercent, maxPaidSharePercent),
  };
}

function summarize(verdict, totalWork, paidSharePercent, maxPaidSharePercent) {
  if (verdict === 'NO_WORK') {
    return 'No AI-agent work entries in the ledger window; nothing to budget.';
  }
  if (verdict === 'BUDGET_EXCEEDED') {
    return `Paid-fallback (codex) share ${paidSharePercent}% exceeds the ${maxPaidSharePercent}% daily cap.`;
  }
  return `Paid-fallback (codex) share ${paidSharePercent}% is at or below the ${maxPaidSharePercent}% daily cap.`;
}

module.exports = {
  PAID_FALLBACK_AGENT,
  AGENT_CLASS,
  WORK_STATUS,
  DEFAULT_MAX_PAID_SHARE_PERCENT,
  DEFAULT_WINDOW_HOURS,
  classifyAgentId,
  isWorkEntry,
  parseLedger,
  analyzeLedger,
  summarize,
};