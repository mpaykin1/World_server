#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const REPORT_FILE = 'AUTOFIX_REPORT.json';

function classify(report, modified) {
  if (!report || !Array.isArray(report.changes) || !Array.isArray(report.errors)
    || report.errors.length || report.mode !== 'apply') {
    throw Error('Invalid, non-apply, or failing auto-fix report');
  }
  const declared = new Set();
  for (const change of report.changes) {
    if (!change || change.applied !== true || typeof change.file !== 'string'
      || !change.file.length || change.file.includes('\n')
      || change.file.includes('\r') || change.file.includes('\0')
      || path.posix.isAbsolute(change.file)
      || change.file.split('/').some(segment => segment === '..' || !segment)) {
      throw Error('Invalid auto-fix report source path');
    }
    declared.add(change.file);
  }
  const real = [...new Set(modified)];
  if (real.some(file => typeof file !== 'string' || file.includes('\n')
    || file.includes('\r') || file.includes('\0'))) {
    throw Error('Unsafe changed filename');
  }
  const unreported = real.filter(file => file !== REPORT_FILE && !declared.has(file));
  if (unreported.length) {
    throw Error('Unreported worktree changes: ' + unreported.join(', '));
  }
  return real.filter(file => file !== REPORT_FILE && declared.has(file));
}

function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  const modified = execFileSync('git', ['diff', '--name-only', '-z', '--'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 }).split('\0').filter(Boolean);
  // An untracked file is not a proven in-place deterministic repair. Fail closed.
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 }).split('\0').filter(Boolean);
  if (untracked.length) throw Error('Untracked files after deterministic auto-fix');
  const files = classify(report, modified);
  if (files.length) {
    execFileSync('git', ['add', '--', ...files], { maxBuffer: 1024 * 1024 });
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--'],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 }).split('\0').filter(Boolean);
    const expected = [...files].sort();
    if (JSON.stringify(staged.sort()) !== JSON.stringify(expected)) {
      throw Error('Staged source paths do not match audited report and worktree');
    }
  }
  fs.writeFileSync(process.env.RUNNER_TEMP + '/autofix-source-paths.txt',
    files.join('\n') + (files.length ? '\n' : ''));
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
    'changed=' + (files.length ? 'true' : 'false') + '\n');
  console.log('Verified source patch file count:', files.length);
  console.log('Generated report-only changes are intentionally excluded from PRs.');
}
module.exports = { classify };
if (require.main === module) {
  try { main(); } catch (err) {
    console.error('[AUTOFIX_SOURCE_AUDIT] FAIL CLOSED:', err.message);
    process.exitCode = 73;
  }
}
