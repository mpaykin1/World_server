# Krieger Total Control — World Server extraction map

Status: 2026-09-30  
Priority: HIGHEST  
Canonical research/build repo: `mpaykin1/scratch-chain-reaction`  
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

## Mission

World Server must stop treating Krieger as a black box. Every reusable capability needs a verified provenance chain:

```
DATA -> GENERATOR -> RUNTIME OBJECT -> CPU JOB -> GPU PASS
-> MATERIAL/SHADER -> FRAMEBUFFER -> POSTPROCESS -> VIEWPORT -> CANVAS
```

and every action:

```
INPUT -> browser/WASM boundary -> KKriegerGame -> simulation
-> animation/effects -> renderer
```

## Native level path now mapped

The important discovery for future World Server-generated levels is that a real Krieger level should not be assembled by directly injecting one global render mesh forever.

The native route is:

```
WorldRecipe / seed
 -> procedural mesh operators
 -> GenMesh
 -> GenMaterial pass graph
 -> MakeScene
 -> GenScene { DrawMesh + CollMesh }
 -> Scene Transform/Add/Multiply
 -> Scene Sector
 -> Scene Portal
 -> Scene Light/Ambient
 -> Engine mesh/sector/portal/light jobs
 -> portal visibility + frustum
 -> Paint2004
 -> render targets/postprocess
 -> viewport/canvas
```

The same authored scene supplies gameplay collision:

```
GenScene::CollMesh
 -> KKriegerGame::SetScene
 -> SetSceneR
 -> AddMesh
 -> CellConnect
 -> PlayerCell
 -> simulation
```

Verified source anchors:

- `werkkzeug3_kkrieger/genmesh.hpp/.cpp`
- `werkkzeug3_kkrieger/genmaterial.cpp`
- `werkkzeug3_kkrieger/genscene.hpp/.cpp`
- `werkkzeug3_kkrieger/engine.cpp`
- `werkkzeug3_kkrieger/kkriegergame.cpp`
- `werkkzeug3_kkrieger/wasm/render2004.cpp`

## Current fidelity status — do not confuse visibility with Krieger fidelity

The 2026-09-30 physical-iPhone test is a second, stronger failure lesson.

The Level Lab is now visibly 3D, but the user correctly rejected it as a Krieger graphics proof: it is still primarily scaled `Mesh_Cube` primitives with a custom debug-like material; the first-person weapon is absent and FIRE does not create a working visible shot.

The exact root-cause record is canonical in:

- `docs/KKRIEGER_FAILURE_LEDGER.md`

From now on, a Krieger capability claim needs both **visual evidence** and **technology provenance evidence**. A changing non-black framebuffer is not enough. We must prove that the expected native operator/data chain actually executed.

The Level Lab v1 status is therefore:

`RENDERER/COLLISION ISOLATION HARNESS — NOT KRIEGER FIDELITY PROOF`.

## First extraction classification

| Capability | Status for World Server | Why |
| --- | --- | --- |
| procedural mesh recipe/operators | ADAPT | high-value compact geometry model; wrap behind a stable recipe compiler |
| GenMesh data layout concepts | ADAPT | useful bridge target, but do not make all World Server systems depend on legacy structs |
| material pass concepts | ADAPT | base/light/shadow/post phases are useful; backend details are legacy-specific |
| 2004 material/shader backend | KRIEGER-ONLY / REIMPLEMENT | valuable reference for fidelity, not the long-term universal renderer API |
| GenScene transform/add/multiply graph | ADAPT | maps naturally to WorldRecipe composition |
| sector/portal visibility | ADAPT | strong fit for infinite interiors/chunk visibility |
| collision-cell graph | ADAPT | useful for authored Krieger worlds; World Server still needs engine-independent physics contracts |
| weapon recipe pipeline | RESEARCH -> ADAPT | source path known; recipe interface not yet extracted |
| creature morphology/bones/AI | RESEARCH -> ADAPT | high-value, but dependencies need mapping before extraction |
| procedural texture/material graph | RESEARCH -> ADAPT | central to compact content; provenance/dependency map still incomplete |
| browser/WASM shell | REUSE/ADAPT | already proven as a reproducible integration boundary |
| fixed legacy platform glue | OBSOLETE for World Server | historical compatibility layer, not a new architecture target |

These statuses are architectural guidance, not license conclusions. Verify license/provenance per source file and per data asset before moving implementation.

## Mandatory labs before an infinite generator

1. Mesh Lab — one asymmetric object, normals/UV/COLOR0 visible and inspectable.
2. Material Lab — base only -> base+light -> base+light+post.
3. Light Lab — move one real light and verify framebuffer response.
4. Level Lab v2 — two native sectors, one portal, same scene drives render and collision.
5. Viewport Lab — pre-post/final capture over 16:9, 19.5:9, 4:3, 1:1, 9:16 and narrow portrait.
6. Weapon Lab — switch state and visible render object must agree.
7. Creature Lab — generated mesh + skeleton + animation + collision + AI state must be inspectable.

## Visual evidence rule learned from physical iPhone

A non-black canvas is not proof of a visible level.

The first custom Level Lab passed synthetic CI at >92% non-black but a physical iPhone showed almost one flat blue-gray surface plus a horizontal black band. The initial camera was looking straight into one wall and the room shell contained a wall/ceiling gap.

Future gates must combine:

- >85% occupied central framebuffer;
- dominant-colour rejection;
- luminance variance;
- edge density;
- multiple quantized colours;
- framebuffer change after a real C++ camera rotation;
- DOM controls hidden during capture;
- physical-device confirmation as final authority.

## End state

```
Krieger Archaeology
 -> Knowledge Graph
 -> Observatory + Labs
 -> Capability Extraction
 -> World Server Procedural 3D Core
 -> Infinite Level / Creature / Weapon / Architecture generators
 -> AI-controlled WorldRecipe compiler
```

The goal is not to preserve Krieger forever as a monolith. The goal is to understand it well enough that World Server can deliberately reuse, adapt or independently reimplement each valuable idea.
