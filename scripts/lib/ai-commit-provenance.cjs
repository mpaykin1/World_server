'use strict';
/**
 * ai-commit-provenance.cjs
 *
 * Implements the AI COMMIT PROVENANCE rule (see AGENTS.md section
 * "AI COMMIT PROVENANCE — обязательные trailer-поля для коммитов AI").
 *
 * Every AI commit is expected to carry provenance trailers in its message:
 *   AI-Agent: <Claude-Code|Claude-Desktop|ChatGPT|Codex|OpenCode|OpenHuman|...>
 *   AI-Session: <unique id of the current working session>
 *   Worktree: <full path to the worktree>
 *   Branch: <branch name>
 *   Ownership: <short area-of-responsibility summary>
 *
 * `Claude-Session:` is the legacy (pre-rule) trailer name and is still
 * parsed for backward compatibility, but new commits must use `AI-Session:`.
 *
 * This module never fails a build by itself — it only detects and reports.
 * The caller (scripts/check-agent-rules.js) decides how to surface findings
 * (WARN, non-blocking, per the rule).
 */

const cp = require('child_process');

function parseProvenanceTrailers(message) {
  const msg = String(message || '');
  const get = (key) => {
    const m = msg.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'));
    return m ? m[1].trim() : null;
  };
  const aiSession = get('AI-Session');
  const legacySession = get('Claude-Session');
  return {
    aiAgent: get('AI-Agent'),
    aiSession: aiSession || legacySession,
    usedLegacyField: !aiSession && !!legacySession,
    worktree: get('Worktree'),
    branch: get('Branch'),
    ownership: get('Ownership'),
  };
}

/**
 * Given a flat list of { branch, sessionId, sha, committerDate } records
 * (one per branch tip, typically), return the groups where the same
 * non-empty sessionId is claimed by more than one distinct branch.
 */
function findDuplicateActiveSessions(records) {
  const bySession = new Map();
  for (const r of records || []) {
    if (!r || !r.sessionId) continue;
    if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, []);
    bySession.get(r.sessionId).push(r);
  }
  const collisions = [];
  for (const [sessionId, recs] of bySession) {
    const branches = new Set(recs.map((r) => r.branch));
    if (branches.size > 1) collisions.push({ sessionId, records: recs });
  }
  return collisions;
}

function defaultGit(cwd, args) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return (r.stdout || '').trim();
}

/**
 * Scans the tip commit of every local branch that has been touched within
 * `activeWindowMs` (default 24h — a proxy for "currently active AI
 * session") and reports AI-Session/Claude-Session collisions across
 * distinct branches. Two independent AI sessions on two different branches
 * legitimately claiming the same session id is a provenance violation
 * worth a human/AI looking at, even though it never blocks CI by itself.
 */
function auditActiveSessionProvenance(opts = {}) {
  const {
    cwd = process.cwd(),
    activeWindowMs = 24 * 60 * 60 * 1000,
    git = defaultGit,
    now = () => Date.now(),
  } = opts;

  const refsOut = git(cwd, ['for-each-ref', 'refs/heads', '--format=%(refname:short)|%(objectname)|%(committerdate:unix)']);
  const cutoffSec = (now() - activeWindowMs) / 1000;
  const records = [];

  for (const line of refsOut.split('\n')) {
    if (!line.trim()) continue;
    const [branch, sha, cdate] = line.split('|');
    if (!branch || !sha) continue;
    if (Number(cdate) < cutoffSec) continue; // skip stale/inactive branches
    const message = git(cwd, ['log', '-1', '--format=%B', sha]);
    const trailers = parseProvenanceTrailers(message);
    records.push({
      branch,
      sha,
      committerDate: Number(cdate),
      sessionId: trailers.aiSession,
      aiAgent: trailers.aiAgent,
      usedLegacyField: trailers.usedLegacyField,
    });
  }

  return { records, collisions: findDuplicateActiveSessions(records) };
}

module.exports = {
  parseProvenanceTrailers,
  findDuplicateActiveSessions,
  auditActiveSessionProvenance,
};
