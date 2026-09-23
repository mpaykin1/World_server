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
const MAX_CHAIN_REACTION_GRANTS = 64;

async function readWorldRow(admin, id) {
  const { data, error } = await admin.from('voxel_worlds').select('id,seed,settings,created_at,updated_at').eq('id', id).maybeSingle();
  dbError(error, 'Не удалось прочитать мир.');
  return data || null;
}
async function readWorld(admin, id) { return publicWorld(await readWorldRow(admin, id)); }

async function grantChainReactionWorld(admin, userId, worldId) {
  if (!userId) return { available: false, granted: false, authRefreshRequired: false };
  const lookup = await admin.auth.admin.getUserById(userId);
  dbError(lookup.error, 'Не удалось проверить права создателя мира.');
  if (!lookup.data?.user) throw httpError(401, 'Создатель мира не найден.');
  const metadata = lookup.data.user.app_metadata && typeof lookup.data.user.app_metadata === 'object'
    ? lookup.data.user.app_metadata : {};
  const grants = [...new Set((Array.isArray(metadata.chain_reaction_worlds) ? metadata.chain_reaction_worlds : [])
    .filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id)))];
  if (grants.includes(worldId)) return { available: true, granted: false, authRefreshRequired: false };
  if (grants.length >= MAX_CHAIN_REACTION_GRANTS) throw httpError(409, 'Достигнут лимит миров «Цепной реакции».');
  const update = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...metadata, chain_reaction_worlds: [...grants, worldId] }
  });
  dbError(update.error, 'Не удалось выдать права на мир.');
  return { available: true, granted: true, authRefreshRequired: true };
}

async function createWorld(admin, body, identity = {}) {
  const dna = createWorldDNA({ idea: body.idea, requestId: body.requestId, loreBible: loreBible() });
  const existingRow = await readWorldRow(admin, dna.id);
  if (existingRow) {
    const ownsWorld = identity.userId && existingRow.settings?.chainReactionAccess?.ownerUserId === identity.userId;
    const access = ownsWorld ? await grantChainReactionWorld(admin, identity.userId, dna.id)
      : { available: false, granted: false, authRefreshRequired: false };
    return { world: publicWorld(existingRow), created: false, idempotent: true, chainReaction: access };
  }
  const settings = settingsFromDNA(dna);
  if (identity.userId) settings.chainReactionAccess = { ownerUserId: identity.userId, schema: 1 };
  const payload = { id: dna.id, seed: dna.seed, settings };
  const { data, error } = await admin.from('voxel_worlds').insert(payload).select('id,seed,settings,created_at,updated_at').single();
  if (error?.code === '23505') {
    const raced = await readWorldRow(admin, dna.id);
    if (raced) {
      const ownsWorld = identity.userId && raced.settings?.chainReactionAccess?.ownerUserId === identity.userId;
      const access = ownsWorld ? await grantChainReactionWorld(admin, identity.userId, dna.id)
        : { available: false, granted: false, authRefreshRequired: false };
      return { world: publicWorld(raced), created: false, idempotent: true, chainReaction: access };
    }
  }
  dbError(error);
  const world = publicWorld(data);
  if (!world) throw httpError(500, 'Созданный мир не прошёл проверку World DNA.');
  const access = await grantChainReactionWorld(admin, identity.userId, dna.id);
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

module.exports._private = { loreBible, readWorld, readWorldRow, createWorld, listWorlds, grantChainReactionWorld, MAX_CHAIN_REACTION_GRANTS };
