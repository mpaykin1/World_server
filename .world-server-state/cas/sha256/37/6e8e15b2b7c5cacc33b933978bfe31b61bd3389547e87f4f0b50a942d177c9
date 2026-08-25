'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'integrate-runtime-adapters.js'), 'utf8');

test('runtime adapter integrator is idempotent and certified-game scoped', () => {
  assert.match(script, /certified/);
  assert.match(script, /WORLD_SERVER_RUNTIME_ADAPTER:START/);
  assert.match(script, /already-integrated/);
  assert.match(script, /WorldServerPWA\?\.registerRenderer/);
});

test('AI3D adapter bridges common quality to existing profiles', () => {
  assert.match(script, /performance: 'SAFE'/);
  assert.match(script, /ultra: 'ULTRA'/);
  assert.match(script, /updateStreaming\(true\)/);
});


test('V4 integrates shader/stutter, predictive streaming and rig discovery', () => {
  assert.match(script, /WorldServerStutterProfiler/);
  assert.match(script, /WorldServerPredictiveStreaming/);
  assert.match(script, /WORLD_SERVER_PREDICTIVE_CHUNK_CENTER/);
  assert.match(script, /WorldServerRigAdapters\?\.scanScene/);
  assert.match(script, /loadNeededChunks/);
});
