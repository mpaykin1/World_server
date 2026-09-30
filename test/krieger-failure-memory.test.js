'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { ENTRIES } = require('../scripts/collective-brain-knowledge-pack');

test('Krieger failure is preserved as a Collective Brain lesson', () => {
  const entry = ENTRIES.find((item) => item.slug === 'krieger-fidelity-failure');
  assert.ok(entry, 'knowledge pack must keep the Krieger failure lesson');
  assert.match(entry.content, /2\.5D raycaster/i);
  assert.match(entry.content, /billboard enemies/i);
  assert.match(entry.content, /HUD\/canvas weapons/i);
  assert.match(entry.content, /side-by-side evidence/i);
  assert.match(entry.content, /MasonDye\/kkrieger-wasm/);
});

test('Krieger failure postmortem is linked from permanent protection', () => {
  const postmortem = path.join(ROOT, 'docs', 'KRIEGER_FAILURE_POSTMORTEM_2026-09-29.md');
  assert.equal(fs.existsSync(postmortem), true);

  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'error-prevention-registry.json'), 'utf8'));
  const item = (registry.knownErrors || []).find((error) => error.id === 'reference-3d-silently-downgraded-to-2d');
  assert.ok(item);
  assert.equal(item.status, 'protected');
  assert.ok((item.evidence || []).includes('docs/KRIEGER_FAILURE_POSTMORTEM_2026-09-29.md'));
  assert.match(item.rootCause, /rendering class|visual scoring/i);

  const fidelity = fs.readFileSync(path.join(ROOT, 'docs', 'REFERENCE_DIMENSIONAL_FIDELITY.md'), 'utf8');
  assert.match(fidelity, /KRIEGER_FAILURE_POSTMORTEM_2026-09-29\.md/);
});
