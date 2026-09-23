'use strict';

const engine = require('./world-consequence-engine');
const { requireUser } = require('./auth');
const { httpError } = require('./http');

const ACTIONS = new Set(['interpret-intent', 'preview-plan', 'commit-plan', 'tick', 'history']);
const MAX_STATE_BYTES = 1024 * 1024;
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
async function handle(admin, req, body) {
  validateBody(body);
  const { authUser } = await requireUser(admin, req);
  // Provisioned by a trusted backend/admin, NEVER user_metadata or request identity.
  const grants = authUser.app_metadata?.chain_reaction_worlds;
  if (!Array.isArray(grants) || !grants.includes(body.worldId)) throw httpError(403, 'World access denied');
  const { data: row, error } = await admin.from('voxel_worlds')
    .select('id,seed,settings,updated_at').eq('id', body.worldId).maybeSingle();
  dbCheck(error);
  if (!row) throw httpError(404, 'World not found');
  const settings = row.settings || {};
  const stored = settings.chainReaction;
  if (stored && (stored.schema !== 1 || !Number.isSafeInteger(stored.revision))) throw httpError(409, 'Unsupported scenario version');
  const world = stored || engine.createWorld(String(row.seed));
  const base = { worldId: row.id, scenarioVersion: 1, revision: world.revision };
  if (body.action === 'history') {
    const offset = body.offset === undefined ? 0 : body.offset;
    const limit = body.limit === undefined ? 50 : body.limit;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw httpError(400, 'Invalid history page');
    const history = world.history.slice(offset, offset + limit);
    return { ...base, history, nextOffset: offset + history.length, total: world.history.length };
  }
  const intent = body.action === 'tick' ? null : intentFrom(body);
  if (body.action === 'interpret-intent') return { ...base, intent };
  if (body.action === 'preview-plan') return { ...base, plan: engine.preview(world, intent), world };
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
  const result = await admin.from('voxel_worlds')
    .update({ settings: { ...settings, chainReaction: next }, updated_at: updatedAt })
    .eq('id', row.id).eq('updated_at', row.updated_at).select('id').maybeSingle();
  dbCheck(result.error);
  if (!result.data) throw httpError(409, 'STALE_REVISION');
  return { ...base, revision: next.revision, world: next };
}

module.exports = { ACTIONS, handle, validateBody };
