'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const guard = require('../lib/agent-session-guard');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

test('policy requires every current and future agent to inherit session hygiene', () => {
  const p = guard.loadPolicy();
  assert.equal(p.requiredForEveryAgent, true);
  assert.equal(p.inheritForFutureAgents, true);
  assert.ok(!/[\\/]Desktop[\\/]/i.test(p.worktreesRoot));
  assert.ok(!/[\\/]Desktop[\\/]/i.test(p.scratchRoot));
});

test('desktop audit flags only known AI clutter patterns and leaves canonical/user items alone', () => {
  const desktop = tempDir('fake-desktop');
  fs.mkdirSync(path.join(desktop, 'World_server'));
  fs.mkdirSync(path.join(desktop, 'World_server_backup'));
  fs.writeFileSync(path.join(desktop, 'family-photo.jpg'), 'user data');
  const r = guard.auditDesktop(desktop);
  assert.equal(r.ok, false);
  assert.equal(r.violations.length, 1);
  assert.match(r.violations[0], /World_server_backup$/);
  assert.ok(fs.existsSync(path.join(desktop, 'family-photo.jpg')));
});

test('scratch cleanup deletes only expired files with owned prefixes', () => {
  const scratchRoot = tempDir('agent-scratch');
  const oldOwned = path.join(scratchRoot, 'agent-old.txt');
  const freshOwned = path.join(scratchRoot, 'health-probe-fresh.txt');
  const userFile = path.join(scratchRoot, 'notes.txt');
  fs.writeFileSync(oldOwned, 'old');
  fs.writeFileSync(freshOwned, 'fresh');
  fs.writeFileSync(userFile, 'keep');
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  fs.utimesSync(oldOwned, old, old);
  const r = guard.cleanupOwnedScratch({ scratchRoot, scratchTtlHours: 24 });
  assert.equal(fs.existsSync(oldOwned), false);
  assert.equal(fs.existsSync(freshOwned), true);
  assert.equal(fs.existsSync(userFile), true);
  assert.equal(r.removed.length, 1);
});

test('coverage is inherited automatically by an arbitrary future agent id', () => {
  const matrix = guard.coverageFor(['codex', 'future-agent-v99']);
  const future = matrix.find((x) => x.agentId === 'future-agent-v99');
  assert.deepEqual(future, { agentId: 'future-agent-v99', preflight: true, postflight: true, inherited: true });
});

test('snapshotResources reports live CPU load and flags high CPU against the policy ceiling', () => {
  const p = guard.loadPolicy();
  const low = guard.snapshotResources(p, { resources: { cpuLoadPercent: 30 } });
  assert.equal(low.cpuLoadPercent, 30);
  assert.equal(low.cpuHigh, false);
  const high = guard.snapshotResources(p, { resources: { cpuLoadPercent: 95 } });
  assert.equal(high.cpuHigh, true);
  assert.equal(high.cpuLimit, p.cpuLoadPercentMax);
});

test('preflight defers heavy local work on CPU high or RAM warning without hard-blocking ok', () => {
  const idle = { cpuLoadPercent: 20, freeRamPercent: 60 };
  assert.equal(guard.preflight('local-agent', { localHeavy: true, processCensus: false, resources: idle }).throttle, false);
  const ramWarn = guard.preflight('local-agent', { localHeavy: true, processCensus: false, resources: { cpuLoadPercent: 20, freeRamPercent: 20 } });
  assert.equal(ramWarn.throttle, true, 'RAM below warnFreeRamPercent must defer heavy local AI work');
  assert.equal(ramWarn.ok, true, 'RAM pressure defers; it must not hard-block non-heavy work');
  const cpuHigh = guard.preflight('local-agent', { localHeavy: true, processCensus: false, resources: { cpuLoadPercent: 95, freeRamPercent: 60 } });
  assert.equal(cpuHigh.throttle, true, 'CPU at/above cpuLoadPercentMax must defer heavy local AI work');
  assert.equal(cpuHigh.ok, true);
  const light = guard.preflight('local-agent', { localHeavy: false, processCensus: false, resources: { cpuLoadPercent: 95, freeRamPercent: 20 } });
  assert.equal(light.throttle, false, 'non-heavy work is never throttled by CPU/RAM pressure');
  assert.equal(light.ok, true);
});

test('classifyProcessCensus marks self/owned/agent-like/unknown and flags duplicates read-only', () => {
  const summary = guard.classifyProcessCensus([
    { pid: 100, name: 'node.exe' },
    { pid: 200, name: 'node.exe' },
    { pid: 300, name: 'python.exe' },
    { pid: 400, name: 'python.exe' },
    { pid: 600, name: 'python.exe' },
    { pid: 700, name: 'node.exe' },
    { pid: 500, name: 'explorer.exe' },
  ], { currentPid: 100, ownedPids: [200], maxConcurrentAgentProcesses: 2 });
  assert.equal(summary.total, 7);
  assert.equal(summary.self, 1);
  assert.equal(summary.owned, 1);
  assert.equal(summary.agentLike, 4);
  assert.equal(summary.unknown, 1);
  assert.deepEqual(summary.concurrentCandidates.map((c) => c.pid).sort((a, b) => a - b), [600, 700], 'agent-like processes beyond the concurrency floor are reported as duplicate candidates');
  assert.equal(summary.concurrentCandidates.some((c) => c.pid === 100 || c.pid === 200), false, 'self/owned processes are never duplicate candidates');
});

test('process census appears in preflight/postflight when enabled and is absent when disabled', () => {
  const idle = { cpuLoadPercent: 10, freeRamPercent: 60 };
  const disabled = guard.preflight('probe', { processCensus: false, resources: idle });
  assert.deepEqual(disabled.processes, { enabled: false, summary: null, rawCount: 0 });
  const pre = guard.preflight('probe', { resources: idle });
  assert.equal(pre.processes.enabled, true);
  assert.equal(typeof pre.processes.summary.total, 'number');
  assert.equal(typeof pre.processes.summary.agentLike, 'number');
  const post = guard.postflight('probe', { resources: idle });
  assert.equal(post.processes.enabled, true);
  assert.equal(typeof post.processes.summary.total, 'number');
});
