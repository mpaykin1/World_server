'use strict';

// Minimal in-memory fake of the subset of the supabase-js query builder that
// lib/api-handlers/story.js, world.js and merge.js actually use (from/select/
// insert/update/eq/in/single/maybeSingle, all thenable at any point in the
// chain, matching real supabase-js). Not a general-purpose mock -- just
// enough to unit-test ownership enforcement, action dispatch and merge
// idempotency without a live service-role key, which this session's tools
// have no access to for any project (a verified platform boundary, not an
// oversight -- see WORK_IN_PROGRESS.md).

function createFakeSupabase(initialTables = {}) {
  const tables = new Map(Object.entries(initialTables).map(([k, v]) => [k, [...v]]));
  let autoId = 1;

  function table(name) {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  }

  function valueEquals(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((v, i) => v === b[i]);
    }
    return a === b;
  }

  function matches(row, filters) {
    return filters.every(([type, col, val]) => {
      if (type === 'eq') return valueEquals(row[col], val);
      if (type === 'in') return val.includes(row[col]);
      return true;
    });
  }

  function builder(name) {
    let mode = null; // 'select' | 'insert' | 'update' | 'upsert'
    let payload = null;
    let selectCols = null;
    let upsertOpts = null;
    const filters = [];
    let terminal = null; // 'single' | 'maybeSingle' | null (array)

    const api = {
      select(cols) { selectCols = cols; if (!mode) mode = 'select'; return api; },
      insert(row) { mode = 'insert'; payload = row; return api; },
      update(row) { mode = 'update'; payload = row; return api; },
      upsert(row, opts) { mode = 'upsert'; payload = row; upsertOpts = opts || {}; return api; },
      eq(col, val) { filters.push(['eq', col, val]); return api; },
      in(col, vals) { filters.push(['in', col, vals]); return api; },
      single() { terminal = 'single'; return api; },
      maybeSingle() { terminal = 'maybeSingle'; return api; },
      then(resolve, reject) {
        try { resolve(execute()); } catch (e) { reject ? reject(e) : resolve({ data: null, error: e }); }
      }
    };

    function execute() {
      const rows = table(name);
      if (mode === 'insert') {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((r) => Object.assign({ id: r.id || String(autoId++) }, r));
        rows.push(...inserted);
        const result = inserted.length === 1 ? inserted[0] : inserted;
        if (terminal === 'single') return { data: result, error: null };
        if (terminal === 'maybeSingle') return { data: result, error: null };
        return { data: inserted, error: null };
      }
      if (mode === 'upsert') {
        const conflictCol = upsertOpts.onConflict;
        const conflictVal = payload[conflictCol];
        const existing = conflictCol ? rows.find((r) => valueEquals(r[conflictCol], conflictVal)) : null;
        if (existing) {
          if (upsertOpts.ignoreDuplicates) {
            // Real supabase-js/PostgREST: an ignored-duplicate upsert returns
            // no row at all, not the existing one -- the caller is expected
            // to re-select for it, exactly like the real conflict-loser path.
            if (terminal === 'single') return { data: null, error: { message: 'no rows' } };
            return { data: terminal === 'maybeSingle' ? null : [], error: null };
          }
          Object.assign(existing, payload);
          if (terminal === 'single' || terminal === 'maybeSingle') return { data: existing, error: null };
          return { data: [existing], error: null };
        }
        const inserted = Object.assign({ id: payload.id || String(autoId++) }, payload);
        rows.push(inserted);
        if (terminal === 'single' || terminal === 'maybeSingle') return { data: inserted, error: null };
        return { data: [inserted], error: null };
      }
      if (mode === 'update') {
        const affected = rows.filter((r) => matches(r, filters));
        affected.forEach((r) => Object.assign(r, payload));
        if (terminal === 'single') return { data: affected[0] || null, error: affected.length ? null : null };
        if (terminal === 'maybeSingle') return { data: affected[0] || null, error: null };
        return { data: affected, error: null };
      }
      // select
      const found = rows.filter((r) => matches(r, filters));
      if (terminal === 'single') return { data: found[0] || null, error: found.length ? null : { message: 'no rows' } };
      if (terminal === 'maybeSingle') return { data: found[0] || null, error: null };
      return { data: found, error: null };
    }

    return api;
  }

  return {
    from: (name) => builder(name),
    _tables: tables,
    // Matches the handful of auth surface lib/auth.js#optionalIdentity touches.
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no token' } }) }
  };
}

module.exports = { createFakeSupabase };
