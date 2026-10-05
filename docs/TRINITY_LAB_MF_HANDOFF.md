# Trinity Lab — Durable MF Handoff

Status: **MF / Must Finish / in-progress**

Canonical app path: `apps/trinity-lab/`

Canonical implementation branch: `ai/chatgpt/trinity-lab`

Accepted checkpoint SHA: `98c9ddd2c0f09474fc2a199d4c640fae6e925314`

Unified implementation commit: `a518c8356736537a52073c6437671ff11e6e542e`

PR: `#400`

## User-confirmed baseline

The user explicitly confirmed the unified Trinity MVP as **SUCCESS** on 2026-10-04.

The accepted baseline preserves:

- one canonical semantic 3D scene;
- one canonical layout signature and shared transforms;
- one camera/composition across KRIEGER / INK / CUBE;
- KRIEGER cinematic architecture/material/light/depth baseline;
- Living Watercolor 3D reuse for INK;
- voxel-art interpretation for CUBE;
- deterministic parity evidence across the three style adapters;
- mobile viewport lock and 100% measured scene visibility in the verified candidate.

Canonical success analysis:
- `docs/TRINITY_LAB_UNIFIED_SUCCESS_2026-10-04.md` on `ai/chatgpt/trinity-lab`;
- `data/trinity-lab-user-verdict.json` on `ai/chatgpt/trinity-lab`.

The earlier INK/CUBE failure remains important historical evidence. Do not erase it: the unified architecture succeeded specifically because the previous renderer-specific spatial divergence was removed.

## Current MF objective

Trinity must become a reusable system that can continuously create substantially different locations and keep the same world state across all three styles.

The user explicitly requested the next stage:

1. walking forward through the current location eventually reaches a transition boundary;
2. a new different location is generated ahead without turning Trinity into separate demos;
3. locations continue as a bounded streaming queue rather than one hard-coded corridor;
4. add a **FIRE** control;
5. add a **SWITCH / weapon-change** control;
6. generate multiple weapons from one semantic `WeaponSpec`;
7. render every weapon in KRIEGER / INK / CUBE from the same semantic weapon identity;
8. INK should use selective deep black accents for stronger contrast without degrading into a black-outline cartoon.

## Architecture contract

Do **not** create:
- separate KRIEGER/INK/CUBE location data;
- separate style-specific world states;
- independent weapon definitions for each style;
- a second LIGHT system.

Continue the accepted contract:

`Location Intent -> Semantic Scene Description -> Procedural Scene Generator -> Canonical Scene Graph -> shared transforms/camera/light intent/world state -> Style Adapter`

Style adapters may change **how** an object looks. They must not independently decide **where** the object exists.

Weapon pipeline should follow the same rule:

`WeaponSpec -> canonical weapon identity/state -> KRIEGER / INK / CUBE weapon adapter`

## Required next vertical slice

Build a bounded streaming run with at least three substantially different locations, for example:

- Gothic passage/city;
- ancient Chinese temple complex;
- futuristic megastructure.

Minimum gameplay for the next candidate:
- move forward through locations;
- pre-generate next location before the transition;
- unload far-behind locations;
- FIRE;
- SWITCH weapon;
- at least three semantic weapon specs;
- tri-style weapon rendering;
- style-specific muzzle/recoil/impact interpretation;
- selective deep-black INK contrast accents;
- no KRIEGER quality regression.

## Completion evidence still missing

The project remains MF because these are not yet proven:

- dynamic location streaming: **MISSING**;
- prompt/generalized multi-location generation: **MISSING**;
- FIRE gameplay in Trinity: **MISSING**;
- weapon switching in Trinity: **MISSING**;
- semantic multi-weapon generation: **MISSING**;
- tri-style weapon parity: **MISSING**;
- selective deep-black INK contrast pass: **MISSING**;
- physical iPhone 11 performance certification: **MISSING**;
- stable production-certified public URL: **MISSING**;
- final owner closure: **MISSING**.

Do not claim these capabilities from plans or design notes.

## Public candidate locator

Last known tested candidate:

`https://deploy-preview-400--world-server.netlify.app/apps/trinity-lab/`

This is a locator only. Re-run the current Verified Link Delivery gate before sending it to the user again.

## Non-regression rules

- Preserve the user-approved KRIEGER graphics baseline.
- Preserve one canonical scene/layout/world state.
- Preserve cross-style semantic transform parity.
- Do not replace Living Watercolor 3D with debug wireframe/toon fallback.
- Do not replace finished voxel-art intent with debug cubes.
- Do not call a new version SUCCESS or FAILURE without the user's explicit verdict.
- Do not close or remove this MF item without explicit owner approval.

## Resume rule for a fresh chat

Read, in order:

1. `MF.md`
2. `data/must-finish.json`
3. this handoff
4. `docs/TRINITY_LAB_UNIFIED_SUCCESS_2026-10-04.md` from `ai/chatgpt/trinity-lab`
5. `data/trinity-lab-user-verdict.json` from `ai/chatgpt/trinity-lab`
6. current `apps/trinity-lab/`, `shared/trinity-canonical-layout.mjs`, and current Git/PR state

Then continue from the accepted checkpoint instead of rebuilding Trinity.
