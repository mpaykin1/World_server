# Upstream Minecraft technology inventory (study and independent implementation only)

Source: https://github.com/Prokopiy8247/Claude-Opus-5.5-Minecraft

Scope: Godot 4.7.2, Unity 6000.6, Unreal Engine 5.8. The upstream README describes an educational project and independently created assets, but the repository root and all three actual engine subdirectories have no LICENSE file (GitHub API 404, checked 2026-09-26). Public visibility and free gameplay are not redistribution permission. Do not copy upstream source, GLBs, textures, sounds, screenshots, project files or binaries into World Server without explicit authorization. Permission request: https://github.com/Prokopiy8247/Claude-Opus-5.5-Minecraft/issues/1 . Check third-party dependencies and author scope before any approved transfer.

## Ten independently reproducible engineering directions

- [x] CPU chunk geometry with boundary face culling: original `shared/voxel-worker-mesh.mjs`; Node tests passed.
- [x] Browser worker protocol with typed-array transfer and revision-aware client: original `shared/voxel-mesh-worker-adapter.mjs`, `shared/voxel-mesh-worker-client.mjs`; adapter tests passed; client revision test passed.
- [x] Procedural material atlas and optional Three.js texture adapter: original `shared/original-voxel-texture-atlas.mjs`, `shared/three-voxel-atlas-adapter.mjs`; tests passed.
- [x] Face AO and material-aware greedy rectangle merge: original `shared/voxel-face-mesher.mjs` in PR #308; tests passed.
- [x] Visible-first chunk upload budget and stale revision rejection: original `shared/chunk-upload-budget.mjs` in PR #306; tests passed.
- [x] 20 TPS-style entity interpolation and teleport snap: original `shared/entity-tick-interpolation.mjs` in PR #306; tests passed.
- [x] Portable versioned chunk save/load codec with bounded decoding (original `shared/original-chunk-save-codec.mjs`; 2 Node tests passed). Future schema migrations are not implemented.
- [x] Deterministic seeded visual tour manifest and machine-readable result validator (`shared/original-seeded-visual-tour.mjs`; 2 tests passed). Actual screenshots require future integration, explicitly out of scope.
- [ ] Original CPU Blender asset generation, export and validation: script drafted in PR #307, GLBs NOT exported or validated.
- [x] Cross-engine Godot/browser-compatible asset manifest with strict rights/provenance (`shared/original-asset-provenance.mjs`; 1 test passed). No upstream assets included.

The nine checked entries are standalone implementations, NOT upstream file copies, production integration, FPS evidence or permission to redistribute upstream assets. Existing World Server systems remain canonical; no integration is part of this inventory task.

## Upstream-only resources blocked pending authorization

Godot/Unity/Unreal source files, authored 3D models and Blender files, textures, audio, screenshots, release binaries and engine-specific project data. Do not infer a license from a release tag or the upstream README. Once permission arrives, enumerate file paths, rights holder, third-party exclusions, attribution, modification and server monetization terms before copying anything.

## Study coverage checkpoint (2026-09-26)

Read README and DEVELOPMENT.md for all three engine projects, plus Godot and Unity FEATURE_MATRIX.md. This is documentation-level architecture coverage, not an exhaustive audit of source code or all assets. Preliminary study estimate: 50%; not an exact file or line fraction. Identified additional independent techniques: incremental flood-fill skylight/blocklight, palette-remapped saves, A* path straightening, dirty-section-only remeshing, generated PBR normal/ORME layers, procedural sound synthesis, staged autotours. These are not marked implemented here. The 9/10 preparation checklist must not be confused with the broader 50% study estimate.
