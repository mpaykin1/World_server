# V7 — FPS optimization without near-field quality loss

Already implemented / enforced:

- predictive nearest-first streaming;
- lossless chunking and byte-identical GLB range assembly;
- conservative WebGPU HZB with fail-visible fallback and protected near radius;
- lossless meshlet metadata + WebGPU indirect command kernel;
- exact decorative instancing only when explicitly safe;
- static transform freeze;
- static shadow cache only with zero dynamic casters;
- exact material deduplication;
- shader/texture prewarm + maximum near anisotropy;
- serialized BVH cache + immutable SHA asset cache;
- Worker PLY decode;
- compiled WASM SIMD + threaded worker pool;
- exact parallel BVH preprocessing;
- distant nonphysics tick throttling;
- network interest management and distant pose sharing;
- far audio virtualization;
- fog/haze/mirage concealment before far culling;
- no dynamic-resolution/texture-downscale/geometry-decimation escape hatch.

## Next optimizations worth adding without lowering near graphics

1. Browser-native WASM Threads + SharedArrayBuffer zero-copy decode on COOP/COEP deployments.
2. GPU-driven bindless/material-table rendering after WebGPU PBR golden parity is proven.
3. Visibility-buffer/clustered light culling for dense dynamic-light scenes.
4. Virtual texture residency that keeps full-resolution pages around the player and evicts only invisible/far pages, never downscaling source textures.
5. Persistent CDN/R2 content-addressed derived-artifact cache shared between CI and production.
6. Precomputed portal/room visibility for interiors, combined conservatively with HZB.
7. Animation budget based on screen-space error with full-rate near rigs and exact pose at interaction boundaries.
8. Physics broadphase spatial partitioning and sleeping for distant dynamic bodies, while player-contact bodies remain full-rate.
9. Network delta/compression for far noncritical state with exact local-authoritative player state.
10. Per-device automatically learned safe schedules that can only change cost knobs allowed by the Quality Ratchet.
