#!/usr/bin/env node
'use strict';

/**
 * GODOT_WEB_BUILD - Headless Godot Web export pipeline for godot/world-client
 *
 * Steps:
 * 1. Preflight: locate Godot binary & verify Web export templates are installed.
 * 2. Headless export: run `godot --headless --path godot/world-client --export-release Web apps/godot-web/index.html`
 * 3. Artifact verification: verify HTML, JS, WASM, and PCK artifacts exist with plausible sizes.
 * 4. Web-Native equivalence check: verify terrain seed generation equivalence via compare-worldgen.js.
 * 5. Report output: write structured GODOT_WEB_BUILD_REPORT.json with step results.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GODOT_PROJECT = path.join(ROOT, 'godot', 'world-client');
const OUTPUT_DIR = path.join(ROOT, 'apps', 'godot-web');
const TARGET_HTML = path.join(OUTPUT_DIR, 'index.html');
const REPORT_PATH = path.join(ROOT, 'GODOT_WEB_BUILD_REPORT.json');

function resolveGodotBin() {
  if (process.env.GODOT_BIN && fs.existsSync(process.env.GODOT_BIN)) {
    return process.env.GODOT_BIN;
  }
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  for (const candidate of ['godot4', 'godot']) {
    const res = spawnSync(cmd, [candidate], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      const binPath = res.stdout.trim().split(/\r?\n/)[0];
      if (binPath && fs.existsSync(binPath)) return binPath;
    }
  }
  return process.env.GODOT_BIN || 'godot';
}

function templatesInstalled(godotBin) {
  const home = os.homedir();
  const templateDirs = [];
  if (process.platform === 'win32') {
    templateDirs.push(path.join(home, 'AppData', 'Roaming', 'Godot', 'export_templates'));
  } else if (process.platform === 'darwin') {
    templateDirs.push(path.join(home, 'Library', 'Application Support', 'Godot', 'export_templates'));
  } else {
    templateDirs.push(path.join(home, '.local', 'share', 'godot', 'export_templates'));
  }

  for (const baseDir of templateDirs) {
    if (!fs.existsSync(baseDir)) continue;
    try {
      const versions = fs.readdirSync(baseDir);
      for (const ver of versions) {
        const verPath = path.join(baseDir, ver);
        if (fs.statSync(verPath).isDirectory()) {
          const webRelease = path.join(verPath, 'web_release.zip');
          if (fs.existsSync(webRelease)) return true;
        }
      }
    } catch {
      // continue searching
    }
  }
  return false;
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

function validateArtifacts(outputDir = OUTPUT_DIR) {
  const expectedFiles = [
    { name: 'index.html', minSize: 1000 },
    { name: 'index.js', minSize: 50000 },
    { name: 'index.wasm', minSize: 1000000 },
    { name: 'index.pck', minSize: 1000 }
  ];

  const details = {};
  for (const item of expectedFiles) {
    const filePath = path.join(outputDir, item.name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required export artifact missing: ${item.name}`);
    }
    const stat = fs.statSync(filePath);
    if (stat.size < item.minSize) {
      throw new Error(`Artifact ${item.name} is too small (${stat.size} bytes, expected at least ${item.minSize} bytes)`);
    }
    details[item.name] = { path: filePath, sizeBytes: stat.size };
  }
  return details;
}

function run() {
  const steps = [];
  const godotBin = resolveGodotBin();

  const preflight = step('preflight', () => {
    if (!fs.existsSync(godotBin)) {
      throw new Error(`Godot binary not found at ${godotBin}. Set GODOT_BIN environment variable.`);
    }
    if (!fs.existsSync(GODOT_PROJECT)) {
      throw new Error(`Godot project not found at ${GODOT_PROJECT}`);
    }
    if (!templatesInstalled(godotBin)) {
      throw new Error('Godot Web export templates (web_release.zip) are not installed');
    }
    return { godotBin, project: GODOT_PROJECT };
  });
  steps.push(preflight);
  if (!preflight.ok) return finish(steps, false);

  const exportStep = step('headless-web-export', () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const r = spawnSync(godotBin, ['--headless', '--path', GODOT_PROJECT, '--export-release', 'Web', TARGET_HTML], {
      encoding: 'utf8',
      timeout: 180000
    });
    if (r.status !== 0) {
      throw new Error(`godot --export-release Web exited ${r.status}: ${String(r.stderr || r.stdout || '').slice(-3000)}`);
    }
    return { exitCode: r.status, logTail: String(r.stdout || '').slice(-1500) };
  });
  steps.push(exportStep);
  if (!exportStep.ok) return finish(steps, false);

  const artifactStep = step('artifact-verification', () => {
    const files = validateArtifacts(OUTPUT_DIR);
    return { outputDir: OUTPUT_DIR, files };
  });
  steps.push(artifactStep);
  if (!artifactStep.ok) return finish(steps, false);

  const equivalenceStep = step('web-native-equivalence', () => {
    const { compare } = require('./compare-worldgen.js');
    const result = compare(73194217);
    if (!result.ok) {
      throw new Error(`web/native terrain mismatch: maxHeightDiff=${result.maxHeightDiff} biomeMismatches=${result.biomeMismatches}`);
    }
    return { maxHeightDiff: result.maxHeightDiff, biomeMismatches: result.biomeMismatches };
  });
  steps.push(equivalenceStep);

  return finish(steps, steps.every((s) => s.ok));
}

function finish(steps, ok) {
  const report = {
    patch: 'GODOT_WEB_BUILD',
    status: ok ? 'PASS' : 'FAIL',
    ok,
    steps,
    outputDir: fs.existsSync(OUTPUT_DIR) ? OUTPUT_DIR : null,
    generatedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  } catch {
    /* best effort */
  }
  return report;
}

if (require.main === module) {
  const report = run();
  console.log(JSON.stringify(report, null, 2));
  console.log(report.ok ? '[GODOT_WEB_BUILD] PASS' : '[GODOT_WEB_BUILD] FAIL');
  process.exitCode = report.ok ? 0 : 1;
}

module.exports = {
  run,
  resolveGodotBin,
  templatesInstalled,
  validateArtifacts,
  OUTPUT_DIR,
  TARGET_HTML,
  REPORT_PATH
};
