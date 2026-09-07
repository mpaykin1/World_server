'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateCloudflareDeployment } = require('../scripts/validate-cloudflare-deploy');

const ROOT_DIR = path.resolve(__dirname, '..');

test('Cloudflare deployment validator succeeds on valid wrangler.json and auto-builds dist', () => {
  const result = validateCloudflareDeployment(ROOT_DIR);
  assert.equal(result.success, true);
  assert.equal(result.staticDir, 'dist');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'dist', 'index.html')));
});
