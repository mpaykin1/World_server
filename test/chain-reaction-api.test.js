'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handle } = require('../lib/chain-reaction-api');
const engine = require('../lib/world-consequence-engine');
const clone = x => JSON.parse(JSON.stringify(x));
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';
const STRANGER_ID = '33333333-3333-4333-8333-333333333333';
function fixture(options = {}) {
  let row = { id: 'city', seed: 42, updated_at: '2026-09-23T00:00:00.000Z', settings: { worldDNA: { preserved: true } } };
  const memberships = new Map(options.member
    ? [[`city:${OWNER_ID}`, { role: options.member }]]
    : (options.denied ? [] : [[`city:${OWNER_ID}`, { role: 'owner' }]]));
  let writes = 0;
  const privateEvents = [];
  const users = {
    valid: { id: OWNER_ID, app_metadata: { chain_reaction_worlds: ['city'] }, user_metadata: { chain_reaction_worlds: ['city'] } },
    player: { id: PLAYER_ID, app_metadata: { chain_reaction_worlds: ['city'] }, user_metadata: {} },
    stranger: { id: STRANGER_ID, app_metadata: {}, user_metadata: {} }
  };
  const admin = {
    auth: { getUser: async token => ({ data: { user: users[token] || null }, error: null }) },
    async rpc(name, params) {
      assert.equal(name, 'commit_chain_reaction_action');
      if (options.dbError) return { data: null, error: { code: 'database_error' } };
      if (options.conflict || row.updated_at !== params.p_expected_updated_at) return { data: false, error: null };
      const serialized = JSON.stringify(params.p_public_settings);
      assert.doesNotMatch(serialized, /actorId|"comment"/);
      row = { ...row, settings: clone(params.p_public_settings), updated_at: params.p_next_updated_at };
      privateEvents.push({ actorId: params.p_actor_id, action: params.p_action, revision: params.p_revision, comment: params.p_comment });
      writes++;
      return { data: true, error: null };
    },
    from(table) {
      const filters = []; let patch; let operation = 'select'; let inserted;
      return {
        select() { return this; }, eq(k, v) { filters.push([k, v]); return this; },
        update(value) { patch = value; operation = 'update'; return this; },
        insert(value) { inserted = value; operation = 'insert'; return this; },
        delete() { operation = 'delete'; return this; },
        async maybeSingle() {
          if (table === 'profiles') return { data: { username: 'Tester' } };
          if (options.dbError) return { error: { code: 'database_error' } };
          if (options.missing) return { data: null };
          if (table === 'chain_reaction_world_members') {
            const values = Object.fromEntries(filters);
            const key = `${values.world_id || inserted?.world_id}:${values.user_id || inserted?.user_id}`;
            if (operation === 'insert') {
              if (options.missingTarget && inserted.user_id === PLAYER_ID) return { data: null, error: { code: '23503' } };
              if (options.inviteRaceOwner && inserted.user_id === PLAYER_ID) {
                memberships.set(key, { role: 'owner' });
                return { data: null, error: { code: '23505' } };
              }
              if (memberships.has(key)) return { data: null, error: { code: '23505' } };
              memberships.set(key, { role: inserted.role });
              return { data: { role: inserted.role }, error: null };
            }
            if (operation === 'delete') {
              const existing = memberships.get(key);
              if (existing?.role === values.role) memberships.delete(key);
              return { data: existing || null, error: null };
            }
            return { data: memberships.get(key) || null, error: null };
          }
          if (!patch) return { data: clone(row) };
          assert.deepEqual(filters.map(x => x[0]), ['id', 'updated_at']);
          if (options.conflict || !filters.every(([k, v]) => row[k] === v)) return { data: null };
          row = { ...row, ...clone(patch) }; writes++; return { data: { id: row.id } };
        }
      };
    }
  };
  return { admin, memberships, privateEvents, get row() { return row; }, get writes() { return writes; } };
}
const req = { headers: { authorization: 'Bearer valid' } };
const playerReq = { headers: { authorization: 'Bearer player' } };
const body = (action, extra = {}) => ({ action, worldId: 'city', structure: 'solar', text: '', ...extra });
const rejects = (promise, status) => assert.rejects(promise, e => e.status === status);

test('intent and preview are read-only; forged compiled intent is ignored', async () => {
  const f = fixture();
  const interpreted = await handle(f.admin, req, body('interpret-intent'));
  assert.equal(interpreted.intent.goal, 'solar');
  const preview = await handle(f.admin, req, body('preview-plan', { intent: { goal: 'solar', timeline: 0 }, cost: -100 }));
  assert.equal(preview.plan.cost, 40); assert.equal(preview.plan.buildTicks, 2);
  assert.equal(f.writes, 0);
});
test('Genie options are authorized, deterministic, read-only and keep categories hidden', async () => {
  const f = fixture();
  f.row.settings.chainReaction = engine.createWorld('genie-api');
  Object.assign(f.row.settings.chainReaction.resources, { power: 35, water: 80, food: 80, budget: 500, workers: 50 });
  const first = await handle(f.admin, req, body('genie-options'));
  const second = await handle(f.admin, req, body('genie-options'));
  assert.deepEqual(first, second); assert.equal(first.cards.length, 4); assert.equal(first.fifth.kind, 'free_intent');
  assert.equal(first.cards.some(card => Object.hasOwn(card, 'category')), false);
  assert.doesNotMatch(JSON.stringify(first.cards), /worsens|shifts_crisis|balanced/);
  assert.equal(f.writes, 0);
  await rejects(handle(fixture({ denied: true }).admin, req, body('genie-options')), 403);
});
test('resident lookup returns canonical fictional identity without writing', async () => {
  const f = fixture();
  f.row.settings.chainReaction = engine.createWorld('resident-api');
  const expected = engine.address(f.row.settings.chainReaction, 'house-1', 2, 3);
  const first = await handle(f.admin, req, body('resident-at-address', { building: 'house-1', floor: 2, flat: 3 }));
  const reconnected = await handle(f.admin, req, body('resident-at-address', { building: 'house-1', floor: 2, flat: 3 }));
  assert.deepEqual(first.resident, expected); assert.deepEqual(reconnected, first);
  assert.equal(first.resident.fictional, true); assert.equal(f.writes, 0);
  const invited = fixture({ denied: true, member: 'player' });
  invited.row.settings.chainReaction = engine.createWorld('resident-api-player');
  assert.equal((await handle(invited.admin, req, body('resident-at-address', { building: 'house-0', floor: 1, flat: 1 }))).resident.fictional, true);
  await rejects(handle(fixture({ denied: true }).admin, req, body('resident-at-address', { building: 'house-0', floor: 1, flat: 1 })), 403);
});
test('resident lookup allowlists its public DTO even when stored data has extra fields', async () => {
  const f = fixture();
  f.row.settings.chainReaction = engine.createWorld('resident-api-tainted');
  const resident = f.row.settings.chainReaction.residents.find(candidate => candidate.building === 'house-0' && candidate.floor === 1 && candidate.flat === 1);
  Object.assign(resident, { comment: 'private child text', actorId: STRANGER_ID, category: 'hidden_genie_category', role: 'untrusted' });
  const result = await handle(f.admin, req, body('resident-at-address', { building: 'house-0', floor: 1, flat: 1 }));
  assert.deepEqual(Object.keys(result.resident).sort(), ['building', 'fictional', 'flat', 'floor', 'id', 'name']);
  assert.doesNotMatch(JSON.stringify(result), /private child text|actorId|hidden_genie_category|untrusted/);
  assert.equal(f.writes, 0);
});
test('resident lookup rejects coerced or nonexistent addresses', async () => {
  const f = fixture();
  for (const address of [
    { building: '', floor: 1, flat: 1 }, { building: 'house-0', floor: '1', flat: 1 },
    { building: 'house-0', floor: 1.5, flat: 1 }, { building: 'house-0', floor: 1, flat: '1' },
    { building: 'house-0', floor: 0, flat: 1 }, { building: 'house-0', floor: 1, flat: 1001 }
  ]) await rejects(handle(f.admin, req, body('resident-at-address', address)), 400);
  await rejects(handle(f.admin, req, body('resident-at-address', { building: 'house-99', floor: 1, flat: 1 })), 404);
  assert.equal(f.writes, 0);
});
test('commit and ticks persist public simulation plus private provenance; history paginates', async () => {
  const f = fixture();
  const secret = 'My private geothermal plan';
  const committed = await handle(f.admin, req, body('commit-plan', { expectedRevision: 0, text: secret }));
  assert.equal(committed.world.resources.budget, 110);
  assert.equal(committed.world.projects[0].intent.schemaVersion, 1);
  assert.deepEqual(f.row.settings.worldDNA, { preserved: true });
  assert.doesNotMatch(JSON.stringify(f.row.settings), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(f.row.settings), /actorId|"comment"/);
  assert.deepEqual(f.privateEvents[0], { actorId: OWNER_ID, action: 'commit-plan', revision: 1, comment: secret });
  const expected = engine.simulateTicks(committed.world, 3);
  const result = await handle(f.admin, req, body('tick', { expectedRevision: 1, count: 3 }));
  assert.deepEqual(result.world.resources, expected.resources);
  assert.equal(result.revision, 4); assert.equal(f.writes, 2);
  const history = await handle(f.admin, req, body('history', { offset: 1, limit: 1 }));
  assert.equal(history.history[0].actorId, undefined); assert.equal(history.nextOffset, 2);
  assert.deepEqual(f.privateEvents[1], { actorId: OWNER_ID, action: 'tick', revision: 4, comment: null });
  await rejects(handle(f.admin, req, body('commit-plan', { expectedRevision: 0 })), 409);
  assert.equal(f.writes, 2);
});
test('missing/invalid tokens never fall back to guest; user_metadata is not a grant', async () => {
  const f = fixture();
  for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
    await rejects(handle(f.admin, { headers }, body('tick', { guestId: 'forged', expectedRevision: 0 })), 401);
  }
  await rejects(handle(fixture({ denied: true }).admin, req, body('history')), 403);
  await rejects(handle(f.admin, req, body('history', { worldId: 'other' })), 403);
  assert.equal(f.writes, 0);
});

test('canonical private membership authorizes without a shared JWT grant', async () => {
  const f = fixture({ denied: true, member: 'owner' });
  const result = await handle(f.admin, req, body('history'));
  assert.equal(result.worldId, 'city');
  await rejects(handle(fixture({ denied: true }).admin, req, body('history')), 403);
});
test('owner invitation grants a player and revoke denies the same stale JWT immediately', async () => {
  const f = fixture();
  const invited = await handle(f.admin, req, body('invite-member', { targetUserId: PLAYER_ID }));
  assert.equal(invited.granted, true);
  assert.equal((await handle(f.admin, playerReq, body('history'))).worldId, 'city');
  await rejects(handle(f.admin, playerReq, body('invite-member', { targetUserId: STRANGER_ID })), 403);
  const revoked = await handle(f.admin, req, body('revoke-member', { targetUserId: PLAYER_ID }));
  assert.equal(revoked.revoked, true);
  // The test player's token deliberately still carries the old trusted claim.
  await rejects(handle(f.admin, playerReq, body('history')), 403);
});
test('membership management validates accounts and cannot alter an owner', async () => {
  const f = fixture({ missingTarget: true });
  await rejects(handle(f.admin, req, body('invite-member', { targetUserId: 'not-a-uuid' })), 400);
  await rejects(handle(f.admin, req, body('invite-member', { targetUserId: PLAYER_ID })), 400);
  await rejects(handle(f.admin, req, body('revoke-member', { targetUserId: OWNER_ID })), 409);
  assert.equal(f.memberships.get(`city:${OWNER_ID}`).role, 'owner');
  const raced = fixture({ inviteRaceOwner: true });
  await rejects(handle(raced.admin, req, body('invite-member', { targetUserId: PLAYER_ID })), 409);
  assert.equal(raced.memberships.get(`city:${PLAYER_ID}`).role, 'owner');
});
test('CAS conflict fails without replay; simultaneous commits have exactly one winner', async () => {
  await rejects(handle(fixture({ conflict: true }).admin, req, body('tick', { expectedRevision: 0 })), 409);
  const f = fixture();
  const results = await Promise.allSettled([1, 2].map(() => handle(f.admin, req, body('commit-plan', { expectedRevision: 0 }))));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'rejected').reason.status, 409);
  assert.equal(f.writes, 1); assert.equal(f.row.settings.chainReaction.projects.length, 1);
  assert.equal(f.row.settings.chainReaction.residents.length, 112);
});
test('bounded requests, own project names and strict numeric revisions', async () => {
  const f = fixture();
  for (const input of [null, [], body('unknown'), body('preview-plan', { structure: '__proto__' }),
    body('preview-plan', { structure: 'constructor' }), body('preview-plan', { text: 'x'.repeat(601) }),
    body('tick', { expectedRevision: '0' }), body('tick', { expectedRevision: 0, count: 25 }),
    body('history', { limit: 101 }), body('history', { offset: -1 })]) await rejects(handle(f.admin, req, input), 400);
  await rejects(handle(f.admin, req, body('history', { padding: 'x'.repeat(8192) })), 413);
  assert.equal(f.writes, 0);
});
test('missing worlds and database failures fail closed', async () => {
  await rejects(handle(fixture({ missing: true }).admin, req, body('history')), 404);
  await rejects(handle(fixture({ dbError: true }).admin, req, body('history')), 500);
});
test('infeasible commits leave persistent state untouched', async () => {
  const f = fixture();
  f.row.settings.chainReaction = engine.createWorld('test');
  f.row.settings.chainReaction.resources.budget = 0;
  await rejects(handle(f.admin, req, body('commit-plan', { expectedRevision: 0 })), 409);
  assert.equal(f.writes, 0);
});

// Atomic first load: one world revision for the saved world and certified cards.
test('atomic game-state is same-revision, privacy-safe and read-only',async()=>{
 const f=fixture(),w=engine.createWorld('entry');Object.assign(w.resources,{power:35,water:80,food:80,budget:500,workers:50});
 f.row.settings.chainReaction=engine.commit(w,engine.interpretIntent('PRIVATE CHILD TEXT','solar'));
 const first=await handle(f.admin,req,body('game-state')),again=await handle(f.admin,req,body('game-state'));
 assert.deepEqual(first,again);assert.equal(first.revision,first.world.revision);
 assert.deepEqual(first.cards,engine.genieOptions(f.row.settings.chainReaction).cards);
 assert.equal(first.fifth.kind,'free_intent');assert.equal(first.world.projects.length,1);
 assert.doesNotMatch(JSON.stringify(first),/PRIVATE CHILD TEXT|actorId/);assert.equal(f.writes,0);
});
test('game-state honestly degrades, checks membership and supports an optional read fence',async()=>{
 const f=fixture(),w=engine.createWorld('budget-zero');w.resources.budget=0;f.row.settings.chainReaction=w;
 const empty=await handle(f.admin,req,body('game-state',{expectedRevision:0}));
 assert.equal(empty.cards.length,0);assert.equal(empty.degraded,true);assert.equal(empty.fifth.acceptsFreeText,true);
 await rejects(handle(f.admin,playerReq,body('game-state')),403);
 for(const invalid of [-1,1.5,'0',null])await rejects(handle(f.admin,req,body('game-state',{expectedRevision:invalid})),400);
 w.revision=1;await rejects(handle(f.admin,req,body('game-state',{expectedRevision:0})),409);
 assert.equal((await handle(f.admin,req,body('game-state'))).revision,1);assert.equal(f.writes,0);
});
test('two simultaneous commits have one winner; reload and construction replay are durable',async()=>{
 const f=fixture(),first=await handle(f.admin,req,body('game-state'));
 const outcomes=await Promise.allSettled([1,2].map(()=>handle(f.admin,req,body('commit-plan',{structure:'solar',expectedRevision:first.revision}))));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(outcomes.find(x=>x.status==='rejected').reason.status,409);
 await rejects(handle(f.admin,req,body('game-state',{expectedRevision:0})),409);
 const restored=await handle(f.admin,req,body('game-state'));
 assert.equal(restored.revision,1);assert.equal(restored.world.projects.length,1);
 const ticked=await handle(f.admin,req,body('tick',{expectedRevision:1,count:2}));
 assert.equal(ticked.world.projects[0].active,true);
 assert.equal((await handle(f.admin,req,body('game-state'))).world.projects[0].active,true);
 assert.equal(f.writes,2);
});
test('legacy and new private comments never leak via history, preview, commit or tick',async()=>{
 const f=fixture();let w=engine.createWorld('legacy-privacy');w=engine.commit(w,engine.interpretIntent('LEGACY SECRET','solar'));
 w.history.push({kind:'api_action',actorId:OWNER_ID,comment:'LEGACY PRIVATE EVENT'});f.row.settings.chainReaction=w;
 const h=await handle(f.admin,req,body('history'));
 const p=await handle(f.admin,req,body('preview-plan'));
 const c=await handle(f.admin,req,body('commit-plan',{expectedRevision:1,text:'NEW SECRET'}));
 const t=await handle(f.admin,req,body('tick',{expectedRevision:2}));
 for(const response of [h,p,c,t])assert.doesNotMatch(JSON.stringify(response),/LEGACY SECRET|LEGACY PRIVATE EVENT|NEW SECRET|actorId/);
 assert.equal(f.privateEvents[0].comment,'NEW SECRET');assert.equal(f.writes,2);
});

// Adversarial integration regression: a tainted stored resident must never escape
// via the atomic loader or any of the other public world projections.
test('atomic and legacy world projections allowlist resident fields', async () => {
  const f = fixture(), w = engine.createWorld('resident-privacy');
  const resident = w.residents.find(r => r.building === 'house-0' && r.floor === 1 && r.flat === 1);
  Object.assign(resident, { comment: 'RESIDENT PRIVATE COMMENT', actorId: STRANGER_ID,
    category: 'hidden_genie_category', role: 'untrusted',
    id: { actorId: STRANGER_ID }, name: { comment: 'NESTED RESIDENT SECRET' } });
  f.row.settings.chainReaction = w;
  const first = await handle(f.admin, req, body('game-state'));
  const preview = await handle(f.admin, req, body('preview-plan'));
  const committed = await handle(f.admin, req, body('commit-plan', { expectedRevision: 0 }));
  const ticked = await handle(f.admin, req, body('tick', { expectedRevision: 1 }));
  for (const result of [first, preview, committed, ticked]) {
    const projected = result.world.residents.find(r => r.building === 'house-0' && r.floor === 1 && r.flat === 1);
    assert.deepEqual(Object.keys(projected).sort(), ['building', 'fictional', 'flat', 'floor', 'id', 'name']);
    assert.doesNotMatch(JSON.stringify(result), /RESIDENT PRIVATE COMMENT|NESTED RESIDENT SECRET|actorId|hidden_genie_category|untrusted/);
    assert.equal(projected.fictional, true);
  }
  assert.equal(first.revision, first.world.revision);
  assert.equal(f.writes, 2);
});

test('server-certified card identity locks its structure while commentary changes build risk and delay',async()=>{
 const f=fixture(),w=engine.createWorld('choice-solar');Object.assign(w.resources,{power:35,water:80,food:80,budget:500,workers:50});f.row.settings.chainReaction=w;
 const state=await handle(f.admin,req,body('game-state'));const solar=state.cards.find(card=>card.structure==='solar');assert.ok(solar);
 const text='Нужна электроэнергия, поэтапно исследуем стройку';
 const plan=await handle(f.admin,req,body('preview-plan',{structure:'solar',choiceId:solar.id,text}));
 assert.equal(plan.plan.intent.goal,'solar');assert.equal(plan.plan.buildTicks,3);assert.equal(plan.plan.cost,52);assert.equal(plan.plan.risk,0);
 const legacy=await handle(f.admin,req,body('preview-plan',{structure:'solar',text}));assert.equal(legacy.plan.intent.goal,'geothermal');
 const made=await handle(f.admin,req,body('commit-plan',{expectedRevision:0,structure:'solar',choiceId:solar.id,text}));
 assert.equal(made.world.projects[0].type,'solar');assert.equal(made.world.projects[0].remaining,3);
 assert.equal(f.privateEvents[0].comment,text);assert.equal(made.world.projects[0].intent.comment,undefined);
 await rejects(handle(f.admin,req,body('preview-plan',{choiceId:solar.id,structure:'solar'})),409);
});
test('forged or mismatched cards fail; fifth free design still interprets user text',async()=>{
 const f=fixture(),w=engine.createWorld('forged');Object.assign(w.resources,{power:35,water:80,food:80,budget:500,workers:50});f.row.settings.chainReaction=w;
 const offer=(await handle(f.admin,req,body('genie-options'))).cards[0];assert.ok(offer);
 await rejects(handle(f.admin,req,body('preview-plan',{structure:offer.structure,choiceId:'forged'})),409);
 await rejects(handle(f.admin,req,body('preview-plan',{structure:'workshop',choiceId:offer.id})),409);
 for(const id of [null,2,'x'.repeat(129)])await rejects(handle(f.admin,req,body('preview-plan',{choiceId:id})),400);
  const free=await handle(f.admin,req,body('interpret-intent',{choiceId:'free-design',structure:'workshop',text:'солнечная электростанция'}));
  assert.equal(free.intent.goal,'solar');assert.equal(f.writes,0);
});
