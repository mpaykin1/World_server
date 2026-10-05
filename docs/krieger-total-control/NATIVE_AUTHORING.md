# Krieger Native Authoring Compiler v1

This slice closes the largest gap identified by Trinity Lab: World Server can now compile a deterministic semantic game/scene recipe into a source-anchored Krieger operator plan.

## Input

The compiler accepts a bounded recipe containing materials, procedural objects, effects, portals and weapon bindings.

`tools/krieger-total-control/compile-native-authoring.mjs recipe.json plan.json`

## Output

The output is `world-server.krieger-native-authoring/v1` and contains deterministic nodes, edges, apply order, source symbols, Krieger class families, a pinned upstream SHA and coverage metrics.

Supported geometry currently maps to real Krieger generator symbols including `GenSimpleMesh::Cube`, `GenMesh::Ring`, `GenMesh::Extrude`, `GenMesh::Subdivide`, `GenMesh::Bevel` and `GenMesh::Displace`. Materials map to `GenMaterial::AddPass`; scene placement maps to `ExecSceneInput`; particles map to the real effect initializers; weapons bind to the real `KKriegerGame::FireShot` runtime path.

## Honesty boundary

This is a **source-anchored native authoring IR**, not yet a serializer for the compact `.kx` binary. The plan deliberately records `emitsNativeKxBinary:false`. The next stage is a pinned operator resolver/serializer that converts these symbolic nodes to exact command IDs/data layouts at the upstream commit.

That boundary is important: World Server now has an executable semantic compiler and mutation layer, but must not claim arbitrary `.kx` binary generation until the resolver/serializer passes round-trip tests against real upstream documents.

## Guarantees

- deterministic node IDs and edges from canonical recipe content;
- fail-closed unsupported geometry and dangling references;
- bounded object/operator budgets;
- exact upstream pin;
- every emitted node carries a source symbol and Krieger class family;
- plans can be merged into an existing graph without deleting prior nodes;
- semantic intent can be round-tripped from the plan.
