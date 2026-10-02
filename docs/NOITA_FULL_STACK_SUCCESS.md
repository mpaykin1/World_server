# Noita Full Stack for World Server — success record

Date: 2026-10-02

## Goal

Build the reusable systems needed to reproduce the behavior visible in the analyzed Noita-style video without scripting the visible result frame-by-frame.

The target pipeline is:

WORLD
→ solid voxels / structural cells
→ matter cells
→ local material rules
→ active/sleeping regions
→ structural connectivity
→ detached rigid clusters
→ fire + temperature + phase changes
→ particle events
→ emissive/glow lighting
→ pixel-perfect renderer
→ camera zoom/cut/shake
→ sprite/entity animation

## Implemented systems

### 1. Sparse 3D Matter World

File: `lib/world-matter-engine.js`

Existing MatterWorld was extended with:
- material integrity metadata;
- structural metadata;
- emissive metadata;
- an event stream;
- move/reaction/phase-change/ignite events.

It remains deterministic and suitable for server-authoritative world state.

### 2. High-density typed-array matter plane

File: `lib/world-matter-dense-grid.js`

Purpose: Noita-like regions containing thousands of independently simulated cells without creating one JavaScript object per cell.

State is stored in typed arrays:
- material: Uint8Array
- temperature: Int16Array
- fuel: Uint8Array
- life: Uint8Array
- flags: Uint8Array
- active/next-active: Uint8Array

Supported behavior:
- sand/ash falling and diagonal settling;
- liquids falling and lateral flow;
- density displacement;
- steam/fire rising;
- water ↔ steam;
- lava + water → stone + steam;
- ignition, fuel and ash;
- active-cell wake/sleep frontier;
- hard per-tick processing budget;
- external collision mask.

Dense movement events are disabled by default because allocating one event object per moving grain was a measurable hot-path cost.

### 3. Structural integrity and support graph

File: `lib/world-matter-structure.js`

The structural analyzer:
- finds structural cells;
- flood-fills support from ground/anchors;
- finds disconnected components;
- detaches unsupported components automatically;
- supports direct damage/integrity loss.

This enables:
support removed
→ connectivity lost
→ component detached

instead of scripted collapse animation.

### 4. Rigid clusters

File: `lib/world-matter-structure.js`

A disconnected structural component becomes one RigidCluster:
- center/relative cells;
- velocity;
- gravity;
- angular velocity;
- grid collision;
- fall/rotation;
- collision and settle;
- high-speed shatter back into granular matter.

This avoids simulating a large falling wall as thousands of independent falling pixels while it is still one connected body.

### 5. Dense ↔ sparse collision and chemistry bridge

File: `lib/world-noita-runtime.js`

The two matter representations are not independent demos.

The bridge provides:
- dense sand/water/lava blocked by sparse solid walls;
- dense matter blocked by currently falling rigid clusters;
- rigid clusters collide with dense solid/powder matter;
- dense fire/lava can ignite sparse structural wood;
- structural consequences can therefore be caused by dense matter.

Example real chain:

dense fire
→ sparse wood ignition
→ wood loses support
→ unsupported component
→ rigid cluster
→ fall/rotation
→ impact
→ settle or shatter

### 6. Automatic structural collapse

File: `lib/world-noita-runtime.js`

NoitaRuntime periodically evaluates structural support. Collapse therefore does not require a scene-specific "play collapse animation" call.

Burning or damaging a support is sufficient.

### 7. Matter event → particle bridge

File: `lib/world-matter-particles.js`

Particle types include:
- sparks;
- embers;
- cross/magic particles;
- smoke;
- steam;
- debris;
- droplets.

Properties include:
- position;
- velocity;
- gravity/buoyancy;
- lifetime;
- fade;
- size;
- color;
- additive/normal blend mode;
- rotation/spin.

Matter events automatically create relevant VFX.

### 8. Pixel-perfect camera

File: `lib/world-matter-camera.js`

Supports:
- fixed world cell size;
- camera-dependent screen pixel size;
- integer/pixel-perfect cell scale;
- pan;
- animated zoom;
- hard cut;
- screen ↔ world coordinate conversion;
- camera shake;
- visible bounds.

This directly implements the video rule:
world cell size is fixed; visible pixel size changes with camera zoom.

### 9. Sharp matter + soft light renderer

File: `lib/world-matter-renderer.js`

The renderer deliberately separates the two visual layers:
- crisp cell geometry with image smoothing disabled;
- separate emissive/glow canvas;
- blurred additive light pass;
- local radial light halos;
- burning-cell highlights;
- steam/water transparency;
- rigid-cluster overlay;
- particle overlay;
- entity layer.

This implements:
sharp pixel + soft glow

instead of blurring the pixel art itself.

### 10. Sprite animation and entity movement

File: `lib/world-sprite-runtime.js`

SpriteAnimator supports:
- clips;
- frame lists;
- fps;
- loop/non-loop;
- frame atlas rendering;
- flip direction;
- custom pixel-frame renderer.

SpriteEntity adds:
- x/y position;
- velocity;
- movement direction;
- gravity;
- ground collision;
- jump;
- aim angle;
- animation-state selection.

The character therefore remains a shape-preserving entity instead of being decomposed into matter cells.

### 11. NoitaRuntime orchestrator

File: `lib/world-noita-runtime.js`

NoitaRuntime composes:
- sparse MatterWorld;
- DenseMatterGrid;
- RigidClusterSystem;
- MatterCamera;
- MatterParticleSystem;
- cross-layer chemistry/collision;
- automatic structural collapse.

Public aggregate entry:
`lib/world-noita-stack.js`

## Visual proof

App:
`/apps/noita-full-stack-mvp/`

It demonstrates in one runtime:
- 3 px/cell pixel scale;
- thousands of sand cells and avalanches;
- water/oil density behavior;
- lava/water reaction;
- sustained wood fire;
- automatic structural consequences;
- detached rigid clusters;
- particles;
- emissive glow;
- zoom/cut/shake;
- animated controllable pixel character;
- spell/magic particles.

The browser bundle is built from `lib/world-noita-stack.js`; the demo does not use a separate fake physics implementation.

## Automated evidence

### Node capability suite

Relevant Noita stack tests: 30/30 PASS.

Coverage includes:
- sparse matter rules;
- dense typed-array matter;
- density;
- phase changes;
- combustion;
- determinism;
- sleep/wake;
- external collision masks;
- structural support;
- detach;
- rigid fall;
- impact shatter;
- camera transforms;
- pixel scale;
- particle event bridge;
- sprite animation/entity motion;
- dense → sparse fire ignition;
- full runtime composition.

### Browser E2E

File:
`e2e/noita-full-stack.spec.js`

Desktop Chromium:
PASS.

Mobile WebKit:
PASS.

The E2E verifies:
- >1000 initial matter cells;
- exactly enough new cells to exceed 5000 after the "4000 sand" action;
- live active frontier;
- lava creates emissive rendering + particles;
- fire creates emissive rendering + particles;
- support destruction reaches `rigid > 0` while the cluster is in flight;
- player movement changes world X;
- spell produces particles;
- no page errors.

### Dense benchmark

File:
`scripts/noita-matter-benchmark.js`

Workload:
- grid 256×144;
- 12,000 seeded sand cells;
- 120 simulation ticks;
- 80,000 cell hard budget.

Before hot-path optimization:
- mean: 37.850 ms/tick
- p50: 37.152 ms
- p95: 99.597 ms
- max: 193.083 ms

After disabling unused dense move-event allocation and making occupancy/emissive stats incremental:
- mean: 24.279 ms/tick
- p50: 25.181 ms
- p95: 50.261 ms
- max: 69.121 ms

The mean simulation cost improved by about 36%.

This benchmark is machine-specific and is not evidence of physical iPhone 11 performance. Physical-device profiling remains required before claiming a production cell budget for iPhone 11.

## Failures found and lessons

### Dense first tick did nothing

Cause:
the dense scheduler treated an empty `nextList` as a truthy indication that a step was already running, so initial writes went to the wrong activity buffer.

Fix:
explicit `stepping` state chooses active vs next-active buffers.

### "4000 sand" was not always 4000 new cells

Cause:
the UI counted successful writes, including overwriting cells that were already sand.

Fix:
the action now checks occupancy first and guarantees 4000 new free cells.

### Browser stats crashed after first frame

Cause:
the UI called `s.camera.cellPixels()`, but runtime stats expose `cellPixels` as a numeric value.

Fix:
corrected the browser contract and added `window.__NOITA_ERRORS__` plus E2E coverage.

### Fire was visually too short for inspection

Cause:
default wood fuel is intentionally small for core tests.

Fix:
the showcase gives the demo structure a larger fuel value without changing the engine default.

### External browser-driver clicks were too slow for rigid flight screenshots

Cause:
each external agent-browser process has startup latency longer than the rigid fall.

Fix:
the repository now contains Playwright E2E that acts and observes inside one browser process and proves `rigid > 0` during flight.

## Current limitations

These are quality/scaling limits, not missing core layers for the analyzed video:

1. DenseMatterGrid is currently a high-density 2D plane. Sparse MatterWorld remains 3D. Multiple dense planes / full dense 3D are not implemented.
2. RigidClusterSystem is a grid-oriented lightweight rigid solver, not full Box2D/Rapier angular/contact physics.
3. The glow renderer is Canvas2D-based. Existing World Server Three.js/Bloom systems can later consume the same material events for a WebGL presentation.
4. The 12k-cell benchmark is desktop evidence. Physical iPhone 11 limits still need direct measurement.
5. Worker/WASM acceleration is not yet required by the current 5k-cell visual proof, but remains the next optimization if physical-device profiling shows the main thread is the bottleneck.

## Result

World Server now has every core architectural layer required to build the behavior described from the video without frame-by-frame scripted imitation:

matter
+ support
+ avalanche
+ rigid detach
+ fire/temperature
+ cross-layer chemistry
+ particles
+ emission/glow
+ pixel scaling
+ camera
+ animated entities.

Future work should primarily increase fidelity, material library size and device-scale performance rather than invent another physics architecture.
