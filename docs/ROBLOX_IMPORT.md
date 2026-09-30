# Roblox → World Server import bridge

World Server imports owned/exportable Roblox `.rbxlx` projects as **data and behavior evidence**, never by executing embedded Luau during import.

## Pipeline

`RBXLX XML → parsed instance tree → World Server IR → asset manifest → semantic behavior plan → runtime adapter plan → game-specific reimplementation`.

The importer preserves the source hierarchy, transforms, sizes, materials and external asset references it can actually observe. Missing Roblox asset bytes remain `unresolved-external`; the importer does not fabricate geometry. Script source is hashed and inspected for known Roblox services/APIs, then classified into World Server capabilities such as raycasts, impulses, input, frame scheduling, tags and network events. Unsupported services are explicit warnings.

## Command

```bash
npm run roblox:import -- path/to/game.rbxlx --out work/game.world-server.json
npm run roblox:import -- path/to/game.rbxlx --summary
```

The resulting JSON is not automatically publishable. `migration.qualityGate` remains `NOT_READY_FOR_FINAL_DELIVERY` until external assets are supplied or replaced with evidenced procedural equivalents, semantic behaviors are reimplemented, and the normal World Server desktop/mobile/runtime quality gates pass.

## Runtime reuse

Imported games should reuse the Golden components instead of rebuilding them:

- controls/touch/mouse look: `shared/ai3d-playable-runtime.js`;
- collision and swept movement: `shared/golden-physics.js`;
- networking: World Server authoritative event/state layer;
- rendering/quality: existing World Server WebGL and quality-governor pipeline;
- Roblox UI: semantic rebuild onto `shared/golden-ui-shell.js`, preserving actions/layout intent rather than Roblox widget runtime;
- Terrain/TerrainRegion: explicit terrain lane; opaque region bytes require a supported decoder or an owner-provided export and are never silently approximated;
- audio/animation/external assets: manifest-first mapping, with unresolved bytes kept as blockers.

The semantic translator recognizes `Workspace:Raycast`, `ApplyImpulse`, assembly velocity, contact events, `RemoteEvent`, input services, `RunService`, TweenService, CollectionService, Humanoid/CFrame/attributes and common procedural/chunk patterns. Recognition means “adapter/reimplementation required”; it does **not** mean arbitrary Luau has been automatically translated.

## Asset policy

`rbxassetid://...` is recorded with source instance and property. Resolution is intentionally authorization-aware: provide exported files that you own or are allowed to reuse, then pass the resulting local World Server asset path in the import integration step. The core importer performs no hidden network fetch and does not assume that a Roblox asset ID grants reuse rights.

## Reference game: `городкамни.rbxlx`

The inspected reference contains procedural Gothic city generation, chunk systems, movement/climbing/air-control scripts, lighting/visual systems, a substantial moss-rock projectile system and three `RemoteEvent`s (`ThrowRock`, `DropRock`, `RockCinematic`). This makes it a useful integration fixture conceptually, but the original uploaded project is not committed to World Server; CI uses a small synthetic fixture that exercises the same importer contracts without copying the game.
