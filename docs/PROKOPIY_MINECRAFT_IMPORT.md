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
| IMPORT | 196 | Small justified originals: runtime assets plus unique source-only model originals |
| ADAPT | 0 | No source file needed a direct file-level adaptation in this pass |
| LEARN-REIMPLEMENT | 428 | Learn algorithms/semantics, merge only improvements into canonical World Server systems |
| PRESERVE-FOR-LATER | 1,963 | Useful/potentially useful but not worth vendoring or duplicating now |
| SKIP | 1,780 | Engine metadata, screenshots, glue, duplicates, or provenance-quarantined files |

This means **analysis coverage is 4,367 / 4,367**, while vendoring remains deliberately small.
## Curated assets actually vendored

The imported asset set is about 3.7 MB and contains:

- 177 portable textured GLB models: 91 mobs, 55 items/tools, 31 entities/vehicles/armour/props.
- 14 unique useful Unity FBX originals that have no equivalent imported GLB identity; they stay source-original and are not advertised as browser-runtime-ready.
- One compact 1,125-layer block texture atlas plus its JSON index.
- Three compact semantic model metadata files: mobs, items and props.
- Catalog, hashes, README and attribution notice.

All 177 GLBs are valid glTF 2.0 and contain embedded image/material data. Across them there are 197 embedded image payloads. They contain **zero animation clips**; the source implements animation procedurally in code.

The source contains 156 FBX files and 3 Blender authoring files. Cross-engine identity comparison found 18 Unity FBX names absent from the GLB set. Four are semantic duplicates of imported model families; the remaining 14 useful identities are preserved here as exact FBX originals for later deterministic conversion. The other FBX representations and Unreal `.uasset` mesh/material containers remain pinned at the exact source SHA rather than being copied blindly.

`data/provenance/prokopiy-minecraft/model-identity-audit.json` compares Godot GLBs, Unity FBXs and Unreal logical mob directories. It accounts for **219 exact normalized logical model identities**: 191 imported, 10 covered by already imported families/compositions, 18 Unreal-only binary identities preserved for later, and 0 unaccounted.
## Canonical integration instead of duplicate engines

World Server keeps its existing systems authoritative. The source is an evidence/idea pool and asset source, not a second Minecraft engine.

`lib/prokopiy-minecraft-assets.js` is the shared catalog/provenance adapter. The existing Creature Factory consumes it directly: current species `slime`, `wolf`, `skeleton`, `bear` and `dragon_wyrmling` resolve to the imported slime, wolf, skeleton, polar-bear and ender-dragon GLBs. Goblin intentionally has no forced substitute.

The capability map contains **38 source capability families**. Six asset/model/metadata families are imported, 29 are marked LEARN-REIMPLEMENT, two are preserved for later, and one source UI family is skipped because World Server already has stronger canonical UI/mobile contracts. Networking transport, authored sound files and GLB animation clips are explicitly recorded as absent rather than invented.
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

The audit tries to disprove the claim that the curated import matches the complete source classification. It checks all 4,367 unique source paths, the five-way decision vocabulary, every IMPORT hash, all 177 GLB headers/materials/embedded images, the 219-identity cross-engine model audit, the 14 source-only FBX originals, atlas metadata, permission evidence, provenance quarantine, all 20 shader files, all 416 code files and the live Creature Factory resolver.

Machine evidence is written to `data/provenance/prokopiy-minecraft/vno-audit.json`.

This audit may prove source/inventory/import consistency. It does **not** convert IMPORTED or DISCOVERED capabilities into LIVE_VERIFIED runtime capabilities, and it does not assign the project owner's SUCCESS/FAILURE verdict.


## User-approved MVP success

On 2026-10-04 the project owner reviewed the deployed **Prokopiy Minecraft × World Server MVP** and explicitly marked it **SUCCESS**.

Accepted proof:
- URL: https://world-server-pr-manual.mmmpaykin.workers.dev/apps/prokopiy-minecraft-mvp/
- deployed SHA: `66880d00d791c7847bde01a9f9abd56ab7c29390`
- fixed/static game viewport;
- real imported GLB models visibly rendered;
- MOBS / ITEMS / ENTITIES browser available;
- portrait/mobile render verified before delivery.

Canonical acceptance record: `PROKOPIY_MINECRAFT_MVP_SUCCESS.md`.

This owner verdict applies to that exact MVP proof. It does not automatically certify every future Minecraft-import capability or later revision.
