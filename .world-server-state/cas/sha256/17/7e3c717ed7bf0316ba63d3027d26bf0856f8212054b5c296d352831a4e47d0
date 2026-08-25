'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { encodeApng } = require('../lib/apng-engine');

function solid(width, height, r, g, b, a = 255) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }
  return out;
}
function frame(rgba) { return { rgba, delayNum: 10, delayDenRaw: 100, delayMs: 100 }; }
function flashApng() {
  const width = 8; const height = 8; const dark = solid(width, height, 20, 20, 20); const flash = solid(width, height, 250, 10, 250);
  return encodeApng([frame(dark), frame(flash), frame(dark)], width, height);
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apng-gate-'));
  for (const rel of ['lib', 'scripts', 'apps']) fs.mkdirSync(path.join(root, rel), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '../lib/apng-engine.js'), path.join(root, 'lib/apng-engine.js'));
  fs.copyFileSync(path.resolve(__dirname, '../scripts/apng-quality-gate.js'), path.join(root, 'scripts/apng-quality-gate.js'));
  return root;
}

function run(root, args = []) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/apng-quality-gate.js'), ...args], { cwd: root, encoding: 'utf8' });
}

test('repository gate preserves explicitly intentional visual effect but never hides it from report', () => {
  const root = setup();
  try {
    fs.writeFileSync(path.join(root, 'apps/intentional.apng'), flashApng());
    fs.writeFileSync(path.join(root, 'apng-quality.config.json'), JSON.stringify({
      version: 1,
      defaults: { minConfidence: 0.94, sanitizeTransparentRgb: true, allowTemporalRepair: true },
      rules: [{ match: 'apps/intentional.apng', intentionalIssues: ['APNG_BRIGHTNESS_FLASH', 'APNG_COLOR_FLASH'] }]
    }, null, 2));
    const result = run(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(path.join(root, 'APNG_QUALITY_REPORT.json'), 'utf8'));
    assert.equal(report.remainingErrors, 0);
    assert.ok(report.acceptedIntentionalIssues >= 1);
    assert.ok(report.files[0].acceptedIntentionalIssues.length >= 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('repository gate blocks unapproved defect and --apply repairs it to zero active errors', () => {
  const root = setup();
  try {
    fs.writeFileSync(path.join(root, 'apps/bad.apng'), flashApng());
    fs.writeFileSync(path.join(root, 'apng-quality.config.json'), JSON.stringify({ version: 1, defaults: { allowTemporalRepair: true }, rules: [] }, null, 2));
    const before = run(root);
    assert.equal(before.status, 1);
    let report = JSON.parse(fs.readFileSync(path.join(root, 'APNG_QUALITY_REPORT.json'), 'utf8'));
    assert.ok(report.remainingErrors >= 1);
    assert.ok(report.failures.some((f) => f.error === 'APNG_QUALITY_ERRORS'));

    const apply = run(root, ['--apply']);
    assert.equal(apply.status, 0, apply.stderr || apply.stdout);
    report = JSON.parse(fs.readFileSync(path.join(root, 'APNG_QUALITY_REPORT.json'), 'utf8'));
    assert.equal(report.remainingErrors, 0);
    assert.equal(report.failures.length, 0);
    assert.ok(report.repaired >= 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
