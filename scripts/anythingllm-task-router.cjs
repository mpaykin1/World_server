#!/usr/bin/env node
'use strict';
// ANYTHINGLLM_TASK_ROUTER
//
// The dispatcher half of intent -> capability class -> minimal allowlist -> LLM.
// Classifies a task deterministically (lib/mcp-intent-router.js), writes the MCP
// proxy's profile file (scripts/mcp-filesystem-proxy.cjs reads it per tools/list
// and tools/call), sends the chat request with a hard timeout, and applies one
// bounded self-healing retry if the response looks like a tool-selection mismatch
// rather than blindly resending the same request.
//
// Limits enforced here (see error-prevention-registry.json#anythingllm-...): a
// hard per-attempt timeout (default 180s - well above the ~ tens-of-seconds a
// narrow 4-tool turn should need on CPU-bound qwen3:1.7b, well below the 600s+
// hangs seen with a 15-tool turn), exactly one retry on a detected mismatch (not
// an unbounded loop), and every attempt's tokens/duration recorded so a stuck
// pattern is visible in the output rather than silently absorbed.
const fs = require('fs');
const path = require('path');
const { route, primaryToolFor } = require('../lib/mcp-intent-router');
const { decide: decideResources } = require('../lib/ai-resource-scheduler');

const ANYTHINGLLM_URL = process.env.ANYTHINGLLM_URL || 'http://127.0.0.1:3001';
const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY;
const PROFILE_PATH = path.join(__dirname, '..', 'data', 'mcp-router-profile.json');
const DEFAULT_TIMEOUT_MS = Number(process.env.ANYTHINGLLM_TASK_TIMEOUT_MS || 150000);
const MAX_RETRIES = 1;

const MISMATCH_PATTERNS = [
  /cannot be performed with the available tools/i,
  /no tool was able to/i,
  /does not support accessing/i,
  /not available (in|with) (the )?current/i,
  /i (do not|don't) have (a|the) tool/i,
];

function writeProfile(capabilityClass, allowedTools) {
  fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify({ capabilityClass, allowedTools, writtenAt: new Date().toISOString() }, null, 2));
}

function looksLikeMismatch(textResponse, thoughts, allowedTools) {
  const text = textResponse || '';
  // An empty (or near-empty) final response is NOT a pass just because it doesn't
  // match a known bad-text pattern - a real E2E run against thread fffd7db4 showed
  // "ok: true, mismatchDetected: false" with an entirely empty textResponse (the
  // agent loop exhausted AgentSkillMaxToolCalls before ever synthesizing an answer).
  // Absence of a bad pattern is not presence of a good one.
  if (text.trim().length < 2) return true;
  if (MISMATCH_PATTERNS.some((re) => re.test(text))) return true;
  const thoughtText = Array.isArray(thoughts) ? thoughts.join(' ') : String(thoughts || '');
  // A thought naming document-summarizer (or any tool outside our allowlist) on a
  // filesystem task is itself the failure mode this router exists to catch.
  if (/document-summarizer/i.test(thoughtText) && !allowedTools.includes('document-summarizer')) return true;
  return false;
}

async function sendChat(workspaceSlug, threadSlug, message, timeoutMs) {
  const start = Date.now();
  const res = await fetch(`${ANYTHINGLLM_URL}/api/v1/workspace/${workspaceSlug}/thread/${threadSlug}/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANYTHINGLLM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode: 'chat' }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const durationMs = Date.now() - start;
  if (!res.ok) return { ok: false, httpStatus: res.status, durationMs };
  const body = await res.json();
  return { ok: true, httpStatus: res.status, durationMs, body };
}

async function runTask(taskText, opts = {}) {
  const workspaceSlug = opts.workspaceSlug || 'world';
  const threadSlug = opts.threadSlug;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  if (!threadSlug) throw new Error('runTask requires opts.threadSlug');
  if (!ANYTHINGLLM_API_KEY) throw new Error('ANYTHINGLLM_API_KEY not set in env');

  const { capabilityClass, allowedTools } = route(taskText);
  writeProfile(capabilityClass, allowedTools);

  // Resource-aware gate: don't dispatch a CPU-bound local inference job into a
  // contended machine and let it silently eat a full timeout window. Real E2E
  // testing hit 100% CPU (Win32_Processor.LoadPercentage) with repeated 150s
  // timeouts before this was wired in - see lib/ai-resource-scheduler.js. Callers
  // that genuinely want to force a run regardless (e.g. the reproducibility
  // harness intentionally probing under load) can pass respectResourceGate:false.
  if (opts.respectResourceGate !== false) {
    const estimatedCost = opts.estimatedCost || (capabilityClass === 'filesystem-write' ? 'medium' : 'low');
    const gate = await decideResources({ capabilityClass, estimatedCost });
    if (gate.action !== 'run_now') {
      return { capabilityClass, allowedTools, attempts: [], result: gate.action === 'queue' ? 'QUEUED' : 'ESCALATE', retries: 0, resourceGate: gate };
    }
  }

  const attempts = [];
  // AnythingLLM's agent/tool mode is triggered by an "@agent" prefix in the message
  // text itself (the API's `mode` field is a separate RAG chat-mode concept) - the
  // router's whole purpose is dispatching agent tool-use tasks, so add it if missing.
  //
  // The explicit tool-name hint is included from attempt 1, not just on retry: live
  // testing showed AnythingLLM's IntelligentSkillSelector reranks candidate tools by
  // embedding similarity to the QUERY TEXT before the LLM ever sees a prompt, and
  // document-summarizer's description consistently out-scored the correct MCP tools
  // for a plainly-worded "read this file, tell me what's in it" query (that phrasing
  // reads as document summarization to the embedding model). Naming the exact allowed
  // tool names in the query itself shifts the embedding, not just the LLM's reasoning -
  // a system-prompt-level instruction alone does NOT reach the reranker, since
  // reranking happens upstream of the model call.
  const toolHint = allowedTools.length ? `Use exactly one of these tools: ${allowedTools.join(', ')}. Do not use document-summarizer, rag-memory, or web-scraping for this.` : '';
  let message = `@agent ${taskText}\n\n${toolHint}`.trim();
  let finalAttempt = null;

  for (let attemptNum = 1; attemptNum <= 1 + MAX_RETRIES; attemptNum++) {
    let attempt;
    try {
      const r = await sendChat(workspaceSlug, threadSlug, message, timeoutMs);
      if (!r.ok) {
        attempt = { attemptNum, ok: false, reason: `http_${r.httpStatus}`, durationMs: r.durationMs };
      } else {
        const b = r.body || {};
        const mismatch = looksLikeMismatch(b.textResponse, b.thoughts, allowedTools);
        attempt = {
          attemptNum,
          ok: true,
          textResponse: b.textResponse,
          thoughts: b.thoughts || [],
          promptTokens: b.metrics && b.metrics.prompt_tokens,
          completionTokens: b.metrics && b.metrics.completion_tokens,
          totalTokens: b.metrics && b.metrics.total_tokens,
          durationSeconds: b.metrics && b.metrics.duration,
          durationMs: r.durationMs,
          mismatchDetected: mismatch,
        };
      }
    } catch (e) {
      attempt = { attemptNum, ok: false, reason: e.name === 'TimeoutError' ? 'timeout' : `error_${e.message}`, timedOut: e.name === 'TimeoutError', durationMs: timeoutMs };
    }
    attempts.push(attempt);
    finalAttempt = attempt;

    // Retry ONLY on a detected tool-selection mismatch, never blindly on a timeout -
    // a timeout with byte-identical content would just burn another full timeoutMs
    // window for the same likely outcome, which is exactly the "не отправлять тот же
    // запрос вслепую ещё раз" this router exists to avoid.
    const needsRetry = attempt.ok && attempt.mismatchDetected;
    if (!needsRetry || attemptNum > MAX_RETRIES) break;
    // Message already carries the tool-name hint from attempt 1; a repeat mismatch
    // means the hint alone wasn't enough - escalate to naming the single best tool.
    const singleTool = primaryToolFor(capabilityClass) || allowedTools[0];
    message = `@agent ${taskText}\n\nCall the ${singleTool} tool directly. Do not use document-summarizer, rag-memory, or web-scraping.`;
  }

  return {
    capabilityClass,
    allowedTools,
    attempts,
    result: finalAttempt && finalAttempt.ok && !finalAttempt.mismatchDetected ? 'PASS' : finalAttempt && finalAttempt.timedOut ? 'TIMEOUT' : 'FAIL',
    retries: attempts.length - 1,
  };
}

module.exports = { runTask, looksLikeMismatch, writeProfile, PROFILE_PATH };

if (require.main === module) {
  const taskText = process.argv[2];
  const threadSlug = process.argv[3];
  if (!taskText || !threadSlug) {
    console.error('usage: node anythingllm-task-router.cjs "<task text>" <threadSlug> [workspaceSlug]');
    process.exit(1);
  }
  runTask(taskText, { threadSlug, workspaceSlug: process.argv[4] || 'world' })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.result === 'PASS' ? 0 : 1; })
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
