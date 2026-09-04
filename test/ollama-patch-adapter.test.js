'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const adapter = require('../lib/ollama-patch-adapter');

function tmpWorktree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollama-patch-test-'));
  return dir;
}

// --- extractJson: robust against real local-model output quirks ---

test('extractJson: plain JSON object', () => {
  const r = adapter.extractJson('{"edits":[],"newFiles":[]}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.parsed, { edits: [], newFiles: [] });
});

test('extractJson: markdown-fenced JSON (common local-model habit)', () => {
  const r = adapter.extractJson('```json\n{"edits":[],"newFiles":[]}\n```');
  assert.equal(r.ok, true);
  assert.deepEqual(r.parsed.edits, []);
});

test('extractJson: strips a qwen3-style <think>...</think> preamble', () => {
  const r = adapter.extractJson('<think>let me consider the file...</think>\n{"edits":[{"path":"a.txt","find":"x","replace":"y"}],"newFiles":[]}');
  assert.equal(r.ok, true);
  assert.equal(r.parsed.edits[0].path, 'a.txt');
});

test('extractJson: no JSON object present at all is a clean failure, not a crash', () => {
  const r = adapter.extractJson('I cannot help with that request.');
  assert.equal(r.ok, false);
});

// --- validateSchema ---

test('validateSchema: rejects a non-object', () => {
  assert.equal(adapter.validateSchema(null).ok, false);
  assert.equal(adapter.validateSchema('a string').ok, false);
});

test('validateSchema: rejects an edit with empty find (would match everywhere / be ambiguous)', () => {
  const r = adapter.validateSchema({ edits: [{ path: 'a.txt', find: '', replace: 'y' }] });
  assert.equal(r.ok, false);
});

test('validateSchema: rejects too many edits', () => {
  const edits = Array.from({ length: adapter.MAX_EDITS + 1 }, (_, i) => ({ path: `f${i}.txt`, find: 'x', replace: 'y' }));
  const r = adapter.validateSchema({ edits });
  assert.equal(r.ok, false);
  assert.match(r.error, /too many edits/);
});

test('validateSchema: rejects a replace payload over the size limit', () => {
  const r = adapter.validateSchema({ edits: [{ path: 'a.txt', find: 'x', replace: 'y'.repeat(adapter.MAX_REPLACE_BYTES + 1) }] });
  assert.equal(r.ok, false);
});

// --- isBlockedPath: defense in depth against secret/binary targets ---

test('isBlockedPath: blocks common secret file types', () => {
  for (const p of ['.env', 'secrets/.env', 'certs/server.pem', 'keys/id.key']) {
    assert.ok(adapter.isBlockedPath(p), `expected ${p} to be blocked`);
  }
});

test('isBlockedPath: blocks binary/media extensions', () => {
  for (const p of ['logo.png', 'sound.mp3', 'archive.zip', 'lib.dll']) {
    assert.ok(adapter.isBlockedPath(p), `expected ${p} to be blocked`);
  }
});

test('isBlockedPath: blocks paths under node_modules/.git regardless of extension', () => {
  assert.ok(adapter.isBlockedPath('node_modules/foo/index.js'));
  assert.ok(adapter.isBlockedPath('.git/config'));
});

test('isBlockedPath: allows ordinary source files', () => {
  for (const p of ['apps/chat/index.html', 'lib/agent-adapters.js', 'data/quality-baseline.json']) {
    assert.equal(adapter.isBlockedPath(p), null);
  }
});

// --- resolveWithinWorktree: the actual path-traversal defense ---

test('resolveWithinWorktree: rejects absolute paths', () => {
  const wt = tmpWorktree();
  try { assert.equal(adapter.resolveWithinWorktree(wt, 'C:/Windows/System32/evil.dll'), null); }
  finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('resolveWithinWorktree: rejects ../ escapes', () => {
  const wt = tmpWorktree();
  try {
    const escaped = adapter.resolveWithinWorktree(wt, '../../etc/passwd');
    assert.equal(escaped, null);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('resolveWithinWorktree: accepts a real path inside the worktree', () => {
  const wt = tmpWorktree();
  try {
    const resolved = adapter.resolveWithinWorktree(wt, 'apps/chat/index.html');
    assert.ok(resolved && resolved.startsWith(path.resolve(wt)));
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

// --- validatePatch: the full pipeline, real files on disk ---

function setupWorktreeWithFile(relPath, content) {
  const wt = tmpWorktree();
  const abs = path.join(wt, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return wt;
}

test('validatePatch: accepts a real edit whose find matches exactly once', () => {
  const wt = setupWorktreeWithFile('a.txt', 'hello world');
  try {
    const r = adapter.validatePatch({ edits: [{ path: 'a.txt', find: 'world', replace: 'there' }] }, { targetWorktree: wt, allowedPaths: ['a.txt'] });
    assert.equal(r.ok, true);
    assert.equal(r.edits.length, 1);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('validatePatch: rejects an edit whose find text does not exist in the real file (stale/hallucinated content)', () => {
  const wt = setupWorktreeWithFile('a.txt', 'hello world');
  try {
    const r = adapter.validatePatch({ edits: [{ path: 'a.txt', find: 'goodbye', replace: 'x' }] }, { targetWorktree: wt, allowedPaths: ['a.txt'] });
    assert.equal(r.ok, false);
    assert.equal(r.retriable, true);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('validatePatch: rejects an ambiguous edit whose find text matches more than once', () => {
  const wt = setupWorktreeWithFile('a.txt', 'foo foo foo');
  try {
    const r = adapter.validatePatch({ edits: [{ path: 'a.txt', find: 'foo', replace: 'bar' }] }, { targetWorktree: wt, allowedPaths: ['a.txt'] });
    assert.equal(r.ok, false);
    assert.match(r.error, /matches 3 times/);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('validatePatch: rejects an edit targeting a file outside the scoped/allowed set (this cycle\'s target-file-relevance requirement)', () => {
  const wt = setupWorktreeWithFile('a.txt', 'hello world');
  fs.writeFileSync(path.join(wt, 'b.txt'), 'other content', 'utf8');
  try {
    const r = adapter.validatePatch({ edits: [{ path: 'b.txt', find: 'other', replace: 'x' }] }, { targetWorktree: wt, allowedPaths: ['a.txt'] });
    assert.equal(r.ok, false);
    assert.match(r.error, /outside the scoped file set/);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('validatePatch: rejects a path-traversal attempt even if the model tries to smuggle it into the allowed set', () => {
  const wt = setupWorktreeWithFile('a.txt', 'hello world');
  try {
    const r = adapter.validatePatch(
      { edits: [{ path: '../../outside.txt', find: 'x', replace: 'y' }] },
      { targetWorktree: wt, allowedPaths: ['../../outside.txt'] } // even a misconfigured caller can't bypass this
    );
    assert.equal(r.ok, false);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('validatePatch: rejects an edit targeting a blocked extension even if somehow allowlisted', () => {
  const wt = setupWorktreeWithFile('secret.env', 'API_KEY=xyz');
  try {
    const r = adapter.validatePatch({ edits: [{ path: 'secret.env', find: 'xyz', replace: 'abc' }] }, { targetWorktree: wt, allowedPaths: ['secret.env'] });
    assert.equal(r.ok, false);
    assert.match(r.error, /blocked/);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('validatePatch: rejects a newFile that already exists (must use an edit instead)', () => {
  const wt = setupWorktreeWithFile('a.txt', 'hello');
  try {
    const r = adapter.validatePatch({ edits: [], newFiles: [{ path: 'a.txt', content: 'overwrite' }] }, { targetWorktree: wt, allowedPaths: ['a.txt'] });
    assert.equal(r.ok, false);
    assert.match(r.error, /already exists/);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('validatePatch: rejects zero edits and zero new files as a no-op, marked retriable', () => {
  const wt = setupWorktreeWithFile('a.txt', 'hello');
  try {
    const r = adapter.validatePatch({ edits: [], newFiles: [] }, { targetWorktree: wt, allowedPaths: ['a.txt'] });
    assert.equal(r.ok, false);
    assert.equal(r.noOp, true);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('validatePatch: enforces the total-bytes-changed patch size limit across multiple individually-small edits', () => {
  // each edit alone stays under MAX_REPLACE_BYTES so only the aggregate
  // MAX_TOTAL_BYTES_CHANGED limit is what should trip here
  const perEditBytes = Math.floor(adapter.MAX_REPLACE_BYTES * 0.9); // <MAX_REPLACE_BYTES alone, but x3 > MAX_TOTAL_BYTES_CHANGED
  const wt = tmpWorktree();
  const names = ['a.txt', 'b.txt', 'c.txt'];
  for (const n of names) fs.writeFileSync(path.join(wt, n), 'x', 'utf8');
  try {
    const r = adapter.validatePatch(
      { edits: names.map((n) => ({ path: n, find: 'x', replace: 'y'.repeat(perEditBytes) })) },
      { targetWorktree: wt, allowedPaths: names }
    );
    assert.equal(r.ok, false);
    assert.match(r.error, /patch size limit/);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

// --- applyPatch + syntaxCheckFile: real writes, real syntax gate ---

test('applyPatch: writes real edits and creates real new files', () => {
  const wt = setupWorktreeWithFile('a.txt', 'hello world');
  try {
    const validated = adapter.validatePatch(
      { edits: [{ path: 'a.txt', find: 'world', replace: 'there' }], newFiles: [{ path: 'sub/new.txt', content: 'fresh' }] },
      { targetWorktree: wt, allowedPaths: ['a.txt'] }
    );
    assert.equal(validated.ok, true);
    const applied = adapter.applyPatch(validated);
    assert.equal(fs.readFileSync(path.join(wt, 'a.txt'), 'utf8'), 'hello there');
    assert.equal(fs.readFileSync(path.join(wt, 'sub/new.txt'), 'utf8'), 'fresh');
    assert.equal(applied.syntaxOk, true);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('applyPatch: catches a real syntax error introduced by the edit (JSON)', () => {
  const wt = setupWorktreeWithFile('a.json', '{"a":1}');
  try {
    const validated = adapter.validatePatch(
      { edits: [{ path: 'a.json', find: '{"a":1}', replace: '{"a":1' }] }, // missing closing brace
      { targetWorktree: wt, allowedPaths: ['a.json'] }
    );
    assert.equal(validated.ok, true);
    const applied = adapter.applyPatch(validated);
    assert.equal(applied.syntaxOk, false);
    assert.equal(applied.syntaxFailures.length, 1);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('applyPatch: catches a real syntax error introduced by the edit (JS)', () => {
  const wt = setupWorktreeWithFile('a.js', 'function f(){ return 1; }');
  try {
    const validated = adapter.validatePatch(
      { edits: [{ path: 'a.js', find: 'return 1; }', replace: 'return 1;' }] }, // unbalanced brace
      { targetWorktree: wt, allowedPaths: ['a.js'] }
    );
    assert.equal(validated.ok, true);
    const applied = adapter.applyPatch(validated);
    assert.equal(applied.syntaxOk, false);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

// --- invokeOllamaPatch: the orchestration function's own input guard ---

test('invokeOllamaPatch: refuses to run with an empty scoped file list rather than letting the model explore', async () => {
  const wt = tmpWorktree();
  try {
    const r = await adapter.invokeOllamaPatch('any-model', 'do something', wt, []);
    assert.equal(r.ok, false);
    assert.equal(r.classification, 'no_scope');
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

// --- Prompt injection resistance: goal/file content cannot smuggle
// path-escaping or extra instructions past the schema+path validators,
// even if the MODEL is tricked by injected text into trying. ---

// --- Live E2E: the real local model, a real isolated worktree, a real
// verified edit. Opt-in only (same pattern as agent-adapters.test.js's own
// live OpenCode test) - not run by default even when Ollama is reachable,
// since it takes ~1-3 real minutes on this project's CPU-only dev hardware
// (see OLLAMA_MODEL_BENCHMARK.json) and a CI runner has no local Ollama
// installation to exercise anyway. ---
test('invokeOllamaPatch: a real local model performs a real, schema-valid, verified edit in an isolated worktree (opt-in: set AGENT_ADAPTERS_LIVE_OLLAMA_TEST=1)', async (t) => {
  if (process.env.AGENT_ADAPTERS_LIVE_OLLAMA_TEST !== '1') return t.skip('opt-in only - set AGENT_ADAPTERS_LIVE_OLLAMA_TEST=1 to run this against the real Ollama API');
  const agentAdapters = require('../lib/agent-adapters');
  if (!(await agentAdapters.ollamaAvailable())) return t.skip('Ollama not reachable on this host');
  const wt = tmpWorktree();
  try {
    const relPath = 'probe.html';
    fs.writeFileSync(path.join(wt, relPath), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>hi</body></html>\n', 'utf8');
    const r = await adapter.invokeOllamaPatch(
      adapter.DEFAULT_PATCH_MODEL,
      'Add viewport-fit=cover to the content attribute of the existing <meta name="viewport"> tag.',
      wt, [relPath], { timeoutMs: 150000 }
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const content = fs.readFileSync(path.join(wt, relPath), 'utf8');
    assert.match(content, /viewport-fit=cover/);
    assert.equal(r.costUsd, 0);
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

test('security: even if model output claims a path outside the allowlist due to injected content, validatePatch still rejects it', () => {
  const wt = setupWorktreeWithFile('a.txt', 'hello world');
  try {
    // simulates a model that was prompt-injected via file content into
    // "helpfully" also editing an unrelated file
    const injectedResponse = {
      edits: [
        { path: 'a.txt', find: 'world', replace: 'there' },
        { path: '../../../etc/passwd', find: 'root', replace: 'pwned' },
      ],
    };
    const r = adapter.validatePatch(injectedResponse, { targetWorktree: wt, allowedPaths: ['a.txt'] });
    assert.equal(r.ok, false, 'the whole patch must be rejected, not partially applied');
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});
