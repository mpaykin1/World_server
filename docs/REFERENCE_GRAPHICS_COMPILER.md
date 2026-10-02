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
The compiler now emits a general sprite style recipe: palette budget, outline strength, shading bands, animation cadence and semantic-parts requirement. The existing CPU sprite runtime remains narrow (smoke/ripple/ash), so a general semantic sprite renderer is still a runtime blocker rather than a hidden fake capability.

### Watercolor
A user-validated Watercolor success record exists, but the canonical runtime files are not currently present in `master`. The router therefore exposes this as a blocker instead of pretending that lane is executable.

## Video references

Video decoding is an adapter concern. The compiler accepts multiple sampled RGBA frames and measures temporal motion/flicker across them. Browser/FFmpeg adapters can feed those frames without changing the grammar contract.

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
