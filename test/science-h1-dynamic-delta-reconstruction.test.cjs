'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('../scripts/science-h1-dynamic-delta-reconstruction.cjs');
test('RUN_059 exactly reconstructs every modified survival window',()=>assert.equal(run().criterion.exactAll,true));
test('RUN_059 wrong-resource-ID control breaks reconstruction',()=>assert.equal(run().criterion.controlMismatchAll,true));
test('RUN_059 sparse descriptor beats Brotli-compressed explicit state at largest scale',()=>assert.ok(run().criterion.minLargestRatio>=8));
test('RUN_059 descriptor tracks sparse edits while full state scales',()=>{const r=run();assert.ok(r.criterion.maxLargestEditRate<=.03);assert.ok(r.criterion.medianDescriptorGrowth<=4.8);assert.ok(r.criterion.medianExplicitGrowth>=3.2)});
test('RUN_059 full preregistered criterion passes',()=>assert.equal(run().pass,true));
