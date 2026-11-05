'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { packArtifact, verifyArtifact } = require('../lib/engines/artifact.cjs');
function fixture() {
  const engines = ['calc', 'dramaturgy', 'story', 'mechanics', 'physics', 'visual', 'onboarding'];
  return { gameId: 'original-world', sourceCommit: 'a'.repeat(40),
    files: { 'index.html': '<!doctype html><canvas></canvas>', 'src/play.js': '"use strict";' },
    pipelineResult: { gameId: 'original-world', seed: '42', errors: [],
      steps: engines.map(engine => ({ engine, status: engine === 'calc' ? 'skipped_optional' : 'produced_unverified', ok: false })),
      outputs: Object.fromEntries(engines.slice(1).map(engine => [engine, { unitFixture: engine }])) } };
}
test('packaging is deterministic and detached, never claims validation or publication', () => {
  const input = fixture(), a = packArtifact(input), b = packArtifact(input);
  assert.deepEqual(a, b); assert.equal(verifyArtifact(a), true);
  assert.deepEqual(a.manifest.validation, { browser: 'not_run', rights: 'not_verified', publication: 'not_published' });
  input.files['index.html'] = 'mutated';
  assert.equal(verifyArtifact(a), true);
  assert.equal(a.manifest.status, 'packaged_unverified');
});
test('file mutation, truncation, injected file or manifest change invalidates integrity', () => {
  for (const change of [a => { a.files['index.html'] += 'tampered'; }, a => { delete a.files['src/play.js']; },
    a => { a.files['extra.js'] = 'injected'; }, a => { a.manifest.seed = '99'; }]) {
    const a = packArtifact(fixture()); change(a); assert.equal(verifyArtifact(a), false);
  }
});
test('rejects traversal, absolute, encoded, Windows and case-colliding names', () => {
  for (const path of ['../secret.js', '/root.js', 'C:/root.js', 'src\\escape.js', '%2e%2e/escape.js', 'a//b.js', 'a/../b.js', 'file.js?raw=1', 'CON.js', 'aux/play.js']) {
    const input = fixture(); input.files[path] = 'bad';
    assert.throws(() => packArtifact(input), /Unsafe/);
  }
  const input = fixture(); input.files['INDEX.html'] = 'collision';
  assert.throws(() => packArtifact(input), /colliding/);
});
test('failed, incomplete, reordered or falsely verified pipeline cannot be packaged', () => {
  for (const alter of [p => { p.errors.push({ code: 'ENGINE_FAILED' }); }, p => { p.steps.pop(); },
    p => { p.steps.reverse(); }, p => { p.steps[1].ok = true; },
    p => { delete p.outputs.visual; }, p => { p.gameId = 'wrong'; }, p => { p.steps[1].status = 'verified'; }]) {
    const input = fixture(); alter(input.pipelineResult); assert.throws(() => packArtifact(input));
  }
});
test('enforces entry, explicit version, text format and byte budgets', () => {
  for (const alter of [i => { delete i.files['index.html']; }, i => { i.sourceCommit = 'main'; },
    i => { i.files['src/play.js'] = Buffer.from('binary'); }, i => { i.files['index.html'] = 'a'.repeat(1048577); },
    i => { i.files['index.html'] = ''; }, i => { i.pipelineResult.outputs.visual = { bad: NaN }; }]) {
    const input = fixture(); alter(input); assert.throws(() => packArtifact(input));
  }
});
test('reordered object keys retain identity while changed engine evidence changes it', () => {
  const input = fixture(), a = packArtifact(input);
  input.files = Object.fromEntries(Object.entries(input.files).reverse());
  assert.equal(packArtifact(input).manifest_sha256, a.manifest_sha256);
  input.pipelineResult.outputs.story = { different: true };
  assert.notEqual(packArtifact(input).manifest_sha256, a.manifest_sha256);
});
