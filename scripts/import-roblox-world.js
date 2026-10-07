'use strict';

const fs = require('fs');
const path = require('path');
const { importRbxlx } = require('../lib/roblox-importer');

const MAX_BYTES = 50 * 1024 * 1024;

function usage() {
  return 'Usage: node scripts/import-roblox-world.js <game.rbxlx> [--out result.json] [--summary]';
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const input = args.find((item) => !item.startsWith('--'));
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args[outIndex + 1] : null;
  return { input, out, summary: args.includes('--summary') };
}

function readInput(file) {
  if (!file || path.extname(file).toLowerCase() !== '.rbxlx') throw new Error(usage());
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('Input must be a file');
  if (stat.size > MAX_BYTES) throw new Error(`RBXLX exceeds ${MAX_BYTES} bytes`);
  return fs.readFileSync(file, 'utf8');
}

function safeWrite(output, data) {
  const target = path.resolve(output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temp, data, 'utf8');
  fs.renameSync(temp, target);
}

function main() {
  const args = parseArgs(process.argv);
  const result = importRbxlx(readInput(args.input));
  const payload = args.summary ? result.summary : result;
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.out) safeWrite(args.out, json); else process.stdout.write(json);
}

try { main(); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
