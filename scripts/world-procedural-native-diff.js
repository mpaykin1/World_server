'use strict';
const fs = require('fs');
const path = require('path');
const { generateVoxelChunk } = require('../shared/world-procedural-core');
const { makeNativeContractReport, compareNativeReports } = require('../lib/world-procedural-native-contract');

function parseArgs(argv) {
  const out = { strict: false, report: null, writeReference: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--strict') out.strict = true;
    else if (argv[i] === '--report') out.report = argv[++i];
    else if (argv[i] === '--write-reference') out.writeReference = argv[++i];
  }
  return out;
}
function buildReference(root = process.cwd()) {
  const vectorPath = path.join(root, 'data', 'world-procedural-golden-vectors.json');
  const vectorData = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
  const vector = (vectorData.vectors || vectorData)[0];
  if (!vector?.recipe || !Array.isArray(vector.chunks)) throw new Error('golden vector file has no usable vector');
  const chunks = vector.chunks.map((c) => generateVoxelChunk(vector.recipe, c.x, c.z, vector.generatorOptions || {}));
  return makeNativeContractReport(chunks, { engineVersion: vector.recipe.engineVersion, platform: 'node-reference' });
}
function main() {
  const args = parseArgs(process.argv);
  const root = process.cwd();
  const reference = buildReference(root);
  if (args.writeReference) fs.writeFileSync(path.resolve(args.writeReference), JSON.stringify(reference, null, 2) + '\n');
  if (!args.report) {
    const result = { ok: !args.strict, status: args.strict ? 'NATIVE_REPORT_REQUIRED' : 'REFERENCE_READY', checked: reference.chunks.length };
    console.log(JSON.stringify(result, null, 2));
    if (args.strict) process.exitCode = 2;
    return;
  }
  const nativeReport = JSON.parse(fs.readFileSync(path.resolve(args.report), 'utf8'));
  const result = compareNativeReports(reference, nativeReport);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
if (require.main === module) main();
module.exports = { parseArgs, buildReference };
