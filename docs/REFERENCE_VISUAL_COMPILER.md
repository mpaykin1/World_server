# Reference Visual Compiler

Canonical World Server layer: `image/video observations -> temporal aggregation -> visual grammar -> lane router -> geometry/material/light/camera/motion plan -> render-back verification -> corrections`.

Files: `lib/reference-video-analyzer.js`, `lib/reference-visual-grammar.js`, `lib/reference-visual-router.js`, `lib/reference-visual-compiler.js`, `data/reference-visual-lanes.json`, `scripts/reference-visual-compile.js`.

The deterministic baseline consumes normalized visual observations; it never pretends raw MP4 bytes were semantically understood. A vision/frame adapter may supply style, objects, palette, lighting, camera and motion evidence without changing downstream renderers.

Current lanes: `voxel-3d` (Voxel City + semantic detail + PBR), `mesh-3d` (AI3D playable), `sprite-2d` (CPU atlas; arbitrary high-fidelity sprites still need silhouette/region evidence), `light-contour-3d` + `silhouette-3d` (LIGHT), and `watercolor-3d` marked unavailable because its documented-success shared runtime is absent from current master.

CLI: `npm run graphics:reference:compile -- reference.json reference-plan.json`.

Acceptance: render back, measure target viewports, then show the user. The compiler never decides visual SUCCESS/FAILURE.
