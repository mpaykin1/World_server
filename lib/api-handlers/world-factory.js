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

async function readWorldRow(admin, id) {
  const { data, error } = await admin.from('voxel_worlds').select('id,seed,settings,created_at,updated_at').eq('id', id).maybeSingle();
  dbError(error, 'Не удалось прочитать мир.');
  return data || null;
}
async function readWorld(admin, id) { return publicWorld(await readWorldRow(admin, id)); }

async function readCreatorMembership(admin, userId, worldId) {
  if (!userId) return false;
  const { data, error } = await admin.from('chain_reaction_world_members')
    .select('role').eq('world_id', worldId).eq('user_id', userId).maybeSingle();
  dbError(error, 'Не удалось проверить права создателя мира.');
  return data?.role === 'owner';
}

async function grantCreatorMembership(admin, userId, worldId) {
  if (!userId) return { available: false, granted: false, authRefreshRequired: false };
  const { error } = await admin.from('chain_reaction_world_members').upsert({
    world_id: worldId, user_id: userId, role: 'owner'
  }, { onConflict: 'world_id,user_id' });
  dbError(error, 'Не удалось выдать права создателю мира.');
  return { available: true, granted: true, authRefreshRequired: false, mechanism: 'membership' };
}

async function createWorld(admin, body, identity = {}) {
  const dna = createWorldDNA({ idea: body.idea, requestId: body.requestId, loreBible: loreBible() });
  const existingRow = await readWorldRow(admin, dna.id);
  if (existingRow) {
    const ownsWorld = await readCreatorMembership(admin, identity.userId, dna.id);
    const access = ownsWorld ? { available: true, granted: true, authRefreshRequired: false, mechanism: 'membership' }
      : { available: false, granted: false, authRefreshRequired: false };
    return { world: publicWorld(existingRow), created: false, idempotent: true, chainReaction: access };
  }
  // Fail before inserting the world if the private membership schema is not
  // available yet; this avoids an ownerless persisted world during rollout.
  if (identity.userId) await readCreatorMembership(admin, identity.userId, dna.id);
  const settings = settingsFromDNA(dna);
  const payload = { id: dna.id, seed: dna.seed, settings };
  const { data, error } = await admin.from('voxel_worlds').insert(payload).select('id,seed,settings,created_at,updated_at').single();
  if (error?.code === '23505') {
    const raced = await readWorldRow(admin, dna.id);
    if (raced) {
      const ownsWorld = await readCreatorMembership(admin, identity.userId, dna.id);
      const access = ownsWorld ? { available: true, granted: true, authRefreshRequired: false, mechanism: 'membership' }
        : { available: false, granted: false, authRefreshRequired: false };
      return { world: publicWorld(raced), created: false, idempotent: true, chainReaction: access };
    }
  }
  dbError(error);
  const world = publicWorld(data);
  if (!world) throw httpError(500, 'Созданный мир не прошёл проверку World DNA.');
  const access = await grantCreatorMembership(admin, identity.userId, dna.id);
  return { world, created: true, idempotent: false, chainReaction: access };
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
  const identity = await optionalIdentity(admin, req, body);
  const action = String(body.action || 'create');
  if (action !== 'create') throw httpError(400, 'Неизвестное действие World Factory.');
  const result = await createWorld(admin, body, identity);
  sendJson(res, result.created ? 201 : 200, result);
});

module.exports._private = { loreBible, readWorld, readWorldRow, createWorld, listWorlds, readCreatorMembership, grantCreatorMembership };
