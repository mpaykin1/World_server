# Living Watercolor 3D — success memory: House, Tree, Power Plant

Date: 2026-09-30

## Why this file exists

This is a reusable success record for future AI agents and chats working on World Server. Three object classes — **house, tree and power plant** — reached the project's >=85 visual-reference fidelity threshold in fresh browser validation. Preserve the architectural reasons for success, not only the final code.

## Verified scores

Fresh reference-gate scores from the successful v2 cycle:

| Object | 844×1055 | 390×844 mobile |
| --- | ---: | ---: |
| House | **90.5** | **87.1** |
| Tree | **92.0** | **93.0** |
| Power plant | **85.8** | **86.4** |

All three clear the >=85 threshold on both validation viewports.

Focused verification for the shared watercolor system: **12/12 tests PASS** plus JavaScript syntax checks.

## Success pattern

The decisive change was to stop treating watercolor as a shader painted over normal 3D. The successful objects use **3D only as hidden structural scaffolding for an illustration**.

Reusable pipeline:

**reference silhouette → object-specific procedural geometry → semantic ink → watercolor pigment normalization → object-specific framing → mobile framing → image-space fidelity gate**

Do not collapse this back into a generic "make it watercolor" material.

## House — why it worked

The house became successful after its geometry and ink were made semantically readable rather than technically detailed.

What mattered:

- broad body and roof masses match the sketch before detail is added;
- the gable/eave are drawn as intentional semantic strokes;
- window cross-lines and the door frame are explicit semantic ink rather than polygon edges;
- technical topology/wireframe lines stay hidden;
- object-specific framing keeps the house at the reference scale and vertical placement;
- pigment normalization balances paper, mid-wash and dark ink independently of the raw PBR render.

Important lesson: for simple architecture, a few **meaningful drawing lines** outperform many geometric edges.

Canonical generator:
- `createWatercolorHouse()` in `shared/graphics/living-watercolor-generators.js`

## Tree — why it worked

The tree is the strongest proof that irregular silhouette matters more than polygon detail.

What mattered:

- a bent tapered procedural trunk instead of a straight cylinder;
- a lumpy asymmetric canopy instead of a clean sphere;
- only two semantic branch strokes;
- organic deformation is deterministic and clone-safe;
- orthographic illustration framing suppresses ordinary 3D perspective;
- the canopy remains one broad watercolor mass instead of many individual leaves.

Important lesson: organic reference fidelity comes from **low-frequency asymmetry and mass shape**, not noise or high polygon count.

Canonical generator:
- `createWatercolorTree()` in `shared/graphics/living-watercolor-generators.js`

## Power plant — why it worked

The power plant needed both large industrial silhouettes and a few identity details.

What mattered:

- the building, chimney and cooling tower are separate broad visual masses;
- the cooling tower uses a shaped LatheGeometry profile rather than a generic cylinder;
- chimney bands and the cooling-tower rim were added as explicit semantic details;
- small windows/door exist, but they do not dominate the frame;
- smoke opacity and ground wash were reduced because they previously enlarged the apparent visual footprint and hurt the reference match;
- desktop and mobile use different framing values;
- mobile received additional edge-character tuning so the plant still passes on a narrow portrait viewport.

Important lesson: industrial scenes need **recognizable silhouette primitives + 2–4 identity marks**, not dense technical modeling.

Canonical generator:
- `createWatercolorPlant()` in `shared/graphics/living-watercolor-generators.js`

## Shared rendering rules that must be preserved

1. **Semantic ink only.** Never expose polygon topology or wireframe as drawing detail.
2. **Reference-shaped generators.** Different object categories need different geometry recipes.
3. **Deterministic watercolor.** Randomness is seeded; no per-frame rerolling/flicker.
4. **Paper-space compositor.** The final image is normalized in screen space for pigment/ink balance.
5. **Foreground candidate masking.** Paper grain/background must not be misclassified as object foreground.
6. **Object-specific framing.** Scale/position are part of the visual style, not incidental camera setup.
7. **Separate mobile validation.** Portrait can require different position, zoom and ink balance.
8. **Measure after render.** Do not infer fidelity from code or from a desktop screenshot alone.

## What failed before this success

Earlier iterations looked like ordinary 3D with a watercolor filter. Failure symptoms included:

- too much regular geometry;
- visible technical edges;
- weak or generic silhouettes;
- excessive smoke/ground wash changing the bounding box;
- one camera composition reused for all objects;
- mobile framing drifting away from reference composition;
- visual claims made before a fresh image-space comparison.

Do not repeat these shortcuts.

## Canonical implementation

- `shared/graphics/living-watercolor-3d.js`
- `shared/graphics/living-watercolor-generators.js`
- `shared/graphics/living-watercolor-reference-gate.js`
- `apps/living-watercolor-3d/client.js`
- `test/living-watercolor-3d.test.mjs`
- `test/living-watercolor-3d-integration.test.mjs`
- `test/living-watercolor-v2.test.mjs`

Related successful implementation commits:
- `9e8fb289c2f5d338d67103c319266d8765b44692`
- `2a284eb1`
- integration head containing the success state: `3114267847d36df12204cdeff37a6625d5c6afb6`

## Reuse rule for future AI

When asked to build a new watercolor-style object, start from the **House / Tree / Power Plant success pattern**:

1. match the reference silhouette first;
2. choose a dedicated generator;
3. add only semantic drawing lines;
4. tune pigment/ink distribution;
5. tune framing separately on desktop and portrait;
6. run the reference gate;
7. do not call it successful until >=85 on the target viewports and fresh browser evidence agrees.

This pattern is the reusable success, not the exact coordinates or object dimensions.
