'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'science', 'vno');
const cyclePolicy = JSON.parse(fs.readFileSync(path.join(root, '.ai', 'vno-cycle.json'), 'utf8'));

function fail(message) {
  console.error(`VNO NEXT FAIL: ${message}`);
  process.exit(1);
}

const records = fs.readdirSync(dir)
  .filter(name => /^RUN_\d{3}\.vno\.json$/.test(name))
  .map(name => {
    const record = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    return { name, record };
  })
  .sort((a, b) => Number(b.record.cycle || 0) - Number(a.record.cycle || 0));

if (!records.length) fail('no RUN_###.vno.json cycle record exists');
const latest = records[0];
const audit = latest.record.vnoAudit || {};
const next = latest.record.nextLoop || {};

if (next.returnToStep !== 1) fail(`${latest.name} does not return to step 1`);
if (!next.candidate || !next.firstAction) fail(`${latest.name} has no concrete next candidate/first action`);
if (!audit.weakestPillar) fail(`${latest.name} does not name its weakest VNO pillar`);

const task = {
  principle: 'ВНО',
  sourceRecord: latest.name,
  completedCycle: latest.record.cycle,
  returnToStep: 1,
  nextCandidate: next.candidate,
  weakestPillar: audit.weakestPillar,
  firstAction: next.firstAction,
  safety: {
    cloudFirst: cyclePolicy.execution?.cloudFirst === true,
    localHeavyWorkDefault: cyclePolicy.execution?.localHeavyWorkDefault,
    desktopClutterForbidden: cyclePolicy.execution?.desktopClutterForbidden === true,
    computerSlowdownIsRegression: cyclePolicy.execution?.computerSlowdownIsARegression === true,
    successDoesNotAutoPromoteGameplay: next.successDoesNotAutoPromoteGameplay === true
  },
  requiredLoop: (cyclePolicy.loop || []).map(step => ({ step: step.step, id: step.id, name: step.name, kidMeaning: step.kidMeaning })),
  instruction: [
    `Start VNO cycle ${Number(latest.record.cycle || 0) + 1} from candidate ${next.candidate}.`,
    `First improve the weakest pillar: ${audit.weakestPillar}.`,
    `First concrete action: ${next.firstAction}`,
    'Freeze falsifiable criteria before hidden confirmation.',
    'Evaluate every system in data/vno-gameplay-systems.json; honest NOT_APPLICABLE is allowed.',
    'Do not promote any gameplay feature without its own code evidence and existing Science -> Gameplay gates.',
    'Explain player-visible results in simple Russian understandable to a five-year-old.',
    'Use browser/cloud first. Do not run unnecessary heavy local AI, create Desktop clutter, or accept computer slowdown.',
    'Preserve every failed attempt and negative result as evidence, then return to step 1 again.'
  ].join(' ')
};

if (process.argv.includes('--prompt')) {
  console.log(task.instruction);
} else {
  console.log(JSON.stringify(task, null, 2));
}
