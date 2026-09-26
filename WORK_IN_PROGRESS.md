# 2026-09-24: Chain Reaction backend release evidence checklist

Task: publish a compact, auditable release checklist for the already implemented Chain Reaction backend without changing simulation, API, Supabase state, or Graphics-owned UI. Why: merged, deployed, and independently live-verified are different gates; PR #285/#286 must not be counted as release-ready from PRE evidence alone. Current state: master `142200812d3d57a1b79aaaba2af628168acc648e` contains both `resident-at-address` and atomic `game-state`; Ocean records the same master on canonical Cloudflare and Supabase `world-emergence` ACTIVE v14, bundle `345677bf2b2b8d6e3adc98956a6bd045a68768d26a49f0986abb8e3935e2fe3d`; no Fleet POST certificate for #285/#286 exists yet. Target: one source-controlled checklist that separates MERGED, DEPLOYED, and LIVE_VERIFIED and marks every missing proof `NOT_VERIFIED`. Files/systems: documentation only. Risks: treating preview/CI/PRE or unauthenticated 401 smoke as authenticated production proof, inheriting an older POST to a newer endpoint, or obscuring Graphics blockers. Preserve: one consequence engine, all server arithmetic/auth/CAS/privacy behavior, UI ownership, and existing automation count. Exact plan: record immutable candidate/integrated SHAs, cloud runs, Edge identity, prior live certificates, and explicit owner/TODO for the combined endpoint POST. Tests: Markdown evidence/link scan, `git diff --check`, agent rules, and documentation-only deployment-ignore check. PR plan: isolated branch and PR; no deploy, merge, Fleet POST, or UI edit by this task. Progress: evidence collected from PR #285/#286, ledger #80, and read-only Supabase function inventory; checklist is complete. Next action: publish the documentation-only PR and let CI validate the exact head. Completion: checklist committed and cloud handoff created. Final evidence: read-only Supabase inventory independently reports `world-emergence` ACTIVE v14 with the Ocean-recorded bundle; `git diff --check`, agent rules, exact evidence scan, scope check, and documentation-only Vercel quota guard PASS. No source/UI/deployment mutation and no duplicate Fleet POST.

---

# 2026-09-24: Atomic first-load game state and privacy-safe API projections

Integration update (fresh master `31029a07c0e80470bbc5d500e25f5c2202f2947f`): reconcile PR #286 with merged resident lookup #285 without changing the shared consequence engine or Graphics-owned UI. Exact patch: union both Node/Edge allowlists and read-only branches, preserve the six-field resident DTO in direct lookup and every full-world projection, retain current membership checks, optional read revision fence and zero-write `game-state`. Risks: silently dropping either action, re-exposing legacy resident/history fields, Node/Edge drift, changing CAS arithmetic, or treating an inconclusive model review as approval. Required proof: executed Node and Edge adapters, privacy injection, two-writer CAS/reconnect, 0-card degradation, resident lookup regressions, full cloud exact-head gates and genuine independent Fleet PRE. Ocean only after `READY_FOR_OCEAN=YES`; deployed Deno remains separate Fleet POST scope. Progress: two adapter conflicts resolved by explicit union; validation pending.

Independent PRE blocker and repair: exact head `4d123536` proved that merely allowlisting resident keys still leaked a private object placed inside allowed `id`/`name` fields. Both adapters now discard all stored resident values in public world projections and deterministically rebuild the directory through the one canonical engine from validated seed/house inputs, then project primitive six-field DTOs. Nested-taint regressions execute both Node and actual Edge adapters. The blocked head remains audit evidence; a fresh exact-head cloud and independent PRE cycle is mandatory.

Verification update (2026-09-24, source SHA `6fd2c5f4bd948beb5e2258e0102d93f582ddf514`): 55/55 targeted local checks passed, including four NEW executable Node 24 runs of the actual Supabase Edge TypeScript adapter (Node/Edge same-revision parity, tainted legacy resident/history redaction, revoked stale member and 0-card offers, strict stale-revision and two-writer CAS). `node scripts/check-js.js` and `node scripts/check-agent-rules.js` passed on a valid isolated review branch. Added permanent `test/chain-reaction-edge-runtime.test.mjs`; fresh exact-head cloud CI and real independent adversarial PRE are REQUIRED before Ocean integration. Claude local CLI was not logged in and OpenCode free reviewer stalled, so neither produced an independent verdict. Actual Deno/deployed Supabase Edge remains Fleet POST scope; no public-release claim.

Task: make Genie cards and persisted world one authenticated read-only `game-state` snapshot at one revision. Optional revision fence rejects stale readers; omitting the fence refreshes after multiplayer CAS. Also sanitize historic comments and actor IDs from history, preview, commit and tick response projections in the existing Node and Supabase Edge adapters. Scope: both adapters + focused tests; do not touch Graphics #278/#284 or engine #283. Risks: legacy privacy leaks, inconsistent adapters, overlarge independent-review diffs. Tests: focused API/Edge, full cloud CI and genuine independent reviewers at exact head; Fleet PRE; then Ocean integration/production Fleet POST, browser/mobile. Initial CI PASS but independent reviewers inconclusive on overlarge diff and upstream free quotas. Current action: compact self-contained tests/evidence to fit the conservative Cloudflare inference budget without relaxing the gate. Final evidence: current head pending exact CI and independent review.

---

# WORK IN PROGRESS — Scoped Task Compiler, resource scheduler, real native Godot pipeline

## Task
Catalog mobile panels, 2026-09-23.
## Why
Canary 35845450510 reports authBox=12.5% and chat=17.5% persistent mobile overlays.
## Current state
Catalog shell packs panels once, before async AppCore creates login/chat.
## Target state
Late login/chat panels live in the existing menu and keep handlers.
## Files / systems involved
golden-ui-shell catalog configuration and packing; golden-release browser tests.
## Known risks
Late DOM insertion; avoid observer loops or copying forms.
## Golden systems that must be preserved
Login/chat handlers, renderer, other worlds, existing menu and HUD limits.
## Errors that must not return
Large permanent mobile login/chat overlays outside the menu.
## Exact patch / change plan
Add catalog selectors; pack only newly added body subtrees, avoiding full-document rescans. Test late insertion, handlers, closed-drawer inertness and focus return.
## Tests to run
Syntax; cloud release gate, Golden desktop/mobile tests and Fleet.
## Deployment / PR plan
Isolated ai/codex/catalog-panels-20260923 branch; reviewed protected PR.
## Current progress
Root cause verified in common.js init and one-shot shell packing.
## Next action
Implement bounded fix and verify cloud browser behavior.
## Completion criteria
Late panels are packed once, accessible via menu, handlers preserved.
## Final evidence
Pending cloud verification; no production claim.

---

# 2026-09-24: Authoritative resident-at-address lookup

Task: expose the canonical fictional resident directory through one authenticated read-only Chain Reaction action, without changing simulation arithmetic or Graphics-owned UI. Why: PR #282 now persists 112 stable fictional residents, but a client or optional AI interpreter still has no bounded authoritative API to answer who lives at a building/floor/apartment and could be tempted to invent a name. Target: `resident-at-address` validates a bounded address, checks world membership on every request, returns exactly the stored/derived canonical fictional record, never writes or invokes AI, and has Node/Edge parity. Files: Node Chain Reaction adapter, Supabase Edge Chain Reaction adapter, focused API/Edge tests and this evidence record. Active-lock decision: PR #283 modifies insight arithmetic in the shared engine, so this slice deliberately does not edit that file; PR #278 owns UI and remains untouched. Risks: BOLA, mutation from a read-only action, accepting coerced numeric/string addresses, leaking private provenance, Node/Edge drift, or returning invented/nonfictional identities. Preserve: Supabase membership/RLS/CAS, all current actions, residents persistence, simulation resources/history/revisions, multiplayer, 3D/mobile. Implemented: action added to both allowlists; strict non-coercing building/floor/flat validation; lookup through the one canonical engine after membership authorization; valid-but-empty address returns 404; response contains only scenario identity plus the fictional resident and performs no persistence call. Regression coverage includes owner/player/stranger, reconnect stability, invalid/coerced/nonexistent addresses, zero writes and Edge wiring. Tests: focused API/engine/Edge 46/46 PASS; syntax, agent rules and diff check PASS. Independent review: PASS with 1,000 worlds and 112,000 canonical address lookups, zero world mutations, no BOLA/privacy/parity findings, and no file overlap with active engine PR #283. Full cloud exact-head gates remain required. PR/deploy: isolated PR to protected master, Ocean only after gates, separate Fleet POST after deploy. Progress: implementation, local verification and independent falsification complete. Next action: commit/publish and exact-head Fleet PRE. Completion: exact-head checks and Fleet PRE PASS, then Ocean/Fleet POST production proof. Final evidence: independent review PASS; cloud gates pending.

---

Fleet PRE privacy repair: exact head `44a656d6` was correctly blocked because an otherwise valid stored resident could carry extra fields through the raw lookup object. The API now projects an explicit six-field public DTO (`id`, `name`, `fictional`, `building`, `floor`, `flat`) in both Node and Edge. A regression injects private comment, actor UUID, hidden category and untrusted role fields and proves none escape. Focused suite after repair: 47/47 PASS; syntax, agent rules and diff check PASS. A new exact-head Fleet PRE is mandatory.

---

# 2026-09-24: Canonical fictional resident directory

Task: persist deterministic fictional residents as canonical Chain Reaction world data, without adding a second engine or touching Graphics-owned UI. Why: address lookup previously synthesized an NPC on demand, so the resident was not part of the saved/CAS-protected world and the temple spokesperson was not tied to a real game address. Target: every valid apartment has one stable fictional resident stored in `world.residents`; address lookup reads that canonical record; old worlds deterministically hydrate the same bounded directory on the next authoritative mutation; the three-temple spokesperson is selected from those stored residents and keeps a real building/floor/flat. Files/systems: the single shared Node/Supabase consequence engine, its existing CommonJS facade, and focused regression tests. Risks: world-state bloat, replay drift, exposing real-person claims, changing arithmetic/revisions/history, non-idempotent legacy migration, or Node/Edge divergence. Preserve: auth/membership/CAS/private-history, resource arithmetic, hidden Genie cards, insight streak, 3D/mobile/multiplayer behavior, and PR #278 ownership. Exact patch: derive exactly one record for each existing apartment from seed+house+floor+flat; mark every record `fictional:true`; store on create; validate and repair absent/empty/partial/tampered directories during commit/tick; resolve read-only legacy addresses through the same derivation; migrate old temple-square spokespersons to a deterministic stored resident; add create/serialization/legacy/corruption/invalid-address/spokesperson tests plus bounded multi-seed falsification. Tests: focused Node suite, syntax/agent rules, full cloud CI and independent Fleet PRE exact head. Deployment/PR: branch PR to protected master; Ocean only after gates; separate Fleet POST after exact deployment. Current progress: implementation and regression protection complete; independent review found empty/corrupt-directory and legacy-spokesperson gaps, both repaired and covered. Focused API/engine/Edge suite is 39/39 PASS; 1,000 independent seed worlds had 112 unique canonical addresses each, no arithmetic drift, and maximum serialized state below 16 KiB versus the 1 MiB API cap; syntax, agent rules, diff check and quality diff pass. Full local release gate ran 880 tests: 874 PASS, 4 intentional SKIP, and only 2 unchanged host-environment failures because Python `requests` is absent from the local CPU reconstruction environment; no Chain Reaction test failed. Next action: commit/publish PR, obtain full cloud CI and independent Fleet PRE exact head. Completion: exact-head tests and Fleet PRE pass, Ocean deploys, Fleet POST verifies canonical persistence on Live. Final evidence: pending cloud gates and final independent reviewer verdict.

---

# 2026-09-24: Sustained insight instead of one-tick illumination

Task: make the optional Chain Reaction insight path require a deterministic sustained interval, without adding an API or touching Graphics-owned files. Current state: `illumination` becomes true after a single qualifying tick, so a transient resource spike can claim social harmony. Target: require eight consecutive viable ticks with knowledge, leisure, cooperation and sustainability at threshold; reset the live streak when basic health/water/food or an insight dimension falls; persist the first attainment tick and emit one causal event; migrate legacy worlds deterministically. Files: the one canonical shared consequence engine and focused regression tests. Risks: accidental permanent victory, event spam, brittle object-order checks, replay drift, or legacy one-tick illumination remaining grandfathered. Plan: explicit named criteria, bounded integer streak, durable first-attainment marker, current-status boolean and replay/disruption/legacy tests. Required evidence: focused tests, full cloud CI, independent Fleet PRE exact head; Ocean and separate live POST remain mandatory.

---

# 2026-09-24: Chain Reaction construction workforce lifecycle

Task: repair the canonical simulator's builder lifecycle without changing the public API or Graphics-owned files. Current state: project `needs.workers` is subtracted at commit like a consumed material and is never returned, so every completed build permanently destroys workforce capacity. Target: reserve builders during construction, release them exactly once when the project is commissioned, keep simultaneous construction bounded by actually available workers, and preserve deterministic replay/legacy project compatibility. Files: the one shared consequence engine plus focused regression tests. Risks: double release, free parallel construction, worker creation above population, changing commissioning delay, or Node/Edge arithmetic drift. Plan: persist the reserved count on new projects; release and mark it atomically at commissioning; cap available workers by population; add exact-delay, contention and replay guards. Required evidence: focused tests, full cloud CI, independent Fleet PRE exact head; Ocean only after READY_FOR_OCEAN and separate Fleet POST after deployment.

---

# 2026-09-24: Authoritative hidden Genie options API

Task: expose the already simulator-verified four-card Genie selection and fifth free-intent lane through the existing authenticated Chain Reaction API, without touching Graphics-owned UI. Current state: `proposeGenieCards` proves the 2 worseners + 1 shifted crisis + 1 balanced distribution, but clients cannot request it and must not learn the hidden category labels. Target: one deterministic read-only `genie-options` action returning simulator forecasts with hidden classifications, honest degraded count, stable choice IDs and a bounded fifth free-design descriptor that reuses `preview-plan`/`commit-plan`. Files: canonical shared consequence engine, Node and Supabase Edge adapters, focused API/engine/Edge tests. Risks: leaking categories, trusting client arithmetic, non-deterministic ordering, pretending an infeasible quartet exists, or conflicting with Graphics PR #278. Preserve: all current auth/membership/CAS/private-history behavior, one engine, resource limits, renderer ownership and multiplayer. Completion: focused/full cloud tests and independent Fleet PRE exact head before Ocean; separate Fleet POST after live deployment. PR #277 Fleet POST is independently PASS for server/privacy; desktop/mobile/FPS/3D visibility remains UNKNOWN.

---

# 2026-09-24: Chain Reaction private player history

Task: prevent a child's free-form fifth-card explanation and raw actor UUID from entering publicly readable `voxel_worlds.settings`, while retaining durable authoritative provenance. Current state: the live API is authenticated, but commit/tick provenance is embedded in the public simulation JSON. Target: store a redacted causal projection publicly and atomically commit private text/actor provenance to an RLS-closed service-role journal with the same CAS transaction. Files: canonical shared consequence engine, Node and Supabase Edge adapters, one generated migration, focused tests. Risks: privacy leakage (including dictionary-guessable text hashes), membership revoke race, partial public/private writes, stale legacy rows, and loss of deterministic replay. Preserve: one canonical consequence engine, existing five gameplay actions plus membership management, revision arithmetic, unrelated world settings, multiplayer and renderer ownership. Plan: derive public IDs only from typed non-sensitive state; sanitize only persisted public state; backfill any pre-existing rows; lock canonical membership inside the RPC; update public CAS and private journal atomically; deny anon/authenticated table and function access; add regression guards. Production preflight found zero stored Chain Reaction worlds/comments/actor IDs. Completion requires focused/full tests, independent review, exact-head CI and Fleet PRE before Ocean; production migration must precede the Edge deployment, followed by Fleet POST. Progress: implementation complete locally; focused tests PASS. Full repository check initially reached 776 PASS before failing only because local npm/Python dependencies were absent; locked npm dependencies are now installed for the repeat run. No production schema or function change has been made.

---

# 2026-09-23: Chain Reaction owner-managed membership and stale-token revoke

Task: add authoritative invite/revoke server actions for a second player. Why: the live simulation has creator membership, but old JWT grants can outlive a revoke and there is no bounded owner API for multiplayer access. Current state: `master` requires membership but still accepts legacy `app_metadata`; no invite/revoke actions. Target: one-time legacy grant reconciliation, then private membership-only authorization checked on every request, with owner-only idempotent invite/revoke. Files: Node and Supabase Edge Chain Reaction adapters, one generated migration, focused tests and API documentation. Risks: BOLA, owner removal, stale-token access, user enumeration and breaking legacy invited users. Preserve: deterministic simulation, CAS, existing five actions, public 3D/UI ownership boundaries and all Golden systems. Plan: backfill trusted legacy grants; remove runtime JWT fallback; validate UUID targets; restrict management to canonical owners; preserve owner row; add regression tests. Tests: focused Chain Reaction/Edge/World Factory suites, JS checks, diff check, then cloud CI/Fleet PRE. Deployment: isolated branch and one PR; no direct production mutation. Progress: implementation complete locally; owner-only invite/revoke is idempotent, ignores stale JWT grants, and cannot downgrade an owner even under an insert race. Next: commit, push, open one PR and hand exact SHA to independent Fleet PRE. Completion: exact-head tests plus independent PRE before Ocean; separate POST after integration. Final evidence: 50/50 focused tests PASS; syntax, diff, Desktop protocol and quality diff PASS. The full release gate reached 868 tests with 861 PASS, 3 host-environment failures and 4 SKIP; the failures are unchanged baseline gaps (Python `requests` absent for two CPU reconstruction tests and MCP filesystem proxy timeout). Production schema read shows zero legacy grants/missing reconciliations; migration SQL EXPLAIN succeeds without executing it. No production schema/function deployment performed.

# 2026-09-23: Chain Reaction creator authorization without shared JWT grant races

## Task and reason
Repair the exact PR #270 source-review blocker where concurrent World Factory creations for one user can lose an `app_metadata.chain_reaction_worlds` update. Preserve the canonical Chain Reaction API and do not compete with the separate temple-domain PR #273.

## Current and target state
Current creator onboarding performs a non-atomic Auth Admin read/modify/write on one shared metadata array. Target: a dedicated RLS-closed membership row is the authoritative creator grant; the API accepts that membership directly, while the bounded trusted JWT list remains backward-compatible for separately provisioned invited users. Creator creation must not rewrite shared auth metadata, expose raw user IDs in public world settings, or require a token refresh.

## Affected systems, risks, and patch plan
- `lib/api-handlers/world-factory.js`: stop creator grant read/modify/write and provision one idempotent private membership row.
- `lib/chain-reaction-api.js`: load the canonical world, then authorize either its private membership or a trusted legacy/invited JWT grant.
- `supabase/migrations/20260923190000_chain_reaction_world_members.sql`: composite-keyed, RLS-closed membership storage with service-role-only access.
- focused tests: simultaneous distinct creator worlds, no metadata loss, direct owner access, stranger denial, and legacy grant compatibility.
- Risk: do not expose the private owner marker through `publicWorld`; do not weaken authenticated access; invitation/revoke and real Supabase CAS remain #271.

## Required tests and delivery
Run focused World Factory + Chain Reaction tests, syntax, then the repository check if resources permit. Commit and push only to `ai/codex/chain-reaction-api-20260923`; refresh PR #270 evidence and require a new exact-head Fleet PRE before Ocean. No merge or production claim from Builder.

## Progress / next action / completion
Progress: implementation and focused falsification are complete locally. The creator path now writes one composite-keyed membership row, never rewrites shared Auth metadata, and stores no user ID in public world settings. Next: commit/push and obtain fresh exact-head CI/Fleet/Cloudflare evidence. Completion requires those gates plus an updated Ocean handoff.

Final evidence so far: 28/28 focused World Factory + Chain Reaction tests PASS; syntax and agent-rules PASS. Full `npm run check` exercised 857 tests: 850 PASS, 3 host-environment failures, 4 SKIP. The three failures are the already documented baseline gaps on this Linux host: two CPU reconstruction tests lack Python `requests`, and the MCP filesystem proxy fixture timed out at 30 seconds. No changed Chain Reaction/World Factory test failed.

---

# 2026-09-23: Independent reviewer credential-safe error handling

A real Workers AI probe exposed a malformed GitHub credential: the user pasted a complete REST curl command rather than only the new API token. A native HTTP header exception reflected a partial credential into a GitHub artifact. Mitigation completed: the affected artifact was deleted (API now denies access); malformed WORLD_CF_AI_API_TOKEN was deleted; WORLD_CF_WORKERS_FREE_CONFIRMED disabled. The user must revoke the old Cloudflare token and create a fresh token, placing ONLY the token value into the dedicated GitHub secret. Do not print any old or new token or diagnostics derived from native header exceptions.

This branch fail-closes on invalid token format before HTTP, whitelists provider errors rather than logging arbitrary exception text (both Cloudflare and OpenRouter), rejects literal sk_, sk-, cfut_ and ghp_ secrets in added diff lines, and adds regression tests for secret-bearing header failures. Offline tests pass; real Cloudflare API tests remain blocked until token rotation. Do not merge this hotfix into master by bypassing governance without separate maintainer permission. Keep the five existing scheduled jobs unchanged.

---

# 2026-09-23: Cloudflare fresh-deploy propagation verification

Real PR #252 deploy-and-verify failed because Wrangler reported successful upload and publication, but the new preview `/` returned 404 within a fraction of a second. A separate read-only probe later returned 200 on the same URL. The exact-SHA verifier now retries only initial root/config 404/502/503/504 and stale expected SHA with a bounded ~76s readiness budget before running all existing hard checks. 401/403, non-readiness route failures, and a different SHA after the deadline still fail closed. Test four deterministic scenarios. No changes to the production app, scheduled jobs, or permanent URL policy.

---

# 2026-09-23: Free reviewer output-budget reliability

Latest independently inspected evidence: run 35808400443 produced six genuine INCONCLUSIVE responses: Google and Z-AI HTTP 429; NVIDIA Super no JSON; Nex timeout; Poolside and Cohere consumed output with empty content / length. Never treat these as PASS. A fresh branch from master a4777d63 adds catalog-aware reasoning budgets, one fail-closed retry on empty responses, in-band provider error detection, and mock regression coverage (17/17 focused tests plus Golden Standard PASS locally). No paid provider fallback, new schedule, branch-protection bypass, or PR code execution with credentials. Validate actual independent PASS on the exact submitted head before requiring the new status or merging this reliability patch. If all free providers are rate-limited, preserve INCONCLUSIVE and document quota/credential constraints rather than issuing fake green checks. Production/browser/user-visibility still unverified.

Next reliability slice: OpenRouter free quota is shared per account (50/day), so adding 4 more approved free model IDs is only a resilience measure; two distinct-family 429 responses now trip a circuit breaker. Added a separate Cloudflare Workers AI path with three independently trained free-plan families (Google, Z-AI, NVIDIA), only when WORLD_CF_WORKERS_FREE_CONFIRMED=true after actual Free-plan verification. Existing CLOUDFLARE_* secrets require Workers AI permission; if unavailable or paid plan unverified, skip Cloudflare. Added strict Cloudflare JSON validation, 18KB diff budget, quota/permission fallback and independent-family tests. Nothing auto-merges, no sixth automation or unverified PASS. The current PR remains draft until live exact-SHA review genuinely succeeds.

---

# 2026-09-22: Independent Torvalds/Knuth maintainer gate

## Task
Install two independent zero-cost AI reviews for every PR, safely execute the reviewer from trusted master, bind decisions to exact SHA, and make experiments hypothesis-first without adding another scheduled job.

## Safety and implementation
Branch ai/chatgpt/independent-maintainer-gate-20260922 from fresh origin/master. Main Desktop worktree has unrelated dirty files and MUST stay untouched. Dedicated reviewer is read-only, fail-closed, and publishes an exact-head check; no automatic merge, baseline changes, or production deployment. Daily World Quality Autopilot now includes a prediction-only next-experiment planner with a fixed counterfactual and device/FPS/visibility requirements.

## Verification and live blocker repair
PR #244 merged as 51c2ef63 after all 5 protected checks and focused 14/14 tests. First live dispatch on historic PR #240 found the script missing at PR's stale base SHA (fail-closed). Current trusted master is now used for executable review while the original base SHA remains exact diff input. PR #245 run 35722199501 produced artifact independent-review-b649f00c: Z-AI GLM-5.2 HTTP 429 (234ms) and NVIDIA Nemotron 3.5 Lightning timeout (90,002ms); both INCONCLUSIVE, never PASS. Artifact verified 2026-09-22. Added bounded 429 retry, 65-second provider timeout, JSON-mode compatibility fallback with strict local parsing, truncated-output rejection, additional zero-cost model families, and pinned trusted master checkout SHA. Free catalog checked live; two initial JSON-capable candidates are Google Gemma and Nvidia Super, with NEX-AGI and Poolside as alternatives. Focused tests now 14/14 PASS; run live review only from trusted master after bootstrap merge, then require check only after a real external two-family PASS. Preserve five pre-existing scheduled tasks. Preserve 5 pre-existing user automations.

---

# PR #133 flush — perf(voxel) eliminate per-vertex color clones — 2026-09-17 (Builder slice)

## Task
Per Architect dispatch on issue #80 (2026-09-17): flush PR #133 (`perf(voxel): eliminate per-vertex color clones`) by rebasing its single 1-line delta onto current master `BASE_SHA=31dc7a47` and adding exactly one focused regression test that proves `pushFace` color attribute output stays byte-identical to the previous `clone().multiplyScalar` baseline (allocations removed, rendered pixels unchanged). No gameplay/client behavior change; no production deployment.

## Evidence
- Rebase: delta commit `17c31352` on parent/master `31dc7a47`; diff vs master = exactly `apps/voxel-world/client.js | 2 +-` (+1/-1).
- Exact pushed PR head H2 = `fb7a5a49` (delta + regression test) on branch `ai/chatgpt/typed-vertex-attributes-20260916`; PR #133 base = `31dc7a47`, mergeable.
- Regression test added: `test/pushface-color-neutral.test.js` (3 focused tests):
  - source-level guard: `pushFace` computes `shade=face.shade*(vertexShade?.[i]??1)` once and pushes `col.r*shade,col.g*shade,col.b*shade`; must NOT contain any `.clone()`/`col.clone().multiplyScalar` per vertex.
  - numeric equivalence: scalar-shade output is byte-identical (Float32 buffer) to a faithful `clone().multiplyScalar` THREE.Color baseline across 15 hex colors x 9 shades x 4 vertex-shade patches x 4 corners (2160 samples).
  - deterministic sweep reproducibility.
- `node --test test/pushface-color-neutral.test.js`: 3 pass / 0 fail.
- `node scripts/check-js.js`: Syntax OK, 61 JS files.
- `node scripts/check-agent-rules.js`: PASSED.
- `node scripts/check-golden-standard.js`: PASS.
- CI on H2: pending (all-world-render, science-governance, screenshots, deploy-and-verify, etc.) — fleet/cloud confirm.

## Next action
Fleet PRE independently falsifies exact H2 (`fb7a5a49`), then Ocean integrates only if READY_FOR_OCEAN; no merge/deploy by this slice.

---

# PR #91 Stack Completion refresh — 2026-09-12

## Task
Refresh the existing Manual Fast Lane PR #91 onto current protected master `867d99de0ac38dec02f3f8c64a3a1d7a1c2785dd`, remove features already delivered by merged stack PRs, retain its unique Graphics-First viewport/world-identity/fusion work, and make delivery identity Cloudflare-native with the canonical `Builder -> Fleet PRE -> Ocean -> Fleet POST` topology.

## Scope and rollback
One task, one existing PR and branch: `ai/chatgpt/graphics-first-golden-viewport`. Production/master are not edited directly. The pre-refresh head `aee8584c178a13dcae22968503e2d3b9657b2e56` and protected master `867d99de0ac38dec02f3f8c64a3a1d7a1c2785dd` are rollback anchors.

## Acceptance
Preserve the merged World Factory, automatic lore, Universal Lore Graph, durable canon, Supabase authenticated writes, IndieWorlds and Cloudflare worker. Required CI and focused tests must pass without baseline weakening. Fleet must independently validate representative desktop Chromium, mobile Chromium, mobile WebKit and tablet visibility at >=85%, controls, world identity/fusion, and exact Cloudflare deployed revision before any readiness promotion.

## Current action
Resolve the historical branch conflicts in favor of current master, reapply only the missing integration layer, run focused/full gates, push the refreshed exact head to the same PR, then hand it to Fleet PRE with Cloudflare endpoint/security scenarios.

---

# IndieWorlds foundation — 2026-09-10

## Task
Implement the first production-safe IndieWeb layer for World Server: portable self-describing world passports, RSS discovery, independent canonical world URLs, visible passport access inside the existing Golden UI, and machine-readable world-to-world connections.

## Why
World Server already has a deny-by-default release registry, a World Graph, a newspaper catalog and interconnected lore. IndieWorlds should extend those exact systems so every world can be discovered, linked and exported without creating a second catalog, renderer, release policy or backend.

## Current state
Branch `ai/codex/indieworlds-foundation` was created from clean `origin/master`. `npm ci` passed. Baseline `npm run quality:diff` passed. Baseline `npm run release:gate` reached 597 tests and failed in 3 pre-existing environment-dependent tests before any product edit: 2 CPU reconstruction tests because the host Python lacks `requests`, and 1 MCP filesystem proxy test timed out after 30 seconds. The other 590 tests passed and 4 were skipped. Collective Brain routing selected architecture review + repository verification, with peer review required and parallel work disabled; recall returned zero prior matches.

## Target state
One reusable IndieWorlds module derives portable world passports and RSS from the existing release registry and World Graph. Existing `/api/worlds` remains GET-only and certified-by-default while adding explicit `indieweb` and `rss` representations. The Golden UI exposes the current world's passport and injects discovery metadata. Deterministic static exports provide a hosting-neutral fallback suitable for mirrors such as Neocities.

## Files / systems involved
`lib/indieworlds.js`, `api/worlds.js`, `shared/golden-ui-shell.js`, `shared/golden-ui-shell.css`, `scripts/export-indieworlds.js`, generated `shared/indieworlds/` artifacts, `package.json`, `data/golden-components.json`, `data/technology-registry.json`, focused tests, and this WIP evidence.

## Known risks
- Never make quarantine/diagnostic/tool apps appear in the certified public API.
- Never advertise a Webmention receiver until a persistent, spam-resistant and SSRF-safe receiver exists.
- Never trust request host/protocol headers without validation when producing absolute URLs.
- Preserve the existing `/api/worlds` JSON shape for callers that do not request a new format.
- Keep static exports deterministic so CI can prove they match canonical registry/graph data.

## Golden systems that must be preserved
Deny-by-default app release registry, World Graph identity/revisions/portals, Golden compact UI, catalog newspaper and videos, desktop/mobile controls, physics, telemetry, static fallback behavior, API compatibility and the Vercel function-count limit.

## Errors that must not return
Allow-by-file-existence publication, dangling world connections, duplicate catalog sources of truth, obstructive permanent panels, broken mobile safe areas, invented Webmention support, unsafe host-header reflection, non-deterministic generated artifacts and RSS/XML injection.

## Exact patch / change plan
1. Add pure IndieWorlds projection helpers with strict URL and XML escaping.
2. Extend the existing worlds handler with opt-in passport/index/RSS formats while preserving its default payload and GET-only contract.
3. Generate deterministic portable JSON passports, an index and RSS fallback from the canonical registry + graph.
4. Add discovery links, JSON-LD and a compact passport section to the existing Golden information drawer.
5. Register the reusable layer in the Golden Component Registry and add focused regression tests for release filtering, escaping, determinism, API compatibility and UI wiring.
6. Run focused checks, peer review, full repository gates, commit, push and open a PR; do not merge or deploy automatically.

## Tests to run
Focused IndieWorlds tests; `npm run check:fast`; `npm run check`; `npm run golden:check`; `npm run desktop-ai:check`; `npm run quality:impact`; `npm run quality:diff`; full `npm run release:gate`; `git diff --check`; local HTTP/API smoke for default JSON, passport JSON and RSS.

## Deployment / PR plan
Commit and push `ai/codex/indieworlds-foundation`, then open a PR into `master`. No direct master push, merge or production deployment. A production/preview link is only reported after a separately authorized promotion and verified browser/runtime checks.

## Current progress
Implementation and security hardening are complete. The canonical projection now produces 10 public passports (2 certified local worlds plus all 8 explicitly live external worlds), one network index and one RSS feed. `/api/worlds` keeps its previous default response and adds opt-in public `indieweb`/`rss` representations. Golden UI exposes the current published passport and clearly labels quarantine worlds as drafts. Static discovery links are present on the catalog and both certified local worlds. Netlify reuses the canonical handler; Vercel remains within its 12-function limit.

Initial peer review found three medium issues: unauthenticated inventory scope, allow-by-default future external entries and reflected proxy Host values. It also found three low issues: local XML MIME, 40 px passport links without the shared focus rule and environment-dependent exports. All six were corrected. Follow-up read-only review confirmed zero remaining high/medium findings and 11/11 focused tests plus an environment-override drift check passed.

## Next action
Wait for protected PR checks and human review. Do not merge or deploy automatically; inbound Webmention/IndieAuth remain a separately gated follow-up.

## Completion criteria
All focused tests pass; default API behavior remains byte-shape compatible; only certified internal worlds and already-live external worlds appear in public IndieWorlds discovery; static exports cannot drift; Golden UI remains compact; peer review has no unresolved high-severity finding; PR is open with honest baseline blockers and evidence.

## Final evidence
- Focused IndieWorlds/catalog/graph suite: PASS, 22 tests, 0 failures.
- IndieWorlds focused suite after peer-review fixes: PASS, 11 tests, 0 failures.
- `npm run indieworlds:check`: PASS; 12 deterministic artifacts match canonical data and remain stable when deployment URL environment variables change.
- `npm run check:fast`: PASS; 56 JavaScript files.
- `npm run golden:check`: PASS.
- `npm run contracts:check`: PASS; 0 blockers.
- Local HTTP smoke: legacy `/api/worlds` retained the `{worlds, graph}` shape; public passport returned its vendor MIME type; RSS returned `application/rss+xml`; static catalog discovery links resolved.
- First full `npm run check` after implementation: 600 pass, 2 fail, 4 skip; both failures exactly matched the baseline host dependency gap (`requests` missing for CPU reconstruction). After installing the already-declared Python requirement, targeted CPU reconstruction tests passed 2/2.
- Mandatory peer review: follow-up verdict has no unresolved high/medium finding.
- Technology registry: `IndieWeb-compatible world discovery` recorded at 70% integrated with executable source/export/test evidence; inbound Webmention and IndieAuth are explicitly not claimed.
- Final `npm run release:gate`: PASS. Full Node suite: 608 tests, 604 pass, 0 fail, 4 intentionally skipped; fuzz, Golden, governance, regression, perceptual, technology, duplicate, contract, project-review, stability, evidence, world-quality and Collective Brain security gates all passed. Non-blocking Collective Brain checkpoint sync reported `DEGRADED sync=queued`, as designed for unavailable external memory.
- `npm run quality:diff`: PASS; no accepted metric regressed. Current overall governance is 98%, evidence score 95.5%, world-quality readiness 100%.
- `npm run collective-brain:doctor`: PASS with expected optional local services unavailable in this managed Linux environment; benchmark PASS (26 ms); replay PASS (88 events).
- Remote implementation commit: `390a2f46a619d6dbdcb1aa20771403deaf71c936`.
- Review PR: https://github.com/mpaykin1/World_server/pull/96 (open against `master`; no merge or deployment performed).

---

# Patch-to-World ingestion and World Graph — 2026-09-07

## Task
Implement a reusable, idempotent Patch-to-World ingestion layer and interconnected World Graph on an isolated feature branch. Add manifests, revision history, portals, safe world APIs, manifest-driven metadata access, catalog integration, tests, and existing release-gate coverage.

## Why
Distinct patch families need stable world identities while later versions remain revisions/history. Public discovery must continue to respect the existing deny-by-default app-release registry.

## Current state
Branch `ai/chatgpt/patch-to-world-graph` is isolated from `origin/master`; baseline worktree was clean. Baseline `npm ci`, `npm run release:gate`, and `npm run quality:diff` were run before edits.

## Target state
One reusable graph/manifest library supports deterministic ingestion, deduplication, revision history and portal edges. `/api/worlds` exposes only registry-certified public worlds; `/api/apps` remains backward compatible. Catalog consumes world metadata without creating a second runtime.

## Files / systems involved
`lib/world-graph.js`, `scripts/ingest-world-patches.js`, `data/world-manifests/`, `data/world-graph-index.json`, `api/worlds.js`, `server.js`, catalog client, tests, and WIP evidence.

## Known risks
Do not auto-publish manifests; do not bypass `data/app-release-registry.json`; do not add a second persistence, telemetry, or rendering runtime. Existing apps and legacy APIs must remain unchanged.

## Golden systems that must be preserved
Existing app-release deny-by-default, catalog portals, shared controls/physics, persistence, telemetry, and all release gates.

## Errors that must not return
Catalog discovery by file existence, duplicate world identities, non-idempotent ingestion, dangling portals, and publication of uncertified/quarantine apps.

## Exact patch / change plan
1. Add strict manifest normalization and deterministic graph ingestion.
2. Add source patch-family/revision manifests for existing certified worlds.
3. Generate a checked-in graph index through the ingestion CLI.
4. Add read-only world APIs and local server routing.
5. Add catalog metadata integration without replacing the existing runtime.
6. Add focused tests and run the required release gates.

## Tests to run
Focused world-graph/ingestion/API tests, `npm run check`, `npm run release:gate`, `npm run quality:fuzz`, `npm run quality:stability`, `npm run quality:impact`, and relevant browser checks where feasible.

## Deployment / PR plan
Commit on this branch, push, open a PR to `master`; no direct deployment. Apply the 95% deployment/manual-action gate to any later promotion request.

## Current progress
Implementation complete on the isolated branch. `npm run world:ingest` reports `worlds=3 revisions=3 public=2`. The generated graph includes certified `ai3d-voxel-city` and `voxel-world`; quarantined `dark-void-scene` remains excluded by the release registry.

## Next action
Commit, push, and open the review PR. No deployment or publication action is included in this patch.

## Completion criteria
Idempotent ingestion and revision tests pass; world APIs and catalog preserve deny-by-default; all required release gates pass; PR contains evidence and known limitations.

## Final evidence
- `npm ci`: PASS; 353 audited packages, 0 vulnerabilities.
- `npm run check`: PASS; 501 tests, 499 pass, 0 fail, 2 skipped.
- Focused `test/world-graph.test.js`: 4 pass, 0 fail.
- `npm run release:gate`: PASS through protocol, tests, fuzz, impact, perceptual, tech, duplicate, contract, project, stability, evidence, world-quality, and collective-brain checks.
- `npm run quality:diff`: PASS before edits; post-change release gate remains PASS.
- Local HTTP smoke: `/api/worlds` 200 with 2 public worlds and graph edges; `/api/worlds?id=voxel-world` 200; `/api/apps` unchanged and deny-by-default.
- No production deployment performed; the 95% deployment/manual-action gate remains applicable to any later promotion.

## Task
Per the user's explicit follow-up cycle (target 90-95% capability coverage):
fix the confirmed agent_implement full-repo-timeout bottleneck with a real
Scoped Task Compiler + progressive context expansion; add a resource-aware
scheduler after a real concurrent-download-vs-agent-call incident; audit
OpenHuman's newly-discovered local JSON-RPC surface safely; build a real
production-architecture native (Godot) client sharing the exact same World
Spec/seed/terrain formulas as the web client, with a real headless Windows
EXE export pipeline; add history-based model selection; run a genuine,
honest 3-task free-agent E2E benchmark and a genuine native build E2E.

## Why
Previous round ended at ~85% coverage with agent_implement timing out on
every free model against the full repo. The user explicitly authorized
installing Godot (free/open-source) and asked for real, verified progress,
not design documents - and to never declare Scoped Task Compiler or Native
"confirmed" without real evidence.

## Current state
**All of the following is real and verified; the one deliberately NOT
overclaimed result is the automated free-agent benchmark - see below.**

- **Scoped Task Compiler** (`lib/scoped-task-compiler.js`, new): ranks a
  minimal file set for a goal (explicit path mentions in the goal text >
  matching `error-prevention-registry.json` entries > keyword-ranked repo
  search), 3 progressive levels (~5 files / ~20 files / full-repo
  fallback). `agent-adapters.js`'s `implementGoal()` now tries all 3
  levels for one model (with per-level timeout fractions of the caller's
  budget) before moving to the next model. Files are attached to OpenCode
  via repeated `-f <file>` flags (never via untrusted argv text - see the
  injection-safety design from the prior round, preserved and tested).
  8 real regression tests, all passing (`test/scoped-task-compiler.test.js`).
- **Resource-aware scheduler** (`lib/resource-scheduler.js`, new): real
  root-cause fix for an incident found live this session - a 1.19GB Godot
  export-templates download running concurrently with an agent_implement
  E2E test produced timeouts that, tested moments later in isolation with
  no competing download, succeeded in 10-13s. `implementGoal()` now
  exclusively holds an `LLM_REMOTE` resource-class slot (via the existing
  `lib/collective-brain` lease primitive - reused, not duplicated) for its
  whole attempt loop, so it can never again run concurrently with a
  scheduler-aware `NETWORK_HEAVY` task. Found and fixed a real bug in the
  scheduler itself during testing: `LIGHTWEIGHT` tasks (explicitly defined
  to never conflict with anything) were being serialized against each
  other by an over-eager lease-per-class implementation. 8 regression
  tests, all passing (`test/resource-scheduler.test.js`).
- **A second, more consequential real bug found and fixed**: `invokeOpencodeOnce`
  was classifying a timeout as pure failure and rolling back the worktree
  via `git checkout -- .` - even when OpenCode's process had ALREADY
  correctly completed the edit and was just hanging afterward instead of
  exiting (confirmed by watching the raw `--format json` event stream with
  `stdio:'inherit'`: real `tool_use`/`step_finish` events showing a correct
  edit at ~2s, but the process itself never exited). Fixed: on a timeout,
  `git diff` is checked in the target worktree BEFORE concluding failure -
  a real diff means real success (`processHangAfterCompletion:true`,
  verification still runs), an empty diff means real failure. This was a
  significant find - real completed work was being silently discarded
  before this fix.
- **New failure taxonomy**, used consistently now instead of one generic
  `'timeout'`: `timeout`/`process_hang` (no work, no contention evidence),
  `resource_contention` (no work, high memory pressure sampled at the
  moment of failure), `agent_error` (real non-zero exit), `verification_failed`
  (real edit, but `npm run check` failed), `no_changes`.
- **History-based model selection** (`lib/agent-history.js`, new):
  real, file-based (not ML) JSONL log of every attempt
  (taskType/contextBucket/model/duration/success/tokens/cost). Before
  ordering models, `rankModelsForTask()` prefers a model with a real,
  better track record on similar (heuristically bucketed) past tasks;
  models with no history keep their original relative order (never
  penalized for being untested). `recommendTimeoutMs()` can derive a
  timeout from real observed p90 durations once enough history exists,
  instead of one fixed number for every task. Wired into `implementGoal()`.
  8 regression tests, all passing (`test/agent-history.test.js`).
- **OpenHuman audit, done properly this round** (not just "no CLI found"):
  `C:\Program Files\OpenHuman\OpenHuman.exe` is a real installed binary. It
  is a full Tauri desktop GUI app that spawns an embedded core JSON-RPC
  server on `127.0.0.1:7788`. Safely probed (localhost only, never exposed
  externally, no auth bypassed, no token extracted): `/` and `/schema` are
  genuinely public/unauthenticated and return a full, real API description
  - **695 methods across 91 namespaces**, including directly relevant ones
  (`agent_team_start_member`: "Spawn a live worker for a member: claims a
  task and runs a real sub-agent to completion", `agent_chat`,
  `subagent`, `worktree`, `workflow_run`). `/rpc` genuinely returns a real
  `401 Unauthorized` for any unauthenticated call - confirmed the vendor's
  own stated design ("auth token loaded via in-memory handoff, no env
  crossing") is real and enforced, not just documented. **Conclusion: real,
  extensively documented internal API exists, but is deliberately gated
  behind a token this process has no legitimate way to obtain - no adapter
  was built, and none should be without the user first taking a real,
  explicit action (an OpenHuman-side "generate an API key for automation"
  feature, if one exists, was not searched for via the GUI - a possible
  next step for the user to investigate, analogous to the GitHub Connector
  403 fix).**
- **AnythingLLM**: re-confirmed the prior decision - not installed, and per
  the user's own instruction ("not worth installing just for agent count"),
  not installed this round either. Ollama (local Q&A) + OpenCode (free-tier
  code editing) already cover the free/local execution need; no functional
  gap was identified that AnythingLLM would uniquely fill.
- **Real native Godot pipeline** (`godot/world-client/`, new): Godot 4.7.2
  (free/open-source, explicitly authorized) downloaded, installed, and
  export templates (1.19GB, real resumable download after an artificial
  timeout truncated the first attempt) installed to the correct location.
  `WorldGen.gd` is a faithful port of `apps/voxel-world/client.js`'s real
  terrain formulas (`hash32`/`valueNoise`/`fbm`/`biomeAt`/`heightAt`) -
  **not a separate simplified game**: same seed produces the same
  height/biome at every coordinate as the web client, which is what makes
  this a second CLIENT of the same World_server world. Found and fixed a
  real, serious bug while porting: GDScript's 64-bit `int` does not
  replicate JS's 32-bit signed-multiply/unsigned-shift semantics
  (`Math.imul`/`>>>`) - the initial naive port rendered visibly wrong
  terrain (all-'snow' biome everywhere). Fixed with explicit
  `to_int32`/`imul32`/`ushr32` helpers. `scripts/compare-worldgen.js`
  cross-checks the real web formulas (copied verbatim, not reimplemented)
  against the real Godot binary across **7 seeds x 20 coordinates (140
  points, both quadrants, small/large magnitudes, seed 0 and a negative
  seed)** - PASS, 0 diffs. `scripts/godot-native-build.js` runs the full
  real pipeline: preflight -> headless `--export-release` -> artifact
  exists + plausible size -> real smoke test (runs the actual exported
  EXE, parses its output) -> web/native equivalence check - **PASS, exit
  0, run twice**. Wired as the real `build_native` typed command
  (`kind:"npm-script"`, `build:native`) - verified through the bridge's
  `executeTask` for real: `ok:true, exitCode:0`.
- **Real, honest E2E benchmark result - NOT overclaimed**: 3 real, small,
  correctly-scoped World_server tasks (add `viewport-fit=cover` to
  `apps/ai3d-voxel-city/index.html`, `apps/survival/index.html`,
  `apps/chat/index.html`) run through the full automated pipeline
  (`create_worktree` -> `agent_implement` -> `inspect_worktree_diff` ->
  `remove_worktree`) with NO competing downloads/builds this time.
  **Result: 0/3 succeeded automatically.** Every attempt at scoped context
  levels 1-2 failed fast (~2.5s, `agent_error`) across all 3 free models;
  level 3 (full-repo) hung until timeout (`process_hang`). Deep,
  time-boxed live diagnosis (raw shell invocation, `bash.exe`-direct
  invocation, `stdio:'inherit'`, single-vs-multiple `-f` flags) ruled out
  several specific hypotheses (it is not the multi-file-attachment
  mechanism specifically - a single-`-f` invocation later hung with zero
  output too) without reaching a fully proven root cause. The
  evidence-consistent (not proven) hypothesis: this session made several
  dozen calls to the same free-tier hosted models over a few hours, and
  the observed degradation resembles session-cumulative rate-limiting/
  backend overload, not a code bug - recorded honestly as an open question
  in `data/error-prevention-registry.json`, not swept under the rug.
  **The underlying mechanisms (Scoped Task Compiler's file selection,
  injection-safe attachment, hang-recovery diff-check) were separately,
  repeatedly verified correct via live testing earlier in the session when
  the service was less loaded - those are not invalidated by this
  incident, only the live success rate actually observed in this specific
  benchmark run is.**

## Target state
`agent_implement` reliably solves small, well-scoped World_server tasks
via the free tier without needing the whole repo as context, with correct
resource isolation, a correct hang-recovery path, and history-informed
model choice; a real native Godot client exists sharing the same World
Spec as the web client with a working, verified export pipeline.

## Files / systems involved
- `lib/scoped-task-compiler.js`, `lib/resource-scheduler.js`,
  `lib/agent-history.js` (new)
- `lib/agent-adapters.js` (implementGoal rewritten: progressive context,
  resource-scheduler wrap, history-based ranking, hang-recovery fix)
- `godot/world-client/` (new: project.godot, WorldGen.gd, Main.gd,
  main.tscn, export_presets.cfg)
- `scripts/compare-worldgen.js`, `scripts/godot-native-build.js` (new)
- `data/collective-brain/remote-task-commands.json` (`build_native` now
  real), `package.json` (`build:native`, `worldgen:compare`)
- `data/error-prevention-registry.json` (6 new entries)
- `test/scoped-task-compiler.test.js`, `test/resource-scheduler.test.js`,
  `test/agent-history.test.js` (new, 24 tests total)

## Known risks
- The free-tier OpenCode backend's real-world reliability is currently
  degraded for this session/account (see the honest E2E result above) -
  `agent_implement` should not be assumed to reliably succeed until this
  is re-verified after a cooldown period or from a different session.
- OpenHuman's real API surface (695 methods) remains inaccessible without
  a user-side action this session could not safely take.

## Golden systems that must be preserved
Untouched - no app/game code was actually committed by the E2E benchmark
(all 3 attempts failed and were cleanly rolled back/removed). Verified via
`node scripts/check-golden-standard.js` and the full `release:gate`.

## Errors that must not return
- `implementGoal` silently sending the whole repo to a free model for a
  small, precisely-scoped task (fixed - Scoped Task Compiler is now the
  default path, full-repo is the last-resort level 3).
- A concurrent NETWORK_HEAVY download starving an LLM_REMOTE call without
  either being aware of the other (fixed - resource scheduler).
- A completed, correct edit being discarded as a failure because the
  underlying process hung afterward instead of exiting (fixed -
  diff-before-rollback in invokeOpencodeOnce).
- `LIGHTWEIGHT` resource-class tasks being accidentally serialized against
  each other (fixed, regression-tested).
- A GDScript port of a JS bitwise/hash function using plain 64-bit
  `*`/`^`/`>>` instead of explicit 32-bit-wraparound helpers (fixed,
  regression-tested via scripts/compare-worldgen.js).
- Claiming Scoped Task Compiler or Native build_native "confirmed working"
  without a real, current, honestly-reported success - this WIP entry and
  the final report explicitly do not do that for the free-agent benchmark.

## Exact patch / change plan
See "Files / systems involved" above - 3 new lib modules, 2 new scripts, a
new Godot project, 3 new test files (24 tests), 6 new registry entries, and
targeted edits to `agent-adapters.js`/`remote-task-commands.json`/
`package.json`. No app/game source code changed (the E2E benchmark's
attempted edits were all rolled back on failure).

## Tests to run
- `node --test`: 202/203 PASS, 1 skipped by design (opt-in live opencode
  test, consistent with the prior round's precedent).
- `node scripts/check-golden-standard.js` / `check-desktop-ai-protocol.js`:
  PASS.
- `node scripts/project-quality-reviewer.js`: blockers=0.
- `node scripts/compare-worldgen.js`: PASS (7 seeds x 20 points, 0 diffs).
- `node scripts/godot-native-build.js` (`npm run build:native`): PASS,
  exit 0, run twice (real headless export + real smoke test + real
  equivalence check each time).
- Full `npm run release:gate`: to run before push.
- 3-task real-World_server free-agent E2E: 0/3 (see above, honestly
  reported, not the headline claim of this round).

## Deployment / PR plan
`ai/desktop/scoped-context-native-pipeline` -> `master`. Merge once this
PR's own checks are green (pre-existing unrelated Playwright red on
master, reconfirmed against master's current HEAD at PR time, acceptable
per established precedent).

## Current progress
All code, tests, and the native pipeline are implemented, tested, and
verified working on their own terms. The one explicitly NOT-yet-achieved
goal is a positive free-agent World_server E2E success (0/3 this round,
for reasons only partially diagnosed - see above). Not yet committed at
the time this entry was written.

## Next action
Run full `release:gate`, commit, push, open PR, wait for CI, merge. Then
produce the final report in the user's exact requested format, honestly
including the 0/3 E2E result and the still-open root-cause question.

## Completion criteria
PR merged; all new modules covered by real regression tests; native build
pipeline genuinely produces and verifies a working EXE; the free-agent E2E
result reported exactly as observed, not adjusted to look more favorable.

## Final evidence
- `node --test`: 202/203 PASS (1 skipped by design).
- `node scripts/compare-worldgen.js`: PASS, 140/140 sample points matched
  across 7 seeds.
- `node scripts/godot-native-build.js`: PASS, exit 0 (run twice, including
  once via the typed `build_native` bridge command directly).
- Real artifact: `GODOT_BUILD/world-server-native-windows.exe`, ~109MB,
  runs standalone, smoke-test output cross-verified against the web
  client's own terrain formula.
- 3-task free-agent World_server E2E: 0/3, honestly reported with full
  per-attempt diagnostics recorded in this file and in
  `data/error-prevention-registry.json`'s
  `opencode-free-tier-reliability-degrades-with-sustained-session-usage`
  entry.


---

# Addendum — World Cloud AI / OpenCode + Qwen

## Goal
Add an isolated cloud coding-agent path for `World_server` using GitHub Actions, pinned OpenCode, and Qwen3-Coder through OpenRouter, without changing the existing desktop-agent pipeline.

## Safety / integration
- Runs only on owner-triggered `/worldai` comments or manual workflow dispatch.
- Uses a per-run branch and opens a PR; it never writes directly to `master`.
- Keeps default GitHub Actions permissions read-only; this workflow requests only the write scopes it needs.
- Validates changes with existing `check`, `desktop-ai:check`, and `golden:check` gates.
- On verification failure, performs up to two repair passes without weakening tests.

## Current progress
Workflow added on isolated branch `ai/cloud-opencode-qwen`. YAML parsing, `git diff --check`, `desktop-ai:check`, `check:fast`, and `golden:check` pass. GitHub Actions PR permission is enabled while repository default workflow permission remains read-only.

## Next action
Push this isolated branch and open a PR. Live model E2E remains blocked until repository secret `OPENROUTER_API_KEY` is added.

## Final evidence
Local structural/protocol gates PASS. No claim of live Qwen/OpenRouter execution is made until the secret is configured and a real GitHub Actions run passes.

## Cloud AI secret compatibility fix — 2026-09-06

### Goal
Prevent cloud-agent startup failures when the existing OpenRouter repository secret uses the compatibility name `WORLD` instead of `OPENROUTER_API_KEY`.

### Root cause
The first real GitHub Actions E2E run proved the workflow only read `secrets.OPENROUTER_API_KEY`, while the repository currently exposes the user-created secret as `WORLD`.

### Change
`.github/workflows/world-cloud-ai.yml` now resolves `OPENROUTER_API_KEY` from `secrets.OPENROUTER_API_KEY || secrets.WORLD`. No secret value is logged, copied, or stored in the repository.

### Regression protection
Keep the preferred descriptive name first, retain `WORLD` only as a backwards-compatible alias, and fail closed if both are absent.

### Tests to run
YAML parse, `npm run desktop-ai:check`, `npm run check:fast`, `npm run golden:check`, then a real `workflow_dispatch` E2E on `master` after merge.

### Final evidence
Pending commit/CI/real cloud-agent E2E.

## Cloud AI provider hardening — 2026-09-06

### Goal
Make OpenCode + OpenRouter reliable in non-interactive GitHub Actions after the first authenticated run failed inside OpenCode with `UnknownError` before any repository edit.

### Root cause / mitigation
The built-in OpenRouter path did not provide an actionable provider error in CI. The workflow now uses an explicit OpenAI-compatible `worldrouter` provider through a temporary `OPENCODE_CONFIG`, with the key referenced only as `{env:OPENROUTER_API_KEY}`.

### Safety
The config lives only in the runner temp directory, contains no secret value, checks that `qwen/qwen3-coder:free` is currently advertised by OpenRouter, and keeps all Git changes isolated to `world-ai/run-*` branches.

### Tests to run
YAML parse, `check:fast`, `golden:check`, `desktop-ai:check`, then real workflow_dispatch E2E through Qwen → edit → verify → PR.

### Final evidence
Pending real cloud-agent E2E.

## Cloud AI live free-model fallback — 2026-09-06

### Goal
Remove the hard dependency on one disappearing free OpenRouter model while guaranteeing zero paid inference.

### Root cause
The live OpenRouter `/api/v1/models` catalog no longer advertised `qwen/qwen3-coder:free`; the workflow correctly failed before inference even though the old public model page still existed.

### Change
At every run, resolve an approved zero-cost open-weight model from the live catalog: prefer Qwen3 Coder Free, otherwise use GLM-5.2 Free. Generate a temporary OpenCode provider config for the selected model. Never fall back to a paid endpoint.

### Regression protection
Model selection requires both prompt and completion prices to equal zero and fails closed when no approved free model is live.

### Tests to run
YAML parse, local project guards, then real cloud E2E through model selection → OpenCode → repository edit → verification → pull request.

### Final evidence
Pending real workflow run.

## AI mutual reinforcement + cloud failover — 2026-09-06

### Goal
Increase whole-system readiness by connecting existing local/free agents, the GitHub cloud agent, shared Collective Brain evidence, and an explicit paid-only Codex fallback without duplicating infrastructure.

### Reused systems
Ported the already-tested OpenHuman/AnythingLLM subtask dispatcher and hardened master-coordinator onto current master. Kept current master registry/evidence/lock files and did not resurrect the removed legacy multi-ai-peer-review implementation.

### Changes
Master Coordinator can now dispatch OpenCode, OpenHuman, AnythingLLM and World Cloud AI, while Codex is an explicit opt-in fallback only. Automated cloud/OpenCode/Codex outcomes share the common ai-agent report log. New `--full-free` mode enables all free cooperating workers.
### Cloud root cause + protection
The prior E2E reached GLM-5.2 and then died on a transient `Provider returned error`. The workflow now resolves several live zero-cost tool-capable open-weight candidates and `world-cloud-opencode-failover.cjs` retries only provider/rate-limit/timeout failures on the next free model. Non-provider code/test failures fail closed and are never hidden.

### Safety / cost invariants
No paid cloud fallback is allowed inside World Cloud AI. Codex dispatch requires explicit `allowPaid=true` / `--allow-paid`. External task text is secret-scanned before OpenCode/cloud/Codex dispatch. Dirty failed local work is preserved off Desktop through the existing recovery path.

### Tests / evidence
Run master-coordinator + OpenHuman/AnythingLLM/MCP/resource tests, cloud failover unit tests, YAML parse, check:fast, desktop-ai:check, golden:check, then a real zero-cost cloud E2E. Final evidence pending the real cloud run.

### Linux CI portability defect found and fixed
PR #38 exposed nine Linux-only failures because the reused AI queue stack embedded `C:\Users\user\Desktop\World_server` as an executable path. Windows local tests hid this. Added `lib/world-server-paths.js` to discover the canonical git main worktree cross-platform, while executable source paths always resolve from the current checkout. Scheduler, router, OpenHuman, coordinator and health checks now reuse this resolver.

### Portability regression protection
`test/world-server-paths.test.js` verifies that source root is the active checkout, `durable-job-queue.cjs` exists inside it, and the canonical main worktree is discoverable. Machine-specific World_server path literals were removed from runtime/test code so Linux CI cannot regress to a Windows path again.

## 2026-09-06 dependency-security readiness closure
- Owner: ChatGPT automation; branch `ai/chatgpt/dependency-security`; isolated off-Desktop worktree.
- Root cause: latest `@lhci/cli@0.15.1` still resolves vulnerable Lighthouse/Puppeteer/qs/tmp/uuid transitive versions; `extract-zip@2.0.1` has no fixed npm release.
- Fix: keep LHCI API surface but override its security-sensitive transitive graph to current compatible fixed versions: Lighthouse 13.4.1, puppeteer-core 25.10.0, @puppeteer/browsers 3.2.2, qs 6.16.0, tmp 0.2.7, uuid 11.1.1. This also removes extract-zip entirely because browsers 3.x uses modern-tar.
- Evidence: `npm audit --json` reports 0 vulnerabilities after install; dependency tree confirms all overrides and no extract-zip.
- Regression: `test/dependency-security-lock.test.js` fails if critical packages fall below the remediated floors or extract-zip returns.
- Local full `npm run check` reached 461 PASS / 2 resource-scheduler failures caused by live system free RAM 13.3% while many parallel AIs were active; failures are resource-gate behavior, not dependency assertions. CI on clean GitHub runner is authoritative for full suite.
- Local LHCI healthcheck passed with the upgraded graph; collection could not start only because port 3100 was already occupied by another active agent/server. Do not kill that process; GitHub CI will verify an isolated run.

## 2026-09-06 catalog production performance root-cause fix
- Production evidence: catalog p10 FPS 12 (<30), p95 load 13231ms (>10500).
- Root cause: top-level await AppCore.init blocked module/load on Supabase CDN/network; mobile renderer also started at DPR up to 1.8 with antialias + shadows.
- Fix: non-blocking AppCore init, device-aware rendering budget, adaptive DPR, flat ground geometry, bounded mobile lightning bursts.
- Regression: test/catalog-production-performance.test.js 3/3 PASS; check:fast/golden/desktop-ai PASS.
- Remaining proof: full npm check + GitHub CI + post-deploy Production Quality Feedback.



## 2026-09-06 — Zero-Chaos / Computer-Health for all AI entrypoints

### Task
Make Desktop hygiene and low-impact computer-health enforcement mandatory for every controllable World_server AI session without creating a parallel subsystem.

### Root causes fixed
- `master-coordinator.cjs` dispatched agents without one shared pre/post session guard.
- `agent-adapters.js` used generic OS temp for disposable worktrees instead of the canonical LOCALAPPDATA worktree root.
- Remote bridge temporary patch/PR-body files used generic OS temp.
- Direct Desktop AI task startup had no mandatory zero-chaos preflight.

### Implemented
- Added shared `lib/agent-session-guard.js` driven by `data/desktop-ai-policy.json`.
- Enforced shared lifecycle for OpenCode, OpenHuman/direct Ollama, AnythingLLM, World Cloud AI, Codex, Claude Code/Desktop AI; browser-only agents receive the mandatory start/end contract.
- Worktrees now live under `%LOCALAPPDATA%\World_server_worktrees`; scratch/recovery under `%LOCALAPPDATA%\WorldServerAI`.
- Guard never terminates user/unrelated processes and deletes only proven owned, regenerable stale scratch.
- Future registered agents inherit the policy; unknown executable adapters fail closed.

### Evidence
- Focused regression suite: 47 PASS / 0 FAIL / 1 opt-in skip.
- `scripts/check-agent-rules.js`: PASS, including future-agent inheritance, off-Desktop roots, common guard coverage, and no-BOM shebang regression.
- Real-machine preflight/postflight: PASS; Desktop violations: 0; free RAM ~53%; free disk ~205 GB.
- Removed two stale owned AI goal temp files and the empty legacy temp-worktree root; no registered Git worktree was deleted.

### Completion
Commit and push this branch after final `git diff --check` / fast syntax gate.


## 2026-09-06 production evidence freshness hardening
- Root cause: production-quality-pull used only a 24h aggregate, so stale pre-deploy sessions could mask post-deploy reality; zero fresh sessions could be interpreted as a clean pass.
- Fix: evaluate a fresh 1h window separately from the 24h history and emit PASS / BLOCK / INCONCLUSIVE. Zero fresh sessions is INCONCLUSIVE; fresh FPS/load/error violations remain BLOCK.
- Regression: production-quality fresh-evidence + Node 24 tests 4/4 PASS; check:fast PASS.
- Live probe: freshSessions=0 => INCONCLUSIVE, proving the false-PASS path is closed.


---

# RUN_072 production port — 2026-09-06

## What / why
Port the already-verified RUN_072 science patch onto the current production master without importing its divergent history, and expose evidence through the existing production/API + remote-task infrastructure.

## Current state
Fresh branch from current `origin/master`; minimal RUN_062/066/071 dependencies + RUN_072 restored; current registry preserved and extended only with the RUN_072 protection entry.

## Target state
`/api/science-run072` returns immutable evidence in production; remote-task bridge can read the evidence and rerun RUN_072 by allowlisted scriptId; full verification runs in cloud CI.

## Tests
Focused RUN_072 tests, syntax checks, one deterministic experiment replay, and API smoke locally. Full CI/release in GitHub/cloud.

## Completion
Clean commit/push/PR, cloud checks, merge, existing production sync, then external HTTP 200 verification at `https://world-server.ai.studio/api/science-run072`.


---

# Universal Voxel Microdetail V2 — 2026-09-07

## Task
Advance the existing microdetail patch from standalone V1 into a production-integrated World_server V2 and commit it through an isolated AI branch/PR.

## Why
V1 had the right semantic profiles and hybrid geometry/shader idea, but it was still a ZIP installer rather than repository source, had no real browser integration evidence, and its physical detail decision was effectively tied to mesh build time rather than dynamic render proximity.

## Current state
Implemented in isolated off-Desktop worktree from `origin/master` db9e240. The current solution reuses the existing THREE renderers, WorldQualityAutopilot, world material/semantic/visibility systems and gameplay collision sources.

## Target state
Near surfaces show real cubic protrusions/dents; mid-distance surfaces use cheap shader microdetail; far/exact modes preserve base geometry. Animals, faces, scales, armor, weapons and fabric share semantic profiles, with explicit tagging available for ambiguous assets. Quality adapts without overriding the global tier ceiling.

## Files / systems involved
- `shared/microdetail-policy.json` — one policy source.
- `shared/graphics/universal-voxel-microdetail.js` — detail geometry + shader + local FPS hysteresis.
- `shared/graphics/universal-voxel-microdetail-bootstrap.js` — existing renderer hook and dynamic nearest-mesh selection.
- `lib/world-quality-microdetail-policy.js` — Node policy helpers.
- `scripts/world-microdetail-audit.js`, `test/world-microdetail.test.js`.
- bootstrap entries in `apps/voxel-world/index.html` and `apps/ai3d-voxel-city/index.html`.
- existing `scripts/world-quality-autopilot.js` + `package.json`.

## Risks / invariants
- Never change collision/occupancy because microdetail is visual only.
- Never runtime-retopologize SkinnedMesh; arbitrary animated assets use shader path.
- Water/glass stay smooth by policy.
- AI3D orthographic FRONT EXACT disables detail to preserve verifier fidelity.
- Do not create a second renderer, world, LOD stack or quality controller.
- Do not install optional dependencies without measured benefit.

## Exact patch plan
1. Centralize profiles/budgets/guards in shared policy JSON.
2. Build deterministic stepped-cube geometry from eligible exposed quad meshes.
3. Dynamically select only nearest eligible meshes and swap detail geometry only during render.
4. Apply semantic shader microdetail to Standard/Physical meshes, including animated assets without topology changes.
5. Wrap existing WorldQualityAutopilot registration so its tier is the detail ceiling and its stats include microdetail.
6. Add structural audit, tests, documentation and Desktop AI repair instructions.
7. Run focused + repository gates; fix root causes and add regressions before commit.

## Tests to run
- `npm run quality:world:microdetail`
- `node --test test/world-microdetail.test.js`
- `npm run check:fast`
- `npm run check`
- `npm run desktop-ai:check`
- `npm run golden:check`
- browser visual/performance verification if available without production deploy.

## Deployment / PR plan
Branch `ai/chatgpt/universal-microdetail-v2` -> PR to `master`. No direct master push, auto-merge or production deploy. GitHub CI/cloud verification is authoritative for heavy checks.

## Current progress
Core V2 runtime, policy, bootstrap integration, audit, tests and instructions are written. Focused verification is next; no production-ready/100% claim until browser evidence exists.

## Next action
Run syntax/policy/focused tests, inspect failures, fix until PASS, then run repository fast/full gates as resources permit. Commit/push only the validated source/docs/tests, not generated reports or `work/` scratch.

## Completion criteria
- source branch clean after commit;
- all microdetail structural/tests PASS;
- no gameplay client source changes required for this integration;
- PR opened with explicit known limitation that browser visual/FPS evidence is still required if not completed in this run;
- no accepted quality metric knowingly regresses.

## Final evidence
Pending current-run verification. `WORLD_MICRODETAIL_REPORT.json` is generated evidence and must not be committed unless repository policy explicitly tracks it.


### Final local evidence update — 2026-09-07
- UTF-8 mojibake regression found before commit, root cause was PowerShell text rewrite; file restored and reinserted byte-safely through Node UTF-8 I/O.
- Added regression that requires the original Russian `Картинка → город из кубиков` and forbids the observed mojibake marker.
- Shader injection hardened: world micro-position derives from `modelMatrix * vec4(transformed,1.0)` after Three.js transforms, not conditionally-declared `worldPosition`.
- Focused microdetail tests: 13/13 PASS.
- `quality:world:microdetail`: PASS, structural 100%, implementation 92%.
- Full repository test run before these two narrowly-scoped guards: 514 PASS / 0 FAIL / 2 opt-in skips.
- After final fixes: `check:fast` PASS, `golden:check` PASS, `git diff --check` PASS.
- Remaining evidence for 100% is browser visual/performance measurement in cloud/CI, not missing core architecture.


---

# Vercel Repair Agent bridge — 2026-09-07

## Task
Connect the existing zero-cost World Cloud AI (OpenCode + free-model failover) to Vercel commit failures so `world-server` build failures automatically become bounded repair tasks.

## Why
Vercel already posts commit statuses, but repair is manual. We need event-driven triage that distinguishes code/build failures from quota/rate-limit outages and only wakes the coding agent when code repair is justified.

## Current state
- Source of truth: `master` at `b7202e84` when this worktree was created.
- Existing `.github/workflows/world-cloud-ai.yml` already performs free-model implementation, verification, self-repair, branch push and PR creation.
- Vercel status on current master is `Deployment rate limited — retry in 24 hours` for `world-server` and two homepage projects.
- No local `VERCEL_TOKEN` or persisted Vercel CLI auth is present; the bridge must degrade safely without it.

## Target state
A failed `Vercel – world-server` commit status immediately triggers cloud triage. Quota/rate-limit/cancelled conditions produce a clean no-code result. Real build failures dispatch one focused task to the existing World Cloud AI. If repository secret `VERCEL_TOKEN` exists, private Vercel build logs are included automatically.

## Affected systems
- `.github/workflows/` — Vercel status bridge only.
- existing `world-cloud-ai.yml` — reused, not duplicated.
- `.github/scripts/` — pure status classifier used by workflow and tests.
- `test/` — regression coverage for quota-vs-code classification.

## Risks / invariants
- Never launch an AI repair for Vercel quota/rate-limit/external capacity failures.
- Never auto-merge a repair PR or push directly to `master`.
- Never expose `VERCEL_TOKEN`; it is optional and read only from GitHub Actions secrets.
- Avoid duplicate repair agents for the same Vercel status.
- Automatic scope is `Vercel – world-server`; other Vercel projects remain manual-dispatch capable to prevent three agents reacting to one commit.
- Bridge-only changes must remain non-deployable under the existing Vercel quota guard.

## Exact patch plan
1. Add a pure Vercel status classifier with external-limit/cancelled/build-failure classes.
2. Add an event-driven `status` + manual `workflow_dispatch` workflow.
3. Resolve the failed branch safely; stale deleted preview branches are skipped.
4. Optionally collect Vercel private logs when `VERCEL_TOKEN` exists.
5. Dispatch the existing `world-cloud-ai.yml` with bounded evidence and repair rules.
6. Add tests for rate limit, quota, generic build failure, unrelated status and cancellation.
7. Run focused tests + `npm run check` + agent/golden checks; then commit/push/PR for review.

## Tests to run
- `node --test test/vercel-failure-classifier.test.js`
- `npm run check`
- `npm run desktop-ai:check`
- `npm run golden:check`
- `git diff --check`

## Deployment / PR plan
This patch changes only `.github/`, `test/` and Markdown, so existing `scripts/check-vercel-ignore.js` should skip Vercel deployment for the bridge itself. Push branch `ai/chatgpt/vercel-repair-agent`, open PR to `master`, require normal review/CI, no automatic merge.

## Current progress
Isolated off-Desktop worktree created. Existing World Cloud AI and current Vercel status behavior inspected. Implementation is in progress.

## Next action
Write classifier + bridge workflow + tests, verify locally, then push to GitHub for cloud CI.

## Completion criteria
- Current rate-limit status classifies as external blocker and does not dispatch coding AI.
- Generic Vercel world-server build failure dispatches exactly one existing World Cloud AI run.
- Missing Vercel token is safe and non-fatal.
- Optional token path gathers logs without printing the token.
- Repository gates pass; PR is open for review.

## Final evidence
Pending verification and GitHub workflow test.


### Final evidence update — 2026-09-07
- Vercel classifier focused suite: **9/9 PASS**.
- Current real `Vercel – world-server` status `Deployment rate limited — retry in 24 hours.` classifies as `external-limit` with `shouldRepair=false`.
- Generic `Deployment has failed` classifies as `build-failure` with `shouldRepair=true`.
- Workflow YAML parses successfully.
- Existing Vercel quota guard confirms this bridge-only patch is non-deployable and will not consume a Vercel build.
- Full repository check: **552 PASS / 0 FAIL / 2 opt-in skips**.
- `desktop-ai:check`: PASS.
- `golden:check`: PASS.
- `git diff --check`: PASS.
- No local `VERCEL_TOKEN`/Vercel CLI auth exists; bridge safely degrades to GitHub evidence until repository secret `VERCEL_TOKEN` is configured.

## Final evidence
Implementation and local verification complete. Remaining proof is GitHub Actions parsing/execution after push plus a manual current-rate-limit workflow dispatch; no code repair should be launched for that external blocker.

## Vercel Hobby 12-function blocker — 2026-09-07
- Goal: make current master deployable on Vercel Hobby for immediate real testing.
- Root cause: current api/ has 14 serverless JS functions; Hobby hard limit is 12.
- Minimal fix: move register/login/me/logout handlers under lib/api-handlers and route their unchanged public URLs through one api/auth.js function.
- Invariants: preserve auth behavior and URLs; keep local server routes; add regression guard api/*.js <= 12; no Desktop scratch.
- Completion: focused/full checks -> PR -> required green checks -> merge -> exactly one Vercel preview -> browser smoke.
- Evidence: api/*.js reduced 14 -> 11; focused Vercel limit tests 3/3 PASS; JS syntax, agent rules and Golden Standard PASS.
- Remaining: cloud CI, merge, one Vercel preview and browser smoke.


## Manual task — Golden Painting + delivery contract (2026-09-09)
- Owner: ChatGPT manual fast lane.
- Branch: `ai/golden-painting-day-night-20260909` in system Temp; canonical dirty Desktop checkout untouched.
- Scope: Golden Painting atmospheric perspective + 60s day / 60s sunset / 10s night / 60s sunrise across compatible worlds; add Manual Task Completion Contract.
- Delivery requirement: exact commit + pushed branch + test Preview URL + real-browser verification before PASS.
- Current mode: FINISH MODE. No optional scope expansion before verified Preview.
- Remaining gate: focused/full checks -> commit -> push -> Preview deploy -> browser verify exact URL -> handoff URL.

## Cloudflare fail-closed quality canary � 2026-09-21
- Goal: replace false-green Vercel-only canary with exact-SHA Cloudflare deployment verification.
- Scope: quality-canary workflow only; no auth/security weakening and no production promotion.
- Gates: release:gate, exact-SHA stack verification, Chromium/WebKit, playable delivery, HTTP smoke.
- Status: protocol ledger updated after CI correctly rejected the workflow-only patch; rerun full gates before merge.
# Chain Reaction backend API — 2026-09-23

- Task / why: connect the deterministic engine to authenticated, persisted API actions.
- Current state: engine exists; no backend intent/preview/commit/tick/history contract.
- Target / direction: server-authoritative simulation in existing voxel world settings.
- Systems / files: api/voxel.js, lib/chain-reaction-api.js, targeted backend tests only.
- Risks: forged intent, guest impersonation, lost updates, unbounded simulation/history.
- Preserve: engine arithmetic, browser client, legacy voxel actions, other agents' work.
- Exact plan: dispatch chain actions before guest auth; require verified user and trusted app_metadata world grants; validate bounded input; recompute intents; persist settings using updated_at CAS; test failures and races.
- Tests: focused API/engine tests and syntax locally; full npm check/release gates in cloud per cloud-first policy.
- Deployment / PR: commit current branch as explicitly requested; push/PR if available; no merge/deploy.
- Current progress: five API actions implemented with trusted per-world grants, server-side intent compilation, atomic state/history CAS, bounded requests and scenario capacity. Backend contract documented in docs/CHAIN_REACTION_API.md.
- Next action: from an authorized Git context, stage these five files, commit this branch, push and open a draft PR; run cloud npm run check/release:gate and live Supabase integration verification. Provision trusted app_metadata.chain_reaction_worlds grants before client integration.
- Completion criteria: scoped commit and honest test evidence; integration release remains subject to cloud gates and live Supabase verification.
- Final evidence: node --test --test-isolation=none test/chain-reaction-api.test.js test/world-consequence-engine.test.js: 19/19 passed. node --check api/voxel.js and lib/chain-reaction-api.js passed; git diff --check passed. Agent rules check passed with git subprocess EPERM warnings (branch/file checks not verified by that script). Ordinary node --test failed to spawn subprocesses (EPERM); same tests passed with isolation disabled. Full release suite remains unrun, cloud-first. No live database or browser claim. Simulation arithmetic and accepted quality metrics unchanged; no scientific readiness claim.
- Commit blocker: git add failed creating C:/Users/user/Desktop/World_server/.git/worktrees/worldserver-codex-chain-20260923/index.lock: Permission denied. The linked worktree Git directory is outside this session's writable root; approvals are unavailable. No commit/SHA, push, PR or deployment produced. No new worktree or Desktop copy created; existing user worktrees left untouched.
