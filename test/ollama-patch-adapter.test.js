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

// --- buildPatchPrompt: point 3 this cycle - a compact, patch-first prompt
// for the common single-file case, since a generic multi-file
// disambiguation preamble is pure prompt-eval cost with no benefit when
// there's only one valid path anyway. ---

test('buildPatchPrompt: single-file prompt hard-codes the only valid path and drops the multi-file framing/rules text', () => {
  const p = adapter.buildPatchPrompt('do the thing', [{ path: 'a.txt', content: 'hello world' }]);
  assert.ok(p.includes('"path":"a.txt"'), 'the single valid path should be hard-coded into the schema example');
  assert.ok(p.includes('hello world'));
  assert.ok(!p.includes('You are a precise code-editing assistant'), 'the generic multi-file framing sentence should be dropped for the single-file case');
  assert.ok(!p.includes('MUST be exactly one of the file paths listed below'), 'multi-file path-disambiguation rule text is unnecessary with only one file');
});

test('buildPatchPrompt: single-file prompt is meaningfully shorter than the equivalent multi-file-style prompt would be', () => {
  const file = { path: 'a.txt', content: 'hello world' };
  const compact = adapter.buildPatchPrompt('do the thing', [file]);
  const multi = adapter.buildPatchPrompt('do the thing', [file, { path: 'b.txt', content: 'other' }]);
  // not a strict per-file comparison (multi has 2 files' content) - just
  // confirms the compact single-file template isn't secretly the same
  // verbose preamble with one file slotted in.
  assert.ok(compact.length < multi.length);
  assert.ok(!compact.includes('---')); // the multi-file block separator should not appear at all
});

test('buildPatchPrompt: multi-file prompt still includes real path-disambiguation rules and every file block', () => {
  const p = adapter.buildPatchPrompt('do the thing', [{ path: 'a.txt', content: 'AAA' }, { path: 'b.txt', content: 'BBB' }]);
  assert.ok(p.includes('FILE PATH: a.txt'));
  assert.ok(p.includes('FILE PATH: b.txt'));
  assert.ok(p.includes('MUST be exactly one of the file paths listed below'));
});

// --- buildRepairPrompt / invokeOllamaRepair: point 6 this cycle - a
// cheap repair attempt after a verifier failure, reusing the previous
// edit + the real error instead of re-sending the whole original task. ---

test('buildRepairPrompt: includes the previous edit, the real verifier error, and the CURRENT file content - never the original task text', () => {
  const p = adapter.buildRepairPrompt(
    [{ path: 'a.js', find: 'x', replace: 'y' }],
    'TypeError: y is not defined',
    [{ path: 'a.js', content: 'const y = something();' }]
  );
  assert.ok(p.includes('TypeError: y is not defined'));
  assert.ok(p.includes('"find":"x"'));
  assert.ok(p.includes('const y = something();'));
});

test('invokeOllamaRepair: refuses cleanly when none of the given paths exist on disk (no_scope, not a crash)', async () => {
  const wt = tmpWorktree();
  try {
    const r = await adapter.invokeOllamaRepair('any-model', [{ path: 'a.js', find: 'x', replace: 'y' }], 'some error', wt, ['does-not-exist.js']);
    assert.equal(r.ok, false);
    assert.equal(r.classification, 'no_scope');
  } finally { fs.rmSync(wt, { recursive: true, force: true }); }
});

// --- estimateTimeoutMs: point 4 this cycle - a dynamic per-call budget
// derived from real prompt size and (once enough exist) real historical
// tokens/sec, instead of one flat number for every attempt. ---

test('estimateTimeoutMs: a small (ultra-scoped) prompt gets a meaningfully smaller estimate than a large one', () => {
  const small = adapter.estimateTimeoutMs(1500); // roughly one ULTRA_SCOPED_SNIPPET_BYTES-sized prompt
  const large = adapter.estimateTimeoutMs(15000); // roughly a full large file
  assert.ok(small < large, `expected small=${small} < large=${large}`);
});

test('estimateTimeoutMs: never returns below a sane floor even for a near-empty prompt', () => {
  assert.ok(adapter.estimateTimeoutMs(10) >= 20000);
});

test('estimateTimeoutMs: real historical rates (≥3 samples) override the fallback constant', () => {
  const fallback = adapter.estimateTimeoutMs(3500);
  // a real history showing a MUCH faster measured rate than the 12 tok/s
  // fallback should produce a meaningfully smaller estimate for the same prompt size
  const fastHistory = [
    { promptEvalCount: 1000, promptEvalDurationMs: 10000 }, // 100 tok/s
    { promptEvalCount: 1200, promptEvalDurationMs: 12000 },
    { promptEvalCount: 900, promptEvalDurationMs: 9000 },
  ];
  const withFastHistory = adapter.estimateTimeoutMs(3500, { history: fastHistory });
  assert.ok(withFastHistory < fallback, `expected history-informed estimate (${withFastHistory}) < fallback (${fallback})`);
});

test('estimateTimeoutMs: fewer than 3 historical samples still uses the fallback rate, not an unreliable tiny sample', () => {
  const fallback = adapter.estimateTimeoutMs(3500);
  const tooFewSamples = adapter.estimateTimeoutMs(3500, { history: [{ promptEvalCount: 5000, promptEvalDurationMs: 1000 }] });
  assert.equal(tooFewSamples, fallback);
});

// --- callOllama streaming/stall-detection: point 4 this cycle, and the
// real bug found while building it (see the long comment on callOllama
// itself). Uses a real local HTTP mock server, not the actual Ollama
// service, so this is deterministic and runs in CI - the mock speaks the
// same NDJSON streaming shape /api/generate uses, with a controllable
// delay pattern. OLLAMA_URL is read once as a module-level const at
// require time, so each test here isolates its own fresh module instance
// pointed at the mock via the require-cache-clear + re-require pattern
// below, rather than mutating the shared module other tests in this file
// depend on. ---

function withMockOllamaServer(handler) {
  const http = require('node:http');
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
    server.on('error', reject);
  });
}

function freshAdapterAgainst(mockUrl) {
  const modPath = require.resolve('../lib/ollama-patch-adapter');
  delete require.cache[modPath];
  const prevUrl = process.env.OLLAMA_URL;
  process.env.OLLAMA_URL = mockUrl;
  const fresh = require('../lib/ollama-patch-adapter');
  if (prevUrl === undefined) delete process.env.OLLAMA_URL; else process.env.OLLAMA_URL = prevUrl;
  delete require.cache[modPath]; // don't leave the mock-pointed module cached for other tests in this file
  return fresh;
}

function ndjson(obj) { return JSON.stringify(obj) + '\n'; }

test('callOllama: does NOT abort during a long silent prefill phase (the exact real bug found this cycle) - only the stall-clock, which starts at the first chunk, can trigger an early abort', async () => {
  const mock = await withMockOllamaServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    // Real observed shape: 154s of total silence during prefill, then
    // generation. Simulated here as a real ~600ms silent gap before the
    // first chunk - short enough to keep this test fast, but exercised
    // through the exact same "no chunk yet -> stall-clock not running"
    // code path a genuinely long real prefill would hit.
    setTimeout(() => {
      res.write(ndjson({ response: 'HEA', done: false }));
      setTimeout(() => {
        res.write(ndjson({ response: 'LTHY', done: true, eval_count: 2, prompt_eval_count: 5, prompt_eval_duration: 1e8, eval_duration: 5e7, load_duration: 1e7 }));
        res.end();
      }, 50);
    }, 600);
  });
  try {
    const adapter = freshAdapterAgainst(mock.url);
    // stallMs shorter than the silent prefill gap - if the stall-clock
    // incorrectly ran during prefill, this would abort at 300ms into the
    // 600ms silent gap and fail. It must not.
    const r = await adapter.callOllama('mock-model', 'irrelevant prompt', { timeoutMs: 5000, stallMs: 300 });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.text, 'HEALTHY');
    assert.equal(r.resolvedVia, 'stream-complete');
  } finally { await mock.close(); }
});

test('callOllama: DOES abort as a real stall once generation has genuinely started and then goes silent', async () => {
  const mock = await withMockOllamaServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write(ndjson({ response: 'partial', done: false }));
    // never sends another chunk and never closes the response - a real stall after real output.
  });
  try {
    const adapter = freshAdapterAgainst(mock.url);
    const start = Date.now();
    const r = await adapter.callOllama('mock-model', 'irrelevant prompt', { timeoutMs: 30000, stallMs: 500 });
    const elapsedMs = Date.now() - start;
    assert.equal(r.ok, false);
    assert.equal(r.resolvedVia, 'stalled');
    assert.equal(r.timedOut, true);
    assert.ok(elapsedMs < 5000, `a real post-generation stall should be caught quickly via stallMs, not wait for the full 30000ms timeoutMs (took ${elapsedMs}ms)`);
  } finally { await mock.close(); }
});

test('callOllama: the outer maxTotalMs cap still applies during a real, never-ending silent prefill (never truly unbounded)', async () => {
  const mock = await withMockOllamaServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    // never writes anything and never closes - simulates prefill that never finishes
  });
  try {
    const adapter = freshAdapterAgainst(mock.url);
    const start = Date.now();
    const r = await adapter.callOllama('mock-model', 'irrelevant prompt', { timeoutMs: 500, stallMs: 100000 });
    const elapsedMs = Date.now() - start;
    assert.equal(r.ok, false);
    assert.equal(r.resolvedVia, 'max-total-exceeded');
    assert.ok(r.error.includes('still in prefill'));
    assert.ok(elapsedMs < 3000, `the outer timeoutMs cap must still bound a call with no stall-clock running (took ${elapsedMs}ms)`);
  } finally { await mock.close(); }
});

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
