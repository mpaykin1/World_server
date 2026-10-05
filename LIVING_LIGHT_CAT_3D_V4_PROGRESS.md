# Living Light Cat 3D V4 — CANONICAL PROGRESS HANDOFF

Status: **IN PROGRESS / MF (MUST FINISH)**  
Owner instruction recorded: 2026-10-05  
Canonical live URL: https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v4/  
Accepted parent baseline: Living Light Cat 3D V2  
V4 implementation merge SHA: `3f643acc8245b258707601866067cea069f71377`

## Why this file exists

This is the cross-chat checkpoint for the current Living Light Cat work. A fresh chat must continue from this code instead of reconstructing the cat from memory or starting a new implementation.

The owner has **not** marked V4 SUCCESS yet. Do not convert this checkpoint into a success verdict unless the owner explicitly does so.

## Current implementation

Primary files:
- `apps/living-light-cat-3d-v4/index.html`
- `apps/living-light-cat-3d-v4/client.js`
- `apps/living-light-cat-3d-v4/tail-motion.js`
- `apps/living-light-cat-3d-v2/cat-rig.js` — reused accepted rig
- `apps/living-light-cat-3d-v2/cat-motion-library.js` — reused accepted animation library
- `shared/light/profile.mjs`
- `shared/light/pipeline.mjs`
- `shared/light/shaders.mjs`
- `docs/LIVING_LIGHT_CAT_V4.md`
- `test/living-light-cat-3d-v4.test.js`

## Preserved accepted work

Do not destroy or overwrite the accepted V2 baseline:
- `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`
- https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v2/

V2 remains the user-approved animated baseline. V4 is the active improvement lane.

## Current owner requirements

V4 must ultimately satisfy all of these together:

1. **Incomplete outline.** The cat must not be uniformly outlined around the whole body. Light should reveal only selected contour regions, with true gaps on the shadow side.
2. **Variable line thickness.** Strongly lit contour should become brighter/thicker; weakly lit contour should become thinner and may disappear.
3. **Tail follows the torso.** The tail must inherit body/spine motion instead of appearing fixed in world space.
4. **Tail has action-aware motion.** Tail pose must change smoothly with walking, running, sitting, jumping, stretching, sleeping and related transitions.
5. **Tail also uses incomplete LIGHT.** The tail must not become a fully outlined glowing tube.
6. **Keep real 3D motion.** The effect must remain a genuinely animated 3D creature, not a flat 2D line with moving glow.
7. **Preserve the accepted animation set and mobile framing** unless the owner explicitly asks to change them.

## What V4 already added

- tail meshes/joints are re-parented under the animated `spine`;
- a damped spline follower retargets the tail per action;
- shared LIGHT has opt-in `projectedEdgeWeight`;
- V4 uses zero shadow floor and narrow lighting softness so shadow-side contour can mathematically disappear;
- V1/V2 accepted paths remain separate and recoverable.

## Definition of done

This MF item is **not done** merely because CI passes or the URL opens.

Done requires:
- working production link;
- mobile/desktop render remains functional;
- visible incomplete contour on both body and tail;
- visibly smooth tail/body coupling across motion;
- no regression to accepted V2 animation behavior;
- explicit owner acceptance, or an explicit owner instruction to remove/close this MF item.

## Fresh-chat command

If asked about “световой кот”, “Living Light Cat”, “V4”, “неполная обводка”, “движущийся хвост”, or this production URL:

1. read `AI_START_HERE.md`;
2. read `MF.md`;
3. read `data/must-finish-projects.json`;
4. read this handoff;
5. continue from `master` and the existing V4 files.
