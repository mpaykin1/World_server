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
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

// Short, stable identifier for a goal string - lets history entries for the
// exact same repeated task be grouped/found directly, in addition to the
// coarser taskType/contextBucket grouping already used for model ranking.
function taskFingerprint(goal) {
  return crypto.createHash('sha256').update(String(goal || '')).digest('hex').slice(0, 16);
}

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

// think:false — see the identical, longer comment on
// lib/ollama-patch-adapter.js's callOllama for the real evidence (a
// trivial prompt through this exact function, before this fix, measured
// 245-511 generated tokens of Qwen3's default chain-of-thought before the
// real one-word answer). Without this, the health probe's own tier2 call
// was itself subject to the same unbounded-thinking variance it exists to
// detect in the *task* calls - a probe that is slow for the same reason it
// is trying to measure is not a real, trustworthy signal.
async function queryOllama(prompt, { model = OLLAMA_MODEL, timeoutMs = 45000 } = {}) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, think: false }),
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
    // ROOT CAUSE, found and confirmed live this session via a direct A/B
    // test (same command, same model, same trivial prompt: hung with zero
    // output every time under Node's default spawn stdio, completed in
    // ~10-15s every time once stdin was explicitly closed): Node's default
    // 'pipe' stdio leaves the child's stdin open with nothing ever written
    // to it and no EOF. OpenCode's CLI (built on a TUI framework) reads
    // this as "wait for interactive/piped input" and blocks forever - this
    // was never rate-limiting, network, or model degradation. Closing
    // stdin up front tells it plainly that there is no input coming.
    const child = spawn(cmd, args, { windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
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

// RESULT-FIRST EXECUTION: process exit is not the source of truth for
// whether a code-edit task succeeded - the worktree is. Real, repeatedly
// observed behavior this module already documents: OpenCode can finish a
// correct edit in ~2s and then simply not exit for the rest of its
// timeout budget. The prior fix only checked the worktree AFTER a timeout
// fired (a safety net, kept below); this actively polls the worktree
// WHILE the process is still running, so a fast, correct edit is accepted
// immediately instead of waiting out the rest of a 40-120s budget on a
// process that has nothing left to do. A diff must be identical across
// `stableChecks` consecutive polls before being accepted, to avoid
// reading a file mid-write. Once accepted, the process tree is killed
// immediately - whether it would eventually have exited on its own no
// longer matters.
function runOpencodeResultFirst(args, targetWorktree, { timeout = 240000, pollIntervalMs = 1500, stableChecks = 2 } = {}) {
  return new Promise((resolve) => {
    // Same stdin-close fix as runWithTreeKill above - see its comment for
    // the confirmed root cause. Without this, the process this function is
    // trying to poll never produces output to poll in the first place.
    const child = spawn('opencode', args, { windowsHide: true, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const startedAt = Date.now();
    let stdout = '', stderr = '', settled = false, timedOut = false;
    let lastDiffStat = null, stableCount = 0;
    child.stdout && child.stdout.on('data', (d) => { stdout += d; });
    child.stderr && child.stderr.on('data', (d) => { stderr += d; });

    function settle(resolvedVia, statusOverride) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(pollTimer);
      resolve({ status: statusOverride !== undefined ? statusOverride : child.exitCode, stdout, stderr, error: timedOut ? { code: 'ETIMEDOUT' } : null, resolvedVia, elapsedMs: Date.now() - startedAt, pid: child.pid });
    }

    const pollTimer = setInterval(() => {
      if (settled) return;
      const { stat } = gitDiffStat(targetWorktree);
      if (stat && stat === lastDiffStat) {
        stableCount += 1;
        if (stableCount >= stableChecks) {
          killTree(child.pid);
          settle('diff-detected-stable', 0);
        }
      } else {
        stableCount = stat ? 1 : 0;
        lastDiffStat = stat || null;
      }
    }, pollIntervalMs);

    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); settle('timeout'); }, timeout);
    child.on('error', (err) => { if (settled) return; clearTimeout(timer); clearInterval(pollTimer); settled = true; resolve({ status: null, stdout, stderr, error: err, resolvedVia: 'spawn-error', elapsedMs: Date.now() - startedAt }); });
    child.on('close', (code) => settle('process-close', code));
  });
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
    r = await runOpencodeResultFirst(buildOpencodeRunArgs(model, targetWorktree, goalFile, absScopedFiles), targetWorktree, { timeout: timeoutMs });
  } finally {
    try { fs.unlinkSync(goalFile); } catch { /* best effort cleanup */ }
  }
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  const resultFirstSuccess = r.resolvedVia === 'diff-detected-stable';
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

  if (resultFirstSuccess) {
    // The primary fast path now: a real, stable diff appeared while the
    // process was still running, so it was killed and accepted
    // immediately instead of waiting out the rest of the timeout budget
    // on a process that had already finished its actual work. Token/cost
    // accounting above may be incomplete (the process was killed before
    // its own final step_finish event, if any, could be read) - reported
    // honestly as such rather than presented as complete.
    const { stat, diff } = gitDiffStat(targetWorktree);
    let verify = null;
    if (verifyScript) {
      const v = await runWithTreeKill('npm', ['run', verifyScript], { cwd: targetWorktree, timeout: 480000 });
      verify = { ok: v.status === 0, exitCode: v.status, stdout: String(v.stdout || '').slice(-6000), stderr: String(v.stderr || '').slice(-3000) };
      if (!verify.ok) return { ok: false, classification: 'verification_failed', retriable: true, model, message: lastText, diffStat: stat, diff, verify, tokens, costUsd, resultFirstDetection: true, elapsedMs: r.elapsedMs };
    }
    return { ok: true, classification: 'ok', model, message: lastText || 'agent completed the edit (detected via worktree polling, process killed before it exited on its own)', diffStat: stat, diff, verify, tokens, costUsd, tier: 'free-hosted', resultFirstDetection: true, elapsedMs: r.elapsedMs, tokenAccountingMayBeIncomplete: true };
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

// Point 5 this cycle, real evidence-backed: expanding to a BIGGER context
// level after a LOCAL Ollama timeout was tried 3/3 times in this project's
// own real history and produced a second timeout every single time
// (data/collective-brain/runtime/agent-history.jsonl: level-1 120027ms
// timeout -> level-2 122247ms timeout, repeated identically on 2 other
// real tasks). On this CPU-only host, prompt EVALUATION (not generation)
// is the dominant cost, so handing the model MORE files after it already
// timed out can only make the next attempt slower, never faster - this is
// exactly "the same error a second time -> don't repeat the same path"
// from this cycle's spec. Skip the remaining levels for THIS model and
// move to the next one instead of wasting a second guaranteed-similar
// timeout. Scoped to isLocal only - OpenCode's level-based expansion
// exists for a different, still-valid reason (a remote agent that
// under-explores a too-narrow file set) and has no equivalent evidence of
// this failure mode, so it is left alone.
function shouldSkipRemainingLevels(isLocal, classification) {
  return isLocal && classification === 'timeout';
}

// One attempt against the local, $0, shell-free Ollama structured-patch
// adapter (lib/ollama-patch-adapter.js) - mirrors invokeOpencodeOnce's own
// verify+rollback contract exactly, so implementGoal's fallback loop below
// can treat a local attempt and a remote attempt identically. On any
// failure (validation rejection, syntax error, failing verify script) the
// worktree is rolled back to clean before returning, same as the OpenCode
// path - a local attempt never leaves partial/broken state behind for the
// next attempt (local or remote) to inherit.
async function invokeOllamaPatchOnce(model, goal, targetWorktree, { timeoutMs, verifyScript = 'check', scopedFiles = [] } = {}) {
  const ollamaPatchAdapter = require('./ollama-patch-adapter');
  const r = await ollamaPatchAdapter.invokeOllamaPatch(model, goal, targetWorktree, scopedFiles, { timeoutMs });
  if (!r.ok) {
    return { ok: false, classification: r.classification, retriable: r.classification !== 'no_scope', model, tier: 'free-local', error: r.error, attempts: r.attempts, costUsd: 0 };
  }
  let verify = null;
  if (verifyScript) {
    const v = await runWithTreeKill('npm', ['run', verifyScript], { cwd: targetWorktree, timeout: 480000 });
    verify = { ok: v.status === 0, exitCode: v.status, stdout: String(v.stdout || '').slice(-6000), stderr: String(v.stderr || '').slice(-3000) };
    if (!verify.ok) {
      // Point 6 this cycle: a real, applied, syntax-valid edit that only
      // failed the project's own VERIFIER is evidence the model got most
      // of the way there - immediately rolling back and reporting failure
      // discards that. One cheap repair attempt: the model's own previous
      // edit + the verifier's real error + the file's current content,
      // never the full original task prompt again.
      const repairContext = String(verify.stderr || verify.stdout || '').trim();
      const repaired = r.appliedEdits && repairContext
        ? await ollamaPatchAdapter.invokeOllamaRepair(model, r.appliedEdits, repairContext, targetWorktree, r.touchedFiles, { timeoutMs: Math.max(60000, timeoutMs || 0) })
        : { ok: false, classification: 'no_repair_context' };
      if (repaired.ok) {
        const v2 = await runWithTreeKill('npm', ['run', verifyScript], { cwd: targetWorktree, timeout: 480000 });
        const verify2 = { ok: v2.status === 0, exitCode: v2.status, stdout: String(v2.stdout || '').slice(-6000), stderr: String(v2.stderr || '').slice(-3000) };
        if (verify2.ok) {
          return { ok: true, classification: 'ok', model, tier: 'free-local', editsApplied: repaired.editsApplied, touchedFiles: repaired.touchedFiles, verify: verify2, repaired: true, tokens: null, costUsd: 0 };
        }
        verify.repairAttempted = true;
        verify.repairFailedAgain = true;
      } else {
        verify.repairAttempted = true;
        verify.repairError = repaired.error || repaired.classification;
      }
      spawnSync('git', ['checkout', '--', '.'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
      spawnSync('git', ['clean', '-fd'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
      return { ok: false, classification: 'verification_failed', retriable: true, model, tier: 'free-local', verify, editsApplied: r.editsApplied, touchedFiles: r.touchedFiles, costUsd: 0 };
    }
  }
  return { ok: true, classification: 'ok', model, tier: 'free-local', editsApplied: r.editsApplied, newFilesCreated: r.newFilesCreated, touchedFiles: r.touchedFiles, skippedForBudget: r.skippedForBudget, verify, tokens: null, costUsd: 0 };
}

// Full pipeline: goal -> isolated worktree -> for each model, try
// progressively larger context (scoped-small -> scoped-medium -> full
// repo) before moving to the next model -> verified result, or
// needsEscalation if every free attempt at every context level failed.
// This is the real fix for the confirmed full-repo-timeout bottleneck: a
// small, precisely-scoped edit no longer requires the agent to explore the
// entire repository before touching anything.
// Local models are addressed with an "ollama:" prefix so a single ordered
// list (and a single history-ranking pass) can cover both providers - see
// OLLAMA_MODEL_BENCHMARK.json for how this default was chosen: the other
// installed models were either unreliably slow (>220s, still incomplete)
// or produced schema-invalid/hallucinated output on the real benchmark
// task. Listed first in the default order so a genuinely untested task
// tries the $0 local path before the free-hosted remote one - real
// history (agentHistory.rankModelsForTask) is what's allowed to override
// this when it has actual evidence OpenCode does significantly better for
// a given task type, per this cycle's explicit cost-minimization goal.
const OLLAMA_PATCH_MODELS = (process.env.OLLAMA_PATCH_MODELS || 'ollama:qwen3:1.7b').split(',').map((s) => s.trim()).filter(Boolean);

async function implementGoal({ mainRoot, goal, targetWorktree, models = [...OLLAMA_PATCH_MODELS, ...FREE_OPENCODE_MODELS], timeoutMs = 240000, verifyScript = 'check', maxContextLevel = 3 } = {}) {
  const guard = assertIsolatedWorktree(mainRoot, targetWorktree);
  if (!guard.ok) return { ok: false, retriable: false, error: guard.error };
  // Input validation happens before any environment/availability check, so
  // a bad model list is always reported as exactly that - never masked by
  // "opencode not available" on a host that happens to lack the CLI (e.g.
  // CI). A caller may narrow `models` (e.g. to retry with one specific
  // model), but never to something outside the vetted free allowlists -
  // this is what stops a remote task from smuggling in a paid/arbitrary
  // provider.
  const rejected = models.filter((m) => !FREE_OPENCODE_MODELS.includes(m) && !OLLAMA_PATCH_MODELS.includes(m));
  if (rejected.length) return { ok: false, retriable: false, error: `model(s) not in the free allowlist: ${rejected.join(', ')}` };

  const scopedTaskCompiler = require('./scoped-task-compiler');
  const agentHistory = require('./agent-history');
  const resourceScheduler = require('./resource-scheduler');
  const agentHealthProbe = require('./agent-health-probe');

  const usesOpencode = models.some((m) => !m.startsWith('ollama:'));
  const usesOllama = models.some((m) => m.startsWith('ollama:'));
  // Health is probed once per provider actually in play, lazily reused
  // across every attempt/level for that provider below - not per attempt,
  // to avoid the probe itself becoming a meaningful chunk of a task's
  // total latency. See each probe's own module for what "hard skip" means
  // for that provider and why the bar is deliberately high (a single slow
  // or hung probe call is not proof every subsequent attempt will fail
  // too - a real false positive from an earlier, over-eager version of
  // this gate wrongly skipped legitimate tasks; narrowed since).
  const opencodeOk = usesOpencode ? await opencodeAvailable() : false;
  const openaiHealth = usesOpencode && opencodeOk ? await agentHealthProbe.probe(mainRoot, { deep: true, useCache: true }) : null;
  const OPENCODE_HARD_SKIP = new Set(['RATE_LIMITED', 'NETWORK_DEGRADED', 'MODEL_UNAVAILABLE']);
  const openaiSkippable = !!(openaiHealth && OPENCODE_HARD_SKIP.has(openaiHealth.state));

  // History-based ordering: try the model/provider that has actually
  // solved similar (taskType, context-size-bucket) tasks fastest/most
  // reliably before, falling back to the given/default order (local-first)
  // for models with no history yet - real, inspectable (data/
  // collective-brain/runtime/agent-history.jsonl), not a black box.
  const level1Ctx = scopedTaskCompiler.compileContext(mainRoot, goal, 1);
  const ranking = agentHistory.rankModelsForTask(mainRoot, { goal, contextFileCount: level1Ctx.files.length }, models);
  // Real gap found live this cycle: rankModelsForTask ranks ANY model with
  // history (even one sample) ahead of one with none - correct for
  // comparing two remote models, but wrong for local-vs-remote before the
  // local path has ever run through this function: OpenCode's large
  // pre-existing track record (from earlier cycles/tasks) would otherwise
  // always outrank a completely untested local model, even though "zero
  // samples" is not real evidence the local model is worse. Until local
  // has actually accumulated some history for this task type, keep the
  // caller's own default order (local-first, see OLLAMA_PATCH_MODELS
  // above) instead of letting an unrelated remote track record alone
  // decide - this is what "минимальная стоимость при требуемом качестве"
  // actually requires: try the free option first when there's no evidence
  // against it yet.
  const localHasHistory = agentHistory.readHistory(mainRoot).some((h) => h.provider === 'ollama-local' && h.taskType === ranking.taskType);
  let orderedModels = localHasHistory ? ranking.order : [...models.filter((m) => m.startsWith('ollama:')), ...ranking.order.filter((m) => !m.startsWith('ollama:'))];
  // Point 9 this cycle: once EVERY candidate model has real history for
  // this taskType, refine the order using the fuller
  // P(success)/latency/resource-cost score instead of success-rate alone -
  // real finding this cycle: a $0 model that takes minutes and almost
  // always fails must not automatically outrank a $0 model that solves the
  // same task class in seconds. Deliberately only applies when the WHOLE
  // list is tested - deciding how to interleave a tested model against a
  // still-untested one is a separate, harder question this cycle doesn't
  // have enough evidence to answer, and the existing local-first-until-
  // tested logic above already handles that mixed case correctly.
  const scored = orderedModels.map((m) => ({ model: m, score: agentHistory.scoreModelForTask(mainRoot, { model: m, taskType: ranking.taskType, provider: m.startsWith('ollama:') ? 'ollama-local' : 'opencode-free' }) }));
  if (scored.every((s) => s.score.sampleSize >= 2)) {
    orderedModels = scored.slice().sort((a, b) => b.score.score - a.score.score).map((s) => s.model);
  }
  const taskId = `agent-implement-${path.basename(targetWorktree)}`;
  // Adaptive time budget: once ≥3 real successful samples exist for this
  // (taskType, context-bucket), use their observed p90*1.5 instead of the
  // caller's flat default - a task history shows takes ~25s should not
  // still be given a fixed 240s budget by default, and a task type never
  // seen before correctly falls back to the caller's own value.
  const adaptiveTimeoutMs = agentHistory.recommendTimeoutMs(mainRoot, { goal, contextFileCount: level1Ctx.files.length }, timeoutMs);

  const attempts = [];
  for (const model of orderedModels) {
    const isLocal = model.startsWith('ollama:');
    const localModelName = isLocal ? model.slice('ollama:'.length) : null;

    if (isLocal && !usesOllama) continue; // defensive, should never happen given orderedModels ⊆ models
    // Point 8 this cycle: real evidence found live - retrying a model that
    // has already reliably failed on this exact task class wastes a real
    // attempt before falling through to one that might work. Requires
    // several real samples (agentHistory's own default) before concluding
    // anything, and only affects THIS call's ordering - never blocks the
    // model from being explicitly requested again, and a solitary bad
    // attempt is never enough evidence on its own.
    // Point 6 this cycle: the flat rule (>=3 attempts, 0% success) is kept
    // as-is (real, tested, safe) and OR-combined with the new confidence-
    // weighted rule rather than replaced - this can only make pruning
    // trigger EARLIER when the decayed evidence is strong, never later or
    // less often than the existing rule already would.
    const pruneCheck = agentHistory.shouldSkipModelForTaskClass(mainRoot, { model, taskType: ranking.taskType });
    const weightedPrune = agentHistory.evidenceWeightedSkip(mainRoot, { model, taskType: ranking.taskType });
    if (pruneCheck.skip || weightedPrune.skip) {
      attempts.push({ model, level: null, classification: 'pruned_by_history', failureLayer: 'pipeline', ok: false, durationMs: 0, note: pruneCheck.skip ? pruneCheck.reason : weightedPrune.reason });
      continue;
    }
    if (!isLocal && !opencodeOk) {
      attempts.push({ model, level: null, classification: 'unavailable', failureLayer: 'model', ok: false, durationMs: 0, note: 'opencode CLI not available on this host' });
      continue;
    }
    if (!isLocal && openaiSkippable) {
      attempts.push({ model, level: null, classification: 'health_skip', failureLayer: 'resource', ok: false, durationMs: 0, note: `skipped: ${openaiHealth.state}` });
      continue;
    }
    let ollamaHealth = null;
    if (isLocal) {
      ollamaHealth = await agentHealthProbe.probeOllama(localModelName, { deep: true });
      if (ollamaHealth.state === 'OLLAMA_UNAVAILABLE' || ollamaHealth.state === 'OLLAMA_OOM') {
        attempts.push({ model, level: null, classification: 'health_skip', failureLayer: 'resource', ok: false, durationMs: 0, note: `skipped: ${ollamaHealth.state} (${ollamaHealth.reason})` });
        continue;
      }
    }

    const levelsForThisModel = isLocal ? Math.min(maxContextLevel, 2) : maxContextLevel; // local adapter never explores a full repo - see lib/ollama-patch-adapter.js's no_scope guard
    for (let level = 1; level <= levelsForThisModel; level++) {
      const ctx = level === 1 ? level1Ctx : scopedTaskCompiler.compileContext(mainRoot, goal, level);
      if (isLocal && ctx.full) break; // shouldn't be reachable given levelsForThisModel, kept as a hard guard
      const levelTimeout = Math.max(20000, Math.round(adaptiveTimeoutMs * (LEVEL_TIMEOUT_FRACTION[level] || 1)));
      const resourceCommand = isLocal ? 'agent_implement_local' : 'agent_implement';
      // Point 3 this cycle: "don't run the whole heavy orchestration stack
      // if it isn't needed." A level-1 attempt is, by construction, the
      // small/high-confidence case (explicit-path or tightly keyword-
      // matched files, capped at 5) - verifying it with the full `npm run
      // check` (node scripts/check-js.js + the ENTIRE node --test suite,
      // hundreds of tests across the whole repo) pays a large, mostly-
      // irrelevant wall-clock cost for a one-file markup/config/small-JS
      // edit, and - as this cycle's failure-taxonomy work found - a real,
      // unrelated flake anywhere in that full suite gets misread as this
      // specific edit's fault (VERIFIER_FALSE_NEGATIVE). `check:fast`
      // (scripts/check-js.js only) is still a REAL syntax gate across
      // every lib/api/app JS module, on top of the per-file syntax check
      // ollama-patch-adapter's own applyPatch already does - this is not
      // "skip verification", it's "verify at a level proportionate to the
      // change". This never weakens the actual safety net: the project's
      // real CI `check` step (unchanged, still comprehensive) still runs
      // on any PR opened from the result regardless of what this internal
      // gate used. A level-2+ attempt (level 1 already needed more scope
      // to succeed) escalates back to the caller's own full verifyScript,
      // matching "full pipeline only if fast path didn't cope." A caller
      // that explicitly passed a non-default verifyScript (or null) is
      // never overridden.
      const effectiveVerifyScript = (level === 1 && verifyScript === 'check') ? 'check:fast' : verifyScript;
      const attemptStart = Date.now();
      // Each attempt acquires only the resource class its own provider
      // needs (LLM_LOCAL for a CPU-bound local call, LLM_REMOTE for a
      // network-bound hosted call) and releases it immediately after -
      // never held across the whole multi-model loop, so a local attempt
      // and a later remote attempt in the same task never contend for a
      // resource class neither of them is actually using at that moment.
      const attempt = await resourceScheduler.withResourceSlot(mainRoot, resourceCommand, taskId, () => (
        isLocal
          // Real evidence (OLLAMA_MODEL_BENCHMARK.json): the chosen local
          // model needs up to ~150s for a single real file on this CPU-only
          // host - a level-1 timeout fraction of a caller's default budget
          // would often be far too tight before any local history exists to
          // adapt it. 120s floor, not the OpenCode path's much smaller one.
          ? invokeOllamaPatchOnce(localModelName, goal, targetWorktree, { timeoutMs: Math.max(levelTimeout, 120000), verifyScript: effectiveVerifyScript, scopedFiles: ctx.files })
          : invokeOpencodeOnce(model, goal, targetWorktree, { timeoutMs: levelTimeout, verifyScript: effectiveVerifyScript, scopedFiles: ctx.full ? [] : ctx.files })
      ), { maxWaitMs: 120000 });
      const durationMs = Date.now() - attemptStart;
      // Point 2 this cycle: classify every real recorded attempt into the
      // failure taxonomy's layer (model/pipeline/resource/test) instead of
      // letting a flat classification string silently blame the model for
      // an orchestration/routing/resource problem - see
      // lib/failure-taxonomy.js for the real evidence behind this mapping
      // (the exact mechanism found via this cycle's A/B trace).
      const failureTaxonomy = require('./failure-taxonomy');
      const verifierStderr = attempt.verify ? String(attempt.verify.stderr || attempt.verify.stdout || '') : '';
      const taxo = attempt.ok ? { taxonomyKey: null, layer: null } : failureTaxonomy.classifyFailure(attempt.classification, { verifierStderr });
      agentHistory.recordAttempt(mainRoot, {
        taskFingerprint: taskFingerprint(goal), taskType: ranking.taskType,
        scope: ctx.full ? 'full-repo' : ctx.files.length, contextBucket: agentHistory.contextSizeBucket(ctx.full ? 'full-repo' : ctx.files.length),
        model, provider: isLocal ? 'ollama-local' : 'opencode-free', level, durationMs, success: attempt.ok, classification: attempt.classification,
        failureLayer: taxo.layer, failureTaxonomyKey: taxo.taxonomyKey,
        healthState: isLocal ? (ollamaHealth && ollamaHealth.state) : (openaiHealth && openaiHealth.state),
        resolvedVia: attempt.resultFirstDetection ? 'diff-detected-stable' : (attempt.processHangAfterCompletion ? 'process-hang-recovered' : (attempt.ok ? 'process-close' : null)),
        processHung: !!(attempt.resultFirstDetection || attempt.processHangAfterCompletion),
        verifyOk: attempt.verify ? attempt.verify.ok : null,
        tokens: attempt.tokens || null, costUsd: attempt.costUsd || 0,
      });
      // Point 4 this cycle: log WHY each context file was selected, not
      // just how many - lets a real failure be diagnosed against the
      // actual reasoning the compiler used, instead of a bare file count.
      attempts.push({ model, level, contextFiles: ctx.full ? 'full-repo' : ctx.files.length, whySelected: ctx.full ? null : ctx.whySelected, classification: attempt.classification, failureLayer: taxo.layer, ok: attempt.ok, durationMs });
      if (attempt.ok) return { ...attempt, attempts, needsEscalation: false, contextLevel: level, scopedFiles: ctx.full ? null : ctx.files, modelRanking: ranking.taskType, openaiHealth, ollamaHealth, adaptiveTimeoutMs };
      // roll back any partial edit before the next attempt, so every
      // attempt starts from a clean worktree instead of compounding.
      // (invokeOllamaPatchOnce already rolls back on its own
      // verification-failure path; this also covers every other local and
      // remote failure classification.)
      spawnSync('git', ['checkout', '--', '.'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
      spawnSync('git', ['clean', '-fd'], { cwd: targetWorktree, encoding: 'utf8', timeout: 15000 });
      if (shouldSkipRemainingLevels(isLocal, attempt.classification)) break;
      // a non-retriable-flavored failure at this level (e.g. the compiled
      // context was empty and level 1/2 genuinely can't help) still moves
      // on to the next level rather than aborting - only exhausting every
      // level of every model reports needsEscalation.
      if (ctx.full) break; // level 3 is the last level for this model
    }
  }
  const last = attempts[attempts.length - 1];
  return { ok: false, retriable: false, needsEscalation: true, attempts, openaiHealth, error: `all ${models.length} free-tier model(s)/provider(s) failed across all context levels (last: ${last && last.classification})` };
}

const WORKTREE_SCRATCH_DIR = path.join(os.tmpdir(), 'world-server-agent-worktrees');
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]{1,60}$/;
const AGENT_INVOKE_BRANCH_PREFIX = 'ai/agent-invoke/';

// Looks up which branch (if any) a worktree path is checked out on, via the
// main repo's own worktree admin metadata - this works even when the target
// worktree's own .git is missing/corrupted, unlike `git -C target rev-parse`.
function branchForWorktree(mainRoot, targetWorktree) {
  const list = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: mainRoot, encoding: 'utf8', timeout: 15000 });
  if (list.status !== 0) return null;
  const wanted = path.resolve(targetWorktree).replace(/\\/g, '/').toLowerCase();
  let current = null;
  for (const line of String(list.stdout || '').split('\n')) {
    if (line.startsWith('worktree ')) current = { path: line.slice(9).trim(), branch: null };
    else if (line.startsWith('branch ') && current) current.branch = line.slice(7).trim().replace(/^refs\/heads\//, '');
    else if (line === '' && current) {
      if (path.resolve(current.path).replace(/\\/g, '/').toLowerCase() === wanted) return current.branch;
      current = null;
    }
  }
  if (current && path.resolve(current.path).replace(/\\/g, '/').toLowerCase() === wanted) return current.branch;
  return null;
}

// Root-cause fix for ai/agent-invoke/* branch leakage: createIsolatedWorktree
// always creates a fresh, disposable branch under this prefix, but the
// worktree-removal paths below only ever removed the worktree checkout, never
// the branch - every test/task run left one more permanent ref behind (found
// via a real audit: 131 such branches, 0 pushed to origin, 0 with commits not
// already on origin/master). Deletion is fenced to this exact prefix so this
// function can never delete an unrelated branch even if called with an
// unexpected worktree path.
function deleteThrowawayBranchIfOwned(mainRoot, branch) {
  if (!branch || !branch.startsWith(AGENT_INVOKE_BRANCH_PREFIX)) return;
  spawnSync('git', ['branch', '-D', '--', branch], { cwd: mainRoot, encoding: 'utf8', timeout: 15000 });
}

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
  const branch = branchForWorktree(mainRoot, targetWorktree);
  spawnSync('git', ['worktree', 'remove', '--force', targetWorktree], { cwd: mainRoot, encoding: 'utf8', timeout: 30000 });
  try { fs.rmSync(targetWorktree, { recursive: true, force: true }); } catch { /* best effort */ }
  spawnSync('git', ['worktree', 'prune'], { cwd: mainRoot, encoding: 'utf8', timeout: 30000 });
  deleteThrowawayBranchIfOwned(mainRoot, branch);
  return { repaired: true };
}

function removeIsolatedWorktree(mainRoot, targetWorktree) {
  const guard = assertIsolatedWorktree(mainRoot, targetWorktree);
  if (!guard.ok) return { ok: false, retriable: false, error: guard.error };
  const branch = branchForWorktree(mainRoot, targetWorktree);
  const rm = spawnSync('git', ['worktree', 'remove', '--force', targetWorktree], { cwd: mainRoot, encoding: 'utf8', timeout: 30000 });
  if (rm.status === 0) deleteThrowawayBranchIfOwned(mainRoot, branch);
  return { ok: rm.status === 0, retriable: rm.status !== 0, stderr: String(rm.stderr || '').slice(-1000) };
}

module.exports = {
  ollamaAvailable, queryOllama, opencodeAvailable, implementGoal, invokeOpencodeOnce, invokeOllamaPatchOnce, assertIsolatedWorktree,
  createIsolatedWorktree, isWorktreeHealthy, repairWorktreeIfCorrupted, removeIsolatedWorktree, buildOpencodeRunArgs,
  runWithTreeKill, killTree, taskFingerprint, shouldSkipRemainingLevels,
  FREE_OPENCODE_MODELS, OLLAMA_MODEL, OLLAMA_PATCH_MODELS, SAFE_NAME_RE,
  AGENT_INVOKE_BRANCH_PREFIX, branchForWorktree,
};
