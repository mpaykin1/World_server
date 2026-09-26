#!/usr/bin/env node
'use strict';
// Fail-closed Ocean integration eligibility, executed by CI and by the local
// test suite through the same code path. Producer and consumer of the Fleet PRE
// certificate share lib/ocean-integration-gate.js so the certificate shape can
// never drift from the decision that validates it.
//
//   certify     --head <sha> --canonical-base <sha> [--pr-base <sha>] [--run <id>] --out <file>
//   eligibility --certificate <file> --expected-head <sha>
//               (--canonical-base <sha> | --resolve-canonical-base)
//
// Exit code 0 only for READY_FOR_OCEAN=YES on the exact (head, canonical base)
// pair. Every other outcome exits 1 with an explicit reason.

const fs = require('node:fs');
const cp = require('node:child_process');
const { buildFleetPreCertificate, decideOceanEligibility, formatEligibility } = require('../lib/ocean-integration-gate');

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!String(args[i] || '').startsWith('--') || !args[i + 1]) throw new Error('Expected --name value');
    out[args[i].slice(2)] = args[i + 1];
  }
  return out;
}

// Read-only resolution of the current canonical base. `origin/master` is not
// guaranteed to exist in a depth-1 SHA checkout, so resolve the fetched ref.
function resolveCanonicalBase() {
  cp.execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', 'master'], { stdio: 'ignore' });
  return cp.execFileSync('git', ['rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' }).trim();
}

function certify(args) {
  const out = String(args.out || 'fleet-pre-evidence.json');
  const certificate = buildFleetPreCertificate({
    headSha: args.head,
    canonicalBaseSha: args['canonical-base'],
    prBaseSha: args['pr-base'],
    runId: args.run,
    scope: args.scope
  });
  fs.writeFileSync(out, JSON.stringify(certificate) + '\n');
  console.log('CERT_WRITTEN=' + out + ' SHA=' + certificate.sha + ' BASE=' + certificate.baseSha);
  return certificate.sha && certificate.baseSha ? 0 : 1;
}

function eligibility(args) {
  const file = String(args.certificate || '');
  let certificate = null;
  try {
    certificate = file ? fs.readFileSync(file, 'utf8') : null;
  } catch {
    certificate = null; // Unreadable evidence is missing evidence.
  }
  const canonicalBase = args['resolve-canonical-base'] ? resolveCanonicalBase() : (args['canonical-base'] || '');
  const decision = decideOceanEligibility({
    certificate,
    expectedHeadSha: args['expected-head'],
    canonicalBaseSha: canonicalBase
  });
  console.log(formatEligibility(decision));
  return decision.readyForOcean ? 0 : 1;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'eligibility';
  const args = parseArgs(argv);
  if (command === 'certify') return certify(args);
  if (command === 'eligibility') return eligibility(args);
  throw new Error('Unknown command: ' + command);
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error('[OCEAN_GATE] ' + String(err && err.message ? err.message : err));
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, resolveCanonicalBase, certify, eligibility };
