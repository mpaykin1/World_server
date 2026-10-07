# Semantic KX Authoring v1

This layer removes the remaining manual `paramsRaw` step for the first useful native graph.

It ports Krieger's own compact parameter encodings from pinned `_types.cpp`:

- `g` → F16
- `f` → F24
- `e` → X16 fixed point
- `i/s/b/c/m` → integer/color encodings
- `-` → unstored data slot

The semantic schema currently emits native packed payloads for the proven core needed by simple authored objects, including Cube, Cylinder, SingleVert, Subdivide, Crease, Triangulate, Bevel, Grid, Center and Scene.

The first end-to-end graph is:

`GameRecipe cube + bevel -> Mesh_Cube -> Mesh_Bevel -> Init_Scene_Scene -> compact .kx bytes`.

The emitted graph is deliberately not attached to an existing Demo/IPP root yet. The plan records `authoredGraphReachableFromExistingRoots:false`; this keeps runtime behavior unchanged while proving that semantic authoring can now create a valid connected native graph. The next layer is safe root/scene attachment plus browser/WASM visual proof.
