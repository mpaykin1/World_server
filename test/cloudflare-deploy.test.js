'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateCloudflareDeployment } = require('../scripts/validate-cloudflare-deploy');
const { isDeployableFile } = require('../scripts/check-vercel-ignore');

const ROOT_DIR = path.resolve(__dirname, '..');

test('Cloudflare deployment configuration - wrangler.json exists and is valid', () => {
  const wranglerPath = path.join(ROOT_DIR, 'wrangler.json');
  assert.ok(fs.existsSync(wranglerPath), 'wrangler.json must exist in project root');

  const content = fs.readFileSync(wranglerPath, 'utf8');
  const config = JSON.parse(content);

  assert.equal(config.name, 'world-server');
  assert.ok(config.compatibility_date, 'compatibility_date must be set');

  const staticDir = (config.assets && config.assets.directory) || config.pages_build_output_dir;
  assert.ok(staticDir, 'Explicit static assets directory must be configured in wrangler.json');
});

test('Cloudflare entry HTML - root index.html exists and redirects to /apps/catalog/', () => {
  const indexPath = path.join(ROOT_DIR, 'index.html');
  assert.ok(fs.existsSync(indexPath), 'Root index.html must exist');

  const content = fs.readFileSync(indexPath, 'utf8');
  assert.match(content, /\/apps\/catalog\//, 'index.html must redirect or link to /apps/catalog/');
});

test('Predeploy validation - passes for current codebase', () => {
  const result = validateCloudflareDeployment(ROOT_DIR);
  assert.equal(result.success, true);
  assert.equal(result.configPath, 'wrangler.json');
});

test('Predeploy validation - fails gracefully when wrangler config is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-test-'));
  try {
    assert.throws(
      () => validateCloudflareDeployment(tmpDir),
      /No wrangler.json or wrangler.toml found/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Predeploy validation - fails when static directory is missing entry index.html', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-test-'));
  try {
    const wranglerConfig = {
      name: 'test-app',
      compatibility_date: '2024-09-02',
      assets: { directory: 'static_dist' }
    };
    fs.writeFileSync(path.join(tmpDir, 'wrangler.json'), JSON.stringify(wranglerConfig));
    fs.mkdirSync(path.join(tmpDir, 'static_dist'));

    assert.throws(
      () => validateCloudflareDeployment(tmpDir),
      /missing entry index.html/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Vercel compatibility - wrangler.json and index.html deployability', () => {
  assert.equal(isDeployableFile('wrangler.json'), true, 'wrangler.json should trigger Vercel build if changed');
  assert.equal(isDeployableFile('index.html'), true, 'index.html should trigger Vercel build if changed');
});
