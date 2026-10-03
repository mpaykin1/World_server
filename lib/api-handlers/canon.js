'use strict';

const fs = require('fs');
const path = require('path');
const { createAdminClient } = require('../env');
const { requireUser } = require('../auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../http');
const { actorRefFor, canonEventEntry, cleanParentEventKey, cleanWorldId, planCanonMutation, persistCanonMutation, recentCanon } = require('../world-canon');

const lorePath = path.join(path.resolve(__dirname, '..', '..'), 'data', 'world-lore-v2.json');
function loreBible() { return JSON.parse(fs.readFileSync(lorePath, 'utf8').replace(/^\uFEFF/, '')); }

async function worldSettings(admin, worldId) {
  const { data, error } = await admin.from('voxel_worlds').select('settings').eq('id', worldId).maybeSingle();
  if (error) throw httpError(500, 'Не удалось прочитать настройки мира.');
  return data?.settings || null;
}

async function requireWorldParticipant(admin, worldId, userId) {
  const { data, error } = await admin.from('voxel_player_states').select('id')
    .eq('world_id', worldId).eq('user_id', userId).maybeSingle();
  if (error) throw httpError(500, 'Не удалось проверить участие в мире.');
  if (!data) throw httpError(403, 'Сначала войдите в этот мир.');
}

async function validateParent(admin, worldId, value) {
  const parentEventKey = cleanParentEventKey(value);
  if (!parentEventKey) return null;
  const { data, error } = await admin.from('world_canon_events').select('event_key,world_id')
    .eq('event_key', parentEventKey).maybeSingle();
  if (error) throw httpError(500, 'Не удалось проверить причинную связь.');
  if (!data || data.world_id !== worldId) throw httpError(409, 'PARENT_EVENT_NOT_IN_WORLD');
  return parentEventKey;
}

async function record(admin, body, authUser) {
  const worldId = cleanWorldId(body.worldId);
  await requireWorldParticipant(admin, worldId, authUser.id);
  const parentEventKey = await validateParent(admin, worldId, body.parentEventKey);
  const settings = await worldSettings(admin, worldId);
  const plan = planCanonMutation({
    worldId,
    eventType: body.eventType,
    summary: body.summary,
    payload: body.payload,
    idempotencyKey: body.idempotencyKey,
    actorRef: actorRefFor(authUser.id),
    parentEventKey,
    // This public route is browser-origin. Other platforms need a trusted
    // server adapter instead of accepting caller-asserted provenance.
    sourcePlatform: 'browser',
    worldSettings: settings,
    loreBible: loreBible()
  });
  return persistCanonMutation(admin, plan);
}

module.exports = withErrors(async (req, res) => {
  const admin = createAdminClient();
  if (req.method === 'GET') {
    const url = new URL(req.url || '/api/canon', 'http://localhost');
    const worldId = String(url.searchParams.get('worldId') || '').trim();
    if (!worldId) throw httpError(400, 'Нужен worldId.');
    const eventKey = String(url.searchParams.get('eventKey') || '').trim();
    if (eventKey) return sendJson(res, 200, { entry: await canonEventEntry(admin, { worldId, eventKey }) });
    return sendJson(res, 200, { events: await recentCanon(admin, { worldId, limit: url.searchParams.get('limit') }) });
  }
  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  const body = await readJsonBody(req);
  const { authUser } = await requireUser(admin, req);
  const action = String(body.action || 'record');
  if (action !== 'record') throw httpError(400, 'Неизвестное действие канона.');
  const result = await record(admin, body, authUser);
  sendJson(res, 200, result);
});

module.exports._private = { loreBible, worldSettings, requireWorldParticipant, validateParent, record };
