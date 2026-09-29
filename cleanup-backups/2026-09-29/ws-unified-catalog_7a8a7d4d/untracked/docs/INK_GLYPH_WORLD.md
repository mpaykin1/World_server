# Ink Glyph World V3

Turns Chinese brush-calligraphy glyph silhouettes into deterministic semantic 3D worlds using the existing World_server Three.js quality stack.

Pipeline:
1. pinned OFL brush font → vector outline via opentype.js, with FontFace fallback;
2. raster alpha mask → denoise + distance field + bounded sampling;
3. semantic roles → roads / walls / buildings / towers / splatter;
4. Hanzi medians (when installed) → per-cell stroke index + draw order;
5. quality tournament → deterministic candidates scored for silhouette, role diversity, navigation connectivity, bounds and stroke provenance;
6. CPU navigation graph + A* preview;
7. deterministic LOD tiers;
8. InstancedMesh rendering + WorldQualityAutopilot;
9. IndexedDB recipe cache keyed by generator version + font blob + glyph + settings + stroke source;
10. JSON / GLB export; optional gltfpack + meshoptimizer post-processing.

All heavy generation is Worker-compatible and CPU-first. No GPU compute requirement.

## V3 topology layer
Navigation nodes are analyzed for endpoints, high-degree junctions, connected components and cycle rank. The generated recipe records deterministic gate/plaza landmarks for later authored architecture.
