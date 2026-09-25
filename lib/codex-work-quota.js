'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY_PATH = path.join(__dirname, '..', 'data', 'codex-quota-policy.json');
const BUILTIN_DEFAULT = { windowHours: 24, maxSharePct: 30, measuredAgentId: 'codex', source: 'builtin-default' };

function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  try {
    const p = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    return {
      windowHours: Number(p.windowHours) || BUILTIN_DEFAULT.windowHours,
      maxSharePct: Number(p.maxSharePct) || BUILTIN_DEFAULT.maxSharePct,
      measuredAgentId: String(p.measuredAgentId || BUILTIN_DEFAULT.measuredAgentId),
      source: policyPath,
    };
  } catch {
    return { ...BUILTIN_DEFAULT };
  }
}

function toAgentList(entries, now, windowMs) {
  const from = now.getTime() - windowMs;
  const until = now.getTime() + 1000;
  const out = [];
  for (const line of entries.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const at = entry && entry.at ? new Date(entry.at).getTime() : Number.NaN;
      if (!Number.isFinite(at) || at < from || at > until) continue;
      out.push(String(entry.agent || 'unknown'));
    } catch {
      continue;
    }
  }
  return out;
}

function loadAgentWork(logPath, { now = new Date(), windowHours = 24 } = {}) {
  if (!logPath) return [];
  let raw = '';
  try {
    raw = fs.readFileSync(logPath, 'utf8');
  } catch {
    return [];
  }
  return toAgentList(raw, now, windowHours * 60 * 60 * 1000);
}

function computeShare(entries, agentId = 'codex') {
  const totalCount = entries.length;
  const measuredCount = entries.filter((agent) => agent === agentId).length;
  const sharePct = totalCount === 0 ? 0 : Math.round((100 * measuredCount) / totalCount * 10) / 10;
  return { totalCount, measuredCount, sharePct };
}

function evaluateCodexDispatch({ logPath, policy, now } = {}) {
  const p = policy || loadPolicy();
  const entries = loadAgentWork(logPath, { now, windowHours: p.windowHours });
  const m = computeShare(entries, p.measuredAgentId);
  const unverified = m.totalCount === 0;
  const base = { ...m, unverified, maxSharePct: p.maxSharePct, windowHours: p.windowHours, basis: String(p.source || 'policy') };
  if (m.sharePct > p.maxSharePct) {
    return { ok: false, result: 'CODEX_QUOTA_EXCEEDED', action: 'refuse', reason: `daily ${p.measuredAgentId} work share ${m.sharePct}% exceeds cap ${p.maxSharePct}% (${m.measuredCount}/${m.totalCount} logged agent work entries over ${p.windowHours}h)`, ...base };
  }
  return { ok: true, result: 'ALLOWED', action: 'dispatch', ...base };
}

module.exports = { DEFAULT_POLICY_PATH, loadPolicy, loadAgentWork, computeShare, evaluateCodexDispatch };