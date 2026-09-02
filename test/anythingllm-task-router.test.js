'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeMismatch } = require('../scripts/anythingllm-task-router.cjs');

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
