'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'node_modules', 'three');
const pkgPath = path.join(sourceRoot, 'package.json');
const targetDir = path.join(root, 'apps', 'voxel-world', 'vendor');

if (!fs.existsSync(pkgPath)) {
  throw new Error('three is not installed. Run: npm install --no-save --package-lock=false three@0.165.0');
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version !== '0.165.0') throw new Error(`Expected three 0.165.0, got ${pkg.version}`);

const sourceBuild = path.join(sourceRoot, 'build', 'three.module.min.js');
const sourceLicense = path.join(sourceRoot, 'LICENSE');
if (!fs.existsSync(sourceBuild) || !fs.existsSync(sourceLicense)) throw new Error('Official three package is missing build or LICENSE.');

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sourceBuild, path.join(targetDir, 'three.module.min.js'));
fs.copyFileSync(sourceLicense, path.join(targetDir, 'THREE_LICENSE'));
const bytes = fs.statSync(path.join(targetDir, 'three.module.min.js')).size;
if (bytes < 500000) throw new Error(`Vendored Three.js unexpectedly small (${bytes} bytes).`);
console.log(`[VOXEL] Vendored Three.js ${pkg.version}: ${bytes} bytes`);
