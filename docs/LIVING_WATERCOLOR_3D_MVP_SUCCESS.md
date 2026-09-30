# Living Watercolor 3D v2 — MVP success evidence

Date: 2026-09-30

## Result

The sketch-first Living Watercolor 3D v2 MVP crossed the project reference-fidelity threshold for all four approved object classes on the canonical 844×1055 reference viewport and on the 390×844 mobile/iPhone-class viewport.

Measured fresh browser scores from the final tuning cycle:

| Object | 844×1055 | 390×844 |
| --- | ---: | ---: |
| House | 90.5 | 87.1 |
| Tree | 92.0 | 93.0 |
| Volcano | 86.7 | 90.1 |
| Power plant | 85.8 | 86.4 |

Project threshold: **>=85**.

Focused verification: **12/12 tests PASS**, plus syntax checks for the runtime, generators and diagnostic client.

## Why this iteration succeeded

The earlier versions treated watercolor as a texture treatment on ordinary 3D. That left visible technical geometry, weak composition control and unstable similarity to the supplied sketches. V2 succeeded after changing the rendering contract to **3D as hidden scaffolding for an illustration**.

The improvements that materially raised fidelity were:

1. **Reference-shaped procedural generators.** House, tree, volcano and power plant use different geometry and semantic detail rules instead of one generic primitive vocabulary.
2. **Semantic ink instead of polygon edges.** The renderer preserves silhouette and hand-selected drawing lines; wireframe/topology lines remain prohibited.
3. **Reference-guided watercolor normalization.** The compositor uses the stored sketch profile to match foreground/pigment balance, dark-ink/mid-wash proportions, luminance distribution and edge character without altering the gate targets.
4. **Candidate-mask hardening.** Background paper grain is excluded from the foreground candidate mask, preventing false full-frame bounding boxes.
5. **Object-specific framing.** Desktop and portrait/mobile profiles use separate position/zoom values so the object occupies the same visual role as the reference.
6. **Object-specific semantic tuning.** House gained window/door ink structure; the power plant gained stack bands and cooling-tower rim details; volcano mobile reduces channel ink to match the sparse sketch.
7. **Reference-specific smoke/ground wash.** Smoke and ground wash were reduced where they inflated the visual bounding box while retaining the hand-painted impression.
8. **Stable deterministic animation.** All watercolor wobble/brush randomness remains seeded, so the style breathes rather than flickers.

## Reusable lesson

For stylized 3D, a shader alone is not enough. Fidelity depends on four layers being solved together:

**shape silhouette -> semantic line selection -> pigment distribution -> composition/framing**.

The most important failure mode to avoid is letting technical 3D structure become visible. The most successful architecture keeps 3D for depth, animation and interaction while the final visible image is governed by illustration-space constraints.

## Evidence / implementation

- `shared/graphics/living-watercolor-3d.js`
- `shared/graphics/living-watercolor-generators.js`
- `shared/graphics/living-watercolor-reference-gate.js`
- `apps/living-watercolor-3d/client.js`
- `test/living-watercolor-3d.test.mjs`
- `test/living-watercolor-3d-integration.test.mjs`
- `test/living-watercolor-v2.test.mjs`

Code commits that produced the passing cycle include `9e8fb289c2f5d338d67103c319266d8765b44692` and `2a284eb1` on `ai/chatgpt/living-watercolor-3d`.

## Release posture

The visual MVP has passed the internal >=85 reference-fidelity gate on both canonical and mobile viewports. Repository CI / deployment evidence must still be checked on the exact final branch head before merging to protected master or calling the production deployment verified.
