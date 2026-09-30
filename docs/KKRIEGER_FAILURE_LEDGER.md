# Krieger Failure Ledger

Status: 2026-09-30  
Priority: HIGHEST  
Purpose: preserve failed approaches as reusable engineering evidence so later chats/agents do not repeat them.

## Failure KFL-002 — Level Lab became visible, but stopped being Krieger

### Physical-device evidence

On 2026-09-30 the user tested the published Level Lab on a physical iPhone.

What improved compared with the previous failure:

- the scene is no longer black;
- the previous flat gray/black-screen failure is gone;
- portrait projection and camera movement produce visible 3D;
- the custom collision space is traversable.

What still failed, and therefore makes this build **not an acceptable Krieger-level proof**:

- graphics are crude flat pastel primitives rather than Krieger-class procedural graphics;
- no first-person weapon is visible;
- FIRE does not produce a working shot/effect;
- the test technically passed framebuffer diversity/parallax gates, proving those gates are insufficient for technology/fidelity acceptance.

The current Level Lab must be treated as a **renderer/collision isolation harness**, not as proof that we know how to author a real Krieger level.

## Root cause 1 — the lab bypassed the native render contract

Current scratch-chain Level Lab patches `Engine_::Paint` and, while `__kkLevelLab` is active, executes:

```cpp
MeshJobs = 0;
EffectJobs = 0;
PortalJobs = 0;
SectorJobs = 0;
LightJobCount = 0;
Lights04Count = 0;
WeaponLightSet = sFALSE;
AmbientLight = 0;
```

It then injects only one custom `EngMesh`, two manual lights and ambient light.

That solved isolation/debugging problems, but it also erases jobs that the original operator graph queued for:

- authored meshes;
- weapon optics/viewmodel;
- projectile/effect rendering;
- sector/portal visibility;
- original lights;
- other scene effects.

**Lesson:** never obtain a "clean custom level" by deleting the native engine job graph. Future labs must add a new native scene/root or selectively scope scene content while preserving the normal job lifecycle.

Exact source anchors:

- scratch integration: `tools/kkrieger-level-lab/patch-level-lab.py`, `patch_engine()`;
- upstream: `werkkzeug3_kkrieger/engine.cpp`, `Engine_::Paint`;
- upstream: `werkkzeug3_kkrieger/genscene.cpp`, `ExecSceneInput`.

## Root cause 2 — ResetRoot/Flush destroyed the weapon operator tables

The Level Lab ResetRoot isolation path calls `Flush()` after the original painter/root setup and then installs only custom collision.

Upstream `KKriegerGame::Flush()` explicitly clears:

```cpp
WeaponShot[i] = 0;
WeaponOptics[i] = 0;
WeaponExplode[0][i] = 0;
WeaponExplode[1][i] = 0;
```

and also resets weapon timing/current-next state.

In the real game those arrays are populated by `Exec_KKrieger_Events` from the authored operator graph.

The real visible weapon path is:

```
Exec_KKrieger_Events(mode=WeaponOptics)
 -> WeaponOptics[current]
 -> KKriegerGame::AddEvents
 -> WeaponEvent.Op
 -> KEnvironment::AddStaticEvent
 -> operator/event execution
 -> GenScene / mesh/effect jobs
 -> Engine renderer
 -> framebuffer
```

The real firing path is:

```
browser/touch
 -> sKEY_MOUSEL
 -> KKriegerGame::OnKey
 -> Player.FireKey
 -> KKriegerGame::OnTick
 -> ammo/cooldown/WeaponTimer checks
 -> WeaponShot[current]
 -> FireShot
 -> KKriegerShot::Event.Op
 -> shot simulation
 -> AddEvents
 -> effect/mesh renderer
```

The mobile `kkLabFire` bridge does reach `sKEY_MOUSEL`; the primary failure is downstream. The lab destroyed or bypassed the operator data and then erased jobs that a weapon event would need to render.

**Lesson:** input telemetry alone is not proof of a gameplay feature. Tests must prove the entire state/effect chain.

Exact source anchors:

- upstream `werkkzeug3_kkrieger/kkriegergame.cpp`:
  - `KKriegerGame::Flush`
  - `Exec_KKrieger_Events`
  - `KKriegerGame::AddEvents`
  - `KKriegerGame::OnTick`
  - `KKriegerGame::FireShot`
  - `KKriegerGame::OnKey`.

## Root cause 3 — geometry used only the smallest fragment of GenMesh

The Level Lab geometry was built primarily from 29 calls to `Mesh_Cube`, transformed/scaled into walls, floors, pillars and towers.

This proves that `GenMesh -> EngMesh -> renderer` works. It does **not** reproduce Krieger's visual language.

The actual procedural mesh toolbox includes, among others:

- `Mesh_Cube`
- `Mesh_Cylinder`
- `Mesh_Torus`
- `Mesh_Sphere`
- `Mesh_Extrude`
- `Mesh_ExtrudeNormal`
- `Mesh_Bevel`
- `Mesh_Subdivide`
- `Mesh_Cut`
- `Mesh_Bend` / `Mesh_Bend2` / `Mesh_BendS`
- `Mesh_Displace`
- `Mesh_Perlin`
- `Mesh_Multiply` / `Mesh_Multiply2`
- `Mesh_Grid`
- `Mesh_UVProjection`
- `Mesh_Crease`
- `Mesh_CalcNormals`
- `Mesh_Color`
- `Mesh_LightSlot`
- `Mesh_AutoCollision`.

A Krieger-class level recipe must compose operators, not merely place scaled cubes.

Exact source: `werkkzeug3_kkrieger/genmesh.cpp`.

## Root cause 4 — the lab replaced Krieger materials with a debug material

The black-screen repair introduced a handcrafted two-pass material:

```
ENGU_BASE
ENGU_LIGHT
```

This was correct as a renderer-forensics experiment, but it omitted the visual richness of the real authored material graph.

`Init_Material_Material` can consume up to eight procedural bitmap links and build multiple phases including:

- `ENGU_BASE`;
- `ENGU_LIGHT`;
- `ENGU_SHADOW`;
- `ENGU_POSTLIGHT` texture multiplication;
- `ENGU_POSTLIGHT2` environment/reflection;
- alpha test/fade;
- diffuse/specular controls;
- specularity map;
- bump/detail-related texture inputs;
- texture transforms/scales and render passes.

Exact source: `werkkzeug3_kkrieger/genmaterial.cpp`.

**Lesson:** fixing pass order is necessary but not equivalent to reproducing the material system.

## Root cause 5 — procedural texture generation was absent

The current Level Lab uses vertex colours rather than Krieger's procedural bitmap graph.

The real bitmap system contains operators such as:

- `Bitmap_Perlin`
- `Bitmap_Cell`
- `Bitmap_Gradient`
- `Bitmap_Bricks`
- `Bitmap_GlowRect`
- `Bitmap_Dots`
- `Bitmap_Wavelet`
- `Bitmap_Blur`
- `Bitmap_Distort`
- `Bitmap_Normals`
- `Bitmap_Bump`
- `Bitmap_Light`
- `Bitmap_Mask`
- `Bitmap_Merge`
- colour/HSCB/range operations.

Exact source: `werkkzeug3_kkrieger/genbitmap.cpp`.

**Lesson:** "procedural geometry" without procedural texture/material generation is only a small subset of Krieger technology.

## Root cause 6 — the lab did not use native GenScene authoring

The native route already exists.

`MakeScene(KObject*)` converts a `GenMesh` into a `GenScene` with:

- `DrawMesh` for rendering;
- `CollMesh` for Krieger collision.

`ExecSceneInput` then queues real meshes/effects into `Engine->AddPaintJob`.

Native scene composition includes:

- `Scene_Scene`
- `Scene_Add`
- `Scene_Multiply`
- `Scene_Transform`
- `Scene_Light`
- `Scene_Ambient`
- `Scene_Sector`
- `Scene_Portal`
- `Scene_Particles`
- `Scene_LOD`
- limbs/animation-related scene operators.

Exact source: `werkkzeug3_kkrieger/genscene.cpp`.

**Lesson:** Level Lab v2 must author a native scene graph. Directly injecting one global `EngMesh` is allowed only as a focused renderer lab.

## What the failed CI taught us

Previous acceptance required:

- >85% occupied/non-black framebuffer;
- luminance variation;
- multiple coarse colours;
- edge density;
- meaningful framebuffer delta after C++ camera rotation.

All of that passed. The physical iPhone still showed graphics that were obviously not Krieger.

Therefore visual pixel statistics answer only:

> "Is there changing 3D imagery?"

They do **not** answer:

> "Was the Krieger procedural content stack actually used?"

Future acceptance needs **provenance gates** in addition to visual gates.

## Mandatory Level Lab v2 provenance gates

A new Krieger-level demo is not publishable as "Krieger graphics" until telemetry/tests prove:

1. at least one real procedural `GenBitmap` graph reaches a material texture slot;
2. the visible level uses native `GenMaterial` construction, not only a debug replacement;
3. the recipe exercises nontrivial `GenMesh` operators appropriate to the form (for example bevel/extrude/cut/displace/UV), not only cube placement;
4. visible geometry runs through `GenScene` / `ExecSceneInput`;
5. multi-room tests exercise `Scene_Sector` and `Scene_Portal` instead of clearing their jobs;
6. original `MeshJobs`/`EffectJobs` are not blanket-reset inside `Engine_::Paint`;
7. `WeaponOptics[current]` and `WeaponShot[current]` are non-null after scene/root setup;
8. `WeaponEvent.Op` becomes non-null and the first-person weapon produces renderer jobs;
9. pressing FIRE changes real gameplay state: ammo/cooldown/shot count/event state, not merely an input flag;
10. projectile/effect jobs reach the renderer and are visible;
11. the physical iPhone is the final acceptance authority.

Do not game these gates with counters. Every telemetry value must originate at the stage it claims to prove.

## Correct Level Lab v2 architecture

```
WorldRecipe / seed
 -> GenBitmap procedural texture graph
 -> GenMaterial multipass graph
 -> GenMesh procedural operator graph
 -> Mesh_MatLink / UV / normals / tangents
 -> MakeScene
 -> GenScene { DrawMesh + CollMesh }
 -> Scene Transform/Add/Multiply
 -> Sector / Portal
 -> Scene Light / Ambient / Effects
 -> KKriegerGame::SetScene / collision cells
 -> native weapon-event tables preserved
 -> Document + Game AddEvents
 -> Engine mesh/effect/sector/portal/light jobs
 -> Paint2004
 -> postprocess/render targets
 -> viewport/canvas
```

The Level Lab should replace **authored content**, not the renderer/gameplay contracts.

## MUST NOT REPEAT

- Do not clear `MeshJobs`, `EffectJobs`, `SectorJobs`, `PortalJobs` as a method of creating a custom level.
- Do not call a destructive `Flush()` after weapon/event operator tables were established unless they are deliberately reconstructed afterward.
- Do not call a cube-room with vertex colours "Krieger graphics".
- Do not treat renderer visibility as graphics-fidelity evidence.
- Do not test FIRE only at the browser-input boundary.
- Do not declare a weapon working unless its model, animation/event, shot creation and effect path are all proven.
- Do not publish a Krieger fidelity claim until a physical-device screenshot confirms what the telemetry claims.

## Next research milestone

Before another "new level" release, build focused native labs in this order:

1. **Material Lab v2** — one Krieger mesh + real GenBitmap + real GenMaterial phases.
2. **Weapon Lab v2** — preserve `Exec_KKrieger_Events`, show original first-person weapon, FIRE creates a real shot.
3. **Native Level Lab v2** — two authored rooms, native `GenScene`, sectors/portal, real materials/lights/effects, same scene provides collision.
4. **Fidelity gate** — compare provenance and physical screenshots against the known-good original Krieger path.

Only after these pass should the infinite `WorldRecipe -> Krieger compiler` work become the primary implementation path.
