'use strict';
// AGENT_WORK_QUOTA
//
// Machine-enforceable daily AI-agent work-share ledger backing the master
// goal's "Codex is fallback only and must stay at or below 30 percent of
// daily AI-agent work; prefer Claude/OpenCode; prefer free cloud agents
// for heavy work; never use paid APIs or paid GPU."
//
// The ledger is a JSONL file under data/collective-brain/runtime/ (already
// gitignored as runtime AI learning state). Every dispatched subtask the
// master coordinator actually executes records one work unit for its agent,
// deduplicated by (agent, taskId, UTC day) so retries of one subtask are not
// counted multiple times. The Codex gate is fail-closed: if the ledger exists
// but cannot be parsed, Codex dispatch is REFUSED until the ledger is
// inspectable again (policy: data/agent-work-quota-policy.json).
const fs = require('fs');
const path = require('path');

function ledgerPath(root, envOverride = process.env.AGENT_WORK_LEDGER_PATH) {
  if (envOverride) return envOverride;
  return path.join(root, 'data', 'collective-brain', 'runtime', 'agent-work-ledger.jsonl');
}

function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function readLedger(root, opts = {}) {
  const fp = ledgerPath(root, opts.envOverride);
  let raw;
  try {
    raw = fs.readFileSync(fp, 'utf8');
  } catch {
    if (opts.emptyIfMissing) return { inspectable: true, entries: [], path: fp };
    const missing = !(fs.existsSync(fp) || opts.maybeMissing);
    return { inspectable: false, entries: [], path: fp, error: missing ? 'ledger-not-found' : 'ledger-unreadable' };
  }
  const entries = [];
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return { inspectable: false, entries: [], path: fp, error: 'ledger-corrupt-line' };
    }
    if (!parsed || typeof parsed.agent !== 'string') return { inspectable: false, entries: [], path: fp, error: 'ledger-invalid-entry' };
    entries.push(parsed);
  }
  return { inspectable: true, entries, path: fp };
}

// Records one work unit unless an identical (agent, taskId, day) unit already
// exists for the exact day. Returns {ok, deduplicated, path}.
async function recordWork(root, { agent, taskId, at = new Date().toISOString() }, opts = {}) {
  try {
    const fp = ledgerPath(root, opts.envOverride);
    const day = dayKey(at);
    const existing = readLedger(root, { ...opts, maybeMissing: true });
    if (existing.inspectable && existing.entries.some((e) => e.agent === agent && e.taskId === taskId && dayKey(e.at) === day)) {
      return { ok: true, deduplicated: true, path: fp };
    }
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.appendFileSync(fp, JSON.stringify({ at, agent, taskId }) + '\n');
    return { ok: true, deduplicated: false, path: fp };
  } catch (error) {
    return { ok: false, deduplicated: false, error: error.message };
  }
}

// Counts work units per agent for one UTC day and returns the Codex share.
function dailyShare(root, opts = {}) {
  const date = opts.date || new Date().toISOString().slice(0, 10);
  const ledger = readLedger(root, { ...opts, maybeMissing: true });
  const byAgent = {};
  let total = 0;
  for (const entry of ledger.entries) {
    if (dayKey(entry.at) !== date) continue;
    byAgent[entry.agent] = (byAgent[entry.agent] || 0) + 1;
    total += 1;
  }
  const codexUnits = byAgent.codex || 0;
  const sharePercent = total ? Math.round((codexUnits / total) * 1000) / 10 : 0;
  return { date, total, codexUnits, sharePercent, byAgent, inspectable: ledger.inspectable, ledgerError: ledger.error, path: ledger.path };
}

// Fail-closed Codex gate. Allowed only when the ledger is inspectable AND the
// current share is strictly below the cap (so a new Codex unit cannot push it
// over). A missing ledger is treated as empty [allowed] - nothing has been
// recorded yet; a corrupt/unreadable ledger refuses Codex [denied].
function codexAllowed(root, opts = {}) {
  const maxSharePercent = opts.maxSharePercent != null ? Number(opts.maxSharePercent) : 30;
  const share = dailyShare(root, opts);
  const cap = Number.isFinite(maxSharePercent) ? maxSharePercent : 30;
  if (!share.inspectable) {
    return { allowed: false, reason: `fail-closed: quota ledger not inspectable (${share.ledgerError})`, ...share };
  }
  if (share.total === 0) {
    return { allowed: true, reason: 'no AI work recorded today yet', ...share };
  }
  const atOrOverCap = share.sharePercent >= cap;
  return {
    allowed: !atOrOverCap,
    reason: atOrOverCap
      ? `Codex share ${share.sharePercent}% is at/over the ${cap}% daily cap (${share.codexUnits}/${share.total} units)`
      : `Codex share ${share.sharePercent}% is below the ${cap}% daily cap (${share.codexUnits}/${share.total} units)`,
    cap,
    ...share,
  };
}

module.exports = { ledgerPath, dayKey, readLedger, recordWork, dailyShare, codexAllowed };