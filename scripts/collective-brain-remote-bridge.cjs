#!/usr/bin/env node
'use strict';
// COLLECTIVE_BRAIN_REMOTE_TASK_BRIDGE
//
// The safe alternative to a raw shell/tunnel backdoor: Browser ChatGPT (or
// any other remote client with Supabase access) enqueues a row in
// public.world_remote_tasks using its OWN already-existing Supabase access.
// This script is a LOCAL, OUTBOUND-ONLY poller - it never accepts an
// inbound connection, never opens a port, never exposes a shell. It polls
// Supabase (pull, not push), and for each queued task:
//   1. validates task.command against the fixed allowlist in
//      data/collective-brain/remote-task-commands.json (every command maps
//      to exactly one pre-approved script/action - never an arbitrary
//      shell string from the task's own args);
//   2. runs it through the EXISTING lib/collective-brain policyGate (the
//      same hard-deny/approval-required gate already used for other
//      protected operations - not a second parallel policy system);
//   3. executes ONLY that one pre-approved action, scoped to the current
//      worktree/repo;
//   4. writes the result back to the same Supabase row AND appends it to
//      state/ai-agent-reports.jsonl (the existing shared coordination log
//      other AI agents already write) plus the collective-brain audit
//      event chain - not a new, competing reporting channel.
//
// Any action that actually changes code (apply_patch) is scoped to an
// isolated worktree only; reaching master still requires the existing
// PR -> CI -> gates -> merge-on-green flow. This script cannot merge to
// master by itself.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const collectiveBrain = require('../lib/collective-brain');
const { createAdminClient } = require('../lib/env');

const ROOT = path.resolve(__dirname, '..');
const REPORT_LOG_PATH = process.env.AI_AGENT_REPORTS_PATH || path.join(ROOT, 'state', 'ai-agent-reports.jsonl');
const commandDefs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'collective-brain', 'remote-task-commands.json'), 'utf8')).commands;

function appendAgentReport(entry) {
  try {
    fs.mkdirSync(path.dirname(REPORT_LOG_PATH), { recursive: true });
    fs.appendFileSync(REPORT_LOG_PATH, JSON.stringify(entry) + '\n');
    return true;
  } catch { return false; }
}

function runNpmScript(scriptName, cwd = ROOT, timeoutMs = 480000) {
  const r = spawnSync('npm', ['run', scriptName], { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell: true });
  return {
    ok: r.status === 0,
    exitCode: r.status,
    stdout: String(r.stdout || '').slice(-8000),
    stderr: String(r.stderr || '').slice(-4000),
    timedOut: r.error && r.error.code === 'ETIMEDOUT',
  };
}

function readAllowlistedFile(args, def) {
  const rel = args && args.file;
  if (!rel || !def.allowedFiles.includes(rel)) {
    return { ok: false, error: `file not in allowlist: ${rel}. Allowed: ${def.allowedFiles.join(', ')}` };
  }
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return { ok: false, error: `${rel} does not exist yet (no report generated)` };
  const tailLines = Math.min(Number(args.tailLines) || 200, 500);
  const content = fs.readFileSync(full, 'utf8').split(/\r?\n/).slice(-tailLines).join('\n');
  return { ok: true, file: rel, content: content.slice(-16000) };
}

function runAllowlistedScript(args, def) {
  const scriptId = args && args.scriptId;
  const scriptPath = def.allowedScripts[scriptId];
  if (!scriptPath) return { ok: false, error: `scriptId not in allowlist: ${scriptId}. Allowed: ${Object.keys(def.allowedScripts).join(', ')}` };
  const r = spawnSync(process.execPath, [scriptPath], { cwd: ROOT, encoding: 'utf8', timeout: 120000, windowsHide: true });
  return {
    ok: r.status === 0,
    exitCode: r.status,
    scriptId,
    stdout: String(r.stdout || '').slice(-8000),
    stderr: String(r.stderr || '').slice(-4000),
  };
}

function applyGuardedPatch(args, def) {
  const diff = args && args.diff;
  const targetWorktree = args && args.targetWorktree;
  if (!diff || typeof diff !== 'string') return { ok: false, error: 'missing diff' };
  if (Buffer.byteLength(diff, 'utf8') > def.maxDiffBytes) return { ok: false, error: `diff exceeds maxDiffBytes (${def.maxDiffBytes})` };
  if (!targetWorktree || !fs.existsSync(targetWorktree) || !fs.existsSync(path.join(targetWorktree, '.git'))) {
    return { ok: false, error: 'targetWorktree must be an existing, isolated git worktree - refusing to guess or default to the main tree' };
  }
  const mainTreeReal = fs.realpathSync(ROOT);
  const targetReal = fs.realpathSync(targetWorktree);
  if (targetReal === mainTreeReal) return { ok: false, error: 'refusing to apply a remote patch directly to the main tree - target must be an isolated worktree' };
  for (const bad of def.forbiddenPathPrefixes) {
    if (diff.includes(`+++ b/${bad}`) || diff.includes(`--- a/${bad}`)) {
      return { ok: false, error: `diff touches a forbidden path prefix: ${bad}` };
    }
  }
  const patchFile = path.join(os.tmpdir(), `remote-task-patch-${Date.now()}.diff`);
  fs.writeFileSync(patchFile, diff);
  try {
    const check = spawnSync('git', ['apply', '--check', patchFile], { cwd: targetWorktree, encoding: 'utf8' });
    if (check.status !== 0) return { ok: false, error: 'git apply --check failed', stderr: String(check.stderr || '') };
    const apply = spawnSync('git', ['apply', patchFile], { cwd: targetWorktree, encoding: 'utf8' });
    if (apply.status !== 0) return { ok: false, error: 'git apply failed after a clean check (unexpected)', stderr: String(apply.stderr || '') };
    return { ok: true, message: 'patch applied to isolated worktree; run verify_patch next, then a normal PR is still required to reach master', targetWorktree };
  } finally {
    try { fs.unlinkSync(patchFile); } catch { /* best effort cleanup */ }
  }
}

function restartNamedWorker(args, def) {
  const workerId = args && args.workerId;
  const cmd = def.allowedWorkers[workerId];
  if (!cmd) return { ok: false, error: `workerId not registered: ${workerId}. Registered: ${Object.keys(def.allowedWorkers).join(', ') || '(none yet)'}` };
  return { ok: false, error: 'restart_known_worker execution not yet wired for any registered worker - allowlist is intentionally empty until one is deliberately added' };
}

async function executeTask(task) {
  const def = commandDefs[task.command];
  if (!def) return { ok: false, error: `unknown command: ${task.command}` };

  const gate = collectiveBrain.policyGate(ROOT, `remote-task:${task.command}`, {
    humanApproved: process.env.COLLECTIVE_BRAIN_HUMAN_APPROVED === '1',
  });
  collectiveBrain.appendEvent(ROOT, 'REMOTE_TASK_CLAIMED', { taskId: task.id, command: task.command, gateDecision: gate.decision });
  if (gate.decision === 'deny') return { ok: false, error: 'denied by collective-brain policy', gate };
  if (gate.decision === 'approval-required') return { ok: false, error: 'awaiting human approval (COLLECTIVE_BRAIN_HUMAN_APPROVED)', gate, needsApproval: true };

  switch (def.kind) {
    case 'npm-script': return runNpmScript(def.script);
    case 'read-allowlisted-file': return readAllowlistedFile(task.args || {}, def);
    case 'read-allowlisted-script': return runAllowlistedScript(task.args || {}, def);
    case 'guarded-patch': return applyGuardedPatch(task.args || {}, def);
    case 'named-allowlist': return restartNamedWorker(task.args || {}, def);
    case 'unavailable': return { ok: false, status: 'unavailable', message: def.description };
    default: return { ok: false, error: `unhandled command kind: ${def.kind}` };
  }
}

async function claimNextTask(supabase, workerId) {
  const { data: candidates, error: selErr } = await supabase
    .from('world_remote_tasks')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);
  if (selErr) throw new Error(`select failed: ${selErr.message}`);
  if (!candidates || !candidates.length) return null;
  const candidate = candidates[0];
  const { data: claimed, error: updErr } = await supabase
    .from('world_remote_tasks')
    .update({ status: 'claimed', claimed_by: workerId, claimed_at: new Date().toISOString() })
    .eq('id', candidate.id)
    .eq('status', 'queued')
    .select()
    .single();
  if (updErr || !claimed) return null; // lost the race to another worker - not an error
  return claimed;
}

async function runOnce(workerId = `remote-bridge-${os.hostname()}-${process.pid}`) {
  const url = process.env.SUPABASE_URL;
  if (!url) return { drained: false, reason: 'SUPABASE_URL not set' };
  const supabase = createAdminClient();
  const task = await claimNextTask(supabase, workerId);
  if (!task) return { drained: false, reason: 'queue empty' };

  const startedAt = new Date().toISOString();
  await supabase.from('world_remote_tasks').update({ status: 'running', started_at: startedAt }).eq('id', task.id);

  let result;
  try {
    result = await executeTask(task);
  } catch (e) {
    result = { ok: false, error: `unhandled exception: ${e.message}` };
  }

  const status = result.needsApproval ? 'rejected' : (result.ok ? 'done' : 'failed');
  const finishedAt = new Date().toISOString();
  const scan = collectiveBrain.securityScanText(JSON.stringify(result));
  const safeResult = scan.findings.length ? { ...result, redacted: true, redactionNote: `${scan.findings.length} potential secret pattern(s) found and stripped before storing`, stdout: undefined, stderr: undefined } : result;

  await supabase.from('world_remote_tasks').update({
    status,
    result: safeResult,
    error: result.error || null,
    finished_at: finishedAt,
  }).eq('id', task.id);

  collectiveBrain.appendEvent(ROOT, 'REMOTE_TASK_COMPLETED', { taskId: task.id, command: task.command, status });
  appendAgentReport({
    at: finishedAt,
    agent: 'collective-brain-remote-bridge',
    task_id: `remote-task-${task.id}`,
    status: status === 'done' ? 'done' : status === 'rejected' ? 'blocked' : 'failed',
    progress: status === 'done' ? 100 : 50,
    branch: null, worktree: null, commit: null, pr: null, tests: {},
    blockers: status === 'done' ? [] : [{ id: `remote-task-${status}`, status: 'needs_review', reason: result.error || 'see result' }],
    merge_safe: false,
    next_action: 'reviewer to inspect result',
    findings: { command: task.command, requestedBy: task.requested_by },
    reusable_improvements: [],
  });

  return { drained: true, taskId: task.id, command: task.command, status };
}

module.exports = { runOnce, executeTask, claimNextTask, commandDefs };

if (require.main === module) {
  const watch = process.argv.includes('--watch');
  const intervalMs = Number(process.env.REMOTE_BRIDGE_INTERVAL_MS || 15000);
  async function tick() {
    const r = await runOnce();
    console.log(JSON.stringify(r));
    return r;
  }
  if (watch) {
    (async () => { for (;;) { await tick(); await new Promise((res) => setTimeout(res, intervalMs)); } })();
  } else {
    tick().then((r) => { process.exitCode = r.drained && r.status === 'failed' ? 1 : 0; }).catch((e) => { console.error(e); process.exitCode = 1; });
  }
}
