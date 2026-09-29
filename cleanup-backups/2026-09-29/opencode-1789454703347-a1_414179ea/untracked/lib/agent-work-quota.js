'use strict';
// AGENT_WORK_QUOTA — pure, dependency-free daily paid-fallback (Codex) share
// gate for the master coordinator.
//
// Reads the shared state/ai-agent-reports.jsonl report log and blocks Codex
// dispatch while Codex's recorded share of AI-agent dispatch work in the
// rolling daily window is at or above the policy cap (default 30%). The gate
// is advisory on a fresh/empty window (0% recorded share) and never writes to
// the report log itself — measurement and enforcement stay read-only.

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY = Object.freeze({
  schemaVersion: '1.0.0',
  system: 'AGENT_WORK_QUOTA_POLICY',
  preferredAgents: ['opencode', 'claude-code', 'desktop-ai', 'world-cloud-ai', 'openhuman', 'anythingllm'],
  paidFallbackAgents: ['codex'],
  codexMaxDailySharePercent: 30,
  windowMinutes: 1440,
  rollingWindow: true,
  countedStatuses: ['done', 'queued', 'failed', 'assigned'],
});

const policyCache = new Map();

function loadPolicy(root) {
  const rootPath = path.resolve(root || path.join(__dirname, '..'));
  if (policyCache.has(rootPath)) return policyCache.get(rootPath);
  let policy = { ...DEFAULT_POLICY };
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(rootPath, 'data', 'agent-work-policy.json'), 'utf8'));
    if (parsed && parsed.system === 'AGENT_WORK_QUOTA_POLICY') policy = { ...policy, ...parsed };
  } catch {
    // A missing/unreadable policy file must never crash the gate: fall back
    // to the same constants the regression tests rely on.
  }
  policyCache.set(rootPath, policy);
  return policy;
}

function classifyAgent(agentId, policy) {
  const p = policy || DEFAULT_POLICY;
  if ((p.paidFallbackAgents || []).includes(agentId)) return 'paid-fallback';
  if ((p.preferredAgents || []).includes(agentId)) return 'preferred';
  return 'other';
}

function normalizeStatus(status) {
  if (!status) return 'done';
  return String(status).toLowerCase();
}

function isCounted(entry, policy) {
  const p = policy || DEFAULT_POLICY;
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.agent !== 'string' || !entry.agent) return false;
  const counted = p.countedStatuses || DEFAULT_POLICY.countedStatuses;
  return counted.includes(normalizeStatus(entry.status));
}

// Entries without a usable `at` timestamp are conservatively counted inside
// the window: an ambiguous Codex record must count against the cap, not
// silently escape it.
function inWindow(atMs, windowStartMs, nowMs) {
  if (atMs == null || !Number.isFinite(atMs)) return true;
  return atMs >= windowStartMs && atMs <= nowMs;
}

function parseAt(entry) {
  if (entry.at == null) return null;
  const ms = typeof entry.at === 'number' ? entry.at : Date.parse(String(entry.at));
  return Number.isFinite(ms) ? ms : null;
}

function parseReportLine(line) {
  if (typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const entry = JSON.parse(trimmed);
    return entry && typeof entry === 'object' ? entry : null;
  } catch {
    return null;
  }
}

function readReportEntries(reportLogPath) {
  let text = '';
  try {
    text = fs.readFileSync(String(reportLogPath || ''), 'utf8');
  } catch {
    return [];
  }
  return text.split(/\r?\n/).map(parseReportLine).filter(Boolean);
}

function countDailyShares(entries, policy, opts = {}) {
  const p = policy || DEFAULT_POLICY;
  const nowMs = opts.nowMs == null ? Date.now() : Number(opts.nowMs);
  const windowMs = Number(p.windowMinutes || DEFAULT_POLICY.windowMinutes) * 60 * 1000;
  const windowStartMs = nowMs - windowMs;
  let total = 0;
  let preferred = 0;
  let paidFallback = 0;
  let other = 0;
  for (const entry of entries || []) {
    if (!isCounted(entry, p)) continue;
    const atMs = parseAt(entry);
    if (!inWindow(atMs, windowStartMs, nowMs)) continue;
    const cls = classifyAgent(entry.agent, p);
    if (cls === 'paid-fallback') paidFallback += 1;
    else if (cls === 'preferred') preferred += 1;
    else other += 1;
    total += 1;
  }
  return {
    total,
    preferred,
    paidFallback,
    other,
    codexSharePercent: total === 0 ? 0 : (paidFallback * 100) / total,
    windowStartMs,
    windowEndMs: nowMs,
    windowMinutes: windowMs / 60000,
  };
}

// Exact integer gate: blocked while paidFallback*100 >= cap*total (total>0).
// Integer math avoids float-rounding surprises at the 30% boundary.
function evaluate(counts, policy) {
  const p = policy || DEFAULT_POLICY;
  const cap = Number(p.codexMaxDailySharePercent || DEFAULT_POLICY.codexMaxDailySharePercent);
  const total = counts && Number.isFinite(counts.total) ? counts.total : 0;
  const paidFallback = counts && Number.isFinite(counts.paidFallback) ? counts.paidFallback : 0;
  const blocked = total > 0 && paidFallback * 100 >= cap * total;
  const sharePercent = total === 0 ? 0 : Math.round((paidFallback * 10000) / total) / 100;
  const reason = blocked
    ? `paid-fallback daily share ${sharePercent}% is at/above the ${cap}% cap; prefer Claude/OpenCode and free agents`
    : `paid-fallback daily share ${sharePercent}% is below the ${cap}% cap`;
  return {
    ok: !blocked,
    blocked,
    reason,
    codexSharePercent: sharePercent,
    maxSharePercent: cap,
    total,
    paidFallback,
    preferred: counts && Number.isFinite(counts.preferred) ? counts.preferred : 0,
  };
}

function evaluateReportLog(reportLogPath, policy, opts = {}) {
  const entries = readReportEntries(reportLogPath);
  return evaluate(countDailyShares(entries, policy, opts), policy);
}

module.exports = {
  loadPolicy,
  classifyAgent,
  parseReportLine,
  readReportEntries,
  countDailyShares,
  evaluate,
  evaluateReportLog,
  DEFAULT_POLICY,
};