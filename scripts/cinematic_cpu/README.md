# Cinematic CPU kit — first real geometry slice

**Status:** isolated candidate implementation. NOT merged, NOT visually
certified, NOT deployed and NOT a screenshot-quality art pipeline.
Reuses the existing AI3D city renderer; no new game engine.

## Build fully offline on CPU

From the repo root, with Blender 4.2+:

    blender --background --threads 2 --python scripts/cinematic_cpu/build_pack.py
    node scripts/cinematic_cpu/verify_pack.cjs
    node --test test/cinematic-cpu-pack.test.mjs

The generator makes real 3D geometry: hyperboloid cooling tower, turbine hall,
control block, tall stacks, pipes, vents, lit windows and industrial railings,
plus a stratovolcano with glowing lava fissures. Six GLB files are exported,
three geometric LODs for each object, alongside small deterministic PBR-style
base-color textures and a checked manifest. Static meshes are batched by
material: two to four draw calls per asset. No proprietary dataset, external
downloads, CUDA, paid API or runtime AI generation is required.

The GLB integrity validator verifies every checksum, image header, glTF2
container and budget; triangles and file size must decrease between LODs.
Its manifest says CANDIDATE_NOT_VISUALLY_VERIFIED. No fabricated percentage.

## Browser integration

In existing AI3D city, ?cinematicCpu=1 dynamically imports the optional
cinematic-cpu-runtime.mjs module AFTER default world loading. The unmodified
default route does not download the 3D pack. Existing Three.js renderer,
atmosphere, cameras, controls and default-city remain authoritative.
The new runtime loads only the LODs allowed by device tier, optionally verifies
SHA-256 in browser, creates a small bounded cheap steam-sprite group and
uses native Three.js LOD. Browser metrics are exposed through
window.AI3DVoxelRuntime.stats().cinematicCpu.

**Important:** new geometry is VISUAL ONLY; existing voxel collisions do not
yet include these models. It is an isolated QA preview, not live gameplay.
Only the existing Gameplay/Graphics owner should connect authoritative
geothermal project coordinates, real physical collision, eruption effects and
the current atmosphere director. Do not create another rendering system.

## Required release evidence (NOT YET DONE)

- Loaded-state before/after screenshots desktop + real mobile hardware.
- Stable p50/p95 frame time, draw calls, triangles, device memory and loading.
- Source-tested exact SHA, separate independent Fleet PRE, protected merge,
  canonical deploy and independent Fleet POST (never conflate them).
- Art-direction review against the user's sketch: geometry is an early slice,
  not a photorealistic replacement for multi-million-poly reference artwork.
- Better textures with free CC0 materials, offline texture compression and
  physically correct CPU light baking can follow after this first verified slice.
