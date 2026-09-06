'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ANYTHINGLLM_API_KEY is captured into a module-level const at require() time -
// must be set before requiring, not inside a test body, or the "not set" guard
// throws regardless of what a test does afterward. A dummy value is safe here:
// the concurrency test below returns via the lease-busy path before any code
// that would actually need a valid key runs.
if (!process.env.ANYTHINGLLM_API_KEY) process.env.ANYTHINGLLM_API_KEY = 'test-dummy-key';

// WORLD_SERVER_QUEUE_DB (the job DATABASE FILE) is set to an isolated temp path
// before requiring, same pattern as test/ai-resource-scheduler-queue.test.js -
// a real bug was found and fixed here: this test's lease-busy path calls the
// REAL enqueueTask(), which without this isolation wrote a job for a fake
// "test-concurrency-<pid>-<timestamp>" workspace slug into the SHARED
// PRODUCTION queue, which a later drain attempt then genuinely tried to
// dispatch and failed on (setWorkspaceModel HTTP 400 - the workspace doesn't
// exist). WORLD_SERVER_MAIN_TREE is deliberately NOT redirected - only the
// database file needs isolating, not the durable-job-queue.cjs SCRIPT path
// (ai-resource-scheduler.js resolves the script from WORLD_SERVER_MAIN_TREE
// but the actual job data file from WORLD_SERVER_QUEUE_DB independently) or
// the collective-brain lease root (LEASE_ROOT below still uses the real main
// tree, scoped to a test-unique workspace slug so it cannot collide with a
// real concurrent dispatch's "anythingllm-workspace-world" lease).
if (!process.env.WORLD_SERVER_QUEUE_DB) {
  process.env.WORLD_SERVER_QUEUE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'router-test-queue-')), 'jobs.sqlite');
}

const { looksLikeMismatch, prefixedToolName, MCP_SERVER_NAME, runTask } = require('../scripts/anythingllm-task-router.cjs');
const collectiveBrain = require('../lib/collective-brain');
const TEST_WORKSPACE_SLUG = `test-concurrency-${process.pid}-${Date.now()}`;
const LEASE_ROOT = 'C:\\Users\\user\\Desktop\\World_server';
const LEASE_SCOPE = `anythingllm-workspace-${TEST_WORKSPACE_SLUG}`;

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

test('concurrency protection: runTask queues instead of racing when another dispatch already holds this workspace\'s lease', async () => {
  const owner = `test-holder:${process.pid}`;
  const acquired = collectiveBrain.acquireLease(LEASE_ROOT, LEASE_SCOPE, { ttlMs: 30000, owner });
  assert.equal(acquired.ok, true, 'test setup: could not acquire the simulated concurrent lease');
  try {
    const r = await runTask('read package.json', { threadSlug: 'thread-does-not-matter-here', workspaceSlug: TEST_WORKSPACE_SLUG });
    assert.equal(r.result, 'QUEUED');
    assert.match(r.resourceGate.reason, /already in use by another dispatch/);
  } finally {
    collectiveBrain.releaseLease(LEASE_ROOT, LEASE_SCOPE, owner);
  }
});

// Live-proven 2026-09-03: AnythingLLM's MCPHypervisor cannot register any MCP
// server in this installed instance (systemic, config-content-independent,
// survives a full restart - see error-prevention-registry.json#anythingllm-
// mcphypervisor-cannot-register-any-mcp-server). Agentic/tool-calling
// capability classes now dispatch directly to Ollama (lib/direct-ollama-mcp-
// transport.js) instead of requiring AnythingLLM at all - proven here by a
// real filesystem-read task reaching the (still-shared, unchanged) lease/
// resource-gate/queue path without ANYTHINGLLM_API_KEY set, which the OLD
// unconditional check would have rejected before ever reaching that logic.
test('a filesystem task no longer requires ANYTHINGLLM_API_KEY or threadSlug - it uses the direct-Ollama transport, not AnythingLLM', async () => {
  const savedKey = process.env.ANYTHINGLLM_API_KEY;
  delete process.env.ANYTHINGLLM_API_KEY;
  const owner = `test-holder-direct:${process.pid}`;
  const scope = `anythingllm-workspace-${TEST_WORKSPACE_SLUG}-direct`;
  const acquired = collectiveBrain.acquireLease(LEASE_ROOT, scope, { ttlMs: 30000, owner });
  assert.equal(acquired.ok, true, 'test setup: could not acquire the simulated concurrent lease');
  try {
    // No threadSlug passed at all - the old code path threw synchronously
    // before ever reaching the lease check if this were missing.
    const r = await runTask('read package.json', { workspaceSlug: `${TEST_WORKSPACE_SLUG}-direct` });
    assert.equal(r.result, 'QUEUED', 'expected the shared lease/queue mechanism to still gate this dispatch, unchanged');
  } finally {
    collectiveBrain.releaseLease(LEASE_ROOT, scope, owner);
    if (savedKey !== undefined) process.env.ANYTHINGLLM_API_KEY = savedKey;
  }
});

test('a plain/unknown-capability task still requires threadSlug and ANYTHINGLLM_API_KEY - it stays on the AnythingLLM transport', async () => {
  const savedKey = process.env.ANYTHINGLLM_API_KEY;
  delete process.env.ANYTHINGLLM_API_KEY;
  try {
    await assert.rejects(() => runTask('hello, how are you today', { workspaceSlug: 'world' }), /ANYTHINGLLM_API_KEY not set in env|requires opts.threadSlug/);
  } finally {
    if (savedKey !== undefined) process.env.ANYTHINGLLM_API_KEY = savedKey;
  }
});

test('concurrency protection: an expired (stale) lease is reclaimed, not treated as still-busy', () => {
  // The router is a thin wrapper around lib/collective-brain#acquireLease,
  // which already has its own dedicated "stale lease is reclaimed" test - this
  // just confirms the SAME scope/root the router actually uses behaves the
  // same way, without invoking a real (slow, network-dependent) runTask call.
  const leaseDir = path.join(LEASE_ROOT, 'data', 'collective-brain', 'runtime', 'locks');
  fs.mkdirSync(leaseDir, { recursive: true });
  const staleScope = `${LEASE_SCOPE}-stale`;
  const staleFile = path.join(leaseDir, `${staleScope.replace(/[^a-z0-9_.-]/ig, '_')}.json`);
  fs.writeFileSync(staleFile, JSON.stringify({ scope: staleScope, owner: 'dead-process', pid: 999999, acquiredAt: '2000-01-01T00:00:00.000Z', expiresAt: '2000-01-01T00:00:01.000Z' }));
  const r = collectiveBrain.acquireLease(LEASE_ROOT, staleScope, { ttlMs: 30000, owner: 'new-owner' });
  assert.equal(r.ok, true);
  collectiveBrain.releaseLease(LEASE_ROOT, staleScope, 'new-owner');
});
