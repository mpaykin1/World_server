# V9 CPU-FIRST / NO PAID GPU ARCHITECTURE

The server uses CPU + cache + storage orchestration. Rendering remains on the player's browser/device. Any WebGPU path is an optional client capability, never a server dependency.

Priority order for optimization:

1. Do not compute work that is unchanged.
2. Reuse content-addressed derived data.
3. Rebuild only dirty chunks/cells.
4. Reject invisible space conservatively with PVS/grid/occlusion.
5. Stream where the player is going, not only where they are.
6. Reduce only distant simulation cadence.
7. Move rendering work to the client device.
8. Only then tune other safe cost knobs.

Forbidden optimization knobs include source geometry, texture resolution, material quality, near-field resolution, near animation quality, shadow resolution, reflection resolution and source recompression.

## V10

CPU-first контур усилен: bounded-memory mmap parsing, threaded exact import/BVH, semantic PVS, incremental GI cell reuse, content-defined cache chunks, lossless compressed derived transport, offline/multi-tab SHA caches, CPU flamegraph evidence, deterministic replay farm и dependency graph. Все GPU пути остаются только optional client capability; обязательная серверная GPU по-прежнему не требуется.
