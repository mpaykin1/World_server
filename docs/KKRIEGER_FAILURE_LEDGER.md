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


## Failure KFL-003 — Reactor Recipe Proof rendered only the weapon; CI also looked "hung"

### Evidence

The first Dark Reactor Recipe Proof build compiled successfully and preserved the native Krieger weapon pipeline. CI telemetry proved:

- custom reactor geometry: 10,262 vertices / 7,900 faces;
- procedural materials initialized;
- player collision cell valid;
- `WeaponOptics[current]` and `WeaponShot[current]` became non-null;
- the original first-person weapon was visibly rendered.

But the captured framebuffer was still effectively black except for HUD + weapon:

- non-black central framebuffer: ~1.85%;
- dominant black bin: ~98.2%.

The screenshot therefore proved a useful distinction: **the native weapon path worked while our new world render was not visible**.

### Root causes

1. The player was inside a closed shell built from ordinary outward-facing geometry, while the custom reactor material passes were one-sided. Interior wall faces could be back-face culled.
2. The inherited start yaw (`2.582993`) came from an older Level Lab layout and looked past the new reactor centre in the very narrow portrait horizontal FOV.
3. The visual smoke test captured after movement/look mutations, so it judged an arbitrary later camera instead of the deterministic first public frame.
4. CI used iPhone DPR=3 under SwiftShader (1170×2532 backing buffer) and ran duplicate push + pull-request workflows. With multipass lighting, procedural textures and double-sided geometry this made the proof unnecessarily slow and looked like a hang.

### Fixes

- make the custom reactor base/light/shadow/postlight passes double-sided;
- author a new start yaw near `1.95` aimed at the reactor centre;
- add a deterministic `kkLabHeroView()` reset and judge the public hero view;
- keep gameplay movement/look/FIRE proofs separate from the visual hero-view proof;
- run visual CI at the same 390×844 CSS portrait but DPR=1; physical iPhone remains the final high-DPR authority;
- remove the duplicate pull-request Reactor workflow trigger and use one concurrency group.

### MUST NOT REPEAT

- do not reuse a camera pose from a different procedural layout;
- do not build an interior shell with one-sided passes unless the geometry explicitly has inward faces;
- do not measure graphics fidelity from a camera that smoke tests have already moved unpredictably;
- do not spend 9× more software-render pixels in CI when the test is about recipe visibility rather than Retina resolution;
- do not run duplicate heavyweight push + PR jobs for the same Krieger proof.


## Failure KFL-004 — Dark Reactor is original, but physical iPhone exposes fidelity, FIRE-visual and viewport regressions

**Physical-device evidence:** 2026-10-01, iPhone.  
**Reference:** known-good original Krieger frame has dense surface detail, multiple material families, local light pools, deep shadows/specular response, readable floor/wall/ceiling texture structure, visible weapon and active combat effects.  
**Custom Reactor:** architecture is original and traversable, but the scene is strongly overexposed/flattened; many surfaces collapse toward one cream/yellow family; procedural detail is not perceptually comparable to the original. FIRE produces sound/state change but no visible firing animation/effect. Looking around can drag the browser page. In landscape Safari/tab chrome remains visible instead of game-only presentation.

### What is NOT a failure

Keep these capabilities as successful and do not regress them while fixing fidelity:

- a genuinely new Krieger level/architecture exists rather than a replay of the original level;
- custom collision works;
- jump works;
- portrait uses the full game surface;
- mobile joystick movement works;
- the original detailed first-person weapon is visibly preserved.

The failure is therefore **not “custom level impossible.”** It is the next layer: surface/material fidelity, dynamic light/shadow, visible shot FX, and universal mobile viewport/fullscreen discipline.

### Confirmed root cause A — the rescue material deliberately abandoned the full Krieger material contract

The Reactor was made visible by replacing the attempted full Material 1.1 reproduction with a “stable BASE+LIGHT” fallback. The code explicitly marks this telemetry as `stableBaseLight=1`.

That fallback keeps:
- procedural diffuse texture;
- procedural normal/bump texture;
- BASE;
- LIGHT.

But it omits or bypasses the important parts of the richer Krieger look:
- the normal native `ENGU_SHADOW` material path for the custom materials;
- `ENGU_POSTLIGHT` texture multiplication in the intended 2004 sequence;
- `ENGU_POSTLIGHT2` / environment-reflection style stages;
- the full native `Material11Insert` compositor interaction;
- material-specific alpha/specularity/environment behavior.

This was a valid emergency renderer-forensics step, but it must not be mistaken for a Krieger-fidelity material solution.

### Confirmed root cause B — four simple generated maps cannot substitute for Krieger material recipes

The custom Reactor currently synthesizes only a tiny material vocabulary: stone/metal/glow and four simple procedural bitmap inputs based mainly on Bricks/Perlin/Normals.

The mapped original data shows that rich Krieger materials can be 100–160+ operator bitmap programs using chains such as:

`Perlin -> Merge -> HSCB -> Blur -> Range -> Mask -> Distort -> Normals/Bump -> material slots`.

Therefore “procedural texture exists” was too weak a gate. The custom scene is procedurally textured in a technical sense while still looking flat and uniform on a physical phone.

### Confirmed root cause C — the custom light rig is much simpler than the original look

The Reactor appends a few manual `AddLightJob` lights plus ambient. That proves lights reach the renderer, but it is not equivalent to the original authored lighting program.

The reference frame depends on the 2004 lighting/compositor stack: selected local lights, range fade, normal response, specular contribution, shadow volumes/masks and later image processing. The custom fallback material also removed the custom shadow pass, so geometry can be lit without reproducing the deep light/shadow separation visible in the original.

The physical result — broad pale surfaces and lost micro-contrast — is consistent with this simplified material/light contract.

### Confirmed root cause D — the FIRE gate proved simulation, not visible firing

The Reactor smoke test accepts FIRE when any of these native state transitions occurs:

- shot count rises; or
- ammo falls; or
- cooldown rises.

That proves:
`touch -> kkLabFire -> FireKey -> OnTick -> WeaponShot/FireShot`.

It does **not** prove:
`shot event -> visible muzzle/recoil/projectile/effect jobs -> framebuffer`.

The user's iPhone result is decisive: sound is audible, but there is no visible firing animation/effect. Therefore the old gate was a false positive for the user-visible feature.

### FIRE visual hypotheses to test next

These are hypotheses, not yet confirmed causes:

1. The shot/audio event is alive, but the visual subgraph queues Effect/Scene jobs whose bounds/sector assumptions belong to the original level while the player now lives near the isolated Reactor origin (~X=1000).
2. A muzzle/projectile effect reaches jobs but is culled, sorted, or composited away by the altered custom material/render setup.
3. Recoil/weapon animation state changes but is too short or not sampled by the current mobile bridge/test; the test never compares weapon-region pixels before/after FIRE.
4. Audio can succeed independently of visual effect, so “sound heard” cannot be used as evidence for the render half of the shot pipeline.

### Confirmed root cause E — the universal Game Viewport Lock contract regressed in the Reactor shell

The World Server contract already requires:

- fixed `html, body`;
- `overflow:hidden`;
- `overscroll-behavior:none`;
- fixed full-screen game root;
- `touch-action:none`;
- browser gesture suppression on the game surface.

The Reactor shell only added:

`body{overscroll-behavior:none; ...}`

plus fixed `#wrap` and `touch-action:none` on canvas/controls.

It did **not** restore the complete invariant on `html,body`:
- no `position:fixed; inset:0`;
- no explicit `overflow:hidden` on both;
- no complete root width/height lock;
- no non-passive `touchmove` guard with `preventDefault()`.

The custom `pointermove` look handlers also do not call `preventDefault()`.

That is a direct process failure: a known World Server invariant was copied incompletely into a new MVP instead of being reused as a mandatory shared module/test.

### Confirmed root cause F — fullscreen-on-start was accidentally removed

The previous shell start path contained:

`if(fsStart.checked) enterFullscreen();`

The Reactor replacement start handler removed that call.

As a result, landscape can remain ordinary Safari/embedded-browser presentation with tabs/address UI visible. The physical screenshot shows exactly that.

Fullscreen must be requested **synchronously inside the user's start gesture** where the platform allows it. A delayed request after `requestAnimationFrame/setTimeout` can lose transient user activation. Where browser fullscreen is unavailable, installed standalone/PWA mode is the fallback; ordinary Safari chrome cannot be guaranteed away by CSS alone.

### Why CI passed anyway

The release gate proved:
- geometry provenance counters;
- collision;
- weapon resource presence;
- FIRE gameplay-state transition;
- portrait engine dimensions;
- structured/non-flat framebuffer;
- camera-induced framebuffer change.

Those are useful, but they do not measure:
- similarity of material complexity to the Krieger reference;
- preservation of local dynamic-light/shadow contrast;
- visible muzzle/recoil/projectile pixels after FIRE;
- document scroll/bounce under real touch;
- browser chrome absence in landscape;
- fullscreen/standalone state.

The physical iPhone therefore correctly vetoes the CI PASS.

### Mandatory fixes before the next public Krieger-fidelity claim

1. **Material Recipe Lab first.** Replay one real 40–100+ node bitmap/material subtree from the original graph on new geometry. Do not hand-author another four-map approximation and call it done.
2. Restore intentional `BASE -> SHADOW -> LIGHT -> POSTLIGHT -> POSTLIGHT2/IPP` behavior incrementally with per-stage captures. Never jump directly from black/white rescue states to a release.
3. Add a dynamic-light proof: move/pulse a local light and require localized surface response plus shadow/specular change, not just global luminance change.
4. Add a **reference-detail gate** on physical and synthetic frames: local contrast, texture-frequency/edge distribution, clipped-white area, shadow area, and material-family separation. Do not use one global “non-black >85%” metric as a fidelity score.
5. FIRE acceptance must compare a weapon/muzzle region before/during/after firing and prove a visible delta attributable to recoil/muzzle/projectile/effect, while separately proving native ammo/cooldown/shot state.
6. Instrument EffectJobs/Scene jobs for the selected weapon shot root and report whether each was created, culled, rendered and composited.
7. Promote Game Viewport Lock to a shared invariant for **every** World Server game/MVP. New shells may not hand-copy a partial CSS version.
8. Test real touch drag with assertions that `scrollX/scrollY/scrollTop` and visual-viewport offsets do not change while camera yaw/pitch does.
9. Restore fullscreen request in the immediate ENTER/START click and test portrait + landscape. If Fullscreen API is unavailable, provide the standalone/PWA route; never call browser chrome “game UI.”
10. Add landscape evidence that the visible content is only the game surface, with no page scroll area and no accidental tab/header area included in the game layout.

### MUST NOT REPEAT

- Do not optimize for a CI framebuffer metric by simplifying away the material passes that create the target look.
- Do not call four simple maps “Krieger-level materials” merely because they are procedural.
- Do not equate FIRE state change or sound with visible shooting.
- Do not hand-copy the viewport contract into each prototype; centralize it and regression-test it.
- Do not remove fullscreen entry while replacing a start handler.
- Do not publish a Krieger-fidelity success claim without a physical-iPhone visual comparison against the known-good reference.
