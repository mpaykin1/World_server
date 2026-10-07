'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const paths = require('../lib/world-server-paths');
const scheduler = require('../lib/ai-resource-scheduler');

test('source root is derived from the current checkout, never a machine-specific literal', () => {
  assert.equal(paths.SOURCE_ROOT, path.resolve(__dirname, '..'));
  assert.ok(fs.existsSync(path.join(paths.SOURCE_ROOT, 'package.json')));
  assert.doesNotMatch(paths.SOURCE_ROOT, /^C:\\Users\\user\\Desktop\\World_server$/i);
});

test('durable queue executable is always resolved from the current checkout', () => {
  const expected = path.join(paths.SOURCE_ROOT, 'scripts', 'durable-job-queue.cjs');
  assert.equal(path.resolve(scheduler.QUEUE_SCRIPT), path.resolve(expected));
  assert.ok(fs.existsSync(scheduler.QUEUE_SCRIPT));
});

test('canonical main tree is auto-discovered and contains the git project', () => {
  const root = paths.resolveMainTreeRoot();
  assert.ok(root);
  assert.ok(fs.existsSync(path.join(root, 'package.json')));
});
