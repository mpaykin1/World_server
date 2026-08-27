'use strict';

const crypto = require('crypto');
const { createAdminClient } = require('../env');
const { optionalIdentity } = require('../auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../http');
const { mergeWorldSpecs } = require('../world-spec');

// Real, Supabase-backed world merging: A+B -> AB, then AB+C -> ABC. Composing
// AB with C works the same way as composing A with B, since AB is itself
// just a world row with its own spec (and that spec already carries full
// provenance from the first merge) -- no special "already merged" case
// needed, folding left-to-right over sourceWorldIds is enough.
//
// Merging is a public composition action, not an ownership-gated one (it's
// "Соединить с другими историями" on any world's own result screen) -- any
// two PUBLISHED worlds can be merged by anyone, matching how the questionnaire
// app's UI already exposes it. Idempotent: merging the same set of source
// worlds twice returns the existing result instead of creating a duplicate.

function newWorldId() {
  return `w-${crypto.randomBytes(6).toString('hex')}`;
}

function sortedKey(ids) {
  return [...ids].sort().join(',');
}

function ownerColumns(identity) {
  return identity.kind === 'user'
    ? { owner_user_id: identity.userId, owner_guest_id: null }
    : { owner_user_id: null, owner_guest_id: identity.guestId };
}

async function findExistingMerge(admin, sourceWorldIds) {
  const key = sortedKey(sourceWorldIds);
  const { data, error } = await admin
    .from('merges')
    .select('id, result_world_id, status, source_world_ids')
    .eq('status', 'completed');
  if (error) throw error;
  return (data || []).find((row) => sortedKey(row.source_world_ids) === key) || null;
}

async function fetchPublishedWorlds(admin, ids) {
  const { data, error } = await admin
    .from('worlds')
    .select('id, spec, source_story_ids, status')
    .in('id', ids);
  if (error) throw error;
  const byId = new Map((data || []).map((w) => [w.id, w]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw httpError(404, `Мир(ы) не найдены: ${missing.join(', ')}`);
  const notPublished = ids.filter((id) => byId.get(id).status !== 'published');
  if (notPublished.length) throw httpError(400, `Можно соединять только опубликованные миры: ${notPublished.join(', ')}`);
  return ids.map((id) => byId.get(id));
}

async function handleCreate(admin, identity, body) {
  const sourceWorldIds = Array.isArray(body.sourceWorldIds) ? [...new Set(body.sourceWorldIds)] : [];
  if (sourceWorldIds.length < 2) throw httpError(400, 'Нужно минимум два мира для объединения.');

  const existing = await findExistingMerge(admin, sourceWorldIds);
  if (existing) {
    const { data: world, error } = await admin.from('worlds').select('id, spec, status, public_slug').eq('id', existing.result_world_id).single();
    if (error) throw error;
    return { mergeId: existing.id, resultWorldId: existing.result_world_id, spec: world.spec, reused: true };
  }

  const worlds = await fetchPublishedWorlds(admin, sourceWorldIds);
  let mergedSpec = worlds[0].spec;
  let mergedStoryIds = [...(worlds[0].source_story_ids || [])];
  for (let i = 1; i < worlds.length; i++) {
    mergedSpec = mergeWorldSpecs(mergedSpec, worlds[i].spec, { aWorldId: worlds[i - 1].id, bWorldId: worlds[i].id });
    mergedStoryIds = [...mergedStoryIds, ...(worlds[i].source_story_ids || [])];
  }

  const resultWorldId = newWorldId();
  const worldRow = Object.assign(
    { id: resultWorldId, source_story_ids: mergedStoryIds, spec: mergedSpec, status: 'published', public_slug: resultWorldId },
    ownerColumns(identity)
  );
  const { error: worldInsertError } = await admin.from('worlds').insert(worldRow);
  if (worldInsertError) throw worldInsertError;

  const { data: mergeRow, error: mergeInsertError } = await admin
    .from('merges')
    .insert({
      source_world_ids: sourceWorldIds,
      result_world_id: resultWorldId,
      status: 'completed',
      provenance: mergedSpec.provenance
    })
    .select('id')
    .single();
  if (mergeInsertError) throw mergeInsertError;

  return { mergeId: mergeRow.id, resultWorldId, spec: mergedSpec, reused: false };
}

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  const admin = createAdminClient();
  const identity = await optionalIdentity(admin, req, body);

  if (body.action === 'create') return sendJson(res, 200, await handleCreate(admin, identity, body));
  throw httpError(400, `Неизвестное действие: ${body.action}`);
});

module.exports._private = { newWorldId, sortedKey, handleCreate, findExistingMerge, fetchPublishedWorlds };
