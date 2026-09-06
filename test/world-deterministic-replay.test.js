'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {actualStateReplay}=require('../scripts/world-deterministic-replay');
test('world deterministic replay reconstructs a real persisted resource delta',()=>{const r=actualStateReplay();assert.equal(r.exact,true);assert.equal(r.productionPath,'lib/game-rules.js::generateChunk')});
test('world deterministic replay negative control detects wrong resource identity',()=>assert.equal(actualStateReplay().wrongControlMismatch,true));
