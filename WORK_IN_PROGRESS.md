# WORK IN PROGRESS — WORLD_ENTRYPOINT for server.js (AI Studio follow-up)

## Task
Minimal follow-up to PR #16 (real Navigator app merged to master): add a
single `WORLD_ENTRYPOINT` environment variable that `server.js` actually
reads to redirect `/`, since master's `server.js` never read
`WORLD_NAVIGATOR_ENTRYPOINT`/`WORLD_SANDBOX_ENTRYPOINT` at all (those only
exist in the separate, unmerged `google-ai-studio/cloudrun-entry.cjs`
wrapper) - setting those env vars in Google AI Studio would have silently
done nothing.

## Why
User caught this live while preparing to re-import the AI Studio Starter
Tier apps: `/` still hard-redirects to `/apps/catalog/` regardless of any
env var on current master. Needed before any AI Studio re-import/publish
step is worth doing.

## Current state
- `server.js`: added `resolveEntrypoint()` - reads `WORLD_ENTRYPOINT`,
  returns it only if present in a whitelist (`/apps/catalog/`,
  `/apps/dark-void-scene/`), otherwise falls back to the exact previous
  hardcoded behavior (`/apps/catalog/`). `/` now calls
  `resolveEntrypoint()` instead of the hardcoded string. `WORLD_SLOT` is
  intentionally NOT read here - one shared entrypoint variable, not two
  parallel slot-specific systems; `WORLD_SLOT` stays available for a
  caller's own labeling/logging only, per the user's explicit instruction
  not to build a second parallel config system.
- Whitelist-only by design: an arbitrary/unrecognized `WORLD_ENTRYPOINT`
  value (including a full external URL) safely falls back to
  `/apps/catalog/` rather than becoming an open redirect.
- `module.exports` extended with `resolveEntrypoint`, `DEFAULT_ENTRYPOINT`,
  `ENTRYPOINT_WHITELIST` for direct unit testing.

## Target state
- Google AI Studio (or any other deployment using this same `server.js`)
  can set `WORLD_ENTRYPOINT=/apps/dark-void-scene/` and `/` will actually
  redirect to the real Navigator. Unset (or any unlisted value) keeps
  every existing deployment's behavior byte-identical to before this PR.

## Files / systems involved
- `server.js` (entrypoint resolution only - no other route logic changed)
- `test/server-entrypoint.test.js` (new)

## Known risks
- None to existing deployments: default behavior is unchanged when
  `WORLD_ENTRYPOINT` is unset, verified by a real HTTP request test, not
  just a unit-level check.
- Whitelist currently has exactly two entries. Adding a third real app
  entrypoint later means adding one line to `ENTRYPOINT_WHITELIST`, not a
  new system.

## Golden systems that must be preserved
`voxel-world`/`ai3d-voxel-city` Golden certification and the
`app-release-registry.json` deny-by-default gate from PR #16 - untouched,
verified still passing.

## Errors that must not return
`WORLD_ENTRYPOINT`/`WORLD_NAVIGATOR_ENTRYPOINT` env vars silently doing
nothing against `server.js` - regression-proofed by
`test/server-entrypoint.test.js`'s real-HTTP-request cases (not just the
pure-function unit tests) covering default, valid override, and invalid
fallback.

## Exact patch / change plan
Single-file logic change in `server.js` (see diff in this branch's commit)
plus one new test file. No other files touched.

## Tests to run
- `node --test test/server-entrypoint.test.js`: 9/9 PASS.
- `node --test` (full existing suite): run before push, must stay green.
- `node scripts/check-golden-standard.js`: PASS.
- `node scripts/project-quality-reviewer.js`: `blockers=0` (same
  pre-existing unrelated `ai3d-voxel-city` major finding as PR #16, not
  introduced here).
- `npm run release:gate`: run locally before push.

## Deployment / PR plan
Small PR, `ai/desktop/world-entrypoint-followup` -> `master`. Merge once
CI is green (or, matching PR #16's precedent, once the PR's own relevant
checks are green and any remaining red is confirmed pre-existing on
master itself, unrelated to this change).

## Current progress
Implemented, unit + integration tests passing locally, gates checked
individually. Running the full `release:gate` chain next before pushing.

## Next action
Run full `release:gate`, commit, push, open PR, wait for CI, merge, then
report `AI STUDIO ROOT ENTRYPOINT READY` with the merge commit SHA - not
before.

## Completion criteria
PR merged to master with CI in the same state as PR #16 (this PR's own
checks green; any pre-existing unrelated red confirmed as such, not
newly introduced).

## Final evidence
Not completed - PR not yet opened/merged.
