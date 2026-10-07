# Silhouette 3D system — SUCCESS

Date: 2026-10-02

User decision: **SUCCESS** for the underlying silhouette creature system.

## What is successful

The important property is not the line itself. The important property is that the visible silhouette is generated from a **real 3D character**.

The integrated World Server runtime now preserves that architecture:

- procedural Three.js 3D geometry;
- hierarchical Object3D pivots;
- a perspective camera;
- quaternion head rotation in X/Y/Z;
- a multi-joint tail chain with phase-delayed 3D motion;
- a separate mask scene;
- color + mask render targets;
- postprocess outline extraction from the rendered 3D silhouette.

## Why this worked

The source generator does not animate a flat contour. It animates geometry in 3D and only derives the silhouette during rendering. World Server now uses the same architectural rule.

That means future Living Light creatures can remain visually minimal — even a single rim line — while their motion still carries perspective, foreshortening, occlusion and depth.

## Reusable rule

**Animate volume; render line.**

Do not return to a 2D spline as the source of character motion when volumetric movement is required.

## Canonical modules

- `shared/silhouette-3d/creature-rig.mjs`
- `shared/silhouette-3d/animation.mjs`
- `shared/silhouette-3d/outline-pipeline.mjs`
- `shared/silhouette-3d/index.mjs`
- `apps/silhouette-3d-lab/`
- `test/silhouette-3d-runtime.test.js`

## Acceptance status

System architecture: **SUCCESS** by explicit user decision.

Line appearance is intentionally tracked separately and is not covered by this success.
