'use strict';

const crypto = require('crypto');
const { createAdminClient } = require('../env');
const { optionalIdentity } = require('../auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../http');
const { buildWorldSpec } = require('../world-spec');

// World creation for the improve-world-home pipeline:
// QUESTIONNAIRE -> STORY -> BLUEPRINT -> WORLD SPEC -> WORLD RECORD -> PUBLIC URL.
//
// Deliberately does NOT create a new Vercel project per world (that pattern
// already produced the 45-project sprawl this session found and fixed for
// SSO exposure) -- a world is just a row with a stable text id, openable at
// a single shared runtime path (e.g. /world/<id>) once that runtime exists.
// This handler only owns the data side of that.

function newWorldId() {
  return `w-${crypto.randomBytes(6).toString('hex')}`;
}

function ownerColumns(identity) {
  return identity.kind === 'user'
    ? { owner_user_id: identity.userId, owner_guest_id: null }
    : { owner_user_id: null, owner_guest_id: identity.guestId };
}

function ownerFilterColumn(identity) {
  return identity.kind === 'user' ? ['owner_user_id', identity.userId] : ['owner_guest_id', identity.guestId];
}

async function handleGenerate(admin, identity, body) {
  if (!body.storyId) throw httpError(400, 'storyId обязателен.');
  const [column, value] = ownerFilterColumn(identity);
  const { data: story, error: storyError } = await admin
    .from('stories')
    .select('id, blueprint, answers')
    .eq('id', body.storyId)
    .eq(column, value)
    .maybeSingle();
  if (storyError) throw storyError;
  if (!story) throw httpError(404, 'История не найдена.');
  if (!story.blueprint) throw httpError(400, 'История ещё не завершена — сначала нужен Narrative Blueprint.');

  const spec = buildWorldSpec(story);
  const id = newWorldId();
  const row = Object.assign(
    {
      id,
      source_story_ids: [story.id],
      spec,
      status: 'published',
      public_slug: id
    },
    ownerColumns(identity)
  );
  const { data, error } = await admin.from('worlds').insert(row).select('id, public_slug, status, spec').single();
  if (error) throw error;
  return data;
}

async function handleGet(admin, identity, body) {
  if (!body.worldId) throw httpError(400, 'worldId обязателен.');
  const { data, error } = await admin
    .from('worlds')
    .select('id, source_story_ids, spec, status, public_slug, owner_user_id, owner_guest_id, created_at, updated_at')
    .eq('id', body.worldId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Мир не найден.');
  if (data.status === 'published') return data;
  // Draft worlds are server-only (RLS denies anon/authenticated entirely) --
  // only the owner may read one back before it's published.
  const isOwner = identity.kind === 'user'
    ? data.owner_user_id === identity.userId
    : data.owner_guest_id === identity.guestId;
  if (!isOwner) throw httpError(404, 'Мир не найден.');
  return data;
}

module.exports = withErrors(async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  const admin = createAdminClient();
  const identity = await optionalIdentity(admin, req, body);

  if (body.action === 'get') return sendJson(res, 200, await handleGet(admin, identity, body));
  if (body.action === 'generate') return sendJson(res, 200, await handleGenerate(admin, identity, body));
  throw httpError(400, `Неизвестное действие: ${body.action}`);
});

module.exports._private = { newWorldId, handleGenerate, handleGet, ownerColumns, ownerFilterColumn };
