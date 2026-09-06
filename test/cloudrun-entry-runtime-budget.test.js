'use strict';
// Regression test for the runtimeBudget() fix in
// google-ai-studio/cloudrun-entry.cjs: the container's real memory pressure
// comes from the spawned `server.js` child, not the thin wrapper process
// itself. Before this fix, /api/runtime-budget only ever reported the
// wrapper's own (always-tiny) RSS, so it would stay "ok" while the child
// alone approached the container's memory limit — a silent OOM blindspot.
//
// This spawns the real wrapper (as test/google-ai-studio-slots.test.js
// already does for the fault-injection check) and hits the real endpoint
// over HTTP, rather than unit-testing an extracted function, because the
// bug was specifically about which process gets measured — that only shows
// up with a real child process actually running.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ENTRY = path.join(__dirname, '..', 'google-ai-studio', 'cloudrun-entry.cjs');
const EXTERNAL_PORT = 19137;
const INTERNAL_PORT = 19138;

function getJson(port, pathname, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
        catch (e) { reject(e); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request timeout')));
    req.once('error', reject);
  });
}

async function waitForServer(port, deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await getJson(port, '/api/runtime-budget'); }
    catch (e) { lastError = e; await new Promise((r) => setTimeout(r, 200)); }
  }
  throw lastError || new Error('server never became reachable');
}

test('/api/runtime-budget reports the spawned child process, not just the wrapper', async (t) => {
  const child = spawn(process.execPath, [ENTRY], {
    env: {
      ...process.env,
      WORLD_SLOT: 'sandbox',
      PORT: String(EXTERNAL_PORT),
      WORLD_INTERNAL_PORT: String(INTERNAL_PORT),
      WORLD_CHILD_READY_TIMEOUT_MS: '500'
    },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  t.after(async () => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      await new Promise(resolve => killer.once('exit', resolve));
    } else child.kill('SIGTERM');
  });

  const { status, json } = await waitForServer(EXTERNAL_PORT);
  assert.equal(status, json.ok ? 200 : 503);

  // Shape: the fix must expose wrapper vs. child RSS separately, plus a
  // total that a real budget check can act on — not just one opaque number.
  assert.equal(typeof json.wrapperRssMb, 'number');
  assert.equal(typeof json.rssMb, 'number');
  assert.ok('childRssMb' in json);
  assert.ok(['proc', 'unavailable'].includes(json.childMemorySource));

  if (json.childMemorySource === 'proc') {
    assert.equal(json.measurementComplete, true);
    // Linux (real Cloud Run containers): the child's own node process is
    // resident at more than a token few KB, and the reported total must
    // actually include it, not just equal the wrapper's own RSS.
    assert.ok(json.childRssMb > 0);
    assert.equal(json.rssMb, json.wrapperRssMb + json.childRssMb);
    assert.ok(json.rssMb > json.wrapperRssMb, 'total must be strictly greater than the wrapper alone once a child is measured');
  } else {
    // Non-Linux dev machine (no /proc): must degrade honestly to null, not
    // silently pretend the child uses 0MB.
    assert.equal(json.childRssMb, null);
    assert.equal(json.rssMb, json.wrapperRssMb);
    assert.equal(json.measurementComplete, false);
    assert.equal(json.ok, false, 'unknown child memory cannot certify the budget');
  }
});
