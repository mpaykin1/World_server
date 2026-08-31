# WORK IN PROGRESS — WORLD PROCEDURAL RECIPE ENGINE V3 + VFX ENGINE V3

## Task
Install two patches (`WORLD_PROCEDURAL_RECIPE_ENGINE_V3_PATCH.zip`, `WORLD_PROCEDURAL_VFX_ENGINE_V3_PRODUCTION.zip`) and make them reinforce each other, per explicit user request.

## Why
User request. "Reinforce each other" was the operative ask — not just installing two unrelated patches side by side.

## Current state
- Isolated worktree/branch `ai/desktop/world-procedural-v3`, based on `origin/ai/opencode/multi-ai-peer-improvement` (post Collective Brain V2.1 merge, PR #13). Never touched the dirty shared `World_server` checkout.
- Recipe Engine V3 installed via its `install.cjs`: 40/40 bundled tests PASS, V3 static audit 16/16 PASS.
- VFX Engine V3 installed via its `install.cjs` with `--no-wire` (its default auto-wire target, `apps/ai3d-voxel-city/client.js`, now uses `renderer?.render(...)` not the literal `renderer.render(...)` its marker regex expects — the installer's own safety check correctly aborted rather than mis-patching). 31/31 bundled tests PASS.
- Wired `apps/voxel-world/client.js` by hand instead — it's the VFX installer's own top-scored integration candidate (score 12 vs. `ai3d-voxel-city`'s 11) and the same app Recipe Engine's `voxel_worlds`/`voxel_world_events` Supabase tables back.
- Wrote `lib/world-procedural-vfx-bridge.js` (+ 8/8 tests): the actual reinforcement. Maps a Recipe Engine recipe to a VFX semantic reaction (architecture.kind → intent, atmosphere as fallback, density/ruin/darkness/fog → importance). Mirrors the existing `world-procedural-animation-bridge.js` shape exactly.
- Found and fixed a real bug while verifying live in-browser: `server.js` had no `.mjs` MIME entry, so all ~50 VFX runtime modules 404'd as `application/octet-stream` and refused to load as ES modules. Added `.mjs → text/javascript`.
- **Live browser verification** (not just Node tests): after the MIME fix, `window.WorldProceduralVfx` exists in `apps/voxel-world/`, `.semantic({intent:'transformation',...})` (the bridge's real output shape) spawned 3 real pooled VFX instances, `world:vfx` DOM CustomEvent path also confirmed independently.
- **Full `npm run release:gate`: PASS except one pre-existing, unrelated failure** — `test/multi-ai-peer-review.test.js` hits Node's default 1MB `spawnSync` buffer scanning `git diff` across many long-lived `ai/`/`opencode/` branches. Reproduced the identical failure in `World_server_openhuman` (Collective Brain only, zero procedural-patch files) to confirm it predates and is unrelated to this branch.
- Committed as 3 commits (Recipe Engine, VFX Engine + server.js fix, bridge + live wiring), pushed, draft PR opened: https://github.com/mpaykin1/World_server/pull/14

## Target state
Both engines merged, reinforcement bridge in place and tested. Supabase migration applied to whichever project the user designates (or explicitly deferred).

## Files / systems involved
Recipe: `lib/world-procedural-*.js` (27 files), `shared/world-procedural-{core,worker}.js`, `scripts/world-procedural-*.js`, `native/godot/world_procedural_contract.gd`, `supabase/migrations/20260831072856_world_procedural_recipe_atomic_commit_v3.sql`, `test/world-procedural-*.test.js`.
VFX: `shared/world-procedural-vfx/**` (runtime/test/tools, ~90 files), `lib/world-vfx-interest.js`, `integrations/godot/world_vfx_contract.gd`.
Bridge: `lib/world-procedural-vfx-bridge.js`, `test/world-procedural-vfx-bridge.test.js`.
Wiring: `apps/voxel-world/client.js` (VFX runtime init + tick/render hook + `world:vfx` listener), `server.js` (`.mjs` MIME fix), `package.json` (both patches' scripts + `release:gate` hooks), `data/technology-registry.json`.

## Known risks
Same third-party-installer boundary as every prior patch this session — neither patch's `tools/*.ps1`/optional-toolchain-fetch scripts were run (they download a pinned native toolchain and an upstream GitHub VFX example repo; both are explicitly optional accelerators with safe fallback if absent). Supabase migration is written and reviewed but **not applied anywhere** — see Errors/decisions below.

## Golden systems that must be preserved
Confirmed via the full `release:gate` PASS — every pre-existing gate ran (procedural, desktop-ai, golden, quality:*, tech:*, duplicates, contracts, project:review, evidence:score, collective-brain:*, world:recipe:*, vfx:procedural:gate) alongside the two new engines with zero regressions, modulo the one pre-existing unrelated failure below.

## Errors that must not return
- `world-procedural-toolchain.js`'s optional binary invocation (`gltfpack`/`zstd`) throws cleanly rather than silently no-oping if the optional native toolchain was never fetched/built — verified by reading the code, not just trusting docs.
- The VFX auto-wire script's marker-based abort-on-mismatch (rather than blind-patch) is itself the protection against exactly what almost happened here (`ai3d-voxel-city`'s `?.` mismatch) — worth keeping in mind for the *next* patch that tries to auto-wire that same app.
- `server.js` missing `.mjs` MIME type — now fixed; anything else in this repo shipping `.mjs` runtime modules for the browser was silently broken until this commit.

## Exact patch / change plan
As applied by each patch's own `install.cjs`, plus the hand-wiring and bridge module described above. No other manual edits.

## Tests to run
`node --test test/world-procedural-*.test.js` (40/40), `node --test shared/world-procedural-vfx/test/*.test.mjs test/world-vfx-interest.test.js` (31/31), `node --test test/world-procedural-vfx-bridge.test.js` (8/8). `npm run release:gate` — PASS except the one pre-existing `multi-ai-peer-review` failure (confirmed independently reproducible without this branch).
Not run this session: `npm run world:recipe:native:strict` (Godot differential — no Godot native build available here), `npm run world:recipe:live` (needs configured Supabase env vars — `/api/config` 500s locally, pre-existing), real device/mobile matrix.

## Deployment / PR plan
Draft PR #14 open against `ai/opencode/multi-ai-peer-improvement`. Do not merge until the Supabase migration decision is made and (if applied) verified live.

## Current progress
Repo-side install + wiring + bridge + live browser verification + full release:gate all complete and passing (modulo the one pre-existing unrelated failure). Supabase migration intentionally not applied — awaiting user decision.

## Next action
User decides: apply `20260831072856_world_procedural_recipe_atomic_commit_v3.sql` to `world-server-preview` (the project whose migration history actually matches this app's tables), a different project, or skip for now. Once decided (or explicitly deferred), this PR is otherwise ready for review.

## Completion criteria
Repo integration + tests + live browser evidence + full release gate: DONE. Supabase migration: PENDING a decision, not a technical blocker. Godot native differential and real device matrix: NOT DONE this session, flagged honestly rather than assumed.

## Final evidence
40/40 + 31/31 + 8/8 tests PASS. `release:gate` real exit code captured directly (not through a pipe that would mask it) — PASS except the one reproduced-elsewhere pre-existing failure. Live browser: `window.WorldProceduralVfx.stats().active` 0→3→5 across two independent trigger paths. PR: https://github.com/mpaykin1/World_server/pull/14 — commits `a9a3a1bb`, `775048d3`, `6b74d586`.

<!-- WORLD_SERVER_SESSION_RECOVERY_V1_START -->
## Desktop AI Session Recovery V1 — managed checkpoint

- sessionId: `session-1787632622221-75896e`
- status: `interrupted`
- checkpoint: `2026-08-28T04:57:45.608Z`
- checkpoint message: checkpoint before scheduler_kick fix - dirty 662, health DEAD overdue 625m, soak dead, honest 68/68
- last successful command: none
- last error: operation — Watchdog detected dead session/process: unfinished work exists but no responsible process is alive after 14.5 minute(s)
- next action: fix scheduler_kick npm.cmd quoting

### Recovery queue
- no explicit recovery steps registered yet

> New Desktop AI session: run `npm run desktop-ai:resume` before editing. Git reality overrides stale recovery metadata.
<!-- WORLD_SERVER_SESSION_RECOVERY_V1_END -->
