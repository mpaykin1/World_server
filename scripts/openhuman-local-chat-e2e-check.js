#!/usr/bin/env node
'use strict';
// OPENHUMAN_LOCAL_CHAT_E2E
//
// Distinguishes four independently-verifiable claims — a prior "All checks passed"
// Local Model Debug result did NOT mean ordinary chat actually works with local
// models, and this check exists so that gap can never be silently re-asserted:
//   1. OLLAMA_SERVER: is the Ollama HTTP server reachable at all.
//   2. MODEL_DIRECT: does a direct /api/generate call to a real pulled model produce
//      a real completion (proves the model itself works, independent of OpenHuman).
//   3. OPENHUMAN_LOCAL_MODEL_CONFIG: does OpenHuman's own config point local_ai at a
//      reachable Ollama server with a model that is actually present in `ollama list`.
//   4. OPENHUMAN_ORDINARY_CHAT_LOCAL: did a real OpenHuman ordinary-chat turn using a
//      local model actually complete (produce a final answer), based on the real
//      OpenHuman runtime log — NOT inferred from (1)-(3) all being green.
//
// Root cause found and recorded 2026-09-01 (see error-prevention-registry.json
// #openhuman-local-model-tool-context-overflow): OpenHuman injects the full tool
// catalog (76-315 tools) as prompt text for models without native tool-calling
// support, producing prompts up to ~49k tokens — while Ollama's actual runtime
// context window for the small models tested (gemma3:1b-it-qat, qwen3:1.7b) is only
// 4096 tokens, and they run with zero VRAM (CPU-only). The turn never completes;
// there is no error, just silence until the app moves back to idle polling.
const fs = require('fs');
const path = require('path');
const OLLAMA_URL = 'http://127.0.0.1:11434';
const RUNTIME_LOG_DIR = path.join(process.env.USERPROFILE || '', '.openhuman', 'logs');
const CONFIG_ROOT = path.join(process.env.USERPROFILE || '', '.openhuman', 'users');
const CONTEXT_OVERFLOW_RATIO_WARN = 2; // flag if a trimmed prompt was >2x the model's runtime context

async function checkOllamaServer() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { status: 'FAIL', reason: `HTTP ${res.status}` };
    const j = await res.json();
    return { status: 'PASS', models: (j.models || []).map((m) => m.name) };
  } catch (e) {
    return { status: 'FAIL', reason: e.message };
  }
}

async function checkModelDirect(model) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model, prompt: 'Reply with exactly one word: OK', stream: false }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { status: 'FAIL', reason: `HTTP ${res.status}` };
    const j = await res.json();
    return { status: j.done && j.response ? 'PASS' : 'FAIL', response: j.response };
  } catch (e) {
    return { status: 'FAIL', reason: e.message };
  }
}

function findConfig() {
  try {
    for (const id of fs.readdirSync(CONFIG_ROOT)) {
      const cfg = path.join(CONFIG_ROOT, id, 'config.toml');
      if (fs.existsSync(cfg)) return cfg;
    }
  } catch {}
  return null;
}

async function checkOpenHumanLocalModelConfig(ollamaModels) {
  const cfgPath = findConfig();
  if (!cfgPath) return { status: 'NOT_FOUND' };
  const text = fs.readFileSync(cfgPath, 'utf8');
  const m = text.match(/\[local_ai\]([\s\S]*?)(\n\[|$)/);
  if (!m) return { status: 'FAIL', reason: 'no [local_ai] section' };
  const section = m[1];
  const enabled = /runtime_enabled\s*=\s*true/.test(section);
  const modelIdMatch = section.match(/chat_model_id\s*=\s*"([^"]*)"/);
  const modelId = modelIdMatch ? modelIdMatch[1] : null;
  const modelPresent = modelId && ollamaModels.includes(modelId);
  return { status: enabled && modelPresent ? 'PASS' : 'FAIL', enabled, modelId, modelPresent };
}

function checkOrdinaryChatLocal() {
  let files;
  try { files = fs.readdirSync(RUNTIME_LOG_DIR).filter((f) => f.endsWith('.log')).sort(); } catch { return { status: 'NOT_VERIFIED', reason: 'no runtime log dir' }; }
  const latest = files[files.length - 1];
  if (!latest) return { status: 'NOT_VERIFIED', reason: 'no log file' };
  const text = fs.readFileSync(path.join(RUNTIME_LOG_DIR, latest), 'utf8');
  const lines = text.split('\n');

  // Find local-model agent_loop starts (ollama-routed, not openrouter/groq/google).
  const localStarts = [];
  const trims = [];
  lines.forEach((line, i) => {
    // Only the [core] agent_loop line carries the resolved model unambiguously — the
    // [tinyagents] line right after it repeats "model=" inside a differently-shaped
    // log line that this regex used to also match, picking up unrelated words.
    const mStart = line.match(/^\d\d:\d\d:\d\d:INF:core \[agent_loop\] routing chat turn through the tinyagents harness model=([\w.:\-]+)/);
    if (mStart && !/openrouter|groq|google|^chat-v1$|^openai$/i.test(mStart[1])) localStarts.push({ line: i, model: mStart[1], text: line });
    const mTrim = line.match(/message_trim evicted.*tokens_before=(\d+) tokens_after=(\d+) budget=(\d+)/);
    if (mTrim) trims.push({ line: i, tokensBefore: Number(mTrim[1]), tokensAfter: Number(mTrim[2]), budget: Number(mTrim[3]) });
  });

  if (!localStarts.length) return { status: 'NOT_VERIFIED', reason: 'no local-model chat turn found in the current log — nothing to check yet' };

  const results = localStarts.map(({ line, model }) => {
    // A completed turn is expected to log something in the next ~200 lines indicating
    // a final answer or at minimum a clean generation span close; a hang shows the
    // log falling straight back to steady-state jsonrpc polling with nothing about
    // this thread in between.
    const window = lines.slice(line, line + 200).join('\n');
    const sawFurtherActivity = /Generation\|llm\.|final|response_id|answer/i.test(window.split('\n').slice(1).join('\n'));
    const oversizedTrim = trims.find((t) => t.line >= line && t.line < line + 50 && t.tokensBefore > (4096 * CONTEXT_OVERFLOW_RATIO_WARN));
    return { model, sawFurtherActivity, oversizedTrimTokens: oversizedTrim ? oversizedTrim.tokensBefore : null };
  });

  const anyHung = results.some((r) => r.oversizedTrimTokens);
  return {
    status: anyHung ? 'FAIL' : 'NOT_VERIFIED',
    reason: anyHung ? 'at least one local-model turn sent a prompt far exceeding a plausible small-model context window (likely tool-catalog injection) — matches the known hang signature' : 'no oversized-prompt signature found in the current log for a local-model turn; does not by itself prove chat works, just that this specific failure mode was not observed',
    turns: results,
  };
}

async function run() {
  const ollama = await checkOllamaServer();
  const modelDirect = ollama.status === 'PASS' && ollama.models.length
    ? await checkModelDirect(ollama.models[0])
    : { status: 'SKIPPED', reason: 'no ollama models to test' };
  const localConfig = await checkOpenHumanLocalModelConfig(ollama.models || []);
  const ordinaryChatLocal = checkOrdinaryChatLocal();

  const report = {
    test: 'OPENHUMAN_LOCAL_CHAT_E2E',
    generatedAt: new Date().toISOString(),
    ollamaServer: ollama.status,
    modelDirect: modelDirect.status,
    openhumanLocalModelConfig: localConfig.status,
    openhumanOrdinaryChatLocal: ordinaryChatLocal.status,
    detail: { ollama, modelDirect, localConfig, ordinaryChatLocal },
    note: "PASS on the first three does NOT imply openhumanOrdinaryChatLocal PASS. A prior 'Local Model Debug: all checks passed' result covered only checks 1-3 and was wrongly read as proof ordinary chat works — it never tested a real agentic turn under the actual tool catalog.",
  };
  fs.writeFileSync(path.join(__dirname, '..', 'OPENHUMAN_LOCAL_CHAT_E2E.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  run().then((r) => {
    console.log(`[OPENHUMAN_LOCAL_CHAT_E2E] ollama=${r.ollamaServer} modelDirect=${r.modelDirect} config=${r.openhumanLocalModelConfig} ordinaryChatLocal=${r.openhumanOrdinaryChatLocal}`);
  }).catch((e) => { console.error('[OPENHUMAN_LOCAL_CHAT_E2E]', e.message); process.exitCode = 1; });
}

module.exports = { run };
