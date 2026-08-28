#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
  const out = { wait: 0, check: '', retries: 1, retryWait: 60, reason: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wait') out.wait = Number(argv[++i] || 0);
    else if (a === '--check') out.check = String(argv[++i] || '');
    else if (a === '--retries') out.retries = Number(argv[++i] || 1);
    else if (a === '--retry-wait') out.retryWait = Number(argv[++i] || 60);
    else if (a === '--reason') out.reason = String(argv[++i] || '');
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const reportPath = path.resolve(process.cwd(), 'GS360_WAIT_REPORT.json');
const report = { schema: 'world-server.gs360-wait/v1', pass: false, startedAt: new Date().toISOString(), args, attempts: [] };

function sleepSeconds(sec) {
  const end = Date.now() + sec * 1000;
  while (Date.now() < end) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(1000, end - Date.now()));
}

if (args.wait > 0) {
  console.log(`[GS360 WAIT] waiting ${args.wait}s${args.reason ? ' - ' + args.reason : ''}`);
  sleepSeconds(args.wait);
}

for (let attempt = 1; attempt <= Math.max(1, args.retries); attempt++) {
  if (!args.check) {
    report.attempts.push({ attempt, skipped: true, message: 'No check command provided.' });
    report.pass = true;
    break;
  }
  console.log(`[GS360 WAIT] check attempt ${attempt}/${args.retries}: ${args.check}`);
  const result = spawnSync(args.check, { shell: true, encoding: 'utf8' });
  report.attempts.push({
    attempt,
    command: args.check,
    status: result.status,
    stdoutTail: (result.stdout || '').slice(-4000),
    stderrTail: (result.stderr || '').slice(-4000),
    pass: result.status === 0,
  });
  if (result.status === 0) {
    report.pass = true;
    break;
  }
  if (attempt < args.retries && args.retryWait > 0) {
    console.log(`[GS360 WAIT] attempt failed; retrying in ${args.retryWait}s`);
    sleepSeconds(args.retryWait);
  }
}

report.finishedAt = new Date().toISOString();
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ pass: report.pass, reportPath }, null, 2));
process.exit(report.pass ? 0 : 1);
