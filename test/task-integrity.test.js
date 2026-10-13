'use strict';
{
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluate,
  parseEvents,
  verifyEvidence,
  sourceFiles,
  finalizeVerification
} = require('../scripts/task-integrity.cjs');

const NOW = Date.parse('2026-10-12T12:00:00Z');
let nextId = 1;

function row(lane, minutes = 30, changes = {}) {
  const end = NOW - 10 * 60000;
  const event = {
    id: 'run-test-' + String(nextId++).padStart(5, '0'),
    lane,
    kind: lane === 'CLEAN_SERVER' ? 'pr_closed' : 'playable',
    started_at: new Date(end - minutes * 60000).toISOString(),
    finished_at: new Date(end).toISOString(),
    productive_minutes: minutes,
    evidence_ref: lane === 'CLEAN_SERVER'
      ? 'https://github.com/mpaykin1/World_server/pull/492'
      : 'library:graphics-v2.zip',
    evidence_sha: 'a'.repeat(64),
    ...changes
  };
  return {
    id: 'comment-' + event.id,
    author_association: 'MEMBER',
    user: { login: changes.actor_id || 'builder' },
    created_at: new Date(Date.parse(event.finished_at) + 60000).toISOString(),
    body: '[TASK_INTEGRITY_EVENT_V1]\n' + JSON.stringify(event)
  };
}

function eventFrom(comment) {
  return JSON.parse(comment.body.slice('[TASK_INTEGRITY_EVENT_V1]'.length).trim());
}

test('balanced comment attestations remain explicitly unverified and do not set owner/Fleet verdicts', () => {
  const result = evaluate([
    row('CLEAN_SERVER'),
    row('GRAPHICS-DEMO-001', 30, { actor_id: 'graphics-builder' })
  ], NOW);
  assert.equal(result.status, 'TELEMETRY_BALANCED_UNVERIFIED');
  assert.equal(result.ok, true);
  assert.equal(result.telemetry_balanced, true);
  assert.equal(result.verification_pass, false);
  assert.equal(result.owner_verdict, 'UNSET');
  assert.equal(result.independent_fleet_visual_score, 'UNKNOWN');
  assert.equal(result.evidence_states[0], 'CONTENT_UNVERIFIED');
});

test('quota shortfall names the lane and debt that the next safe cycle must repay', () => {
  const result = evaluate([
    row('CLEAN_SERVER', 40),
    row('GRAPHICS-DEMO-001', 20, { actor_id: 'graphics-builder' })
  ], NOW);
  assert.equal(result.status, 'MISSED_QUOTA');
  assert.equal(result.recovery_lane, 'GRAPHICS-DEMO-001');
  assert.equal(result.debt_minutes['GRAPHICS-DEMO-001'], 10);
  assert.match(result.recovery_action, /NEXT_SAFE_CYCLE_MUST_DO_PRODUCTIVE_WORK/);
});

test('missing telemetry and one missing lane fail closed', () => {
  assert.equal(evaluate([], NOW).status, 'NO_TELEMETRY');
  assert.equal(evaluate([row('CLEAN_SERVER')], NOW).status, 'TASK_STARVATION');
});

test('same-performer overlapping intervals are rejected; different performers may work in parallel', () => {
  const a = row('CLEAN_SERVER', 20);
  const aEvent = eventFrom(a);
  const end = Date.parse(aEvent.finished_at);
  const b = row('GRAPHICS-DEMO-001', 20, {
    actor_id: 'builder',
    started_at: new Date(end - 10 * 60000).toISOString(),
    finished_at: new Date(end + 10 * 60000).toISOString(),
    productive_minutes: 20
  });
  assert.equal(evaluate([a, b], NOW).status, 'INVALID_TELEMETRY');
  const parallel = row('GRAPHICS-DEMO-001', 20, { actor_id: 'second-builder' });
  assert.equal(evaluate([a, parallel], NOW).status, 'TELEMETRY_BALANCED_UNVERIFIED');
  assert.equal(parseEvents([a, parallel], NOW).invalid.length, 0);
  const segmentedA = row('CLEAN_SERVER', 10, {
    started_at: new Date(NOW - 40 * 60000).toISOString(),
    productive_segments: [{ started_at: new Date(NOW - 35 * 60000).toISOString(), finished_at: new Date(NOW - 25 * 60000).toISOString() }]
  });
  const segmentedB = row('GRAPHICS-DEMO-001', 10, {
    actor_id: 'builder',
    started_at: new Date(NOW - 30 * 60000).toISOString(),
    finished_at: new Date(NOW - 5 * 60000).toISOString(),
    productive_segments: [{ started_at: new Date(NOW - 20 * 60000).toISOString(), finished_at: new Date(NOW - 10 * 60000).toISOString() }]
  });
  assert.equal(evaluate([segmentedA, segmentedB], NOW).status, 'TELEMETRY_BALANCED_UNVERIFIED');
});

test('rolling-window boundary clips a legacy attestation conservatively', () => {
  const start = NOW - 4 * 60 * 60 * 1000 - 20 * 60000;
  const end = NOW - 4 * 60 * 60 * 1000 + 10 * 60000;
  const c = row('CLEAN_SERVER', 30, {
    started_at: new Date(start).toISOString(),
    finished_at: new Date(end).toISOString(),
    productive_minutes: 30
  });
  const parsed = parseEvents([c], NOW);
  assert.equal(parsed.valid[0].minutes, 10);
});

test('productive segments must fit the event, not overlap, and agree with claimed minutes', () => {
  const good = row('CLEAN_SERVER', 20, {
    started_at: new Date(NOW - 40 * 60000).toISOString(),
    productive_segments: [
      { started_at: new Date(NOW - 35 * 60000).toISOString(), finished_at: new Date(NOW - 25 * 60000).toISOString() },
      { started_at: new Date(NOW - 20 * 60000).toISOString(), finished_at: new Date(NOW - 10 * 60000).toISOString() }
    ]
  });
  assert.equal(parseEvents([good], NOW).invalid.length, 0);
  const bad = row('GRAPHICS-DEMO-001', 20, {
    started_at: new Date(NOW - 40 * 60000).toISOString(),
    productive_segments: [
      { started_at: new Date(NOW - 35 * 60000).toISOString(), finished_at: new Date(NOW - 20 * 60000).toISOString() },
      { started_at: new Date(NOW - 25 * 60000).toISOString(), finished_at: new Date(NOW - 10 * 60000).toISOString() }
    ]
  });
  assert.equal(parseEvents([bad], NOW).invalid[0].reason, 'BAD_PRODUCTIVE_SEGMENTS');
});

test('duplicates, unsupported kinds, impossible minutes and issue-self-evidence are rejected', () => {
  const a = row('CLEAN_SERVER');
  const duplicate = { ...a, id: 'duplicate-comment' };
  const plan = row('GRAPHICS-DEMO-001', 30, { actor_id: 'graphics-builder', kind: 'planning' });
  const impossible = row('GRAPHICS-DEMO-001', 30, { actor_id: 'graphics-builder', productive_minutes: 61 });
  const self = row('GRAPHICS-DEMO-001', 30, {
    actor_id: 'graphics-builder',
    evidence_ref: 'https://github.com/mpaykin1/World_server/issues/80'
  });
  assert.equal(evaluate([a, duplicate, plan], NOW).status, 'INVALID_TELEMETRY');
  assert.ok(parseEvents([impossible], NOW).invalid.length);
  assert.ok(parseEvents([self], NOW).invalid.length);
});

test('Library references are attestations only until a fetchable immutable source exists', async () => {
  const event = eventFrom(row('GRAPHICS-DEMO-001'));
  assert.deepEqual(await verifyEvidence(event, 'token'), {
    status: 'CONTENT_UNVERIFIED',
    reason: 'LIBRARY_NOT_FETCHABLE_FROM_GITHUB_ACTION'
  });
});

test('commit URL must match hash and contain a non-report source change', async () => {
  const event = eventFrom(row('CLEAN_SERVER', 10, {
    kind: 'code',
    evidence_ref: 'https://github.com/mpaykin1/World_server/commit/' + 'b'.repeat(40),
    evidence_sha: 'b'.repeat(40)
  }));
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ sha: 'b'.repeat(40), files: [{ filename: 'scripts/fix.js' }] })
  });
  assert.equal((await verifyEvidence(event, 'token', fetchImpl)).status, 'CONTENT_VERIFIED');
  const reportOnly = async () => ({
    ok: true,
    json: async () => ({ sha: 'b'.repeat(40), files: [{ filename: 'reports/summary.json' }] })
  });
  assert.equal((await verifyEvidence(event, 'token', reportOnly)).reason, 'NO_PRODUCT_SOURCE_CHANGE');
  event.evidence_sha = 'c'.repeat(40);
  assert.equal((await verifyEvidence(event, 'token', fetchImpl)).reason, 'HASH_REF_MISMATCH');
});

test('unavailable GitHub evidence verification stays unknown instead of becoming PASS', async () => {
  const event = eventFrom(row('CLEAN_SERVER', 10, {
    kind: 'code',
    evidence_ref: 'https://github.com/mpaykin1/World_server/commit/' + 'd'.repeat(40),
    evidence_sha: 'd'.repeat(40)
  }));
  const offline = async () => ({ ok: false, status: 503 });
  const result = await verifyEvidence(event, 'token', offline);
  assert.equal(result.status, 'CONTENT_UNVERIFIED');
});

test('only explicit independent time and artifact verifiers can produce verification_pass', () => {
  const events = [
    row('CLEAN_SERVER'),
    row('GRAPHICS-DEMO-001', 30, { actor_id: 'graphics-builder' })
  ];
  const unverified = evaluate(events, NOW);
  assert.equal(unverified.telemetry_balanced, true);
  assert.equal(unverified.measurement_verified, false);
  assert.equal(unverified.evidence_verified, false);
  assert.equal(unverified.verification_pass, false);
  const verified = evaluate(events, NOW, {
    measurementVerifier: () => true,
    evidenceVerifier: () => true
  });
  assert.equal(verified.status, 'TELEMETRY_BALANCED_VERIFIED');
  assert.equal(verified.verification_pass, true);
});

test('known PR #497 report-only JSON inventory is not accepted as a source patch', () => {
  const names = [
    'AUTOFIX_REPORT.json', 'DESKTOP_AI_PROTOCOL_REPORT.json', 'DUPLICATE_SYSTEM_REPORT.json',
    'EVIDENCE_QUALITY_REPORT.json', 'PROJECT_QUALITY_REVIEW.json', 'QUALITY_CHANGE_IMPACT.json',
    'QUALITY_IMPACT_GRAPH.json', 'QUALITY_ISSUE_CANDIDATES.json', 'QUALITY_REGRESSION_REPORT.json',
    'QUALITY_REPORT.json', 'SYSTEM_CONTRACT_REPORT.json', 'TECHNOLOGY_AUDIT.json',
    'TECHNOLOGY_ORCHESTRATOR_REPORT.json', 'TECHNOLOGY_RUNTIME_HEALTH.json',
    'TEST_GAP_MANIFEST.json', 'VISUAL_PERCEPTUAL_REPORT.json', 'WORLD_ANIMATION_SEMANTIC_REPORT.json',
    'WORLD_CANDIDATE_LAB_REPORT.json', 'WORLD_DEVICE_PROFILE_MATRIX.json',
    'WORLD_EMERGENCE_REPORT.json', 'WORLD_FEEDBACK_LEARNER_REPORT.json',
    'WORLD_MATERIAL_SYNTHESIS_REPORT.json', 'WORLD_MICRODETAIL_REPORT.json',
    'WORLD_NEXT_EXPERIMENT_REPORT.json', 'WORLD_QUALITY_AUTOPILOT_PLAN.json',
    'WORLD_QUALITY_AUTOPILOT_REPORT.json', 'WORLD_QUALITY_AUTOPILOT_STATUS.json',
    'WORLD_QUALITY_EVIDENCE_LEDGER.json', 'WORLD_QUALITY_SCHEDULER_REPORT.json',
    'WORLD_RETARGET_CONTRACT_REPORT.json', 'WORLD_RUNTIME_QUALITY_REPORT.json',
    'WORLD_SEMANTIC_DETAIL_REPORT.json', 'WORLD_VISIBILITY_OPTIMIZER_REPORT.json',
    'WORLD_VISUAL_BASELINE_CANDIDATES.json'
  ];
  assert.deepEqual(sourceFiles(names), []);
});

test('final verification requires time and fetchable content proof independently', () => {
  const result = evaluate([
    row('CLEAN_SERVER'),
    row('GRAPHICS-DEMO-001', 30, { actor_id: 'graphics-builder' })
  ], NOW);
  finalizeVerification(result, [
    { status: 'CONTENT_VERIFIED' },
    { status: 'CONTENT_UNVERIFIED', reason: 'library unavailable' }
  ]);
  assert.equal(result.status, 'TELEMETRY_BALANCED_UNVERIFIED');
  assert.equal(result.evidence_verified, false);
  assert.equal(result.measurement_verified, false);
  assert.equal(result.verification_pass, false);
  assert.equal(result.ok, true);
});

test('verified CLEAN_SERVER PR closure may be merged or safely closed without merge', async () => {
  const head = 'e'.repeat(40);
  const closed = {
    state: 'closed',
    closed_at: '2026-10-12T11:00:00Z',
    merged_at: null,
    merge_commit_sha: null,
    head: { sha: head }
  };
  const event = {
    kind: 'pr_closed',
    evidence_ref: 'https://github.com/mpaykin1/World_server/pull/497',
    evidence_sha: head,
    started_at: '2026-10-12T10:55:00Z',
    finished_at: '2026-10-12T11:05:00Z'
  };
  const unmerged = await verifyEvidence(event, 'token', async () => ({ ok: true, json: async () => closed }));
  assert.equal(unmerged.status, 'CONTENT_VERIFIED');
  assert.equal(unmerged.proof, 'CLOSED_WITHOUT_MERGE');
  closed.merged_at = '2026-10-12T11:02:00Z';
  closed.merge_commit_sha = 'f'.repeat(40);
  event.evidence_sha = closed.merge_commit_sha;
  const merged = await verifyEvidence(event, 'token', async () => ({ ok: true, json: async () => closed }));
  assert.equal(merged.status, 'CONTENT_VERIFIED');
  assert.equal(merged.proof, 'MERGED_PR_CLOSED');
});


test('a historically closed PR cannot be replayed as newly productive closure work', async () => {
  const event = {
    kind: 'pr_closed',
    evidence_ref: 'https://github.com/mpaykin1/World_server/pull/497',
    evidence_sha: 'e'.repeat(40),
    started_at: '2026-10-12T10:55:00Z',
    finished_at: '2026-10-12T11:05:00Z'
  };
  const pr = { state: 'closed', closed_at: '2026-10-11T11:00:00Z',
    merged_at: null, head: { sha: event.evidence_sha } };
  const fetchImpl = async () => ({ ok: true, json: async () => pr });
  assert.equal((await verifyEvidence(event, 'token', fetchImpl)).reason, 'STALE_PR_CLOSURE');
  pr.closed_at = '2026-10-12T11:00:00Z';
  assert.equal((await verifyEvidence(event, 'token', fetchImpl)).status, 'CONTENT_VERIFIED');
  pr.closed_at = '2026-10-12T11:25:00Z';
  assert.equal((await verifyEvidence(event, 'token', fetchImpl)).reason, 'STALE_PR_CLOSURE');
  delete event.started_at;
  assert.equal((await verifyEvidence(event, 'token', fetchImpl)).reason, 'CLOSURE_INTERVAL_MISSING');
});

test('null, array, and primitive JSON payloads are classified as invalid telemetry', () => {
  const malformed = ['null', '[]', '7', '"string"'].map((payload, index) => ({
    id: 'primitive-' + index,
    author_association: 'MEMBER',
    created_at: new Date(NOW).toISOString(),
    body: '[TASK_INTEGRITY_EVENT_V1] ' + payload
  }));
  assert.equal(parseEvents(malformed, NOW).invalid.length, malformed.length);
  assert.ok(parseEvents(malformed, NOW).invalid.every(item => item.reason === 'BAD_JSON'));
});

test('intervals longer than the bounded 60-minute evidence horizon are rejected', () => {
  const tooLong = row('CLEAN_SERVER', 60, {
    started_at: new Date(NOW - 90 * 60000).toISOString(),
    finished_at: new Date(NOW - 10 * 60000).toISOString(),
    productive_minutes: 60
  });
  assert.equal(parseEvents([tooLong], NOW).invalid[0].reason, 'INTERVAL_TOO_LONG');
});

test('time fields distinguish attested minutes from independently verified actual minutes', () => {
  const result = evaluate([
    row('CLEAN_SERVER'), row('GRAPHICS-DEMO-001', 30, { actor_id: 'graphics-builder' })
  ], NOW);
  assert.deepEqual(result.attested_minutes, result.actual_minutes);
  assert.equal(result.actual_minutes_status, 'ATTESTED_UNVERIFIED');
  assert.equal(result.verified_actual_minutes, null);
});

test('actor payload labels cannot evade overlap; authenticated authors can run in parallel', () => {
  const first = row('CLEAN_SERVER', 20, { actor_id: 'invented-worker-a' });
  first.user = { login: 'same-authenticated-author' };
  const firstEvent = eventFrom(first);
  const end = Date.parse(firstEvent.finished_at);
  const spoofed = row('GRAPHICS-DEMO-001', 20, {
    actor_id: 'invented-worker-b',
    started_at: new Date(end - 10 * 60000).toISOString(),
    finished_at: new Date(end + 10 * 60000).toISOString(),
    productive_minutes: 20
  });
  spoofed.user = { login: 'same-authenticated-author' };
  assert.equal(evaluate([first, spoofed], NOW).status, 'INVALID_TELEMETRY');
  const parsed = parseEvents([first], NOW).valid[0];
  assert.equal(parsed.actor_id, 'same-authenticated-author');
  assert.equal(parsed.declared_actor_id, 'invented-worker-a');

  const other = row('GRAPHICS-DEMO-001', 20, {
    actor_id: 'invented-worker-b',
    started_at: new Date(end - 10 * 60000).toISOString(),
    finished_at: new Date(end + 10 * 60000).toISOString(),
    productive_minutes: 20
  });
  other.user = { login: 'different-authenticated-author' };
  assert.equal(evaluate([first, other], NOW).status, 'TELEMETRY_BALANCED_UNVERIFIED');
});

test('generic summaries and report-only docs are not source changes, runtime code and workflow config are', () => {
  assert.deepEqual(sourceFiles([
    'summary.json', 'analysis.json', 'docs/quality-contract.md', 'README.md',
    '.github/workflows/ci.yml', 'src/game/runtime.ts', 'public/world/tiles.png'
  ]), ['.github/workflows/ci.yml', 'src/game/runtime.ts', 'public/world/tiles.png']);
});
}
{
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../scripts/task-integrity.cjs');
const NOW=Date.parse('2026-10-12T12:00:00Z');
function row(lane,minutes=30,id='run-00001',changes={}) {
  const end=NOW-10*60000;
  const e={id,lane,kind:lane==='CLEAN_SERVER'?'pr_closed':'playable',
    started_at:new Date(end-minutes*60000).toISOString(),
    finished_at:new Date(end).toISOString(),productive_minutes:minutes,
    evidence_ref:'https://github.com/mpaykin1/World_server/pull/492',
    evidence_sha:'a'.repeat(40),...changes};
  return {id,author_association:'OWNER',created_at:new Date(end+60000).toISOString(),
    body:'[TASK_INTEGRITY_EVENT_V1]\n'+JSON.stringify(e)};
}
test('balanced telemetry never self-certifies Fleet or owner PASS',()=>{
 const r=evaluate([row('CLEAN_SERVER'),row('GRAPHICS-DEMO-001',30,'run-00002')],NOW);
 assert.equal(r.status,'TELEMETRY_BALANCED_UNVERIFIED');
 assert.equal(r.owner_verdict,'UNSET');
 assert.equal(r.independent_fleet_visual_score,'UNKNOWN');
});
test('unequal minutes produce debt',()=>{
 const r=evaluate([row('CLEAN_SERVER',45),row('GRAPHICS-DEMO-001',15,'run-00002')],NOW);
 assert.equal(r.status,'MISSED_QUOTA');
 assert.equal(r.debt_minutes['GRAPHICS-DEMO-001'],15);
});
test('missing telemetry and one missing lane fail closed',()=>{
 assert.equal(evaluate([],NOW).status,'NO_TELEMETRY');
 assert.equal(evaluate([row('CLEAN_SERVER')],NOW).status,'TASK_STARVATION');
});
test('stale, duplicate, impossible and planning events fail closed',()=>{
 const a=row('CLEAN_SERVER'),b=row('GRAPHICS-DEMO-001',30,'run-00002');
 assert.equal(evaluate([a,b,b],NOW).status,'INVALID_TELEMETRY');
 assert.equal(evaluate([a,row('GRAPHICS-DEMO-001',30,'run-00002',{kind:'planning'})],NOW).status,'INVALID_TELEMETRY');
 assert.equal(evaluate([a,row('GRAPHICS-DEMO-001',30,'run-00002',{productive_minutes:61})],NOW).status,'INVALID_TELEMETRY');
 assert.equal(evaluate([a,row('GRAPHICS-DEMO-001',30,'run-00002',{evidence_ref:'https://github.com/mpaykin1/World_server/issues/80'})],NOW).status,'INVALID_TELEMETRY');
 const old=row('CLEAN_SERVER',30,'run-oldxx',{started_at:'2026-10-10T03:00:00Z',finished_at:'2026-10-10T03:30:00Z'});
 assert.equal(evaluate([old],NOW).status,'NO_TELEMETRY');
});
test('untrusted comments cannot alter result',()=>{
 const a=row('CLEAN_SERVER'),b=row('GRAPHICS-DEMO-001',30,'run-00002');
 const forged={...row('CLEAN_SERVER',30,'run-forge'),author_association:'NONE'};
 assert.equal(evaluate([a,b,forged],NOW).status,'TELEMETRY_BALANCED_UNVERIFIED');
});
}
