#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/self-improvement-risk-policy.json'), 'utf8'));
const cfg = policy.autoMerge || {};
function run(args) { return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }

let base = process.env.SELF_IMPROVEMENT_BASE || 'HEAD';
let raw = '';
try { raw = run(['diff', '--numstat', base]); }
catch { raw = run(['diff', '--numstat']); }

const files = [];
let changedLines = 0;
for (const line of raw.split(/\r?\n/).filter(Boolean)) {
  const [a, d, ...rest] = line.split('\t');
  const file = rest.join('\t');
  if ((cfg.candidatePrefixes || []).length && !(cfg.candidatePrefixes || []).some(p => file.startsWith(p))) continue;
  const added = a === '-' ? 100000 : Number(a || 0);
  const deleted = d === '-' ? 100000 : Number(d || 0);
  changedLines += added + deleted;
  files.push({ file, added, deleted, untracked: false });
}
const known = new Set(files.map(x => x.file));
let untrackedRaw = '';
try { untrackedRaw = run(['ls-files', '--others', '--exclude-standard']); } catch {}
for (const file of untrackedRaw.split(/\r?\n/).filter(Boolean)) {
  if ((cfg.candidatePrefixes || []).length && !(cfg.candidatePrefixes || []).some(p => file.startsWith(p))) continue;
  if (known.has(file)) continue;
  const full = path.join(ROOT, file);
  let added = 0;
  try {
    const buf = fs.readFileSync(full);
    added = buf.includes(0) ? 100000 : Math.max(1, buf.toString('utf8').split(/\r?\n/).length);
  } catch { added = 100000; }
  changedLines += added;
  files.push({ file, added, deleted: 0, untracked: true });
}

const reasons = [];
if (!cfg.enabled) reasons.push('auto-merge-disabled');
if (files.length > Number(cfg.maxFiles || 0)) reasons.push('too-many-files');
if (changedLines > Number(cfg.maxChangedLines || 0)) reasons.push('too-many-lines');
for (const item of files) {
  if ((cfg.forbiddenExact || []).includes(item.file)) reasons.push(`forbidden:${item.file}`);
  if ((cfg.forbiddenPrefixes || []).some(p => item.file.startsWith(p))) reasons.push(`forbidden-prefix:${item.file}`);
  if (!(cfg.allowedPrefixes || []).some(p => item.file.startsWith(p))) reasons.push(`outside-low-risk:${item.file}`);
  if (item.deleted > 120) reasons.push(`large-deletion:${item.file}`);
}
const uniqueReasons = [...new Set(reasons)];
const risk = uniqueReasons.length ? (files.some(x => (cfg.forbiddenPrefixes || []).some(p => x.file.startsWith(p))) ? 'high' : 'medium') : 'low';
const report = { generatedAt: new Date().toISOString(), base, files, changedLines, risk, autoMergeEligible: risk === 'low', reasons: uniqueReasons };
fs.writeFileSync(path.join(ROOT, 'SELF_IMPROVEMENT_RISK.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[SELF_IMPROVEMENT_RISK] risk=${risk} files=${files.length} lines=${changedLines} autoMerge=${report.autoMergeEligible}`);
if (process.env.SELF_IMPROVEMENT_REQUIRE_LOW_RISK === '1' && risk !== 'low') process.exit(71);
