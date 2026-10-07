'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { recordToolOutcome, scoreTool, rankToolsByCost, SEED_COST } = require('../lib/tool-cost-model');

function tmpLedger() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'toolcost-')), 'ledger.json'); }

test('an untried tool falls back to its seed cost class, not a fabricated measurement', () => {
  const ledgerPath = tmpLedger();
  const s = scoreTool('search_files', { ledgerPath });
  assert.equal(s.source, 'seed');
  assert.equal(s.costClass, 'high');
  assert.equal(s.samples, 0);
});

test('a real recorded timeout on search_files confirms the seed rather than needing to guess', () => {
  const ledgerPath = tmpLedger();
  recordToolOutcome('search_files', 'timeout', { ledgerPath, latencyMs: 60000 });
  const s = scoreTool('search_files', { ledgerPath });
  assert.equal(s.source, 'measured');
  assert.equal(s.costClass, 'high');
});

test('real fast/reliable data overrides a pessimistic seed (a tool is not permanently penalized)', () => {
  const ledgerPath = tmpLedger();
  for (let i = 0; i < 3; i++) recordToolOutcome('search_files', 'success', { ledgerPath, latencyMs: 500 });
  const s = scoreTool('search_files', { ledgerPath });
  assert.equal(s.costClass, 'low');
});

test('rankToolsByCost puts list_directory/read_text_file ahead of search_files by default (seed priors)', () => {
  const ledgerPath = tmpLedger();
  const ranked = rankToolsByCost(['search_files', 'list_directory', 'read_text_file'], { ledgerPath });
  assert.deepEqual(ranked, ['list_directory', 'read_text_file', 'search_files']);
});

test('rankToolsByCost preserves relative order among tools of equal cost class (stable sort)', () => {
  const ledgerPath = tmpLedger();
  const ranked = rankToolsByCost(['read_file', 'read_text_file', 'list_directory'], { ledgerPath });
  assert.deepEqual(ranked, ['read_file', 'read_text_file', 'list_directory']);
});

test('SEED_COST documents the real observed defect: search_files and directory_tree are recursive/high, targeted reads are low', () => {
  assert.equal(SEED_COST.search_files, 'high');
  assert.equal(SEED_COST.directory_tree, 'high');
  assert.equal(SEED_COST.read_text_file, 'low');
  assert.equal(SEED_COST.list_directory, 'low');
});
