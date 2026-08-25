 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const profile=require('../api/procedural-quality-profile.js');
test('cinematic profile on strong WebGPU device',()=>{const p=profile.buildProfile({webgpu:'1',memory:'8',cores:'8',dpr:'2'});assert.equal(p.tier,'cinematic');assert.equal(p.policy.webgpuTemporalEnhancer,true)});
test('safe profile honors reduced motion',()=>assert.equal(profile.chooseTier({webgpu:'1',memory:'16',cores:'16',reducedMotion:'1'}),'safe'));
