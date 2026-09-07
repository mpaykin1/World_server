#!/usr/bin/env node

/**
 * Predeploy validation script for Cloudflare deployment.
 * Ensures wrangler.json / wrangler.toml exists with an explicit static asset directory,
 * and verifies that the directory exists on disk with the expected entry HTML file.
 * Auto-builds the dist directory if needed.
 */

const fs = require('fs');
const path = require('path');
const { buildDist } = require('./build-dist');

const ROOT_DIR = path.resolve(__dirname, '..');

function validateCloudflareDeployment(rootDir = ROOT_DIR) {
  const wranglerJsonPath = path.join(rootDir, 'wrangler.json');
  const wranglerTomlPath = path.join(rootDir, 'wrangler.toml');

  let configPath = null;
  let staticDir = null;

  if (fs.existsSync(wranglerJsonPath)) {
    configPath = wranglerJsonPath;
    const content = fs.readFileSync(wranglerJsonPath, 'utf8');
    let config;
    try {
      config = JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to parse wrangler.json: ${err.message}`);
    }

    if (config.assets && typeof config.assets === 'object' && config.assets.directory) {
      staticDir = config.assets.directory;
    } else if (typeof config.assets === 'string') {
      staticDir = config.assets;
    } else if (config.pages_build_output_dir) {
      staticDir = config.pages_build_output_dir;
    } else {
      throw new Error('wrangler.json missing explicit static assets directory configuration (assets.directory or pages_build_output_dir).');
    }
  } else if (fs.existsSync(wranglerTomlPath)) {
    configPath = wranglerTomlPath;
    const content = fs.readFileSync(wranglerTomlPath, 'utf8');
    const assetsMatch = content.match(/directory\s*=\s*["']([^"']+)["']/i) ||
                        content.match(/pages_build_output_dir\s*=\s*["']([^"']+)["']/i) ||
                        content.match(/assets\s*=\s*["']([^"']+)["']/i);
    if (assetsMatch) {
      staticDir = assetsMatch[1];
    } else {
      throw new Error('wrangler.toml missing explicit static assets directory configuration.');
    }
  } else {
    throw new Error('No wrangler.json or wrangler.toml found in project root.');
  }

  let resolvedStaticDir = path.resolve(rootDir, staticDir);
  let indexHtmlPath = path.join(resolvedStaticDir, 'index.html');

  // Auto-build dist if configured staticDir is dist and dist/index.html is missing
  if (staticDir === 'dist') {
    if (!fs.existsSync(resolvedStaticDir) || !fs.existsSync(indexHtmlPath)) {
      buildDist(rootDir);
    }
  }

  if (!fs.existsSync(resolvedStaticDir)) {
    throw new Error(`Configured Cloudflare static assets directory does not exist: ${resolvedStaticDir}`);
  }

  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(`Configured Cloudflare static assets directory missing entry index.html: ${indexHtmlPath}`);
  }

  const catalogHtmlPath = path.join(rootDir, 'apps', 'catalog', 'index.html');
  if (!fs.existsSync(catalogHtmlPath)) {
    throw new Error(`Expected catalog entry index.html missing: ${catalogHtmlPath}`);
  }

  return {
    success: true,
    configPath: path.relative(rootDir, configPath),
    staticDir,
    resolvedStaticDir,
    indexHtmlPath: path.relative(rootDir, indexHtmlPath)
  };
}

function main() {
  try {
    const result = validateCloudflareDeployment();
    console.log('[Cloudflare Predeploy Check] PASS: Cloudflare deployment configuration is valid.');
    console.log(`  - Config file: ${result.configPath}`);
    console.log(`  - Configured static directory: "${result.staticDir}" (${result.resolvedStaticDir})`);
    console.log(`  - Entry HTML verified: ${result.indexHtmlPath}`);
    process.exit(0);
  } catch (err) {
    console.error(`[Cloudflare Predeploy Check] FAIL: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateCloudflareDeployment
};
