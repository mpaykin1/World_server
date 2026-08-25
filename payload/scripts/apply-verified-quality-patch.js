#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/patch-synthesis-policy.json'), 'utf8'));

function validate(diff) {
  if (!diff.startsWith('diff --git ')) return { ok: false, reason: 'invalid-format' };
  if (Buffer.byteLength(diff) > policy.maxDiffBytes) return { ok: false, reason: 'too-large' };

  const touched = [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map(match => match[2]);
  for (const file of touched) {
    if (policy.forbiddenPaths.includes(file)) return { ok: false, reason: `forbidden:${file}`, touched };
    if (!policy.allowedPathPrefixes.some(prefix => file.startsWith(prefix))) {
      return { ok: false, reason: `outside-policy:${file}`, touched };
    }
  }
  return { ok: true, touched };
}

function candidate() {
  const tournamentPath = path.join(ROOT, 'QUALITY_PATCH_TOURNAMENT.json');
  const winnerPath = path.join(ROOT, 'QUALITY_PATCH_WINNER.diff');
  if (fs.existsSync(tournamentPath) && fs.existsSync(winnerPath)) {
    const report = JSON.parse(fs.readFileSync(tournamentPath, 'utf8'));
    if (report.status === 'VERIFIED_WINNER' && report.winner?.verified === true) {
      return { source: 'tournament', diff: fs.readFileSync(winnerPath, 'utf8') };
    }
  }

  const synthPath = path.join(ROOT, 'QUALITY_PATCH_SYNTHESIS_REPORT.json');
  const patchPath = path.join(ROOT, 'QUALITY_PATCH_CANDIDATE.diff');
  if (fs.existsSync(synthPath) && fs.existsSync(patchPath)) {
    const report = JSON.parse(fs.readFileSync(synthPath, 'utf8'));
    if (report.status === 'VERIFIED_IN_SANDBOX') {
      return { source: 'single-candidate', diff: fs.readFileSync(patchPath, 'utf8') };
    }
  }

  return null;
}

const selected = candidate();
if (!selected) {
  console.log('[APPLY_VERIFIED_PATCH] no verified candidate');
  process.exit(0);
}

const validation = validate(selected.diff);
if (!validation.ok) {
  console.error(`[APPLY_VERIFIED_PATCH] rejected ${validation.reason}`);
  process.exit(51);
}

const patchPath = path.join(ROOT, '.verified-quality-patch.diff');
fs.writeFileSync(patchPath, selected.diff);
try {
  cp.execFileSync('git', ['apply', '--check', patchPath], { cwd: ROOT, stdio: 'inherit' });
  cp.execFileSync('git', ['apply', patchPath], { cwd: ROOT, stdio: 'inherit' });
  console.log(`[APPLY_VERIFIED_PATCH] applied source=${selected.source} files=${validation.touched.length}`);
} finally {
  fs.rmSync(patchPath, { force: true });
}
