#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_RUNTIME = path.join(ROOT, 'data', 'collective-brain', 'runtime', 'run-supervisor');

const positive = (value, fallback) => (
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback
);
const safe = (value) => String(value || 'run')
  .replace(/[^a-zA-Z0-9_.-]+/g, '-')
  .slice(0, 96);

function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function append(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(value) + '\n');
}

function stopOwned(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || typeof child.kill !== 'function') return false;
  try {
    return child.kill(signal);
  } catch {
    return false;
  }
}

function supervise(command, args = [], options = {}) {
  const runId = safe(options.runId || ('run-' + Date.now()));
  const timeoutMs = positive(options.timeoutMs, 120000);
  const stallMs = Math.min(positive(options.stallMs, 30000), timeoutMs);
  const killGraceMs = Math.min(positive(options.killGraceMs, 1000), timeoutMs);
  const heartbeat = options.heartbeatPattern ? new RegExp(options.heartbeatPattern) : /./;
  const runtime = options.runtimeDir ? path.resolve(options.runtimeDir) : DEFAULT_RUNTIME;
  const dir = path.join(runtime, runId);
  const statusFile = path.join(dir, 'status.json');
  const eventsFile = path.join(dir, 'events.jsonl');

  fs.mkdirSync(dir, { recursive: true });

  const started = Date.now();
  let lastProgress = started;
  let lastSignal = 'spawn';
  let settled = false;
  let timedOut = false;
  let stalled = false;
  let child;
  let monitor = null;
  let stopRequested = false;
  let forceTimer = null;
  let abandonTimer = null;

  const record = (state, extra = {}) => {
    const value = {
      schemaVersion: '1.1.0',
      runId,
      state,
      pid: child?.pid || null,
      command,
      args,
      startedAt: new Date(started).toISOString(),
      updatedAt: new Date().toISOString(),
      lastProgressAt: new Date(lastProgress).toISOString(),
      lastSignal,
      timeoutMs,
      stallMs,
      killGraceMs,
      ...extra,
    };
    save(statusFile, value);
    append(eventsFile, value);
    return value;
  };

  return new Promise((resolve, reject) => {
    const finish = (state, extra = {}) => {
      if (settled) return;
      settled = true;
      if (monitor) clearInterval(monitor);
      if (forceTimer) clearTimeout(forceTimer);
      if (abandonTimer) clearTimeout(abandonTimer);
      resolve(record(state, extra));
    };

    const requestStop = (state, extra = {}) => {
      if (stopRequested) return;
      stopRequested = true;
      if (state === 'TIMEOUT') timedOut = true;
      if (state === 'STALLED') stalled = true;
      record(state, extra);
      stopOwned(child, 'SIGTERM');

      if (!forceTimer) {
        forceTimer = setTimeout(() => {
          if (settled || !child || child.exitCode !== null) return;
          stopOwned(child, 'SIGKILL');
        }, killGraceMs);
      }

      if (!abandonTimer) {
        abandonTimer = setTimeout(() => {
          if (settled || !child || child.exitCode !== null) return;
          try { child.stdout?.destroy(); } catch {}
          try { child.stderr?.destroy(); } catch {}
          try { child.unref?.(); } catch {}
          finish(state, {
            durationMs: Date.now() - started,
            checkpointPath: dir,
            stopFailed: true,
          });
        }, killGraceMs * 2);
      }
    };

    const progress = (stream, chunk) => {
      const text = chunk.toString();
      fs.appendFileSync(path.join(dir, stream + '.log'), text);
      heartbeat.lastIndex = 0;
      if (heartbeat.test(text)) {
        lastProgress = Date.now();
        lastSignal = stream;
        record('RUNNING', { progress: true });
      }
    };

    child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    record('RUNNING');
    child.stdout.on('data', (chunk) => progress('stdout', chunk));
    child.stderr.on('data', (chunk) => progress('stderr', chunk));

    monitor = setInterval(() => {
      if (settled) return;
      const ageMs = Date.now() - lastProgress;
      const totalMs = Date.now() - started;
      if (totalMs >= timeoutMs) {
        requestStop('TIMEOUT', { ageMs, totalMs });
      } else if (ageMs >= stallMs) {
        requestStop('STALLED', { ageMs, totalMs });
      }
    }, Math.min(1000, Math.max(100, Math.floor(stallMs / 4))));

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (monitor) clearInterval(monitor);
      if (forceTimer) clearTimeout(forceTimer);
      if (abandonTimer) clearTimeout(abandonTimer);
      reject(Object.assign(error, {
        result: record('ERROR', {
          error: error.message,
          durationMs: Date.now() - started,
        }),
      }));
    });

    child.on('exit', (code, signal) => {
      const state = timedOut ? 'TIMEOUT' : stalled ? 'STALLED' : code === 0 ? 'PASS' : 'FAIL';
      finish(state, {
        exitCode: code,
        signal,
        durationMs: Date.now() - started,
        checkpointPath: dir,
      });
    });
  });
}

function parseCli(argv) {
  const options = {};
  const separator = argv.indexOf('--');
  const control = separator >= 0 ? argv.slice(0, separator) : argv;
  const command = separator >= 0 ? argv.slice(separator + 1) : [];

  for (let index = 0; index < control.length; index += 1) {
    const key = control[index];
    if (key === '--run-id') options.runId = control[++index];
    else if (key === '--timeout-ms') options.timeoutMs = Number(control[++index]);
    else if (key === '--stall-ms') options.stallMs = Number(control[++index]);
    else if (key === '--kill-grace-ms') options.killGraceMs = Number(control[++index]);
    else if (key === '--heartbeat-regex') options.heartbeatPattern = control[++index];
    else if (key === '--cwd') options.cwd = control[++index];
    else throw new Error('unknown option: ' + key);
  }

  if (!command.length) {
    throw new Error('usage: run-supervisor.cjs [options] -- <command> [args...]');
  }
  options.command = command[0];
  options.args = command.slice(1);
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const result = await supervise(options.command, options.args, options);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.state === 'PASS'
    ? 0
    : (result.state === 'STALLED' || result.state === 'TIMEOUT' ? 124 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[RUN_SUPERVISOR]', error.stack || error.message);
    process.exitCode = 2;
  });
}

module.exports = { supervise, parseCli, stopOwned };