# Reference Visual Compiler

Canonical reusable World Server system for turning image/video reference observations into a graphics-generation plan without copying source frames literally.

## Pipeline

`image/video observations -> temporal aggregation -> visual grammar -> lane router -> geometry/material/light/camera/motion plans -> render systems -> render-back verification -> correction loop`

## Canonical files

- `lib/reference-video-analyzer.js` — deterministic aggregation of frame observations.
- `lib/reference-visual-grammar.js` — style/dimension/light/material/camera/detail/motion grammar.
- `lib/reference-visual-router.js` — routing to available World Server graphics lanes.
- `lib/reference-visual-compiler.js` — generation and verification plans.
- `data/reference-visual-lanes.json` — lane registry and honest availability.
- `scripts/reference-visual-compile.js` — JSON CLI.
- `test/reference-visual-compiler.test.js` — regression contract.

## Evidence boundary

The baseline compiler does not claim to understand raw MP4 bytes on its own. A vision provider or frame extractor supplies normalized observations. The compiler makes those observations deterministic, routes them to existing render systems and preserves uncertainty/blockers.

Example observation:

```json
{"sourceType":"video","frames":[{"style":["voxel","gothic"],"objects":["cathedral","bridge","spire"],"tags":["wet stone","warm windows","fog"],"dimension":"3d","lighting":{"contrast":0.9,"fog":0.7,"emissive":0.8},"camera":{"mode":"perspective"}}]}
```

## Existing lanes

- `voxel-3d`: Voxel City + semantic enhancer + material profiler + PBR synthesis.
- `mesh-3d`: AI3D playable runtime and procedural/mesh generation.
- `sprite-2d`: current CPU sprite/atlas infrastructure; arbitrary high-fidelity reference sprites still require silhouette/region evidence.
- `light-contour-3d`: canonical LIGHT for normal/depth-aware luminous outlines.
- `watercolor-3d`: success pattern exists, but canonical shared runtime files are absent from current master, so the registry marks it unavailable instead of pretending it is callable.

## CLI

`npm run graphics:reference:compile -- reference.json reference-plan.json`

## Acceptance

The compiler never declares visual SUCCESS. Final graphics must be rendered back and measured on target viewports. The user remains the authority for SUCCESS/FAILURE decisions.
