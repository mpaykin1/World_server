# WORK IN PROGRESS — REAL NAVIGATOR APP TO MASTER (Google AI Studio deploy prep)

## Task
Add the real World_server Navigator app (`apps/dark-void-scene/` + its
`shared/*.mjs` runtime dependency closure) to `master`, so Google AI
Studio's GitHub import (which only ever tracks the default branch and does
not stay synced with it) can publish the real, already-live production
Navigator instead of falling back to the generic `/apps/catalog/` page.
Also fixes a real `server.js` MIME bug found while verifying this.

## Why
User is publishing exactly two Google AI Studio Starter Tier apps
(navigator + sandbox, no billing account, no 90-day Free Trial limit) for
`https://dark-void-navigator.vercel.app/`'s real content. AI Studio's
import only reads the default branch, and the real Navigator source lived
only on branch `ai/opencode/navigator-engagement-v1` (922 files diverged
from any other integration branch here - not something to merge wholesale).
This PR is a minimal, targeted checkout of exactly the real app's
dependency closure onto master, not a merge of that whole branch, and not
a new/simplified Google-only app.

## Current state
- Real Navigator source located and confirmed via Vercel API (project
  `dark-void-navigator`, `prj_PuQ2JJgqHveLEy68yTRrmglygOb3`) plus a
  byte-for-byte match of the live `index.html` against
  `apps/dark-void-scene/index.html` (only the three.js import path differs
  - swapped to the same jsdelivr CDN URL the live deployment already
  proves works, since master has no `/shared/vendor/three/`).
- `apps/dark-void-scene/` (7 files) + its full transitive `shared/*.mjs`
  closure (`dark-void-scene-runtime`, `navigator-dialog`,
  `dark-void-manifestation`, `world-manifestation-engine`,
  `world-command-parser`, `world-shape-library`) checked out onto this
  branch, traced import-by-import to closure (confirmed no further
  transitive imports, no `/api/*` calls).
- `server.js`: added `.mjs` and `.webmanifest` to the static-file MIME
  table - real bug found live-testing this locally (browsers refused to
  load the Navigator's ES module scripts under strict MIME checking with
  no `.mjs` entry present).
- `data/app-release-registry.json`: registered `dark-void-scene` (the
  deny-by-default release registry requires every `apps/*` directory to be
  explicitly listed). Registered `visible:false, status:"quarantine"` -
  NOT `certified`, because `certified` here specifically means the Golden
  voxel-collision UI/physics contract `voxel-world`/`ai3d-voxel-city`
  implement, which this app deliberately does not have (it is a
  dialog+look navigator experience, not a walkable voxel world - no
  wall-collision movement by design). `project-quality-reviewer.js`
  confirmed this distinction live: marking it `certified` produced 2 real
  blockers ("lacks Golden UI shell", "lacks canonical Golden physics");
  `quarantine` (matching the same pattern `survival`/`world-sharabass`
  already use for real-but-not-Golden-certified apps) resolved both with
  zero blockers.

## Target state
- `master` carries the real Navigator content so any future Google AI
  Studio import/publish reflects the true, already-live app.
- `npm run release:gate` (this repo's full hard gate chain) passes clean.

## Files / systems involved
- `apps/dark-void-scene/*` (new)
- `shared/dark-void-manifestation.mjs`, `dark-void-scene-runtime.mjs`,
  `navigator-dialog.mjs`, `world-command-parser.mjs`,
  `world-manifestation-engine.mjs`, `world-shape-library.mjs` (new)
- `server.js` (MIME table only)
- `data/app-release-registry.json` (one new entry)

## Known risks
- Registering as `quarantine`/`visible:false` keeps it out of the internal
  public 3D-games catalog grid - intentional, since it is not a Golden
  voxel-collision game and should not be presented as one. It remains
  directly servable by URL (`server.js`'s static routing is not gated by
  the registry - only `/api/apps`'s catalog *listing* is), which is all
  Google AI Studio/Cloud Run needs to serve it as the Navigator entrypoint.
- This branch intentionally does NOT include the larger
  `WORLD_SERVER_GOOGLE_AI_STUDIO_2_SLOTS_V6` patch (Google Cloud evidence
  loop, GDD capability planner, function provenance, WASI sandbox, etc.) -
  that stays on a separate branch
  (`ai/desktop/google-ai-studio-v6-slots`) since master did not need that
  full apparatus just to serve the real Navigator, and cherry-picking it
  here hit real, substantive merge conflicts (`package.json`,
  `data/supply-chain-signing-policy.json`) against master's own
  independent evolution of those files - out of scope for this PR.

## Golden systems that must be preserved
`voxel-world` and `ai3d-voxel-city`'s existing Golden certification
(collision/mobile/direction contracts) - untouched by this change; this PR
only adds a new, separately-classified registry entry alongside them.

## Errors that must not return
- `GOLDEN STANDARD FAIL: unregistered app: dark-void-scene` - fixed by the
  registry entry above; regression-proofed by the registry entry itself
  staying present.
- `project-quality-reviewer.js` blockers from mis-certifying a
  non-Golden-physics app as `certified` - fixed by using `quarantine`
  instead; do not change this app's `status` to `certified` without first
  actually implementing the Golden UI shell/physics contract for real.
- `.mjs`/`.webmanifest` served as `application/octet-stream` - fixed in
  `server.js`'s MIME table; do not remove those two entries.

## Exact patch / change plan
Already applied on this branch (commits `2aea948c`, `9f5a50b0`) - see PR
#16 (`ai/desktop/google-ai-studio-v6-slots-pr` -> `master`) for the full
diff.

## Tests to run
- `node --test` (full existing suite): 118/118 PASS (verified before the
  registry fix; unaffected by the registry-only follow-up commit).
- `node scripts/check-golden-standard.js`: PASS.
- `node scripts/project-quality-reviewer.js`: `blockers=0` (one
  pre-existing `major` finding on `apps/ai3d-voxel-city/index.html`,
  unrelated file this PR never touched - not introduced by this change).
- `npm run release:gate` (full chain): run locally before the final push,
  must be clean before merge.

## Deployment / PR plan
PR #16, `ai/desktop/google-ai-studio-v6-slots-pr` -> `master`. Merge once
`release:gate` is clean in CI. After merge, user re-imports/re-syncs
Google AI Studio's existing "World_server" app (or creates the sandbox/
navigator Starter Tier apps fresh) from the updated master, sets
`WORLD_NAVIGATOR_ENTRYPOINT=/apps/dark-void-scene/` (or the Sandbox
equivalent) as the entrypoint override, and publishes sandbox first.

## Current progress
Registry fix committed and pushed; running the full local `release:gate`
chain now before pushing again / requesting merge.

## Next action
Confirm `release:gate` is clean locally, push this WORK_IN_PROGRESS.md
update alongside, wait for CI to go green, then merge PR #16.

## Completion criteria
CI on PR #16 fully green (all required checks pass, the two pre-existing
unrelated `improve-world-home` Vercel failures aside), then merged to
master.

## Final evidence
Not completed - PR not yet merged. Will update this section (or the next
WORK_IN_PROGRESS entry) with the CI-green confirmation and merge commit
once done.
