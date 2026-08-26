# WORK IN PROGRESS — Preview environment isolation + PostHog product analytics

> Superseded 2026-08-26: the previous content here (World Quality Autopilot V4) was stale — PR #8 merged to master days ago (`fa34457`). See git history / `.github` for that work's final state if needed.

## Task
Add PostHog product analytics without duplicating Sentry (which already owns Session Replay + Error Tracking), and fix the Vercel Preview environment so `/api/config` and admin-dependent endpoints (login/register/voxel/game) actually work on Preview deployments instead of 500ing.

## Why
Every Preview deployment except one specific git branch (`codex/voxel-v3`) was 500ing on `/api/config` because `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` were scoped to that one branch only in Vercel. Fixing that safely (without widening the production Supabase service-role secret to arbitrary PR/AI branches) required a real architecture decision, not just flipping a checkbox.

## Current State
- `/api/config` on Preview returns HTTP 200 with the correct public-only shape (`supabaseUrl`, `supabasePublishableKey`, `posthogKey`, `posthogHost`) — confirmed live on the deployed Preview, not just in tests.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `POSTHOG_HOST` are now scoped to all Preview branches in Vercel (previously branch-restricted / Production-only).
- `POSTHOG_KEY` is Production-only still — see Blockers.
- A dedicated Supabase preview/test project exists: `world-server-preview` (ref `xlcdnlsyvxqtopmkweiy`, org `Improve`, region ap-southeast-1), full schema applied (all 6 original tracked migrations + a `profiles` table/auth-trigger migration this repo never tracked + a security-hardening migration), verified functionally via direct SQL (auth trigger creates a profile row correctly, game/voxel functions work) and via Supabase's own security advisor (clean).
- `SUPABASE_PREVIEW_URL` is set in Vercel Preview scope, pointing at that project.
- `SUPABASE_PREVIEW_SECRET_KEY` is NOT set — see Blockers. `lib/env.js`'s `getSecretKey()`/`createAdminClient()` structurally refuse to fall back to the production secret when `VERCEL_ENV === 'preview'`, so admin-dependent Preview endpoints currently fail with a clear, specific error instead of a generic crash or (worse) silently touching production data.
- Found and fixed a real security bug along the way: `handle_new_user()` (a `SECURITY DEFINER` trigger function) was missing an `EXECUTE` revoke, so PostgREST auto-exposed it as a public RPC anyone could call directly. Fixed via a new tracked migration + a regression test that checks every `SECURITY DEFINER` function in `supabase/migrations/*.sql` for a matching revoke.

## Target State
- `POSTHOG_KEY` also scoped to Preview → PostHog product analytics events actually arrive in PostHog EU (`https://eu.i.posthog.com`) from a live Preview deployment, confirmed via real browser network requests, not just code inspection.
- `SUPABASE_PREVIEW_SECRET_KEY` set → login/register/voxel/game work end-to-end on Preview against the isolated preview project, confirmed via real HTTP flows, not just SQL-level verification.
- `mergeSafe: true` once both of the above are live-confirmed and full test/quality gates pass.

## Branch
`ai/claude/safe-parallel-20260826`

## Commit
`48cd7c0` (latest substantive change; a few `chore: trigger preview redeploy` empty commits follow it — check `git log` for the actual tip)

## PR
#12 — https://github.com/mpaykin1/World_server/pull/12 (open, targets `master`, not merged)

## Tests
- `node --test`: 130/130 PASS
- `node scripts/check-js.js`: PASS (32 files)
- `node scripts/check-posthog-runtime.js`: PASS
- `node scripts/check-agent-rules.js`: PASS
- New regression tests this branch added: `test/posthog-config.test.js`, `test/api-router-dispatch.test.js` (from a related PR, see #11), `test/vercel-function-limit.test.js` (#11), `test/preview-secret-isolation.test.js`, `test/supabase-security-definer-rpc-exposure.test.js`

## Blockers
1. **`POSTHOG_KEY` not obtainable for Preview scope.** Checked every available avenue: production's live `/api/config` doesn't emit it yet (this PR isn't merged); no authenticated browser session for app.posthog.com/eu.posthog.com exists in this environment (reached the login form, no stored credentials — did not attempt to sign in); `vercel env pull` redacts the value to a placeholder before it can be read, a platform-level control, not a policy choice. Needs a human to open the existing `POSTHOG_KEY` entry in Vercel and additionally check "Preview" — the value itself never needs to be re-typed.
2. **`SUPABASE_PREVIEW_SECRET_KEY` not obtainable.** The connected Supabase MCP tooling has no tool that returns a service-role/secret key for any project — including `world-server-preview`, which this session created itself — by design (same category of platform safety boundary as #1). Needs a human to open Supabase Dashboard → world-server-preview → Project Settings → API Keys → `service_role`/`secret` key, and add it to Vercel as `SUPABASE_PREVIEW_SECRET_KEY` (Preview scope).

Both are the same shape of blocker: a credential this session is structurally prevented from reading through any available tool, not a step being skipped for convenience.

## Risks
- The `handle_new_user()` RPC-exposure fix (migration `20260826090000_harden_handle_new_user_rpc_exposure.sql`) has only been applied to the new preview project, not to production — production's Supabase project isn't reachable through the currently-connected Supabase MCP account. Worth applying there too once someone with access reviews it.
- `SUPABASE_PREVIEW_URL`/`SUPABASE_PREVIEW_SECRET_KEY` pattern is new; once the secret key is set, do a real end-to-end HTTP test (not just the SQL-level check already done) before trusting it in CI.

## Next Action
Once a human sets `POSTHOG_KEY` (Preview scope) and `SUPABASE_PREVIEW_SECRET_KEY` in Vercel: redeploy PR #12's Preview, verify `/api/config` still 200s, exercise login/register/voxel/game over real HTTP against the preview Supabase project, open the Preview in a browser and confirm PostHog events actually reach `https://eu.i.posthog.com` (network request level, not just that the bundle loads), then reassess `mergeSafe`.

## Completion Criteria
- `/api/config`: PASS (already true).
- PostHog EU live events: PASS (network-confirmed, not just unit-tested).
- Preview admin endpoints (login/register/voxel/game): PASS over real HTTP.
- Full test suite: PASS.
- `check-agent-rules.js`: PASS.
- No regression in Sentry (Session Replay/Error Tracking) or in the Vercel Hobby function-count limit (see PR #11).
- `mergeSafe: true` only once every item above is true — not before.
