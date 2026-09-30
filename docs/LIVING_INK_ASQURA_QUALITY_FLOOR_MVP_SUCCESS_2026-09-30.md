# Living Ink / ASQURA Quality Floor MVP — success analysis

Date: 2026-09-30

## Goal

Integrate the missing visual systems identified after the successful 3D walkthrough and prove them in the same autonomous Living Ink MVP without replacing the working walkthrough architecture.

## Implemented systems

The runtime now exposes and uses all ten quality systems:

1. volumetric-human-silhouette
2. architectural-glass-partitions
3. tonal-hierarchy
4. watercolor-mass-layer
5. semantic-prop-density
6. contact-shadow-grounding
7. artistic-lod-2
8. shot-aware-composition
9. behavioral-scene-direction
10. dual-mode-camera

Implementation entry point:
- shared/living-ink-quality.js

The existing renderer and office runtime remain the foundation:
- shared/living-ink-core.js
- shared/living-ink-office.js
- lib/living-ink-compiler.js
- apps/living-ink-office/index.html

## Visible changes

### Human silhouettes
Humans now use jacket/torso polygons, shirt layer, lapel-like line structure, tie, volumetric legs, stronger shoes, near-distance accessories and a semantic far representation. They no longer rely primarily on box-and-stick marker shapes.

### Glass architecture
Office partitions now use a dedicated glass-partition path with layered translucency, frame rhythm, door gaps, labels and depth-sensitive line strength.

### Watercolor mass
A new lightweight wash primitive adds deterministic low-frequency translucent masses behind office zones and people. The first implementation used canvas blur/filter and was too expensive; the successful version replaced it with deterministic overlapping translucent ellipses. This preserved the watercolor read while restoring mobile-safe runtime speed.

### Tonal hierarchy
Detail/alpha budget now combines distance, frame position and semantic importance. Foreground/hero objects receive stronger readable treatment while distant content remains pale.

### Semantic prop density
Desk areas receive distance-aware micro-props (documents, mugs, small screens/objects and line details) rather than every desk having the same sparse representation.

### Grounding
Contact shadows and subtle floor wash now anchor people and objects to the floor.

### Artistic LOD 2.0
Quality is reduced semantically:
- near: silhouette + clothing + accessories + micro-detail
- medium: core silhouette and semantic features
- far: strong simple human/object hint

### Shot-aware composition
Each office module has a deterministic hero/secondary composition plan and watercolor mass centers instead of purely uniform placement.

### Behavioral scene direction
Visible workers are staged into walk/type/coffee/meeting/talk/sit/printer roles with deterministic cycling rather than only arbitrary animation assignment.

### Dual camera
Walkthrough remains the default. A FRAME control switches to illustration framing without creating a second scene or replacing navigation.

## Validation

Exact World Server implementation head used for the checked autonomous artifact:
ba74e4bf0460b87d7529ad209d511fc835b8ede2

Focused Node tests:
- 7 tests
- 7 passed
- 0 failed

Other repository gates checked before the quality pass:
- third-party license gate PASS
- Golden Standard gate PASS
- JavaScript syntax gate PASS

Mobile browser proof:
- viewport: 390 x 844
- touch enabled
- quality systems active: 10/10
- visual profile: asqura-quality-floor-v2
- renderer: world-space-3d-living-ink
- walkthrough movement remained functional
- FRAME switched cameraMode from walkthrough to illustration
- browser runtime errors: none

Measured on the verification Windows machine in headless Chromium software rendering:
- initial FPS about 28
- p95 frame time: 33 ms
- initial draw calls: about 2525
- initial visible primitives: about 1549

These figures are development-machine measurements, not physical-iPhone performance claims.

## Public MVP

Published artifact repository:
mpaykin1/scratch-chain-reaction

Published commit:
12f3932604bbce016173560cf5e06eddc3f02714

Stable public path:
https://mpaykin1.github.io/scratch-chain-reaction/living-ink-asqura/

Deployment propagation was checked until the public response returned HTTP 200 with the new QUALITY v2 marker and asqura-quality-floor-v2 code.

## Why this iteration succeeded

The quality improvement was added as a layer on top of the working 3D walkthrough instead of rebuilding the demo. That preserved navigation, offline behavior and procedural office generation.

The highest-value improvement was semantic detail rather than polygon count:
- humans became readable through silhouette/clothing structure
- glass became readable through dedicated frame/translucency logic
- props became richer only where distance justified it
- watercolor masses and contact shadows increased image coherence
- composition and tonal hierarchy made the frame less uniformly sparse

The failed performance attempt is also important: applying Canvas filter/blur repeatedly to dynamic watercolor masses caused browser verification to stall. The fix was to approximate the same visual language with a small deterministic stack of translucent ellipses. That is the preferred MVP pattern until a server-baked or GPU watercolor path is introduced.

## Remaining visual gap

This MVP is visibly closer to the reference but is NOT a claim of 85% visual identity.

Largest remaining gaps:
- human anatomy and pose nuance still below the reference
- chairs/desks/office equipment need more recognizable near-LOD detail
- the reference has denser yet cleaner architectural composition
- watercolor needs richer edge pooling/granulation when a cheap or baked implementation exists
- physical iPhone performance must be measured separately
- hidden-line/depth treatment can be stronger around dense glass/furniture overlaps

## Do not regress

Future chats and agents must:
- keep the real 3D walkthrough
- keep left-thumb movement and right-thumb look
- keep standalone/offline export
- keep the quality systems in the shared World Server stack
- improve the same renderer incrementally
- avoid expensive per-frame blur/filter effects on mobile
- avoid replacing this with a flat static illustration or disconnected demo
