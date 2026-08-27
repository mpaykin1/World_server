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

// source_world_ids is always stored pre-sorted (see the unique index in
// supabase/migrations/20260827120000_merge_idempotency_constraint.sql), so
// an exact array-equality filter is both correct and index-backed -- no
// need to fetch every completed merge and compare client-side.
async function findExistingMerge(admin, sortedSourceWorldIds) {
  const { data, error } = await admin
    .from('merges')
    .select('id, result_world_id, status, source_world_ids')
    .eq('source_world_ids', sortedSourceWorldIds)
    .maybeSingle();
  if (error) throw error;
  return data;
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
  const rawSourceWorldIds = Array.isArray(body.sourceWorldIds) ? [...new Set(body.sourceWorldIds)] : [];
  if (rawSourceWorldIds.length < 2) throw httpError(400, 'Нужно минимум два мира для объединения.');
  const sourceWorldIds = [...rawSourceWorldIds].sort();

  // Fast path: avoids the work below entirely for the common (non-racing)
  // repeat-merge case. This alone is NOT what makes the operation safe
  // under concurrency -- see the ON CONFLICT upsert further down for that.
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

  // Atomic dedup: two concurrent requests for the same source-world pair can
  // both pass the findExistingMerge check above before either writes here --
  // the database's unique index on source_world_ids is what actually
  // prevents two canonical merge rows from ever existing for one pair.
  // ignoreDuplicates means a losing request gets no row back here (not an
  // error), and falls through to reading back the winner's row instead --
  // its own speculatively-created world row above becomes an orphaned but
  // still valid published world, which is an acceptable cost for a
  // genuinely rare race rather than a correctness violation.
  const { data: upserted, error: upsertError } = await admin
    .from('merges')
    .upsert(
      { source_world_ids: sourceWorldIds, result_world_id: resultWorldId, status: 'completed', provenance: mergedSpec.provenance },
      { onConflict: 'source_world_ids', ignoreDuplicates: true }
    )
    .select('id, result_world_id')
    .maybeSingle();
  if (upsertError) throw upsertError;

  if (upserted) {
    return { mergeId: upserted.id, resultWorldId: upserted.result_world_id, spec: mergedSpec, reused: false };
  }

  // Lost the race: another request's merge won. Read back its result instead
  // of returning our own orphaned world.
  const winner = await findExistingMerge(admin, sourceWorldIds);
  if (!winner) throw httpError(500, 'Не удалось определить результат параллельного объединения.');
  const { data: winnerWorld, error: winnerWorldError } = await admin.from('worlds').select('spec').eq('id', winner.result_world_id).single();
  if (winnerWorldError) throw winnerWorldError;
  return { mergeId: winner.id, resultWorldId: winner.result_world_id, spec: winnerWorld.spec, reused: true };
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
