'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

test('unified tick is single-pass and not self-duplicated', () => {
  const p = path.join(ROOT, 'state', 'blocker-repair', 'unified-tick.ps1');
  const s = fs.readFileSync(p, 'utf8');
  assert.equal((s.match(/autonomous-blocker-repair\.cjs/g) || []).length, 1);
  assert.equal((s.match(/\$ErrorActionPreference/g) || []).length, 1);
  assert.ok(s.length < 6000, 'scheduler script unexpectedly bloated');
});

test('quality autoloop does not recursively invoke blocker repair', () => {
  const s = fs.readFileSync(path.join(ROOT, 'scripts', 'quality-autoloop-tick.ps1'), 'utf8');
  assert.doesNotMatch(s, /autonomous-blocker-repair\.cjs/);
});

test('desktop policy keeps AI quarantine off Desktop', () => {
  const registry = require('../scripts/lib/session-safe-to-delete-registry.cjs');
  assert.ok(!registry.defaultRoot().toLowerCase().includes('\\desktop\\'));
  assert.deepEqual([...registry.ALLOWED_DESKTOP_WORLD_SERVER_NAMES], ['world_server']);
});

test('watchdog cadence stays lightweight and no faster than five minutes', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'desktop-ai-session-recovery-policy.json'), 'utf8'));
  assert.ok(Number(policy.watchdogIntervalMinutes) >= 5);
});

test('recurring blocker repair never runs full release/integration suites', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'blocker-repair-policy.json'), 'utf8'));
  assert.ok(Number(policy.timers.schedulerMinutes) >= 30);
  assert.ok(!policy.gates.npmScripts.includes('release:gate'));
  assert.ok(!policy.gates.npmScripts.includes('integration:full'));
});

test('performance guard protects RAM without killing interactive apps', () => {
  const p = path.join(ROOT, 'tools', 'windows-ai-performance-guard.ps1');
  const s = fs.readFileSync(p, 'utf8');
  assert.match(s, /OLLAMA|llama-server/i);
  assert.match(s, /UsedPct\s+-ge\s+75|FreeGB\s+-lt\s+4/);
  assert.match(s, /BelowNormal/);
  assert.match(s, /autonomous-blocker-repair|desktop-ai-session-recovery/);
  assert.doesNotMatch(s, /Stop-Process[^\n]*(ChatGPT|chrome|codex)/i);
});

test('performance guard only deduplicates known managed schedulers', () => {
  const s = fs.readFileSync(path.join(ROOT, 'tools', 'windows-ai-performance-guard.ps1'), 'utf8');
  assert.match(s, /dupePatterns/);
  assert.match(s, /quality-autoloop-tick/);
  assert.doesNotMatch(s, /Get-Process\s+node[^\n]*Stop-Process/i);
});
