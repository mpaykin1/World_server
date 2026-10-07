# Living Light Cat 3D V4 — MF Handoff

Status: **MF / Must Finish / in-progress**  
MF id: `living-light-cat-3d-v4`  
Canonical app: `apps/living-light-cat-3d-v4/`  
Canonical live locator: https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v4/  
Accepted parent baseline: `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`  
V4 implementation merge SHA: `3f643acc8245b258707601866067cea069f71377`

## Goal

Finish the luminous 3D cat without losing the user-approved V2 animation baseline.

Owner requirements:
- the body must **not** be uniformly outlined around the whole silhouette;
- line thickness must visibly vary with lighting;
- shadow-side contour may disappear;
- the tail must inherit torso/spine motion;
- tail pose must change smoothly with walk/run/sit/jump/stretch/sleep and transitions;
- the tail itself must also have an incomplete light-driven outline;
- motion remains genuinely 3D;
- preserve accepted V2 animation behavior and mobile framing unless explicitly changed.

## Accepted baseline

Living Light Cat 3D V2 is a user-approved SUCCESS:
- `apps/living-light-cat-3d-v2/`
- `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`

V4 is an improvement lane and must not overwrite or erase V2.

## Current V4 implementation

Primary files:
- `apps/living-light-cat-3d-v4/index.html`
- `apps/living-light-cat-3d-v4/client.js`
- `apps/living-light-cat-3d-v4/tail-motion.js`
- `apps/living-light-cat-3d-v2/cat-rig.js`
- `apps/living-light-cat-3d-v2/cat-motion-library.js`
- `shared/light/profile.mjs`
- `shared/light/pipeline.mjs`
- `shared/light/shaders.mjs`
- `docs/LIVING_LIGHT_CAT_V4.md`
- `test/living-light-cat-3d-v4.test.js`

Preserved progress:
- tail geometry is parented under animated `spine`;
- damped spline tail motion changes target shape per action;
- LIGHT supports directional/projected-edge weighting;
- shadow-side contour can mathematically reach zero;
- V1/V2 accepted paths remain separate and recoverable.

## Verdict boundary

The owner has **not** explicitly marked V4 SUCCESS.

Do not mark this MF item done merely because CI passes, code is merged, a URL opens, or an assistant thinks the result is visually correct.

## Completion criteria

- production link freshly live-verified;
- body contour visibly incomplete rather than closed;
- line thickness visibly varies with lighting;
- tail visibly follows body/torso movement;
- tail pose changes smoothly with animation state;
- tail contour visibly incomplete;
- V2 animation behavior not regressed;
- desktop/mobile presentation usable;
- owner explicitly confirms completion/removal from MF.

## Fresh-chat continuation

Read `MF.md` → `data/must-finish.json` → this handoff, then continue from current `master`. Do not rebuild the cat from scratch.
