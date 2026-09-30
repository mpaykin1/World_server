# World Server Graphics Quality Governor

Status: MVP integrated on task branch, 2026-09-30
Target tier: `KRIEGER_CLASS`
Canonical implementation:
- `shared/graphics/graphics-quality-governor.mjs`
- `shared/graphics/quality-scene-compiler.mjs`
- `apps/graphics-quality-governor-mvp/`
- `test/graphics-quality-governor.test.mjs`
- `scripts/graphics-quality-governor-smoke.cjs`

## Why this exists

A renderer can be technically alive and still produce unacceptable graphics. The Krieger Level Lab v1 proved exactly that: the black framebuffer was fixed, but the level was still dominated by simple cuboids, a survival material, weak authored detail, and a render-isolation path that removed native weapon/effect work.

The permanent rule is:

> Runtime correctness is necessary, but it is not evidence of visual class.

The Graphics Quality Governor is a non-compensating quality floor. A scene cannot call itself a finished high-detail result merely because it renders, has many triangles, or returns HTTP 200.

## Pipeline

```
Prompt / WorldRecipe
  -> Semantic Scene Compiler
  -> Geometry
  -> Materials
  -> Lighting
  -> Characters / Creatures / Animation
  -> FX
  -> Composition
  -> Render
  -> Graphics Quality Governor
  -> PASS / FAIL / PROTOTYPE
```

A failure must produce a root cause and a missing capability. Adding random cubes or triangle inflation is explicitly not a repair.

## Four hard gates

### NEAR_OBJECT_GATE

The foreground/near-camera hero object must have functional parts, non-trivial silhouette, material regions and semantic detail. A primitive crate or flat plane cannot satisfy the gate.

### MATERIAL_GATE

Dominant surfaces must have real material-region and surface variation appropriate to the style profile. A single flat RGB surface cannot satisfy a Krieger-industrial target.

### LIGHTING_GATE

Local/emissive lights must be linked to meaningful nearby geometry response. A screen-space glow with no 3D response is insufficient.

### ENVIRONMENT_GATE

The environment cannot be dominated by giant flat fallback primitives. Macro structure must gain meso/micro supports, recesses, frames, trims, props or an equivalent style-appropriate semantic detail system.

## Other gates

The MVP also evaluates:

- true 3D participation;
- spatial/depth complexity;
- silhouette complexity;
- macro/meso/micro semantic coverage;
- secondary geometry;
- DPR sanity;
- triangle/draw-call budgets.

The quality report shape is:

```json
{
  "qualityTier": "KRIEGER_CLASS",
  "styleProfile": "krieger_industrial",
  "passed": true,
  "status": "PASS",
  "gates": {},
  "metrics": {},
  "failures": [],
  "primitiveWarnings": [],
  "recommendations": []
}
```

`passed` means the configured structural governor gates passed. It is **not** by itself a claim that a rendered frame has reached the full visual fidelity of canonical .kkrieger. The MVP UI therefore labels the enhanced result as a **KRIEGER-CLASS CANDIDATE** and separately states that reference fidelity still requires verification.

## StyleProfile is not QualityTier

A watercolor, voxel-art or Living Ink world must not fail merely because it does not use PBR. The governor currently has threshold overrides for:

- `realistic`;
- `krieger_industrial`;
- `voxel_art`;
- `living_ink`;
- `watercolor`;
- `intentional_minimalism`.

Semantic depth and intentional execution remain quality concerns in every profile. Material rules vary by style.

## Primitive Graphics Detector

The first detector protects against the exact failure class seen in the custom Krieger Level Lab:

- giant flat primitives;
- primitive-fallback dominance;
- low semantic detail;
- low material variation;
- weak near-camera detail;
- local lights with no meaningful geometry response;
- shallow composition.

Triangle count is deliberately excluded as a sufficient quality signal. A test inflates a primitive scene to hundreds of thousands of triangles and proves that it still fails.

## Deterministic A/B proof

The MVP uses one `SceneRecipe`:

- recipe id: `bridge-vault-alpha`;
- seed: `424242`;
- setting: original geothermal relay hall;
- same camera;
- same FOV;
- same semantic route, landmark and foreground intent.

Only the quality profile changes:

```
quality=primitive
quality=krieger_class
```

The primitive variant uses large simple masses and almost no semantic/material/light detail.

The enhanced candidate uses structural ribs/arches, service panels, pipes, repeated supports, an iris landmark, emissive/local lights, procedural material variation, floor microstructure, foreground machinery and stronger depth layering.

No Krieger room, weapon, creature, texture or protected asset is copied.

## Current deterministic metrics

Local Node regression evidence:

| Metric | Primitive | Enhanced candidate |
| --- | ---: | ---: |
| spatialDepth | 0.344 | 0.933 |
| silhouetteComplexity | 0.160 | 0.821 |
| semanticDetail | 0.127 | 0.766 |
| secondaryGeometry | 0.000 | 0.889 |
| materialVariation | 0.020 | 0.694 |
| lightingResponse | 0.200 | 1.000 |
| nearObjectComplexity | 0.088 | 0.965 |
| environmentDetail | 0.109 | 0.820 |
| flatSurfaceRatio | 0.940 | 0.357 |
| primitiveFallbackRatio | 1.000 | 0.000 |
| nominal triangles | 72 | 68,480 |
| nominal draw calls | 6 | 46 |

Primitive fails all four hard gates. Enhanced passes the configured structural hard gates.

The A/B metric-lift proxy is 100/100, above the task's 85% user-noticeability requirement. This score measures **difference visibility**, not canonical Krieger fidelity.

## Reference visual honesty gate

The user supplied a real Krieger portrait frame as the technological reference. A manual comparison of the current enhanced MVP still finds a substantial absolute fidelity gap: canonical Krieger has richer authored material response, denser local geometry, more layered props, stronger shadow/contact depth, and a much more detailed near-camera weapon/hero object.

Therefore:

- primitive rejection: **PROVEN**;
- enhanced structural improvement: **PROVEN**;
- full canonical Krieger visual fidelity: **NOT CLAIMED**;
- physical iPhone performance/fidelity: **USER VERIFICATION REQUIRED**.

This distinction is mandatory. Future work must add render-derived evidence so intended scene metadata cannot green-light an object that is absent or visually weak in the framebuffer.

## Krieger knowledge used

Krieger source studied at scratch-chain-reaction current main during this task: `df9cae000f9f9ae8986661f3ed4b86a562baff89`.

Pinned upstream engine baseline documented by the Krieger handoff:
`MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

Important verified source anchors:

- `werkkzeug3_kkrieger/player_kkrieger/kkrieger_oplist.cpp`;
- `genmesh.cpp`;
- `genbitmap.cpp`;
- `genmaterial.cpp`;
- `genscene.cpp`;
- `geneffect.cpp`;
- `engine.cpp`;
- `kkriegergame.cpp`;
- `wasm/render2004.cpp`;
- `wasm/tools/kxread.py`.

### Geometry lesson

Level Lab v1 was dominated by:

```
kkLabAddCube
  -> Mesh_Cube
  -> COLOR0
  -> GenMesh::Add
```

The real operator vocabulary is much richer: cylinder, subdivision, transform, crease, triangulate, displace, bevel, Perlin, add/multiply, delete faces, material links, extrusion, grid, bend, UV projection, collision and light/shadow operators.

Using Krieger C++ classes is not equivalent to using Krieger's visual language.

### Material/render lesson

For the Breakpoint-2004 renderer:

```
ENGU_BASE
  -> depth/base
ENGU_LIGHT
  -> ZFUNC=EQUAL
  -> additive lighting
```

A light-only custom material can render black even when simulation and geometry are alive. A base/depth pass is mandatory before the light pass.

### Scene/effect lesson

The product-relevant native authoring target remains:

```
KX/operator recipe
 -> procedural bitmap/texture graph
 -> mesh operator graph
 -> GenMesh
 -> GenMaterial
 -> MakeScene
 -> GenScene {DrawMesh + CollMesh}
 -> Transform/Add/Multiply
 -> Sector/Portal
 -> Light/Ambient
 -> preserve player + weapons + effects
 -> Engine jobs
 -> Paint2004
 -> postprocess
 -> viewport/canvas
```

The current World Server A/B MVP is a clean independent WebGL2 quality-governor proof, **not** a replacement for Native Level Lab v2.

## Failure lesson that must not be forgotten

The Level Lab v1 architecture also called `KKriegerGame::Flush()`, which clears `WeaponShot`, `WeaponOptics`, `WeaponExplode` and timer bindings, and its isolated paint path cleared native mesh/effect/portal/sector/light jobs. That is why “FIRE input arrived” did not mean a visible weapon or shot existed.

Permanent testing rule:

```
DATA
 -> GENERATOR
 -> RUNTIME OBJECT
 -> CPU JOB
 -> GPU PASS
 -> MATERIAL/SHADER
 -> FRAMEBUFFER
 -> POSTPROCESS
 -> VIEWPORT
 -> CANVAS
```

Measure the stage being claimed. A DOM overlay, canvas existence, non-black occupancy or input telemetry cannot substitute for rendered structure.

## Regression tests

`test/graphics-quality-governor.test.mjs` protects:

1. primitive KRIEGER_CLASS target fails;
2. expected hard gates fail;
3. enhanced profile materially improves the defined metrics;
4. triangle inflation cannot buy a pass;
5. giant flat fallback is detected;
6. same seed/config gives the same report/fingerprint;
7. StyleProfile changes appropriate thresholds;
8. portrait DPR remains non-compensating.

`scripts/graphics-quality-governor-smoke.cjs` protects browser/mobile behavior:

- HTTP response;
- no console/page errors;
- exact portrait canvas coverage;
- noticeability >=85;
- A/B buttons change real framebuffer pixels, not only labels;
- deterministic enhanced framebuffer on repeated selection;
- expected hard-gate split.

## Next capability work

The strongest next step is **render-derived quality evidence**, not more self-described scene metadata:

1. direct framebuffer edge/variation/near-region metrics;
2. screenshot comparison against approved references;
3. native Krieger operator/material laboratories;
4. visible near-camera hero/weapon verification;
5. physical-iPhone performance evidence;
6. then promotion of only confirmed reusable pieces into Golden Components.
