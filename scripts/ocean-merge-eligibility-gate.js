'use strict';

// Fail-closed CLI adapter for the Ocean merge eligibility gate.
// Usage: node scripts/ocean-merge-eligibility-gate.js <facts.json>
//        node scripts/ocean-merge-eligibility-gate.js < facts.json
//
// Exit codes: 0 = READY_FOR_OCEAN, 1 = not eligible, 2 = unreadable input.
// The marker READY_FOR_OCEAN=YES is printed only on a fully proven decision.

const fs = require('fs');
const { evaluateOceanEligibility } = require('../lib/ocean-merge-eligibility.js');

function readFacts() {
  const file = process.argv[2];
  const raw = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

function main() {
  let facts;
  try {
    facts = readFacts();
  } catch (error) {
    process.stderr.write(`Ocean eligibility: unreadable facts input (${error.message}); failing closed\n`);
    return 2;
  }

  const verdict = evaluateOceanEligibility(facts);
  if (verdict.ready) {
    process.stdout.write(`READY_FOR_OCEAN=YES SHA=${verdict.sha}\n`);
    return 0;
  }

  for (const blocker of verdict.blockers) {
    const detail = blocker.detail ? ` [${blocker.detail}]` : '';
    process.stderr.write(`::error::Ocean merge blocked: ${blocker.code}${detail} ${blocker.message}\n`);
  }
  process.stderr.write(
    `Ocean merge eligibility: NOT READY (${verdict.blockers.length} blocker(s)); this gate never self-certifies\n`
  );
  return 1;
}

process.exitCode = main();
