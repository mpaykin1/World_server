'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VNO_PATH = path.join(ROOT, '.ai', 'vno-cycle.json');
const SYSTEMS_PATH = path.join(ROOT, 'data', 'vno-gameplay-systems.json');
const RECORD_DIR = path.join(ROOT, 'science', 'vno');

let failed = false;
function check(condition, message) {
  if (condition) console.log(`OK: ${message}`);
  else { console.error(`VNO FAIL: ${message}`); failed = true; }
}
function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { console.error(`VNO FAIL: cannot read ${path.relative(ROOT, file)}: ${error.message}`); failed = true; return null; }
}

check(fs.existsSync(VNO_PATH), '.ai/vno-cycle.json exists');
check(fs.existsSync(SYSTEMS_PATH), 'data/vno-gameplay-systems.json exists');
check(fs.existsSync(path.join(ROOT, 'SCIENCE_STANDARD.md')), 'SCIENCE_STANDARD.md exists');
check(fs.existsSync(path.join(ROOT, 'docs', 'SCIENCE_GAMEPLAY_STANDARD.md')), 'existing Science -> Gameplay runtime standard is reused');
check(fs.existsSync(path.join(ROOT, 'lib', 'science-gameplay-adapter.js')), 'existing science-gameplay adapter is reused');

const vno = loadJson(VNO_PATH);
const registry = loadJson(SYSTEMS_PATH);

if (vno) {
  check(vno.acronym === 'ВНО', 'canonical acronym is ВНО');
  check(Array.isArray(vno.pillars) && vno.pillars.join('|') === 'ВОСПРОИЗВОДИМОСТЬ|НЕЗАВИСИМОСТЬ|ОПРОВЕРЖЕНИЕ', 'VNO pillar names are intact');
  check(vno.scienceReadinessFormula === 'min(REPRODUCIBILITY, INDEPENDENCE, FALSIFICATION)', 'VNO uses non-compensating minimum score');
  check(Array.isArray(vno.loop) && vno.loop.length === 7, 'VNO cycle has exactly seven mandatory steps');
  if (Array.isArray(vno.loop)) {
    const ids = vno.loop.map(step => step.id);
    const required = ['TAKE_DISCOVERY', 'DEVELOP_NEXT_HYPOTHESIS', 'TRANSLATE_TO_GAMEPLAY', 'PROVE_IN_CODE', 'MAXIMIZE_VNO', 'IMPROVE_THE_METHOD', 'LOOP_AGAIN'];
    check(JSON.stringify(ids) === JSON.stringify(required), 'VNO seven-step order cannot silently drift');
    for (const step of vno.loop) {
      check(typeof step.kidMeaning === 'string' && step.kidMeaning.trim().length > 10, `${step.id} has age-5 explanation`);
      check(Array.isArray(step.requirements) && step.requirements.length >= 3, `${step.id} keeps concrete requirements`);
    }
  }
  check(vno.promotion?.failClosed === true, 'VNO gameplay promotion fails closed');
  check(vno.promotion?.productionRequiresExistingScienceGameplayGates === true, 'VNO does not bypass existing science-gameplay production gates');
  check(vno.promotion?.crossSystemPassDoesNotAutoPromoteOtherSystems === true, 'one system cannot certify another system');
  check(vno.promotion?.notApplicableIsAllowedWithEvidence === true, 'honest NOT_APPLICABLE is allowed');
  check(vno.execution?.cloudFirst === true, 'VNO remains cloud-first');
  check(vno.execution?.reuseMasterCoordinator === true && vno.execution?.reuseCollectiveBrain === true, 'VNO reuses existing orchestration instead of duplicating it');
  check(vno.execution?.reuseAgentSessionGuard === true, 'VNO reuses the shared session/cleanup guard');
  check(vno.execution?.desktopClutterForbidden === true, 'desktop clutter remains forbidden');
  check(vno.execution?.temporaryArtifactsMustBeCleaned === true, 'temporary local artifacts must be cleaned');
  check(vno.execution?.computerSlowdownIsARegression === true, 'computer slowdown is a correctness regression');
  check(vno.userCommunication?.targetUnderstandingAge === 5 && vno.userCommunication?.primaryLanguage === 'ru', 'player communication stays Russian and age-5 simple');
  check(vno.userCommunication?.mustSayWhenSomethingIsOnlyAPlanOrHypothesis === true, 'player communication must distinguish plans/hypotheses from verified behavior');
}

const systems = registry?.systems;
const requiredTransferFields = registry?.requiredTransferFields || [];
if (registry) {
  check(Array.isArray(systems) && systems.length >= 18, 'canonical gameplay map covers at least 18 systems');
  if (Array.isArray(systems)) {
    const ids = systems.map(s => s.id);
    check(new Set(ids).size === ids.length, 'canonical gameplay system IDs are unique');
    for (const system of systems) {
      check(typeof system.kidName === 'string' && system.kidName.trim().length > 3, `${system.id} has simple player-facing name`);
      check(Array.isArray(system.sourceHints) && system.sourceHints.length > 0, `${system.id} points to existing code areas`);
      check(Array.isArray(system.runtimeDomains), `${system.id} explicitly maps or opts out of legacy runtime domains`);
    }
  }
  const mustFields = ['systemId', 'applicability', 'reason', 'kidExplanation', 'feature', 'predictedEffect', 'baseline', 'implementationPaths', 'testPlan', 'falsificationAttack', 'stage'];
  check(mustFields.every(field => requiredTransferFields.includes(field)), 'transfer contract keeps feature + proof + falsification fields');
}

if (fs.existsSync(RECORD_DIR) && Array.isArray(systems)) {
  const systemIds = new Set(systems.map(s => s.id));
  const files = fs.readdirSync(RECORD_DIR).filter(name => /^RUN_\d{3}\.vno\.json$/.test(name)).sort();
  check(files.length > 0, 'at least one VNO cycle record exists');
  for (const name of files) {
    const file = path.join(RECORD_DIR, name);
    const record = loadJson(file);
    if (!record) continue;
    const transfers = Array.isArray(record.gameplayTransfers) ? record.gameplayTransfers : [];
    check(transfers.length === systems.length, `${name} evaluates every canonical gameplay system`);
    check(new Set(transfers.map(t => t.systemId)).size === transfers.length, `${name} has no duplicate gameplay-system transfer`);
    check(transfers.every(t => systemIds.has(t.systemId)), `${name} contains only registered gameplay systems`);
    check([...systemIds].every(id => transfers.some(t => t.systemId === id)), `${name} cannot silently skip a gameplay system`);

    for (const transfer of transfers) {
      for (const field of requiredTransferFields) {
        const value = transfer[field];
        check(value !== undefined && value !== null && !(typeof value === 'string' && !value.trim()), `${name}:${transfer.systemId} has ${field}`);
      }
      check(['APPLICABLE', 'NOT_APPLICABLE'].includes(transfer.applicability), `${name}:${transfer.systemId} has explicit applicability`);
      if (transfer.applicability === 'NOT_APPLICABLE') {
        check(transfer.stage === 'not-applicable', `${name}:${transfer.systemId} honest non-transfer stays not-applicable`);
      } else {
        check(transfer.stage !== 'not-applicable', `${name}:${transfer.systemId} applicable transfer has an active development stage`);
        check(Array.isArray(transfer.implementationPaths) && transfer.implementationPaths.length > 0, `${name}:${transfer.systemId} applicable transfer names implementation paths`);
        check(typeof transfer.testPlan === 'string' && transfer.testPlan.length > 15, `${name}:${transfer.systemId} applicable transfer has a real test plan`);
        check(typeof transfer.falsificationAttack === 'string' && transfer.falsificationAttack.length > 15, `${name}:${transfer.systemId} applicable transfer has an attack meant to disprove it`);
      }
      check(typeof transfer.kidExplanation === 'string' && transfer.kidExplanation.length > 10, `${name}:${transfer.systemId} has simple player explanation`);
    }

    const audit = record.vnoAudit || {};
    const scores = [audit.reproducibility?.score, audit.independence?.score, audit.falsification?.score];
    check(scores.every(value => Number.isInteger(value) && value >= 0 && value <= 100), `${name} has explicit 0..100 VNO pillar scores`);
    if (scores.every(Number.isInteger)) {
      check(audit.scienceReadiness === Math.min(...scores), `${name} readiness equals weakest VNO pillar`);
    }
    check(typeof audit.meaning === 'string' && /not the percentage truth/i.test(audit.meaning), `${name} score meaning cannot masquerade as real-world truth`);
    check(record.nextLoop?.returnToStep === 1, `${name} returns to step 1 after the cycle`);
    check(record.nextLoop?.successDoesNotAutoPromoteGameplay === true, `${name} next success cannot auto-promote gameplay`);
    check(fs.existsSync(path.join(ROOT, record.sourceDiscovery?.evidence || '')), `${name} source evidence exists`);
  }
}

if (failed) {
  console.error('\nVNO cycle check FAILED');
  process.exit(1);
}
console.log('\nVNO cycle check PASSED');
