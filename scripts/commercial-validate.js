'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const standard = read('data/commercial-standard.json');
const registry = read('data/home-experiments.json');

let errors = [];
for (const [name, profile] of Object.entries(standard.profiles || {})) {
  const sum = Object.values(profile.criteria || {}).reduce((a,b)=>a+b,0);
  if (sum !== 100) errors.push(`${name}: rubric sum=${sum}, expected 100`);
}
if (registry.policy !== 'append-only-library') errors.push('home registry must be append-only-library');
if (registry.currentPrimary && !registry.experiments[registry.currentPrimary]) errors.push('currentPrimary points to missing experiment');
for (const id of registry.activeExperiments || []) {
  if (!registry.experiments[id]) errors.push(`active experiment missing: ${id}`);
}
for (const [id, exp] of Object.entries(registry.experiments || {})) {
  if (id !== exp.id) errors.push(`${id}: id mismatch`);
  if (!standard.profiles[exp.profile || 'surface']) errors.push(`${id}: unknown profile`);
  if (!exp.path) errors.push(`${id}: missing path`);
}
if (errors.length) {
  console.error('COMMERCIAL STANDARD STRUCTURE FAIL');
  errors.forEach(e=>console.error(' -',e));
  process.exit(1);
}
console.log('COMMERCIAL STANDARD STRUCTURE: PASS');
console.log('NOTE: this validates structure/history safety only; commercial scores never block release.');
