'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname,'..','apps','catalog','client.js'),'utf8');

test('catalog starts rendering without blocking on AppCore/Supabase network init', () => {
  assert.doesNotMatch(src, /await\s+window\.AppCore\.init\('catalog'\)/);
  assert.match(src, /const appCoreReady = window\.AppCore\.init\('catalog'\)\.catch/);
});

test('catalog has mobile GPU budget and adaptive DPR regression guard', () => {
  assert.match(src, /const isMobileGpu = matchMedia\('\(pointer: coarse\)'\)/);
  assert.match(src, /initialDprCap = isMobileGpu \? 1\.15/);
  assert.match(src, /function adaptRenderDpr\(now\)/);
  assert.match(src, /fps<28 && renderDpr>0\.75/);
  assert.match(src, /renderer\.shadowMap\.enabled = !isMobileGpu && !lowCpu/);
});

test('catalog avoids unnecessary ground tessellation and mobile lightning bursts', () => {
  assert.match(src, /PlaneGeometry\(1500,1500,1,1\)/);
  assert.match(src, /const typesPerBurst = isMobileGpu \? 1/);
});
