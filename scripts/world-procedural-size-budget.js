'use strict';
const fs = require('fs');
const path = require('path');
const roots = ['lib', 'shared', 'scripts', 'test', 'data', 'docs'];
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/world-procedural/i.test(entry.name)) files.push(file);
  }
}
for (const root of roots) walk(path.join(process.cwd(), root));
const rows = files.map((file) => ({ file: path.relative(process.cwd(), file).replace(/\\/g, '/'), bytes: fs.statSync(file).size }));
const totalBytes = rows.reduce((sum, r) => sum + r.bytes, 0);
const budgetBytes = 512 * 1024;
const status = totalBytes <= budgetBytes ? 'PASS' : 'FAIL';
console.log(JSON.stringify({ system: 'WORLD_PROCEDURAL_SIZE_BUDGET', status, totalBytes, budgetBytes, files: rows.length, largest: rows.sort((a,b)=>b.bytes-a.bytes).slice(0,10) }, null, 2));
if (status !== 'PASS') process.exitCode = 1;
