'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareReferenceRuntime } = require('../lib/reference-fidelity');

function constantImage(width, height, value = 120) {
  return { width, height, pixels: Uint8Array.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? 255 : value) };
}

test('same visual state remains perfect across viewport sizes', () => {
  const result = compareReferenceRuntime(constantImage(4, 4), constantImage(2, 2));
  assert.equal(result.score, 1);
  assert.equal(result.resampled, true);
  assert.equal(result.comparisonWidth, 2);
  assert.equal(result.comparisonHeight, 2);
  assert.equal(result.method, 'cpu-rgba-resample-color-edge-v2');
});

test('counterfactual visual change remains detectable after normalization', () => {
  const reference = constantImage(4, 4, 120);
  const changed = constantImage(2, 2, 120);
  changed.pixels[0] = 255; changed.pixels[1] = 0; changed.pixels[2] = 0;
  const result = compareReferenceRuntime(reference, changed);
  assert.ok(result.score < 1);
  assert.ok(result.identityFidelity < 1);
});
