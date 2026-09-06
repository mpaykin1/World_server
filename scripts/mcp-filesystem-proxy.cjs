#!/usr/bin/env node
'use strict';
// MCP_FILESYSTEM_PROXY
//
// Sits between AnythingLLM's MCPHypervisor and the official
// @modelcontextprotocol/server-filesystem, filtering tools/list and tools/call
// against a profile file written by scripts/anythingllm-task-router.cjs. This is
// the hard, structural half of the intent -> capability class -> minimal
// allowlist -> LLM pipeline: whatever this proxy advertises is the ONLY thing a
// small model can pick from among our filesystem tools (AnythingLLM's own
// built-in skills like document-summarizer are attached separately by
// AnythingLLM itself and are outside this proxy's control - see
// scripts/anythingllm-task-router.cjs for the mitigation there).
//
// Usage: node mcp-filesystem-proxy.cjs <sandboxRoot> [profilePath]
// MCP stdio transport is newline-delimited JSON-RPC (no embedded newlines per
// message) - see modelcontextprotocol.io's stdio transport spec.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { recordToolOutcome } = require('../lib/tool-cost-model');

const sandboxRoot = process.argv[2];
if (!sandboxRoot) {
  process.stderr.write('mcp-filesystem-proxy: missing <sandboxRoot> argument\n');
  process.exit(1);
}
const profilePath = process.argv[3] || path.join(__dirname, '..', 'data', 'mcp-router-profile.json');
const FAILSAFE_ALLOWLIST = ['list_directory', 'search_files', 'read_file', 'read_text_file'];
// Tracks in-flight tools/call requests by id so the matching response can be
// timed and recorded into lib/tool-cost-model.js's ledger - real latency/
// success/error history for the router's cost-aware tool ordering, not just
// the static seed priors.
const pendingCalls = new Map();

function currentAllowlist() {
  try {
    const j = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    if (Array.isArray(j.allowedTools)) return new Set(j.allowedTools);
  } catch { /* fall through to failsafe */ }
  return new Set(FAILSAFE_ALLOWLIST);
}

// Real bug found live: with shell:true, Node hands the args array to cmd.exe
// as a plain space-joined string - it does NOT quote each element for you
// (unlike shell:false, where argv boundaries are preserved exactly). A
// sandboxRoot containing a space (this project's own path, "...\World_server
// AI\World_server_anythingllm_sandbox") silently split into two separate
// cmd.exe tokens, so @modelcontextprotocol/server-filesystem never received
// the real directory and fell back to something derived from cwd instead
// ("Cannot access directory ...\World_server_openhuman2\AI\World_server_
// anythingllm_sandbox, skipping") - the MCP server then had no real allowed
// directory, which is why AnythingLLM's MCPHypervisor reported 0 servers
// started even though the config file itself was correct. Same class of bug
// as the npm.cmd/shell quoting fix in 1c01fa76 elsewhere in this project.
function shellQuote(arg) {
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}
const child = spawn('npx', ['-y', '@modelcontextprotocol/server-filesystem', shellQuote(sandboxRoot)], {
  stdio: ['pipe', 'pipe', 'inherit'],
  shell: true,
});

const rlIn = readline.createInterface({ input: process.stdin, terminal: false });
rlIn.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { child.stdin.write(line + '\n'); return; }
  if (msg.method === 'tools/call') {
    const allowed = currentAllowlist();
    const name = msg.params && msg.params.name;
    if (!allowed.has(name)) {
      const err = {
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `capability_mismatch: tool '${name}' is not in the current router profile (allowed: ${[...allowed].join(', ') || 'none'})` },
      };
      process.stdout.write(JSON.stringify(err) + '\n');
      return;
    }
    pendingCalls.set(msg.id, { name, startedAt: Date.now() });
  }
  child.stdin.write(line + '\n');
});

const rlOut = readline.createInterface({ input: child.stdout, terminal: false });
rlOut.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { process.stdout.write(line + '\n'); return; }
  if (msg.result && Array.isArray(msg.result.tools)) {
    const allowed = currentAllowlist();
    msg.result.tools = msg.result.tools.filter((t) => allowed.has(t.name));
  }
  if (pendingCalls.has(msg.id)) {
    const { name, startedAt } = pendingCalls.get(msg.id);
    pendingCalls.delete(msg.id);
    const latencyMs = Date.now() - startedAt;
    const outcome = msg.error ? 'error' : (msg.result && msg.result.isError) ? 'error' : 'success';
    const costOpts = { latencyMs };
    if (process.env.TOOL_COST_LEDGER_PATH) costOpts.ledgerPath = process.env.TOOL_COST_LEDGER_PATH;
    try { recordToolOutcome(name, outcome, costOpts); } catch { /* cost-model recording must never break the actual tool response */ }
  }
  process.stdout.write(JSON.stringify(msg) + '\n');
});

child.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
