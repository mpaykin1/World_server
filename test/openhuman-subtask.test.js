'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const http = require('http');
const { DatabaseSync } = require('node:sqlite');

// Establish isolation before imports capture queue, report and lease paths.
const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'world-server-openhuman-test-'));
const stateEnvironment = ['WORLD_SERVER_MAIN_TREE', 'WORLD_SERVER_QUEUE_DB', 'AI_AGENT_REPORTS_PATH'];
const savedStateEnvironment = Object.fromEntries(stateEnvironment.map((key) => [key, process.env[key]]));
process.env.WORLD_SERVER_MAIN_TREE = isolatedRoot;
process.env.WORLD_SERVER_QUEUE_DB = path.join(isolatedRoot, '.world-server-state', 'system-jobs.sqlite');
process.env.AI_AGENT_REPORTS_PATH = path.join(isolatedRoot, 'state', 'ai-agent-reports.jsonl');

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

const { runSubtask, buildReportEntry, appendReport, createThread, REPORT_LOG_PATH } = require('../scripts/openhuman-subtask.cjs');
const collectiveBrain = require('../lib/collective-brain');
const { resolveMainTreeRoot } = require('../lib/world-server-paths');

const { QUEUE_DB, MAIN_TREE_ROOT } = require('../lib/ai-resource-scheduler');

test.after(() => {
  fakeServer.close();
  assert.equal(path.dirname(isolatedRoot), path.resolve(os.tmpdir()));
  assert.ok(path.basename(isolatedRoot).startsWith('world-server-openhuman-test-'));
  try {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  } finally {
    for (const key of stateEnvironment) {
      if (savedStateEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = savedStateEnvironment[key];
    }
  }
});

test('queue, reports and leases use private state captured before module imports', () => {
  assert.equal(MAIN_TREE_ROOT, isolatedRoot);
  assert.equal(resolveMainTreeRoot(), isolatedRoot);
  assert.equal(QUEUE_DB, path.join(isolatedRoot, '.world-server-state', 'system-jobs.sqlite'));
  assert.equal(REPORT_LOG_PATH, path.join(isolatedRoot, 'state', 'ai-agent-reports.jsonl'));
});

function tmpLog() { return path.join(fs.mkdtempSync(path.join(isolatedRoot, 'subtask-report-')), 'reports.jsonl'); }

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

// Real gap found live 2026-09-03: runSubtask() unconditionally required an
// AnythingLLM thread (and therefore ANYTHINGLLM_API_KEY) before dispatching
// ANY task - but agentic/tool-calling capability classes now bypass
// AnythingLLM entirely via lib/direct-ollama-mcp-transport.js (see error-
// prevention-registry.json#anythingllm-mcphypervisor-cannot-register-any-mcp-
// server). A real end-to-end OpenHuman call for a filesystem-read task threw
// "createThread failed: HTTP 403" simply because no API key was set, even
// though the actual dispatch path never needed one. Fixed: thread
// auto-creation only runs for capabilityClass 'unknown' or an explicit
// opts.transport:'anythingllm'.
test('runSubtask does not attempt AnythingLLM thread creation for a filesystem task, even with no ANYTHINGLLM_API_KEY set', async () => {
  const savedKey = process.env.ANYTHINGLLM_API_KEY;
  delete process.env.ANYTHINGLLM_API_KEY;
  const workspaceSlug = `subtask-test-direct-${process.pid}`;
  const leaseRoot = resolveMainTreeRoot();
  const leaseScope = `anythingllm-workspace-${workspaceSlug}`;
  const owner = `test-holder:${process.pid}`;
  const acquired = collectiveBrain.acquireLease(leaseRoot, leaseScope, { ttlMs: 30000, owner });
  assert.equal(acquired.ok, true, 'test setup: could not acquire the simulated concurrent lease');
  const requestCountBefore = fakeServerRequests.length;
  const reportDir = fs.mkdtempSync(path.join(isolatedRoot, 'subtask-direct-report-'));
  const reportLogPath = path.join(reportDir, 'reports.jsonl');
  const marker = 'openhuman-isolated-test-' + process.pid + '-' + Date.now();
  try {
    const r = await runSubtask('read package.json', { workspaceSlug, reportLogPath, callerAgent: marker });
    assert.equal(r.result, 'QUEUED', 'expected the shared lease/queue mechanism to gate this, not an AnythingLLM auth error');
    const queueDb = new DatabaseSync(QUEUE_DB, { readOnly: true });
    try {
      const job = queueDb.prepare('SELECT status FROM jobs WHERE id=?').get(r.queueJobId);
      assert.equal(job.status, 'queued', 'the real deferred job must exist in the private queue');
      assert.equal(Number(queueDb.prepare('SELECT count(*) AS n FROM jobs').get().n), 1);
    } finally {
      queueDb.close();
    }
    assert.equal(fakeServerRequests.length, requestCountBefore, 'no request should have been sent to AnythingLLM for a filesystem task');
    assert.equal(r.reportWritten, true);
    assert.equal(r.reportedToSharedPipeline, false);
    const reportLines = fs.readFileSync(reportLogPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    assert.equal(reportLines.length, 1, 'this isolated test should write exactly one JSONL report entry');
    const report = JSON.parse(reportLines[0]);
    assert.equal(report.status, 'queued');
    assert.equal(report.findings.capabilityClass, 'filesystem-read');
    assert.equal(report.findings.requestedBy, marker);
    const production = fs.existsSync(REPORT_LOG_PATH) ? fs.readFileSync(REPORT_LOG_PATH, 'utf8') : '';
    assert.equal(production.includes(marker), false, 'isolated test marker must never reach the production report log');
  } finally {
    collectiveBrain.releaseLease(leaseRoot, leaseScope, owner);
    fs.rmSync(reportDir, { recursive: true, force: true });
    if (savedKey !== undefined) process.env.ANYTHINGLLM_API_KEY = savedKey;
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
