'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWrite } = require('../scripts/integration-utils.cjs');

test('atomicWrite retries transient Windows rename failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-atomic-'));
  const file = path.join(dir, 'report.json');
  const originalRename = fs.renameSync;
  let attempts = 0;
  fs.renameSync = (...args) => {
    attempts += 1;
    if (attempts <= 2) {
      const error = new Error('simulated transient Windows lock');
      error.code = 'EPERM';
      throw error;
    }
    return originalRename(...args);
  };
  try {
    atomicWrite(file, '{"pass":true}\n');
    assert.equal(fs.readFileSync(file, 'utf8'), '{"pass":true}\n');
    assert.equal(attempts, 3);
  } finally {
    fs.renameSync = originalRename;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});