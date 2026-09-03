# AI Studio build/deploy instruction — NAVIGATOR SLOT V6

Use the real imported/tracked Improve World / Navigator source. Do **not** redesign, simplify, proxy, or regenerate it.

Goal: update the one permanent public `navigator` slot.

Requirements:
1. Reuse existing code, assets, engines, APIs and Supabase/shared backend.
2. Start via `node google-ai-studio/cloudrun-entry.cjs`.
3. Environment:
   - `WORLD_SLOT=navigator`
   - `WORLD_SLOT_ENTRYPOINT=<actual tracked local Navigator route>`
   - `WORLD_BUILD_SHA=<git commit>`
4. Never set `WORLD_ENABLE_SANDBOX_FAULTS=1` here.
5. Preserve or improve current 3D/WebGL/voxel visuals, controls, animation, physics, lighting, textures, audio and performance. Never lower graphics to pass a gate.
6. Keep `/healthz`, `/readyz`, `/api/deployment-meta`, `/api/runtime-budget`, `/api/cross-platform-probe` public and healthy.
7. Public deployment must not require Google/Vercel login.
8. Durable state belongs to existing Supabase/shared services, never Cloud Run filesystem.
9. Never create a third active AI Studio app. Future releases update this same `navigator` slot.
10. Production Navigator must report `independent=true`. A remote bridge is migration-only and cannot pass promotion.
11. Preserve `x-world-correlation-id` propagation and security headers.
12. After deploy, record the final `https://*.run.app` URL and run repository live + browser + promotion gates.
13. If anything fails, fix root cause, add regression protection, update the same slot and rerun until PASS.

Do not report production success until `google:slots:verify`, browser parity, relevant multiplayer parity and promotion evidence are green.

## V4 global community requirements
14. Integrate the shared language runtime/switcher into the real Navigator source and localize interface chrome for the 11 supported locales; Arabic must pass RTL/mobile layout tests.
15. Mount the feedback widget and verify `/api/feedback` reaches the same Supabase-backed feedback/development evidence loop.
16. Multiplayer chat must preserve original messages and translate lazily per recipient through `/api/translate`; translation outages must never block chat.
17. Use private Supabase Realtime channels under the existing room-membership/authority model; Presence is not a movement transport.
18. Reuse recovered Godot/server multiplayer authority if found. Never create a second authoritative world.
19. Propagate W3C `traceparent` plus `x-world-correlation-id` through all server-side hops.
20. Do not claim global-community readiness until the live Supabase schema/RLS, guest auth, real Navigator UI integration and translation provider/fallback are verified.


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
