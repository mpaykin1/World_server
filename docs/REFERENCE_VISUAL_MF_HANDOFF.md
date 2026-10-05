# Reference Visual → Game Graphics — MF Handoff

Status: **MF / Must Finish / in-progress**  
MF id: `reference-visual-game-graphics`  
User PASS/FAIL verdict for completion: **not given**

## Goal

Build one reusable World Server pipeline where a user can provide an image or video reference and the system generates **new game graphics that match the reference in essence** rather than copying source pixels literally.

Target lanes:
- 3D voxel cities/worlds;
- normal 3D scenes and characters;
- 2D sprites;
- LIGHT / luminous contour rendering;
- Living Watercolor;
- comparable detail density, lighting, materials, camera grammar and motion.

Canonical flow:

`raw image/video → frame analysis → visual grammar → lane router → geometry/material/light/camera/motion plan → generation → render-back → perceptual comparison → bounded autotune`

## Preserved work — do not rebuild from scratch

| Capability | PR | Branch | Preserved head |
| --- | ---: | --- | --- |
| Universal Reference Visual Compiler | #412 | `ai/chatgpt/reference-visual-compiler` | `7654416896ef06d5b3a7ee2dd252e8af5dd2de00` |
| Raw image/video analyzer | #423 | `ai/chatgpt/reference-media-analyzer` | `63a3b201076cb2c0caef45ad905b78019f078dfb` |
| Render→compare→autotune loop | #424 | `ai/chatgpt/reference-visual-autotune` | `5d5a8e8749c1b1ee988ce7d678f8a7f21c058cab` |
| Reference-derived sprite synthesis | #425 | `ai/chatgpt/reference-sprite-synth` | `815f8afbfaaf49db5ee8900cac30bd4f981993df` |
| Living Watercolor primitives | #426 | `ai/chatgpt/watercolor-primitives` | `53c70339ae3f3b169b1cc95e4db4dc816cd80130` |
| Living Watercolor runtime facade | #427 | `ai/chatgpt/watercolor-runtime-facade` | `15e9ea64b2107bef1e5f831924adbcc20b5941bb` |
| Watercolor generators + gate | #428 | `ai/chatgpt/watercolor-generators-gate` | `1e3a12997f3262beaa9b63717acd0fadcde86c42` |
| Reference Material + canonical PBR | #429 | `ai/chatgpt/reference-material-reconstruction` | `3a161bd4f846d3af57a7f9cd89915c87924da3a9` |
| Perceptual reference fidelity | #430 | `ai/chatgpt/reference-perceptual-fidelity` | `964070eb8392c8c761871f301da01340bc1628bb` |

Direct PR locators:
- https://github.com/mpaykin1/World_server/pull/412
- https://github.com/mpaykin1/World_server/pull/423
- https://github.com/mpaykin1/World_server/pull/424
- https://github.com/mpaykin1/World_server/pull/425
- https://github.com/mpaykin1/World_server/pull/426
- https://github.com/mpaykin1/World_server/pull/427
- https://github.com/mpaykin1/World_server/pull/428
- https://github.com/mpaykin1/World_server/pull/429
- https://github.com/mpaykin1/World_server/pull/430

## Preserved capability checkpoint

Implemented/preserved in the PR stack:
- deterministic Visual Grammar;
- routing to voxel-3d / mesh-3d / sprite-2d / LIGHT / silhouette / watercolor lanes;
- raw image/video frame sampling with Pillow/NumPy and ffmpeg;
- palette, contrast, fog/emissive proxies, edge density and coarse scene classification;
- temporal motion amount, cut rate, centroid drift and camera-motion grammar;
- bounded render→compare→correction iterations;
- reference-derived four-frame sprite atlas;
- restored Living Watercolor primitives/runtime/semantic generators/reference gate from the user's own earlier repository history;
- material reconstruction reusing canonical World Server Material Profiler + PBR Synthesizer;
- perceptual comparison for composition, lighting, palette, detail/edges and material readability.

Last engineering readiness estimate: **78%** as of 2026-10-04.

This number is an engineering orientation only. It is **not a release gate, not a PASS verdict, and not permission to increase readiness without new evidence**.

## Remaining Must Finish criteria

1. refresh/reconcile the PR stack against current `master`;
2. merge the reusable layers safely into `master` without bypassing real gates;
3. preserve the CPU/no-paid-API baseline;
4. prove deep semantic extraction for architecture/object grammar such as cathedral, arch, bridge, spire, windows and characters;
5. prove complete **raw video → generated gothic voxel game scene → render-back → perceptual compare → autotune**;
6. prove complete **2D reference → generated sprite atlas → animation → perceptual compare**;
7. prove Watercolor and LIGHT routing after integration rather than only in stacked branches;
8. prove desktop and physical iPhone behavior/performance where applicable;
9. add regression protection for every confirmed failure found during integration;
10. get explicit user confirmation before changing `mfStatus` to `done` or removing the item from MF.

## Non-regression rules

- Reuse existing World Server graphics systems instead of creating a duplicate engine.
- The target is similarity **in essence**, not literal pixel copying.
- Do not silently introduce paid API usage; keep a free/CPU fallback.
- Do not inflate readiness for plans, documentation, PR creation or unverified previews.
- A machine fidelity threshold is evidence, **not** the user's PASS/FAIL verdict.
- Do not mark the project finished because one lane works; the goal is the reusable cross-lane pipeline.
- Stored URLs and SHAs are recovery locators; re-check current state before using them as live proof.

## Fresh-chat continuation

Read `AI_START_HERE.md`, `MF.md`, `data/must-finish.json`, then this handoff. Inspect current states of PRs #412 and #423–#430 before editing code. Continue the preserved stack; do not rebuild it from memory.
