'use strict';
// Regression tests for the P0 Supabase SECURITY DEFINER RPC audit
// (supabase/migrations/20260905000000_browser_ai_worker_p0_security_audit.sql).
//
// Two tiers:
//   1. Always-run structural assertions on the migration SQL text itself —
//      catch a future edit that silently reintroduces the audited defects
//      (missing REVOKE, missing search_path, unqualified digest() call,
//      grant to a role that should never have it, a reintroduced cleartext
//      token). These do not require a database connection.
//   2. Opt-in live tier (skipped unless SECURITY_AUDIT_LIVE_SUPABASE_URL +
//      SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY + a seeded test worker token are
//      set), mirroring the AGENT_ADAPTERS_LIVE_OPENCODE_TEST convention used
//      elsewhere in this repo for tests that need a real external system.
//      The auth-logic properties this tier would prove (valid token accepted,
//      wrong/null/empty token rejected, cross-worker token rejected, expired/
//      inactive token rejected) were already proven once, empirically, via
//      3 disposable sandbox probes against project xlcdnlsyvxqtopmkweiy
//      (world-server-preview), each wrapped in BEGIN/ROLLBACK and verified to
//      leave zero residue (see the migration file's header comment for the
//      exact probe SQL and results). This tier re-proves it against whichever
//      live project the caller points it at, on demand.
//
// Run: node --test test/browser-ai-worker-rpc-security.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MIGRATION_PATH = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260905000000_browser_ai_worker_p0_security_audit.sql');
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
// Executable SQL only, with every `-- ...` line-comment stripped - the header
// comment intentionally discusses (in prose) the very patterns these checks
// look for (e.g. explaining why an unqualified digest() call would be unsafe,
// or naming browser_ai_reconcile_worker_health to say it's out of scope), so
// checks must run against code, not against the explanation of the code.
const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

function countMatches(re) {
  return (sql.match(re) || []).length;
}

test('migration file exists and is non-trivial', () => {
  assert.ok(sql.length > 2000, 'expected a real migration body, not a stub');
});

test('every browser_ai_worker_* function in this file is SECURITY DEFINER', () => {
  const blocks = sql.split(/create or replace function/i).slice(1);
  assert.ok(blocks.length >= 4, `expected at least 4 CREATE OR REPLACE FUNCTION statements, found ${blocks.length}`);
  for (const block of blocks) {
    const head = block.split(/\$\$/)[0];
    assert.match(head, /security definer/i, `function block starting "${head.slice(0, 80).trim()}" must be SECURITY DEFINER`);
  }
});

test('every function pins search_path and includes extensions before relying on digest()', () => {
  const blocks = sql.split(/create or replace function/i).slice(1);
  for (const block of blocks) {
    const head = block.split(/\$\$/)[0];
    assert.match(head, /set search_path\s*=/i, 'search_path must be explicitly set (never left mutable)');
    if (/digest\(/i.test(block)) {
      assert.match(head, /extensions/i, 'a function calling digest() must include extensions in its search_path');
    }
  }
});

test('digest() is always schema-qualified as extensions.digest, never called bare', () => {
  // a bare `digest(` (not preceded by "extensions.") would be vulnerable to
  // search_path-based function shadowing if `public` schema CREATE were ever
  // re-granted to a non-privileged role - this is the exact hardening this
  // migration exists to add.
  const bareDigestCalls = code.match(/(?<!extensions\.)\bdigest\(/gi) || [];
  assert.deepEqual(bareDigestCalls, [], `found unqualified digest() call(s): ${JSON.stringify(bareDigestCalls)}`);
});

test('worker_claim, worker_complete, and both worker_heartbeat overloads are revoked from PUBLIC and granted only to anon/authenticated/service_role', () => {
  for (const name of ['browser_ai_worker_claim', 'browser_ai_worker_complete', 'browser_ai_worker_heartbeat']) {
    const revokeCount = countMatches(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public;`, 'gi'));
    assert.ok(revokeCount >= 1, `expected a "revoke ... from public" for ${name}`);
  }
  const grantLines = sql.split('\n').filter((l) => /grant execute on function public\.browser_ai_worker_/i.test(l));
  assert.ok(grantLines.length >= 4, `expected at least 4 GRANT lines (claim, complete, heartbeat x2), found ${grantLines.length}`);
  for (const line of grantLines) {
    assert.match(line, /to anon, authenticated, service_role/i, `unexpected grant target in: ${line}`);
    assert.doesNotMatch(line, /\bpublic\b(?!\s*\.)/i, `must never grant to the PUBLIC pseudo-role: ${line}`);
  }
});

test('token comparison always uses coalesce(p_token, \'\') so a NULL token cannot short-circuit to a NULL (non-boolean) comparison', () => {
  const tokenChecks = sql.match(/token_hash\s*=\s*encode\(extensions\.digest\(coalesce\(p_token,''\)/gi) || [];
  assert.ok(tokenChecks.length >= 3, `expected coalesce(p_token,'') in every token comparison (claim, complete, heartbeat), found ${tokenChecks.length}`);
});

test('token check always requires active = true and a non-expired row (no bypass for disabled or expired workers)', () => {
  const activeChecks = countMatches(/and active is true/gi);
  const expiryChecks = countMatches(/expires_at is null or expires_at > now\(\)/gi);
  assert.ok(activeChecks >= 3, `expected an "active is true" guard in every claim/complete/heartbeat check, found ${activeChecks}`);
  assert.ok(expiryChecks >= 3, `expected an expiry guard in every claim/complete/heartbeat check, found ${expiryChecks}`);
});

test('worker identity and token must both match the SAME row (no cross-worker token reuse)', () => {
  // the WHERE clause must filter by `worker = p_worker` in the same
  // sub-select as the token_hash comparison - if this were ever split into
  // two independent existence checks, a valid token for worker B could
  // authenticate a request claiming to be worker A.
  const combinedChecks = sql.match(/where worker = p_worker[\s\S]{0,300}?token_hash = encode\(extensions\.digest/g) || [];
  assert.ok(combinedChecks.length >= 3, `expected worker+token checked in one WHERE clause in claim/complete/heartbeat, found ${combinedChecks.length}`);
});

test('no cleartext worker token or secret is present in this migration file', () => {
  // the real leaked token had the bw_ prefix; assert the pattern is gone
  // from this new file (it was never here, but this guards against a future
  // copy-paste reintroducing it from an older migration).
  assert.doesNotMatch(sql, /bw_[A-Za-z0-9_-]{20,}/, 'a cleartext worker token must never be committed');
});

test('browser_ai_reconcile_worker_health is hardened via GRANT/REVOKE only, never redefined', () => {
  // Confirmed live 2026-09-05 via direct production access: this function is
  // SECURITY DEFINER with NO token/ownership check at all, and was EXECUTABLE
  // by anon AND authenticated - a real P0 unauthenticated privilege-surface
  // bug (any anon caller could force any worker offline). Its body is still
  // unknown, so this migration must fix ONLY the grants - never guess at
  // (and risk breaking) logic no one has verified.
  assert.doesNotMatch(code, /create (or replace )?function public\.browser_ai_reconcile_worker_health/i,
    'must not define/redefine a body for a function whose live source was never recovered - grants-only fix');
});

test('browser_ai_reconcile_worker_health(integer) is revoked from PUBLIC/anon/authenticated and granted only to service_role', () => {
  assert.match(code, /revoke all on function public\.browser_ai_reconcile_worker_health\(integer\) from public, anon, authenticated;/i,
    'expected an explicit REVOKE ALL ... FROM public, anon, authenticated for this exact signature');
  const grantLine = code.split('\n').find((l) => /grant execute on function public\.browser_ai_reconcile_worker_health/i.test(l));
  assert.ok(grantLine, 'expected a GRANT EXECUTE line for browser_ai_reconcile_worker_health');
  assert.match(grantLine, /to service_role;\s*$/i, `expected GRANT ... TO service_role only, got: ${grantLine}`);
  assert.doesNotMatch(grantLine, /\banon\b|\bauthenticated\b/i, `must not grant anon/authenticated: ${grantLine}`);
});

test('the REVOKE for browser_ai_reconcile_worker_health comes before its GRANT (order matters: revoke-then-grant, never grant-then-revoke)', () => {
  const revokeIdx = code.search(/revoke all on function public\.browser_ai_reconcile_worker_health/i);
  const grantIdx = code.search(/grant execute on function public\.browser_ai_reconcile_worker_health/i);
  assert.ok(revokeIdx >= 0 && grantIdx >= 0, 'both statements must be present');
  assert.ok(revokeIdx < grantIdx, 'REVOKE must precede GRANT so there is never a window where the old (over-permissive) grant and the new one coexist ambiguously');
});

test('redacted token file no longer contains the leaked cleartext token', () => {
  const tokenAuthMigration = fs.readFileSync(
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20260903132521_browser_local_worker_token_auth.sql'), 'utf8');
  assert.doesNotMatch(tokenAuthMigration, /bw_3dI8K37ICyZ0P2K7ES3IUQe5Bj3OX_2CQ0Llv2M-h0E/, 'the previously-committed cleartext token must stay redacted');
  const contribReport = fs.readFileSync(
    path.resolve(__dirname, '..', 'reports', 'OPENCODE_BROWSER_AUTHORITY_CONTRIBUTION.json'), 'utf8');
  assert.doesNotMatch(contribReport, /bw_3dI8K37ICyZ0P2K7ES3IUQe5Bj3OX_2CQ0Llv2M-h0E/, 'the previously-committed cleartext token must stay redacted');
});

// ---------------------------------------------------------------------------
// Opt-in live tier. Skipped unless a real Supabase project + seeded test
// worker token are provided via env - never hardcode credentials here.
// ---------------------------------------------------------------------------

const LIVE = process.env.SECURITY_AUDIT_LIVE_SUPABASE_URL && process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY
  && process.env.SECURITY_AUDIT_LIVE_WORKER_ID && process.env.SECURITY_AUDIT_LIVE_WORKER_TOKEN;

test('live: valid worker token is accepted by browser_ai_worker_claim (opt-in, requires SECURITY_AUDIT_LIVE_* env)', { skip: !LIVE && 'opt-in only - set SECURITY_AUDIT_LIVE_SUPABASE_URL/ANON_KEY/WORKER_ID/WORKER_TOKEN to run against a real project' }, async () => {
  const res = await fetch(`${process.env.SECURITY_AUDIT_LIVE_SUPABASE_URL}/rest/v1/rpc/browser_ai_worker_claim`, {
    method: 'POST',
    headers: { apikey: process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_worker: process.env.SECURITY_AUDIT_LIVE_WORKER_ID, p_token: process.env.SECURITY_AUDIT_LIVE_WORKER_TOKEN, p_capabilities: [], p_lease_seconds: 60 }),
  });
  assert.equal(res.status, 200, 'a valid worker token must be accepted');
});

test('live: anon with no token is rejected by browser_ai_worker_claim (opt-in)', { skip: !LIVE && 'opt-in only' }, async () => {
  const res = await fetch(`${process.env.SECURITY_AUDIT_LIVE_SUPABASE_URL}/rest/v1/rpc/browser_ai_worker_claim`, {
    method: 'POST',
    headers: { apikey: process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_worker: process.env.SECURITY_AUDIT_LIVE_WORKER_ID, p_capabilities: [], p_lease_seconds: 60 }),
  });
  assert.notEqual(res.status, 200, 'a missing token must never be accepted');
});

test('live: anon with a wrong token is rejected by browser_ai_worker_claim (opt-in)', { skip: !LIVE && 'opt-in only' }, async () => {
  const res = await fetch(`${process.env.SECURITY_AUDIT_LIVE_SUPABASE_URL}/rest/v1/rpc/browser_ai_worker_claim`, {
    method: 'POST',
    headers: { apikey: process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_worker: process.env.SECURITY_AUDIT_LIVE_WORKER_ID, p_token: 'definitely-not-the-real-token', p_capabilities: [], p_lease_seconds: 60 }),
  });
  assert.notEqual(res.status, 200, 'a wrong token must never be accepted');
});

test('live: a valid token for a DIFFERENT worker id is rejected (cross-worker token reuse)', { skip: !LIVE && 'opt-in only' }, async () => {
  const res = await fetch(`${process.env.SECURITY_AUDIT_LIVE_SUPABASE_URL}/rest/v1/rpc/browser_ai_worker_claim`, {
    method: 'POST',
    headers: { apikey: process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_worker: `${process.env.SECURITY_AUDIT_LIVE_WORKER_ID}-not-me`, p_token: process.env.SECURITY_AUDIT_LIVE_WORKER_TOKEN, p_capabilities: [], p_lease_seconds: 60 }),
  });
  assert.notEqual(res.status, 200, 'a token valid for one worker id must never authenticate a different worker id');
});

// Confirmed live 2026-09-05 via direct production access: BEFORE this
// migration is applied, anon/authenticated genuinely get a 200 from this
// RPC today (the P0 bug this migration exists to close). These two opt-in
// tests assert the POST-FIX expected state and are meant to be run against
// production only after the REVOKE/GRANT statements in section 3 of
// 20260905000000_browser_ai_worker_p0_security_audit.sql have actually been
// applied - running them before that will correctly FAIL, which is the
// intended signal that the fix is not live yet.
test('live: anon cannot call browser_ai_reconcile_worker_health after the fix is applied (opt-in)', { skip: !LIVE && 'opt-in only' }, async () => {
  const res = await fetch(`${process.env.SECURITY_AUDIT_LIVE_SUPABASE_URL}/rest/v1/rpc/browser_ai_reconcile_worker_health`, {
    method: 'POST',
    headers: { apikey: process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_stale_seconds: 300 }),
  });
  assert.notEqual(res.status, 200, `expected anon to be rejected (401/403/404) after the fix; got ${res.status} - either the fix is not applied yet, or the real parameter name differs from the guessed p_stale_seconds`);
});

test('live: authenticated cannot call browser_ai_reconcile_worker_health after the fix is applied (opt-in, requires SECURITY_AUDIT_LIVE_AUTHENTICATED_JWT)', { skip: (!LIVE || !process.env.SECURITY_AUDIT_LIVE_AUTHENTICATED_JWT) && 'opt-in only - also requires SECURITY_AUDIT_LIVE_AUTHENTICATED_JWT' }, async () => {
  const res = await fetch(`${process.env.SECURITY_AUDIT_LIVE_SUPABASE_URL}/rest/v1/rpc/browser_ai_reconcile_worker_health`, {
    method: 'POST',
    headers: { apikey: process.env.SECURITY_AUDIT_LIVE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SECURITY_AUDIT_LIVE_AUTHENTICATED_JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_stale_seconds: 300 }),
  });
  assert.notEqual(res.status, 200, `expected an authenticated (non-service-role) caller to be rejected after the fix; got ${res.status}`);
});
