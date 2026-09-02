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
const { decide: decideResources, enqueueTask } = require('../lib/ai-resource-scheduler');
const { pickBestBackend, recordOutcome } = require('../lib/model-suitability');

const ANYTHINGLLM_URL = process.env.ANYTHINGLLM_URL || 'http://127.0.0.1:3001';
const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY;
const PROFILE_PATH = path.join(__dirname, '..', 'data', 'mcp-router-profile.json');
// 150s was tuned during the empty-response-defect investigation, when EVERY
// turn looked broken regardless of budget. Now that the real defect (router
// hint using unprefixed tool names - see error-prevention-registry.json#
// anythingllm-router-hint-tool-name-mismatch) is fixed, live testing shows
// tool-calling turns genuinely completing (confirmed: a real read_text_file
// call returned the correct package.json content) but taking 150-350s+ of
// real wall-clock time under actual multi-AI CPU contention on this shared
// machine (other concurrent agents, not a bug - see lib/ai-resource-
// scheduler.js). 150s was cutting off completions that were working correctly,
// just slowly. This is a genuine external-load constraint the resource-aware
// gate already handles via queueing BEFORE dispatch; this timeout only
// governs how long an already-dispatched call is allowed to keep running.
const DEFAULT_TIMEOUT_MS = Number(process.env.ANYTHINGLLM_TASK_TIMEOUT_MS || 400000);
const MAX_RETRIES = 1;
// AnythingLLM's MCPHypervisor names each MCP tool `<mcpServerName>-<toolName>`
// (confirmed via anythingllm_mcp_servers.json's "world-server-sandbox" key and
// live backend log Transport messages). lib/mcp-intent-router.js's allowedTools
// are the SHORT, unprefixed names the raw MCP protocol itself returns (and what
// the proxy's tools/list filter matches against) - the two are NOT the same
// string, and this was the actual root cause of the empty-tool-call-response
// defect (see error-prevention-registry.json#anythingllm-router-hint-tool-name-
// mismatch): the hint text told the model to call a tool name that does not
// exist in its own tool list, and the model's attempted call at that
// nonexistent name failed to parse into anything, silently producing empty
// content. Prefix must be added ONLY when naming tools in text sent to the
// model - never when writing the MCP proxy's profile (that layer speaks the
// raw, unprefixed MCP protocol name).
const MCP_SERVER_NAME = process.env.ANYTHINGLLM_MCP_SERVER_NAME || 'world-server-sandbox';
const prefixedToolName = (name) => `${MCP_SERVER_NAME}-${name}`;

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

// setWorkspaceModel(): AnythingLLM's per-workspace agentModel field is live and
// settable via /workspace/{slug}/update (confirmed) - this is the actual model-
// routing lever, since the chat API itself has no per-request model override.
// null resets to the system default. This mutates shared workspace state, so
// callers dispatch one task at a time through this router (true for both the
// CLI entry point and the reproducibility harness) - documented as a known
// limitation, not silently assumed safe under real concurrent dispatch.
async function setWorkspaceModel(workspaceSlug, model) {
  // agentModel alone is inert - live-tested: with agentProvider left null, the
  // agent chat kept using the system-default model regardless of agentModel.
  // Both fields must be set together for the override to actually take effect.
  const res = await fetch(`${ANYTHINGLLM_URL}/api/v1/workspace/${workspaceSlug}/update`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANYTHINGLLM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentProvider: 'ollama', agentModel: model, chatProvider: 'ollama', chatModel: model }),
  });
  if (!res.ok) throw new Error(`setWorkspaceModel failed: HTTP ${res.status}`);
  return res.json();
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

  // Model routing: pick the best-scoring candidate for this capability class from
  // data/model-registry.json + the live suitability ledger (success rate, then
  // latency) rather than always using the system-default model - qwen3:1.7b is
  // suitable for 'unknown' (plain, non-agentic) but was measured 0/3 for
  // filesystem-read's actual tool-calling workload (data/model-suitability-
  // ledger.json, error-prevention-registry.json#qwen3-thinking-disabled-breaks-
  // tool-call-generation).
  let selectedModel = opts.model || pickBestBackend(capabilityClass).backend;

  // Resource-aware gate: don't dispatch a CPU-bound local inference job into a
  // contended machine and let it silently eat a full timeout window. Real E2E
  // testing hit 100% CPU (Win32_Processor.LoadPercentage) with repeated 150s
  // timeouts before this was wired in - see lib/ai-resource-scheduler.js. Under
  // CPU pressure the gate tries a lighter suitable candidate model FIRST (task ->
  // suitable models -> resources -> fastest viable backend -> queue only if none
  // viable) rather than jumping straight to queueing. Callers that genuinely want
  // to force a run regardless (e.g. the reproducibility harness intentionally
  // probing under load) can pass respectResourceGate:false.
  if (opts.respectResourceGate !== false) {
    const estimatedCost = opts.estimatedCost || (capabilityClass === 'filesystem-write' ? 'medium' : 'low');
    const gate = await decideResources({ capabilityClass, estimatedCost, currentModel: selectedModel });
    if (gate.action === 'queue') {
      const enq = enqueueTask({ taskText, workspaceSlug, threadSlug, timeoutMs }, { priority: opts.priority || 0 });
      return { capabilityClass, allowedTools, attempts: [], result: 'QUEUED', retries: 0, resourceGate: gate, queueJobId: enq.id };
    }
    if (gate.action !== 'run_now') {
      return { capabilityClass, allowedTools, attempts: [], result: 'ESCALATE', retries: 0, resourceGate: gate };
    }
    if (gate.recommendedModel) selectedModel = gate.recommendedModel;
  }

  if (selectedModel && opts.respectModelRouting !== false) {
    await setWorkspaceModel(workspaceSlug, selectedModel);
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
  const toolHint = allowedTools.length ? `Use exactly one of these tools: ${allowedTools.map(prefixedToolName).join(', ')}. Do not use document-summarizer, rag-memory, or web-scraping for this.` : '';
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
    const singleTool = prefixedToolName(primaryToolFor(capabilityClass) || allowedTools[0]);
    message = `@agent ${taskText}\n\nCall the ${singleTool} tool directly. Do not use document-summarizer, rag-memory, or web-scraping.`;
  }

  const result = finalAttempt && finalAttempt.ok && !finalAttempt.mismatchDetected ? 'PASS' : finalAttempt && finalAttempt.timedOut ? 'TIMEOUT' : 'FAIL';

  if (selectedModel && opts.respectModelRouting !== false) {
    const totalLatencyMs = attempts.reduce((sum, a) => sum + (a.durationMs || 0), 0);
    const totalTokens = attempts.reduce((sum, a) => sum + (a.totalTokens || 0), 0);
    recordOutcome(selectedModel, capabilityClass, result, { latencyMs: totalLatencyMs, tokens: totalTokens || undefined });
  }

  return {
    capabilityClass,
    allowedTools,
    model: selectedModel,
    attempts,
    result,
    retries: attempts.length - 1,
  };
}

module.exports = { runTask, looksLikeMismatch, writeProfile, prefixedToolName, MCP_SERVER_NAME, PROFILE_PATH };

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
