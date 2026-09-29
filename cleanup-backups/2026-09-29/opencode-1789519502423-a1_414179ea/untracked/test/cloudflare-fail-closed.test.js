'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { assertCloudflarePreviewFailClosed } = require('../lib/cloudflare-fail-closed.js');

const currentMasterWorkflow = fs
  .readFileSync(path.join(root, '.github', 'workflows', 'cloudflare-preview.yml'), 'utf8')
  .replace(/^\uFEFF/, '');

const BYPASS_WORKFLOW = `
name: Cloudflare Exact-Head Preview (historical bypass fixture)
on:
  pull_request:
    branches: [master]
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
jobs:
  deploy-and-verify:
    steps:
      - id: authority
        name: Detect Cloudflare deployment authority
        run: |
          if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
            echo "configured=true"
          else
            echo "configured=false"
          fi
      - name: Deploy isolated exact-head worker
        if: steps.authority.outputs.configured == 'true'
        run: npx wrangler@4.45.0 deploy
      - name: Verify Cloudflare stack and security
        if: steps.authority.outputs.configured == 'true'
        run: node scripts/verify-cloudflare-stack.cjs
      - name: Verify Netlify PR fallback when Cloudflare credentials are unavailable
        if: steps.authority.outputs.configured != 'true'
        run: echo "green fallback (bypass class #91/#113)"
`;

const SKIP_ONLY_WORKFLOW = `
name: Cloudflare Exact-Head Preview (skip-without-fail fixture)
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
jobs:
  deploy-and-verify:
    steps:
      - id: authority
        name: Detect Cloudflare deployment authority
        run: echo "configured=false"
      - name: Deploy isolated exact-head worker
        if: steps.authority.outputs.configured == 'true'
        run: npx wrangler@4.45.0 deploy
      - name: Verify Cloudflare stack and security
        if: steps.authority.outputs.configured == 'true'
        run: node scripts/verify-cloudflare-stack.cjs
      - name: Verify exact-head Cloudflare playable delivery
        if: steps.authority.outputs.configured == 'true'
        run: npm run delivery:verify
`;

test('current master cloudflare preview workflow is fail-closed', () => {
  const result = assertCloudflarePreviewFailClosed(currentMasterWorkflow);
  assert.equal(result.ok, true, `unexpected errors: ${result.errors.join(', ')}`);
  assert.deepEqual(result.errors, []);
});

test('Netlify-fallback green bypass (class #91/#113) is detected and rejected', () => {
  const result = assertCloudflarePreviewFailClosed(BYPASS_WORKFLOW);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('NETLIFY_FALLBACK_GREEN_PRESENT'));
  assert.ok(result.errors.includes('MISSING_FAIL_CLOSED_STEP'));
});

test('skip-without-fail-closed (missing credentials skip) is detected and rejected', () => {
  const result = assertCloudflarePreviewFailClosed(SKIP_ONLY_WORKFLOW);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('MISSING_FAIL_CLOSED_STEP'));
  assert.ok(result.errors.includes('FAIL_CLOSED_CONDITION_MISSING'));
  assert.ok(result.errors.includes('FAIL_CLOSED_EXIT_MISSING'));
});

test('empty workflow is rejected', () => {
  const result = assertCloudflarePreviewFailClosed('');
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});