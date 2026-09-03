# AI Studio build/deploy instruction — SANDBOX SLOT V6

Use the same existing World_server/Navigator engines, assets and shared backend. Sandbox is an independent test node, not a reduced fork.

Requirements:
1. Start via `node google-ai-studio/cloudrun-entry.cjs`.
2. Environment:
   - `WORLD_SLOT=sandbox`
   - `WORLD_SLOT_ENTRYPOINT=<existing safe test route>`
   - `WORLD_BUILD_SHA=<git commit>`
3. Experimental behavior must use existing feature flags/control plane.
4. Preserve/improve graphics, physics, animation, lighting, textures, audio and optimization.
5. Keep health/readiness/meta/runtime-budget/cross-platform endpoints public and healthy.
6. Durable state remains in Supabase/shared services.
7. This is the second and final active app. Never create a third slot.
8. Sandbox may enable `WORLD_ENABLE_SANDBOX_FAULTS=1` only for controlled tests; never copy that setting to Navigator.
9. Run the same replay/device matrix as production/reference and shared-world parity when configured.
10. Promotion is blocked until evidence is green; a failed candidate remains in sandbox and must not replace Navigator.
11. On failures, fix root cause, add regression test/known issue, redeploy the same sandbox slot and rerun.

Do not report sandbox ready until repository live/browser gates pass.

## V4 global community requirements
12. Run the same 11-locale UI and multiplayer-chat translation code as Navigator; do not maintain a separate translation fork.
13. Exercise Arabic RTL, EN/DE/ES/JA/KO/ZH/PT-BR/RU chat combinations and translation-provider failure fallback.
14. Test anonymous guest join, private-channel denial for non-members, reconnect and sequence-dedupe before promotion.
15. Run feedback submission/triage with synthetic test records marked clearly as sandbox evidence and clean them up according to project policy.
16. Use built-in sandbox faults first; use Toxiproxy only for network-layer failure modes not already covered.
17. Keep W3C trace context/correlation evidence so a failed user report can be tied to the exact build/session/runtime where possible.


## V4 community/feedback/multiplayer requirements
- Reuse the V4 durable chat + private Broadcast Replay + offline outbox; do not create a second chat transport.
- Prefer the versioned binary player-state codec when supported and retain JSON fallback.
- Keep adaptive tick/interest decisions separate from durable authority; client validation is never authoritative anti-cheat.
- Use per-world approved glossary terms and review-gated translation corrections; pending corrections must not affect other users.
- Voice translation uses only server-minted constrained ephemeral Gemini tokens. Never expose `GEMINI_API_KEY`.
- WebRTC mesh is only for very small rooms and must honor the configured peer cap; larger rooms remain NOT READY until an SFU + TURN path is verified.
- Feedback semantic clustering/votes/cohorts may generate an experiment plan, but must reuse existing feature flags/experiment systems and never auto-enable or auto-promote production.
- Preserve private raw feedback; public roadmap text requires explicit public-consent-safe title generation.
- Keep all `realtime` schema objects untouched except supported reviewed RLS policies. Durable chat may call existing `realtime.send()` from the non-exposed trigger adapter.


## V5: Google learning + safe function delivery + Game Design Spec
- Keep this app linked to the canonical GitHub source using Google AI Studio **two-way sync**. Do not fork a parallel source of truth.
- There are exactly two permanent AI Studio apps/slots: `navigator` and `sandbox`. Never create a third app/slot.
- Every deployment creates/uses an immutable Cloud Run revision. New code/functions are delivered as a new revision, never by downloading/evaluating code at runtime.
- Emit privacy-minimized structured runtime signals from `cloudrun-entry.cjs`; never log chat bodies, feedback bodies, tokens or secrets.
- Feed Google runtime evidence into `world:google:learning`, then into Game Design Spec candidates and existing root-cause/regression/replay systems.
- Every new capability must have a versioned function manifest, capability allowlist, static audit, Game Design Spec justification, derived acceptance tests and sandbox proof.
- Update the machine-readable **Game Design Spec** when player experience/rules change. Conversation can create a draft; only evidence-backed release flow can make it stable.
- Sandbox must pass `world:v5:gate` before Navigator promotion. Navigator uses gradual canary/last-green rollback when Cloud Run revision traffic control is available.

## V6: production evidence, provenance, authority and scale
- Preserve the V6 top-level structured log field `event="world_runtime_signal"` and Google Trace correlation. Never log chat/feedback bodies or secrets.
- Use canonical GitHub code + immutable Cloud Run revisions. Function enable/rollout is separate from code deployment; no arbitrary runtime JS/eval.
- Reuse the existing World_server SBOM/signing/release-promotion/feature-flag systems and the V6 provenance bundle.
- Run GDD → capability planner before adding a new subsystem. Prefer strengthening an existing capability.
- Keep future untrusted extensions in the existing WIT/Wasmtime safety tier; do not execute them in the main Node process.
- Preserve server-authoritative input-intent rules and AOI. Never let a browser become the authoritative world source.
- Keep shared distributed write limits for chat/GDD/votes/function admin/token minting.
- Small voice rooms may use WebRTC mesh; large rooms require verified SFU/TURN or must fall back to text. Never expose LiveKit API secret.
- A feedback item is resolved only after post-release outcome evidence, not when code is deployed.
- `world:v6:gate` and honest live readiness must be green before broad Navigator promotion.
