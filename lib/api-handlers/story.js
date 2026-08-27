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

async function handleSave(admin, identity, body) {
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const shouldFinish = body.finish === true;
  const blueprint = shouldFinish
    ? buildBlueprint(answers, { journey: body.journey, sourceTitle: body.sourceTitle })
    : undefined;

  if (body.storyId) {
    const [column, value] = ownerFilterColumn(identity);
    const update = { answers, updated_at: new Date().toISOString() };
    if (blueprint) update.blueprint = blueprint;
    const { data, error } = await admin
      .from('stories')
      .update(update)
      .eq('id', body.storyId)
      .eq(column, value)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, 'История не найдена.');
    return { id: data.id, blueprint: blueprint || null };
  }

  const journey = body.journey === 'join' ? 'join' : 'create';
  const row = Object.assign(
    { journey, source_story_id: body.sourceStoryId || null, answers },
    ownerColumns(identity)
  );
  if (blueprint) row.blueprint = blueprint;
  const { data, error } = await admin.from('stories').insert(row).select('id').single();
  if (error) throw error;
  return { id: data.id, blueprint: blueprint || null };
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
  if (body.action === 'save') return sendJson(res, 200, await handleSave(admin, identity, body));
  throw httpError(400, `Неизвестное действие: ${body.action}`);
});

module.exports._private = { handleSave, handleGet, ownerColumns, ownerFilterColumn };
