'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { looksLikeMismatch, prefixedToolName, MCP_SERVER_NAME } = require('../scripts/anythingllm-task-router.cjs');

test('an empty final response is treated as a mismatch, not a silent pass', () => {
  // Real regression: thread fffd7db4 returned ok:true, mismatchDetected:false with
  // textResponse:"" after AgentSkillMaxToolCalls was exhausted - absence of a bad
  // pattern is not presence of a good answer.
  assert.equal(looksLikeMismatch('', [], ['read_text_file']), true);
  assert.equal(looksLikeMismatch('   ', [], ['read_text_file']), true);
  assert.equal(looksLikeMismatch(undefined, [], ['read_text_file']), true);
});

test('a real, substantive answer is not flagged as a mismatch', () => {
  assert.equal(looksLikeMismatch('The name field is "webgl-survival-hub-no-npm" and there are 330 scripts.', [], ['read_text_file']), false);
});

test('a known bad-text pattern is flagged even with non-empty content', () => {
  assert.equal(looksLikeMismatch('The requested action cannot be performed with the available tools.', [], ['read_text_file']), true);
});

test('a thought mentioning document-summarizer outside the allowlist is flagged', () => {
  assert.equal(looksLikeMismatch('some answer text here', ['@agent is executing `document-summarizer` tool'], ['read_text_file']), true);
});

test('document-summarizer in thoughts is NOT flagged if it is actually in the allowlist (defensive - should never happen given PROFILES, but the check should be scoped correctly)', () => {
  assert.equal(looksLikeMismatch('some answer text here', ['used document-summarizer'], ['document-summarizer']), false);
});

test('prefixedToolName prepends the MCP server name AnythingLLM actually registers tools under', () => {
  // Root cause, found via live A/B testing: identical request, identical tool
  // schema, identical everything except this - WITHOUT a tool-name hint in the
  // message, the model correctly called "world-server-sandbox-read_text_file"
  // (hasToolCalls:true). WITH the router's OWN hint naming the short/unprefixed
  // "read_text_file" (a name that does not exist in the tool list AnythingLLM
  // actually exposes), the model produced empty content and zero tool_calls
  // (hasToolCalls:false) - reproduced against raw Ollama, bypassing AnythingLLM
  // and the think-proxy entirely. See error-prevention-registry.json#
  // anythingllm-router-hint-tool-name-mismatch.
  assert.equal(prefixedToolName('read_text_file'), 'world-server-sandbox-read_text_file');
  assert.equal(prefixedToolName('list_directory'), `${MCP_SERVER_NAME}-list_directory`);
});

test('regression guard: the tool-name hint sent to the model never uses a raw/unprefixed allowlist name', () => {
  // Static source check rather than a live-API test (which would need a running
  // AnythingLLM+Ollama and cost real wall-clock time) - fails loudly if a future
  // edit reintroduces `allowedTools.join(...)` or a bare `${singleTool}` without
  // routing it through prefixedToolName first.
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'anythingllm-task-router.cjs'), 'utf8');
  assert.doesNotMatch(src, /allowedTools\.join\(/, 'tool hint must map allowedTools through prefixedToolName before joining, not join raw names directly');
  assert.match(src, /allowedTools\.map\(prefixedToolName\)\.join\(/, 'the multi-tool hint must map through prefixedToolName');
  assert.match(src, /const singleTool = prefixedToolName\(/, 'the single-tool escalation hint must wrap its tool name in prefixedToolName');
});
