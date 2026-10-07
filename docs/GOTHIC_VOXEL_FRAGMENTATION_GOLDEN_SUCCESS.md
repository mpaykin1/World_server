# Golden Success — independent voxel debris after cannon impact

Date confirmed by user: 2026-09-30
Physical acceptance: real iPhone test — **"камни разлетаются хорошо"**.

## What succeeded

The Gothic Destruction MVP now preserves the visual meaning of a voxel structure during destruction: stones do not remain welded into one falling rigid chunk. Visible debris is converted into multiple independent Rapier rigid bodies. The cubes separate, rotate, collide and continue under gravity after the shot.

## Reusable technical pattern

Use this pattern whenever a World Server object is visibly made from discrete blocks and the intended destruction is fragmentation:

1. Keep structural authority deterministic. The structural planner decides which voxels are destroyed or unsupported.
2. Convert visible falling debris to bounded **per-voxel rigid bodies**, not one rigid body for the whole component.
3. Give every fragment a deterministic but distinct linear and angular impulse derived from impact direction, impact distance and voxel coordinates.
4. Render debris with `InstancedMesh` so independent physics does not imply one draw call per block.
5. Enforce per-shot and total active-fragment budgets.
6. Adapt DPR, shadows and physics frequency on weak/software renderers instead of welding debris back together.
7. Let sleeping bodies settle; do not keep all debris permanently active.
8. Regression tests must measure **separation**, not merely movement. Track the same voxel bodies before/after and require pairwise spread to increase.

## Why the earlier version failed

The previous performance optimization used one cluster-AABB rigid body for an entire unsupported voxel component. It made the whole piece move, but all cubes remained glued together. A test that only asked “did the body move?” was therefore a false representation of the intended physics.

## Golden implementation

- Active source: `shared/physics/rapier-collapse-runtime.mjs`
- Immutable approved copy: `shared/golden-components/gothic-voxel-fragmentation/v1/rapier-collapse-runtime.mjs`
- Golden registry: `data/golden-component-evolution.json` → `gothic-voxel-fragmentation` → `v1`
- Player-facing proof: `apps/gothic-destruction-mvp/`
- Browser regression: `e2e/gothic-destruction-mvp.spec.js`
- Failure/root-cause analysis: `docs/GOTHIC_DESTRUCTION_MVP_FAILURE_ANALYSIS.md`

## Evidence

- Focused structural/Rapier suite passed after the fragmentation change.
- Exact-head Cloudflare browser verification passed on desktop and mobile Chromium.
- Browser test requires multiple unique voxel rigid bodies and measurable divergence after impact.
- Most important acceptance evidence: the user tested the result on a real iPhone and explicitly confirmed that the stones scatter well.

## Rule for future AI agents

Do not optimize a fragmentation effect by replacing visible discrete debris with one rigid cluster. If performance is insufficient, reduce simulation/render cost while preserving independent debris semantics. A technically moving object is not enough; the visual physics must match what the object is made of.
