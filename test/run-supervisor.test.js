'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { supervise, parseCli, stopOwned } = require('../scripts/run-supervisor.cjs');

function tempRuntime(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-server-run-supervisor-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('parse command after separator', () => {
  const options = parseCli([
    '--run-id', 'x',
    '--timeout-ms', '500',
    '--kill-grace-ms', '100',
    '--', 'node', 'demo.js',
  ]);
  assert.equal(options.runId, 'x');
  assert.equal(options.command, 'node');
  assert.equal(options.killGraceMs, 100);
  assert.deepEqual(options.args, ['demo.js']);
});

test('stopOwned can target only the child object it receives', () => {
  const signals = [];
  const child = {
    exitCode: null,
    kill(signal) {
      signals.push(signal);
      return true;
    },
  };
  assert.equal(stopOwned(child), true);
  assert.deepEqual(signals, ['SIGTERM']);
  child.exitCode = 0;
  assert.equal(stopOwned(child, 'SIGKILL'), false);
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(stopOwned(null), false);
});

test('bounded successful process passes and writes durable evidence', async (t) => {
  const runtimeDir = tempRuntime(t);
  const result = await supervise(
    process.execPath,
    ['-e', 'console.log("heartbeat")'],
    {
      runId: 'test-pass',
      timeoutMs: 2000,
      stallMs: 1000,
      heartbeatPattern: 'heartbeat',
      runtimeDir,
    },
  );
  assert.equal(result.state, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.ok(fs.existsSync(path.join(runtimeDir, 'test-pass', 'status.json')));
  assert.match(
    fs.readFileSync(path.join(runtimeDir, 'test-pass', 'stdout.log'), 'utf8'),
    /heartbeat/,
  );
});

test('silent owned child becomes STALLED inside the bounded budget', async (t) => {
  const runtimeDir = tempRuntime(t);
  const started = Date.now();
  const result = await supervise(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    {
      runId: 'test-stall',
      timeoutMs: 3000,
      stallMs: 350,
      killGraceMs: 150,
      heartbeatPattern: 'heartbeat',
      runtimeDir,
    },
  );
  assert.equal(result.state, 'STALLED');
  assert.ok(Date.now() - started < 2500);
  assert.ok(result.checkpointPath);
  assert.notEqual(result.stopFailed, true);
});

test('hard timeout wins despite heartbeats', async (t) => {
  const runtimeDir = tempRuntime(t);
  const result = await supervise(
    process.execPath,
    ['-e', 'setInterval(()=>console.log("tick"),50)'],
    {
      runId: 'test-timeout',
      timeoutMs: 500,
      stallMs: 300,
      killGraceMs: 150,
      heartbeatPattern: 'tick',
      runtimeDir,
    },
  );
  assert.equal(result.state, 'TIMEOUT');
  assert.notEqual(result.stopFailed, true);
});

test('supervisor sources contain no captured Desktop Commander output', () => {
  const files = [
    path.join(__dirname, '../scripts/run-supervisor.cjs'),
    __filename,
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /^\[Reading \d+ lines/m);
    assert.doesNotMatch(source, /^\[executed on device:/m);
  }
});