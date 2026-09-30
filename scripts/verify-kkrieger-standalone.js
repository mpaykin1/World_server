#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/verify-kkrieger-standalone.js <kkrieger.html>');
  process.exit(2);
}
const abs = path.resolve(file);
if (!fs.existsSync(abs)) {
  console.error(`FAIL: missing ${abs}`);
  process.exit(3);
}
const html = fs.readFileSync(abs, 'utf8');
const size = Buffer.byteLength(html);
const failures = [];

if (size < 500000) failures.push(`HTML suspiciously small: ${size} bytes`);
if (!/\.kkrieger/i.test(html)) failures.push('missing .kkrieger marker');
if (!/(AGFzbQ|data:application\/octet-stream;base64|wasmBinary)/.test(html)) failures.push('no embedded WebAssembly marker found');
if (/<script[^>]+src\s*=\s*["'][^"']+["']/i.test(html)) failures.push('external script src present');
if (/<link[^>]+href\s*=\s*["']https?:/i.test(html)) failures.push('external stylesheet/resource link present');
if (/<img[^>]+src\s*=\s*["']https?:/i.test(html)) failures.push('external image present');
if (/fetch\s*\(\s*["'][^"']+\.(?:wasm|data)["']/i.test(html)) failures.push('runtime fetch of wasm/data present');
if (/WebAssembly\.instantiateStreaming\s*\(\s*fetch\s*\(/i.test(html)) failures.push('streaming fetch for wasm present');

const result = {
  schema: 'kkrieger-standalone-audit-v1',
  file: abs,
  bytes: size,
  externalRuntimeSubresources: failures.filter((x) => /external|fetch|streaming/i.test(x)).length,
  pass: failures.length === 0,
  failures
};
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exit(4);
