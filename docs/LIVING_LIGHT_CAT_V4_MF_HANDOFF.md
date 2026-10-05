# Living Light Cat 3D V4 — MF Handoff

Status: **MF / Must Finish / in-progress**  
MF id: `living-light-cat-3d-v4`  
Canonical app: `apps/living-light-cat-3d-v4/`  
Canonical live locator: https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v4/  
Accepted parent baseline: `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`  
V4 implementation merge SHA: `3f643acc8245b258707601866067cea069f71377`

## Goal

Finish the luminous 3D cat without losing the user-approved V2 animation baseline.

The owner explicitly requires:

1. **Incomplete outline** — the cat must not be uniformly outlined around the entire body.
2. **Variable line thickness** — stronger light creates a brighter/thicker line; weaker light creates a thinner line or a gap.
3. **Tail follows the torso** — the tail must inherit body/spine motion instead of appearing fixed in world space.
4. **Action-aware tail motion** — the tail changes position smoothly with walk/run/sit/jump/stretch/sleep and transitions.
5. **Incomplete tail outline** — the tail must not read as a fully outlined glowing tube.
6. **Real 3D motion** — do not replace the real 3D character with a flat 2D contour trick.
7. Preserve the accepted V2 motion set and mobile framing unless the owner explicitly changes those requirements.

## Accepted baseline that must be preserved

Living Light Cat 3D V2 was explicitly accepted by the owner as SUCCESS.

Canonical accepted V2:
- `apps/living-light-cat-3d-v2/`
- `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`

V4 is an improvement lane. It must not overwrite or erase V2.

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
- tail geometry is parented under animated `spine`;
- damped spline motion changes tail target shape per action;
- LIGHT supports directional/projected edge weighting;
- V4 can mathematically drive shadow-side contour to zero;
- accepted V1/V2 paths remain separate and recoverable.

## Verdict boundary

The owner has **not** explicitly marked V4 SUCCESS.

Do not mark this project complete just because:
- code is merged;
- CI is green;
- a link opens;
- an assistant thinks the result looks right.

## Completion criteria

- production link is freshly live-verified;
- body contour is visibly incomplete rather than closed;
- line thickness visibly varies with lighting;
- tail visibly follows torso/body movement;
- tail pose changes smoothly with animation state;
- tail contour is also visibly incomplete;
- accepted V2 animation behavior is not regressed;
- desktop/mobile presentation remains usable;
- owner explicitly confirms completion/removal from MF.

## Fresh-chat continuation

1. Read `MF.md` and `data/must-finish.json`.
2. Read this handoff.
3. Continue from current `master`; do not rebuild the cat from scratch.
4. Preserve the accepted V2 baseline.
5. Reproduce the current V4 visually before changing it.
6. Continue until the owner explicitly accepts the result.
