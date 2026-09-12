'use strict';

const fs = require('fs');
const path = require('path');
const { createAdminClient } = require('../env');
const { optionalIdentity } = require('../auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../http');
const { createWorldDNA, settingsFromDNA, publicWorld } = require('../world-factory');

const lorePath = path.join(path.resolve(__dirname, '..', '..'), 'data', 'world-lore-v2.json');
function loreBible() { return JSON.parse(fs.readFileSync(lorePath, 'utf8').replace(/^\uFEFF/, '')); }
function dbError(error, message = 'Не удалось сохранить мир.') { if (error) throw httpError(500, message); }

async function readWorld(admin, id) {
  const { data, error } = await admin.from('voxel_worlds').select('id,seed,settings,created_at,updated_at').eq('id', id).maybeSingle();
  dbError(error, 'Не удалось прочитать мир.');
  return publicWorld(data);
}

async function createWorld(admin, body) {
  const dna = createWorldDNA({ idea: body.idea, requestId: body.requestId, loreBible: loreBible() });
  const existing = await readWorld(admin, dna.id);
  if (existing) return { world: existing, created: false, idempotent: true };
  const payload = { id: dna.id, seed: dna.seed, settings: settingsFromDNA(dna) };
  const { data, error } = await admin.from('voxel_worlds').insert(payload).select('id,seed,settings,created_at,updated_at').single();
  if (error?.code === '23505') {
    const raced = await readWorld(admin, dna.id);
    if (raced) return { world: raced, created: false, idempotent: true };
  }
  dbError(error);
  const world = publicWorld(data);
  if (!world) throw httpError(500, 'Созданный мир не прошёл проверку World DNA.');
  return { world, created: true, idempotent: false };
}

async function listWorlds(admin, limit = 24) {
  const bounded = Math.max(1, Math.min(50, Number(limit) || 24));
  const { data, error } = await admin.from('voxel_worlds').select('id,seed,settings,created_at,updated_at').order('created_at', { ascending: false }).limit(Math.max(bounded * 2, 50));
  dbError(error, 'Не удалось загрузить созданные миры.');
  return (data || []).map(publicWorld).filter(Boolean).slice(0, bounded);
}

module.exports = withErrors(async (req, res) => {
  const admin = createAdminClient();
  if (req.method === 'GET') {
    const requestUrl = new URL(req.url || '/api/world-factory', 'http://localhost');
    const id = String(requestUrl.searchParams.get('id') || '').trim();
    if (id) {
      const world = await readWorld(admin, id);
      if (!world) throw httpError(404, 'Мир не найден.');
      return sendJson(res, 200, { world });
    }
    return sendJson(res, 200, { worlds: await listWorlds(admin, requestUrl.searchParams.get('limit')) });
  }
  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  const body = await readJsonBody(req);
  await optionalIdentity(admin, req, body);
  const action = String(body.action || 'create');
  if (action !== 'create') throw httpError(400, 'Неизвестное действие World Factory.');
  const result = await createWorld(admin, body);
  sendJson(res, result.created ? 201 : 200, result);
});

module.exports._private = { loreBible, readWorld, createWorld, listWorlds };
