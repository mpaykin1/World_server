'use strict';

const fs = require('fs');
const path = require('path');
const { createAdminClient } = require('../env');
const { optionalIdentity } = require('../auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../http');
const { planCanonMutation, persistCanonMutation, recentCanon } = require('../world-canon');

const lorePath = path.join(path.resolve(__dirname, '..', '..'), 'data', 'world-lore-v2.json');
function loreBible() { return JSON.parse(fs.readFileSync(lorePath, 'utf8').replace(/^\uFEFF/, '')); }

async function worldSettings(admin, worldId) {
  const { data, error } = await admin.from('voxel_worlds').select('settings').eq('id', worldId).maybeSingle();
  if (error) throw httpError(500, 'Не удалось прочитать настройки мира.');
  return data?.settings || null;
}

async function record(admin, body) {
  const worldId = String(body.worldId || '').trim();
  const settings = await worldSettings(admin, worldId);
  const plan = planCanonMutation({
    worldId,
    eventType: body.eventType,
    summary: body.summary,
    payload: body.payload,
    idempotencyKey: body.idempotencyKey,
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
    return sendJson(res, 200, { events: await recentCanon(admin, { worldId, limit: url.searchParams.get('limit') }) });
  }
  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  const body = await readJsonBody(req);
  await optionalIdentity(admin, req, body);
  const action = String(body.action || 'record');
  if (action !== 'record') throw httpError(400, 'Неизвестное действие канона.');
  const result = await record(admin, body);
  sendJson(res, 200, result);
});

module.exports._private = { loreBible, worldSettings, record };
