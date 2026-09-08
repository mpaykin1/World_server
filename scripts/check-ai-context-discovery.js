'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failed = false;

function check(ok, message) {
  if (ok) console.log(`OK: ${message}`);
  else {
    console.error(`AI CONTEXT FAIL: ${message}`);
    failed = true;
  }
}

const requiredFiles = [
  'AI_START_HERE.md',
  'README.md',
  'AGENTS.md',
  'VNO.md',
  '.ai/project-context-index.json',
  '.ai/vno-current-state.json',
  '.ai/vno-cycle.json',
  '.ai/vno-scoring.json',
  '.ai/science-governance.json',
  'data/vno-gameplay-systems.json',
  'docs/SCIENCE_GAMEPLAY_STANDARD.md',
  'api/project-context.js',
  'test/project-context-api.test.js'
];

for (const file of requiredFiles) check(fs.existsSync(path.join(root, file)), `${file} exists`);

if (!failed) {
  const start = fs.readFileSync(path.join(root, 'AI_START_HERE.md'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const vno = fs.readFileSync(path.join(root, 'VNO.md'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const apiContext = fs.readFileSync(path.join(root, 'api', 'project-context.js'), 'utf8');
  const index = JSON.parse(fs.readFileSync(path.join(root, '.ai', 'project-context-index.json'), 'utf8'));
  const current = JSON.parse(fs.readFileSync(path.join(root, '.ai', 'vno-current-state.json'), 'utf8'));

  check(/^# AI START HERE/m.test(start), 'universal AI entrypoint has stable title');
  check(start.includes('ВНО = Воспроизводимость, Независимость, Опровержение'), 'AI entrypoint expands ВНО explicitly');
  check(start.includes('.ai/vno-current-state.json'), 'AI entrypoint points to current VNO state');
  check(readme.includes('AI_START_HERE.md'), 'README links to AI entrypoint');
  check(readme.includes('ВНО = Воспроизводимость, Независимость, Опровержение'), 'README exposes VNO expansion without requiring code search');
  check(vno.includes('SCIENCE_READINESS = min(Воспроизводимость, Независимость, Опровержение)'), 'canonical VNO document preserves weakest-pillar rule');
  check(server.includes("'/api/project-context'"), 'local/cloud-run server maps /api/project-context');
  check(apiContext.includes("contextIndex = require('../.ai/project-context-index.json')"), 'project-context API reads canonical machine index');
  check(apiContext.includes("currentVnoState = require('../.ai/vno-current-state.json')"), 'project-context API reads canonical current VNO state');
  check(apiContext.includes("acronym: 'ВНО'"), 'project-context API exposes VNO explicitly');

  const concept = index?.concepts?.vno || {};
  check(index.startHere === 'AI_START_HERE.md', 'machine index points to universal entrypoint');
  check(index.currentState === '.ai/vno-current-state.json', 'machine index points to current VNO state');
  check(index.sourceOfTruthBranch === 'master', 'machine index declares master source of truth');
  check(concept.canonicalFile === 'VNO.md', 'machine index points VNO to VNO.md');
  check(concept.currentStateFile === '.ai/vno-current-state.json', 'VNO concept points to current state file');
  check(concept.expansionRu === 'Воспроизводимость, Независимость, Опровержение', 'machine index preserves Russian expansion');
  check(concept.expansionEn === 'Reproducibility, Independence, Falsification', 'machine index preserves English expansion');

  const aliases = new Set(concept.aliases || []);
  for (const alias of ['ВНО', 'VNO', 'Принцип ВНО', 'цикл ВНО', 'VNO cycle', 'Science 100', 'Science to Gameplay', 'текущий шаг ВНО', 'current VNO step']) {
    check(aliases.has(alias), `VNO search alias preserved: ${alias}`);
  }

  const canonical = new Set(index.canonicalContextFiles || []);
  for (const file of ['AI_START_HERE.md', 'README.md', 'AGENTS.md', 'VNO.md', 'SCIENCE_STANDARD.md', '.ai/vno-current-state.json']) {
    check(canonical.has(file), `context index preserves canonical file: ${file}`);
  }

  check(current.sourceOfTruthBranch === 'master', 'current state declares master as source of truth');
  check(Number.isInteger(current.currentCycle) && current.currentCycle >= 1, 'current VNO cycle number is explicit');
  check(current.sourceCycleRecord === `science/vno/${current.sourceDiscovery}.vno.json`, 'current state points to its source cycle record');
  check(current.candidateStatus === 'PREREGISTRATION_REQUIRED_BEFORE_CONFIRMATION', 'current candidate cannot silently be promoted to confirmed');
  check(current.productionEnabled === false, 'current candidate is not falsely marked production-enabled');
  check(current.activeStep?.number === 4 && current.activeStep?.id === 'PROVE_IN_CODE', 'current VNO active step is explicit');
  check(current.vnoPriority?.weakestPillar === 'INDEPENDENCE', 'current weakest VNO pillar is explicit');
  check(current.vnoPriority?.knownBootstrapScores?.scienceReadiness === Math.min(
    current.vnoPriority?.knownBootstrapScores?.reproducibility,
    current.vnoPriority?.knownBootstrapScores?.independence,
    current.vnoPriority?.knownBootstrapScores?.falsification
  ), 'current readiness equals weakest pillar score');
  check(typeof current.nextAction?.id === 'string' && current.nextAction.id.length > 0, 'current next action is explicit');
}

if (failed) {
  console.error('\nAI context discovery check FAILED');
  process.exit(1);
}

console.log('\nAI context discovery check PASSED');
