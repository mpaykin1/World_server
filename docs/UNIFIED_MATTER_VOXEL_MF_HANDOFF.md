# Unified Matter + Voxel Physics — MF Handoff

Status: **MF / Must Finish / in-progress**  
MF id: `unified-matter-voxel-runtime`

## Goal

Build one reusable World Server physics stack that can reproduce the analyzed Noita-style sequence end-to-end and apply the **same operations** to both:

- 2D pixel/cell worlds;
- 3D voxel worlds.

The target sequence includes material release and avalanche, liquids/gases, fire and spreading combustion, sparks/light/camera effects, structural support loss, detached pieces, impact/fracture/explosion, and deterministic scene transitions.

## Preserved code checkpoint

Canonical source work is preserved in:

- PR: **#432 — Unified pixel + voxel matter physics runtime**
- branch: `ai/chatgpt/matter-voxel-unified-runtime-cloud`
- exact preserved head: `1ec080f325bfa50847a64edfd7ca55e44394cc9d`

Do **not** rebuild this system from scratch in a new chat. Continue from the preserved branch/PR and refresh it against current `master`.

## Exact-head evidence for 1ec080f3

All recorded repository checks completed successfully on this SHA:

- CI — PASS
- Quality Regression Lock — PASS
- Cloudflare Exact-Head Preview — PASS
- Golden World Fleet Gate — PASS
- Science 100 Governance — PASS
- Independent Fleet PRE exact-head gate — PASS
- Visual Baseline Candidates — PASS
- World Quality Autopilot V4 — PASS
- Godot Web Vercel Preview Pipeline — PASS

During implementation, the old Matter suite plus the new unified-physics suite reached **26/26 focused tests PASS** locally before cloud validation.

## Implemented systems in PR #432

Core:
- `lib/world-matter-engine.js`
- `lib/world-structure-engine.js`
- `lib/world-cluster-engine.js`
- `lib/world-pressure-engine.js`
- `lib/world-physics-runtime.js`
- `lib/world-cell-adapters.js`
- `lib/world-physics-sequencer.js`
- `lib/world-physics-render-bridge.js`

Browser / voxel integration:
- browser runtime bundle/entry;
- Voxel World physics bridge;
- dynamic Three.js matter/cluster renderer;
- opt-in `WorldVoxelMatter` integration in `apps/voxel-world`.

Implemented behavior includes shared pixel/voxel materials, density, gravity, water/oil movement, steam, temperature, combustion/fuel, lava+water reaction, support graph, disconnected components, detached clusters, bounded impulses/rotation/collision, fracture, radial explosion/heat, deterministic sequencing, renderer events, emissive fire/lava, particles/light/camera commands, and voxel mutation synchronization.

## Current status

Last engineering readiness estimate: **72%** as of 2026-10-04.

This number is an engineering orientation only, **not** a formal release gate and must not increase without new evidence.

PR #432 is still open/draft. Its preserved SHA was green, but current `master` has advanced since the PR was created, so the next agent must first refresh/rebase safely and re-run exact-head checks rather than assuming the old mergeability state is still valid.

## Remaining Must Finish criteria

The project stays in MF until all applicable items are complete:

1. refresh PR #432 against current `master` without discarding the preserved green implementation;
2. resolve real conflicts and re-run exact-head gates;
3. merge the shared runtime to `master`;
4. prove persistence/realtime integration for changed voxel/matter state;
5. create one sequential reference-scene demo covering the analyzed events rather than isolated labs;
6. prove high-density active-cell/voxel performance with measured budgets;
7. run desktop browser proof and physical iPhone proof;
8. preserve regression tests for pixel/voxel parity, structural collapse, explosions and browser voxel mutations;
9. get explicit owner confirmation before marking the MF item done.

## Non-regression rules

- One canonical physics rule set for `pixel2d` and `voxel3d`; do not fork independent implementations.
- No scripted fake material reactions presented as physics.
- Structural analysis, explosions, cluster motion and rendering must stay bounded.
- Fail closed if a structural budget is exceeded.
- Normal Voxel World must not spontaneously enable destructive physics.
- A standalone Noita lab, a green PR, or a preview link does not by itself close this MF item.
- Do not use remembered readiness percentages as evidence.

## Related history

PR #398 was the earlier Matter Lab/Matter Engine line. PR #432 is the unified architecture direction that extends matter into structural, pressure, cluster and voxel integration. Use #398 for history only; do not create a third competing physics engine.
