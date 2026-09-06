# Google Cloud Run deployment — world-navigator / world-sandbox

Target GCP project (user-confirmed): `gen-lang-client-0576616033` ("Gemini Project").
Source: branch `ai/desktop/google-ai-studio-v6-slots` of `mpaykin1/World_server`
(real Navigator source `apps/dark-void-scene/`, merged and verified end-to-end
locally — see this branch's commit history). Exactly two Cloud Run services,
one codebase, one Supabase project (`xlcdnlsyvxqtopmkweiy`, "world-server-preview").
No third slot, no separate cut-down Google-only game.

## Build

- Dockerfile: `google-ai-studio/Dockerfile` (repo root as build context — it
  does `COPY . .`, so the Cloud Build trigger's build context must be `/`,
  not a subdirectory).
- The image uses Node 24 (matching `package.json`) and `npm ci --omit=dev`.
  The root `.dockerignore` excludes host dependencies, Git metadata, local
  credentials and reproducible runtime output. Keep package-lock.json committed.
- No build step beyond `npm ci` implied by the image; the app is served
  directly by `node google-ai-studio/cloudrun-entry.cjs` (the `CMD`).
- Cloud Run port: **8080**, read from the `PORT` env var Cloud Run injects
  automatically (`cloudrun-entry.cjs` already does
  `Number(process.env.PORT || 8080)` — do not hardcode a different port in
  the service config; Cloud Run's own port field controls this).

## Navigator entrypoint

`cloudrun-entry.cjs` spawns the full `server.js` app internally and proxies
external traffic to it, redirecting `/` to a configurable entrypoint path.
For both slots that entrypoint is the real Navigator app:

- Navigator: `WORLD_NAVIGATOR_ENTRYPOINT=/apps/dark-void-scene/`
- Sandbox: `WORLD_SANDBOX_ENTRYPOINT=/apps/dark-void-scene/`

(Leaving these unset falls back to `/apps/catalog/`, which is what the
disconnected AI Studio "World_server" master-snapshot import currently shows —
not what we want for either real slot.)

## Health / readiness endpoints

- `GET /healthz` — liveness. Returns `{ok, ...deploymentMeta()}`; `ok:false`
  (HTTP 503) once the child process has exited. Use this for Cloud Run's
  liveness probe. Startup must use `/readyz` so traffic cannot arrive before
  the selected application is available; HTTP 4xx/5xx fail readiness.
- `GET /readyz` — readiness. Actively probes the internal child server at the
  configured entrypoint; `ok:false`/503 until the real app responds.
- `GET /api/deployment-meta` — full revision/slot/entrypoint/independence
  metadata (service, revision, configuration, slot, buildSha, independent,
  childReady, runtimeBudget). Useful for confirming a deploy actually landed
  the right slot/entrypoint after promotion.
- `GET /api/runtime-budget` — RSS/heap vs `WORLD_MAX_RSS_MB`/`WORLD_MAX_HEAP_MB`.
- `GET /api/cross-platform-probe` — cheap liveness probe with a random nonce,
  usable for uptime checks that shouldn't hit `/healthz` at high frequency.

Live-verified locally (see commit `639ea8d8`): both `/` and
`/apps/dark-void-scene/` return 200 through this exact wrapper with
`WORLD_SLOT=navigator`, real scene renders, zero console errors, both mobile
joysticks work.

## Environment variables

Generated via the existing `scripts/google-ai-studio-slots.cjs env-contract`
command (this project's own authoritative contract, not invented here):

| Variable | navigator | sandbox | Secret? | Source |
|---|---|---|---|---|
| `WORLD_SLOT` | `navigator` | `sandbox` | no | literal |
| `WORLD_NAVIGATOR_ENTRYPOINT` | `/apps/dark-void-scene/` | — | no | literal |
| `WORLD_SANDBOX_ENTRYPOINT` | — | `/apps/dark-void-scene/` | no | literal |
| `SUPABASE_URL` | `https://xlcdnlsyvxqtopmkweiy.supabase.co` | same | no | literal (public) |
| `SUPABASE_PUBLISHABLE_KEY` | required | required | no (designed public) | Supabase Dashboard → Settings → API → "anon" / "publishable" key |
| `SUPABASE_SECRET_KEY` | required | required | **yes** | Supabase Dashboard → Settings → API → "service_role" key — **Secret Manager only, never a plain env value** |
| `GEMINI_API_KEY` | required for translation | required | **yes** | your existing Google AI Studio / Gemini API key — Secret Manager |
| `WORLD_MAX_RSS_MB` / `WORLD_MAX_HEAP_MB` | `1024` / `768` (defaults) | same | no | literal, tune later under load |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | optional | optional | **yes** (key/secret) | only if enabling large-room voice SFU; omitted = correct text/mesh fallback, not a failure |
| `WORLD_ENABLE_SANDBOX_FAULTS` | **never** (code refuses this on navigator, exits 66) | `0` normally, `1` only during an explicit fault-injection test | no | literal |

`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` are the same values already
shipped to the browser on Vercel today (anon key is designed to be public) -
safe as plain env vars. `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` must go
through Cloud Run's Secret Manager integration (`--set-secrets` / the
Console's "Reference a secret" env var type), never plain text - matching
this project's own "no server secret exposed to browsers" rule, and Cloud
Run's own audit trail for secret access.

Full machine-checkable contract: `node scripts/google-ai-studio-slots.cjs env-contract`
(never emits values, only presence/absence - safe to run anytime).

## Deployment manifests

`google-ai-studio/cloudrun-service-navigator.yaml` and
`cloudrun-service-sandbox.yaml` — declarative Knative-format service specs
for later `gcloud run services replace` / infra-as-code use. For the first
deploy via Cloud Console, use these as the checklist for what to fill into
the "Deploy container" → "Continuously deploy from a repository" form
(source repo `mpaykin1/World_server`, branch
`ai/desktop/google-ai-studio-v6-slots`, build context `/`, Dockerfile
`google-ai-studio/Dockerfile`, port `8080`, then the env vars/secrets table
above).

## Sandbox → tests → Navigator promotion path (already implemented, not new)

This project already has the promotion/rollback machinery from V6 - it does
not need to be built, only used in order:

1. Deploy/update **sandbox** first, always. Never deploy directly to navigator.
2. `npm run world:v6:gate` and the browser/device/multiplayer/i18n checks in
   `DESKTOP_AI_INSTALL_AND_VERIFY.md` Phase I against the real sandbox
   `.run.app` URL.
3. `node scripts/google-ai-studio-slots.cjs promotion-gate` - reuse-first
   gate that checks sandbox is verified green and reference-comparable
   before allowing promotion. Currently `BLOCK_PROMOTION` (no sandbox
   deployed yet, no verify report) - expected until step 1-2 happen for
   real. Never creates a third slot (`neverCreateThirdSlot: true`, checked
   in the tool's own output).
4. Only after `promotion-gate` returns `ok:true`: update the **existing**
   navigator service with the same image/revision that passed sandbox -
   this is what "update, don't recreate" means in practice.

## Rollback / last-green

`node scripts/google-ai-studio-slots.cjs rollback-plan` and
`npm run world:google:rollback` (dry-run by default; `world:google:rollback:apply`
requires `WORLD_ALLOW_GOOGLE_TRAFFIC_WRITE=1` plus real evidence rollback is
needed - see `scripts/world-google-rollback-controller.cjs`). Record a known
good revision only after real evidence is green - `WORLD_GOOGLE_LAST_GREEN_REVISION`
or the local last-green evidence file, per `DESKTOP_AI_INSTALL_AND_VERIFY.md`
Phase J. Staged traffic rollout (1% -> 5% -> 25% -> 50% -> 100%) with
health/replay/feedback checks between stages - never a silent full traffic
cut to Navigator.

## What is intentionally NOT here yet

Real Google-side evidence (Cloud Logging/Monitoring/Trace, actual `.run.app`
URLs, live multiplayer/voice/i18n verification) cannot exist before the
first real deploy - this document prepares everything reachable without
Cloud Console access; the actual `Deploy container` click is the user's
action (see chat for the current specific one-action ask).
