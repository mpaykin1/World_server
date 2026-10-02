#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contractPath = path.join(root, '.ai', 'aka-world-growth-engine.json');
const ledgerPath = path.join(root, 'data', 'world-growth-hypotheses.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function fail(message) {
  console.error('WORLD_GROWTH_FAIL:', message);
  process.exitCode = 1;
}

const contract = readJson(contractPath);
const ledger = readJson(ledgerPath);
const allowed = new Set(contract.statusModel || []);
const rows = Array.isArray(ledger.hypotheses) ? ledger.hypotheses : [];

if (rows.length !== 50) fail(`expected exactly 50 hypotheses, got ${rows.length}`);

const ids = rows.map((row) => row.id);
const unique = new Set(ids);
if (unique.size !== 50) fail('hypothesis ids must be unique');
for (let id = 1; id <= 50; id += 1) {
  if (!unique.has(id)) fail(`missing hypothesis id ${id}`);
}
for (const row of rows) {
  if (!allowed.has(row.status)) fail(`invalid status ${row.status} for #${row.id}`);
  if (!Number.isInteger(row.leverage) || row.leverage < 1 || row.leverage > 5) {
    fail(`invalid leverage for #${row.id}`);
  }
  if (row.status === 'VERIFIED' && (!Array.isArray(row.evidence) || row.evidence.length === 0)) {
    fail(`VERIFIED #${row.id} requires exact evidence`);
  }
}
if (contract.noNewAutomation !== true) fail('contract must forbid a parallel/sixth AKA automation');
if (contract.ownerDecisionPolicy?.successFailureLearningLabelsRequireExplicitOwnerDecision !== true) {
  fail('owner-decision-only success/failure learning policy must remain enabled');
}

const base = {
  UNKNOWN: 95,
  MISSING: 100,
  EXPERIMENTAL: 70,
  IMPLEMENTED: 42,
  TESTED: 18,
  VERIFIED: 0,
  BLOCKED: 82
};

function programFor(id) {
  return (contract.missingSystemPrograms || []).find((p) => (p.hypotheses || []).includes(id));
}

const ranked = rows
  .filter((row) => row.status !== 'VERIFIED')
  .map((row) => {
    const program = programFor(row.id);
    const sharedBonus = program ? Math.min(20, Math.max(0, (program.hypotheses?.length || 1) - 1) * 3) : 0;
    const score = (base[row.status] ?? 50) + row.leverage * 10 + sharedBonus;
    return { ...row, program: program?.id || null, score };
  })
  .sort((a, b) => b.score - a.score || b.leverage - a.leverage || a.id - b.id);

const counts = Object.fromEntries(
  [...allowed].map((status) => [status, rows.filter((row) => row.status === status).length])
);

if (process.argv.includes('--check')) {
  if (!process.exitCode) {
    console.log(`WORLD_GROWTH_OK total=${rows.length} missing=${counts.MISSING || 0} experimental=${counts.EXPERIMENTAL || 0} implemented=${counts.IMPLEMENTED || 0} tested=${counts.TESTED || 0} verified=${counts.VERIFIED || 0}`);
  }
} else {
  const top = ranked.slice(0, 8).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    leverage: row.leverage,
    program: row.program,
    score: row.score
  }));
  console.log(JSON.stringify({
    contract: contract.name,
    total: rows.length,
    counts,
    selected: top[0] || null,
    top,
    rule: 'Select one bounded gap; do not label success/failure learning until explicit owner decision.'
  }, null, 2));
}
