#!/usr/bin/env node
'use strict';

// Transport only. Every eligibility decision lives in
// lib/ocean-merge-eligibility.js so that CI, this CLI and the regression suite
// execute one identical fail-closed rule instead of a forked YAML copy.
//
// This script never executes candidate code and never reaches a network API
// itself: the workflow resolves the GitHub facts (including the independent
// adversarial review check) and passes them in as JSON. That is deliberate --
// the pull request author controls the branch, not the gate.
//
// Usage:
//   node scripts/ocean-merge-eligibility-gate.js --facts facts.json [--evidence out.json]
//
// Facts JSON shape:
//   {
//     "expectedHeadSha": "<40 hex>",
//     "trustedMasterSha": "<40 hex>",
//     "certificate": { ... } | "<json text>",
//     "pr": { "number", "baseRef", "baseSha", "headSha", "draft", "mergeable", "mergeableState" },
//     "review": { "found", "head_sha", "status", "conclusion", "verdict" },
//     "siblingGateModules": [ "lib/ocean-merge-eligibility.js" ]
//   }
//
// Exit codes: 0 = READY_FOR_OCEAN=YES, 6 = not eligible (fail closed),
// 7 = the gate itself could not be evaluated (also fail closed).

const fs = require('fs');
const path = require('path');
const {
  OCEAN_GATE_MODULE,
  PROTECTED_BASE_BRANCH,
  INDEPENDENT_REVIEW_CHECK,
  discoverGateClaimants,
  evaluateOceanEligibility,
  formatEligibility,
  buildIntegrationHandoff
} = require('../lib/ocean-merge-eligibility.js');

const GATE_INPUT_UNUSABLE = 7;
const GATE_NOT_ELIGIBLE = 6;

function parseArgs(argv) {
  const args = { factsPath: '', evidencePath: '', handoffPath: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--facts') args.factsPath = argv[i + 1] || '';
    else if (arg === '--evidence') args.evidencePath = argv[i + 1] || '';
    else if (arg === '--handoff') args.handoffPath = argv[i + 1] || '';
  }
  return args;
}

// Fail closed when a second module claims the same Ocean gate role. Two parallel
// gates are how a stale candidate gets certified through the weaker one. The
// scan itself lives in the canonical module so CI and the tests cannot diverge.

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  if (!file) return;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const root = path.resolve(__dirname, '..');
  const args = parseArgs(process.argv.slice(2));
  if (!args.factsPath) {
    process.stderr.write('ocean gate: --facts <file> is required\n');
    process.exit(GATE_INPUT_UNUSABLE);
  }
  const facts = readJson(args.factsPath, null);
  if (!facts || typeof facts !== 'object') {
    process.stderr.write(`ocean gate: facts file is missing or unparsable: ${args.factsPath}\n`);
    process.exit(GATE_INPUT_UNUSABLE);
  }

  const siblingGateModules = discoverGateClaimants(root);
  const decision = evaluateOceanEligibility({ ...facts, siblingGateModules });

  const evidence = {
    kind: 'OCEAN_INTEGRATION_ELIGIBILITY',
    gate: OCEAN_GATE_MODULE,
    protectedBaseBranch: PROTECTED_BASE_BRANCH,
    independentReviewCheck: INDEPENDENT_REVIEW_CHECK,
    readyForOcean: decision.ready,
    candidateSha: decision.candidateSha,
    rollbackSha: decision.rollbackSha,
    certificateSha: decision.certificateSha,
    certificateBaseSha: decision.certificateBaseSha,
    certificateRunId: decision.certificateRunId,
    blockers: decision.blockers,
    gateModules: siblingGateModules
  };
  writeJson(args.evidencePath, evidence);

  if (args.handoffPath) {
    const handoff = readJson(args.handoffPath, null);
    const result = buildIntegrationHandoff(handoff);
    writeJson(`${args.handoffPath}.evaluated.json`, result);
    if (!result.handedOff) {
      process.stdout.write(`${formatEligibility(decision)}\n`);
      process.stderr.write(`ocean handoff incomplete: ${result.missing.join(',')}\n`);
      process.exit(GATE_NOT_ELIGIBLE);
    }
  }

  process.stdout.write(`${formatEligibility(decision)}\n`);
  if (!decision.ready) {
    for (const blocker of decision.blockers) {
      process.stderr.write(`::error::${blocker.code}: ${blocker.message}\n`);
    }
    process.exit(GATE_NOT_ELIGIBLE);
  }
  process.exit(0);
}

main();
