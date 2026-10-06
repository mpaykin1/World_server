#!/usr/bin/env node

/**
 * Ocean protected integration — hard CI gate.
 *
 * Fail-closed by construction: every mode exits non-zero unless the machine-readable
 * Ocean predicate actually passes. No shell-truthiness fallback is used here, and the
 * regression guard in test/ocean-protected-integration.test.js forbids one from being
 * introduced later.
 *
 * Modes:
 *   --policy-check                      static policy invariants + canonical files exist
 *   --candidate <file|->                evaluate a Fleet PRE candidate for Ocean eligibility
 *   --handoff <file|->                  validate the Ocean -> Fleet POST handoff payload
 *   --current-head=<sha>                observed exact head, used as eligibility context
 *   --json                              machine-readable output
 *
 * This gate never merges, deploys or self-certifies live state.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ocean = require('../lib/ocean-protected-integration');

const root = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = { mode: 'policy-check', source: '', currentHead: '', json: false };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--policy-check') { opts.mode = 'policy-check'; opts.source = ''; }
    else if (arg === '--candidate') opts.mode = 'candidate';
    else if (arg === '--handoff') opts.mode = 'handoff';
    else if (arg.startsWith('--candidate=')) { opts.mode = 'candidate'; opts.source = arg.slice('--candidate='.length); }
    else if (arg.startsWith('--handoff=')) { opts.mode = 'handoff'; opts.source = arg.slice('--handoff='.length); }
    else if (arg.startsWith('--current-head=')) opts.currentHead = arg.slice('--current-head='.length);
    else if (opts.mode === 'candidate' || opts.mode === 'handoff') opts.source = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function readPayload(source) {
  const raw = source === '-' || !source
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(path.resolve(root, source), 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Candidate/handoff payload is not valid JSON: ${error.message}`);
  }
}

function runPolicyCheck() {
  const self = ocean.policySelfCheck();
  const missingPaths = [];
  for (const system of ocean.policy.invariantSystems) {
    for (const canonicalPath of system.canonicalPaths) {
      if (!fs.existsSync(path.join(root, canonicalPath))) missingPaths.push(canonicalPath);
    }
  }

  const ok = self.ok && missingPaths.length === 0;
  return {
    ok,
    mode: 'policy-check',
    problems: self.problems,
    missingCanonicalPaths: missingPaths,
  };
}

function runCandidateCheck(opts) {
  const candidate = readPayload(opts.source);
  const result = ocean.evaluateOceanEligibility(candidate, { currentHeadSha: opts.currentHead });
  return { ok: result.readyForOcean, mode: 'candidate', eligibility: result };
}

function runHandoffCheck(opts) {
  const handoff = readPayload(opts.source);
  const result = ocean.validateOceanHandoff(handoff);
  return { ok: result.ok, mode: 'handoff', handoff: result };
}

function run(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const report = opts.mode === 'candidate'
    ? runCandidateCheck(opts)
    : opts.mode === 'handoff'
      ? runHandoffCheck(opts)
      : runPolicyCheck();

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.ok ? 0 : 1;
  }

  if (report.mode === 'policy-check') {
    for (const problem of report.problems) process.stderr.write(`FAIL: ${problem}\n`);
    for (const missing of report.missingCanonicalPaths) process.stderr.write(`FAIL: canonical Ocean path missing: ${missing}\n`);
    if (report.ok) process.stdout.write('OK: Ocean protected integration policy invariants hold\n');
    else process.stderr.write('\nOcean protected integration policy check FAILED\n');
    return report.ok ? 0 : 1;
  }

  if (report.mode === 'candidate') {
    process.stdout.write(`${ocean.oceanReadyLine(report.eligibility)}\n`);
    for (const item of report.eligibility.rejections) {
      process.stderr.write(`REJECT ${item.code}: ${item.reason}${item.detail ? ` (${item.detail})` : ''}\n`);
    }
    return report.ok ? 0 : 1;
  }

  for (const field of report.handoff.missing) process.stderr.write(`REJECT missing handoff field: ${field}\n`);
  for (const problem of report.handoff.invalid) process.stderr.write(`REJECT invalid handoff field: ${problem}\n`);
  if (report.ok) process.stdout.write('OK: Ocean -> Fleet POST handoff is complete and non-self-certified\n');
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exit(run());
  } catch (error) {
    process.stderr.write(`Ocean protected integration gate error: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { parseArgs, run, runPolicyCheck, runCandidateCheck, runHandoffCheck, root };