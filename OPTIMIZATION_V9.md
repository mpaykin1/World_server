# V9 CPU-FIRST OPTIMIZATION

V9 assumes the server has no discrete/paid GPU. Performance comes from avoiding repeated work, CPU SIMD/workers, spatial rejection, caching, incremental bakes, distance scheduling and client-side rendering.

Implemented: content-hash incremental compiler; hierarchical grid; CPU PVS; conservative occlusion cache; predictive streaming V2; CPU dirty-region light bake plan; source/params locked nav+collision cache; near-exact simulation LOD; causality profiler; quality-safe autotuner; deterministic production replay; no-paid-GPU gate.

Next high-value CPU-only systems: WASM Threads across all importers/BVH; memory-mapped/streamed parsing for huge files; portal/PVS authoring from semantics; incremental GI reuse by irradiance cells; zstd/brotli derived-cache transport; service-worker offline asset cache; shared worker for multi-tab caches; deterministic network/physics replay farm; automatic CPU flamegraph capture; project-wide dependency graph spanning code/assets/bakes; binary delta patching of derived chunks; content-defined chunking for CDN cache reuse.
