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
//
// PRODUCTION HARDENING (this revision):
//   - single-instance protection: wraps each cycle in the existing
//     lib/collective-brain file lease (`acquireLease`/`releaseLease`,
//     scope 'remote-bridge-worker') - the same primitive `cycle()` already
//     uses, not a second locking system. Two workers polling at once will
//     never process tasks concurrently.
//   - stuck-task reclaim: before claiming a new task, any task stuck in
//     'claimed'/'running' past REMOTE_BRIDGE_STUCK_MS (worker crashed
//     mid-task) is requeued (bounded by retry_count/max_retries) or moved
//     to 'dead_letter' once retries are exhausted.
//   - bounded retries + dead-letter: a retriable failure (execution error,
//     timeout, unhandled exception) is requeued up to `max_retries` times,
//     then marked 'dead_letter' with full history preserved. A
//     non-retriable failure (bad command/args, policy denial) fails
//     immediately without wasting retries - retrying a validation error
//     can't ever succeed.
//   - known-issue auto-lookup on failure: failures are matched against
//     data/error-prevention-registry.json's knownErrors (same data
//     collective-brain:recall already reads) and any hits are attached to
//     the result, so a recurring failure surfaces its known root
//     cause/fix automatically instead of being rediagnosed from scratch.
//   - verified-fix auto-registration: an apply_patch task may include
//     `args.fixMetadata` (id/rootCause/solution/protection/evidence); once
//     a later verify_patch task succeeds against the same targetWorktree,
//     the fix is registered via the existing
//     scripts/collective-brain-register-fix.js flow automatically.
//   - structured JSON-line logs to stdout, a cheap-to-poll status snapshot
//     at data/collective-brain/runtime/remote-bridge-status.json, and
//     graceful shutdown (SIGINT/SIGTERM finish the in-flight task, release
//     the lease, then exit) for --watch mode.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const collectiveBrain = require('../lib/collective-brain');
const { createWorkerAuthedClient } = require('../lib/env');
const agentAdapters = require('../lib/agent-adapters');

const ROOT = path.resolve(__dirname, '..');
const REPORT_LOG_PATH = process.env.AI_AGENT_REPORTS_PATH || path.join(ROOT, 'state', 'ai-agent-reports.jsonl');
const STATUS_PATH = path.join(ROOT, 'data', 'collective-brain', 'runtime', 'remote-bridge-status.json');
const commandDefs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'collective-brain', 'remote-task-commands.json'), 'utf8')).commands;
const STUCK_MS = Number(process.env.REMOTE_BRIDGE_STUCK_MS || 10 * 60 * 1000);

function log(level, msg, extra = {}) {
  try { console.log(JSON.stringify({ level, msg, at: new Date().toISOString(), component: 'collective-brain-remote-bridge', ...extra })); } catch { /* never let logging crash the worker */ }
}

function appendAgentReport(entry) {
  try {
    fs.mkdirSync(path.dirname(REPORT_LOG_PATH), { recursive: true });
    fs.appendFileSync(REPORT_LOG_PATH, JSON.stringify(entry) + '\n');
    return true;
  } catch { return false; }
}

function writeStatus(status) {
  try {
    fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
    fs.writeFileSync(STATUS_PATH, JSON.stringify({ ...status, updatedAt: new Date().toISOString(), pid: process.pid, hostname: os.hostname() }, null, 2) + '\n');
  } catch { /* status snapshot is a convenience, never fatal */ }
}

function knownIssueMatches(text) {
  try {
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'error-prevention-registry.json'), 'utf8'));
    const known = Array.isArray(registry.knownErrors) ? registry.knownErrors : [];
    const haystack = String(text || '').toLowerCase();
    if (!haystack.trim()) return [];
    const words = new Set(haystack.split(/[^a-z0-9]+/i).filter((w) => w.length > 3));
    const scored = known.map((e) => {
      const fields = [e.symptom, e.rootCause, e.id].filter(Boolean).join(' ').toLowerCase();
      let score = 0;
      for (const w of words) if (fields.includes(w)) score += 1;
      return { e, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    return scored.map(({ e, score }) => ({ id: e.id, status: e.status, symptom: e.symptom, rootCause: e.rootCause, solution: e.solution, protection: e.protection, matchScore: score }));
  } catch { return []; }
}

function runNpmScript(scriptName, cwd = ROOT, timeoutMs = 480000) {
  const r = spawnSync('npm', ['run', scriptName], { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell: true });
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  return {
    ok: r.status === 0,
    retriable: r.status !== 0,
    exitCode: r.status,
    stdout: String(r.stdout || '').slice(-8000),
    stderr: String(r.stderr || '').slice(-4000),
    timedOut,
  };
}

function readAllowlistedFile(args, def) {
  const rel = args && args.file;
  if (!rel || !def.allowedFiles.includes(rel)) {
    return { ok: false, retriable: false, error: `file not in allowlist: ${rel}. Allowed: ${def.allowedFiles.join(', ')}` };
  }
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return { ok: false, retriable: false, error: `${rel} does not exist yet (no report generated)` };
  const tailLines = Math.min(Number(args.tailLines) || 200, 500);
  const content = fs.readFileSync(full, 'utf8').split(/\r?\n/).slice(-tailLines).join('\n');
  return { ok: true, file: rel, content: content.slice(-16000) };
}

function runAllowlistedScript(args, def) {
  const scriptId = args && args.scriptId;
  const scriptPath = def.allowedScripts[scriptId];
  if (!scriptPath) return { ok: false, retriable: false, error: `scriptId not in allowlist: ${scriptId}. Allowed: ${Object.keys(def.allowedScripts).join(', ')}` };
  const r = spawnSync(process.execPath, [scriptPath], { cwd: ROOT, encoding: 'utf8', timeout: 120000, windowsHide: true });
  return {
    ok: r.status === 0,
    retriable: r.status !== 0,
    exitCode: r.status,
    scriptId,
    stdout: String(r.stdout || '').slice(-8000),
    stderr: String(r.stderr || '').slice(-4000),
  };
}

function applyGuardedPatch(args, def) {
  const diff = args && args.diff;
  const targetWorktree = args && args.targetWorktree;
  if (!diff || typeof diff !== 'string') return { ok: false, retriable: false, error: 'missing diff' };
  if (Buffer.byteLength(diff, 'utf8') > def.maxDiffBytes) return { ok: false, retriable: false, error: `diff exceeds maxDiffBytes (${def.maxDiffBytes})` };
  if (!targetWorktree || !fs.existsSync(targetWorktree) || !fs.existsSync(path.join(targetWorktree, '.git'))) {
    return { ok: false, retriable: false, error: 'targetWorktree must be an existing, isolated git worktree - refusing to guess or default to the main tree' };
  }
  const mainTreeReal = fs.realpathSync(ROOT);
  const targetReal = fs.realpathSync(targetWorktree);
  if (targetReal === mainTreeReal) return { ok: false, retriable: false, error: 'refusing to apply a remote patch directly to the main tree - target must be an isolated worktree' };
  for (const bad of def.forbiddenPathPrefixes) {
    if (diff.includes(`+++ b/${bad}`) || diff.includes(`--- a/${bad}`)) {
      return { ok: false, retriable: false, error: `diff touches a forbidden path prefix: ${bad}` };
    }
  }
  const patchFile = path.join(os.tmpdir(), `remote-task-patch-${Date.now()}.diff`);
  fs.writeFileSync(patchFile, diff);
  try {
    const check = spawnSync('git', ['apply', '--check', patchFile], { cwd: targetWorktree, encoding: 'utf8' });
    if (check.status !== 0) return { ok: false, retriable: false, error: 'git apply --check failed', stderr: String(check.stderr || '') };
    const apply = spawnSync('git', ['apply', patchFile], { cwd: targetWorktree, encoding: 'utf8' });
    if (apply.status !== 0) return { ok: false, retriable: true, error: 'git apply failed after a clean check (unexpected)', stderr: String(apply.stderr || '') };
    return { ok: true, message: 'patch applied to isolated worktree; run verify_patch next, then a normal PR is still required to reach master', targetWorktree, fixMetadata: args.fixMetadata || null };
  } finally {
    try { fs.unlinkSync(patchFile); } catch { /* best effort cleanup */ }
  }
}

function verifyPatchAndMaybeRegisterFix(args, def) {
  const targetWorktree = args && args.targetWorktree;
  const cwd = (targetWorktree && fs.existsSync(path.join(targetWorktree, '.git'))) ? targetWorktree : ROOT;
  const result = runNpmScript(def.script, cwd);
  const fixMetadata = args && args.fixMetadata;
  if (result.ok && fixMetadata && fixMetadata.id && fixMetadata.rootCause && fixMetadata.solution && Array.isArray(fixMetadata.protection) && fixMetadata.protection.length) {
    const regArgs = ['--id', String(fixMetadata.id), '--root-cause', String(fixMetadata.rootCause), '--solution', String(fixMetadata.solution), '--protection', fixMetadata.protection.join(',')];
    if (Array.isArray(fixMetadata.evidence) && fixMetadata.evidence.length) regArgs.push('--evidence', fixMetadata.evidence.join(','));
    const reg = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'collective-brain-register-fix.js'), ...regArgs], { cwd: ROOT, encoding: 'utf8', timeout: 30000, windowsHide: true });
    result.fixRegistered = reg.status === 0;
    result.fixRegistrationOutput = String(reg.stdout || reg.stderr || '').trim().slice(-500);
  }
  return result;
}

function ghAuthed() {
  const r = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 10000, windowsHide: true, shell: true });
  return r.status === 0;
}

function runGhCliReadonly(op, args) {
  if (!ghAuthed()) return { ok: true, configured: false, message: '`gh` CLI is not authenticated on this host - read-only CI/deployment status is unavailable until it is. No credential is requested from or exposed to the task requester.' };
  if (op === 'ci_status') {
    const r = spawnSync('gh', ['run', 'list', '--limit', '5', '--json', 'name,status,conclusion,headBranch,createdAt'], { encoding: 'utf8', timeout: 20000, windowsHide: true, shell: true });
    if (r.status !== 0) return { ok: false, retriable: true, error: String(r.stderr || 'gh run list failed').slice(-2000) };
    try { return { ok: true, configured: true, runs: JSON.parse(r.stdout) }; } catch { return { ok: false, retriable: true, error: 'could not parse gh run list output' }; }
  }
  if (op === 'deployment_status') {
    const head = spawnSync('git', ['log', '-1', '--format=%H %D %s'], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
    const r = spawnSync('gh', ['pr', 'list', '--state', 'merged', '--limit', '5', '--json', 'number,title,mergedAt,url'], { encoding: 'utf8', timeout: 20000, windowsHide: true, shell: true });
    let recentMergedPRs = [];
    if (r.status === 0) { try { recentMergedPRs = JSON.parse(r.stdout); } catch { /* leave empty */ } }
    return { ok: true, configured: true, head: String(head.stdout || '').trim(), recentMergedPRs, note: 'git/PR history, not a live Vercel deployment poll - no Vercel token is used by this bridge' };
  }
  return { ok: false, retriable: false, error: `unknown gh-cli-readonly op: ${op}` };
}

function healthStatus() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'collective-brain-remote-bridge-watchdog.js'), '--healthcheck'], { cwd: ROOT, encoding: 'utf8', timeout: 15000, windowsHide: true });
  let watchdog = null;
  try { watchdog = JSON.parse(r.stdout); } catch { watchdog = { error: 'watchdog healthcheck did not return valid JSON', stderr: String(r.stderr || '').slice(-1000) }; }
  const chain = collectiveBrain.verifyEventChain(ROOT);
  return { ok: true, watchdog, eventChain: { ok: chain.ok, count: chain.count } };
}

function restartNamedWorker(args, def) {
  const workerId = args && args.workerId;
  const cmd = def.allowedWorkers[workerId];
  if (!cmd) return { ok: false, retriable: false, error: `workerId not registered: ${workerId}. Registered: ${Object.keys(def.allowedWorkers).join(', ') || '(none yet)'}` };
  const r = spawnSync(process.execPath, [path.join(ROOT, cmd), '--restart'], { cwd: ROOT, encoding: 'utf8', timeout: 30000, windowsHide: true });
  return { ok: r.status === 0, retriable: r.status !== 0, workerId, stdout: String(r.stdout || '').slice(-4000), stderr: String(r.stderr || '').slice(-2000) };
}

function createWorktree(args) {
  const r = agentAdapters.createIsolatedWorktree(ROOT, (args && args.name) || 'task');
  if (r.ok) collectiveBrain.appendEvent(ROOT, 'AGENT_WORKTREE_CREATED', { worktreePath: r.worktreePath, branch: r.branch });
  return r;
}

function removeWorktree(args) {
  const target = args && args.targetWorktree;
  const r = agentAdapters.removeIsolatedWorktree(ROOT, target);
  if (r.ok) collectiveBrain.appendEvent(ROOT, 'AGENT_WORKTREE_REMOVED', { worktreePath: target });
  return r;
}

function inspectWorktreeDiff(args) {
  const target = args && args.targetWorktree;
  const guard = agentAdapters.assertIsolatedWorktree(ROOT, target);
  if (!guard.ok) return { ok: false, retriable: false, error: guard.error };
  const r = spawnSync('git', ['diff', '--stat'], { cwd: target, encoding: 'utf8', timeout: 15000 });
  const full = spawnSync('git', ['diff'], { cwd: target, encoding: 'utf8', timeout: 15000 });
  return { ok: true, stat: String(r.stdout || '').trim(), diff: String(full.stdout || '').slice(-40000) };
}

async function agentImplement(args) {
  const target = args && args.targetWorktree;
  const repair = agentAdapters.repairWorktreeIfCorrupted(ROOT, target);
  if (repair.repaired) return { ok: false, retriable: false, error: 'targetWorktree was corrupted and has been removed - create a fresh one with create_worktree and retry', repaired: true };
  // per-worktree lease: two agent_implement/agent_autofix calls must never
  // edit the same worktree concurrently.
  const scope = `agent-invoke:${collectiveBrain.sha256 ? collectiveBrain.sha256(target) : target.replace(/[^a-z0-9]/gi, '_').slice(-40)}`;
  const lease = collectiveBrain.acquireLease(ROOT, scope, { ttlMs: 15 * 60 * 1000 });
  if (!lease.ok) return { ok: false, retriable: true, error: 'another agent is already working in this worktree', existingLease: lease.existing || null };
  try {
    const result = await agentAdapters.implementGoal({ mainRoot: ROOT, goal: args && args.goal, targetWorktree: target, timeoutMs: Number((args && args.timeoutMs) || 240000) });
    collectiveBrain.appendEvent(ROOT, 'AGENT_IMPLEMENT_COMPLETED', { targetWorktree: target, ok: result.ok, attempts: (result.attempts || []).map((a) => a.classification) });
    return { ...result, retriable: result.retriable !== undefined ? result.retriable : !result.ok };
  } finally {
    collectiveBrain.releaseLease(ROOT, scope);
  }
}

async function agentAutofix(args) {
  const target = args && args.targetWorktree;
  const guard = agentAdapters.assertIsolatedWorktree(ROOT, target);
  if (!guard.ok) return { ok: false, retriable: false, error: guard.error };
  const testOutput = (args && args.testOutput) || await (async () => {
    const r = await agentAdapters.runWithTreeKill('npm', ['run', 'check'], { cwd: target, timeout: 480000 });
    return { ok: r.status === 0, stdout: String(r.stdout || '').slice(-6000), stderr: String(r.stderr || '').slice(-3000) };
  })();
  if (testOutput.ok) return { ok: true, message: 'tests already pass - nothing to fix', retriable: false };
  const goal = `The test suite in this worktree is failing. Fix the root cause (do not just delete or skip the failing test) so \`npm run check\` passes. Failing output:\n\n${String(testOutput.stdout || '').slice(-3000)}\n${String(testOutput.stderr || '').slice(-1500)}`;
  return agentImplement({ targetWorktree: target, goal, timeoutMs: args && args.timeoutMs });
}

function preparePr(args) {
  const target = args && args.targetWorktree;
  const guard = agentAdapters.assertIsolatedWorktree(ROOT, target);
  if (!guard.ok) return { ok: false, retriable: false, error: guard.error };
  const title = String((args && args.title) || '').trim();
  const body = String((args && args.body) || 'Prepared by the remote-task bridge (agent_implement -> prepare_commit_and_pr).');
  if (!title) return { ok: false, retriable: false, error: 'title is required' };
  const diffCheck = spawnSync('git', ['status', '--porcelain'], { cwd: target, encoding: 'utf8', timeout: 15000 });
  if (!String(diffCheck.stdout || '').trim()) return { ok: false, retriable: false, error: 'nothing to commit in targetWorktree' };
  const add = spawnSync('git', ['add', '-A'], { cwd: target, encoding: 'utf8', timeout: 30000 });
  if (add.status !== 0) return { ok: false, retriable: true, error: `git add failed: ${String(add.stderr || '').slice(-1000)}` };
  const commit = spawnSync('git', ['commit', '-m', title, '-m', 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>'], { cwd: target, encoding: 'utf8', timeout: 30000 });
  if (commit.status !== 0) return { ok: false, retriable: true, error: `git commit failed: ${String(commit.stderr || '').slice(-1000)}` };
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: target, encoding: 'utf8', timeout: 10000 }).stdout.trim();
  const push = spawnSync('git', ['push', '-u', 'origin', branch], { cwd: target, encoding: 'utf8', timeout: 60000 });
  if (push.status !== 0) return { ok: false, retriable: true, error: `git push failed: ${String(push.stderr || '').slice(-1500)}` };
  const goalFile = path.join(os.tmpdir(), `pr-body-${Date.now()}.md`);
  fs.writeFileSync(goalFile, body);
  const pr = spawnSync('gh', ['pr', 'create', '--base', 'master', '--head', branch, '--title', title, '--body-file', goalFile], { cwd: target, encoding: 'utf8', timeout: 30000, shell: true });
  try { fs.unlinkSync(goalFile); } catch { /* best effort */ }
  if (pr.status !== 0) return { ok: false, retriable: true, error: `gh pr create failed: ${String(pr.stderr || '').slice(-1500)}`, branch, pushed: true };
  const url = String(pr.stdout || '').trim();
  collectiveBrain.appendEvent(ROOT, 'AGENT_PR_PREPARED', { branch, url });
  return { ok: true, branch, url };
}

async function aiQuery(args) {
  const prompt = (args && args.prompt) || '';
  if (!prompt.trim()) return { ok: false, retriable: false, error: 'prompt is required' };
  if (!(await agentAdapters.ollamaAvailable())) return { ok: false, retriable: true, error: 'Ollama is not reachable on this host' };
  const r = await agentAdapters.queryOllama(prompt, { timeoutMs: Number((args && args.timeoutMs) || 60000) });
  return r;
}

async function executeTask(task) {
  const def = commandDefs[task.command];
  if (!def) return { ok: false, retriable: false, error: `unknown command: ${task.command}` };

  const gate = collectiveBrain.policyGate(ROOT, `remote-task:${task.command}`, {
    humanApproved: process.env.COLLECTIVE_BRAIN_HUMAN_APPROVED === '1',
  });
  collectiveBrain.appendEvent(ROOT, 'REMOTE_TASK_CLAIMED', { taskId: task.id, command: task.command, gateDecision: gate.decision });
  if (gate.decision === 'deny') return { ok: false, retriable: false, error: 'denied by collective-brain policy', gate };
  if (gate.decision === 'approval-required') return { ok: false, retriable: false, error: 'awaiting human approval (COLLECTIVE_BRAIN_HUMAN_APPROVED)', gate, needsApproval: true };

  switch (def.kind) {
    case 'npm-script': return task.command === 'verify_patch' ? verifyPatchAndMaybeRegisterFix(task.args || {}, def) : runNpmScript(def.script);
    case 'read-allowlisted-file': return readAllowlistedFile(task.args || {}, def);
    case 'read-allowlisted-script': return runAllowlistedScript(task.args || {}, def);
    case 'guarded-patch': return applyGuardedPatch(task.args || {}, def);
    case 'named-allowlist': return restartNamedWorker(task.args || {}, def);
    case 'local-recall': return { ok: true, matches: knownIssueMatches((task.args && task.args.query) || '') };
    case 'route-recommendation': return { ok: true, route: collectiveBrain.routeTask(ROOT, (task.args && task.args.goal) || '') };
    case 'gh-cli-readonly': return runGhCliReadonly(def.op, task.args || {});
    case 'create-worktree': return createWorktree(task.args || {});
    case 'remove-worktree': return removeWorktree(task.args || {});
    case 'inspect-diff': return inspectWorktreeDiff(task.args || {});
    case 'agent-invoke-implement': return agentImplement(task.args || {});
    case 'agent-invoke-autofix': return agentAutofix(task.args || {});
    case 'prepare-pr': return preparePr(task.args || {});
    case 'ai-query': return aiQuery(task.args || {});
    case 'health-status': return healthStatus();
    case 'unavailable': return { ok: false, retriable: false, status: 'unavailable', message: def.description };
    default: return { ok: false, retriable: false, error: `unhandled command kind: ${def.kind}` };
  }
}

function decideOutcomeStatus({ ok, retriable, needsApproval, retryCount, maxRetries }) {
  if (needsApproval) return 'rejected';
  if (ok) return 'done';
  if (retriable === false) return 'failed'; // validation/policy errors can never succeed by retrying
  if (retryCount < maxRetries) return 'retry-queued';
  return 'dead_letter'; // retriable, but the retry budget is exhausted - never silently drop it
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
    .update({ status: 'claimed', claimed_by: workerId, claimed_at: new Date().toISOString(), worker_id: workerId })
    .eq('id', candidate.id)
    .eq('status', 'queued')
    .select()
    .single();
  if (updErr || !claimed) return null; // lost the race to another worker - not an error
  return claimed;
}

async function reclaimStuckTasks(supabase, workerId) {
  const cutoff = new Date(Date.now() - STUCK_MS).toISOString();
  const { data: stuck, error } = await supabase
    .from('world_remote_tasks')
    .select('*')
    .in('status', ['claimed', 'running'])
    .lt('claimed_at', cutoff);
  if (error || !stuck || !stuck.length) return { reclaimed: 0, deadLettered: 0 };
  let reclaimed = 0, deadLettered = 0;
  for (const t of stuck) {
    const nextRetry = (t.retry_count || 0) + 1;
    if (nextRetry > (t.max_retries ?? 2)) {
      await supabase.from('world_remote_tasks').update({
        status: 'dead_letter',
        retry_count: nextRetry,
        error: `worker did not finish within ${STUCK_MS}ms (likely crashed) and retry budget is exhausted`,
        finished_at: new Date().toISOString(),
      }).eq('id', t.id).in('status', ['claimed', 'running']);
      deadLettered += 1;
      collectiveBrain.appendEvent(ROOT, 'REMOTE_TASK_DEAD_LETTER', { taskId: t.id, command: t.command, reason: 'stuck-retry-exhausted' });
    } else {
      await supabase.from('world_remote_tasks').update({
        status: 'queued', claimed_by: null, claimed_at: null, started_at: null, worker_id: null, retry_count: nextRetry,
      }).eq('id', t.id).in('status', ['claimed', 'running']);
      reclaimed += 1;
      collectiveBrain.appendEvent(ROOT, 'REMOTE_TASK_STUCK_RECLAIMED', { taskId: t.id, command: t.command, retryCount: nextRetry });
    }
  }
  if (reclaimed || deadLettered) log('warn', 'reclaimed stuck tasks', { reclaimed, deadLettered, workerId });
  return { reclaimed, deadLettered };
}

async function runOnce(workerId = `remote-bridge-${os.hostname()}-${process.pid}`, injectedSupabase = null) {
  // injectedSupabase exists purely for regression tests, so runOnce()'s full
  // lease/reclaim/claim/execute/writeback logic can be exercised without a
  // live Supabase project - production callers never pass it.
  //
  // Auth: this worker no longer holds SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY
  // at all - it connects with the same public/publishable Supabase client
  // as scripts/browser-local-worker-live.cjs already proved live, plus a
  // worker identity (BROWSER_WORKER_ID/BROWSER_WORKER_TOKEN) sent as
  // request headers, which the row-level-security policy
  // private.remote_inbox_worker_authorized() checks server-side. Fails
  // closed and BEFORE the lease is ever acquired: a real config problem
  // here is not a transient "Supabase unreachable" condition and must
  // never be miscategorized or silently retried as one.
  let supabase = null;
  if (!injectedSupabase) {
    try {
      supabase = createWorkerAuthedClient();
    } catch (e) {
      return { drained: false, reason: `worker auth not configured: ${e.message}` };
    }
  }

  const lease = collectiveBrain.acquireLease(ROOT, 'remote-bridge-worker', { owner: workerId });
  if (!lease.ok) {
    log('info', 'another remote-bridge worker instance holds the lease - skipping this cycle', { workerId, existing: lease.existing || null });
    return { drained: false, reason: 'another worker instance is active (lease held)' };
  }

  try {
    supabase = injectedSupabase || supabase;
    let reclaim, task;
    try {
      reclaim = await reclaimStuckTasks(supabase, workerId);
      task = await claimNextTask(supabase, workerId);
    } catch (e) {
      // Supabase temporarily unreachable/erroring: back off gracefully and
      // let the next tick retry, rather than throwing out of runOnce() and
      // crashing the whole --watch loop over a transient network blip.
      log('warn', 'supabase unreachable this cycle, backing off', { error: e.message });
      writeStatus({ state: 'supabase-error', lastCycleAt: new Date().toISOString(), error: e.message });
      return { drained: false, reason: `supabase error: ${e.message}` };
    }
    if (!task) {
      writeStatus({ state: 'idle', lastCycleAt: new Date().toISOString(), reclaim });
      return { drained: false, reason: 'queue empty', reclaim };
    }

    log('info', 'claimed task', { taskId: task.id, command: task.command, workerId, retryCount: task.retry_count || 0 });
    const startedAt = new Date().toISOString();
    await supabase.from('world_remote_tasks').update({ status: 'running', started_at: startedAt }).eq('id', task.id);

    let result;
    try {
      result = await executeTask(task);
    } catch (e) {
      result = { ok: false, retriable: true, error: `unhandled exception: ${e.message}` };
    }

    if (!result.ok && !result.needsApproval) {
      const matches = knownIssueMatches(`${task.command} ${result.error || ''} ${result.stderr || ''}`);
      if (matches.length) result.knownIssueMatches = matches;
    }

    const retryCount = task.retry_count || 0;
    const maxRetries = task.max_retries ?? 2;
    const status = decideOutcomeStatus({ ok: result.ok, retriable: result.retriable, needsApproval: result.needsApproval, retryCount, maxRetries });

    const finishedAt = new Date().toISOString();
    const scan = collectiveBrain.securityScanText(JSON.stringify(result));
    const safeResult = scan.findings.length ? { ...result, redacted: true, redactionNote: `${scan.findings.length} potential secret pattern(s) found and stripped before storing`, stdout: undefined, stderr: undefined } : result;

    if (status === 'retry-queued') {
      await supabase.from('world_remote_tasks').update({
        status: 'queued', claimed_by: null, claimed_at: null, started_at: null, worker_id: null,
        retry_count: retryCount + 1, result: safeResult, error: result.error || null,
      }).eq('id', task.id);
      log('warn', 'task failed, requeued for retry', { taskId: task.id, command: task.command, retryCount: retryCount + 1, maxRetries });
    } else {
      await supabase.from('world_remote_tasks').update({
        status: status === 'dead_letter' ? 'dead_letter' : status,
        result: safeResult, error: result.error || null, finished_at: finishedAt,
        retry_count: status === 'dead_letter' ? retryCount + 1 : retryCount,
      }).eq('id', task.id);
    }

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
      next_action: status === 'retry-queued' ? 'automatic retry scheduled' : 'reviewer to inspect result',
      findings: { command: task.command, requestedBy: task.requested_by },
      reusable_improvements: [],
    });

    writeStatus({ state: 'processed', lastCycleAt: finishedAt, lastTaskId: task.id, lastTaskCommand: task.command, lastTaskStatus: status, reclaim });
    return { drained: true, taskId: task.id, command: task.command, status };
  } finally {
    collectiveBrain.releaseLease(ROOT, 'remote-bridge-worker', workerId);
  }
}

module.exports = { runOnce, executeTask, claimNextTask, reclaimStuckTasks, knownIssueMatches, decideOutcomeStatus, commandDefs };

if (require.main === module) {
  const watch = process.argv.includes('--watch');
  const intervalMs = Number(process.env.REMOTE_BRIDGE_INTERVAL_MS || 15000);
  let shuttingDown = false;
  let inFlight = false;

  async function tick() {
    inFlight = true;
    try {
      const r = await runOnce();
      log('info', 'cycle complete', r);
      return r;
    } finally {
      inFlight = false;
    }
  }

  function installShutdownHandlers() {
    const handler = (sig) => {
      if (shuttingDown) return;
      shuttingDown = true;
      log('info', `received ${sig}, finishing in-flight task then exiting`, { inFlight });
      const waitForIdle = setInterval(() => {
        if (!inFlight) {
          clearInterval(waitForIdle);
          writeStatus({ state: 'stopped', stoppedAt: new Date().toISOString(), reason: sig });
          process.exit(0);
        }
      }, 250);
      setTimeout(() => { clearInterval(waitForIdle); process.exit(0); }, 30000).unref();
    };
    process.on('SIGINT', () => handler('SIGINT'));
    process.on('SIGTERM', () => handler('SIGTERM'));
  }

  if (watch) {
    installShutdownHandlers();
    log('info', 'watch mode started', { intervalMs, pid: process.pid });
    (async () => {
      while (!shuttingDown) {
        await tick();
        if (shuttingDown) break;
        await new Promise((res) => setTimeout(res, intervalMs));
      }
    })();
  } else {
    tick().then((r) => { process.exitCode = r.drained && (r.status === 'failed' || r.status === 'dead_letter') ? 1 : 0; }).catch((e) => { console.error(e); process.exitCode = 1; });
  }
}
