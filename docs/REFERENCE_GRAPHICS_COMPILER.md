# Reference Graphics Compiler

Canonical World Server system for turning **image/video visual evidence into game-rendering recipes**.

## Goal

The system does **not** copy a reference pixel-for-pixel. It extracts a reusable visual grammar:

```
sampled frames
-> measurable frame/temporal statistics
-> visual grammar
-> graphics lane routing
-> geometry/material/light/camera/motion recipes
-> render-back
-> prioritized correction loop
```

This makes one reference useful across different rendering lanes. A gothic voxel city routes to the voxel/semantic/PBR stack. A 2D pixel reference routes to sprite recipes. A luminous 3D creature adds LIGHT over genuine 3D geometry.

## Canonical modules

- `lib/reference-frame-analyzer.js` — CPU RGBA and temporal measurements.
- `lib/reference-visual-grammar.js` — converts measurements + explicit semantic hints into a visual grammar.
- `lib/reference-graphics-router.js` — routes the grammar into existing World Server graphics lanes.
- `lib/reference-recipe-compiler.js` — produces interoperable geometry/material/light/camera/motion recipes.
- `lib/reference-correction-planner.js` — closes the loop after render-back and prioritizes the largest mismatch.
- `lib/reference-sprite-generator.js` — generic CPU semantic-part sprite rasterizer with palette, outline and shading bands.
- `shared/reference-graphics/video-sampler.mjs` — browser video sampler that produces bounded RGBA evidence frames.
- `data/reference-graphics-policy.json` — machine-readable contract.

## Important boundary: pixels vs semantics

Pixels can measure palette size, brightness, contrast, warm/cool balance, edge density, blockiness, glow candidates and frame-to-frame motion.

Pixels alone **cannot honestly prove** that an object is a cathedral, bridge, knight, office worker or dragon. Those identity terms come from an explicit semantic hint or a future multimodal semantic adapter. The compiler records this distinction instead of hallucinating it.

## Current routing

### Voxel / block worlds
Uses the existing `VoxelCityEngine`, semantic voxel enhancer and PBR material synthesizer.

### General 3D
Routes to the existing AI3D worker. Recipes require semantic decomposition, silhouette-first construction and reference camera matching.

### LIGHT
References with strong emissive/local-light grammar can add the canonical `shared/light/index.mjs` layer without flattening the underlying 3D.

### 2D sprites
The compiler emits a general sprite style recipe and `reference-sprite-generator` can rasterize semantic parts into deterministic shaded/outlined frames or atlases. Automatic semantic part extraction still requires explicit hints or a multimodal semantic adapter; the renderer itself is no longer limited to smoke/ripple/ash.

### Watercolor
A user-validated Watercolor success record exists, but the canonical runtime files are not currently present in `master`. The router therefore exposes this as a blocker instead of pretending that lane is executable.

## Video references

`shared/reference-graphics/video-sampler.mjs` samples a browser `HTMLVideoElement` at deterministic bounded times and outputs RGBA frames. The compiler measures temporal motion/flicker across them. A future server-side decoder may feed the same frame contract without changing the grammar layer.

A single frame may produce a static recipe; it must not be treated as proof of temporal similarity.

## Correction order

The correction planner intentionally prioritizes:
1. projection/camera;
2. silhouette and major structure;
3. emissive/local lighting;
4. overall contrast;
5. detail density;
6. palette/material temperature;
7. motion cadence;
8. microdetail.

That prevents the old failure mode where lots of detail was added to the wrong large shape.

## Decision boundary

This compiler is technical infrastructure. It does not mark a visual result SUCCESS or FAILURE. That decision remains with the user.
