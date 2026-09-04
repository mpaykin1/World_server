'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const taxonomy = require('../lib/failure-taxonomy');

test('classifyFailure: ok is not a failure at all', () => {
  const r = taxonomy.classifyFailure('ok');
  assert.equal(r.taxonomyKey, null);
});

test('classifyFailure: a real historical local-Ollama "timeout" maps to the model layer by default', () => {
  const r = taxonomy.classifyFailure('timeout');
  assert.equal(r.taxonomyKey, 'MODEL_TIMEOUT');
  assert.equal(r.layer, 'model');
});

test('classifyFailure: no_scope (context compiler gave nothing usable) is a pipeline problem, not a model one', () => {
  const r = taxonomy.classifyFailure('no_scope');
  assert.equal(r.taxonomyKey, 'TARGET_MISMATCH');
  assert.equal(r.layer, 'pipeline');
});

test('classifyFailure: schema_error and validation_rejected are pipeline-layer, not model-layer', () => {
  assert.equal(taxonomy.classifyFailure('schema_error').layer, 'pipeline');
  assert.equal(taxonomy.classifyFailure('validation_rejected').layer, 'pipeline');
});

test('classifyFailure: health_skip and resource_contention are resource-layer, never blamed on the model', () => {
  assert.equal(taxonomy.classifyFailure('health_skip').layer, 'resource');
  assert.equal(taxonomy.classifyFailure('resource_contention').layer, 'resource');
});

test('classifyFailure: verification_failed with real, unrelated infra-flake stderr is a pipeline false negative, not a real test failure', () => {
  const r = taxonomy.classifyFailure('verification_failed', { verifierStderr: 'error: could not lock config file .git/config: File exists' });
  assert.equal(r.taxonomyKey, 'VERIFIER_FALSE_NEGATIVE');
  assert.equal(r.layer, 'pipeline');
  assert.equal(r.infraFlake, true);
});

test('classifyFailure: verification_failed with real assertion-failure stderr is a genuine test failure', () => {
  const r = taxonomy.classifyFailure('verification_failed', { verifierStderr: 'AssertionError: expected true to equal false' });
  assert.equal(r.taxonomyKey, 'TEST_FAILURE');
  assert.equal(r.layer, 'test');
});

test('classifyFailure: verification_failed with no stderr available at all falls back honestly to the pipeline bucket', () => {
  const r = taxonomy.classifyFailure('verification_failed');
  assert.equal(r.taxonomyKey, 'VERIFIER_FALSE_NEGATIVE');
});

test('classifyFailure: an unrecognized raw classification is never silently dropped - defaults to model layer and is flagged unmapped', () => {
  const r = taxonomy.classifyFailure('some_future_string_not_yet_mapped');
  assert.equal(r.unmapped, true);
  assert.equal(r.layer, 'model');
});

test('summarizeByLayer: real counts split by layer instead of one flat success rate', () => {
  const entries = [
    { success: true },
    { success: false, classification: 'timeout' }, // model
    { success: false, classification: 'no_scope' }, // pipeline
    { success: false, classification: 'health_skip' }, // resource
    { success: false, classification: 'verification_failed', verifierStderr: 'AssertionError: x' }, // test
  ];
  const s = taxonomy.summarizeByLayer(entries);
  assert.equal(s.total, 5);
  assert.equal(s.success, 1);
  assert.equal(s.model, 1);
  assert.equal(s.pipeline, 1);
  assert.equal(s.resource, 1);
  assert.equal(s.test, 1);
});

test('TAXONOMY: every point-2-mandated failure class exists in the table', () => {
  const required = ['MODEL_BAD_OUTPUT', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'PIPELINE_TIMEOUT', 'PATCH_PARSE_ERROR', 'PATCH_VALIDATION_ERROR', 'APPLY_ERROR', 'TARGET_MISMATCH', 'VERIFIER_FALSE_NEGATIVE', 'TEST_FAILURE', 'RESOURCE_BLOCK', 'ROUTER_MISROUTE', 'DUPLICATE_RETRY'];
  for (const key of required) assert.ok(taxonomy.TAXONOMY[key], `missing required taxonomy key: ${key}`);
});
