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
//   - OpenHuman: re-audited properly this round (not just the config file
//     check from before) - `C:\Program Files\OpenHuman\OpenHuman.exe` IS a
//     real, installed binary (confirmed via the Windows uninstall
//     registry). It is NOT a CLI/subtask tool though: launching it starts
//     a full Tauri desktop GUI app (CEF webview, tray icon, notifications,
//     WhatsApp/browser integrations) that spawns an EMBEDDED core JSON-RPC
//     server on 127.0.0.1:7788 for its OWN frontend only - its own startup
//     log explicitly says the RPC auth token is passed via "in-memory
//     handoff (no env crossing)", a deliberate design choice by the vendor
//     to keep that RPC unreachable from outside the app's own process.
//     There is no documented external API, no `--help`/subcommand mode (it
//     just launches the GUI), and reverse-engineering around a
//     deliberately no-env-crossing auth token is exactly the kind of
//     unsupported, unstable integration surface this project's safety
//     principles rule out. Confirmed by launching it once, observing this,
//     and closing it - not built on.
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
// scopedFiles (absolute paths, generated by this module/caller - never
// remote text) are attached via repeated -f flags so the agent gets the
// content it needs up front instead of discovering it via its own
// exploration tool calls - this is the real fix for the confirmed
// full-repo-timeout bottleneck. An empty/omitted scopedFiles falls back to
// the old unscoped behavior (the agent explores --dir itself).
function buildOpencodeRunArgs(model, targetWorktree, goalFile, scopedFiles = []) {
  const instruction = scopedFiles.length
    ? 'Follow the instructions in the attached goal file exactly. The other attached files are the ONLY files you should need - do not explore or read any file outside of them unless the goal file explicitly tells you to.'
    : 'Follow the instructions in the attached file exactly.';
  const args = ['run', '--model', model, '--dir', targetWorktree, '--format', 'json', instruction, '-f', goalFile];
  for (const f of scopedFiles) args.push('-f', f);
  return args;
}

// One attempt against one free OpenCode model, in one isolated worktree,
// optionally scoped to a specific file set (see buildOpencodeRunArgs).
// classification: 'ok' | 'no_changes' | 'timeout' | 'agent_error' | 'verification_failed'
async function invokeOpencodeOnce(model, goal, targetWorktree, { timeoutMs = 240000, verifyScript = 'check', scopedFiles = [] } = {}) {
  const goalFile = path.join(os.tmpdir(), `agent-invoke-goal-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(goalFile, String(goal));
  const absScopedFiles = scopedFiles.map((f) => path.join(targetWorktree, f));
  let r;
  try {
    r = await runOpencode(buildOpencodeRunArgs(model, targetWorktree, goalFile, absScopedFiles), { timeout: timeoutMs });
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

  if (timedOut) {
    // Real root cause found live this session, more important than the
    // network-contention one below: OpenCode's process can finish its
    // actual edit (visible in its own JSON event stream as a completed
    // step_finish/tool_use) and then simply hang instead of exiting -
    // confirmed by watching the raw event stream: the file was correctly
    // edited on disk within ~2s, but the process kept running until an
    // external timeout killed it 40s later. The OLD code discarded this
    // as a plain 'timeout' and then rolled back the (already correct!)
    // edit via `git checkout -- .`, silently destroying real, successful
    // work. Now: check the actual worktree state before concluding
    // anything - if a real diff exists, the agent actually finished; the
    // process hang is a separate, cosmetic problem from the edit itself.
    const { stat: hungStat, diff: hungDiff } = gitDiffStat(targetWorktree);
    if (hungStat) {
      let verify = null;
      if (verifyScript) {
        const v = await runWithTreeKill('npm', ['run', verifyScript], { cwd: targetWorktree, timeout: 480000 });
        verify = { ok: v.status === 0, exitCode: v.status, stdout: String(v.stdout || '').slice(-6000), stderr: String(v.stderr || '').slice(-3000) };
        if (!verify.ok) return { ok: false, classification: 'verification_failed', retriable: true, model, message: lastText, diffStat: hungStat, diff: hungDiff, verify, tokens, costUsd, processHangAfterCompletion: true };
      }
      return { ok: true, classification: 'ok', model, message: lastText || 'agent completed the edit but its process hung afterward (recovered)', diffStat: hungStat, diff: hungDiff, verify, tokens, costUsd, tier: 'free-hosted', processHangAfterCompletion: true };
    }
    // No diff exists - this really is either a genuine model/network
    // timeout or a hang before any work happened. Root cause found live
    // this session: a timeout here was once wrongly read as "the model is
    // too slow/weak" when the real cause was a 1.19GB concurrent download
    // starving this call's network bandwidth - a direct re-run with no
    // competing load succeeded in 10-13s. Sample system memory pressure at
    // the moment of timeout as an honest diagnostic signal (not a full
    // root-cause proof - see lib/resource-scheduler.js's own comment on
    // what it does and does not measure) so a future timeout isn't blindly
    // blamed on the model either.
    const resourceScheduler = require('./resource-scheduler');
    const pressure = resourceScheduler.systemPressure();
    const classification = pressure.level === 'high' ? 'resource_contention' : 'process_hang';
    return { ok: false, classification, retriable: true, model, error: `opencode run exceeded ${timeoutMs}ms with no resulting file changes`, systemPressureAtTimeout: pressure };
  }
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

// Fraction of the caller's overall timeoutMs budget given to each context
// level - a well-scoped level-1 attempt (2-5 files) should be fast; if it
// isn't, that itself is a signal to expand rather than keep waiting on the
// same narrow context. Level 3 (full repo) gets the whole budget, matching
// the old unscoped behavior exactly as a last resort.
const LEVEL_TIMEOUT_FRACTION = { 1: 0.35, 2: 0.55, 3: 1 };

// Full pipeline: goal -> isolated worktree -> for each model, try
// progressively larger context (scoped-small -> scoped-medium -> full
// repo) before moving to the next model -> verified result, or
// needsEscalation if every free attempt at every context level failed.
// This is the real fix for the confirmed full-repo-timeout bottleneck: a
// small, precisely-scoped edit no longer requires the agent to explore the
// entire repository before touching anything.
async function implementGoal({ mainRoot, goal, targetWorktree, models = FREE_OPENCODE_MODELS, timeoutMs = 240000, verifyScript = 'check', maxContextLevel = 3 } = {}) {
  const guard = assertIsolatedWorktree(mainRoot, targetWorktree);
  if (!guard.ok) return { ok: false, retriable: false, error: guard.error };
  // Input validation happens before any environment/availability check, so
  // a bad model list is always reported as exactly that - never masked by
  // "opencode not available" on a host that happens to lack the CLI (e.g.
  // CI). A caller may narrow `models` (e.g. to retry with one specific
  // model), but never to something outside the vetted free allowlist -
  // this is what stops a remote task from smuggling in a paid/arbitrary
  // provider.
  const rejected = models.filter((m) => !FREE_OPENCODE_MODELS.includes(m));
  if (rejected.length) return { ok: false, retriable: false, error: `model(s) not in the free allowlist: ${rejected.join(', ')}` };
  if (!(await opencodeAvailable())) return { ok: false, retriable: false, error: 'opencode CLI not available on this host' };

  const scopedTaskCompiler = require('./scoped-task-compiler');
  const agentHistory = require('./agent-history');
  const resourceScheduler = require('./resource-scheduler');
  // History-based ordering: try the model that has actually solved
  // similar (taskType, context-size-bucket) tasks fastest/most reliably
  // before, falling back to the given/default order for models with no
  // history yet - real, inspectable (data/collective-brain/runtime/
  // agent-history.jsonl), not a black box.
  const level1Ctx = scopedTaskCompiler.compileContext(mainRoot, goal, 1);
  const ranking = agentHistory.rankModelsForTask(mainRoot, { goal, contextFileCount: level1Ctx.files.length }, models);
  const orderedModels = ranking.order;
  const taskId = `agent-implement-${path.basename(targetWorktree)}`;

  // Root-cause fix for the resource-contention-misread-as-model-timeout
  // incident: exclusively hold the LLM_REMOTE resource class for the
  // whole attempt loop, so this call can never run concurrently with a
  // NETWORK_HEAVY download/another LLM_REMOTE call started elsewhere in
  // this process tree via the same scheduler - the actual condition that
  // produced the false timeouts.
  return resourceScheduler.withResourceSlot(mainRoot, 'agent_implement', taskId, async () => {
    const attempts = [];
    for (const model of orderedModels) {
      for (let level = 1; level <= maxContextLevel; level++) {
        const ctx = level === 1 ? level1Ctx : scopedTaskCompiler.compileContext(mainRoot, goal, level);
        const levelTimeout = Math.max(20000, Math.round(timeoutMs * (LEVEL_TIMEOUT_FRACTION[level] || 1)));
        const attemptStart = Date.now();
        const attempt = await invokeOpencodeOnce(model, goal, targetWorktree, {
          timeoutMs: levelTimeout, verifyScript, scopedFiles: ctx.full ? [] : ctx.files,
        });
        const durationMs = Date.now() - attemptStart;
        agentHistory.recordAttempt(mainRoot, {
          taskType: ranking.taskType, contextBucket: agentHistory.contextSizeBucket(ctx.full ? 'full-repo' : ctx.files.length),
          model, level, durationMs, success: attempt.ok, classification: attempt.classification,
          tokens: attempt.tokens || null, costUsd: attempt.costUsd || 0,
        });
        attempts.push({ model, level, contextFiles: ctx.full ? 'full-repo' : ctx.files.length, classification: attempt.classification, ok: attempt.ok, durationMs });
        if (attempt.ok) return { ...attempt, attempts, needsEscalation: false, contextLevel: level, scopedFiles: ctx.full ? null : ctx.files, modelRanking: ranking.taskType };
        // roll back any partial edit before the next attempt, so every
        // attempt starts from a clean worktree instead of compounding.
        spawnSync('git', ['checkout', '--', '.'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
        spawnSync('git', ['clean', '-fd'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
        // a non-retriable-flavored failure at this level (e.g. the compiled
        // context was empty and level 1/2 genuinely can't help) still moves
        // on to the next level rather than aborting - only exhausting every
        // level of every model reports needsEscalation.
        if (ctx.full) break; // level 3 is the last level for this model
      }
    }
    const last = attempts[attempts.length - 1];
    return { ok: false, retriable: false, needsEscalation: true, attempts, error: `all ${models.length} free-tier model(s) failed across all context levels (last: ${last && last.classification})` };
  }, { maxWaitMs: 120000 });
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
