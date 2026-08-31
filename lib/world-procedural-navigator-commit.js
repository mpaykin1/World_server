'use strict';

const crypto = require('crypto');
const core = require('../shared/world-procedural-core');
const { compileWorldRecipe, createRecipeDeltaPacket } = require('./world-procedural-recipe-engine');
const { mutateFromNavigator } = require('./world-procedural-navigator-distiller');

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : core.stableStringify(value)).digest('hex');
}

function defaultIdempotencyKey(worldId, expectedRevision, output = {}) {
  const compact = {
    worldId,
    expectedRevision,
    messageHash32: output.message == null ? 0 : core.stringHash32(String(output.message).slice(0, 4096)),
    recipePatch: output.recipePatch || null,
    semantics: output.semantics || null
  };
  return `nav-v3-${sha256(compact).slice(0, 40)}`;
}

function normalizeIdentity(identity = {}) {
  return {
    userId: identity.userId || null,
    guestId: identity.guestId || null
  };
}

function createNavigatorRecipeCommitter(liveAdapter, options = {}) {
  if (!liveAdapter?.loadWorld || !liveAdapter?.atomicCommit) {
    throw new TypeError('live Supabase procedural adapter required');
  }
  const maxRetries = Math.max(0, Math.min(2, Math.trunc(Number(options.maxRetries) || 1)));

  async function commitTurn(input = {}) {
    const worldId = core.sanitizeWorldId(input.worldId || 'main');
    const capabilities = input.capabilities || {};
    const qualityScale = Number(input.qualityScale) || 1;
    const identity = normalizeIdentity(input.identity);
    const output = input.output || {};
    let attempt = 0;
    let baseSnapshot = null;

    while (attempt <= maxRetries) {
      baseSnapshot = await liveAdapter.loadWorld(worldId);
      if (!baseSnapshot) return { ok: false, reason: 'world_not_found', worldId, attempts: attempt + 1 };

      const previous = compileWorldRecipe({ ...baseSnapshot.recipe, worldId, revision: baseSnapshot.revision }, capabilities, qualityScale);
      const next = mutateFromNavigator(previous.recipe, output, capabilities, qualityScale);
      const deltaPacket = createRecipeDeltaPacket(previous, next);
      const idempotencyKey = String(input.idempotencyKey || defaultIdempotencyKey(worldId, baseSnapshot.revision, output)).slice(0, 160);
      const result = await liveAdapter.atomicCommit({
        worldId,
        expectedRevision: baseSnapshot.revision,
        recipe: next.recipe,
        contentHash: next.contentHash,
        delta: deltaPacket.delta,
        idempotencyKey,
        source: input.source || 'navigator',
        userId: identity.userId,
        guestId: identity.guestId
      });

      if (result?.ok) {
        const hint = {
          type: 'world:recipe-hint:v3',
          worldId,
          revision: Number(result.revision),
          contentHash: result.contentHash || next.contentHash,
          eventId: result.eventId || null,
          idempotent: result.idempotent === true
        };
        if (input.broadcast !== false && typeof liveAdapter.createBroadcastChannel === 'function') {
          const channel = liveAdapter.createBroadcastChannel(worldId);
          try { if (channel?.supported) await channel.send(hint); }
          finally { await channel?.close?.(); }
        }
        return {
          ok: true,
          worldId,
          revision: Number(result.revision),
          contentHash: result.contentHash || next.contentHash,
          eventId: result.eventId || null,
          idempotent: result.idempotent === true,
          attempts: attempt + 1,
          recipe: next.recipe,
          delta: deltaPacket.delta,
          hint
        };
      }

      if (result?.reason !== 'revision_conflict' || attempt >= maxRetries) {
        return { ...result, ok: false, worldId, attempts: attempt + 1 };
      }
      attempt += 1;
    }

    return { ok: false, reason: 'commit_exhausted', worldId, attempts: attempt + 1 };
  }

  return { commitTurn };
}

module.exports = { sha256, defaultIdempotencyKey, normalizeIdentity, createNavigatorRecipeCommitter };
