# Cinematic CPU kit — first real geometry slice

**Status:** isolated candidate implementation. NOT merged, NOT visually
certified, NOT deployed and NOT a screenshot-quality art pipeline.
Reuses the existing AI3D city renderer; no new game engine.

## Build fully offline on CPU

From the repo root, with Blender 4.2+:

    blender --background --threads 2 --python scripts/cinematic_cpu/build_pack.py
    npm install --global @gltf-transform/cli@4.4.0
    node scripts/cinematic_cpu/optimize_pack.cjs
    node scripts/cinematic_cpu/verify_pack.cjs
    node --test test/cinematic-cpu-pack.test.mjs test/cinematic-cpu-atmosphere.test.mjs test/cinematic-cpu-effects.test.mjs test/cinematic-cpu-lava.test.mjs
    python test/test_cinematic_cpu_texture.py

The generator makes real 3D geometry: hyperboloid cooling tower, turbine hall,
control block, tall stacks, pipes, vents, lit windows and industrial railings,
plus a stratovolcano with glowing lava fissures. Its HERO LOD0 now includes
32 individual tower ribs, pipe flanges/valves, close-up catwalks, guardrails,
window lintels, rooftop cabinets and bundled heat-exchanger tubes. Six GLB files are exported,
three geometric LODs for each object. Newly added pure-CPU 384/512px
art-directed concrete, oxidized steel and fractured basalt base maps plus
256px normal maps are baked and embedded, with original PNG sources and SHA checks.
Every GLB also gets a separate offline Meshopt + WebP version; its original
uncompressed PNG GLB remains untouched as verified browser fallback. Static meshes are batched by
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
The new runtime loads only the LODs allowed by device tier. It prefers
locally vendored MIT Meshopt decoding plus browser WebP with SHA-256 validation;
failures transparently fall back to original verified PNG GLBs and are logged in
stats rather than hidden. It creates bounded steam sprites, a deterministic
volcanic plume, lightweight glowing lights, an instanced basalt foreground,
reused distant industrial model silhouettes, and a one-time CPU-painted
atmospheric cloud sky, distance-culling hysteresis and low-cost accent lights;
uses native Three.js LOD. The optional QA-only eruption button triggers a
14-second visual effect, explicitly NOT an authoritative game-state event.
The original default route does NOT load any of this. Browser metrics are
exposed through `window.AI3DVoxelRuntime.stats().cinematicCpu`, including
exact optimized payload bytes, fallbacks, actual renderer draw calls,
p50/p95 RAF intervals, LOD and effects budgets.

**Important:** new geometry is VISUAL ONLY; existing voxel collisions do not
yet include these models. It is an isolated QA preview, not live gameplay.
Only the existing Gameplay/Graphics owner should connect authoritative
geothermal project coordinates, real physical collision, eruption effects and
the current atmosphere director. Do not create another rendering system.

## Stable image reference

Concept ID `WORLD-GFX-FOG-FRONTIER-20260925` has a durable small visual proxy
and the original 864x1536 source SHA in
`docs/graphics/targets/README.md`. Opt-in browser scene shows the visual
reference alongside the rendered, real interactive 3D geometry. The original
full-resolution artwork is **not** inside this branch; do not falsely claim so.

Current source GLBs + PNG sources are ~4.887 MB. Six alternative Meshopt/WebP
GLBs total **516,636 bytes**; the low mobile tier downloads only **150,356 bytes**
of 3D asset payloads in normal operation, using four optimized LOD1/2 files.
That is an asset transfer budget, NOT complete page weight or measured real-phone FPS.
The dedicated GitHub integrity workflow runs Node tests, standalone Python
texture tests, binary checksum/extension validation and syntax checks.
Separately, local desktop/mobile-emulated Playwright acceptance must run against
an actual HTTP server before integration; physical mobile QA is still outstanding.
Third-party MeshoptDecoder is vendored with its MIT license under the app's
`vendor/` folder. No paid runtime or server GPU is required.

## Required release evidence (NOT YET DONE)

- Loaded-state before/after screenshots desktop + real mobile hardware.
- Stable p50/p95 frame time, draw calls, triangles, device memory and loading.
- Source-tested exact SHA, separate independent Fleet PRE, protected merge,
  canonical deploy and independent Fleet POST (never conflate them).
- Art-direction review against the user's sketch: geometry is an early slice,
  not a photorealistic replacement for multi-million-poly reference artwork.
- Browser-emulated FPS and visual differences still require real-phone tests.
- Poly Haven CC0 source textures, authentic industrial wear, physically correct
  Blender Cycles CPU light baking and cinematic art direction remain future
  content quality work; do not claim this procedural kit equals the reference.

## CPU parallax and horizon-free strategy camera (separate stacked slice)

The existing AI3D opt-in viewer now has a real strategy-style camera: the
vertical pitch is clamped so the geometrical horizon remains at least 14°
outside the camera frustum on desktop and portrait mobile, even while orbiting.
The opt-in camera frames the foreground geothermal plant and the volcanic ridge;
the canonical city spawn, playable controls and default viewer are unchanged.

The new `cinematic-industrial-parallax.mjs` paints 2–3 detailed industrial
silhouette/fog cards once on CPU (factory buildings, lit windows, stacks,
catwalks and pipes). Existing Three.js displays them with native scene fog
and billboard transforms. Bounded memory: <500 KB on low, <4 MB on ultra.
The art target is `WORLD-GFX-FOG-FRONTIER-20260925`; these cards are distant
impostors, NOT true 3D and NOT evidence of reference-level photorealism.

Checks: `node --test test/cinematic-strategy-camera.test.mjs` (5 tests),
full cinematic Node suite (19 tests), exact asset integrity validation and
existing Playwright desktop/mobile-emulation suite (4 tests). A physical phone,
independent review and >=85% player-visible art-direction approval remain gates.
