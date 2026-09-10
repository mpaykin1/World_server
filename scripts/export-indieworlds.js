'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_PUBLIC_BASE_URL, projectStaticArtifacts } = require('../lib/indieworlds');

const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'shared', 'indieworlds');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/^\uFEFF/, ''));
}

function expectedArtifacts(baseUrl = DEFAULT_PUBLIC_BASE_URL) {
  return projectStaticArtifacts({
    registry: readJson('data/app-release-registry.json'),
    graph: readJson('data/world-graph-index.json'),
    loreBible: readJson('data/world-lore-v2.json'),
    baseUrl
  });
}

function writeArtifacts(artifacts = expectedArtifacts()) {
  for (const [relativePath, content] of artifacts) {
    const destination = path.join(outputRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content, 'utf8');
  }
  const worldsDir = path.join(outputRoot, 'worlds');
  if (fs.existsSync(worldsDir)) {
    const expectedWorldFiles = new Set([...artifacts.keys()].filter((name) => name.startsWith('worlds/')).map((name) => path.basename(name)));
    for (const name of fs.readdirSync(worldsDir)) {
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(name) && !expectedWorldFiles.has(name)) fs.unlinkSync(path.join(worldsDir, name));
    }
  }
  return artifacts;
}

function drift(artifacts = expectedArtifacts()) {
  const mismatches = [];
  for (const [relativePath, expected] of artifacts) {
    const destination = path.join(outputRoot, relativePath);
    const actual = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : null;
    if (actual !== expected) mismatches.push(relativePath);
  }
  const worldsDir = path.join(outputRoot, 'worlds');
  if (fs.existsSync(worldsDir)) {
    const expectedWorldFiles = new Set([...artifacts.keys()].filter((name) => name.startsWith('worlds/')).map((name) => path.basename(name)));
    for (const name of fs.readdirSync(worldsDir)) {
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(name) && !expectedWorldFiles.has(name)) mismatches.push(`worlds/${name}`);
    }
  }
  return mismatches.sort();
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const mismatches = drift();
    if (mismatches.length) {
      console.error(`[INDIEWORLDS] static exports drifted: ${mismatches.join(', ')}`);
      process.exitCode = 1;
    } else console.log('[INDIEWORLDS] static exports match canonical world data');
  } else {
    const artifacts = writeArtifacts();
    console.log(`[INDIEWORLDS] exported ${artifacts.size} portable artifacts to shared/indieworlds`);
  }
}

module.exports = { expectedArtifacts, writeArtifacts, drift, outputRoot };
