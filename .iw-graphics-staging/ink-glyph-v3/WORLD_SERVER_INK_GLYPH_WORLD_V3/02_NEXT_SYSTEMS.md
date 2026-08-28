# NEXT HIGH-VALUE SYSTEMS AFTER V3

## P0 — next production upgrades
1. **Navigation backend tournament** — benchmark `navcat 0.4.1` (pure JS, tree-shakeable, easy tiled streaming/debugging) against `recast-navigation 0.43.1` + `@recast-navigation/three 0.43.1` (WASM, faster heavy runtime NavMesh/crowds). Keep the current CPU A* as zero-dependency fallback and auto-select per device/world size.
2. **three-mesh-bvh 0.9.14** — fast collision/raycast BVH for player movement, picking and large worlds; build BVHs off-main-thread when geometry becomes heavy.
3. **Chunk streaming + persistent world recipes** — stream multi-glyph cities/poems by camera position; cache recipes server-side and send only changed chunks.
4. **Topology landmark realization** — V3 already detects endpoints/junctions/cycles and emits gate/plaza landmarks; next turn those landmarks into authored gates, bridges, squares, rivers, courtyards and districts with collision/navigation contracts.
5. **Full GLB semantic round-trip** — structural GLB 2.0 validation is now built in; next add export → gltfpack → GLTFLoader → geometry/material/instance-count/visual assertions.

## P1 — quality and scale
6. **Multi-glyph layout graph** — every character is a district; radicals become sub-districts; phrase/poem layout gets roads between characters.
7. **Server recipe registry** — immutable `{font blob, glyph, seed, generator version, preset}` recipes with deduplication, provenance and rollback.
8. **Navigation quality tournament** — score candidates using connected walkable area, dead ends, path length and landmark reachability.
9. **Service Worker + R2/CDN cache** — offline/fast loading for TTF/WOFF2, stroke JSON, vendor modules and generated GLB.
10. **KTX2/BasisU material pipeline** — when textures are introduced, compress them without wasting bandwidth/RAM.

## P2 — visual intelligence
11. **Radical-aware semantics** — recognize radicals/components and assign architecture/biomes based on meaning and topology.
12. **Ink physics shader** — paper absorption, edge feathering, dry-brush breakup, pooling and animated wet/dry transitions.
13. **Weather + lighting tied to glyph meaning** — e.g. 水→mist/rivers, 火→embers, 風→wind particles; always optional and performance-budgeted.
14. **WebGPU renderer path with WebGL fallback** — adopt only after browser/device matrix proves equal or better stability.
