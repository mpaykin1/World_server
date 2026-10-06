'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextualToolCall } = require('../lib/direct-ollama-mcp-transport');

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
