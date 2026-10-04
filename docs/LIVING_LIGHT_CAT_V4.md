# Living Light Cat 3D V4 — broken rim + body-coupled tail

Date: 2026-10-04

V4 is based on the committed user-approved V2 cat and the shared directional LIGHT work.

## User-requested fixes

1. The cat must **not** be outlined everywhere.
2. The tail must move with the torso rather than appearing detached/static.
3. Tail pose must change smoothly with the current action.
4. The tail itself must also receive the same incomplete, variable-thickness LIGHT treatment.

## Implementation

- V4 reuses the V2 cat rig and motion library.
- Tail meshes/joints are re-parented under the animated `spine`, so spine translation/rotation is inherited automatically.
- A spring-like tail follower blends continuously toward action-specific spline targets for idle/walk/run/sit/jump/stretch/sleep families.
- Shared LIGHT gains `projectedEdgeWeight`; V4 sets it to `0.90`, so screen-space edge direction dominates the visibility decision.
- V4 uses `shadowFloor: 0.0`, `lightCutoff: .34`, and `lightSoftness: .085`, so shadow-side contour can fully disappear.
- Thickness still varies from the same lighting signal: bright edges get a wider gold/halo band, weak edges become thin or vanish.

## Decision boundary

V1 and V2 remain user-approved SUCCESS baselines. V4 is a new candidate and must be shown to the owner before any SUCCESS/FAILURE verdict is recorded.
