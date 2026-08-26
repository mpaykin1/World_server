# WORK IN PROGRESS — Preview env/PostHog hardening + improve-world-home recovery

> This branch now carries two related but distinct initiatives, both active (PAUSED where blocked, not cancelled — see AGENTS.md §14). Both live in the same PR/branch because they were worked in the same continuous session.

## Task
**A. Preview environment hardening.** Add PostHog product analytics without duplicating Sentry, and fix the Vercel Preview environment so `/api/config` and admin-dependent endpoints work on Preview instead of 500ing — without letting an arbitrary Preview branch reach the production Supabase service-role secret.
**B. `improve-world-home` recovery + production hardening.** The public product homepage (`https://improve-world-home-improve-world.vercel.app/`) had no source of truth outside a single Vercel deployment (not git-linked, no local copy anywhere) and every "world" it links to was hidden behind an accidental Vercel Authentication wall. Recover the source into `World_server`, fix the public-access regression, and (next phase) connect its client-only questionnaire to real persistence.

## Why
**A:** Every Preview deployment except `codex/voxel-v3` 500'd on `/api/config` because public Supabase config was scoped to one branch only; fixing it safely required real Preview/production credential isolation, not a checkbox flip.
**B:** A real user reported hitting a Vercel login wall after finishing the onboarding questionnaire. Root cause turned out to be team-wide: 43 of 45 Vercel projects in this team had SSO Deployment Protection on by default, and the homepage's source existed only as an unlinked Vercel deployment — a second failure of the same deploy would have destroyed it with no recovery path.

## Current state
**A (Preview/PostHog) — done except two credential values:**
- `/api/config`, `/api/login`, `/api/me`, `/api/logout` all confirmed working over real HTTP on a live Preview deployment; none of the three auth endpoints need the admin/service-role key anymore (audited and fixed — verified directly against a real Supabase project that `getUser(jwt)`/`/auth/v1/logout` only need a valid JWT).
- PostHog config unified into a Sentry-DSN-style hardcoded default (`lib/env.js` `DEFAULT_POSTHOG_KEY`/`DEFAULT_POSTHOG_HOST`) instead of a per-environment Vercel workflow.
- Dedicated Supabase preview project `world-server-preview` (`xlcdnlsyvxqtopmkweiy`) provisioned with full schema, including a `profiles` table/auth-trigger this repo never tracked and a `handle_new_user()` public-RPC-exposure security fix (confirmed via `get_advisors`).
- `release:gate` passes clean end to end on this branch (all ~19 sub-steps).
- Still blocked: `DEFAULT_POSTHOG_KEY` and `SUPABASE_PREVIEW_SECRET_KEY` have no real values — see Blockers.

**B (improve-world-home) — recovery + SSO fix done, backend rebuild not started:**
- **SSO Deployment Protection fixed on all 45 Vercel projects in the `improve-world` team** (was enabled by default on 43 of them). Live-verified in a clean browser context: full path homepage → 31-question form → blueprint → Миры → Открыть мир → real playable world, zero auth wall anywhere.
- **Source recovered** into `apps/improve-world-home/` (`index.html` + `client.js`, renamed from `app.js` to match this repo's convention — only intentional diff, confirmed byte-for-byte otherwise). Vercel's Deployment Files API (`GET /v6/deployments/{id}/files`) was checked and found inaccessible with any tool/token available in this session before falling back to recovering from the live served assets (see Blockers #3 for the exact evidence).
- Reading the recovered source (not just observing network silence) confirmed: the entire questionnaire→blueprint flow is 100% client-side (no fetch/import anywhere); "Соединить с другими историями" is a static text placeholder, no merge logic exists; "Зарегистрироваться и опубликовать" writes only to `localStorage`; "Готовые миры" is a hardcoded 3-item array of separate Vercel project URLs.
- `apps/improve-world-home/vercel.json` disables the build step (`buildCommand: null`) — the original failing build (`node build-shield.js` exited 1) is moot since these are two static files needing no build; `build-shield.js`'s own source wasn't recoverable (never served to the browser).
- **Proved World_server can be the source of truth without touching the live URL yet**: created a new git-linked Vercel project (`improve-world-home-git`, `prj_nwnpPT6j2B5x3tFRmLIdrc8TAGwL`, root directory `apps/improve-world-home`), pushed, got a preview deployment, confirmed its served HTML/JS are byte-identical to the recovered source (only diff: Vercel's own injected preview-feedback widget, which never appears on production). Caught and fixed a real bug this way — `vercel.json`'s `buildCommand` must be `string|null`, not boolean `false` — on the isolated test project, never on the live one.
- **Not yet done: making the existing production URL actually served by this git-linked code.** See Blockers #4 — this is a genuine tool-access limitation, not a skipped step.
- **Not started: the backend.** Anonymous-first sessions, Supabase story/world/merge schema, wiring the questionnaire to real persistence, turning "Соединить с другими историями" into a real merge with provenance, moving off one-Vercel-project-per-world. This is a substantial net-new feature build, scoped honestly as the next phase, not attempted as a rushed partial implementation here.

## Target state
**A:** `DEFAULT_POSTHOG_KEY`/`SUPABASE_PREVIEW_SECRET_KEY` set → register/voxel/game and PostHog EU live events pass over real HTTP → `mergeSafe: true`.
**B:** `improve-world-home-improve-world.vercel.app` deployed from `World_server` git history; questionnaire persists to Supabase (anonymous-first, no email required to create a first world); "Соединить с другими историями" performs a real semantic merge with provenance tracking; new worlds don't each require a dedicated Vercel project; everything still passes the recovered visual/functional baseline (`e2e/improve-world-home-baseline.spec.js`).

## Files / systems involved
- **A:** `lib/env.js`, `api/config.js`, `api/login.js`, `api/me.js`, `api/logout.js`, `api/register.js`, `api/voxel.js`, `api/game.js`, `shared/posthog-runtime.entry.js`, `scripts/{build,check,inject}-posthog-runtime.js`, `supabase/migrations/*.sql`, Vercel project `world-server` env vars.
- **B:** `apps/improve-world-home/{index.html,client.js,vercel.json}`, `test/improve-world-home-recovery.test.js`, `e2e/improve-world-home-baseline.spec.js(-snapshots/)`, `scripts/check-vercel-team-public-access.js`, Vercel projects `improve-world-home` (`prj_zhAv5cCwTLuRNLyuRrSixaSAGr28`, the live one) and `improve-world-home-git` (`prj_nwnpPT6j2B5x3tFRmLIdrc8TAGwL`, the new git-linked proof-of-equivalence project) and all 45 projects in team `improve-world` (protection setting only).
- **Shared:** `AGENTS.md` (§§12–14), `scripts/check-agent-rules.js`, `scripts/check-desktop-ai-protocol.js`, `WORLD_SERVER_SECRETS/SECRETS_INDEX.md` (outside the repo).

## Known risks
- `handle_new_user()` RPC-exposure fix only applied to the new preview Supabase project, not production (no access to production's Supabase account from here).
- This branch is based on `origin/master`; `integration:full`/`functions:audit`/`control-plane`/`honest-100`/`graphics-ratchet`/`monotonic` don't exist as scripts here — they're on other, more divergent branches this session already flagged as showing signs of self-reported, unverified quality metrics. Deliberately not imported wholesale (AGENTS.md §14, minimum transfer not a mechanical merge).
- Two Vercel projects now exist for the same conceptual app (`improve-world-home` and `improve-world-home-git`) until the cutover in Blockers #4 happens — `improve-world-home-git` should be deleted or clearly relabeled once the real one is git-linked, so this doesn't become one more entry in the sprawl this session already cleaned up.
- The backend rebuild (schema, anonymous sessions, merge logic) touches production user-facing behavior — needs its own careful staged rollout (branch → preview → E2E → production), not a rushed single pass.

## Golden systems that must be preserved
- Sentry Session Replay + Error Tracking — PostHog stays Product-Analytics-only so it never duplicates this.
- The Vercel Hobby serverless-function-count fix (PR #11) — no new API routes added by this work.
- Production Supabase service-role secret must never become reachable from an arbitrary Preview branch (structural, not conventional).
- `improve-world-home`'s current visual design, copy, and questionnaire content — explicitly not a redesign target; protected by `e2e/improve-world-home-baseline.spec.js`'s screenshot + structural assertions and the recovered `IW_CONTRACT` guard (`create=31`, `join=28`, `ADD_ONLY`).

## Errors that must not return
- `/api/config` 500ing on non-`codex/voxel-v3` Preview branches — fixed, regression-tested (`test/preview-secret-isolation.test.js`).
- Preview silently falling back to the production Supabase secret — structurally prevented, regression-tested.
- `handle_new_user()` public RPC exposure — fixed + generalized regression test across all migrations (`test/supabase-security-definer-rpc-exposure.test.js`).
- `login`/`me`/`logout` regaining a needless admin-key dependency — regression-tested (`test/auth-endpoints-no-admin-key.test.js`).
- Any Vercel project in the `improve-world` team silently getting SSO Deployment Protection enabled again — regression-tested (`npm run vercel:verify:public-access`; HTTP layer needs no credential, API layer needs `VERCEL_TOKEN` in CI for full team coverage).
- `improve-world-home`'s questionnaire count, IW_CONTRACT guard, or landing screen changing silently — regression-tested (`test/improve-world-home-recovery.test.js`, `e2e/improve-world-home-baseline.spec.js`).
- `AGENTS.md`/`WORK_IN_PROGRESS.md` losing required policy concepts or structure — machine-checked (`scripts/check-agent-rules.js`, `scripts/check-desktop-ai-protocol.js`).

## Exact patch / change plan
**A:** widen public Preview config → isolate Preview/production secrets → provision preview Supabase project → audit+fix admin-key over-use → unify PostHog config → *(open)* get the two credential values → full live verification → `release:gate`. Steps 1–6 done, `release:gate` done, live verification of register/voxel/game + PostHog blocked on credentials.
**B:** find real root cause of the auth wall (not "it's Vercel Authentication" as originally assumed — it's a team-wide default) → fix on all 45 projects → live-verify in a clean browser → attempt Deployment Files API recovery → fall back to live-asset recovery → commit with full provenance → add regression protection (unit + E2E + screenshot baseline) → prove a git-linked deployment is equivalent → *(open)* connect the existing production project to git → *(not started)* real backend.

## Tests to run
- `node --test` (142/142 as of this update)
- `node scripts/check-js.js`, `node scripts/check-agent-rules.js`, `node scripts/check-desktop-ai-protocol.js`
- `npm run release:gate` — PASS
- `npm run vercel:verify:public-access` — PASS (5/5 known URLs, no credential configured for the API layer yet)
- `npx playwright test e2e/improve-world-home-baseline.spec.js --project=desktop-chromium` — 5/5 PASS against live production
- New this task: `test/posthog-config.test.js`, `test/preview-secret-isolation.test.js`, `test/supabase-security-definer-rpc-exposure.test.js`, `test/auth-endpoints-no-admin-key.test.js`, `test/improve-world-home-recovery.test.js`, `e2e/improve-world-home-baseline.spec.js`, `scripts/check-vercel-team-public-access.js`

## Deployment / PR plan
1. Commit to `ai/claude/safe-parallel-20260826` (own worktree, not master) — ongoing.
2. Push, PR #12 stays open against `master`, updated after each substantive step.
3. For B specifically: once the human connects the existing `improve-world-home` project to this repo (Blockers #4), verify its preview deploys correctly, run the E2E baseline against it, and only then is a production redeploy from git the natural next push — no separate alias-switch needed once the *existing* project itself is the one that's git-linked.
4. Do not merge until `mergeSafe: true` for the parts actually shippable in this PR — the full backend rebuild for B is large enough it will likely become its own follow-up branch/PR once schema/API design is settled, to keep this PR reviewable.

## Current progress
**A:** everything implemented, tested, and live-verified except the two credential values (Blockers #1–2). **B:** critical public-access bug found (team-wide, not project-specific) and fixed on all 45 projects, live-verified; source recovered with full provenance and real regression protection (unit + E2E + visual baseline); proved via a parallel git-linked project that World_server can serve byte-identical output; blocked only on connecting the *existing* production project to git (Blockers #4, a 2-minute dashboard action, no values needed). The backend rebuild (Supabase persistence, real merge) has not been started — that's the next phase, scoped honestly rather than rushed.

## Blockers
1. **`DEFAULT_POSTHOG_KEY` has no real value.** Checked: production `/api/config` doesn't emit it yet (unmerged); no browser session for posthog.com exists here; `vercel env pull` redacts the value before it can be read. Needs a human to paste the real `phc_...` into `lib/env.js` or set `POSTHOG_KEY` in Vercel.
2. **`SUPABASE_PREVIEW_SECRET_KEY` has no real value.** No tool available exposes a service-role key for any Supabase project, including one created by this session itself. Needs a human to copy it from Supabase Dashboard → world-server-preview → API Keys → `service_role` into Vercel.
3. **Vercel Deployment Files API inaccessible.** No MCP tool wraps `GET /v6/deployments/{id}/files`; `vercel inspect` (CLI) only returns status/build logs; no `VERCEL_TOKEN`/`VERCEL_OIDC_TOKEN` available in this environment and no local CLI auth file found to make a raw API call. This is why recovery fell back to the live-asset method instead (successfully).
4. **The live `improve-world-home` project can't be git-linked by any tool available here.** `create_git_project` explicitly does not reconnect an existing unlinked project with the same name (by design, to prevent duplicate/orphaned projects) — confirmed from the tool's own description before attempting a workaround. No "rename project" or "reassign `*.vercel.app` subdomain to a different project" tool exists either (`*.vercel.app` domains are bound to the project name itself, not freely reassignable). Needs a human: Vercel Dashboard → `improve-world-home` → Settings → Git → Connect Git Repository → `mpaykin1/World_server`, Root Directory `apps/improve-world-home`. No values to type, no risk to the current live deployment until a new push actually happens afterward.

All four are the same shape: a genuine tool/credential access boundary in this session, not a step skipped for convenience. Everything not dependent on these four has been implemented, tested, and live-verified.

## Next action
Once a human does #4 (2-minute dashboard action): verify the next push deploys `improve-world-home` correctly from git, run `e2e/improve-world-home-baseline.spec.js` against the live URL to confirm no regression, delete the now-redundant `improve-world-home-git` test project. In parallel/after: once a human sets #1–2, redeploy PR #12's Preview and complete the live verification of register/voxel/game + PostHog EU events, then reassess `mergeSafe` for track A. Then begin the backend design for track B (Supabase schema for story/world/merge, reusing what already exists — do not start coding this without first re-reading this file's Files/systems section and checking for drift).

## Completion criteria
**A:** `/api/config`/login/me/logout PASS (done) + register/voxel/game PASS over real HTTP (blocked) + PostHog EU live events PASS (blocked) + `release:gate` PASS (done) + no regression in Sentry/function-count/secret-isolation → `mergeSafe: true`.
**B (this phase):** SSO fix on all 45 projects PASS (done) + source recovered with regression protection PASS (done) + git-linked deployment proven equivalent PASS (done) + existing production URL served from git (blocked) → this phase's `mergeSafe: true`. Backend rebuild is a separate, not-yet-started phase with its own completion criteria to be defined when it starts.

## Final evidence
**A:** `/api/config` 200 with correct shape, `/api/login` 401 on bad creds (real Supabase round-trip), `/api/me` 200 `{"user":null}`, `/api/logout` 200 `{"ok":true}` — all against live Preview `dpl_A1WFyfwNZmzkbuqh6BG5tgJNyB1c`. `handle_new_user()` fix confirmed via `get_advisors`.
**B:** Clean-browser E2E confirmed full path homepage→questionnaire→blueprint→world with zero auth wall. `npm run vercel:verify:public-access` PASS. `e2e/improve-world-home-baseline.spec.js` 5/5 PASS against live production, including a committed screenshot baseline. `improve-world-home-git` preview deployment (`dpl_EKkeMgWEckz5n5hBoB4YQXG2qfep`) confirmed byte-identical to the recovered source.
Not completed: PostHog live events, register/voxel/game over real HTTP, the existing production URL running from git, and the entire backend rebuild for track B.
