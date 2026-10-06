# Chain Reaction: atomic first-load API

Authenticated POST `/api/voxel` `{action:'game-state',worldId:'<existing-id>'}` returns a privacy-redacted saved `world`, `revision`, and canonical 0–4 `cards` from the SAME revision, including `degraded` and `fifth` free-design metadata. This read-only action makes zero writes. Optional nonnegative integer `expectedRevision` rejects stale reads with `409 STALE_REVISION`; omit it to refresh the latest world after a concurrent commit conflict. Costs and build time are always authoritative.

Every world-returning response (game-state, preview, commit, tick) and paginated history strips private comments and raw actor IDs, including legacy rows. Existing private provenance is saved atomically by the closed RPC journal.

UI #284 integration AFTER server deployment: replace parallel `genie-options` + dummy `preview-plan` with one `game-state` read. Keep degraded offers honest and do not invent cards. Exact-head CI, genuine independent reviewers, deployed desktop/mobile browser and FPS evidence are still mandatory before public release.

## Resident DTO integration with PR #285

`game-state`, `preview-plan`, `commit-plan`, and `tick` now project every saved `world.residents` entry into only `id,name,fictional,building,floor,flat`, as does PR #285's dedicated `resident-at-address` action. A tainted legacy record must not leak `comment`, `actorId`, a hidden Genie `category`, or untrusted role through any alternate world response. Merge the independently reviewed #285 first, then reconcile #286's changed Node/Edge action allowlists and its `publicState()` resident projection on the exact integration head. Re-run both focused suites, exact-head CI, independent adversarial PRE, and Fleet POST on the actually deployed SHA. The ordinary workflow named Fleet PRE is only a syntax/causal gate, not a substitute for an adversarial external review.

## Executable Edge parity regression (2026-09-24)

`test/chain-reaction-edge-runtime.test.mjs` executes the real TypeScript Edge action on Node 24, not only source regex checks; it compares same-revision game-state with Node and exercises tainted legacy resident/history privacy through preview/history/commit/tick, stale membership with unchanged JWT, honest zero-card degradation and two-writer CAS. On the previous backend head `6fd2c5f4bd948beb5e2258e0102d93f582ddf514`, 55/55 targeted checks passed with this test locally. `node scripts/check-js.js` and agent rules passed on a named review branch. Exact NEW HEAD cloud CI, independent adversarial PRE and real deployed Deno/browser Fleet POST remain outstanding; Node24 Edge import is not proof of production Supabase deployment.
