'use strict';
// DIRECT_OLLAMA_MCP_TRANSPORT
//
// Real, live-proven finding (2026-09-03): AnythingLLM Desktop's MCPHypervisor
// cannot register ANY MCP server in this installed instance - reproduced
// systemically (a completely standard @modelcontextprotocol/server-everything
// reference config fails identically to our own real one), independent of
// config content, and survives a full app restart with a fresh singleton.
// The same AnythingLLM version (1.16.1) DID work earlier this exact session
// (a real live validation read package.json through it) - something about
// this machine's subsequent restart/reinitialize broke it in a way that
// isn't fixable through configuration or code on this project's side.
//
// Per the standing architecture guidance ("don't keep AnythingLLM mandatory
// in the critical path if its agent/tool pipeline is proven to break correct
// MCP tool calling - route around the defective layer while keeping the
// useful parts"), this module IS the MCP client directly for agentic/tool
// tasks, talking to the same already-fixed, already-tested
// scripts/mcp-filesystem-proxy.cjs, using Ollama's OWN native tool-calling
// API instead of AnythingLLM's prompt-based @agent + tool-name-hint
// mechanism. This also eliminates the entire class of bug behind
// error-prevention-registry.json#anythingllm-router-hint-tool-name-mismatch:
// the tools passed to Ollama ARE exactly what it is allowed to call, so there
// is no separate hint text that could drift out of sync with the real
// registered names.
//
// AnythingLLM itself is NOT abandoned - scripts/anythingllm-task-router.cjs
// still uses it for the 'unknown' (plain, non-agentic) capability class,
// where it already works and its selective-context/token economy is a real
// benefit. Only the agentic/tool-calling path (proven broken) is bypassed.
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const PROXY_SCRIPT = path.join(__dirname, '..', 'scripts', 'mcp-filesystem-proxy.cjs');
// Was 'C:\Users\user\Desktop\World_server AI\World_server_anythingllm_sandbox'
// - that whole folder was deliberately deleted during the 2026-09-06 Desktop
// Zero-Chaos consolidation (see AGENTS.md sec 19.2: no World_server-named
// item may live on Desktop outside the 3 permanently allowed ones), which
// left this default pointing at a directory that no longer exists - the
// proxy's own "Cannot access directory, skipping" -> "None of the specified
// directories are accessible" failure surfaced this live. Off-Desktop by
// design now (matches WORKTREES_ROOT's convention in
// scripts/master-coordinator.cjs), and created eagerly so a caller that
// never overrides opts.sandboxRoot still gets a real, accessible directory
// rather than a silent proxy-startup failure.
const SANDBOX_ROOT = process.env.WORLD_SERVER_SANDBOX_ROOT || path.join(os.homedir(), 'AppData', 'Local', 'World_server_ai_sandbox');
try { fs.mkdirSync(SANDBOX_ROOT, { recursive: true }); } catch { /* best-effort - a real per-call sandboxRoot override still works even if this fails */ }
const PROFILE_PATH = process.env.MCP_ROUTER_PROFILE_PATH || path.join(__dirname, '..', 'data', 'mcp-router-profile.json');
const MAX_TOOL_ITERATIONS = 4;

// fetch()'s global dispatcher (undici) carries a default headersTimeout/
// bodyTimeout of 300000ms (5 min) - the exact same trap AnythingLLM's own
// code had to work around (see error-prevention-registry.json#anythingllm-
// ollama-response-timeout-not-configured). The `undici` package is not
// installed in this project and Node does not expose it as a requireable
// builtin in this version, so rather than depending on it just to construct
// a custom dispatcher, this uses plain http.request directly - full control
// over the socket timeout with no hidden default and no extra dependency.
const http = require('http');

function ollamaChat(model, messages, tools, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, tools, stream: false, options: { num_ctx: 16384 } });
    const url = new URL('/api/chat', OLLAMA_URL);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`ollama_http_${res.statusCode}: ${data.slice(0, 300)}`));
            return;
          }
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`ollama_bad_json: ${e.message}`)); }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); const e = new Error('ollama chat request timed out'); e.name = 'TimeoutError'; reject(e); });
    req.on('error', (e) => reject(e));
    req.write(body);
    req.end();
  });
}

function mcpToolsToOllamaTools(mcpTools, allowedSet) {
  return mcpTools
    .filter((t) => allowedSet.has(t.name))
    .map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
}

// Talks stdio JSON-RPC to a fresh mcp-filesystem-proxy.cjs child for the
// lifetime of one turn - initialize, tools/list, any tools/call the model
// requests, then closed. Newline-delimited JSON-RPC per modelcontextprotocol
// .io's stdio transport spec.
function withMcpProxy(fn, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PROXY_SCRIPT, opts.sandboxRoot || SANDBOX_ROOT, opts.profilePath || PROFILE_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = readline.createInterface({ input: child.stdout, terminal: false });
    const pending = new Map();
    let nextId = 1;
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    function call(method, params) {
      const id = nextId++;
      return new Promise((res) => {
        pending.set(id, res);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    }
    rl.on('line', (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    });
    let settled = false;
    const startupTimer = setTimeout(() => {
      if (!settled) { settled = true; child.kill(); reject(new Error(`mcp proxy startup timed out - stderr: ${stderr.slice(0, 500)}`)); }
    }, 20000);
    child.on('error', (e) => { if (!settled) { settled = true; clearTimeout(startupTimer); reject(e); } });

    call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'world-server-direct-dispatch', version: '1.0.0' } })
      .then(() => { clearTimeout(startupTimer); return fn(call); })
      .then((r) => { if (!settled) { settled = true; child.kill(); resolve(r); } })
      .catch((e) => { if (!settled) { settled = true; child.kill(); reject(e); } });
  });
}

// runAgenticTurn(): the actual replacement for AnythingLLM's @agent chat -
// runs a bounded tool-calling loop against Ollama's native API and returns a
// shape compatible with scripts/anythingllm-task-router.cjs's own attempt
// object (textResponse/toolCallsMade/promptTokens/completionTokens/
// totalTokens/durationSeconds), so the router only needs to swap which
// function it calls, not change how it interprets the result.
async function runAgenticTurn(taskText, { model, allowedTools, timeoutMs, systemPrompt, mcpOpts }) {
  if (!Array.isArray(allowedTools) || allowedTools.length === 0) throw new Error('unsupported_capability: no MCP tool provider for this task');
  if (typeof model !== 'string' || !model.trim()) throw new Error('model_not_selected: no configured model selected for this task');
  const allowedSet = new Set(allowedTools);
  return withMcpProxy(async (call) => {
    const toolsListRes = await call('tools/list', {});
    const mcpTools = (toolsListRes.result && toolsListRes.result.tools) || [];
    const ollamaTools = mcpToolsToOllamaTools(mcpTools, allowedSet);

    const messages = [
      { role: 'system', content: systemPrompt || 'You are a precise assistant with access to filesystem tools. Use exactly one tool call to answer the user, then give a concise final answer based on its real result. Do not fabricate file contents.' },
      { role: 'user', content: taskText },
    ];

    const toolCallsMade = [];
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const chatRes = await ollamaChat(model, messages, ollamaTools, timeoutMs);
      const msg = chatRes.message || {};
      if (msg.tool_calls && msg.tool_calls.length) {
        messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          const name = tc.function.name;
          const args = tc.function.arguments || {};
          toolCallsMade.push({ name, args });
          if (!allowedSet.has(name)) {
            messages.push({ role: 'tool', content: `Error: tool '${name}' is not allowed for this task.` });
            continue;
          }
          const callRes = await call('tools/call', { name, arguments: args });
          const content = callRes.error
            ? `Error: ${callRes.error.message}`
            : (callRes.result && callRes.result.content && callRes.result.content[0] && callRes.result.content[0].text) || JSON.stringify(callRes.result);
          messages.push({ role: 'tool', content: String(content).slice(0, 8000) });
        }
        continue; // loop again so the model can produce a final answer from the tool result
      }
      return {
        textResponse: msg.content || '',
        toolCallsMade,
        promptTokens: chatRes.prompt_eval_count,
        completionTokens: chatRes.eval_count,
        totalTokens: (chatRes.prompt_eval_count || 0) + (chatRes.eval_count || 0),
        durationSeconds: (chatRes.total_duration || 0) / 1e9,
      };
    }
    return { textResponse: '', toolCallsMade, totalTokens: 0, iterationLimitExceeded: true };
  }, mcpOpts);
}

module.exports = { runAgenticTurn, mcpToolsToOllamaTools, ollamaChat, withMcpProxy };
