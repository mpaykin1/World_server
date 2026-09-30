# Living Ink real-mesh NPR v3 — successful MVP evidence and lessons

Date: 2026-09-30

## Result

The Living Ink / ASQURA graphics path now has a second renderer generation based on real 3D WebGL meshes rather than the previous all-Canvas projected primitives.

Exact browser-verified implementation head:
e11f851eebcd7c92f7846b0622b57a7f7b6b1604

Browser evidence workflow:
Living Ink WebGL NPR v3 / run 36677216354

Evidence artifact:
living-ink-webgl-v3-evidence-e11f851eebcd7c92f7846b0622b57a7f7b6b1604

Published scratch-chain-reaction artifact commit:
ac940623123fc25436eb7c625e81833062bd2f60

## What is actually implemented

### Real 3D and visibility
- THREE.WebGLRenderer
- real Box/Cylinder/Sphere/Plane geometry
- depthTest/depthWrite participation
- polygon offset for filled meshes
- depth-tested EdgesGeometry line pass
- hidden surfaces no longer use the old always-visible X-ray Canvas line model

### Semantic edge rendering
- boundary/crease candidates generated from real mesh geometry
- per-object edge opacity and importance
- micro-detail can be near-only
- line information reduces by distance

### Procedural humans
- hierarchical joints/groups
- volumetric torso/head/hair/arms/legs/shoes/clothing pieces
- reusable walk/type/coffee/talk/meeting/sit states
- near-distance shirt/tie/badge/shoe detail
- later refinement replaces the box torso with a tapered low-poly suit volume

### Detailed office props
The scene uses reusable 3D factories for:
- desks and legs
- monitors and stands
- keyboards
- mugs
- documents
- office chairs including wheel bases
- plants
- coffee machines
- printers
- meeting tables/whiteboards
- lounge furniture
- pendant lights
- glass office rooms

### Glass, grounding and watercolor
- sparse transparent glass planes and structural frames
- soft generated shadow textures used as depth-tested floor planes
- low-opacity generated wash planes rather than expensive dynamic blur
- no external texture files

### Camera and controls
- existing left-thumb movement/right-thumb look architecture preserved
- keyboard fallback preserved
- FRAME architectural camera is the same 3D scene, not a second fake illustration

### Artistic LOD 3.0
- semantic detail visibility is tied to camera distance
- near accessories can disappear while the core object remains
- core silhouettes are not removed merely to improve FPS

## Open-source integration

Imported:
- three.js r160 / package 0.160.0
- official upstream: https://github.com/mrdoob/three.js
- MIT
- exact module SHA-256: 3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6
- no modifications to vendored upstream files

Reviewed but deliberately not imported:
- meshoptimizer — MIT; reserve for future server-side simplification/GLB LOD
- glTF-Transform — MIT; reserve for future GLB optimization pipeline
- pmndrs/postprocessing — observed Zlib; not automatically imported because it is outside this task's automatic code allowlist

No external models, textures, fonts, animations or training assets were imported.

## Verified evidence

Focused architecture/license job:
- standalone build: PASS
- focused Node tests: 4/4 PASS
- third-party license gate: PASS
- generated artifact reproducibility: PASS

Real browsers:
- Desktop Chromium: 3/3 PASS
- iPhone WebKit emulation: 3/3 PASS

Behavioral evidence:
- renderer marker three-webgl-npr-v3
- realMeshes=true
- hiddenLine=true
- depthTest=true
- 10 required quality-system markers present
- >=10 procedural office workers
- non-zero triangles and draw calls
- no external HTTP(S) runtime requests
- walkthrough movement works
- FRAME mode works
- animation remains alive after browser network is switched offline
- canvas covers the viewport

A CI screenshot from iPhone WebKit visibly shows the new geometry occupying the scene: desks, monitors, wheeled chairs, plants, glass rooms and volumetric people are all rendered through the real-mesh path. The renderer replacement affects the complete world canvas rather than a small HUD feature, so the feature's user-visible coverage is effectively the full game viewport. This is not a claim of 85% reference-image similarity.

## Failures that taught the final implementation

### 1. Newest three.js build increased standalone surface
The newer inspected build separates module/core implementation. It is valid upstream design, but adds files and provenance surface without helping this MVP. A self-contained pinned r160 module gave the required renderer/EdgesGeometry/WebGL features with a smaller standalone dependency graph.

### 2. Initial esbuild builder failed
The first builder version contained an invalid regex escape around inline script protection. The build test failed before publication. The successful builder is simpler: pure Node reads the modules and creates same-document Blob modules.

Lesson: for one autonomous artifact, minimize build magic before adding more bundler machinery.

### 3. r160 migration left stale r186 assertions
The first CI run correctly failed because the test still expected the r186 tag/path/copyright. The assertions were corrected to the exact audited r160 provenance and CI reran green.

Lesson: provenance tests must pin exactly the artifact actually shipped.

### 4. Independent review infrastructure hit ENOBUFS
The adversarial-review workflow attempted to capture a large vendored/generated diff using a small child-process buffer and failed before model review.

This is not counted as a code-quality PASS. The third-party file is instead protected by exact provenance + hash + license gates, while the review infrastructure needs a bounded large-diff strategy.

### 5. Old Canvas renderer produced visible X-ray clutter
The previous renderer had useful artistic primitives but could not robustly suppress hidden lines because it projected everything before painting.

Lesson: depth visibility belongs in the real 3D render stage. Canvas-style watercolor can remain as an artistic compositor/fallback, not the visibility source of truth.

## Why the MVP succeeded

The main improvement came from changing the representation, not from drawing more lines.

Old:
procedural object -> projected 2D primitives -> sort -> paint

New:
procedural object -> real mesh -> depth buffer -> visible surfaces -> semantic crease/boundary edges -> stylized material/wash -> framebuffer

That gives Living Ink enough structural information to decide what should be visible before stylization.

## Remaining quality gap

Do not interpret this success as completion of the reference target.

Still visibly below the approved ASQURA reference:
- human anatomy and clothing nuance
- elegant pose silhouettes
- micro-prop density
- architectural camera staging
- watercolor pooling/granulation
- sophisticated silhouette-weight variation
- composition density without clutter

Those should be improved inside this real-mesh NPR path, not by starting a third disconnected renderer.

## Reuse rule for future chats

The preferred high-quality path is now:
- shared/living-ink-webgl-npr.mjs
- shared/living-ink-webgl-human.mjs
- shared/living-ink-webgl-scene.mjs
- apps/living-ink-office/webgl-entry.mjs
- scripts/build-living-ink-webgl.js

The older Canvas Living Ink path may remain as fallback/prototyping infrastructure, but it must not replace real depth-tested NPR for ASQURA-class visual targets.
