'use strict';
// AGENT_ADAPTERS - real, safe, non-interactive invocation of the free/local
// AI execution tools actually present on this machine, audited before
// writing this (not assumed):
//   - Ollama (http://127.0.0.1:11434), running locally with real models
//     (qwen3:4b, qwen2.5:3b-instruct, etc, several with tool-calling
//     support) - used for read-only analysis/classification/Q&A, NOT
//     autonomous multi-file code editing (no safe tool-execution harness
//     for a bare small local model was built here - see note below).
//   - OpenCode CLI (`opencode`), installed with ZERO paid credentials
//     configured (`opencode providers list` -> 0 credentials) - it can
//     only reach its own free hosted models (opencode/*-free). Verified
//     live: `opencode run --model opencode/mimo-v2.5-free --dir <path>
//     "<prompt>"` genuinely reads and writes files scoped to --dir, in a
//     single non-interactive call, with real token/cost accounting via
//     `--format json` (cost:0 for these models). This is the real
//     "free/local stronger agent that can actually implement code" tier
//     the safe design was missing.
//   - AnythingLLM: confirmed NOT installed anywhere on this machine (no
//     binary, no AppData config) - no adapter is built for it. Its entry
//     in agent-capabilities.json stays for routing/documentation purposes
//     but is never invoked - reporting it as usable would be fabricating
//     a capability.
//   - OpenHuman: a config file exists pointing at agentmemory
//     (127.0.0.1:3111), but that service is not currently running on this
//     machine, and OpenHuman itself is a durable-workflow/memory
//     orchestrator, not a direct "run one coding subtask" CLI - no safe
//     single-shot invocation surface was found for it, so no adapter is
//     built for it either. Same honesty rule as AnythingLLM.
//
// Escalation to Claude/Codex is NOT auto-dispatch: this module cannot
// safely and correctly re-invoke a full paid AI coding session by itself
// (no API key management, cost tracking, or recursion safety was built
// for that, and doing so carelessly is exactly the kind of unbounded paid
// spend this whole safe design exists to prevent). When every free tier
// is exhausted, the task is marked needsEscalation:true with full
// diagnostic context attached - a human or a Claude Code session picks it
// up deliberately, the same way any other 'dead_letter' task would be
// reviewed.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, spawn } = require('child_process');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
// qwen3:4b (the more capable-looking default at a glance) and
// qwen3-fast:1.7b both advertise "thinking" (chain-of-thought) capability -
// verified live that this makes them reliably exceed a 30s timeout on this
// CPU-only host (qwen3-fast:1.7b: no response in 30s despite the name).
// qwen2.5:3b-instruct has no "thinking" mode and reliably answers in ~13s -
// used as the default specifically because it is fast and bounded, not
// because it is the largest/smartest model available.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct';
const FREE_OPENCODE_MODELS = (process.env.OPENCODE_FREE_MODELS || 'opencode/mimo-v2.5-free,opencode/nemotron-3.5-lightning-free,opencode/ling-3.0-flash-fin-free').split(',').map((s) => s.trim()).filter(Boolean);

async function ollamaAvailable(timeoutMs = 3000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}

async function queryOllama(prompt, { model = OLLAMA_MODEL, timeoutMs = 45000 } = {}) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, retriable: true, error: `ollama http ${res.status}` };
    const data = await res.json();
    return { ok: true, model, text: data.response || '', tier: 'free-local', costUsd: 0 };
  } catch (e) {
    return { ok: false, retriable: true, error: `ollama unreachable: ${e.message}` };
  }
}

// Invoking `opencode` needs shell:true on Windows (it resolves to an
// `opencode.cmd` shim; spawning it without a shell fails with ENOENT, and
// a direct spawnSync of the underlying opencode.exe one directory below
// the shim was tried and found to hang unpredictably outside its normal
// shim-launched environment - not used). With shell:true, Node warns
// (DEP0190) that array args are concatenated into a shell command line
// rather than passed as genuinely separate process arguments - so this
// module NEVER puts free-form/remote-influenced text (the task's `goal`)
// into argv at all. Every argv element passed to runOpencode() below is
// either a fixed literal, a vetted model name from FREE_OPENCODE_MODELS,
// or a path this module generated itself. The actual goal text is written
// to a temp file and handed to opencode via `-f <file>` (attach-file),
// with a fixed instruction literal as the positional message - verified
// live this reads and acts on the file's content correctly. This removes
// the injection surface entirely rather than trying to out-escape
// cmd.exe's notoriously inconsistent quoting rules.
// Real bug found and fixed while building this: spawnSync's own `timeout`
// option does NOT reliably terminate this process on Windows. With
// shell:true, the actual tree is cmd.exe -> opencode.cmd -> opencode.exe;
// spawnSync's timeout only signals the immediate cmd.exe child, which can
// leave opencode.exe running indefinitely as an orphan while the caller
// hangs waiting for its stdio to close - reproduced live during
// development (opencode.exe kept running minutes past a 90s timeout).
// Fixed by using async `spawn` plus a manual timer that, on expiry, kills
// the ENTIRE process tree via `taskkill /T /F` (Windows) or a negative-PID
// process-group kill (POSIX), then still waits for the actual exit event
// before resolving - never returns while a child could still be running.
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
  }
}

function runWithTreeKill(cmd, args, { timeout = 240000, ...opts } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, shell: true, ...opts });
    let stdout = '', stderr = '', settled = false, timedOut = false;
    child.stdout && child.stdout.on('data', (d) => { stdout += d; });
    child.stderr && child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeout);
    child.on('error', (err) => {
      if (settled) return; settled = true; clearTimeout(timer);
      resolve({ status: null, stdout, stderr, error: err });
    });
    child.on('close', (code) => {
      if (settled) return; settled = true; clearTimeout(timer);
      resolve({ status: code, stdout, stderr, error: timedOut ? { code: 'ETIMEDOUT' } : null });
    });
  });
}

function runOpencode(args, opts = {}) {
  return runWithTreeKill('opencode', args, opts);
}

async function opencodeAvailable() {
  const r = await runOpencode(['--version'], { timeout: 10000 });
  return r.status === 0;
}

function assertIsolatedWorktree(mainRoot, targetWorktree) {
  // Defense-in-depth: targetWorktree flows into a shell:true spawnSync call
  // (see runOpencode's comment) - reject anything with shell-metacharacter
  // potential outright, even though a real worktree path is very unlikely
  // to contain one.
  if (targetWorktree && /["'`$&|<>^%\n\r]/.test(targetWorktree)) {
    return { ok: false, error: 'targetWorktree contains characters not allowed in a path used with this bridge' };
  }
  if (!targetWorktree || !fs.existsSync(targetWorktree) || !fs.existsSync(path.join(targetWorktree, '.git'))) {
    return { ok: false, error: 'targetWorktree must be an existing, isolated git worktree' };
  }
  const mainReal = fs.realpathSync(mainRoot);
  const targetReal = fs.realpathSync(targetWorktree);
  if (targetReal === mainReal) return { ok: false, error: 'refusing to run an agent directly against the main tree - target must be an isolated worktree' };
  return { ok: true };
}

function gitDiffStat(targetWorktree) {
  const diff = spawnSync('git', ['diff', '--stat'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
  const full = spawnSync('git', ['diff'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
  return { stat: String(diff.stdout || '').trim(), diff: String(full.stdout || '').slice(-40000) };
}

// Pure argv builder, kept separate so a regression test can assert the raw
// `goal` string never appears in it, without actually invoking opencode.
function buildOpencodeRunArgs(model, targetWorktree, goalFile) {
  return ['run', '--model', model, '--dir', targetWorktree, '--format', 'json', 'Follow the instructions in the attached file exactly.', '-f', goalFile];
}

// One attempt against one free OpenCode model, in one isolated worktree.
// classification: 'ok' | 'no_changes' | 'timeout' | 'agent_error' | 'verification_failed'
async function invokeOpencodeOnce(model, goal, targetWorktree, { timeoutMs = 240000, verifyScript = 'check' } = {}) {
  const goalFile = path.join(os.tmpdir(), `agent-invoke-goal-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(goalFile, String(goal));
  let r;
  try {
    r = await runOpencode(buildOpencodeRunArgs(model, targetWorktree, goalFile), { timeout: timeoutMs });
  } finally {
    try { fs.unlinkSync(goalFile); } catch { /* best effort cleanup */ }
  }
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  let tokens = { total: 0, input: 0, output: 0 }, costUsd = 0, lastText = '';
  for (const line of String(r.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      if (evt.type === 'step_finish' && evt.part && evt.part.tokens) {
        tokens.total += Number(evt.part.tokens.total || 0);
        tokens.input += Number(evt.part.tokens.input || 0);
        tokens.output += Number(evt.part.tokens.output || 0);
        costUsd += Number(evt.part.cost || 0);
      }
      if (evt.type === 'text' && evt.part && evt.part.text) lastText = evt.part.text;
    } catch { /* non-JSON line, ignore */ }
  }

  if (timedOut) return { ok: false, classification: 'timeout', retriable: true, model, error: `opencode run exceeded ${timeoutMs}ms` };
  if (r.status !== 0) return { ok: false, classification: 'agent_error', retriable: true, model, error: String(r.stderr || 'opencode exited non-zero').slice(-2000), stdoutTail: String(r.stdout || '').slice(-2000) };

  const { stat, diff } = gitDiffStat(targetWorktree);
  if (!stat) return { ok: false, classification: 'no_changes', retriable: true, model, message: lastText || 'agent completed without changing any file', tokens, costUsd };

  let verify = null;
  if (verifyScript) {
    const v = await runWithTreeKill('npm', ['run', verifyScript], { cwd: targetWorktree, timeout: 480000 });
    verify = { ok: v.status === 0, exitCode: v.status, stdout: String(v.stdout || '').slice(-6000), stderr: String(v.stderr || '').slice(-3000) };
    if (!verify.ok) return { ok: false, classification: 'verification_failed', retriable: true, model, message: lastText, diffStat: stat, diff, verify, tokens, costUsd };
  }

  return { ok: true, classification: 'ok', model, message: lastText, diffStat: stat, diff, verify, tokens, costUsd, tier: 'free-hosted' };
}

// Full pipeline: goal -> isolated worktree -> try each free model in order
// (fallback/escalation within the free tier) -> verified result, or
// needsEscalation if every free attempt failed.
async function implementGoal({ mainRoot, goal, targetWorktree, models = FREE_OPENCODE_MODELS, timeoutMs = 240000, verifyScript = 'check' } = {}) {
  const guard = assertIsolatedWorktree(mainRoot, targetWorktree);
  if (!guard.ok) return { ok: false, retriable: false, error: guard.error };
  if (!(await opencodeAvailable())) return { ok: false, retriable: false, error: 'opencode CLI not available on this host' };
  // A caller may narrow `models` (e.g. to retry with one specific model),
  // but never to something outside the vetted free allowlist - this is
  // what stops a remote task from smuggling in a paid/arbitrary provider.
  const rejected = models.filter((m) => !FREE_OPENCODE_MODELS.includes(m));
  if (rejected.length) return { ok: false, retriable: false, error: `model(s) not in the free allowlist: ${rejected.join(', ')}` };

  const attempts = [];
  for (const model of models) {
    const attempt = await invokeOpencodeOnce(model, goal, targetWorktree, { timeoutMs, verifyScript });
    attempts.push({ model, classification: attempt.classification, ok: attempt.ok });
    if (attempt.ok) return { ...attempt, attempts, needsEscalation: false };
    // roll back any partial edit before trying the next model, so each
    // attempt starts from a clean worktree instead of compounding.
    spawnSync('git', ['checkout', '--', '.'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
    spawnSync('git', ['clean', '-fd'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
  }
  const last = attempts[attempts.length - 1];
  return { ok: false, retriable: false, needsEscalation: true, attempts, error: `all ${models.length} free-tier model(s) failed (last: ${last && last.classification})` };
}

const WORKTREE_SCRATCH_DIR = path.join(os.tmpdir(), 'world-server-agent-worktrees');
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]{1,60}$/;

// Creates a fresh, isolated git worktree off origin/master, in the OS temp
// directory (self-cleaning by the OS, clearly ephemeral, never inside the
// visible repo tree) - the same isolation guarantee apply_patch/
// implementGoal already require, now available as its own typed step so a
// caller can create one, hand it to agent_implement, inspect the diff, and
// only then decide to prepare a PR or discard it.
function createIsolatedWorktree(mainRoot, name) {
  const safeName = String(name || 'task').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'task';
  const stamp = Date.now();
  const branch = `ai/agent-invoke/${safeName}-${stamp}`;
  const dir = path.join(WORKTREE_SCRATCH_DIR, `${safeName}-${stamp}`);
  fs.mkdirSync(WORKTREE_SCRATCH_DIR, { recursive: true });
  const fetch1 = spawnSync('git', ['fetch', 'origin', 'master'], { cwd: mainRoot, encoding: 'utf8', timeout: 60000 });
  if (fetch1.status !== 0) return { ok: false, retriable: true, error: `git fetch failed: ${String(fetch1.stderr || '').slice(-1000)}` };
  const add = spawnSync('git', ['worktree', 'add', dir, '-b', branch, 'origin/master'], { cwd: mainRoot, encoding: 'utf8', timeout: 60000 });
  if (add.status !== 0) return { ok: false, retriable: true, error: `git worktree add failed: ${String(add.stderr || '').slice(-1500)}` };
  return { ok: true, worktreePath: dir, branch };
}

function isWorktreeHealthy(targetWorktree) {
  if (!fs.existsSync(targetWorktree) || !fs.existsSync(path.join(targetWorktree, '.git'))) return false;
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
  return r.status === 0;
}

// Self-healing: a worktree can end up corrupted (interrupted checkout,
// .git file pointing at a gitdir the main repo no longer has registered,
// disk issue) - detect via `git status` failing, then repair by removing
// the registration/directory and recreating fresh, rather than leaving a
// permanently broken worktree blocking every future task routed to it.
function repairWorktreeIfCorrupted(mainRoot, targetWorktree) {
  if (isWorktreeHealthy(targetWorktree)) return { repaired: false };
  spawnSync('git', ['worktree', 'remove', '--force', targetWorktree], { cwd: mainRoot, encoding: 'utf8', timeout: 30000 });
  try { fs.rmSync(targetWorktree, { recursive: true, force: true }); } catch { /* best effort */ }
  spawnSync('git', ['worktree', 'prune'], { cwd: mainRoot, encoding: 'utf8', timeout: 30000 });
  return { repaired: true };
}

function removeIsolatedWorktree(mainRoot, targetWorktree) {
  const guard = assertIsolatedWorktree(mainRoot, targetWorktree);
  if (!guard.ok) return { ok: false, retriable: false, error: guard.error };
  const rm = spawnSync('git', ['worktree', 'remove', '--force', targetWorktree], { cwd: mainRoot, encoding: 'utf8', timeout: 30000 });
  return { ok: rm.status === 0, retriable: rm.status !== 0, stderr: String(rm.stderr || '').slice(-1000) };
}

module.exports = {
  ollamaAvailable, queryOllama, opencodeAvailable, implementGoal, invokeOpencodeOnce, assertIsolatedWorktree,
  createIsolatedWorktree, isWorktreeHealthy, repairWorktreeIfCorrupted, removeIsolatedWorktree, buildOpencodeRunArgs,
  runWithTreeKill, killTree,
  FREE_OPENCODE_MODELS, OLLAMA_MODEL, SAFE_NAME_RE,
};
