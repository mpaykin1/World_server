'use strict';

const { createAdminClient } = require('../env');
const { optionalIdentity } = require('../auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../http');
const { buildBlueprint } = require('../narrative-blueprint');

// Story persistence for the improve-world-home questionnaire. Anonymous-first
// by design (lib/auth.js#optionalIdentity already implements exactly this
// model for the game/voxel endpoints -- reused as-is, not reinvented): a
// client-generated guestId is enough to create and own a story, a real
// account is optional and only needed to later claim/sync it.
//
// stories is a server-only table (see supabase/migrations/20260827100000_
// story_world_merge.sql) -- ownership is enforced here at the application
// layer, matching game_player_states/voxel_player_states's existing pattern,
// since a client-supplied guestId isn't something Postgres RLS can verify.

function ownerColumns(identity) {
  return identity.kind === 'user'
    ? { owner_user_id: identity.userId, owner_guest_id: null }
    : { owner_user_id: null, owner_guest_id: identity.guestId };
}

function ownerFilterColumn(identity) {
  return identity.kind === 'user' ? ['owner_user_id', identity.userId] : ['owner_guest_id', identity.guestId];
}

// Supabase is the canonical source of truth once a story exists there;
// localStorage on the client is a cache/offline-recovery/pending-sync layer
// only, never the record of who-wrote-what-last. Optimistic concurrency via
// `version` (already in the schema) is how a client's offline-queued write
// can detect it's about to clobber a newer server write instead of silently
// overwriting it -- realistic sources of a real conflict here are the same
// guestId's story open in two tabs, or a queued offline write landing after
// a more recent online one from the same browser.
async function handleSave(admin, identity, body) {
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const shouldFinish = body.finish === true;
  const blueprint = shouldFinish
    ? buildBlueprint(answers, { journey: body.journey, sourceTitle: body.sourceTitle })
    : undefined;

  if (body.storyId) {
    const [column, value] = ownerFilterColumn(identity);
    const { data: current, error: readError } = await admin
      .from('stories')
      .select('id, version, answers, blueprint, updated_at')
      .eq('id', body.storyId)
      .eq(column, value)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw httpError(404, 'История не найдена.');

    if (Number.isFinite(body.expectedVersion) && body.expectedVersion !== current.version) {
      // Someone (another tab, a queued offline write from earlier) already
      // moved this story past the version the caller thought it was
      // editing. Hand back the real server state instead of overwriting it
      // -- the client decides how to reconcile, Supabase never silently
      // loses a write on either side.
      return { conflict: true, server: current };
    }

    const update = { answers, version: current.version + 1, updated_at: new Date().toISOString() };
    if (blueprint) update.blueprint = blueprint;
    const { data, error } = await admin
      .from('stories')
      .update(update)
      .eq('id', body.storyId)
      .eq(column, value)
      .select('id, version')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, 'История не найдена.');
    return { id: data.id, version: data.version, blueprint: blueprint || null };
  }

  const journey = body.journey === 'join' ? 'join' : 'create';
  const row = Object.assign(
    { journey, source_story_id: body.sourceStoryId || null, answers, version: 1 },
    ownerColumns(identity)
  );
  if (blueprint) row.blueprint = blueprint;
  const { data, error } = await admin.from('stories').insert(row).select('id, version').single();
  if (error) throw error;
  return { id: data.id, version: data.version, blueprint: blueprint || null };
}

async function handleGet(admin, identity, body) {
  if (!body.storyId) throw httpError(400, 'storyId обязателен.');
  const [column, value] = ownerFilterColumn(identity);
  const { data, error } = await admin
    .from('stories')
    .select('id, journey, source_story_id, answers, blueprint, version, created_at, updated_at')
    .eq('id', body.storyId)
    .eq(column, value)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'История не найдена.');
  return data;
}

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  const admin = createAdminClient();
  const identity = await optionalIdentity(admin, req, body);

  if (body.action === 'get') return sendJson(res, 200, await handleGet(admin, identity, body));
  if (body.action === 'save') {
    const result = await handleSave(admin, identity, body);
    return sendJson(res, result.conflict ? 409 : 200, result);
  }
  throw httpError(400, `Неизвестное действие: ${body.action}`);
});

module.exports._private = { handleSave, handleGet, ownerColumns, ownerFilterColumn };
