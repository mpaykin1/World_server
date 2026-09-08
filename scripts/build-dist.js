#!/usr/bin/env node

/**
 * Builds the static dist directory for static asset hosting platforms (e.g. Cloudflare Workers / Pages).
 */

const fs = require('fs');
const path = require('path');

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

function buildDist(targetRootDir) {
  const rootDir = path.resolve(targetRootDir || path.resolve(__dirname, '..'));
  const distDir = path.join(rootDir, 'dist');

  console.log('[Build Dist] Preparing static dist folder at:', distDir);
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  const dirsToCopy = ['apps', 'shared', 'data', 'api', 'templates'];
  for (const dir of dirsToCopy) {
    const srcDir = path.join(rootDir, dir);
    const destDir = path.join(distDir, dir);
    if (fs.existsSync(srcDir)) {
      copyDirSync(srcDir, destDir);
    }
  }

  const filesToCopy = ['index.html', 'favicon.ico'];
  for (const file of filesToCopy) {
    const srcFile = path.join(rootDir, file);
    const destFile = path.join(distDir, file);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
    }
  }

  console.log('[Build Dist] Static dist directory successfully built at:', distDir);
}

if (require.main === module) {
  buildDist();
}

module.exports = { buildDist };
