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
- [ ] Chunk save/load codec with versioning and migration (independent design only).
- [ ] Seeded visual tour, screenshots and machine-readable rendering diagnostics (independent design only).
- [ ] Original CPU Blender asset generation, export and validation: script drafted in PR #307, GLBs NOT exported or validated.
- [ ] Cross-engine Godot/browser-compatible material and asset manifest with explicit third-party provenance.

The six checked entries are standalone implementations, NOT upstream file copies, production integration, FPS evidence or permission to redistribute upstream assets. Existing World Server systems remain canonical; no integration is part of this inventory task.

## Upstream-only resources blocked pending authorization

Godot/Unity/Unreal source files, authored 3D models and Blender files, textures, audio, screenshots, release binaries and engine-specific project data. Do not infer a license from a release tag or the upstream README. Once permission arrives, enumerate file paths, rights holder, third-party exclusions, attribution, modification and server monetization terms before copying anything.
