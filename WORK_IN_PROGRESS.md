# WORK IN PROGRESS — Roblox Bridge v3 + Google Cloud Run

## Task
Connect `World_server` to Roblox as an additional authoritative client through a versioned `/api/roblox/*` contract, and make the existing Node server safely deployable to Google Cloud Run without replacing or breaking the current Vercel runtime.

## Why
The Roblox `.rbxlx` bridge now has a tested v3 client contract (WorldSpec, chunks, delta sync, authoritative actions, replay, NPC channel, telemetry, Cloud Run failover). The repository needs matching server endpoints and a Cloud Run-ready container/runtime so Studio and published Roblox servers can consume the same World Server state.

## Current state
- Branch: `ai/chatgpt/roblox-cloud-run-v3`, created from current `master`; no direct master edits.
- Existing Vercel/API/static behavior is the accepted production path and must remain intact.
- `server.js` already reads `process.env.PORT`, but does not explicitly bind `0.0.0.0` and has no health/readiness or Roblox route.
- Existing deterministic `lib/game-rules.js::generateChunk()` is the canonical reusable chunk source for the first Roblox world bridge.
- Existing `lib/http.js` caps JSON request bodies at 64 KiB; replay/event batching must respect that cap.
- The generated Roblox v3 client/test stand is external to this repository and currently reports 143/143 static/contract/fault-injection/behavior-mirror checks PASS; actual Roblox Studio runtime remains a separate final gate.

## Target state
- One backwards-compatible Roblox API handler supports handshake, initial world, chunk, delta, authoritative action, event, replay, NPC and telemetry subroutes.
- Roblox data reuses existing world/game rules rather than creating a duplicate persistence/gameplay stack.
- `server.js` works on Cloud Run by binding the injected `PORT` on `0.0.0.0`, exposes `/healthz` and `/readyz`, and preserves all existing routes.
- A root Dockerfile and `.dockerignore` support Cloud Run source/container builds.
- A GitHub Actions Cloud Run workflow uses OIDC/Workload Identity Federation variables only; no service-account JSON key or cloud secret is committed.
- Existing Vercel behavior, public APIs, Golden systems, release registry, Supabase contracts and app runtime are preserved.

## Files / systems involved
- `WORK_IN_PROGRESS.md`
- `lib/roblox-bridge.js` (new pure bridge/domain logic)
- `api/roblox.js` (new single Vercel/API multiplexer)
- `server.js`
- `Dockerfile` (new)
- `.dockerignore` (new)
- `.github/workflows/cloud-run.yml` (new, manual until GCP federation variables exist)
- `docs/ROBLOX_CLOUD_RUN.md` (new)
- `test/roblox-bridge.test.js` (new)
- `test/server-entrypoint.test.js` (health/Roblox HTTP regressions)

## Known risks
- Do not exceed Vercel Hobby serverless-function count; use one `api/roblox.js`, not one function per Roblox subroute.
- Do not persist replay/events in a second datastore. Initial implementation validates/acknowledges them; durable shared persistence must reuse the accepted Supabase/World Server data plane later.
- Do not claim an AI NPC model is live until a real model/provider is wired; v3 only defines the channel and deterministic safe replies.
- Do not claim Cloud Run deployed until authenticated GCP deployment and external HTTP smoke actually succeed.
- Roblox runtime execution is not proven by static `.rbxlx` tests; Studio Play remains required.

## Golden systems that must be preserved
- Existing Vercel production/API routing and public URLs.
- Supabase as persistent shared state.
- `data/app-release-registry.json` deny-by-default publication.
- Shared Golden controls/physics/UI and existing apps.
- Existing `/api/apps`, `/api/worlds`, `/api/config`, auth, game, voxel and AI3D contracts.
- Cloud-first/low-impact rule; no heavy work or temporary checkouts on Desktop.

## Errors that must not return
- Replay payloads larger than the server's 64 KiB JSON limit.
- Trusting arbitrary Cloud Run redirect/base URLs from a handshake.
- Client-authoritative important gameplay actions.
- Unbounded chunk coordinates, event batches, replay batches or text fields.
- Duplicating world generation instead of reusing `generateChunk()`.
- Binding Cloud Run only to localhost or ignoring the injected `PORT`.
- Committing static GCP credentials/service-account JSON.
- Direct push/merge/deploy from this task branch without review/evidence.

## Exact patch / change plan
1. Add pure Roblox bridge contract/domain helpers reusing deterministic game rules.
2. Add one `/api/roblox/*` multiplexer with strict methods, sizes, allowlists and bounded acknowledgements.
3. Route Roblox + health/readiness through `server.js`; bind `PORT` on `0.0.0.0`.
4. Add Dockerfile/.dockerignore for Node 24 Cloud Run.
5. Add manual GitHub Actions Cloud Run deployment using `google-github-actions/auth@v3`, `setup-gcloud@v3` and Workload Identity Federation repository variables.
6. Add focused unit/API/server tests and run syntax/focused checks; rely on GitHub CI for full heavy repository gates.
7. Push branch and open a PR to `master`; do not auto-merge or deploy.

## Tests to run
- `node --test test/roblox-bridge.test.js`
- relevant server HTTP tests
- `node --check` for new/changed JS
- `npm run check` / repository CI
- `npm run desktop-ai:check`
- `npm run golden:check`
- Cloud Run workflow YAML structural review
- after authenticated deploy only: `/healthz`, `/readyz`, `/api/roblox/handshake`, `/api/roblox/world`, `/api/roblox/chunk` external HTTP smoke
- final Roblox Studio Play test with HTTP Requests enabled

## Deployment / PR plan
`ai/chatgpt/roblox-cloud-run-v3` -> PR -> normal CI/review -> only then Cloud Run manual deployment. Vercel remains unchanged. Cloud Run credentials are supplied through GitHub OIDC/Workload Identity Federation variables, never repository files.

## Current progress
- Isolated branch created.
- Existing server, package, API, game rules, quality contracts and project AI rules inspected.
- Roblox v3 client rebuilt from scratch in the current execution environment and hardened after the stand found a replay/server 64 KiB mismatch; replay now batches 40 events and authoritative interactions include player position.
- Roblox v3 stand: 143/143 PASS.
- Server-side implementation is next.

## Next action
Implement `lib/roblox-bridge.js` + `api/roblox.js`, focused tests, then Cloud Run runtime files and server routing. Fix every focused regression before opening the PR.

## Completion criteria
- Focused Roblox/server tests pass with no false-green assertions.
- Existing public API behavior is preserved.
- Cloud Run runtime contract is correct in code and CI configuration.
- Branch is pushed and PR opened with honest remaining blockers.
- No claim of production Cloud Run or Roblox-engine PASS without real external/runtime evidence.

## Final evidence
IN PROGRESS. Historical WIP entries prior to this active task remain preserved in Git history on `master` and earlier commits; this active WIP intentionally replaces the accumulated multi-task log on this isolated branch so current agents have one unambiguous task contract.
