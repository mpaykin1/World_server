#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const here = __dirname;
const venv = path.join(here, '.venv');

function tryCmd(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status === 0;
}
function discover() {
  const options = process.platform === 'win32'
    ? [['python', []], ['py', ['-3']]]
    : [['python3', []], ['python', []]];
  for (const [cmd, prefix] of options) {
    const r = spawnSync(cmd, [...prefix, '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
    if (r.status === 0) return { cmd, prefix };
  }
  return null;
}
const py = discover();
if (!py) {
  console.error('[GS360] Python 3 not found.');
  process.exit(2);
}
if (!fs.existsSync(venv)) {
  if (!tryCmd(py.cmd, [...py.prefix, '-m', 'venv', venv])) process.exit(3);
}
const vpy = process.platform === 'win32'
  ? path.join(venv, 'Scripts', 'python.exe')
  : path.join(venv, 'bin', 'python');
const req = path.join(here, 'requirements.txt');
if (!tryCmd(vpy, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', req])) process.exit(4);
console.log('[GS360] setup PASS:', vpy);
