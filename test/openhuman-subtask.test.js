'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const http = require('http');

// ANYTHINGLLM_URL/ANYTHINGLLM_API_KEY are captured into module-level consts at
// require() time (same pattern as test/anythingllm-task-router.test.js) -
// createThread() below needs a real (local, fake) server to hit, set up
// before require so the module points at it.
const fakeServerRequests = [];
const fakeAnythingLLM = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    fakeServerRequests.push({ url: req.url, method: req.method, body });
    if (req.url.endsWith('/thread/new')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ thread: { id: 1, name: 'test', slug: 'fake-thread-slug-123' }, message: null }));
      return;
    }
    if (req.url.endsWith('/thread/fail-new')) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
});
const fakePort = 34567;
const fakeServer = fakeAnythingLLM.listen(fakePort);
process.env.ANYTHINGLLM_URL = `http://127.0.0.1:${fakePort}`;
process.env.ANYTHINGLLM_API_KEY = 'test-dummy-key';

const { buildReportEntry, appendReport, createThread } = require('../scripts/openhuman-subtask.cjs');

test.after(() => { fakeServer.close(); });

function tmpLog() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'subtask-report-')), 'reports.jsonl'); }

test('buildReportEntry uses the SAME schema fields other AI agents already write to state/ai-agent-reports.jsonl', () => {
  const entry = buildReportEntry({ result: 'PASS', model: 'qwen2.5:3b-instruct' }, 'filesystem-read', { callerAgent: 'claude-orchestrator' });
  for (const field of ['at', 'agent', 'task_id', 'status', 'progress', 'branch', 'worktree', 'commit', 'pr', 'tests', 'blockers', 'merge_safe', 'next_action', 'findings', 'reusable_improvements']) {
    assert.ok(field in entry, `missing field: ${field}`);
  }
  assert.equal(entry.agent, 'openhuman-anythingllm');
  assert.equal(entry.status, 'done');
  assert.equal(entry.progress, 100);
  assert.deepEqual(entry.blockers, []);
});

test('a QUEUED result is reported as status=queued with a deferred_by_resource_gate blocker, not a failure', () => {
  const entry = buildReportEntry({ result: 'QUEUED', resourceGate: { reason: 'cpu=95% over 70%' } }, 'filesystem-read', {});
  assert.equal(entry.status, 'queued');
  assert.equal(entry.blockers[0].status, 'deferred_by_resource_gate');
  assert.match(entry.blockers[0].reason, /cpu=95%/);
});

test('a FAIL result is reported as status=failed with a needs_review blocker carrying the real reason', () => {
  const entry = buildReportEntry({ result: 'FAIL', attempts: [{ reason: 'error_fetch failed' }] }, 'filesystem-read', {});
  assert.equal(entry.status, 'failed');
  assert.equal(entry.blockers[0].status, 'needs_review');
  assert.equal(entry.blockers[0].reason, 'error_fetch failed');
});

test('appendReport actually writes a real, parseable JSONL line', () => {
  const logPath = tmpLog();
  const entry = buildReportEntry({ result: 'PASS' }, 'filesystem-read', {});
  const ok = appendReport(entry, logPath);
  assert.equal(ok, true);
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.agent, 'openhuman-anythingllm');
});

test('appendReport fails gracefully (returns false, does not throw) if the log path is unwritable', () => {
  // A path with a null byte is invalid on every platform - a controlled way to
  // force a write failure without relying on OS-specific permission setup.
  const ok = appendReport({ x: 1 }, 'C:\\this\\path\\has\\a\\null\x00byte\\reports.jsonl');
  assert.equal(ok, false);
});

// Real gap found live this session: every manual validation dispatch first had
// to POST .../thread/new and pull the real server-generated slug out of the
// response before runTask() would accept it (a caller-supplied thread name is
// NOT the real slug AnythingLLM assigns - passing the name directly produced
// an immediate http_404). createThread() is the fix; these tests confirm it
// returns the real generated slug, not the requested name.
test('createThread returns the real server-generated slug, not the requested name', async () => {
  const slug = await createThread('world', 'my-requested-name');
  assert.equal(slug, 'fake-thread-slug-123');
  const req = fakeServerRequests.find((r) => r.url.endsWith('/thread/new'));
  assert.ok(req, 'expected a POST to .../thread/new');
  assert.equal(JSON.parse(req.body).name, 'my-requested-name');
});

test('createThread throws when AnythingLLM returns a non-2xx status for thread creation', async () => {
  const origFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500 });
  try {
    await assert.rejects(() => createThread('world', 'x'), /createThread failed: HTTP 500/);
  } finally {
    global.fetch = origFetch;
  }
});

test('createThread throws when the response has no thread.slug', async () => {
  const origFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ thread: {} }) });
  try {
    await assert.rejects(() => createThread('world', 'x'), /no thread\.slug/);
  } finally {
    global.fetch = origFetch;
  }
});
