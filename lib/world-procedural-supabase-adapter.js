'use strict';

function requireName(value, label) {
  const s = String(value || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(s)) throw new Error(`${label} must be an explicit safe SQL identifier`);
  return s;
}

function createSupabaseAuthorityAdapter(client, config = {}) {
  if (!client?.from) throw new TypeError('Supabase client with from() required');
  const table = requireName(config.table, 'table');
  const worldIdColumn = requireName(config.worldIdColumn, 'worldIdColumn');
  const revisionColumn = requireName(config.revisionColumn, 'revisionColumn');
  const hashColumn = requireName(config.hashColumn, 'hashColumn');
  const recipeColumn = requireName(config.recipeColumn, 'recipeColumn');

  const toSnapshot = (row) => row ? {
    worldId: row[worldIdColumn],
    revision: Number(row[revisionColumn]) || 0,
    contentHash: row[hashColumn],
    recipe: row[recipeColumn]
  } : null;

  return {
    async load(worldId) {
      const { data, error } = await client.from(table).select(`${worldIdColumn},${revisionColumn},${hashColumn},${recipeColumn}`).eq(worldIdColumn, worldId).maybeSingle();
      if (error) throw error;
      return toSnapshot(data);
    },

    async compareAndSwap(worldId, expectedHash, nextSnapshot) {
      const row = {
        [worldIdColumn]: worldId,
        [revisionColumn]: nextSnapshot.revision,
        [hashColumn]: nextSnapshot.contentHash,
        [recipeColumn]: nextSnapshot.recipe
      };
      if (expectedHash == null) {
        const { data, error } = await client.from(table).insert(row).select(`${worldIdColumn},${revisionColumn},${hashColumn},${recipeColumn}`).maybeSingle();
        if (!error && data) return { ok: true, current: toSnapshot(data) };
        const current = await this.load(worldId);
        if (current) return { ok: false, current };
        if (error) throw error;
        return { ok: false, current: null };
      }
      const { data, error } = await client.from(table)
        .update(row)
        .eq(worldIdColumn, worldId)
        .eq(hashColumn, expectedHash)
        .select(`${worldIdColumn},${revisionColumn},${hashColumn},${recipeColumn}`)
        .maybeSingle();
      if (error) throw error;
      if (data) return { ok: true, current: toSnapshot(data) };
      return { ok: false, current: await this.load(worldId) };
    }
  };
}

module.exports = { createSupabaseAuthorityAdapter };
