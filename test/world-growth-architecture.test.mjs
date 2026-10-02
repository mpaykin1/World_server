import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const contract = JSON.parse(fs.readFileSync('.ai/aka-world-growth-engine.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('data/world-growth-hypotheses.json', 'utf8'));

test('World Growth Architecture tracks exactly the canonical 50 hypotheses', () => {
  assert.equal(ledger.hypotheses.length, 50);
  assert.deepEqual(
    ledger.hypotheses.map((h) => h.id),
    Array.from({ length: 50 }, (_, i) => i + 1)
  );
});

test('missing-system programs cover the known architecture gaps', () => {
  const covered = new Set(contract.missingSystemPrograms.flatMap((p) => p.hypotheses));
  for (const id of [2, 3, 20, 27, 47, 49]) assert.ok(covered.has(id), `gap #${id} is not assigned to an AKA program`);
});

test('growth program reuses existing AKA and protects owner outcome decisions', () => {
  assert.equal(contract.noNewAutomation, true);
  assert.equal(contract.orchestrationMode, 'augment_existing_aka');
  assert.equal(contract.ownerDecisionPolicy.successFailureLearningLabelsRequireExplicitOwnerDecision, true);
  assert.deepEqual(contract.pipeline, ['AKA Architect', 'Builder', 'Fleet PRE', 'Ocean', 'Fleet POST']);
});

test('VERIFIED status cannot exist without exact evidence', () => {
  for (const h of ledger.hypotheses.filter((x) => x.status === 'VERIFIED')) {
    assert.ok(Array.isArray(h.evidence) && h.evidence.length > 0, `#${h.id} missing evidence`);
  }
});

test('deterministic selector validates the ledger', () => {
  const output = execFileSync(process.execPath, ['scripts/world-growth-architect.mjs', '--check'], { encoding: 'utf8' });
  assert.match(output, /WORLD_GROWTH_OK total=50/);
});


test('final candidate head must be verified independently', () => {
  assert.equal(contract.evidenceRules.finalHeadRequired, true);
  assert.equal(contract.evidenceRules.previousHeadPassCannotCertifyNewHead, true);
});
