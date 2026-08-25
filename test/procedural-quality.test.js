'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const apiPath = path.resolve(__dirname, '..', 'api', 'procedural-quality-profile.js');
const api = require(apiPath);

test('profile chooses cinematic for strong WebGPU device', () => {
  const p = api.buildProfile({ webgpu:'1', webgl2:'1', memory:'8', cores:'8', dpr:'2' });
  assert.equal(p.tier, 'cinematic');
  assert.equal(p.policy.adaptiveQuality, true);
});

test('reduced motion always chooses safe', () => {
  const p = api.buildProfile({ webgpu:'1', memory:'16', cores:'16', reducedMotion:'1' });
  assert.equal(p.tier, 'safe');
});

test('webgl2 fallback is balanced', () => {
  const p = api.buildProfile({ webgpu:'0', webgl2:'1', memory:'4', cores:'4' });
  assert.equal(p.tier, 'balanced');
});
