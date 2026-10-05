# Living Light Cat 3D V4 — MF Handoff

Status: **MF / Must Finish / in-progress**  
MF id: `living-light-cat-3d-v4`  
Canonical app: `apps/living-light-cat-3d-v4/`  
Canonical live locator: https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v4/  
Accepted parent baseline: `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`  
V4 implementation merge SHA: `3f643acc8245b258707601866067cea069f71377`

## Goal

Finish the luminous 3D cat so the final result preserves the accepted V2 animation quality while matching the reference-light behavior more closely.

The owner explicitly requires:

1. **Incomplete outline** — the cat must not be uniformly outlined around the whole body.
2. **Variable line thickness** — strongly lit contour regions are brighter/thicker; weakly lit regions are thinner or disappear.
3. **Tail follows the torso** — the tail must inherit body/spine movement instead of appearing fixed in world space.
4. **Action-aware tail dynamics** — the tail changes pose smoothly across walk/run/sit/jump/stretch/sleep and transitions.
5. **Incomplete tail outline** — the tail must not become a fully outlined glowing tube.
6. **Real 3D motion remains mandatory** — do not fake the effect with a flat 2D contour animation.
7. Preserve the accepted V2 animation set and mobile framing unless the owner explicitly changes that requirement.

## Accepted baseline that must not be lost

The owner previously accepted Living Light Cat 3D V2 as SUCCESS.

Canonical accepted V2:
- `apps/living-light-cat-3d-v2/`
- `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`

V4 is a successor/improvement lane, not permission to overwrite or erase V2.

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

Implemented progress:
- tail meshes/joints are re-parented under animated `spine`;
- damped spline tail follower changes target shape per action;
- shared LIGHT supports opt-in `projectedEdgeWeight`;
- V4 can mathematically drive shadow-side contour to zero;
- V1/V2 accepted paths remain separate and recoverable.

## Verdict boundary

The owner has **not** explicitly marked V4 SUCCESS yet.

Do not auto-promote V4 because:
- the code is merged;
- CI is green;
- the link opens;
- a percentage is high;
- an assistant thinks it looks correct.

The project remains MF until the completion criteria below are met and the owner explicitly closes it.

## Completion criteria

- current production link is live-verified;
- body contour is visibly incomplete rather than a closed luminous outline;
- line thickness visibly varies with lighting;
- tail motion visibly follows torso/body movement;
- tail pose changes smoothly with animation state;
- tail contour is also visibly incomplete;
- accepted V2 motion behavior is not regressed;
- desktop/mobile presentation remains usable;
- owner explicitly confirms completion / removal from MF.

## Next action for any new chat

1. Read `MF.md` and `data/must-finish.json`.
2. Read this handoff.
3. Continue from current `master`; do not rebuild the cat from scratch.
4. Preserve the accepted V2 baseline.
5. Reproduce the current V4 visually before changing it.
6. Improve the incomplete LIGHT contour and tail/body coupling until owner acceptance.
