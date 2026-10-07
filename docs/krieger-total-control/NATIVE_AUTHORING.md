# Krieger Native Authoring Compiler v1

This slice closes the largest gap identified by Trinity Lab: World Server can now compile a deterministic semantic game/scene recipe into a source-anchored Krieger operator plan.

## Input

The compiler accepts a bounded recipe containing materials, procedural objects, effects, portals and weapon bindings.

`tools/krieger-total-control/compile-native-authoring.mjs recipe.json plan.json`

## Output

The output is `world-server.krieger-native-authoring/v1` and contains deterministic nodes, edges, apply order, source symbols, Krieger class families, a pinned upstream SHA and coverage metrics.

Base geometry maps only to exported native operators present in the pinned player table: `Mesh_Cube` (`0x81`), `Mesh_Cylinder` (`0x82`), `Mesh_Grid` (`0x9d`) and `Mesh_SingleVert` (`0xb3`). Mesh modifiers are emitted as ordered input chains: `Subdivide 0x87`, `Transform 0x88`, `TransformEx 0x89`, `Crease 0x8a`, `Triangulate 0x8c`, `Displace 0x8f`, `Bevel 0x90`, `Extrude 0x9a`, `UVProjection 0xa5`, and `Center 0xa6`. Material assignment is not a synthetic edge: it inserts the real `Mesh_MatLink 0x96` operator between the final mesh and scene transform. Materials use `Init_Material_Material 0xd0`; scene composition uses `Init_Scene_Scene 0xc0`, `Init_Scene_Transform 0xc3`, `Sector 0xcb` and `Portal 0xcd`; effects use `PartEmitter 0x63` or `PartSystem 0x64`; monsters use `0x11`; collision uses `0x9c/0xce`; trigger `0x07`; sample playback `0x0c`. Weapon firing and MonsterAI are runtime bindings rather than falsely labeled document operators.

## Honesty boundary

This is a **source-anchored native authoring IR**, not yet a serializer for the compact `.kx` binary. The plan deliberately records `emitsNativeKxBinary:false`. The next stage is a pinned class-convention/packing resolver plus serializer. Known operator IDs are already embedded from the exact pinned handler table; the resolver must verify that each required real ID exists in the target `.kx` class table and supply its file-local command index, convention and packing before serialization.

That boundary is important: World Server now has an executable semantic compiler and mutation layer, but must not claim arbitrary `.kx` binary generation until the resolver/serializer passes round-trip tests against real upstream documents.

## Guarantees

- deterministic node IDs and edges from canonical recipe content;
- fail-closed unsupported geometry and dangling references;
- bounded object/operator budgets;
- exact upstream pin;
- every emitted node carries a source symbol and Krieger class family;
- plans can be merged into an existing graph without deleting prior nodes;
- semantic intent can be round-tripped from the plan.


Effect recipes must explicitly choose `partEmitter` or `partSystem`; ambiguous aliases fail closed. Portals require two distinct existing endpoints.


## Object placement contract

A normal authored mesh is converted to a scene object by the native `Init_Scene_Scene (0xc0)` operator directly. Its own packed parameters carry object scale, rotation and translation. `Init_Scene_Transform (0xc3)` is reserved for transforming an already-created scene and is not inserted between a mesh and `Scene`.

With material assignment the canonical object chain is:

`Mesh primitive -> mesh modifiers -> Mesh_MatLink -> Scene`.

Without a material link it is:

`Mesh primitive -> mesh modifiers -> Scene`.
