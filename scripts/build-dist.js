#!/usr/bin/env node

/**
 * Builds the static dist directory for static asset hosting platforms (e.g. Cloudflare Workers / Pages).
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function buildDist() {
  console.log('[Build Dist] Preparing static dist folder...');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const dirsToCopy = ['apps', 'shared', 'data', 'api', 'templates'];
  for (const dir of dirsToCopy) {
    const srcDir = path.join(ROOT_DIR, dir);
    const destDir = path.join(DIST_DIR, dir);
    if (fs.existsSync(srcDir)) {
      copyDirSync(srcDir, destDir);
    }
  }

  const filesToCopy = ['index.html', 'favicon.ico'];
  for (const file of filesToCopy) {
    const srcFile = path.join(ROOT_DIR, file);
    const destFile = path.join(DIST_DIR, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
    }
  }

  console.log('[Build Dist] Static dist directory successfully built at:', DIST_DIR);
}

if (require.main === module) {
  buildDist();
}

module.exports = { buildDist };
