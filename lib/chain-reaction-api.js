'use strict';

const engine = require('./world-consequence-engine');
const { requireUser } = require('./auth');
const { httpError } = require('./http');

const ACTIONS = new Set(['game-state', 'interpret-intent', 'preview-plan', 'commit-plan', 'tick', 'history', 'genie-options', 'resident-at-address', 'invite-member', 'revoke-member']);
const MAX_STATE_BYTES = 1024 * 1024;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Invalid body');
  if (Buffer.byteLength(JSON.stringify(body)) > 8192) throw httpError(413, 'Request too large');
  if (!ACTIONS.has(body.action)) throw httpError(400, 'Unknown Chain Reaction action');
  if (typeof body.worldId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.worldId)) throw httpError(400, 'Invalid worldId');
}
function intentFrom(body) {
  if (typeof body.structure !== 'string' || !Object.hasOwn(engine.PROJECTS, body.structure)) throw httpError(400, 'Invalid structure');
  if (body.text !== undefined && (typeof body.text !== 'string' || body.text.length > 600)) throw httpError(400, 'Invalid text');
  // Never trust client-supplied costs, resources, timeline, or compiled intent.
  return { ...engine.interpretIntent(body.text || '', body.structure), schemaVersion: 1 };
}
function dbCheck(error) {
  if (error) throw httpError(500, 'Chain Reaction persistence failed');
}
function publicState(value) {
  const safe = JSON.parse(JSON.stringify(value));
  for (const project of safe.projects || []) {
    if (project.intent) delete project.intent.comment;
  }
  for (const event of safe.history || []) {
    delete event.comment;
    delete event.actorId;
  }
  // Stored residents may carry untrusted legacy extras. Return canonical public fields only.
  if (Array.isArray(safe.residents)) {
    safe.residents = safe.residents.map(resident => ({
      id: resident.id, name: resident.name, fictional: resident.fictional === true,
      building: resident.building, floor: resident.floor, flat: resident.flat
    }));
  }
  return safe;
}
async function hasMembership(admin, userId, worldId) {
  const { data, error } = await admin.from('chain_reaction_world_members')
    .select('role').eq('world_id', worldId).eq('user_id', userId).maybeSingle();
  dbCheck(error);
  return data?.role === 'owner' || data?.role === 'player';
}
async function membershipRole(admin, userId, worldId) {
  const { data, error } = await admin.from('chain_reaction_world_members')
    .select('role').eq('world_id', worldId).eq('user_id', userId).maybeSingle();
  dbCheck(error);
  return data?.role || null;
}
function targetUserId(body) {
  if (typeof body.targetUserId !== 'string' || !USER_ID.test(body.targetUserId)) throw httpError(400, 'Invalid targetUserId');
  return body.targetUserId;
}
function residentAddress(body) {
  if (typeof body.building !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.building)) throw httpError(400, 'Invalid building');
  if (!Number.isInteger(body.floor) || body.floor < 1 || body.floor > 100) throw httpError(400, 'Invalid floor');
  if (!Number.isInteger(body.flat) || body.flat < 1 || body.flat > 1000) throw httpError(400, 'Invalid flat');
  return { building: body.building, floor: body.floor, flat: body.flat };
}
function publicResident(resident) {
  return {
    id: resident.id,
    name: resident.name,
    fictional: resident.fictional === true,
    building: resident.building,
    floor: resident.floor,
    flat: resident.flat
  };
}
async function manageMembership(admin, actor, role, row, body) {
  if (role !== 'owner') throw httpError(403, 'Only the world owner can manage members');
  const target = targetUserId(body);
  if (target === actor.id) throw httpError(409, 'Owner membership cannot be changed');
  const currentRole = await membershipRole(admin, target, row.id);
  if (currentRole === 'owner') throw httpError(409, 'Owner membership cannot be changed');
  if (body.action === 'invite-member') {
    if (currentRole === 'player') return { worldId: row.id, member: { userId: target, role: 'player' }, granted: true };
    const result = await admin.from('chain_reaction_world_members')
      .insert({ world_id: row.id, user_id: target, role: 'player' })
      .select('role').maybeSingle();
    if (result.error?.code === '23503') throw httpError(400, 'Invited account does not exist');
    if (result.error?.code === '23505') {
      const racedRole = await membershipRole(admin, target, row.id);
      if (racedRole === 'player') return { worldId: row.id, member: { userId: target, role: 'player' }, granted: true };
      throw httpError(409, 'Owner membership cannot be changed');
    }
    dbCheck(result.error);
    return { worldId: row.id, member: { userId: target, role: 'player' }, granted: true };
  }
  const result = await admin.from('chain_reaction_world_members').delete()
    .eq('world_id', row.id).eq('user_id', target).eq('role', 'player').select('role').maybeSingle();
  dbCheck(result.error);
  return { worldId: row.id, member: { userId: target, role: 'player' }, revoked: true };
}
async function handle(admin, req, body) {
  validateBody(body);
  const { authUser } = await requireUser(admin, req);
  const { data: row, error } = await admin.from('voxel_worlds')
    .select('id,seed,settings,updated_at').eq('id', body.worldId).maybeSingle();
  dbCheck(error);
  if (!row) throw httpError(404, 'World not found');
  const settings = row.settings || {};
  // Membership is checked on every request. Legacy app_metadata grants are
  // migrated once into this private table and are deliberately ignored here,
  // so revocation also denies requests carrying an older still-valid JWT.
  const role = await membershipRole(admin, authUser.id, body.worldId);
  if (role !== 'owner' && role !== 'player') throw httpError(403, 'World access denied');
  if (body.action === 'invite-member' || body.action === 'revoke-member') {
    return manageMembership(admin, authUser, role, row, body);
  }
  const stored = settings.chainReaction;
  if (stored && (stored.schema !== 1 || !Number.isSafeInteger(stored.revision))) throw httpError(409, 'Unsupported scenario version');
  const world = stored || engine.createWorld(String(row.seed));
  const base = { worldId: row.id, scenarioVersion: 1, revision: world.revision };
  if (body.action === 'history') {
    const offset = body.offset === undefined ? 0 : body.offset;
    const limit = body.limit === undefined ? 50 : body.limit;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw httpError(400, 'Invalid history page');
    const history = publicState({ history: world.history.slice(offset, offset + limit) }).history;
    return { ...base, history, nextOffset: offset + history.length, total: world.history.length };
  }
  if (body.action === 'resident-at-address') {
    const requested = residentAddress(body);
    const resident = engine.address(world, requested.building, requested.floor, requested.flat);
    if (!resident) throw httpError(404, 'Resident address not found');
    return { ...base, resident: publicResident(resident) };
  }
  if (body.action === 'game-state') {
    // Optional read fence: omit it to recover the latest revision after a CAS conflict.
    if (body.expectedRevision !== undefined) {
      if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw httpError(400, 'Invalid expectedRevision');
      if (world.revision !== body.expectedRevision) throw httpError(409, 'STALE_REVISION');
    }
    return { ...base, world: publicState(world), ...engine.genieOptions(world) };
  }
  if (body.action === 'genie-options') return { ...base, ...engine.genieOptions(world) };
  const intent = body.action === 'tick' ? null : intentFrom(body);
  if (body.action === 'interpret-intent') return { ...base, intent };
  if (body.action === 'preview-plan') return { ...base, plan: engine.preview(world, intent), world: publicState(world) };
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw httpError(400, 'expectedRevision required');
  if (world.revision !== body.expectedRevision) throw httpError(409, 'STALE_REVISION');
  let next;
  if (body.action === 'commit-plan') {
    if (world.projects.length >= 256) throw httpError(409, 'Project capacity reached');
    if (!engine.preview(world, intent).feasible) throw httpError(409, 'INSUFFICIENT_RESOURCES');
    next = engine.commit(world, intent, body.expectedRevision);
  } else {
    const count = body.count === undefined ? 1 : body.count;
    if (!Number.isInteger(count) || count < 1 || count > 24) throw httpError(400, 'Invalid tick count');
    next = engine.simulateTicks(world, count);
  }
  // Keep provenance atomically with the simulation, without dropping negative events.
  next.history.push({ kind: 'api_action', action: body.action, actorId: authUser.id,
    fromRevision: world.revision, revision: next.revision, tick: next.tick, scenarioVersion: 1 });
  if (Buffer.byteLength(JSON.stringify(next)) > MAX_STATE_BYTES) throw httpError(409, 'Scenario storage capacity reached');
  if (!row.updated_at || !Number.isFinite(Date.parse(row.updated_at))) throw httpError(409, 'Missing concurrency token');
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
  const result = await admin.rpc('commit_chain_reaction_action', {
    p_world_id: row.id,
    p_expected_updated_at: row.updated_at,
    p_next_updated_at: updatedAt,
    p_public_settings: { ...settings, chainReaction: publicState(next) },
    p_actor_id: authUser.id,
    p_action: body.action,
    p_revision: next.revision,
    p_comment: body.action === 'commit-plan' ? body.text || '' : null
  });
  dbCheck(result.error);
  if (result.data !== true) throw httpError(409, 'STALE_REVISION');
  return { ...base, revision: next.revision, world: publicState(next) };
}

module.exports = { ACTIONS, handle, validateBody, hasMembership, membershipRole, manageMembership, publicState, residentAddress, publicResident };
