# Krieger Graphics Fidelity Map — World Server learning copy

Status: 2026-09-30  
Priority: HIGHEST  
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`  
Reference: physical-iPhone portrait screenshot of the known-good Krieger scene, user-confirmed. Canonical archaeology/tooling lives in `mpaykin1/scratch-chain-reaction`.

This document defines what we now mean by **“graphics at Krieger level using Krieger technology.”** It is deliberately stricter than “rendered by the Krieger engine”.

## 1. What the reference frame contains

The reference frame visibly combines several different systems:

- layered architectural geometry: floor tiles, beams, pillars, arches/supports, wall modules and broken debris;
- several surface families: stone/concrete, dark metal, reddish/rusted or wood-like structure, organic/fleshy forms;
- high-frequency surface detail instead of flat vertex colours;
- strong local lights plus blown/soft highlights;
- deep dark regions, specular response and shadowing;
- first-person weapon with its own detailed geometry/materials;
- monsters with articulated silhouettes;
- debris and repeated modular pieces;
- HUD composited over the 3D scene.

Visual inference from the screenshot is useful, but the rest of this file is source/data evidence from the real packed operator graph.

## 2. The real game is a procedural program, not a model pack

Automated parsing of the shipped converted beta graph with upstream `wasm/tools/kxread.py` gives:

### `kkrieger_beta_conv.kx`

- **125,382 bytes**
- **4,817 operators**
- **77 operator classes**
- **18 events**
- **38 splines**
- category counts:
  - **2,376 mesh operators**
  - **1,258 bitmap operators**
  - **843 scene operators**
  - **75 material operators**
  - **33 IPP/postprocess operators**
  - **31 effect operators**
  - **22 game operators**
  - **179 misc/event/control operators**

### `kkrieger3383.kx`

- **125,145 bytes**
- **5,174 operators**
- **78 operator classes**
- **2 packed events**
- **23 splines**
- category counts:
  - **2,531 mesh**
  - **1,461 bitmap**
  - **866 scene**
  - **78 material**
  - **24 IPP**
  - **22 effect**
  - **24 game**
  - **168 misc**

The tiny packed data expands into a very large procedural dependency graph. That is the core Krieger technique we need to control.

## 3. Geometry fidelity — proven operator recipe shape

In the converted beta the most frequent mesh operators include:

| Operator | Count |
| --- | ---: |
| Mesh_Transform | 621 |
| Mesh_MatLink | 283 |
| Mesh_Cube | 224 |
| Mesh_Multiply | 218 |
| Mesh_Add | 172 |
| Mesh_TransformEx | 162 |
| Mesh_Color | 156 |
| Mesh_Bend | 123 |
| Mesh_AutoCollision | 73 |
| Mesh_UVProjection | 69 |
| Mesh_CollisionCube | 52 |
| Mesh_ShadowEnable | 46 |
| Mesh_Cylinder | 39 |
| Mesh_Subdivide | 36 |
| Mesh_Bend2 | 33 |

There are also Extrude, Displace, Perlin, Bevel, Center, LightSlot, Crease, Cut and other operators in the engine toolbox.

A representative high-complexity world mesh root in the converted beta is operator **4254**. Its reachable graph contains **722 operators**, including **317 mesh operators** and **11 material operators**.

Its mesh portion contains:

- 64 Mesh_Transform
- 42 Mesh_MatLink
- 41 Mesh_Cube
- 36 Mesh_TransformEx
- 27 Mesh_AutoCollision
- 26 Mesh_Bend
- 21 Mesh_Add
- 18 Mesh_Multiply
- 18 Mesh_ShadowEnable
- 6 Mesh_CollisionCube
- 5 Mesh_Bend2
- 2 Mesh_Cylinder
- 2 Mesh_Extrude
- 2 Mesh_UVProjection
- 2 Mesh_LightSlot

The analogous high-complexity root **5093** in `kkrieger3383.kx` reaches **748 operators**, including **326 mesh operators** and **12 materials**.

**Conclusion:** Krieger-style architecture is not “avoid cubes”. Cubes are heavily used, but they are raw procedural stock inside long graphs of transform, multiplication, bending, material assignment, UV work, collision and shadow control.

## 4. Real sectors are themselves large recipes

The level graph has exactly **47 Scene_Sector** operators and **35 Scene_Portal** operators in both analyzed data variants.

A representative large beta sector, operator **4328**, reaches **796 operators**. Its dependency graph contains, among its most frequent nodes:

- 86 Bitmap_HSCB
- 73 Mesh_Transform
- 57 Bitmap_Merge
- 47 Mesh_MatLink
- 44 Mesh_TransformEx
- 43 Mesh_Cube
- 29 Bitmap_Flat
- 29 Bitmap_GlowRect
- 27 Mesh_AutoCollision
- 26 Mesh_Bend
- 23 Bitmap_Normals
- 23 Bitmap_Blur

The corresponding large 3383 sector, operator **5163**, reaches **818 operators**.

This is direct evidence that a Krieger room/sector can be a hundreds-node composition of geometry, materials, procedural textures, collision and lighting rather than one baked mesh.

## 5. Surface fidelity — one material can contain 100+ bitmap operators

The procedural bitmap toolbox includes:

`Flat, Perlin, Color, Merge, Format, GlowRect, Dots, HSCB, Blur, Mask, Rotate, Distort, Normals, Light, Bump, Text, Cell, Gradient, Range, RotateMul, Twirl, Sharpen, ColorBalance` and others.

A representative rich beta material, operator **3427**, reaches **159 operators**, of which **158 are bitmap nodes**:

- 40 HSCB
- 21 Color
- 19 Merge
- 13 Perlin
- 13 Blur
- 12 Range
- 9 GlowRectOld
- 8 Rotate
- 5 Normals
- 4 Mask
- 3 Bump
- 3 Distort
- plus Flat, RotateMul, Sharpen, Format, Cell.

Another beta material at **2162** reaches 146 nodes; **2191** reaches 130.

In the 3383 graph material **4251** reaches **163 nodes**, with **162 bitmap operators**.

This is the most important correction to our earlier primitive Level Lab: a Krieger material is often a **procedural texture program**, not a colour and not a single texture.

## 6. Material rendering — native multipass contract

`Init_Material_Material` in `genmaterial.cpp` can connect up to eight generated bitmap links and produce multiple passes:

- `ENGU_BASE`
- `ENGU_LIGHT`
- `ENGU_SHADOW`
- `ENGU_POSTLIGHT`
- `ENGU_POSTLIGHT2`
- `ENGU_OTHER`

The material system controls:

- diffuse colour;
- specular power;
- optional specularity map;
- normal/bump/detail inputs;
- environment/reflection or sphere environment;
- alpha test/fade;
- texture transforms and scales;
- blend state;
- render pass.

The 2004 renderer then consumes these passes in its original pass ordering. Therefore “same mesh + two lights” cannot reproduce the reference frame without the original material recipe depth.

## 7. Lighting fidelity — the 2004 renderer is part of the look

The WASM reconstruction documents and implements the 2004 path in `Engine_::Paint2004` / `wasm/render2004.cpp`.

Verified properties include:

- up to four selected lights;
- importance selection based on range/distance;
- 2004-style range fade;
- weapon light entering the light list with high importance;
- shadow caster selection;
- half-size shadow-mask target;
- base/depth fill;
- stencil shadow-volume work;
- additive light contribution;
- tangent-space light direction for normal mapped surfaces;
- a later specular contribution;
- render order by material usage/pass rather than simply object order.

This is why local lamps in the reference can produce strong pools and why normal/specular texture detail matters.

## 8. Glow / final image is a real IPP graph

The converted beta contains an explicit postprocess chain.

One verified branch is:

```
4359 Viewport
 -> 4360 Color
 -> 4361 Color

4359 Viewport
 -> 4362 Color
 -> 4363 Color
 -> 4364 Blur
 -> 4365 Blur
 -> 4366 Color

4361 + 4366
 -> 4367 Merge
 -> 4368 Color
 -> 4369 Color
 -> 4370 Mask
```

The blur parameters include a 2.5/1.0 pass followed by a 3.0/2.0 pass. Additional viewport/colour/merge branches follow, and the final converted-beta composition includes:

`4482 IPP_Select -> 4815 IPP_Merge` together with viewport 4814.

This proves that bright soft lamp regions and global tonal composition are not just “strong point lights”. The final Krieger look includes explicit colour, blur, merge and mask processing.

## 9. First-person weapon fidelity — each gun is a procedural program

The converted beta has `KKrieger_Events` operator **725** in mode 1, which binds first-person optics:

- slot 0 -> root 224
- slot 1 -> root 342
- slot 2 -> root 581
- slot 4 -> root 643
- slot 6 -> root 724

Their dependency sizes are:

| Slot | Reachable ops | Bitmap | Mesh | Material | Scene |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 224 | 172 | 43 | 3 | 4 |
| 1 | 293 | 241 | 42 | 4 | 4 |
| 2 | 362 | 237 | 104 | 8 | 9 |
| 4 | 232 | 168 | 56 | 2 | 4 |
| 6 | 297 | 225 | 61 | 5 | 4 |

So the detailed weapon seen in the reference is not a simple mesh. It is another large procedural bitmap/material/mesh/event subgraph.

The firing family is separately bound by `KKrieger_Events` mode 0 (beta op **869**) and explosion/hit families by modes 2/3 (ops **926/916**).

The runtime chain remains:

```
input
 -> Player.FireKey
 -> OnTick gates
 -> WeaponShot[current]
 -> FireShot
 -> KKriegerShot::Event
 -> AddEvents
 -> scene/effect operators
 -> Engine jobs
 -> Paint2004
 -> pixels
```

Any custom-level architecture that clears these links or their queued jobs cannot be called Krieger-complete.

## 10. Shot effects are native scene/effect recipes

Shot subgraphs in the beta are smaller than optics but still structured:

- weapon 0 root 744: 19 reachable ops;
- weapon 1 root 758: 20;
- weapon 2 root 779: 21;
- weapon 4 root 836: 59;
- weapon 5 root 884: 20;
- weapon 6 root 868: 63;
- weapon 7 root 905: 22.

They use combinations of:

- PartEmitter;
- procedural bitmaps;
- mesh/material;
- Scene_Transform;
- Scene_Multiply;
- Scene_Add;
- Scene_Light;
- PlaySample;
- Scene_Physic;
- SplashDamage where appropriate.

That is the correct template for future World Server `WeaponRecipe` generation.

## 11. Monsters are also coupled graphics + runtime recipes

The converted beta contains four `KKriegerMonster` operators (1183, 1415, 1696, 1855) with distinct walk style / weapon-kind combinations. The 3383 graph has analogous monster operators at 1765, 1961, 2267 and 2520.

The scene graph also contains **15 Scene_Limb** operators and walk-related scene operators. Runtime behavior is handled in `KKriegerGame::MonsterAI` and movement/leg state in the Krieger game code.

A future creature generator therefore has to preserve:

`morphology/mesh -> material -> limb/walk animation -> collider -> Monster parameters -> AI -> shot/death events`.

## 12. The correct authoring abstraction

The unit we need to learn and generate is **the operator recipe/subgraph**.

Not:

`“make a mesh that resembles Krieger”`.

But:

```
MaterialRecipe
 = procedural bitmap DAG
 + multipass material parameters

ArchitectureRecipe
 = primitive/topology ops
 + transform/multiply/bend/extrude
 + UV/material links
 + shadows/collision
 + Scene composition
 + Sector/Portal/Light

WeaponRecipe
 = optics subgraph
 + shot subgraph
 + wall-hit subgraph
 + monster-hit subgraph
 + runtime parameters

CreatureRecipe
 = mesh/material graph
 + limb/walk graph
 + collider
 + monster parameters/events
```

This is the bridge from Krieger archaeology to World Server generation.

## 13. Definition of “Krieger-level graphics” for future MVPs

A new demo cannot be described as Krieger-level merely because it uses the Krieger renderer.

It must prove at minimum:

1. **procedural geometry provenance** — nontrivial mesh graph beyond raw cube placement;
2. **procedural texture provenance** — a real Bitmap DAG reaches visible materials;
3. **native material provenance** — base/light/shadow/post/environment behavior is intentional;
4. **native scene provenance** — visible content reaches the renderer through GenScene/ExecSceneInput;
5. **lighting provenance** — real Scene_Light/Engine light jobs affect the surface;
6. **postprocess provenance** — the intended IPP chain reaches the final target;
7. **weapon provenance** — if FPS, WeaponOptics is non-null and visibly rendered;
8. **shot provenance** — FIRE creates the real shot/event/effect path;
9. **collision/topology provenance** — sector/portal/collision state remains valid;
10. **physical-device visual confirmation** — a real iPhone screenshot can veto synthetic PASS.

## 14. What is proven vs what remains unknown

### Proven

- exact operator counts and class families in both packed KX graphs;
- exact weapon binding operator indices and subgraph sizes;
- exact sector/portal/light counts;
- existence of 700–800 node world/sector recipes;
- existence of 100–160 node procedural bitmap material recipes;
- exact postprocess graph topology for the inspected IPP branches;
- native renderer/material/scene/weapon runtime contracts.

### Not yet proven

- the exact operator root responsible for each individual visible pillar/tile/organic surface in the reference screenshot;
- which of the rich material roots maps to each visible surface in that exact frame;
- a clean public API for authoring a brand-new KX graph from a high-level WorldRecipe;
- deterministic parameter mutation of one real source subgraph while preserving its intended appearance;
- a new independently authored scene that reaches reference-level fidelity on physical iPhone.

Those are now targeted experiments, not mysteries hidden behind “style”.

## 15. Next experiments — fixed order

1. **Material Recipe Lab** — replay one real 40–100+ node texture/material subtree on a new asymmetric mesh.
2. **Geometry Recipe Lab** — clone one real mesh recipe, change controlled transforms/bends/scale, keep its material/collision provenance.
3. **Weapon Optics Lab** — preserve one full optics subgraph (start with slot 0/root 224) over a minimal new scene.
4. **Weapon Shot Lab** — preserve root 744 and prove shot creation + particle/light/effect + collision.
5. **Native Sector Lab** — two newly authored rooms inside real Sector/Portal composition; do not clear Engine jobs.
6. **Krieger Recipe Compiler** — `WorldRecipe -> operator graph/subgraph -> GenBitmap/GenMaterial/GenMesh/GenScene`.
7. Only then: a full new level whose physical-device frame can be compared with the reference.

The goal is no longer to imitate the screenshot. The goal is to control the same **generative mechanisms** that produced the class of image shown in it.
