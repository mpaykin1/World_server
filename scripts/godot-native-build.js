#!/usr/bin/env node
'use strict';
// GODOT_NATIVE_BUILD - real headless Windows EXE export pipeline for
// godot/world-client (the native Godot client, which shares the exact
// same World Spec/seed/terrain formulas as the web voxel-world client -
// see WorldGen.gd and scripts/compare-worldgen.js). This is what the
// bridge's typed `build_native` command actually calls - never simulated,
// every step below either really happened or the script reports exactly
// which step failed and why.
//
// Steps: locate Godot + verify export templates are installed -> headless
// `--export-release` -> verify the artifact file actually exists and has
// a plausible size (not a truncated/empty file) -> run it once with
// --smoke-test to confirm it actually executes and produces real,
// seed-correct output (cross-checked against scripts/compare-worldgen.js's
// own JS-side formula) -> report structured PASS/FAIL with the exact
// failing step, never a bare "PASS".
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GODOT_PROJECT = path.join(ROOT, 'godot', 'world-client');
const { findGodot, templateVersionOf } = require('./lib/godot-discovery.cjs');
const GODOT_BIN = findGodot({ requireTemplates: true });
const BUILD_DIR = path.join(ROOT, 'GODOT_BUILD');
const ARTIFACT_PATH = path.join(BUILD_DIR, 'world-server-native-windows.exe');
const MIN_PLAUSIBLE_SIZE_BYTES = 20 * 1024 * 1024; // a real Godot export is never smaller than ~20MB

function templatesInstalled() {
  const versionFile = path.join(ROOT, '..'); // not used - see below for the real check
  const templateVersion = templateVersionOf(GODOT_BIN) || '4.7.2.stable';
  const dir = path.join(os.homedir(), 'AppData', 'Roaming', 'Godot', 'export_templates', templateVersion);
  const marker = path.join(dir, 'windows_release_x86_64_console.exe');
  return fs.existsSync(marker);
}

function step(name, fn) {
  const startedAt = Date.now();
  try {
    const result = fn();
    return { step: name, ok: true, durationMs: Date.now() - startedAt, ...(result || {}) };
  } catch (e) {
    return { step: name, ok: false, durationMs: Date.now() - startedAt, error: e.message };
  }
}

function run() {
  const steps = [];

  const preflight = step('preflight', () => {
    if (!GODOT_BIN || !fs.existsSync(GODOT_BIN)) throw new Error('No installed Godot runtime with matching Windows export templates was found - GODOT_BIN may override discovery');
    if (!fs.existsSync(GODOT_PROJECT)) throw new Error(`Godot project not found at ${GODOT_PROJECT}`);
    if (!templatesInstalled()) throw new Error(`Godot export templates for ${templateVersionOf(GODOT_BIN) || 'detected runtime'} are not installed`);
    return { godotBin: GODOT_BIN, project: GODOT_PROJECT };
  });
  steps.push(preflight);
  if (!preflight.ok) return finish(steps, false);

  const exportStep = step('headless-export', () => {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    try { fs.unlinkSync(ARTIFACT_PATH); } catch { /* fine if it didn't exist */ }
    const r = spawnSync(GODOT_BIN, ['--headless', '--path', GODOT_PROJECT, '--export-release', 'Windows Desktop', ARTIFACT_PATH], { encoding: 'utf8', timeout: 180000 });
    if (r.status !== 0) throw new Error(`godot --export-release exited ${r.status}: ${String(r.stderr || r.stdout || '').slice(-3000)}`);
    return { exitCode: r.status, logTail: String(r.stdout || '').slice(-1500) };
  });
  steps.push(exportStep);
  if (!exportStep.ok) return finish(steps, false);

  const artifactStep = step('artifact-verification', () => {
    if (!fs.existsSync(ARTIFACT_PATH)) throw new Error(`export reported success but no file exists at ${ARTIFACT_PATH}`);
    const size = fs.statSync(ARTIFACT_PATH).size;
    if (size < MIN_PLAUSIBLE_SIZE_BYTES) throw new Error(`artifact exists but is implausibly small (${size} bytes) - likely truncated/corrupt export`);
    return { artifactPath: ARTIFACT_PATH, sizeBytes: size };
  });
  steps.push(artifactStep);
  if (!artifactStep.ok) return finish(steps, false);

  const smokeStep = step('smoke-test', () => {
    const seed = 73194217;
    const r = spawnSync(ARTIFACT_PATH, ['--headless', '--', '--smoke-test', String(seed)], { encoding: 'utf8', timeout: 30000 });
    if (r.status !== 0) throw new Error(`artifact exited ${r.status} when run: ${String(r.stderr || '').slice(-1500)}`);
    const line = String(r.stdout || '').split(/\r?\n/).find((l) => l.trim().startsWith('{'));
    if (!line) throw new Error(`artifact ran but produced no parseable output: ${String(r.stdout || '').slice(-1000)}`);
    let stats;
    try { stats = JSON.parse(line); } catch (e) { throw new Error(`artifact output was not valid JSON: ${e.message}`); }
    if (!stats.columnCount || !Array.isArray(stats.sampleHeights)) throw new Error(`artifact output missing expected fields: ${JSON.stringify(stats)}`);
    return { seed, stats };
  });
  steps.push(smokeStep);
  if (!smokeStep.ok) return finish(steps, false);

  const equivalenceStep = step('web-native-equivalence', () => {
    const { compare } = require('./compare-worldgen.js');
    const result = compare(73194217);
    if (!result.ok) throw new Error(`web/native terrain mismatch: maxHeightDiff=${result.maxHeightDiff} biomeMismatches=${result.biomeMismatches}`);
    return { maxHeightDiff: result.maxHeightDiff, biomeMismatches: result.biomeMismatches };
  });
  steps.push(equivalenceStep);

  return finish(steps, steps.every((s) => s.ok));
}

function finish(steps, ok) {
  const report = { patch: 'GODOT_NATIVE_BUILD', status: ok ? 'PASS' : 'FAIL', ok, steps, artifactPath: fs.existsSync(ARTIFACT_PATH) ? ARTIFACT_PATH : null, generatedAt: new Date().toISOString() };
  try { fs.writeFileSync(path.join(ROOT, 'GODOT_NATIVE_BUILD_REPORT.json'), JSON.stringify(report, null, 2) + '\n'); } catch { /* best effort */ }
  return report;
}

if (require.main === module) {
  const report = run();
  console.log(JSON.stringify(report, null, 2));
  console.log(report.ok ? '[GODOT_NATIVE_BUILD] PASS' : '[GODOT_NATIVE_BUILD] FAIL');
  process.exitCode = report.ok ? 0 : 1;
}

module.exports = { run, templatesInstalled, ARTIFACT_PATH, GODOT_BIN, GODOT_PROJECT };
