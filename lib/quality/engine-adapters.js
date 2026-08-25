'use strict';

const fs = require('node:fs');
const path = require('node:path');

function detectEngine(project) {
  const files = project.files.map(f => path.basename(f).toLowerCase());
  if (files.includes('project.godot') || project.files.some(f => /\.gd$/i.test(f))) return { engine: 'godot', version: readGodotVersion(project) };
  if (project.files.some(f => /\.(rbxlx|rbxl|luau)$/i.test(f))) return { engine: 'roblox', version: 'unknown' };
  if (project.files.some(f => /\.(html|wasm|js)$/i.test(f))) return { engine: 'webgl', version: 'browser' };
  return { engine: 'generic', version: 'unknown' };
}
function readGodotVersion(project) {
  const f = project.files.find(x => path.basename(x).toLowerCase() === 'project.godot');
  if (!f || !fs.existsSync(f)) return 'unknown';
  const t = fs.readFileSync(f, 'utf8');
  const m = t.match(/config\/features\s*=\s*PackedStringArray\(([^\n]+)/);
  return m ? m[1].replace(/["\[\]]/g, '').trim().slice(0, 80) : 'unknown';
}
function goldenCompatible(golden, engineInfo) {
  if (!golden) return false;
  if (golden.engines && !golden.engines.includes(engineInfo.engine)) return false;
  if (golden.expiresAt && Date.parse(golden.expiresAt) < Date.now()) return false;
  return true;
}
module.exports = { detectEngine, goldenCompatible };
