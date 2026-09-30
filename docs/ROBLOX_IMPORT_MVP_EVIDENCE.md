# Roblox import bridge — MVP evidence

Date: 2026-09-30
Scope: infrastructure importer/adapter MVP, not a playable port of the reference game.

## What succeeded

The importer was exercised against the user-provided `городкамни.rbxlx` without executing embedded Luau.
Observed result:

- 193 Roblox instances parsed;
- 39 Script/LocalScript/ModuleScript sources inventoried;
- 3 RemoteEvents found: `ThrowRock`, `DropRock`, `RockCinematic`;
- 25 external asset references / 13 unique Roblox asset IDs recorded;
- behavior classifiers detected procedural world generation, chunk streaming, climbing, air movement, player input, projectile physics, lighting, visual effects, tags, character control and tween animation;
- capability mapping detected raycasts, impulses, velocity, contact events, networking, frame scheduling, CFrame, attributes/tags and lighting;
- runtime adapter delegates to existing Golden controls/physics and an injected authoritative World Server network host rather than creating a second game engine.

The focused synthetic regression suite passes 7 tests after the fixes below.

## Failure found during MVP work

The first focused run failed because nested numeric values inside Roblox `Vector3`/`CFrame` properties were preserved as strings.
Root cause: scalar conversion keyed on XML node type, while child nodes are named `X`, `Y`, `Z`, `R00` etc.
Fix: object-property parsing now converts numeric child text explicitly before emitting World Server IR.
Regression: the fixture asserts `Vector3 Size` becomes numeric `{ X: 4, Y: 12, Z: 4 }`.

## Honest blockers discovered

The reference game is not yet declared playable or visually equivalent.

- All 13 unique external Roblox asset IDs remain `unresolved-external` until owner-authorized/exported bytes are supplied or an evidenced procedural replacement is created.
- The file contains 5 `TerrainRegion` instances. Opaque terrain-region bytes are not fabricated; migration remains blocked until a supported decoder or owner-provided terrain export exists.
- Arbitrary Luau is not executed or blindly transpiled. Recognized behavior becomes a semantic World Server reimplementation plan and must still pass runtime tests.
- Final desktop/mobile/playable/visual quality gates remain mandatory.

## Reusable lesson

A robust Roblox migration should translate **game systems and intent**, not merely copy visible meshes and not blindly transpile source text. The safe reusable path is:

`RBXLX -> typed IR -> asset manifest -> semantic behavior plan -> Golden runtime adapters -> game-specific implementation -> normal World Server quality gates`.

This evidence intentionally preserves both the failed parser assumption and the successful fix so future agents can avoid repeating it.
