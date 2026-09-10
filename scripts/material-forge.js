#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  compileRegistry,
  importArmorPaintFolder,
  stableStringify
} = require('../lib/material-forge');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_FILE = path.join(ROOT, 'shared', 'material-forge-registry.json');
const MANIFEST_DIRECTORY = path.join(ROOT, 'data', 'material-forge', 'materials');

function parseArguments(argv) {
  const args = { command: argv.includes('--import') ? 'import' : argv.includes('--write') ? 'write' : 'check' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || ['--import', '--write', '--check'].includes(key)) continue;
    const value = argv[index + 1];
    if (value && !value.startsWith('--')) { args[key.slice(2)] = value; index += 1; }
  }
  return args;
}

function currentBranch() {
  try {
    return childProcess.execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

function assertWritableBranch() {
  const branch = currentBranch();
  if (!branch || branch === 'master' || branch === 'main') throw new Error('Material Forge writes are forbidden on master/main');
}

function compile() {
  const result = compileRegistry({ root: ROOT, verifyFiles: true });
  if (!result.ok) throw new Error(`Material Forge validation failed:\n- ${result.errors.join('\n- ')}`);
  return { registry: result.registry, text: stableStringify(result.registry) };
}

function writeRegistry() {
  assertWritableBranch();
  const result = compile();
  fs.writeFileSync(REGISTRY_FILE, result.text);
  return result.registry;
}

function checkRegistry() {
  const result = compile();
  if (!fs.existsSync(REGISTRY_FILE)) throw new Error('compiled registry is missing; run npm run material-forge:compile');
  const actual = fs.readFileSync(REGISTRY_FILE, 'utf8');
  if (actual !== result.text) throw new Error('compiled registry drifted; run npm run material-forge:compile');
  return result.registry;
}

function importMaterial(args) {
  assertWritableBranch();
  const required = ['source', 'id', 'name', 'class', 'author', 'license'];
  const missing = required.filter(key => !args[key]);
  if (missing.length) throw new Error(`missing import arguments: ${missing.map(key => `--${key}`).join(', ')}`);
  const manifest = importArmorPaintFolder({
    root: ROOT,
    sourceDirectory: args.source,
    id: args.id,
    displayName: args.name,
    materialClass: args.class,
    author: args.author,
    license: args.license,
    projectFile: args.project || `${args.id}.arm`,
    mapping: args.mapping || 'triplanar',
    semantics: args.semantics ? args.semantics.split(',').map(item => item.trim()).filter(Boolean) : [args.class],
    worlds: args.worlds ? args.worlds.split(',').map(item => item.trim()).filter(Boolean) : ['*'],
    roughness: args.roughness,
    metalness: args.metalness,
    normalStrength: args['normal-strength'],
    aoStrength: args['ao-strength'],
    emissiveIntensity: args['emissive-intensity'],
    tilingScale: args['tiling-scale'],
    blend: args.blend,
    priority: args.priority
  });
  fs.mkdirSync(MANIFEST_DIRECTORY, { recursive: true });
  const output = path.join(MANIFEST_DIRECTORY, `${manifest.id}.json`);
  fs.writeFileSync(output, stableStringify(manifest));
  const registry = writeRegistry();
  return { manifest, output, registry };
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.command === 'import') {
    const result = importMaterial(args);
    console.log(`[MATERIAL_FORGE] imported ${result.manifest.id}; materials=${Object.keys(result.registry.materials).length}`);
    return;
  }
  const registry = args.command === 'write' ? writeRegistry() : checkRegistry();
  console.log(`[MATERIAL_FORGE] ${args.command === 'write' ? 'compiled' : 'PASS'} materials=${Object.keys(registry.materials).length} source=${registry.sourceHash.slice(0, 12)}`);
}

try { main(); }
catch (error) {
  console.error(`[MATERIAL_FORGE] ${error.message}`);
  process.exit(1);
}
