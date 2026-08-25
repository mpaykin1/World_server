# Automatic AAA 3D Quality System V3

The system improves perceptual quality without allowing uncontrolled shape drift.

Implemented quality layers:

- material-class-specific roughness/metallic behavior;
- micro-bevel highlight recovery;
- guarded irregularity for stone/brick/concrete/ground/roof;
- deterministic color/material variation;
- spatial wetness/weathering masks;
- HQ normal + AO detail transfer;
- reconstructed curvature/height detail maps;
- high-resolution LOD0 texture policy;
- channel-aware texture restoration;
- AO/GI/sun/fill/contact-shadow/tone-map runtime presets;
- HLOD and impostor far rendering;
- semantic protection of visually important geometry;
- visual, animation and performance regression gates.

The system does not claim one universal shader can be exported identically to every engine. Godot and Web can consume richer runtime masks/shaders; Roblox-compatible output must use supported SurfaceAppearance/material inputs or baked variants.


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

## V5 material fidelity and adaptive runtime

PBR optimization is now split into dielectric, metal, emissive and transmissive families. Each family preserves the channels needed for its physical response. Transparent/transmissive assets are never intentionally converted to opaque just to reduce draw calls.

The runtime layer receives a hardware quality tier that adjusts LOD bias, texture ceiling, shadows, GI, AO, parallax and impostor distance without mutating the immutable HQ asset. World-scale portal/room data is emitted only as a conservative hint; engine-native occlusion is authoritative.


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

## V8 quality principle

A higher automation score must never come from weakening visual evidence. Multi-view semantic masks protect important geometry from several directions; runtime history may increase visual quality when performance headroom is proven, or seed more aggressive LOD when necessary, but the immutable HQ comparison decides acceptance. Fleet readiness requires evidence across target × hardware-tier cells, not one fast developer machine.

## V9 quality principle

V9 treats fleet readiness as a stronger claim than a successful local benchmark. Full production PASS requires fresh longitudinal evidence across representative target/hardware cells; one fast development computer is only target evidence. Mesh-native geometry semantics and V8 multi-view semantics are unioned so hidden or silhouette-critical geometry can be protected even when one evidence source misses it. Device-history tuning can seed performance choices but can never relax the immutable HQ comparison or semantic/temporal gates.

## V10 hard rule
No quality score can compensate for a missing required evidence layer. `PRODUCTION_EVIDENCE_COMPLETE` requires all configured real runtime/fleet/platform evidence. Static tests may prove code readiness but cannot manufacture target-runtime, profiler, device-farm or Roblox Studio verification.

## V11 quality-completion contract

AAA output is not considered fully closed merely because one render looks correct. V11 requires zero known fixable errors, regression closure, stable repeated tests, deterministic quality decisions, and fault-injection coverage. Runtime/device/Roblox/PVS evidence remain non-compensating external layers. Successful fixes are promoted into the permanent error-prevention registry to prevent recurrence across projects.

## V12 — adversarial/runtime assurance
V12 adds a binary adversarial GLB corpus, tracked-artifact hygiene, Blender/Godot compatibility matrix, shader-stutter and thermal/memory-pressure gates, real Web/Godot collectors, and a guarded Desktop-AI autofix actuator. These are fail-closed and never weaken Fidelity/Semantic/Animation/Temporal thresholds.
