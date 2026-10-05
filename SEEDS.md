# SEEDS — Architecture Seeds × Minecraft — Handoff

Canonical project name: **Seed System / Architecture Seeds × Minecraft**

Status: **MF / MUST FINISH**
User verdict: **not issued**. Do not record SUCCESS or FAILURE until the user explicitly judges the result.

## Current checkpoint

- Feature branch: `ai/chatgpt/architecture-seeds`
- PR: #414 — `feat: add deterministic architecture seed worlds`
- Current committed head at this handoff: `94d16a6d6d61243ca91d1e591cee740042095a7c`
- Last evidence-backed readiness estimate communicated to the user: **84%**
- This percentage is not a release verdict. Recalculate from current Git/evidence before reporting a new number.

## Goal

One shareable seed must deterministically reproduce a coherent living World Server world:

```
WORLD SEED
→ terrain / biome / caves
→ roads / districts / city plan
→ architecture family + building grammar
→ ruins / flooding / history
→ Minecraft-derived block palette
→ rare structures / landmarks
→ seeded models / mobs / items / props
→ later: NPC civilizations / relationships / events / persistent history
```

Requested architecture families already represented:
- Gothic
- New York
- Ancient Chinese
- Tokyo
- Future

Modifiers already represented:
- jungle
- flooded
- ruins
- desert
- snow
- volcanic
- islands

## Implemented code

Core:
- `lib/architecture-seeds.js`
- `lib/architecture-grammar.js`
- `lib/minecraft-seed-bridge.js`
- `lib/world-factory.js`
- `lib/api-handlers/world-factory.js`

Browser/runtime:
- `shared/architecture-seed-runtime.js`
- `shared/minecraft-seed-palette-runtime.js`
- `apps/voxel-world/client.js`
- `apps/voxel-world/index.html`
- `apps/seed-lab/`

Minecraft curated import:
- `assets/voxel/prokopiy-minecraft/`
- `lib/prokopiy-minecraft-assets.js`
- `data/provenance/prokopiy-minecraft/`
- `docs/PROKOPIY_MINECRAFT_IMPORT.md`

Tests:
- `test/architecture-seeds.test.js`
- `test/architecture-seed-runtime.test.js`
- `test/prokopiy-minecraft-import.test.js`
- `test/prokopiy-minecraft-mvp.test.js`
- `test/seed-lab.test.js`

Docs:
- `docs/ARCHITECTURE_SEEDS_RU.md`

## Evidence already obtained

Before the final seeded-set-dressing patch:
- combined targeted Architecture Seeds + Minecraft import suite: **29/29 PASS**
- Minecraft VNO/provenance audit: **4367 / 4367 source files accounted for**
- imported artifacts audit: **196 / 196 verified**
- earlier Architecture Seeds release gate: **1033 tests; 1031 PASS / 0 FAIL / 2 SKIP**
- Golden Standard: PASS
- quality regression violations: 0
- project review blockers: 0

Important: after adding direct seed-selected Minecraft GLB placement to `apps/voxel-world/client.js`, a new regression test was committed at the current head. Re-run exact-head CI before treating old full-suite evidence as current.

## Important fixes already made

- preserve very large numeric seed values as canonical string `seedKey` rather than unsafe JS Number;
- versioned sub-seeds for independent generation lanes;
- old worlds without Architecture DNA remain no-op;
- `preview-seed` / `hunt-seeds` are designed as read-only preview paths;
- Windows CRLF protection for imported provenance assets via `.gitattributes`;
- Minecraft block atlas is used as a seeded material-palette source without replacing the canonical voxel mesher;
- seeded rare structures affect architecture massing;
- seed-selected Minecraft GLB assets are mounted into Voxel World without creating a second game engine.

## Known remaining work / why this is MF

1. Rebase/synchronize PR #414 with current `master`; other World Server systems have advanced since the last seed head.
2. Re-run exact-head CI, quality regression, Fleet PRE/Ocean/live verification after synchronization.
3. Finish browser/mobile visual evidence for Seed Lab and Voxel World.
4. Improve architectural depth and landmark variety beyond coarse family grammar.
5. Turn seeded mobs/items from deterministic set dressing into meaningful world actors where appropriate.
6. Connect seed to civilizations, NPC relationships, factions, resources, conflicts, catastrophes and persistent history.
7. Ensure same seed + generator version reproduces the same semantic world across browser/Telegram/shared world state where applicable.
8. Keep license/provenance boundaries: do not import unverified third-party sample assets.
9. Do not mark project SUCCESS/FAILURE until explicit user verdict.

## Fresh-chat instructions

If the user says **SEEDS**, **система сидов**, **архитектурные сиды**, **Architecture Seeds**, or asks to continue this project:

1. read `MF.md` from current `master`;
2. read this file from the project branch/PR if it is not yet merged;
3. inspect PR #414 and current `master` before editing;
4. preserve existing voxel controls/physics/GOLDEN systems;
5. continue the existing implementation instead of starting a new seed engine;
6. use evidence-backed percentages only.

