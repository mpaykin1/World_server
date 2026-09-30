# Living Ink real-mesh NPR — open-source audit and integration record
Date: 2026-09-30

## Goal

Replace the transparent technical-sketch bottleneck with a real 3D/NPR path that can perform depth-tested visibility, selective edge rendering, richer procedural geometry and mobile walkthrough while preserving standalone/offline HTML export.

## Imported dependency

### three.js

- Official upstream: https://github.com/mrdoob/three.js
- Imported release: r160
- Package version: 0.160.0
- License: MIT
- Code/assets classification: code only
- Imported files:
  - vendor/three-r160/three.module.min.js
  - vendor/three-r160/LICENSE
- Upstream Git blob for module: 9807b610d02fd0a1833fa7ceae44239652c78f3c
- SHA-256 of imported module: 3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6
- Modifications to vendored files: none
- Required notice: preserved in THIRD_PARTY_NOTICES.txt and generated standalone HTML metadata/comment
- Commercial use status under the recorded license policy: allowed
- Runtime network dependency: none; the module is embedded into the generated autonomous artifact.

Why r160 instead of the newer split build: the r160 distribution provides one self-contained browser ES module. Newer three.js builds split core/module implementation, which increased the standalone integration surface without adding a capability required by this vertical slice. The choice is intentionally pinned rather than floating.

## Reviewed but not imported

### meshoptimizer

- Official upstream: https://github.com/zeux/meshoptimizer
- License: MIT
- Potential use: server-side mesh simplification, geometry optimization and future GLB/LOD factory.
- Decision: not imported in this slice. The current procedural office geometry is small enough that adding another dependency would not yet pay for its licensing/provenance surface.

### glTF-Transform

- Official upstream: https://github.com/donmccurdy/glTF-Transform
- License: MIT
- Potential use: future GLB optimization, deduplication, quantization and export pipeline.
- Decision: not imported in this slice because the current proof uses procedural geometry rather than external GLB assets.

### postprocessing

- Official upstream: https://github.com/pmndrs/postprocessing
- License observed during audit: Zlib.
- Potential use: post-processing/AO/edge effects.
- Decision: rejected for automatic import because the World Server code allowlist for this task is 0BSD / Unlicense / MIT / Apache-2.0. Equivalent MVP functionality is implemented locally instead.

## Locally implemented algorithms/systems

No third-party source was copied for these layers. They are World Server implementations built on the permitted three.js primitives:

1. Depth-tested hidden-line behavior
   - opaque/translucent mesh depth participation
   - polygon offset on fills
   - edge lines use depthTest and render after fills

2. Semantic edge selector
   - EdgesGeometry extracts crease/boundary candidates
   - per-semantic importance/opacity
   - near-only microdetail and distance-driven visibility

3. Rigged procedural human 2.0
   - hierarchical Group joints
   - procedural torso/head/hair/limb/clothing geometry
   - reusable walk/type/coffee/talk/meeting/sit animation states

4. Detailed office prop factory
   - real meshes for desks, monitor, keyboard, papers, mugs, chairs/wheels, plants, coffee machine, printer, meeting tables, sofa, lamps

5. Stylized grounding/AO approximation
   - generated soft alpha textures
   - depth-tested shadow/wash planes
   - no heavy per-frame Canvas blur

6. Selective glass 2.0
   - translucent depth-aware planes
   - sparse structural frames
   - reduced internal line density

7. Watercolor compositor approximation
   - deterministic soft generated textures
   - low-opacity floor/object wash layers
   - kept GPU-friendly for the MVP

8. Architectural camera director
   - walkthrough camera remains interactive
   - FRAME mode chooses a composed illustrative view without a separate scene

9. Artistic LOD 3.0
   - near-only semantic details
   - distance-aware human details and props
   - no arbitrary disappearance of core silhouettes

## Standalone architecture

The build script reads the pinned three.js module and World Server ESM modules, embeds them into one HTML, creates same-document Blob module URLs at runtime, rewrites only the internal module specifiers, then imports the entry module. No CDN or external API is required after export.

## Failures and lessons

### Failure: newer split three.js build
The newest inspected build separated module/core files. That is valid upstream architecture, but awkward for the smallest audited autonomous artifact. The slice switched to pinned r160, which is MIT and provides the required self-contained browser module.

### Failure: first standalone bundler escape
The first esbuild-based standalone builder had an invalid JavaScript regex escape in the generated build script. The build test caught it. The builder was replaced by a simpler pure-Node module embedding path, reducing build dependencies and escaping complexity.

### Failure: independent review ENOBUFS
The independent-review infrastructure attempted to materialize the full large vendored/generated diff into a small child-process buffer and failed with ENOBUFS before review. This is an infrastructure-size failure, not evidence that the renderer is correct. Future review tooling should treat audited vendor files through exact provenance/license gates and independently review first-party integration code without silently ignoring the vendor record.

## Rule for future chats

Do not revert the real-mesh/depth-tested NPR path to the old all-Canvas transparent line renderer. The Canvas renderer can remain as a fallback, but quality work should continue on the same real 3D pipeline.
