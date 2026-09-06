#!/usr/bin/env node
'use strict';
// COLLECTIVE_BRAIN_REMOTE_BRIDGE_WATCHDOG
//
// No process-supervision system exists elsewhere in this repo (confirmed
// before writing this - no watchdog/supervisor/scheduler script anywhere),
// so this fills a real gap rather than duplicating one. It supervises
// scripts/collective-brain-remote-bridge.cjs --watch: spawns it detached,
// tracks it via a PID file, and restarts it if it dies or stops reporting
// through its own status snapshot - with a bounded restart count per
// rolling window (crash-loop circuit breaker) so a persistently broken
// worker degrades loudly (action:"circuit-open") instead of restart-looping
// forever and hiding a real problem.
//
// Modes:
//   (no flag)      one-shot ensure-running check - safe to call from
//                  server.js autostart or a scheduled task.
//   --watch        runs its own supervision loop (polls every
//                  REMOTE_BRIDGE_WATCHDOG_INTERVAL_MS, default 30s).
//   --healthcheck  read-only status report, takes no action.
//   --restart      deliberate restart (stop then start), bypasses the
//                  crash-loop breaker since it's an explicit request, not
//                  an automatic retry. This is what restart_known_worker
//                  in the remote-task bridge calls.
//   --stop         stops the worker if running.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const collectiveBrain = require('../lib/collective-brain');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(ROOT, 'data', 'collective-brain', 'runtime');
const PID_FILE = path.join(RUNTIME_DIR, 'remote-bridge.pid');
const STATUS_FILE = path.join(RUNTIME_DIR, 'remote-bridge-status.json');
const CRASH_LOG = path.join(RUNTIME_DIR, 'remote-bridge-crashes.jsonl');
const WORKER_SCRIPT = path.join(ROOT, 'scripts', 'collective-brain-remote-bridge.cjs');

const MAX_RESTARTS = Number(process.env.REMOTE_BRIDGE_MAX_RESTARTS || 5);
const RESTART_WINDOW_MS = Number(process.env.REMOTE_BRIDGE_RESTART_WINDOW_MS || 10 * 60 * 1000);
const CHECK_INTERVAL_MS = Number(process.env.REMOTE_BRIDGE_WATCHDOG_INTERVAL_MS || 30000);
const STALE_STATUS_MS = Number(process.env.REMOTE_BRIDGE_STALE_STATUS_MS || 5 * 60 * 1000);

function log(level, msg, extra = {}) {
  try { console.log(JSON.stringify({ level, msg, at: new Date().toISOString(), component: 'collective-brain-remote-bridge-watchdog', ...extra })); } catch { /* logging must never crash the watchdog */ }
}

function readPidFile() {
  try { return JSON.parse(fs.readFileSync(PID_FILE, 'utf8')); } catch { return null; }
}
function writePidFile(info) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, JSON.stringify(info, null, 2) + '\n');
}
function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return null; }
}
function recordCrash(reason) {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.appendFileSync(CRASH_LOG, JSON.stringify({ at: new Date().toISOString(), reason }) + '\n');
  } catch { /* best effort */ }
}
function recentRestartCount() {
  try {
    const lines = fs.readFileSync(CRASH_LOG, 'utf8').split(/\r?\n/).filter(Boolean);
    const cutoff = Date.now() - RESTART_WINDOW_MS;
    return lines
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e && Date.parse(e.at) >= cutoff).length;
  } catch { return 0; }
}

function spawnWorker() {
  const child = spawn(process.execPath, [WORKER_SCRIPT, '--watch'], {
    cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
  });
  child.unref();
  writePidFile({ pid: child.pid, startedAt: new Date().toISOString() });
  collectiveBrain.appendEvent(ROOT, 'REMOTE_BRIDGE_WORKER_STARTED', { pid: child.pid });
  log('info', 'worker spawned', { pid: child.pid });
  return child.pid;
}

function stopWorker() {
  const info = readPidFile();
  if (info && isAlive(info.pid)) {
    try { process.kill(info.pid); } catch { /* already gone */ }
    log('info', 'worker stopped', { pid: info.pid });
    collectiveBrain.appendEvent(ROOT, 'REMOTE_BRIDGE_WORKER_STOPPED', { pid: info.pid });
    return true;
  }
  return false;
}

function healthcheck() {
  const info = readPidFile();
  const alive = info ? isAlive(info.pid) : false;
  const status = readStatus();
  const statusAgeMs = status ? Date.now() - Date.parse(status.updatedAt || 0) : null;
  const stale = statusAgeMs === null ? null : statusAgeMs > STALE_STATUS_MS;
  const healthy = alive && stale !== true;
  return { healthy, alive, pid: info ? info.pid : null, status, statusAgeMs, stale, recentRestarts: recentRestartCount() };
}

function ensureRunning(reasonIfRestart) {
  const h = healthcheck();
  if (h.healthy) return { action: 'none', ...h };
  if (h.alive && h.stale) stopWorker(); // process exists but stopped reporting - treat as hung
  const restarts = recentRestartCount();
  if (restarts >= MAX_RESTARTS) {
    log('error', 'crash-loop breaker tripped - not restarting automatically, needs human/typed investigation', { restarts, windowMs: RESTART_WINDOW_MS });
    return { action: 'circuit-open', ...h, restarts };
  }
  recordCrash(reasonIfRestart || 'not-healthy');
  const pid = spawnWorker();
  return { action: 'restarted', pid, restarts: restarts + 1 };
}

function main() {
  if (process.argv.includes('--healthcheck')) { console.log(JSON.stringify(healthcheck(), null, 2)); return; }
  if (process.argv.includes('--stop')) { console.log(JSON.stringify({ stopped: stopWorker() })); return; }
  if (process.argv.includes('--restart')) {
    stopWorker();
    const pid = spawnWorker();
    console.log(JSON.stringify({ ok: true, restarted: true, pid }));
    return;
  }
  if (process.argv.includes('--watch')) {
    log('info', 'watchdog loop started', { intervalMs: CHECK_INTERVAL_MS });
    ensureRunning('initial-start');
    setInterval(() => ensureRunning('healthcheck-failed'), CHECK_INTERVAL_MS);
    return;
  }
  console.log(JSON.stringify(ensureRunning('startup-check')));
}

if (require.main === module) main();

module.exports = { healthcheck, ensureRunning, spawnWorker, stopWorker, recentRestartCount, isAlive };
