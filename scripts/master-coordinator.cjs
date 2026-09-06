#!/usr/bin/env node
'use strict';
// MASTER_COORDINATOR
//
// Single entry point for "one master goal in, coordinated multi-agent result
// out". Does NOT reimplement routing, leases, resource scheduling, or local-
// model dispatch - it wires together infrastructure that already exists:
//   - lib/collective-brain: recall() for context, routeTask() for agent
//     scoring, acquireLease()/releaseLease() for ownership, appendEvent() for
//     the tamper-evident audit trail, securityScanText() before any text is
//     handed to a local model.
//   - scripts/openhuman-subtask.cjs#runSubtask(): the existing, tested
//     OpenHuman/AnythingLLM/direct-Ollama dispatch path (resource-aware,
//     concurrency-leased, bounded retry, already reports into
//     state/ai-agent-reports.jsonl).
//   - the OpenCode CLI (`opencode run ... --format json --dir <worktree>`)
//     for coding/automation subtasks, dispatched into an isolated worktree
//     under WORKTREES_ROOT (never Desktop - see AGENTS.md sec 19.2).
//   - Claude Code (this same process) for architecture/integration/review/
//     real-machine subtasks: no subprocess is spawned for these, the
//     coordinator's own caller (the running Claude Code session) executes
//     them directly and reports the result via reportSelfExecuted().
//
// Agents this coordinator will NEVER try to drive programmatically: ChatGPT
// (browser) and Claude Desktop/browser. For those, per explicit policy, a
// subtask is written into the SAME shared coordination log
// (state/ai-agent-reports.jsonl, status:'assigned') so whichever of those
// agents runs next can pick it up - no browser-click automation is built.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const collectiveBrain = require('../lib/collective-brain');
const { runSubtask } = require('./openhuman-subtask.cjs');
const resourceScheduler = require('../lib/ai-resource-scheduler');
const { classifyIntent } = require('../lib/mcp-intent-router');

// Read-only capability classes get sandboxRoot pointed at the REAL repo (the
// local model's tool allowlist for these classes is read_file/read_text_file/
// list_directory/search_files ONLY - see lib/mcp-intent-router.js PROFILES,
// no edit_file/write_file), so a "read/inspect the actual project" subtask
// is genuinely useful instead of operating on an empty scratch directory.
// filesystem-write and 'unknown' deliberately keep the isolated sandbox
// default (lib/direct-ollama-mcp-transport.js#SANDBOX_ROOT) - a small, less-
// trusted local model is not given write access to the live repo by this
// coordinator.
const READ_ONLY_CAPABILITY_CLASSES = new Set(['filesystem-read', 'filesystem-search']);

// Resolve the real OpenCode CLI binary once at load time. On Windows, the npm
// global install exposes `opencode.cmd`, a tiny batch shim that execs the
// REAL binary at node_modules\opencode-ai\bin\opencode.exe - spawnSync cannot
// run a .cmd file directly without shell:true (confirmed live: EINVAL), and
// shell:true would require reimplementing cmd.exe's argument-quoting rules
// correctly for taskText (arbitrary text, may contain quotes/&/|/^) just to
// avoid it. Resolving straight through to the real .exe sidesteps both
// problems: spawnSync can exec a real PE binary directly with a plain argv
// array, no shell and no quoting surface at all.
function resolveOpencodeExe() {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = cp.spawnSync(finder, ['opencode'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  const lines = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const cmdShim = lines.find((l) => /\.cmd$/i.test(l));
  if (process.platform !== 'win32' || !cmdShim) return lines[0] || null;
  try {
    const shimText = fs.readFileSync(cmdShim, 'utf8');
    const match = shimText.match(/"([^"]*opencode\.exe)"/i);
    // %dp0% is a literal placeholder in the shim text - it is only ever
    // resolved to the shim's own directory (with trailing backslash) at
    // batch-file RUNTIME via %~dp0, never present as a real path in the
    // file's static text. Substitute it ourselves rather than treating the
    // literal string as a path (fs.existsSync on '%dp0%\\...' is always
    // false, which previously made this silently fall through to the .cmd
    // shim itself - the exact thing this resolver exists to avoid).
    if (match) {
      const resolved = match[1].replace(/%dp0%/gi, path.dirname(cmdShim) + path.sep);
      if (fs.existsSync(resolved)) return resolved;
    }
  } catch { /* fall through to the shim itself */ }
  return cmdShim;
}
const OPENCODE_CLI_PATH = resolveOpencodeExe();

const MAIN_TREE_ROOT = process.env.WORLD_SERVER_MAIN_TREE || 'C:\\Users\\user\\Desktop\\World_server';
const REPORT_LOG_PATH = process.env.AI_AGENT_REPORTS_PATH || path.join(MAIN_TREE_ROOT, 'state', 'ai-agent-reports.jsonl');
const WORKTREES_ROOT = process.env.WORLD_SERVER_WORKTREES_ROOT || path.join(os.homedir(), 'AppData', 'Local', 'World_server_worktrees');
const RECOVERY_ROOT = process.env.WORLD_SERVER_RECOVERY_ROOT || path.join(os.homedir(), 'AppData', 'Local', 'World_server_recovery');
const MAX_SUBTASK_ATTEMPTS = Number(process.env.MASTER_COORDINATOR_MAX_ATTEMPTS || 2);

// Agents this coordinator can automatically dispatch to, and how.
const LOCAL_MODEL_AGENTS = new Set(['openhuman', 'anythingllm']);
const SELF_EXECUTE_AGENTS = new Set(['claude-code', 'desktop-ai']);
const OFFLINE_ONLY_AGENTS = new Set(['chatgpt', 'claude-desktop']);

function nowIso() { return new Date().toISOString(); }

function appendReport(entry, reportLogPath = REPORT_LOG_PATH) {
  try {
    fs.mkdirSync(path.dirname(reportLogPath), { recursive: true });
    fs.appendFileSync(reportLogPath, JSON.stringify(entry) + '\n');
    return true;
  } catch {
    // A logging failure must never mask the real subtask result.
    return false;
  }
}

function git(cwd, args) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

// ---------------------------------------------------------------------------
// OpenCode adapter - isolated worktree OFF Desktop, run, commit-if-useful,
// always remove the worktree checkout afterward (branch kept only if it
// carries a real commit; deleted otherwise).
// ---------------------------------------------------------------------------
function createIsolatedWorktree(taskId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(String(taskId))) throw new Error('Invalid task id');
  fs.mkdirSync(WORKTREES_ROOT, { recursive: true });
  const branch = `ai/master-coordinator/${taskId}`;
  const dir = path.join(WORKTREES_ROOT, taskId);
  const base = git(MAIN_TREE_ROOT, ['rev-parse', 'HEAD']);
  if (base.status !== 0) throw new Error(`Cannot inspect base: ${base.stderr}`);
  const head = base.stdout;
  const add = git(MAIN_TREE_ROOT, ['worktree', 'add', '-b', branch, dir, head]);
  if (add.status !== 0) throw new Error(`git worktree add failed: ${add.stderr || add.stdout}`);
  return { dir, branch, baseHead: head };
}

function removeIsolatedWorktree(dir, branch, { deleteBranch = false } = {}) {
  const relative = path.relative(path.resolve(WORKTREES_ROOT), path.resolve(dir));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return { ok: false, reason: 'outside-owned-worktrees' };
  if (!fs.existsSync(dir)) return { ok: true, alreadyRemoved: true };
  const current = git(dir, ['branch', '--show-current']);
  const status = git(dir, ['status', '--porcelain', '--untracked-files=all', '--ignored=matching']);
  if (current.status !== 0 || current.stdout !== branch || status.status !== 0 || status.stdout) return { ok: false, reason: 'unverified-or-dirty-worktree' };
  // Git's normal removal performs its own final cleanliness/lock check.
  // Never force-remove: another writer may have appeared since inspection.
  const removed = git(MAIN_TREE_ROOT, ['worktree', 'remove', dir]);
  if (removed.status !== 0) return { ok: false, reason: removed.stderr || 'remove-failed' };
  if (deleteBranch) git(MAIN_TREE_ROOT, ['branch', '-d', branch]);
  return { ok: true };
}


function preserveFailedDirtyWorktree(dir, branch, taskId) {
  const inspected = git(dir, ['status', '--porcelain', '--untracked-files=all', '--ignored=matching']);
  if (inspected.status !== 0) throw new Error(`Cannot inspect recovery state: ${inspected.stderr}`);
  const status = inspected.stdout;
  if (!status) return { preserved: false, keepWorktree: false };
  fs.mkdirSync(RECOVERY_ROOT, { recursive: true });
  const safeId = String(taskId || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
  const recoveryDir = path.join(RECOVERY_ROOT, safeId);
  fs.mkdirSync(recoveryDir, { recursive: true });
  const diff = git(dir, ['diff', '--binary', 'HEAD']);
  const files = git(dir, ['ls-files', '--others', '--exclude-standard']);
  if (diff.status !== 0 || files.status !== 0) throw new Error('Cannot read recovery content');
  const trackedPatch = diff.stdout;
  const untracked = files.stdout.split(/\r?\n/).filter(Boolean);
  if (trackedPatch) fs.writeFileSync(path.join(recoveryDir, 'WORK_IN_PROGRESS.patch'), trackedPatch + '\n');
  fs.writeFileSync(path.join(recoveryDir, 'STATUS.txt'), status + '\n');
  fs.writeFileSync(path.join(recoveryDir, 'RECOVERY.json'), JSON.stringify({ taskId, branch, worktree: dir, untrackedCount: untracked.length, createdAt: nowIso() }, null, 2) + '\n');
  // Patch is supplemental evidence, never a replacement for the only checkout.
  return { preserved: true, recoveryDir, recoveryPatch: trackedPatch ? path.join(recoveryDir, 'WORK_IN_PROGRESS.patch') : null, untrackedCount: untracked.length, bundleContainsUntracked: false, originalWorktreeRequired: true, keepWorktree: true };
}

function finalOpencodeText(stdout) {
  const parts = [];
  let structured = false;
  for (const line of String(stdout || '').split(/\r?\n/)) {
    try { const entry = JSON.parse(line); structured = true; if (entry.type === 'text' && entry.part?.text?.trim()) parts.push(entry.part.text); } catch {}
  }
  return (structured ? parts.join('\n') : String(stdout || '')).slice(-8000);
}

function opencodePermissionRefused(stdout, stderr) {
  const denied = /auto-rejecting|rejected permission|permission denied/i;
  if (denied.test(String(stderr || ''))) return true;
  return String(stdout || '').split(/\r?\n/).some(line => {
    try {
      const entry = JSON.parse(line);
      return entry.type === 'tool_use' && entry.part?.state?.status === 'error' && denied.test(String(entry.part.state.error || ''));
    } catch { return false; }
  });
}

async function invokeOpencode(taskText, opts = {}) {
  if (!OPENCODE_CLI_PATH) return { ok: false, result: 'NOT_AVAILABLE', reason: 'opencode CLI not found on PATH' };
  const taskId = opts.taskId || `opencode-${Date.now()}`;
  let worktree;
  try { worktree = createIsolatedWorktree(taskId); }
  catch (error) {
    return recordOpencodeOutcome({ ok: false, result: 'RECOVERY_REQUIRED', reason: error.message, worktree: null, committed: null }, taskText, taskId);
  }
  const { dir, branch, baseHead } = worktree;
  const start = Date.now();
  let committed = null;
  let pushed = false;
  let recovery = null;
  // Failure must retain work by default, including persistence exceptions.
  let keepWorktree = true;
  let outcome;
  try {
    const r = cp.spawnSync(OPENCODE_CLI_PATH, ['run', taskText, '--format', 'json', '--dir', dir], {
      encoding: 'utf8', timeout: opts.timeoutMs || 600000, windowsHide: true, maxBuffer: 32 * 1024 * 1024,
    });
    const durationMs = Date.now() - start;
    const finalText = finalOpencodeText(r.stdout);
    const refused = opencodePermissionRefused(r.stdout, r.stderr);
    const ranCleanly = r.status === 0 && !r.error && !refused && Boolean(finalText.trim());
    const inspected = git(dir, ['status', '--porcelain', '--untracked-files=all', '--ignored=matching']);
    const head = git(dir, ['rev-parse', 'HEAD']);
    if (inspected.status !== 0 || head.status !== 0) throw new Error('Cannot verify worker Git state');
    if (head.stdout !== baseHead) committed = head.stdout;
    const dirtyStatus = inspected.stdout;
    let persisted = true;
    if (ranCleanly && dirtyStatus) {
      const added = git(dir, ['add', '-A']);
      const msg = [`opencode(auto-dispatch): ${String(taskText).slice(0, 72)}`, '', 'AI-Agent: OpenCode', `AI-Session: master-coordinator:${taskId}`, `Worktree: ${dir}`, `Branch: ${branch}`, 'Ownership: master-coordinator-subtask'].join('\n');
      const c = added.status === 0 ? git(dir, ['commit', '-qm', msg]) : added;
      if (c.status === 0) {
        const saved = git(dir, ['rev-parse', 'HEAD']);
        if (saved.status !== 0) throw new Error('Cannot verify saved commit');
        committed = saved.stdout;
      } else {
        persisted = false;
        recovery = preserveFailedDirtyWorktree(dir, branch, taskId);
        keepWorktree = recovery.keepWorktree;
      }
    } else if (!ranCleanly && dirtyStatus) {
      recovery = preserveFailedDirtyWorktree(dir, branch, taskId);
      keepWorktree = recovery.keepWorktree;
    }
    const finalState = git(dir, ['status', '--porcelain', '--untracked-files=all', '--ignored=matching']);
    if (finalState.status !== 0) throw new Error('Cannot verify final worktree status');
    keepWorktree = Boolean(finalState.stdout);
    if (ranCleanly && persisted && !keepWorktree && committed && opts.push !== false) pushed = git(dir, ['push', 'origin', `HEAD:refs/heads/${branch}`]).status === 0;
    const ok = ranCleanly && persisted && !keepWorktree && (!committed || opts.push === false || pushed);
    outcome = { ok, result: refused ? 'REFUSED' : ok ? 'PENDING_REVIEW' : 'FAIL', verified: false, stdout: finalText, stderr: (r.stderr || '').slice(-4000), durationMs, branch, committed, pushed, worktree: dir, recovery };
    // Exit zero is transport evidence, not proof that the requested task was
    // completed. A trusted caller may verify the artifacts before cleanup.
    if (ok && typeof opts.validateResult === 'function') {
      const validation = await opts.validateResult(outcome);
      const verified = validation?.ok === true && Array.isArray(validation.evidence) && validation.evidence.length > 0;
      outcome = { ...outcome, ok: verified, result: verified ? 'PASS' : 'FAIL', verified, validation };
    }
  } catch (error) {
    outcome = { ok: false, result: 'FAIL', reason: error.message, branch, committed, pushed, worktree: dir, recovery };
  }
  if (!keepWorktree) {
    const cleanup = removeIsolatedWorktree(dir, branch, { deleteBranch: !committed });
    if (!cleanup.ok) outcome = { ...outcome, ok: false, result: 'FAIL', cleanup };
  }
  return recordOpencodeOutcome(outcome, taskText, taskId);
}

function recordOpencodeOutcome(outcome, taskText, taskId) {
  const recorded = appendReport({ at: nowIso(), agent: 'opencode', task_id: taskId,
    status: outcome.result === 'PASS' ? 'done' : outcome.result === 'PENDING_REVIEW' ? 'review_required' : outcome.result === 'RECOVERY_REQUIRED' ? 'queued' : 'failed',
    progress: outcome.result === 'PASS' ? 100 : outcome.ok ? 80 : 0,
    branch: outcome.branch || null, worktree: outcome.worktree, commit: outcome.committed,
    tests: outcome.validation || {}, merge_safe: false,
    next_action: outcome.result === 'RECOVERY_REQUIRED' ? 'Inspect existing task worktree/branch; preserve and reconcile ownership before resuming.' : 'Caller must verify task-specific evidence before marking integration ready.',
    findings: { result: outcome.result, task: collectiveBrain.redactText(taskText), summary: collectiveBrain.redactText(outcome.stdout || '').slice(-4000), reason: outcome.reason || null }
  });
  if (!recorded) return { ...outcome, ok: false, result: 'RECOVERY_REQUIRED', reason: 'Shared coordinator report could not be persisted', reportedToSharedPipeline: false };
  return { ...outcome, reportedToSharedPipeline: true };
}

// ---------------------------------------------------------------------------
// OpenHuman / AnythingLLM adapter - thin pass-through to the existing, tested
// runSubtask() (resource-aware, concurrency-leased, bounded retry, already
// reports into state/ai-agent-reports.jsonl on its own).
// ---------------------------------------------------------------------------
async function invokeLocalModelAgent(agentId, taskText, opts = {}) {
  const scan = collectiveBrain.securityScanText(taskText);
  if (!scan.ok) {
    return { ok: false, result: 'REFUSED', reason: `task text failed secret scan: ${scan.findings.map((f) => f.id).join(',')}` };
  }
  const forceAnythingLLM = agentId === 'anythingllm';
  const capabilityClass = classifyIntent(taskText);
  const sandboxRoot = opts.sandboxRoot || (READ_ONLY_CAPABILITY_CLASSES.has(capabilityClass) ? MAIN_TREE_ROOT : undefined);
  const r = await runSubtask(taskText, {
    callerAgent: 'master-coordinator',
    taskId: opts.taskId,
    transport: forceAnythingLLM ? 'anythingllm' : undefined,
    workspaceSlug: opts.workspaceSlug,
    respectResourceGate: opts.respectResourceGate,
    respectConcurrencyLock: opts.respectConcurrencyLock,
    sandboxRoot,
  });
  return { ok: r.result === 'PASS', result: r.result, ...r };
}

// ---------------------------------------------------------------------------
// Offline-agent (ChatGPT browser, Claude Desktop/browser) - never driven
// programmatically. A subtask for one of these is written into the SAME
// shared coordination log other agents already read, status:'assigned', so
// that agent picks it up on its own next run.
// ---------------------------------------------------------------------------
function assignOffline(agentId, taskText, opts = {}) {
  const entry = {
    at: nowIso(),
    agent: agentId,
    task_id: opts.taskId || `assigned-${agentId}-${Date.now()}`,
    status: 'assigned',
    progress: 0,
    branch: null,
    worktree: null,
    commit: null,
    pr: null,
    tests: {},
    blockers: [],
    merge_safe: false,
    next_action: `${agentId} to pick this up on its own next run (no programmatic invocation exists for this agent)`,
    findings: { task: collectiveBrain.redactText(taskText) },
    reusable_improvements: [],
  };
  appendReport(entry);
  return { ok: true, result: 'ASSIGNED', assignedTo: agentId, taskId: entry.task_id };
}

// ---------------------------------------------------------------------------
// Self-executed (claude-code / desktop-ai): this coordinator IS Claude Code -
// no subprocess is spawned. The caller (the running session) performs the
// subtask directly with its own tools and reports the result here.
// ---------------------------------------------------------------------------
function reportSelfExecuted(taskText, result, opts = {}) {
  const entry = {
    at: nowIso(),
    agent: 'claude-code',
    task_id: opts.taskId || `claude-code-${Date.now()}`,
    status: result.status || (result.ok ? 'done' : 'failed'),
    progress: result.ok ? 100 : (result.progress ?? 50),
    branch: result.branch || null,
    worktree: result.worktree || null,
    commit: result.commit || null,
    pr: result.pr || null,
    tests: result.tests || {},
    blockers: result.blockers || (result.ok ? [] : [{ id: 'self-executed-fail', status: 'needs_review', reason: result.reason || 'unspecified' }]),
    merge_safe: result.mergeSafe ?? false,
    next_action: result.nextAction || 'awaiting review',
    findings: { task: collectiveBrain.redactText(taskText), ...(result.findings || {}) },
    reusable_improvements: result.reusableImprovements || [],
  };
  appendReport(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Ownership: one lease per subtask id, reusing collective-brain's existing
// file-lock primitive so two dispatches never race on the same subtask.
// ---------------------------------------------------------------------------
function withSubtaskLease(root, taskId, fn) {
  const scope = `master-coordinator-subtask-${taskId}`;
  // Cover both bounded 10-minute attempts plus cleanup; the old 15-minute
  // lease could expire during the second attempt and admit another owner.
  const lease = collectiveBrain.acquireLease(root, scope, { ttlMs: Math.max(15, MAX_SUBTASK_ATTEMPTS * 10 + 5) * 60 * 1000, owner: `master-coordinator:${process.pid}` });
  if (!lease.ok) return Promise.resolve({ ok: false, result: 'SKIPPED_ACTIVE', reason: 'another dispatch already owns this subtask', existing: lease.existing });
  return Promise.resolve().then(fn).finally(() => collectiveBrain.releaseLease(root, scope, lease.lease.owner));
}

// ---------------------------------------------------------------------------
// Resource pre-check before dispatch. Two different profiles reusing the
// SAME live resource sensing (lib/ai-resource-scheduler#getResourceState):
//   - local-model dispatch (OpenHuman/AnythingLLM/direct-Ollama) is CPU-bound
//     local inference - the existing decide() (tuned for exactly that) is
//     the correct, unmodified gate, and is already applied inside
//     runSubtask()/anythingllm-task-router.cjs, not duplicated here.
//   - OpenCode CLI dispatch on this machine calls a hosted model provider -
//     network-bound, not local-CPU-heavy. Reusing decide()'s Ollama-tuned
//     cpuLoadPercentMax:70 threshold for it would be the wrong semantic fit
//     (this machine's CPU is frequently pinned near 100% purely from OTHER
//     concurrent local-model AI agents sharing it - that contention says
//     nothing about whether a network-bound CLI call can proceed). Only RAM
//     (a real shared constraint - a new process still needs headroom) gates
//     this path.
// ---------------------------------------------------------------------------
async function resourceGateOk(profile = 'local-model') {
  if (profile === 'opencode') {
    const resources = resourceScheduler.getResourceState();
    if (resources.ramFreePercent < resourceScheduler.THRESHOLDS.ramFreePercentMin) {
      return { action: 'queue', reason: `ram_free=${resources.ramFreePercent}% below ${resourceScheduler.THRESHOLDS.ramFreePercentMin}% minimum`, resources };
    }
    return true;
  }
  const gate = await resourceScheduler.decide({ estimatedCost: 'low' });
  return gate.action === 'run_now' || gate.action === 'use_alternate_backend' ? true : gate;
}

// ---------------------------------------------------------------------------
// dispatchSubtask(): route (or honor an explicit agent hint) -> resource/
// lease gate -> invoke the right adapter -> bounded-retry on FAIL -> report.
// ---------------------------------------------------------------------------
async function dispatchSubtask(root, subtask, opts = {}) {
  const taskId = subtask.taskId || `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const taskText = subtask.text;

  let agentId = subtask.agent;
  let routePlan = null;
  if (!agentId) {
    routePlan = collectiveBrain.routeTask(root, taskText);
    agentId = routePlan.primary && routePlan.primary.id;
  }
  if (!agentId) return { taskId, agentId: null, ok: false, result: 'NO_AGENT', reason: 'routeTask found no candidate and no explicit agent was given' };

  if (OFFLINE_ONLY_AGENTS.has(agentId)) {
    const r = assignOffline(agentId, taskText, { taskId });
    return { taskId, agentId, routePlan, attempts: 0, ...r };
  }

  return withSubtaskLease(root, taskId, async () => {
    let lastResult = null;
    for (let attempt = 1; attempt <= MAX_SUBTASK_ATTEMPTS; attempt++) {
      if (agentId === 'opencode') {
        const gate = opts.respectResourceGate === false ? true : await resourceGateOk('opencode');
        if (gate !== true) {
          lastResult = { ok: false, result: 'QUEUED', resourceGate: gate };
          break; // resource gate says wait - do not burn a retry attempt on contention
        }
        lastResult = await invokeOpencode(taskText, { taskId: `${taskId}-a${attempt}`, push: opts.push, validateResult: opts.validateResult });
      } else if (LOCAL_MODEL_AGENTS.has(agentId)) {
        lastResult = await invokeLocalModelAgent(agentId, taskText, { taskId: `${taskId}-a${attempt}`, respectResourceGate: opts.respectResourceGate, respectConcurrencyLock: opts.respectConcurrencyLock });
        if (lastResult.result === 'QUEUED') break; // already durably queued by the underlying scheduler
      } else if (SELF_EXECUTE_AGENTS.has(agentId)) {
        // Nothing to invoke - the coordinator's caller performs this subtask
        // directly and calls reportSelfExecuted() itself; signal that back.
        return { taskId, agentId, routePlan, attempts: 0, ok: true, result: 'SELF_EXECUTE', taskText };
      } else {
        return { taskId, agentId, routePlan, attempts: attempt, ok: false, result: 'UNKNOWN_AGENT', reason: `no adapter for agent id '${agentId}'` };
      }
      if (lastResult.ok || lastResult.result === 'REFUSED' || lastResult.result === 'RECOVERY_REQUIRED') break;
    }
    return { taskId, agentId, routePlan, ...lastResult };
  });
}

// ---------------------------------------------------------------------------
// runMasterGoal(): one goal -> deterministic role split -> dispatch -> collect.
// ---------------------------------------------------------------------------
function buildDefaultSubtasks(goal, opts = {}) {
  const base = collectiveBrain.redactText(String(goal || '')).slice(0, 3000);
  const subtasks = [
    { taskId: `opencode-${Date.now()}`, agent: 'opencode', text: `Implementation/test slice for master goal: ${base}. Inspect relevant existing code, reuse architecture, fix only safe root causes, add focused regression tests, and report evidence. Do not perform production deployment.` },
    { taskId: `openhuman-${Date.now()}`, agent: 'openhuman', text: `Independent read-only verification slice for master goal: ${base}. Read relevant World_server files and report existing systems, blockers, regression risks, and evidence. Do not modify files.` },
  ];
  const includeAnythingLLM = opts.includeAnythingLLM === true || process.env.MASTER_COORDINATOR_INCLUDE_ANYTHINGLLM === '1';
  if (includeAnythingLLM) subtasks.push({ taskId: `anythingllm-${Date.now()}`, agent: 'anythingllm', text: `Knowledge/documentation audit for master goal: ${base}. Compare current repo docs/contracts and report stale or conflicting instructions. Do not modify files.` });
  return subtasks;
}

function summarizeMasterResults(results) {
  const terminalFail = new Set(['FAIL', 'REFUSED', 'UNKNOWN_AGENT', 'NO_AGENT', 'NOT_AVAILABLE']);
  const pending = new Set(['QUEUED', 'SKIPPED_ACTIVE', 'ASSIGNED', 'SELF_EXECUTE', 'PENDING_REVIEW', 'RECOVERY_REQUIRED']);
  if (results.some((r) => terminalFail.has(r.result))) return 'FAIL';
  if (results.some((r) => pending.has(r.result))) return 'PENDING';
  return results.length > 0 && results.every((r) => r.result === 'PASS') ? 'PASS' : 'FAIL';
}

async function runMasterGoal(goal, subtasks, opts = {}) {
  const root = opts.root || MAIN_TREE_ROOT;
  const recall = await collectiveBrain.recall(root, goal, { skipNetwork: opts.skipNetwork });
  const route = collectiveBrain.routeTask(root, goal);
  const plan = subtasks && subtasks.length ? subtasks : buildDefaultSubtasks(goal, opts);
  const dispatchFn = opts.dispatchFn || dispatchSubtask;
  const results = [];
  for (const subtask of plan) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await dispatchFn(root, subtask, opts));
  }
  const overallStatus = summarizeMasterResults(results);
  collectiveBrain.appendEvent(root, 'MASTER_GOAL_DISPATCHED', { goalHash: collectiveBrain.sha256(goal), subtaskCount: plan.length, agents: results.map((r) => r.agentId), results: results.map((r) => r.result), overallStatus });
  return { goal, recall, route, plan, results, overallStatus, generatedAt: nowIso() };
}

module.exports = {
  runMasterGoal,
  dispatchSubtask,
  invokeOpencode,
  invokeLocalModelAgent,
  assignOffline,
  reportSelfExecuted,
  createIsolatedWorktree,
  removeIsolatedWorktree,
  withSubtaskLease,
  resourceGateOk,
  appendReport,
  preserveFailedDirtyWorktree,
  finalOpencodeText,
  buildDefaultSubtasks,
  summarizeMasterResults,
  resolveOpencodeExe,
  OPENCODE_CLI_PATH,
  REPORT_LOG_PATH,
  WORKTREES_ROOT,
  RECOVERY_ROOT,
  OFFLINE_ONLY_AGENTS,
  LOCAL_MODEL_AGENTS,
  SELF_EXECUTE_AGENTS,
};

if (require.main === module) {
  const goal = process.argv[2];
  if (!goal) {
    console.error('usage: node master-coordinator.cjs "<master goal>"');
    process.exit(1);
  }
  runMasterGoal(goal).then((r) => { console.log(JSON.stringify(r, null, 2)); if (r.overallStatus !== 'PASS') process.exitCode = 1; }).catch((e) => { console.error(e); process.exitCode = 1; });
}
