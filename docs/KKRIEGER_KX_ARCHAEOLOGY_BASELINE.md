# Krieger KX archaeology baseline — real beta graph

Status: 2026-09-30  
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`  
Analyzed data: `werkkzeug3_kkrieger/data/kkrieger_beta_conv.kx`

This is the World Server quantitative baseline for authentic Krieger authoring.

## Measured graph

The converted real beta contains:

- **125,382 bytes**
- **4,817 operators**
- **77 operator classes**
- **38 splines**

Representative operator counts:

| Operator | Count |
|---|---:|
| Mesh_Transform | 621 |
| Scene_Transform | 335 |
| Mesh_MatLink | 283 |
| Mesh_Cube | 224 |
| Mesh_Multiply | 218 |
| Bitmap_HSCB | 201 |
| Bitmap_Merge | 178 |
| Mesh_Add | 172 |
| Mesh_TransformEx | 162 |
| Scene_Add | 160 |
| Mesh_Color | 156 |
| Bitmap_GlowRect | 150 |
| Mesh_Bend | 123 |
| Scene_Scene | 94 |
| Scene_Multiply | 77 |
| Material_Material | 75 |
| Mesh_AutoCollision | 73 |
| Mesh_UVProjection | 69 |
| Bitmap_Normals | 68 |
| Mesh_CollisionCube | 52 |
| Scene_Light | 49 |
| Scene_Sector | 47 |
| Mesh_ShadowEnable | 46 |
| Scene_Portal | 35 |
| Scene_Physic | 16 |
| Mesh_Extrude | 10 |

The real game does use cubes, but they sit inside a much larger procedural program of transforms, material links, generated bitmaps, UVs, bends, scene composition, sectors, portals, lights and effects.

## Weapon operator graphs

The converted beta has four `KKrieger_Events` binding operators.

Optics (mode 1, operator 725):

- weapon 0 -> event 224
- weapon 1 -> event 342
- weapon 2 -> event 581
- weapon 4 -> event 643
- weapon 6 -> event 724

Shots (mode 0, operator 869):

- weapon 0 -> event 744
- weapon 1 -> event 758
- weapon 2 -> event 779
- weapon 4 -> event 836
- weapon 5 -> event 884
- weapon 6 -> event 868
- weapon 7 -> event 905

Explosion/hit families (modes 2 and 3) have eight non-null links each.

### Reachable dependency size

First-person optics:

| Weapon | Operators |
|---|---:|
| 0 | 224 |
| 1 | 293 |
| 2 | 362 |
| 4 | 232 |
| 6 | 297 |

Shot graphs:

| Weapon | Operators |
|---|---:|
| 0 | 19 |
| 1 | 20 |
| 2 | 21 |
| 4 | 59 |
| 5 | 20 |
| 6 | 63 |
| 7 | 22 |

Weapon 2 optics alone reaches 362 operators and includes a large procedural bitmap network plus Mesh_Transform, MatLink, Cylinder, Bend, UVProjection and related operations.

Therefore a Krieger weapon is best understood as an **operator program**, not a single model.

## World Server consequence

The reusable unit must become an operator recipe/subgraph:

```
KOp recipe
 -> bitmap/material dependencies
 -> mesh generation
 -> GenScene
 -> sector/portal/physics/effects
 -> Engine jobs
 -> framebuffer
```

Native Level Lab v2 should clone/parameterize real recipes rather than hand-author a large flat `GenMesh`.

## Next control experiments

1. replay one real geometry subtree with modified parameters;
2. replay one real material/bitmap subtree on new geometry;
3. preserve optics root 224 over a custom scene;
4. preserve shot root 744 end-to-end;
5. clone a minimal real Sector+Portal arrangement;
6. add provenance so every rendered object can report its KOp ancestry.

Canonical full note: `mpaykin1/scratch-chain-reaction/KRIEGER_KX_ARCHAEOLOGY_BASELINE.md`.
