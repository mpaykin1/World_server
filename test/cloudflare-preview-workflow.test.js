'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/cloudflare-preview.yml'), 'utf8');

test('Cloudflare preview checks out the exact PR head instead of a synthetic merge ref', () => {
  const exactRef = 'ref: ' + '$' + '{{ github.event.pull_request.head.sha || github.sha }}';
  assert.match(workflow, /- uses: actions\/checkout@v4\s+with:/);
  assert.ok(workflow.includes(exactRef));
  assert.ok(workflow.includes('SOURCE_SHA: ' + '$' + '{{ github.event.pull_request.head.sha || github.sha }}'));
});

test('Cloudflare deploy waits for verified activation before full stack and browser checks', () => {
  const wait = workflow.indexOf('node scripts/wait-for-cloudflare-deploy.cjs');
  const stack = workflow.indexOf('node scripts/verify-cloudflare-stack.cjs');
  const browser = workflow.indexOf('npm run delivery:verify');
  assert.ok(wait > 0 && stack > wait && browser > stack);
  assert.ok(workflow.includes('Fail closed when Cloudflare credentials are unavailable'));
});
