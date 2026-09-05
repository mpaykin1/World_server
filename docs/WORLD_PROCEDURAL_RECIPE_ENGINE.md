# World Procedural Recipe Engine V3

A deterministic compact-world compiler inspired by demoscene procedural generation, integrated into World_server rather than replacing its existing voxel/PBR/animation/quality systems.

## Authority
The canonical world state is `voxel_worlds.revision + settings.proceduralRecipeHash`. Navigator changes are committed only server-side through `world_procedural_recipe_commit_v3`, which atomically compare-and-swaps the revision and writes `voxel_world_events`. Realtime messages are hints only.

## Generation
Base deterministic chunks can be extended by `world-procedural-grammar`, then passed through existing quality/material systems. Worker threads/Web Workers are supported; CPU fallback is mandatory. Sparse voxel DAG is an exact cache/transport representation, not a different world model.

## Cache
Distributed generated-chunk cache uses unique content-addressed records in the existing factory asset registry. It deliberately does not overwrite `voxel_world_snapshots` because those snapshots already carry authoritative world-compaction semantics.

## Web / Native
`world-procedural-native-contract` defines canonical sorted voxel lines and SHA-256. The included Godot script must emit the same signatures. `world-procedural-native-diff.js --strict` blocks promotion on mismatch.

## Self improvement
Telemetry tournament candidates may be persisted to the existing `procedural_quality_learning` table. Automatic promotion requires verified, regression-free, golden-verified and device-certified evidence; code presence alone never raises quality.
