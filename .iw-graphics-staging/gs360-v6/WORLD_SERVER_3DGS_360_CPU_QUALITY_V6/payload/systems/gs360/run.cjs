#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;
const candidates = process.platform === 'win32'
  ? [path.join(here, '.venv', 'Scripts', 'python.exe'), 'python', 'py']
  : [path.join(here, '.venv', 'bin', 'python'), 'python3', 'python'];

function works(cmd) {
  if (cmd.includes(path.sep) && !fs.existsSync(cmd)) return false;
  const extra = (process.platform === 'win32' && cmd === 'py') ? ['-3'] : [];
  const r = spawnSync(cmd, [...extra, '-c', 'import numpy, PIL'], { stdio: 'ignore' });
  return r.status === 0;
}

const py = candidates.find(works);
if (!py) {
  console.error('[GS360] Python with numpy + Pillow not found. Run: npm run gs360:setup');
  process.exit(2);
}
const pyPrefix = (process.platform === 'win32' && py === 'py') ? ['-3'] : [];
const script = path.join(here, 'gs360_pipeline.py');
const r = spawnSync(py, [...pyPrefix, script, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(Number.isInteger(r.status) ? r.status : 1);
