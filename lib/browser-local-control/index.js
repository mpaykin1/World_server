'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const CAPS_PATH = path.join(__dirname, 'capabilities.json');

function loadCaps(root = process.cwd()) {
  const p = path.join(root, 'lib/browser-local-control/capabilities.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return JSON.parse(fs.readFileSync(CAPS_PATH, 'utf8')); }
}
function isAllowed(cap, caps) {
  caps = caps || loadCaps();
  return Boolean(caps.capabilities && caps.capabilities[cap]);
}
function nowIso() { return new Date().toISOString(); }
function sha256(v) { return crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex'); }
function truncate(s, max = 4000) { s = String(s || ''); return s.length > max ? s.slice(0, max) + `\n...[truncated ${s.length - max} chars]` : s; }
function hmac(taskId, capability, args, secret) {
  return crypto.createHmac('sha256', secret).update(`${taskId}:${capability}:${JSON.stringify(args||{})}`).digest('hex');
}
function verifySignature(task, secret) {
  if (!secret) return { ok: true, reason: 'no-secret-configured' };
  const expected = hmac(task.task_id, task.capability, task.args, secret);
  const provided = String(task.signature || task.hmac || '');
  if (!provided) return { ok: false, reason: 'missing signature' };
  const a = Buffer.from(expected); const b = Buffer.from(provided);
  const ok = a.length === b.length && crypto.timingSafeEqual(a,b);
  return { ok, reason: ok ? 'hmac-ok' : 'hmac-mismatch' };
}
function validateTask(task) {
  const errors = [];
  if (!task.task_id || typeof task.task_id !== 'string') errors.push('task_id required');
  if (!task.capability || typeof task.capability !== 'string') errors.push('capability required');
  if (!task.requested_by) task.requested_by = 'browser-chatgpt';
  if (!task.repo) task.repo = 'mpaykin1/World_server';
  if (!task.worktree_mode) task.worktree_mode = loadCaps().capabilities[task.capability]?.worktree || 'isolated';
  if (!task.risk) task.risk = loadCaps().capabilities[task.capability]?.risk || 'low';
  if (!task.idempotency_key) task.idempotency_key = sha256(task.task_id + ':' + task.capability);
  if (!task.created_at) task.created_at = nowIso();
  if (!task.expires_at) task.expires_at = new Date(Date.now()+3600000).toISOString();
  if (Date.parse(task.expires_at) < Date.now()) errors.push('task expired');
  if (!isAllowed(task.capability)) errors.push(`capability not allowlisted: ${task.capability}`);
  if (task.risk === 'high' && task.worktree_mode !== 'isolated') errors.push('high-risk requires isolated worktree');
  return { ok: errors.length===0, errors, task };
}
function buildTask({ capability, args={}, requested_by='browser-chatgpt', worktree_mode, risk, idempotency_key, task_id }) {
  const id = task_id || `task_${crypto.randomBytes(8).toString('hex')}`;
  const idem = idempotency_key || `idem_${sha256(id).slice(0,16)}_${Date.now()}`;
  const caps = loadCaps(); const meta = caps.capabilities[capability] || {};
  return {
    task_id: id,
    requested_by,
    capability,
    args,
    repo: 'mpaykin1/World_server',
    worktree_mode: worktree_mode || meta.worktree || 'isolated',
    risk: risk || meta.risk || 'low',
    created_at: nowIso(),
    expires_at: new Date(Date.now()+ (meta.timeoutMs||3600000)).toISOString(),
    idempotency_key: idem,
    status: 'queued'
  };
}
function buildResult({ task_id, status='completed', executor='desktop-opencode', started_at, finished_at, files_changed=[], git_diff_summary='', commit_sha='', tests=[], artifacts=[], stdout_summary='', stderr_summary='', blockers=[], confidence=0.95 }) {
  return { task_id, status, executor, started_at: started_at||nowIso(), finished_at: finished_at||nowIso(), files_changed, git_diff_summary: truncate(git_diff_summary, 6000), commit_sha, tests, artifacts, stdout_summary: truncate(stdout_summary,4000), stderr_summary: truncate(stderr_summary,4000), blockers, confidence };
}
function git(root, args, timeoutMs=30000) {
  const r = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  return { status: r.status, stdout: String(r.stdout||''), stderr: String(r.stderr||''), error: r.error ? String(r.error) : null };
}
module.exports = { loadCaps, isAllowed, sha256, truncate, hmac, verifySignature, validateTask, buildTask, buildResult, nowIso, git };
