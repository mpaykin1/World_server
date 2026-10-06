'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextualToolCall, normalizeSandboxToolArgs } = require('../lib/direct-ollama-mcp-transport');

test('strict textual Ollama tool JSON is converted only for an allowed tool', () => {
  const allowed = new Set(['read_text_file']);
  const call = parseTextualToolCall('{"name":"read_text_file","arguments":{"path":"package.json"}}', allowed);
  assert.equal(call.function.name, 'read_text_file');
  assert.deepEqual(call.function.arguments, { path: 'package.json' });
});

test('textual tool fallback rejects disallowed, malformed, and prose-wrapped calls', () => {
  const allowed = new Set(['read_text_file']);
  assert.equal(parseTextualToolCall('{"name":"write_file","arguments":{"path":"x"}}', allowed), null);
  assert.equal(parseTextualToolCall('not json', allowed), null);
  assert.equal(parseTextualToolCall('please call {"name":"read_text_file","arguments":{"path":"x"}}', allowed), null);
});

test('textual tool fallback accepts an exact json fence but still enforces the allowlist', () => {
  const allowed = new Set(['read_text_file']);
  const fence = String.fromCharCode(96).repeat(3);
  const call = parseTextualToolCall(fence + 'json\n{"name":"read_text_file","arguments":{"path":"package.json"}}\n' + fence, allowed);
  assert.equal(call.function.name, 'read_text_file');
  assert.equal(parseTextualToolCall(fence + 'json\n{"name":"write_file","arguments":{"path":"x"}}\n' + fence, allowed), null);
});

test('sandbox path normalizer strips one nonexistent leading workspace alias only when the stripped target exists', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ollama-sandbox-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  assert.deepEqual(normalizeSandboxToolArgs({ path: 'World_server/package.json' }, root), { path: 'package.json' });
  assert.deepEqual(normalizeSandboxToolArgs({ path: 'missing/package.json' }, root), { path: 'package.json' });
  assert.deepEqual(normalizeSandboxToolArgs({ path: '../outside.txt' }, root), { path: '../outside.txt' });
});
