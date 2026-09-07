'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateArtifacts, resolveGodotBin, templatesInstalled } = require('../scripts/godot-web-build.js');

test('validateArtifacts throws error when required file is missing', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-web-test-missing-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'index.html'), Buffer.alloc(2000));
    assert.throws(
      () => validateArtifacts(tempDir),
      /Required export artifact missing: index\.js/
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('validateArtifacts throws error when file is too small', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-web-test-small-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'index.html'), Buffer.alloc(2000));
    fs.writeFileSync(path.join(tempDir, 'index.js'), 'console.log("short");');
    fs.writeFileSync(path.join(tempDir, 'index.wasm'), Buffer.alloc(100)); // too small, min 1MB
    fs.writeFileSync(path.join(tempDir, 'index.pck'), Buffer.alloc(2000));
    assert.throws(
      () => validateArtifacts(tempDir),
      /Artifact index\.js is too small|Artifact index\.wasm is too small/
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('validateArtifacts succeeds when all files exist and have sufficient size', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-web-test-valid-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'index.html'), Buffer.alloc(2000));
    fs.writeFileSync(path.join(tempDir, 'index.js'), Buffer.alloc(100000));
    fs.writeFileSync(path.join(tempDir, 'index.wasm'), Buffer.alloc(1500000));
    fs.writeFileSync(path.join(tempDir, 'index.pck'), Buffer.alloc(5000));

    const result = validateArtifacts(tempDir);
    assert.equal(typeof result, 'object');
    assert.equal(result['index.html'].sizeBytes, 2000);
    assert.equal(result['index.js'].sizeBytes, 100000);
    assert.equal(result['index.wasm'].sizeBytes, 1500000);
    assert.equal(result['index.pck'].sizeBytes, 5000);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveGodotBin returns string', () => {
  const bin = resolveGodotBin();
  assert.equal(typeof bin, 'string');
  assert.ok(bin.length > 0);
});

test('templatesInstalled returns boolean', () => {
  const installed = templatesInstalled('godot');
  assert.equal(typeof installed, 'boolean');
});

test('Godot Web workflow is build-only for PRs and publishes only from manual master', () => {
  const workflowPath = path.resolve(__dirname, '../.github/workflows/godot-web-preview.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /push:\s*\n\s*branches:\s*\[master\]/);
  assert.doesNotMatch(workflow, /branches:\s*\["\*\*"\]/);
  assert.match(workflow, /github\.event_name[^\n]*workflow_dispatch/);
  assert.match(workflow, /github\.ref[^\n]*refs\/heads\/master/);
  assert.match(workflow, /can_publish=false/);
  assert.match(workflow, /PRs and ordinary pushes never publish/);
});

test('Godot Web workflow never masks a failed Vercel deploy', () => {
  const workflowPath = path.resolve(__dirname, '../.github/workflows/godot-web-preview.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /npx vercel deploy[^\n]*\|\|\s*true/);
  assert.match(workflow, /DEPLOY_EXIT=\$\?/);
  assert.match(workflow, /Vercel deploy failed with exit code/);
  assert.match(workflow, /exit \"\$DEPLOY_EXIT\"/);
  assert.match(workflow, /produced no Preview URL/);
});
