'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression guard for a real finding from Supabase's security advisor
// (get_advisors) while provisioning a fresh preview project from these
// migrations: a `security definer` function in the `public` schema is
// auto-exposed by PostgREST as a public RPC unless EXECUTE is explicitly
// revoked from anon/authenticated. handle_new_user() had exactly this gap —
// callable directly via /rest/v1/rpc/handle_new_user by anyone, not just by
// its intended caller (the on_auth_user_created trigger, which doesn't need
// an EXECUTE grant to fire). This test makes sure every `security definer`
// function created in public across all migrations gets a matching revoke
// somewhere in the migration set, so a new one can't reintroduce the gap.

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function functionsToCheck(sql) {
  const names = [];
  const fnRegex = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi;
  let match;
  while ((match = fnRegex.exec(sql))) {
    const fnName = match[1];
    // Only `security definer` functions run with elevated privileges and
    // matter here; `security invoker` (the default) already runs as the
    // caller, so PostgREST exposing it isn't a privilege-escalation risk.
    const bodyStart = match.index;
    const nextDollarQuote = sql.indexOf('$$', bodyStart);
    const closingDollarQuote = nextDollarQuote === -1 ? -1 : sql.indexOf('$$', nextDollarQuote + 2);
    const definition = closingDollarQuote === -1 ? sql.slice(bodyStart) : sql.slice(bodyStart, closingDollarQuote);
    if (/security\s+definer/i.test(definition)) names.push(fnName);
  }
  return names;
}

test('every SECURITY DEFINER function in public schema has an EXECUTE revoke from anon/authenticated somewhere in the migration set', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  assert.ok(files.length > 0, 'expected at least one migration file');

  const allSql = files.map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')).join('\n');
  const definerFunctions = new Set();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    for (const name of functionsToCheck(sql)) definerFunctions.add(name);
  }

  const missing = [];
  for (const name of definerFunctions) {
    const revokePattern = new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\([^)]*\\)\\s+from[^;]*\\b(public|anon|authenticated)\\b`,
      'i'
    );
    if (!revokePattern.test(allSql)) missing.push(name);
  }

  assert.deepEqual(
    missing,
    [],
    `SECURITY DEFINER function(s) with no EXECUTE revoke from anon/authenticated anywhere in supabase/migrations/*.sql — ` +
    `PostgREST will auto-expose them as public RPCs: ${missing.join(', ')}`
  );
});
