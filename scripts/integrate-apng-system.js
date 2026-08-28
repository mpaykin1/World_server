'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function writeIfChanged(file, next) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current === next) return false;
  fs.writeFileSync(file, next, 'utf8');
  return true;
}

function patchServer() {
  const file = path.join(ROOT, 'server.js');
  if (!fs.existsSync(file)) throw new Error('server.js not found');
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes("['/api/apng', require('./api/apng')]")) return false;
  const marker = 'const apiHandlers = new Map([';
  const start = text.indexOf(marker);
  if (start < 0) throw new Error('server.js apiHandlers map not found; refusing unsafe patch');
  const close = text.indexOf(']);', start);
  if (close < 0) throw new Error('server.js apiHandlers map end not found; refusing unsafe patch');
  let prefix = text.slice(0, close).replace(/\s+$/, '');
  const suffix = text.slice(close);
  if (!prefix.endsWith(',')) prefix += ',';
  text = `${prefix}\n  ['/api/apng', require('./api/apng')]\n${suffix}`;
  return writeIfChanged(file, text);
}

function patchPackage() {
  const file = path.join(ROOT, 'package.json');
  if (!fs.existsSync(file)) throw new Error('package.json not found');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.scripts ||= {};
  pkg.scripts['apng:test'] = 'node --test test/apng-engine.test.js test/apng-api.test.js test/apng-integration.test.js test/apng-gate.test.js';
  pkg.scripts['apng:browser'] = 'playwright test e2e/apng-browser-compat.spec.js --config=playwright.apng.config.js';
  pkg.scripts['apng:verify'] = 'npm run apng:test && npm run apng:check';
  pkg.scripts['apng:check'] = 'node scripts/apng-quality-gate.js';
  pkg.scripts['apng:fix'] = 'node scripts/apng-quality-gate.js --apply';
  if (typeof pkg.scripts['release:gate'] === 'string') {
    if (!pkg.scripts['release:gate'].includes('npm run apng:check')) pkg.scripts['release:gate'] += ' && npm run apng:check';
    if (pkg.scripts['quality:master-report'] && !pkg.scripts['release:gate'].includes('npm run quality:master-report')) pkg.scripts['release:gate'] += ' && npm run quality:master-report';
  }
  return writeIfChanged(file, JSON.stringify(pkg, null, 2) + '\n');
}

function patchQualityMasterReport() {
  const file = path.join(ROOT, 'scripts', 'quality-master-report.js');
  if (!fs.existsSync(file)) return false;
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes("apngQuality:load('APNG_QUALITY_REPORT.json')")) return false;
  const marker = "governance:load('QUALITY_REPORT.json')";
  if (!text.includes(marker)) throw new Error('quality-master-report.js marker not found; refusing unsafe patch');
  text = text.replace(marker, "apngQuality:load('APNG_QUALITY_REPORT.json'),\n "+marker);
  return writeIfChanged(file, text);
}

const changed = [];
if (patchServer()) changed.push('server.js');
if (patchPackage()) changed.push('package.json');
if (patchQualityMasterReport()) changed.push('scripts/quality-master-report.js');
console.log(`[APNG integrate] ${changed.length ? `updated ${changed.join(', ')}` : 'already integrated'}`);
