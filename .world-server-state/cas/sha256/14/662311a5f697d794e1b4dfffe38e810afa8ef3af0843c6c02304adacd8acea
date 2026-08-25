# OPTIMIZATION V8 — FPS without losing near-player graphics

## Implemented

- Near-player geometry/textures/materials stay source-equivalent; no dynamic-resolution escape hatch.
- SharedArrayBuffer zero-copy decode under cross-origin isolation; safe transfer fallback otherwise.
- Worker decode, WASM SIMD + worker threads, serialized BVH and exact parallel BVH prepass.
- GPU HZB conservative occlusion + WebGL2 safe fallback; near radius bypass.
- Exact meshlet ranges + indirect WebGPU kernel; triangle conservation is mandatory.
- Exact material dedup/material table; source texture dimensions preserved.
- Conservative clustered lights; overflow fails bright, never dark by silently dropping lights.
- Full-resolution virtual texture residency: near pages pinned, far pages evictable, full-source fallback.
- Conservative room/portal culling; unknown/near = visible.
- Predictive streaming and nearest-first queues.
- Static transform/shadow/reflection/light bake caching only when safe.
- Offline source-locked GI/reflection companions.
- Distant animation/AI/audio/network cadence reduction; near/interacting player path stays full rate.
- Physics broadphase + distant sleep with player-contact/near awake locks.
- Frame-budget orchestrator defers background tasks first.
- p99 frame-time + hitch-count regression gate.
- Per-device schedules learn only cost knobs after source/near/visual proof.
- Fog/haze/mirage hides distant cost while the near field remains sharp.
- Global subtle wet-surface treatment remains runtime-only and source-safe.

## Next safe optimization/quality systems

1. **Authoritative GPU-driven visibility-buffer renderer** only after multi-GPU golden parity; exact source materials/indices remain the truth.
2. **GPU timestamp/query profiler + frame-causality graph** to automatically identify which pass caused p95/p99 regressions.
3. **Incremental world compiler**: dependency DAG rebuilds only invalidated derived artifacts after an asset/rule change.
4. **Production replay capture**: deterministic input/event/seed replay generated automatically from a real incident.
5. **Multi-angle perceptual saliency gate** in addition to pixel golden tests, never instead of them.
6. **Topology/UV/material pathology detector** with derived-copy repairs only; original source remains immutable.
7. **Deterministic multiplayer simulation farm** for latency/jitter/packet-loss regression.
8. **Live device-schedule learner** backed by Neon evidence and real device farm; Quality Ratchet remains the hard boundary.
9. **R2/CDN derived-cache promotion** with content hash, source hash and tool hash verification at the edge.
10. **Automatic cross-project impact analysis** before promotion: Knowledge Graph predicts affected systems/consumers and expands canary set accordingly.
