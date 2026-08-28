# WORLD_SERVER_INK_GLYPH_WORLD_V3

Production-oriented in-place upgrade of Ink Glyph World. V3 reuses the existing Three.js / WorldQualityAutopilot / release-gate stack and replaces V2 files; it does not create a duplicate renderer or world engine.

## V3 adds
- Real Hanzi stroke-order mapping from `hanzi-writer-data` with procedural fallback.
- Brush-writing reveal animation: world structures appear in stroke order.
- CPU navigation graph + A* path preview, no GPU required.
- Deterministic Full / Medium / Low LOD tiers.
- Quality tournament: generate multiple deterministic candidates and keep the highest-scoring world.
- Browser GLB export using the same pinned Three.js version as the renderer.
- Optional local `gltfpack 1.2.0` + `meshoptimizer 1.2.0` optimization toolchain.
- Expanded cache key invalidation, provenance, integrity and production checks.
- 13 unit tests + benchmark + integration test + Playwright coverage.

## Desktop AI
Read `01_DESKTOP_AI_INSTALL_VERIFY_REPAIR.md` first.

From `C:\Users\user\Desktop\World_server`:
```powershell
node <UNPACKED_PATCH>\install-ink-glyph-world.cjs --repo C:\Users\user\Desktop\World_server
```

The default install downloads fonts, opentype.js, Hanzi stroke data, and the local GLB optimization tools. Do not push directly to `master`. Work in a dedicated branch, repair root causes, rerun all gates, then open a PR.
