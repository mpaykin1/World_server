'use strict';
// Daily-share enforcement for the master-goal rule:
//   "Codex is fallback only and must stay at or below 30 percent of
//    daily AI-agent work; prefer Claude/OpenCode."
//
// Baseline is the shared coordination log (state/ai-agent-reports.jsonl by
// default, overridable via AI_AGENT_REPORTS_PATH) that every agent adapter
// already writes with the same field schema ({at, agent, ...}). Pure module:
// no subprocess, no network, no lease. The coordinator is the enforcement
// point; here we only answer "does the current 24h share allow another Codex
// fallback dispatch?".
//
// share = codex entries / all entries inside a rolling 24h window, compared
// against maxShare (default 0.30). An empty/unreadable log passes so a
// bounded first-time fallback is possible; it then gets recorded and later
// dispatches are measured.
//
// Configuration precedence (highest wins):
//   1. explicit opts (maxShare / windowHours / nowMs / logPath)
//   2. MASTER_COORDINATOR_CODEX_MAX_SHARE / MASTER_COORDINATOR_QUOTA_WINDOW_HOURS
//   3. DEFAULT_MAX_SHARE / DEFAULT_WINDOW_HOURS

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_SHARE = 0.3;
const DEFAULT_WINDOW_HOURS = 24;

function defaultReportPath() {
  return process.env.AI_AGENT_REPORTS_PATH || path.join(__dirname, '..', 'state', 'ai-agent-reports.jsonl');
}

function parseMaxShare(opts = {}) {
  if (opts.maxShare != null) {
    const n = Number(opts.maxShare);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_MAX_SHARE;
  }
  const fromEnv = Number(process.env.MASTER_COORDINATOR_CODEX_MAX_SHARE);
  return Number.isFinite(fromEnv) && fromEnv > 0 && fromEnv <= 1 ? fromEnv : DEFAULT_MAX_SHARE;
}

function parseWindowHours(opts = {}) {
  if (opts.windowHours != null) {
    const n = Number(opts.windowHours);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_HOURS;
  }
  const fromEnv = Number(process.env.MASTER_COORDINATOR_QUOTA_WINDOW_HOURS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_WINDOW_HOURS;
}

// Malformed lines, entries without agent/at, and unparseable timestamps are
// ignored: a corrupt line must never decide quota math. A missing file
// returns loaded:false so callers can distinguish "no data" from "empty".
function readReportEntries(logPath) {
  let raw = '';
  try {
    raw = fs.readFileSync(logPath, 'utf8');
  } catch {
    return { loaded: false, entries: [] };
  }
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let obj = null;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== 'object' || typeof obj.agent !== 'string' || !obj.agent) continue;
    if (typeof obj.at !== 'string') continue;
    const atMs = Date.parse(obj.at);
    if (!Number.isFinite(atMs)) continue;
    entries.push({ agent: obj.agent, atMs, status: typeof obj.status === 'string' ? obj.status : null });
  }
  return { loaded: true, entries };
}

function dailyShares(logPath, opts = {}) {
  const windowHours = parseWindowHours(opts);
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const cutoffMs = nowMs - windowHours * 60 * 60 * 1000;
  const { loaded, entries } = readReportEntries(logPath || defaultReportPath());
  const counts = new Map();
  let totalCount = 0;
  for (const entry of entries) {
    if (entry.atMs < cutoffMs || entry.atMs > nowMs) continue;
    totalCount += 1;
    counts.set(entry.agent, (counts.get(entry.agent) || 0) + 1);
  }
  const codexCount = counts.get('codex') || 0;
  const share = totalCount > 0 ? codexCount / totalCount : 0;
  return {
    loaded,
    windowHours,
    nowMs,
    cutoffMs,
    totalCount,
    codexCount,
    share,
    counts: Object.fromEntries(counts),
  };
}

function gateCodexDispatch(opts = {}) {
  const logPath = opts.logPath || defaultReportPath();
  const data = dailyShares(logPath, opts);
  const maxShare = parseMaxShare(opts);
  const sharePct = Math.round(data.share * 1000) / 10;
  const maxPct = Math.round(maxShare * 1000) / 10;
  const ok = data.totalCount === 0 || data.share <= maxShare;
  return {
    ok,
    result: ok ? 'PASS' : 'CODEX_DAILY_QUOTA_EXCEEDED',
    reason: ok
      ? `codex daily share ${sharePct}% is within the ${maxPct}% cap`
      : `codex daily share ${sharePct}% exceeds the ${maxPct}% cap`,
    data: { ...data, maxShare },
  };
}

module.exports = { dailyShares, gateCodexDispatch, readReportEntries, parseMaxShare, parseWindowHours, defaultReportPath, DEFAULT_MAX_SHARE, DEFAULT_WINDOW_HOURS };

if (require.main === module) {
  const logPath = process.argv[2] || defaultReportPath();
  const gate = gateCodexDispatch({ logPath });
  console.log(JSON.stringify(gate, null, 2));
  if (!gate.ok) process.exitCode = 1;
}