#!/usr/bin/env node
'use strict';
// MCP_DIAGNOSTIC_MINIMAL
//
// A hand-rolled, single-tool MCP stdio server used ONLY for the matrix-test
// localizing the AnythingLLM<->Ollama tool-calling defect (see
// error-prevention-registry.json#anythingllm-ollama-tool-calling-fixed-timeout-
// signature). One tool, one required string argument, one short synchronous
// operation - as minimal as a real MCP tool can be, to test whether the defect
// is schema-complexity-specific (the real filesystem server has 14 tools with
// large descriptions) or general to any MCP tool attachment at all.
//
// The tool "echo_upper" takes {text: string} and returns it uppercased -
// trivial, deterministic, no filesystem access, nothing to get wrong except
// the tool-calling plumbing itself.
const readline = require('readline');

const TOOLS = [{
  name: 'echo_upper',
  description: 'Echo the given text back in uppercase.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'The text to uppercase' } },
    required: ['text'],
  },
}];

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  let response;
  if (msg.method === 'initialize') {
    response = { jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-11-25', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mcp-diagnostic-minimal', version: '1.0.0' } } };
  } else if (msg.method === 'notifications/initialized') {
    return; // no response expected for notifications
  } else if (msg.method === 'tools/list') {
    response = { jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } };
  } else if (msg.method === 'tools/call') {
    const args = msg.params && msg.params.arguments || {};
    if (msg.params.name !== 'echo_upper') {
      response = { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `unknown tool: ${msg.params.name}` } };
    } else {
      response = { jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: String(args.text || '').toUpperCase() }] } };
    }
  } else {
    response = { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } };
  }
  process.stdout.write(JSON.stringify(response) + '\n');
});
