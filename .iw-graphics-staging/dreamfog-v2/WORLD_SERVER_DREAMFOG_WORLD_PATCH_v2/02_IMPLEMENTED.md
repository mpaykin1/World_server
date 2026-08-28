# Implemented in v2

## Visual runtime

- Multi-layer fog banks with animated noise and camera-relative drift.
- Exponential depth fog for atmospheric perspective.
- Depth-aware far softness + gentle bloom/grain/vignette post-pass on capable desktop tiers.
- Procedural strange silhouettes built from low-cost instanced geometry with very slow asynchronous deformation.
- Separate simple collision proxies for a subset of silhouettes.
- Procedural reflective/dreamlike animated water shader.
- Mist particles.
- Lightweight ash/rain/dust weather field animated in the vertex shader.
- Local glow pockets plus limited dynamic point lights.
- Rare anomalous silhouettes that fade in/out instead of staying permanently visible.
- Seeded world generation.
- Quiet procedural WebAudio soundscape, activated only after user gesture.
- Optional Layered Depth Image cards generated from the reference image.

## Performance / resilience

- Reuses existing GoldenPerformanceAutoTune for DPR.
- Adds DreamFog feature tiers: cinematic / balanced / mobile / low.
- Tier transitions react to existing `goldenperformance` FPS telemetry.
- Particle/weather counts use draw ranges rather than rebuilding buffers.
- Strange objects use InstancedMesh.
- PostFX automatically off on coarse/mobile tiers.
- CPU-compatible runtime; no WebGPU/CUDA dependency to play.
- Procedural fallback remains usable if no generated depth layers exist.

## Existing World_server systems reused

- `shared/ai3d-playable-runtime.js`
- `shared/golden-physics.js`
- `shared/golden-performance-autotuner.js`
- `shared/quality-telemetry.js`
- `shared/world-quality-autopilot.js`
- `services/ai3d-worker/ai3d/plugins/depth_anything.py`
- existing deny-by-default app release registry
- existing regression, quality, duplicate and release gates

## Safety against false readiness

Patch installs DreamFog hidden/quarantined. It becomes public/certified only after a machine-readable full verification report passes.
