# 3D Asset Quality & Optimization Pipeline V3

## Production flow

`SOURCE_HQ → validate → analyze → exact material/mesh dedupe → semantic protection → cleanup/normals → LOD0/1/2/3 → Fidelity Gate → Animation Gate → AAA candidate → AAA Gate → detail transfer → HLOD/impostor → texture restoration → collision → performance gate → target packaging → quality memory`

## Semantic protection

Before decimation, the system evaluates object names, material names, bone/vertex-group names, rigging, shape keys and surface class. Critical areas receive high geometry-retention floors. Shape-key meshes are preserved rather than destructively simplified.

## Detail transfer

For paired static HQ/LOD objects the Blender worker creates a separate `AUTO_BAKE_UV`, then performs selected-to-active tangent-space normal baking and AO baking. The worker derives curvature and a Poisson-reconstructed height field from the baked normal map. Authored UVs are not overwritten.

## World-scale optimization

Exact static duplicates share one mesh datablock. Equivalent materials are relinked to canonical materials. LOD3 static meshes can be merged into `HLOD.glb`. Eight azimuth renders are converted to `IMPOSTOR_ATLAS.png` for horizon-distance rendering.

## Regression gates

- Fidelity: fixed-camera multi-view HQ vs LOD0.
- Animation: sampled source vs LOD0 animation frames.
- AAA: silhouette preservation plus bounded detail-energy increase.
- Performance: triangles, LOD progression, material growth, draw-call estimate and collision budget.
- Compression: target compression is accepted only when the expected GLB extension is present.

## Texture policy

The source material graph is inspected to identify texture roles. Low-resolution textures are processed by role: normal maps are resized and renormalized, albedo/emissive maps may receive controlled sharpening. Real-ESRGAN can be used only when explicitly installed/configured; otherwise the report states that a non-AI fallback was used.

## Remaining hard problems

Scene-wide material atlasing across arbitrary animated/multi-material assets, KTX2/BasisU + Meshopt target packaging, automatic re-binding of all enhanced/baked texture outputs into every target engine, engine-native GPU/VRAM/FPS telemetry, and learned semantic masks from image/mesh ML models remain separate production stages.


## V4 production additions

- safe opaque PBR atlas candidate with automatic rebinding and rollback;
- albedo / roughness / tangent-normal / AO atlas bake;
- sun / side / soft-light PBR material regression QA;
- geometry-salience-aware LOD retention for sharp/boundary-heavy meshes;
- screen-space-error LOD distance calibration;
- object-bound occlusion/streaming cells;
- verified Meshopt and KTX2 packaging when external tools are provisioned;
- generated Godot/Web/Roblox binding adapters;
- generated target runtime benchmark harnesses; runtime is VERIFIED only after actual target execution.

## V5 production extension

V5 adds physically separated PBR atlas families so optimization cannot flatten metal, emissive or transmissive materials into a generic opaque shader. Atlas candidates pass multi-light comparison and a UV/channel audit before becoming `LOD0_FINAL.glb`.

Additional V5 gates and runtime metadata:
- LOD0→LOD1 transition-pop QA;
- portal/room occlusion hints plus existing occlusion cells;
- low/medium/high/ultra hardware budgets;
- target benchmark results are VERIFIED only if the target harness emitted `executedInTarget=true`;
- optional ONNX semantic backend is reported by model hash; absent model uses heuristic protection honestly.


## V6 additions

- deterministic HQ-vs-optimized temporal anti-shimmer gate;
- baked portal-room PVS candidate sets with engine-native visibility remaining authoritative;
- real NVIDIA GPU/VRAM telemetry through `nvidia-smi` when exposed;
- optional real ONNX semantic inference with safe heuristic fallback;
- device-farm benchmark orchestration and `executedInTarget` evidence;
- production readiness status cannot become VERIFIED from static metrics alone;
- current `PipelineRunner.MeshQualityOptimizer` is bridged to the canonical V6 pipeline to prevent duplicate blind-decimation systems.


## V7 additions
- camera-aligned semantic mask projection into decimation weighting;
- NVIDIA/AMD/Intel real telemetry backends;
- engine-native GPU timing evidence;
- persistent real-device benchmark history;
- additive-only runtime PVS learning;
- authenticated Roblox Open Cloud upload workflow.

## V8 evidence-calibrated production layer

V8 adds multi-view semantic fusion, representative device-matrix evidence, statistically guarded device-history calibration, confidence-based additive PVS learning, broader vendor telemetry, and Roblox place-side verification. Device-history tuning may change only starting LOD seeds; fidelity, semantic and temporal hard gates remain mandatory for every new asset. V8 distinguishes verification of one target runtime from representative fleet verification.

## V9 mesh-native + longitudinal production layer

V9 adds mesh-native 3D semantic protection to the existing camera/multi-view semantic stack. Boundary edges, UV seams, sharp curvature, material boundaries and thin topology are converted to vertex protection weights and unioned into the same `AI3D_SEMANTIC_PROTECTED` group used by decimation. A provisioned 3D semantic model may add evidence, but absence of that model is reported as a geometry-native fallback rather than a fake ML result.

Production evidence is now longitudinal. Fleet claims require fresh successful evidence across distinct target/hardware-tier cells, devices, sessions, days and builds with a Wilson lower confidence bound. Stale evidence remains in history but cannot satisfy current production readiness. Statistical history may seed LOD ratios only; asset-specific visual, animation, temporal and semantic gates remain authoritative.

Godot/Web shader/memory telemetry accepts only target or vendor measurements. Unsupported occupancy or bandwidth counters remain unavailable. Device-farm and Roblox Studio automation use explicit evidence contracts, and missing provider/Studio execution remains `UNVERIFIED`.

PVS removal remains proof-oriented: V9 can nominate review candidates after substantial absence evidence but never auto-removes visibility.

## V10 — Evidence Completeness and Model Provenance
V10 adds a non-compensating evidence gate. A verified semantic ONNX model requires a matching SHA-256 and held-out validation/calibration contract; otherwise the ML layer is disabled while deterministic geometry/rig/multiview protection remains. Real profiler evidence is normalized only from trusted measured backends. Device-farm runs are deduplicated and bound to build/session/device identity. Fleet drift can block policy promotion. PVS pruning requires diversity plus holdout absence evidence and remains canary-only by default. Roblox Studio verification is bound to a V10 contract hash for the exported asset set.

## V11 — Zero-known-error convergence and recurrence prevention

V11 adds a persistent error ledger and a fail-closed completion contract. A reproducible fixable defect keeps the system in `CONTINUE_FIX_LOOP` until it has a root-cause fix, durable regression protection, and full verification. Repeated fingerprints escalate from normal fix to root-cause mode, impact scan, and architecture review. Confirmed fixes can be promoted into `data/error-prevention-registry.json` so the protection persists across future tasks.

Additional V11 gates:
- zero-known-fixable-errors;
- regression closure;
- flaky-test stability;
- deterministic reproducibility;
- safe fault injection;
- non-compensating quality confidence.

A proven external blocker is reported as `EXTERNALLY_BLOCKED_NOT_CONVERGED`; it is never converted into PASS.

## V12 operational gates
The cumulative pipeline now requires zero known fixable errors plus adversarial GLB detection and release artifact hygiene. Runtime compatibility, shader-stutter, thermal/memory-pressure, device/GPU, and Roblox evidence remain explicit measured layers; unsupported counters stay UNAVAILABLE rather than estimated.
