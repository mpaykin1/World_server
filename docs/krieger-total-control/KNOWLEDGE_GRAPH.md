# Knowledge Graph contract

The knowledge graph is machine-readable because prose alone cannot prevent archaeology from becoming folklore.

## Ten maps

| Map | Concrete source roots | Current World Server decision |
|---|---|---|
| Geometry | `genmesh.cpp`, `genminmesh.cpp` | ADAPT |
| Material | `genmaterial.cpp`, `engine.cpp`, `wasm/shader_translate.cpp` | ADAPT |
| Renderer | `engine.cpp`, `wasm/_start_wasm.cpp` | ADAPT |
| Scene / Level | `genscene.cpp`, portal/sector code, `KKriegerCell` | ADAPT |
| Creature | `KKriegerMonster`, MonsterAI, walk/collision, mesh animation | ADAPT |
| Weapon | OnKey → inventory gate → NextWeapon → WeaponTimer → CurrentWeapon | ADAPT |
| Effects | `geneffect.cpp`, `genoverlay.cpp` | ADAPT |
| Audio | V2 player/SFX + WASM audio bridge | ADAPT |
| Browser / WASM | SDL events, main loop, WebGL platform layer, shell | ADAPT |
| Data / Compression | `KDoc::Init`, packer/depacker, operator graph | ADAPT |

The exact symbols and literal source anchors live in `data/krieger-knowledge-graph.json` and are checked against the pinned checkout by `verify-upstream.mjs`.

## Important source chains already verified

### Geometry

Procedural operators in `GenMesh` include primitive generation, CSG-style splitting, extrusion, subdivision, bones, normals, triangulation, cutting, displacement, bevel and Perlin deformation. `GenMinMesh` adds a compact topology/animation representation. Engine conversion enters `EngMesh::FromGenMesh` / `FromGenMinMesh`, fills GPU-facing buffers and creates material jobs.

### Renderer

`Engine_::Paint` exposes a useful frame lifecycle: build paint jobs → sort → apply view/projection → render. The engine has separate `MeshJob`, `EffectJob`, `PaintJob` and `PortalJob` structures, light admission, frustum tests and portal/sector visibility.

### Data

`KDoc::Init` reconstructs classes, operator connectivity, compact parameters, strings, splines, blobs, animation bytecode, events and roots from the exported byte stream. This is a central candidate for a future WorldRecipe compiler IR because it proves how a small declarative graph expands into large generated content.

### Weapon

The real game does **not** use the browser label as weapon truth. `KKriegerGame::OnKey` maps digit keys through:

`weaponswap[8] = {-1,0,1,2,4,6,-1,-1}`

and accepts a request only when `Player.Weapon[i]` is owned. A real switch later commits in `AddEvents` only when `WeaponTimer >= 1.0f`. The Observatory therefore records request, rejection/acceptance, pending animation and actual commit separately.

## Extraction rule

A source subsystem is never promoted into World Server merely because it is clever. Each capability must state input, output, coupling, provenance/license, tests, modern equivalent and one of the five dispositions. See `data/krieger-capability-map.json`.
