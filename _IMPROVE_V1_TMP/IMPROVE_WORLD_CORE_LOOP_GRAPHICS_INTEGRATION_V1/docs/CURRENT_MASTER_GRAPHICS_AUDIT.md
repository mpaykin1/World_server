# CURRENT MASTER GRAPHICS AUDIT

Observed master SHA: `fa3445713f8f9f84130c2795421b9cb1ca2d6640`.

## Confirmed installed / present
- Three.js/WebGL2 production path.
- AI3D worker + CPU reconstruction/depth adapters.
- TRELLIS.2 adapter, InstantMesh adapter, Godot voxel adapter, GPU router, mesh quality optimizer plugin.
- `WorldQualityAutopilot` **4.0.0**.

## Confirmed missing by current master path inspection
- Pixel Animation V3 (`shared/pixel-animation-engine.js`).
- Game Motion Timeline V2 (`shared/game-motion-engine.js`).
- Pixel Panorama 360 V4 app.
- Ink Glyph World V3 app/core.
- CharacterForge CPU V2 plugin.
- GS360 V6 system.
- PWA V5 runtime (`shared/pwa-runtime.js`).
- Procedural Quality V10 runtime (`shared/procedural-quality-runtime.js`).
- Texture Quality V10 runtime.
- APNG V3 system.

## Partial / must be upgraded, not duplicated
- Mesh quality: current master has `mesh_quality_optimizer.py`; V12 contains a much broader production/semantic/evidence pipeline. Merge/update in place and keep current AI3D contracts.
- AI3D heavy GPU backends: repo adapters exist, but runtime availability must be measured on the actual worker; never claim active just because adapter code exists.

The authoritative Desktop AI run must rerun `npm run iw:graphics:audit` against the checkout immediately before installation, because master can move after this package was created.
