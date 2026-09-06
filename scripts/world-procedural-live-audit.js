'use strict';
const crypto = require('crypto');
const { createAdminClient } = require('../lib/env');
const { createLiveSupabaseProceduralAdapter } = require('../lib/world-procedural-live-supabase');
const { compileWorldRecipe } = require('../lib/world-procedural-recipe-engine');

async function main() {
  const strict = process.argv.includes('--strict');
  let client;
  try { client = createAdminClient(); }
  catch (error) {
    console.error(`LIVE_AUDIT_CONFIG_ERROR: ${error.message}`);
    if (strict) process.exitCode = 2;
    return;
  }
  const adapter = createLiveSupabaseProceduralAdapter(client, { server: true });
  const worldId = process.env.WORLD_PROCEDURAL_AUDIT_WORLD || 'main';
  const world = await adapter.loadWorld(worldId);
  if (!world) throw new Error(`live world not found: ${worldId}`);
  const compiled = compileWorldRecipe({ ...world.recipe, worldId, revision: world.revision });

  // A nonexistent world exercises RPC visibility/permissions without mutating production data.
  const probeId = `wp-audit-${crypto.randomBytes(6).toString('hex')}`;
  const probeRecipe = compileWorldRecipe({ worldId: probeId, seed: 1, revision: 1 });
  const probe = await adapter.atomicCommit({
    worldId: probeId,
    expectedRevision: 0,
    recipe: probeRecipe.recipe,
    contentHash: probeRecipe.contentHash,
    delta: {},
    idempotencyKey: `audit-${crypto.randomBytes(8).toString('hex')}`,
    source: 'world-procedural-live-audit'
  });
  if (probe?.ok !== false || probe?.reason !== 'world_not_found') throw new Error(`unexpected safe RPC probe result: ${JSON.stringify(probe)}`);
  const events = await adapter.listRecipeEvents(worldId, { afterRevision: Math.max(0, world.revision - 4), limit: 8 });
  console.log(JSON.stringify({
    ok: true,
    worldId,
    revision: world.revision,
    contentHash: world.contentHash || compiled.contentHash,
    storedRecipe: Boolean(world.settings?.proceduralRecipe),
    recentRecipeEvents: events.length,
    atomicRpcSafeProbe: 'PASS'
  }, null, 2));
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
