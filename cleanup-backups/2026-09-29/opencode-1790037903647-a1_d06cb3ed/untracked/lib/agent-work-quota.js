'use strict';
// Daily agent-work quota ledger.
//
// Enforces the master-goal rule "Codex is a fallback only and must stay at or
// below 30% of daily AI-agent work; prefer Claude/OpenCode" (and therefore
// "never use paid APIs or paid GPU"). It is intentionally a pure, small,
// file-backed ledger that the master coordinator already uses as the single
// place where every automated agent dispatch happens - no parallel
// orchestration stack is introduced.
//
// Semantics:
//   - every dispatched/executed agent work unit is appended to a JSONL file
//     (default: <state>/agent-work-quota.jsonl, git-ignored runtime state);
//   - "paid" work currently means Codex (explicit paid fallback only);
//   - the paid share is computed over a trailing window (default 24h);
//   - a new paid dispatch is blocked if it would push the paid share above
//     the configured cap (default 30%).
//
// The ledger never deletes or rewrites past entries (append-only), and every
// read tolerates malformed/partial lines so a torn write can never corrupt a
// quota decision.

const fs = require('fs');
const path = require('path');

const PAID_AGENT_IDS = new Set(['codex']);
const MAX_PAID_SHARE_DEFAULT = 0.3;
const WINDOW_HOURS_DEFAULT = 24;
const OUTCOMES = { DISPATCHED: 'dispatched', BLOCKED: 'blocked' };

function classForAgent(agentId, cls) {
  if (cls === 'paid' || cls === 'free') return cls;
  return PAID_AGENT_IDS.has(String(agentId || '').toLowerCase()) ? 'paid' : 'free';
}

function record(filePath, { agentId, at = Date.now(), outcome = OUTCOMES.DISPATCHED, cls } = {}) {
  const ts = typeof at === 'number' ? at : new Date(at || Date.now()).getTime();
  const entry = { ts, agentId: String(agentId || 'unknown'), cls: classForAgent(agentId, cls), outcome: outcome === OUTCOMES.BLOCKED ? OUTCOMES.BLOCKED : OUTCOMES.DISPATCHED };
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) return false;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
    return true;
  } catch {
    return false;
  }
}

function readRecords(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      const entry = JSON.parse(line);
      if (!Number.isFinite(entry.ts) || typeof entry.agentId !== 'string') return null;
      return { ...entry, outcome: entry.outcome === OUTCOMES.BLOCKED ? OUTCOMES.BLOCKED : OUTCOMES.DISPATCHED };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function snapshot(filePath, { now = Date.now(), windowHours = WINDOW_HOURS_DEFAULT } = {}) {
  const windowMs = Number(windowHours) > 0 ? Number(windowHours) * 60 * 60 * 1000 : Infinity;
  let paid = 0;
  let free = 0;
  for (const entry of readRecords(filePath)) {
    if (entry.outcome !== OUTCOMES.DISPATCHED) continue;
    if (windowMs !== Infinity && now - entry.ts > windowMs) continue;
    if (entry.cls === 'paid') paid += 1;
    else free += 1;
  }
  const total = paid + free;
  const paidShare = total > 0 ? paid / total : 0;
  return {
    paidDispatchCount: paid,
    freeDispatchCount: free,
    totalDispatchCount: total,
    windowHours: Number(windowHours) || null,
    paidSharePercent: Math.round(paidShare * 1000) / 10,
  };
}

function wouldExceedCap(current, maxPaidShare, extraPaid = 1) {
  const addedPaid = current.paidDispatchCount + extraPaid;
  const addedTotal = current.totalDispatchCount + extraPaid;
  if (addedTotal <= 0) return false;
  return addedPaid / addedTotal > maxPaidShare;
}

function decidePaidDispatch(filePath, { now = Date.now(), windowHours = WINDOW_HOURS_DEFAULT, maxPaidShare = MAX_PAID_SHARE_DEFAULT, agentId = 'codex', extraPaid = 1 } = {}) {
  const cap = Number(maxPaidShare) > 0 ? Math.min(Number(maxPaidShare), 1) : MAX_PAID_SHARE_DEFAULT;
  const current = snapshot(filePath, { now, windowHours });
  // A truly empty window (no dispatched work yet) lets the first paid unit
  // define the day; the instant ANY in-window work exists, strict 30%-cap
  // math applies to every further paid dispatch (so a Codex-only day is
  // capped at one unit unless free work balances it).
  const blocked = current.totalDispatchCount > 0 && wouldExceedCap(current, cap, Math.max(1, extraPaid));
  const wouldBePaid = current.paidDispatchCount + Math.max(1, extraPaid);
  const wouldBeTotal = current.totalDispatchCount + Math.max(1, extraPaid);
  return {
    blocked,
    agentId: String(agentId || 'codex'),
    maxPaidShare: cap,
    current,
    wouldBePaidSharePercent: wouldBeTotal > 0 ? Math.round((wouldBePaid / wouldBeTotal) * 1000) / 10 : 100,
  };
}

module.exports = { PAID_AGENT_IDS, MAX_PAID_SHARE_DEFAULT, WINDOW_HOURS_DEFAULT, OUTCOMES, classForAgent, record, readRecords, snapshot, decidePaidDispatch, wouldExceedCap };