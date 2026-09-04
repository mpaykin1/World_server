'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const loop = require('../scripts/native-regression-loop.js');

test('readHistory: real round-trip through appendHistory, survives a fresh read', () => {
  const before = loop.readHistory(1000).length;
  loop.appendHistory({ status: 'PASS', ok: true, test: true });
  const after = loop.readHistory(1000);
  assert.equal(after.length, before + 1);
  assert.equal(after[after.length - 1].status, 'PASS');
});

test('run: reports NOT_APPLICABLE (not a failure) when the Godot binary is not present on this host', () => {
  const godotNativeBuild = require('../scripts/godot-native-build.js');
  if (fs.existsSync(godotNativeBuild.GODOT_BIN)) {
    // Real Godot is installed on this dev machine - the NOT_APPLICABLE path
    // can't be exercised without faking the binary path, which would
    // require monkeypatching a required module. Skip rather than fake it.
    return;
  }
  const result = loop.run();
  assert.equal(result.status, 'NOT_APPLICABLE');
  assert.equal(result.ok, null);
});
