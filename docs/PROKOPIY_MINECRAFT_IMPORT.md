# Prokopiy Minecraft -> World Server curated capability import

Source: https://github.com/Prokopiy8247/Claude-Opus-5.5-Minecraft

Pinned source SHA: `ba1dd531528a2aa4bed14d4dd3c18da5730264d2`

Primary permission evidence: https://github.com/Prokopiy8247/Claude-Opus-5.5-Minecraft/issues/1#issuecomment-5844429213

Required attribution: cryptopiy — https://www.youtube.com/@cryptopiy_/videos

## Permission boundary

The repository owner explicitly granted the three requested reuse/adaptation/distribution permissions, allowed use of any files/models, stated that the repository contains no third-party assets, and required attribution to the cryptopiy YouTube channel plus the source repository.

World Server records this as **individual author permission with an attribution condition**, not as a broader standard open-source licence. If contrary provenance is discovered for an individual file, that file is quarantined rather than silently widening the permission.

A full text scan found five Unreal scaffold files carrying Epic Games copyright boilerplate. None is imported or used for algorithm learning; they are recorded in `data/provenance/prokopiy-minecraft/provenance-review.json`. No contradictory marker was found in the curated imported artifacts.
## 100% source inventory, selective import

The pinned Git tree contains exactly **4,367 tracked files**. Every tracked path appears exactly once in `data/provenance/prokopiy-minecraft/source-inventory.json` with source path, source commit, type, size, SHA-256, disposition and reason.

Current dispositions:

| Decision | Files | Meaning |
| --- | ---: | --- |
| IMPORT | 182 | Small portable originals with justified current value |
| ADAPT | 0 | No source file needed a direct file-level adaptation in this pass |
| LEARN-REIMPLEMENT | 428 | Learn algorithms/semantics, merge only improvements into canonical World Server systems |
| PRESERVE-FOR-LATER | 1,977 | Useful/potentially useful but not worth vendoring or duplicating now |
| SKIP | 1,780 | Engine metadata, screenshots, glue, duplicates, or provenance-quarantined files |

This means **analysis coverage is 4,367 / 4,367**, while vendoring remains deliberately small.
## Curated assets actually vendored

The imported set is only about 3.4 MB and contains:

- 177 portable textured GLB models: 91 mobs, 55 items/tools, 31 entities/vehicles/armour/props.
- One compact 1,125-layer block texture atlas plus its JSON index.
- Three compact semantic model metadata files: mobs, items and props.
- Catalog, hashes, README and attribution notice.

All 177 GLBs are valid glTF 2.0 and contain embedded image/material data. Across them there are 197 embedded image payloads. They contain **zero animation clips**; the source implements animation procedurally in code.

The source also contains 156 FBX files and 3 Blender authoring files. Those are preserved by exact source SHA rather than duplicated because the GLBs are the smaller portable runtime representation. Unreal `.uasset` mesh/material containers are likewise preserved at source rather than copied into the browser runtime.
## Canonical integration instead of duplicate engines

World Server keeps its existing systems authoritative. The source is an evidence/idea pool and asset source, not a second Minecraft engine.

`lib/prokopiy-minecraft-assets.js` is the shared catalog/provenance adapter. The existing Creature Factory consumes it directly: current species `slime`, `wolf`, `skeleton`, `bear` and `dragon_wyrmling` resolve to the imported slime, wolf, skeleton, polar-bear and ender-dragon GLBs. Goblin intentionally has no forced substitute.

The capability map contains **37 source capability families**. Five asset/metadata families are imported, 29 are marked LEARN-REIMPLEMENT, two are preserved for later, and one source UI family is skipped because World Server already has stronger canonical UI/mobile contracts. Networking transport, authored sound files and GLB animation clips are explicitly recorded as absent rather than invented.
## SUPPORT connections

The capability map routes source strengths into existing systems rather than creating parallel infrastructure:

- voxel/chunks/meshing/block rules -> `apps/voxel-world`, `api/voxel.js`, `lib/voxel-rules.js`
- terrain/biomes/caves/structures/seeds -> `lib/world-factory.js`, Gothic World, Trinity CUBE
- lighting/AO/day-night/shaders -> `shared/light` / LIGHT and shared graphics
- collision/player motion -> `shared/golden-physics.js`
- destruction/explosions -> existing voxel destruction + canonical physics
- mobs/AI/pathfinding/models -> `lib/creature-factory`
- save/session/dimensions -> authoritative World Server state + World Factory
- texture synthesis/asset tooling -> existing graphics and AI3D asset pipelines
- source tests/validation tours -> World Server `test/` and `e2e/` as capabilities are adopted

Redstone automation and fluids are preserved for later because introducing a second automation/fluid simulation today would violate the no-duplication rule.
## VNO / falsification

Run:

```bash
node scripts/audit-prokopiy-minecraft-import.js
```

The audit tries to disprove the claim that the curated import matches the complete source classification. It checks all 4,367 unique source paths, the five-way decision vocabulary, every IMPORT hash, all 177 GLB headers/materials/embedded images, model-family counts, atlas metadata, permission evidence, provenance quarantine, all 20 shader files, all 416 code files and the live Creature Factory resolver.

Machine evidence is written to `data/provenance/prokopiy-minecraft/vno-audit.json`.

This audit may prove source/inventory/import consistency. It does **not** convert IMPORTED or DISCOVERED capabilities into LIVE_VERIFIED runtime capabilities, and it does not assign the project owner's SUCCESS/FAILURE verdict.
