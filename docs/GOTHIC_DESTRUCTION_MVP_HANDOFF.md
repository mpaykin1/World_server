# Gothic Destruction MVP — Durable Handoff

Status: **MF / Must Finish / in-progress**  
Canonical app: `apps/gothic-destruction-mvp/`

## Accepted baseline

The user explicitly approved the fragmentation behavior on 2026-09-30:

> «камни разлетаются хорошо»

The accepted source baseline is:

- branch: `ai/chatgpt/gothic-voxel-fragmentation-clean-hud`
- SHA: `769abc1095aa4d000d49befea102841802793f54`

That baseline contains:
- cannon impact into Gothic voxel structures;
- structural support graph and collapse planning;
- independent Rapier rigid bodies per visible fragment;
- distinct deterministic linear/angular fragment impulses;
- fragment instancing and bounded physics budgets;
- graphics-first HUD.

## Canonical World Server sources

- `apps/gothic-destruction-mvp/index.html`
- `apps/gothic-destruction-mvp/client.mjs`
- `shared/voxel-structural-destruction.mjs`
- `shared/physics/rapier-collapse-runtime.mjs`
- `shared/gothic-architecture.mjs`
- `shared/mods/gothic-city.mjs`
- `shared/voxel-mod-registry.mjs`

Learning/evidence:
- `docs/GOTHIC_VOXEL_FRAGMENTATION_GOLDEN_SUCCESS.md`
- `docs/GOTHIC_DESTRUCTION_MVP_FAILURE_ANALYSIS.md`
- `data/error-prevention-registry.json`

## Stable recovery mirror

- repo: `mpaykin1/scratch-chain-reaction`
- mirror commit: `4d09f3aba3999d8f7c3559ea1a23952d4032a2cb`
- last known stable URL: `https://mpaykin1.github.io/scratch-chain-reaction/apps/gothic-destruction-mvp/`

This URL is a recovery locator, not permanent live evidence. Re-run the current link-delivery gate before giving it to the user.

## Must Finish status

This project is MF item `gothic-destruction-mvp`.

It stays in MF until:
1. the accepted fragmentation baseline remains intact;
2. regression protection remains green;
3. the project reaches World Server production certification;
4. the owner explicitly says it can be considered finished / removed from MF.

A working MVP, stable mirror, PR, or green browser test by itself does **not** close the MF item.

## Non-regression rules

- Do not restore cluster-AABB-only visible destruction.
- Do not call “a large chunk moved” proof of voxel fragmentation.
- Browser tests must prove multiple unique fragment bodies and separation over time.
- Do not cover the world with diagnostic UI.
- Do not trade away fragmentation semantics just to raise FPS.
- Do not trust remembered preview URLs or hosting status badges.

## Next action

Continue from the accepted baseline rather than rebuilding it:
- preserve current per-voxel scattering;
- finish production certification/integration;
- live-verify any public link before handoff;
- request explicit owner closure only after all MF completion criteria are satisfied.
