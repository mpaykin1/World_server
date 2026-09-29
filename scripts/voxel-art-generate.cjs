#!/usr/bin/env node
'use strict';
// Reproducible CPU-first Blender GLB export. No MCP or paid API required.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'tools/voxel-art/generate_blender.py');
const out = path.join(root, 'apps/voxel-world/voxel-art');
const candidates = [
  process.env.BLENDER_BIN,
  process.platform === 'win32' ? 'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe' : null,
  process.platform === 'win32' ? 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe' : null,
  'blender',
].filter(Boolean);
const selected = candidates.find(bin => {
  if (path.isAbsolute(bin)) return fs.existsSync(bin);
  const found = cp.spawnSync(bin, ['--version'], {encoding:'utf8',timeout:15000,windowsHide:true});
  return !found.error && found.status === 0;
});
if (!selected) {
  console.error('Blender 5.1+ not found. Install Blender or set BLENDER_BIN to blender.exe.');
  process.exit(2);
}
const forward = process.argv.slice(2);
const args = ['--background', '--factory-startup', '--python', script,
  '--', '--out', out, ...forward];
console.log('[VOXEL_ART] Blender:', selected, 'output:', path.relative(root,out));
const result = cp.spawnSync(selected, args, {
  cwd:root,stdio:'inherit',timeout:240000,windowsHide:true,
});
if (result.error) {console.error(result.error.message);process.exit(1);}
if (result.status !== 0) process.exit(result.status ?? 1);
const manifest = path.join(out, 'manifest.json');
if (!fs.existsSync(manifest)) {console.error('Blender returned success without manifest');process.exit(1);}
console.log('[VOXEL_ART] exported', JSON.parse(fs.readFileSync(manifest,'utf8')).entities.length,'original models');
