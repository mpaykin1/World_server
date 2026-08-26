# WORK IN PROGRESS — Preview environment isolation + PostHog product analytics

> Superseded 2026-08-26: previous content here (World Quality Autopilot V4) was stale — PR #8 merged to master days ago (`fa34457`).

## Task
Add PostHog product analytics without duplicating Sentry (which already owns Session Replay + Error Tracking), and fix the Vercel Preview environment so `/api/config` and admin-dependent endpoints (login/register/voxel/game) actually work on Preview deployments instead of 500ing — without ever letting an arbitrary PR/AI Preview branch reach the production Supabase service-role secret.

## Why
Every Preview deployment except one specific git branch (`codex/voxel-v3`) was 500ing on `/api/config` because `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` were scoped to that one branch only in Vercel. Fixing that safely required a real architecture decision (separate least-privilege Preview credentials, never a fallback to the production secret), not just flipping a checkbox.

## Current state
- `/api/config` on Preview returns HTTP 200 with the correct public-only shape (`supabaseUrl`, `supabasePublishableKey`, `posthogKey`, `posthogHost`) — confirmed live on the deployed Preview.
- `login`/`me`/`logout` (`/api/login`, `/api/me`, `/api/logout`) are confirmed working end-to-end over real HTTP on a live Preview deployment (curl against the deployed URL, not just unit tests) — audited and found they never actually needed the admin/service-role key (verified directly against a real Supabase project: `getUser(jwt)` and `/auth/v1/logout` only need a valid JWT, and `profiles` is RLS-readable by anon). They now only depend on `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`, already scoped to all Preview branches.
- PostHog config (`getAnalyticsConfig()`) reworked to the same pattern as the Sentry DSN — a hardcoded default in `lib/env.js`, not a per-environment Vercel workflow — since a PostHog Project API Key is a public/client-side token by design. `DEFAULT_POSTHOG_KEY` is currently blank (see Blockers); once set, PostHog works in every environment with zero Vercel configuration.
- A dedicated Supabase preview/test project exists: `world-server-preview` (ref `xlcdnlsyvxqtopmkweiy`, org `Improve`, region ap-southeast-1). Full schema applied (all 6 original tracked migrations + a `profiles` table/auth-trigger migration this repo never tracked at all + a security-hardening migration for a real `handle_new_user()` public-RPC-exposure bug found via Supabase's own advisor). Verified functionally via direct SQL and REST calls (auth signup/login flow, profiles RLS, game/voxel functions all work); `get_advisors` clean.
- `register.js` (needs `admin.auth.admin.createUser` to skip email confirmation for synthetic accounts) and `game.js`/`voxel.js`/`quality-*.js` (RLS denies anon/authenticated by design, service-role mediates all writes) remain genuinely admin-dependent — audited, not just assumed; no safe way found to avoid elevated credentials for these specific operations.
- `release:gate` run on this branch end to end: **PASS** (all ~19 chained sub-steps completed, no break in the `&&` chain, final step `quality:world` reported 100%). This branch's package.json doesn't carry `integration:full`/`functions:audit`/`control-plane`/`honest-100`/`graphics-ratchet`/`monotonic` at all — those exist only on other, more divergent branches (see Known risks); `release:gate` is the full applicable gate here.

## Target state
- `DEFAULT_POSTHOG_KEY` set (one line in `lib/env.js`, or a `POSTHOG_KEY` env var as a temporary override) → PostHog product analytics events actually arrive in PostHog EU (`https://eu.i.posthog.com`) from a live Preview deployment, confirmed via real browser network requests.
- `SUPABASE_PREVIEW_SECRET_KEY` set → register/voxel/game work end-to-end on Preview against the isolated preview project, confirmed via real HTTP flows.
- `mergeSafe: true` once the two blocked items are live-confirmed.

## Files / systems involved
- `lib/env.js` (public/secret/preview config resolution — the core of this work)
- `api/config.js`, `api/login.js`, `api/me.js`, `api/logout.js`, `api/register.js`, `api/voxel.js`, `api/game.js`
- `shared/posthog-runtime.entry.js`, `scripts/build-posthog.js`, `scripts/check-posthog-runtime.js`, `scripts/inject-posthog-runtime.js`
- `supabase/migrations/*.sql` (including the new `profiles`/auth-trigger and `handle_new_user` hardening migrations)
- `AGENTS.md` (sections 12–14: multi-AI peer improvement, autonomous execution boundary, session/interruption continuity)
- `scripts/check-agent-rules.js` (continuity/policy machine checks)
- `WORLD_SERVER_SECRETS/SECRETS_INDEX.md` (outside the repo, metadata-only credential index)
- Vercel project `world-server` environment variables (Preview scope for `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`/`POSTHOG_HOST`/`SUPABASE_PREVIEW_URL`)

## Known risks
- The `handle_new_user()` RPC-exposure fix has only been applied to the new preview project, not production — production's Supabase project isn't reachable through the currently-connected Supabase MCP account (different account than whatever manages production). Worth applying there too once someone with access reviews it.
- `SUPABASE_PREVIEW_URL`/`SUPABASE_PREVIEW_SECRET_KEY` pattern is new; once the secret key is set, a real end-to-end HTTP test of register/voxel/game (not just the SQL-level check already done) should run before trusting it in CI.
- This branch is based on `origin/master`, which lacks the much larger (and, per this session's earlier audit, partly unverified/self-reported) "quality autopilot" infrastructure on other branches (`integration:full`, `functions:audit`, `control-plane`, `honest-100`, `graphics-ratchet`, `monotonic` don't exist as scripts here). Deliberately not imported wholesale — see AGENTS.md §14 "safe integration" (minimum transfer, not a mechanical branch merge).

## Golden systems that must be preserved
- Sentry Session Replay + Error Tracking (`shared/sentry-runtime.entry.js`) — PostHog is scoped to Product Analytics only specifically so it doesn't duplicate this.
- The Vercel Hobby serverless-function-count limit fix (PR #11) — this branch's changes add zero new API routes (PostHog rides on the existing `/api/config`).
- Production's Supabase service-role secret must never become reachable from an arbitrary Preview branch — the entire `SUPABASE_PREVIEW_*` architecture exists to guarantee this structurally, not just by convention.

## Errors that must not return
- `/api/config` 500ing on Preview branches other than `codex/voxel-v3` (root cause: `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` scoped to one branch only) — fixed by widening those two public values to all Preview branches; regression-tested (`test/preview-secret-isolation.test.js`).
- Preview code silently falling back to the production Supabase secret if it were ever accidentally scoped to Preview — structurally prevented in `lib/env.js#getSecretKey`, regression-tested.
- `handle_new_user()` being callable as a public RPC — fixed via migration + `test/supabase-security-definer-rpc-exposure.test.js`, which checks *every* `SECURITY DEFINER` function in `supabase/migrations/*.sql`, not just this one.
- `login.js`/`me.js`/`logout.js` regaining an unnecessary `createAdminClient()` dependency — regression-tested (`test/auth-endpoints-no-admin-key.test.js`).
- `AGENTS.md` losing one of its required standing-policy concepts silently — regression-tested (`scripts/check-agent-rules.js`).
- This file (`WORK_IN_PROGRESS.md`) losing either the old desktop-ai-policy required sections or the newer continuity fields — both are now machine-checked (`scripts/check-desktop-ai-protocol.js` and `scripts/check-agent-rules.js`).

## Exact patch / change plan
1. Widen `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`/`POSTHOG_HOST` to all Preview branches in Vercel — done.
2. Isolate Preview admin access from the production secret in `lib/env.js` — done, regression-tested.
3. Provision a dedicated Supabase preview/test project with the full schema, fix the `handle_new_user()` finding — done.
4. Audit login/me/logout/register/voxel/game for real admin-key necessity; remove it where not needed — done for login/me/logout; register/voxel/game confirmed genuinely admin-dependent.
5. Make PostHog config unified/hardcoded like Sentry's DSN instead of a Vercel-scoped secret — done; value itself still blank.
6. Get `DEFAULT_POSTHOG_KEY` and `SUPABASE_PREVIEW_SECRET_KEY` set — **open, see Blockers**.
7. Full live HTTP verification of register/voxel/game + PostHog EU live events once #6 lands.
8. `release:gate` clean on this branch — **done**.

## Tests to run
- `node --test` (136/136 as of this update)
- `node scripts/check-js.js`
- `node scripts/check-posthog-runtime.js`
- `node scripts/check-agent-rules.js`
- `node scripts/check-desktop-ai-protocol.js` (via `npm run desktop-ai:check`, first step of `release:gate`)
- `npm run release:gate` — **PASS**, full chain, run end to end after the WORK_IN_PROGRESS.md structure fix
- New regression suites added this task: `test/posthog-config.test.js`, `test/preview-secret-isolation.test.js`, `test/supabase-security-definer-rpc-exposure.test.js`, `test/auth-endpoints-no-admin-key.test.js` (plus `test/api-router-dispatch.test.js`/`test/vercel-function-limit.test.js` from the related PR #11)

## Deployment / PR plan
1. Commit to `ai/claude/safe-parallel-20260826` (own worktree, not master) — ongoing.
2. Push, PR #12 stays open against `master`, updated after each substantive step.
3. Vercel auto-deploys Preview per push; verify `/api/config` + login/me/logout + (once unblocked) register/voxel/game + PostHog live events on each meaningful deploy.
4. Do not merge until `mergeSafe: true` — full gates pass, live verification passes, no open blocker.

## Current progress
Public Preview config, Preview/production secret isolation, login/me/logout live-verified, PostHog architecture unified, real security bug found+fixed, `release:gate` clean PASS — all done and pushed. Two items open: `DEFAULT_POSTHOG_KEY` and `SUPABASE_PREVIEW_SECRET_KEY` values, both genuinely unobtainable through any tool available in this session (see Blockers). Everything not dependent on those two values is complete and verified.

## Blockers
1. **`DEFAULT_POSTHOG_KEY` (or `POSTHOG_KEY` env var) has no real value yet.** Checked every available avenue: production's live `/api/config` doesn't emit it (this PR isn't merged); no authenticated browser session for app.posthog.com/eu.posthog.com exists here (reached the login form, no stored credentials, did not attempt to sign in); `vercel env pull` redacts the value to a placeholder before it can be read, a platform-level control. Needs a human to paste the real `phc_...` value into `lib/env.js`'s `DEFAULT_POSTHOG_KEY` (or set it as a Vercel env var, either now works identically).
2. **`SUPABASE_PREVIEW_SECRET_KEY` has no real value.** The connected Supabase MCP has no tool that returns a service-role/secret key for any project — including `world-server-preview`, created by this session itself — by design, the same category of platform boundary as #1. Needs a human to copy it from Supabase Dashboard → world-server-preview → Project Settings → API Keys → `service_role`/`secret` key into Vercel as `SUPABASE_PREVIEW_SECRET_KEY` (Preview scope).

Both are the same shape of blocker: a credential this session is structurally prevented from reading through any available tool, not a step skipped for convenience. Everything not dependent on these two values has been implemented, tested, and live-verified.

## Next action
Once a human sets `DEFAULT_POSTHOG_KEY` and `SUPABASE_PREVIEW_SECRET_KEY`: redeploy PR #12's Preview, verify register/voxel/game over real HTTP against the preview Supabase project, open the Preview in a browser and confirm PostHog events reach `https://eu.i.posthog.com` at the network level, re-run `release:gate` clean, then reassess `mergeSafe`.

## Completion criteria
- `/api/config`, login, me, logout: PASS (done, live-verified).
- register, voxel, game over real HTTP: PASS (blocked on `SUPABASE_PREVIEW_SECRET_KEY`).
- PostHog EU live events: PASS (blocked on `DEFAULT_POSTHOG_KEY`).
- `release:gate`: clean PASS — **done**.
- No regression in Sentry, the Vercel Hobby function-count limit (PR #11), or production secret isolation.
- `mergeSafe: true` only once every item above is true.

## Final evidence
Not completed. Live-verified so far: `/api/config` 200 with correct shape (curl against deployed Preview `dpl_A1WFyfwNZmzkbuqh6BG5tgJNyB1c`), `/api/login` 401 on bad credentials (real Supabase auth round-trip, not a crash), `/api/me` 200 `{"user":null}`, `/api/logout` 200 `{"ok":true}`. 136/136 unit/regression tests pass. `handle_new_user()` RPC-exposure fix confirmed via `get_advisors` (WARN cleared). Full evidence pending the two blocked items above.
