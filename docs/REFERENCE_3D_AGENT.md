# REFERENCE3D_AGENT — multi-view reference to verified 3D

Date: 2026-10-04

## Purpose

REFERENCE3D_AGENT is the World Server orchestration layer for turning two or more visual references into an editable 3D asset while reusing the systems already present in the repository.

Primary target: FRONT + RIGHT pixel-art references can reconstruct an editable voxel 3D object. Perspective photos or arbitrary screenshots take the calibrated AI3D lane instead of being falsely treated as orthographic truth.

## Architecture

reference views (2..8)
→ path-free context manifest
→ scene/reference inspection
→ camera calibration when perspective evidence exists
→ depth + segmentation evidence
→ geometry reconstruction
  - deterministic Pixel2World visual hull for orthographic pixel art
  - existing AI3D worker/providers for perspective/general references
→ Blender mesh cleanup
→ retopology
→ UV unwrap
→ PBR material/projection pipeline
→ optional ActionForge/Quaternius retarget/animation
→ GLB export scoped to active scene/selection
→ isolated re-import into temporary collection
→ bounds/mesh/material/UV/animation/non-manifold checks
→ multi-view render-back
→ existing reference/runtime fidelity gate
→ technically verified candidate
→ explicit owner PASS/FAIL only after user review

## Mixar study and license boundary

The architecture was informed by public Mixar source/docs, pinned for study at Mixar-AI/mixar-app@edaeb32f28f7b70cd3ba59f906b0e4e1ef40cd55.

World Server does not vendor Mixar source code or assets. Mixar is GPL-family and its hosted backend is not the World Server backend. The imported value is the capability pattern: scene-aware multi-step agent, context manifests, cleanup/UV/material tooling, export lane and post-export verification. World Server implements those ideas independently and routes work through its pre-existing systems.

## Reused World Server capabilities

- shared/pixel3d/multiview-voxel.mjs: deterministic FRONT + SIDE pixel-art visual hull.
- services/ai3d-worker/: existing general reconstruction/provider routing.
- services/ai3d-worker/tools/run_building_blender.py: existing Blender export precedent.
- apps/ai3d-reference-test/render_blender.py: multi-view clay/textured render-back.
- lib/reference-fidelity.js: reference/runtime comparison.
- existing World Factory reference pipeline: evidence-gated identity/depth/geometry/PBR/runtime correction.
- ActionForge/Quaternius library for optional animation retargeting.
- LIGHT remains a render style layer, not a reconstruction engine.

No second renderer, database, world engine or asset catalog is introduced.

## Multi-view truth rules

1. Two orthographic pixel-art views constrain a maximal visual hull; they do not prove hidden geometry.
2. Perspective references require calibration before cross-view geometry claims.
3. Hidden surfaces remain unknown until supported by evidence or an explicitly labelled generative assumption.
4. At least two distinct view roles are required to leave collect-views.
5. Up to eight views can be registered.

## Scene-aware agent loop

lib/reference-3d-agent.js stores a compact state machine. Every task is technical and evidence-bearing. A task may be pending, running, verified, failed or blocked. Failed passes consume a bounded correction budget.

The agent can reach technically-verified; it cannot set userVerdict=SUCCESS or FAILURE. That boundary is intentionally reserved for the user's explicit decision.

## Export verification

The canonical GLB export contract requires:

- active-scene export;
- selected-object scope;
- non-empty file;
- isolated re-import into a temporary collection in the active scene;
- finite world-space bounds;
- mesh count stability;
- material and UV presence;
- non-manifold edge reporting;
- animation clip preservation when animation is expected;
- render-back comparison after re-import.

This prevents a successful exporter call from being mistaken for a valid asset.

## Free-only policy

The default state is freeOnly=true. The general AI3D lane may use existing CPU/local paths and already-configured free Hunyuan3D/InstantMesh-style routes. No paid API is enabled by this capability.

## Fresh-chat rule

When a new chat receives a task involving two images to 3D, multi-view 3D, Pixel2World, reference reconstruction, Mixar-like Blender automation, retopo/UV/export verification or scene-aware 3D agents, open REFERENCE_3D_AGENT.md and this document before starting a parallel implementation.
