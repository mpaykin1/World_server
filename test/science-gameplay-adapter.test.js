'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const adapter = require('../lib/science-gameplay-adapter');

const ROOT = path.resolve(__dirname, '..');

function ring(y = 40, blockType = 10) {
  return [[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]]
    .map(([x,z]) => ({ x, y, z, blockType }));
}

test('RUN_072 contract is verified, complete and age-5 safe', () => {
  const contract = adapter.loadContract('RUN_072');
  assert.equal(adapter.isVerified(contract), true);
  assert.equal(contract.navigator.audienceAge, 5);
  assert.equal(contract.telemetry.pii, false);
  for (const gate of adapter.REQUIRED_GATES) assert.equal(contract.completionGates[gate], true);
  assert.equal(adapter.validateAge5Navigator(contract.navigator), true);
});
test('RUN_072 proposes deterministic bounded cycle-closing regrowth', () => {
  const context = {
    event: 'player_break',
    previousBlockType: 10,
    removed: { x: 3, y: 40, z: 1 },
    playerPosition: { x: 8, y: 40, z: 8 },
    nodes: ring(),
    emptyCells: [{ x: 1, y: 40, z: 1 }, { x: 3, y: 40, z: 1 }]
  };
  const first = adapter.handleEvent('RUN_072', context);
  const second = adapter.handleEvent('RUN_072', context);
  assert.ok(first);
  assert.deepEqual(first, second);
  assert.ok(first.effects.length >= 1 && first.effects.length <= 2);
  assert.ok(first.effects.some(e => e.x === 1 && e.y === 40 && e.z === 1));
  assert.ok(first.effects.every(e => !(e.x === 3 && e.y === 40 && e.z === 1)));
  assert.equal(first.navigator.audienceAge, 5);
  assert.equal(first.telemetry.runId, 'RUN_072');
  assert.ok(first.metrics.afterLcc >= first.metrics.beforeLcc);
});

test('RUN_072 ignores natural terrain and tiny player structures', () => {  assert.equal(adapter.handleEvent('RUN_072', {
    event: 'player_break', previousBlockType: 3,
    removed: { x: 0, y: 20, z: 0 }, nodes: ring(20, 10),
    emptyCells: [{ x: 1, y: 20, z: 1 }]
  }), null);
  assert.equal(adapter.handleEvent('RUN_072', {
    event: 'player_break', previousBlockType: 10,
    removed: { x: 0, y: 20, z: 0 },
    nodes: [{ x: 1, y: 20, z: 0, blockType: 10 }, { x: 2, y: 20, z: 0, blockType: 10 }],
    emptyCells: [{ x: 1, y: 20, z: 1 }]
  }), null);
});

test('RUN_072 only grows into explicit prior damage, never unknown terrain', () => {
  assert.equal(adapter.handleEvent('RUN_072', {
    event: 'player_break', previousBlockType: 10,
    removed: { x: 3, y: 40, z: 1 },
    playerPosition: { x: 9, y: 40, z: 9 },
    nodes: ring(),
    emptyCells: []
  }), null);
});
test('every SCIENCE_RUN_072+ evidence file has a gameplay contract', () => {
  const files = fs.readdirSync(ROOT).filter(name => /^SCIENCE_RUN_(\d{3}).*\.json$/.test(name));
  for (const name of files) {
    const runNumber = Number(name.match(/^SCIENCE_RUN_(\d{3})/)[1]);
    if (runNumber < 72) continue;
    const runId = `RUN_${String(runNumber).padStart(3, '0')}`;
    const contractPath = path.join(ROOT, 'science', 'gameplay', `${runId}.gameplay.json`);
    assert.equal(fs.existsSync(contractPath), true, `${name} requires ${runId}.gameplay.json`);
    const contract = adapter.loadContract(runId);
    const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
    if (evidence.pass === true) {
      assert.equal(adapter.isVerified(contract), true);
      for (const gate of adapter.REQUIRED_GATES) assert.equal(contract.completionGates[gate], true);
    } else {
      assert.equal(contract.enabled, false, 'Failed/refuted science must remain inactive.');
    }
  }
});

test('public RUN_072 exposes trusted age-5 regrow copy to clients', () => {
  const run = adapter.listPublicRuns().find(item => item.runId === 'RUN_072');
  assert.ok(run?.active);
  assert.equal(run.navigator.audienceAge, 5);
  assert.equal(typeof run.navigator.regrow, 'string');
  assert.ok(run.navigator.regrow.length > 10);
});

test('voxel API checks the exact broken block before scanning a neighborhood', () => {
  const source = fs.readFileSync(path.join(ROOT, 'api', 'voxel.js'), 'utf8');
  const exact = source.indexOf(".select('block_type').eq('world_id', worldId).eq('x', x).eq('y', y).eq('z', z).maybeSingle()");
  const neighborhood = source.indexOf(".gte('x', x - radius).lte('x', x + radius)");
  assert.ok(exact >= 0 && neighborhood > exact);
  assert.match(source, /const relevant = contracts\.filter\(contract => .*eligibleBlockTypes/);
});

// CHUNK_A_END

test('science growth failure never rolls back the already-persisted player edit', () => {
  const source = fs.readFileSync(path.join(ROOT, 'api', 'voxel.js'), 'utf8');
  assert.doesNotMatch(source, /dbFailure\(growthError/);
  assert.match(source, /scienceContext\.contract\.runId/);
  assert.match(source, /growth skipped/);
  assert.match(source, /return \{ block: data, science: scienceEvents\[0\] \|\| null, scienceEvents \};/);
});

test('realtime peers cannot inject arbitrary Navigator copy', () => {
  const source = fs.readFileSync(path.join(ROOT, 'apps', 'voxel-world', 'client.js'), 'utf8');
  assert.match(source, /announceTrustedScienceSignal\(payload\)/);
  assert.match(source, /payload: \{ runId: science\.runId, telemetry: science\.telemetry \}/);
  assert.doesNotMatch(source, /event: 'science_event', payload: science/);
  assert.doesNotMatch(source, /science_event'\},\(\{payload\}\)=>announceScience\(payload\)/);
});


test('science telemetry reuses the existing persistent quality endpoint without PII', () => {
  const shared = fs.readFileSync(path.join(ROOT, 'shared', 'quality-telemetry.js'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'api', 'quality-telemetry.js'), 'utf8');
  assert.match(shared, /world:science-gameplay/);
  assert.match(shared, /send\('science_gameplay'/);
  assert.match(shared, /runId/);
  assert.doesNotMatch(shared, /userId|guestId|email|username/);
  assert.match(api, /quality_telemetry/);
  assert.match(api, /event_type/);
  assert.match(api, /message/);
});

test('remote observers show trusted science copy without duplicating telemetry', () => {
  const source = fs.readFileSync(path.join(ROOT, 'apps', 'voxel-world', 'client.js'), 'utf8');
  const start = source.indexOf('function announceTrustedScienceSignal');
  const end = source.indexOf('function applyScienceResult', start);
  const fn = source.slice(start, end);
  assert.match(fn, /trustedScienceRuns/);
  assert.match(fn, /run\.navigator\?\.regrow/);
  assert.doesNotMatch(fn, /emitScienceTelemetry/);
});

test('ScienceGameplayAdapter is extensible without editing its event router for RUN_073+', () => {
  adapter.registerMechanicHandler('future_demo_test', () => ({ runId: 'RUN_073', effects: [] }));
  const future = JSON.parse(JSON.stringify(adapter.loadContract('RUN_072')));
  future.runId = 'RUN_073';
  future.mechanic.type = 'future_demo_test';
  assert.equal(adapter.validateContract(future).runId, 'RUN_073');
  const activeBreakRuns = adapter.getActiveContractsForEvent('player_break').map(item => item.runId);
  assert.ok(activeBreakRuns.includes('RUN_072'));
});

test('voxel runtime discovers active science runs instead of hardcoding RUN_072', () => {
  const source = fs.readFileSync(path.join(ROOT, 'api', 'voxel.js'), 'utf8');
  assert.match(source, /getActiveContractsForEvent\('player_break'\)/);
  assert.match(source, /scienceEvents/);
  assert.doesNotMatch(source, /getActiveContract\('RUN_072'\)/);
  assert.doesNotMatch(source, /handleEvent\('RUN_072'/);
});

test('voxel client applies every scienceEvents result and introduces only the newest run', () => {
  const source = fs.readFileSync(path.join(ROOT, 'apps', 'voxel-world', 'client.js'), 'utf8');
  assert.match(source, /Array\.isArray\(result\.scienceEvents\)/);
  assert.match(source, /for\(const scienceEvent of scienceEvents\)applyScienceResult\(scienceEvent\)/);
  assert.match(source, /filter\(run=>run\.active\)\.at\(-1\)/);
});

test('gameplay uses the same RUN_071 candidate score rule', () => {
  const { redundantCandidateScore } = require('../lib/science-h2-redundant-rule');
  assert.equal(redundantCandidateScore({ neighborCount: 3, radiusGrid: 2, random01: 0.5 }), 3*4-2*0.15+0.5*0.75);
  const source = fs.readFileSync(path.join(__dirname,'../lib/science-gameplay-adapter.js'),'utf8');
  assert.match(source, /redundantCandidateScore/);
  assert.doesNotMatch(source, /distancePenalty \|\| 0\.08/);
});
