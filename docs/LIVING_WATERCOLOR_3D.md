# Living Watercolor 3D

`shared/graphics/living-watercolor-3d.js` is the reusable sketch-first NPR layer for making real Three.js geometry read like the approved blue-gray watercolor / ink sketches without replacing gameplay simulation, physics, input, camera ownership or the existing renderer.

## V2 visual contract

V2 treats 3D as hidden scaffolding for an illustration. The renderer keeps the real mesh for depth and animation, but the visible result is driven by: warm paper, broad translucent pigment masses, sparse semantic ink, silhouette-only multi-pass outline, organic low-frequency geometry deformation, soft ground blooms, brush-sprite smoke, and an orthographic illustration camera. Technical polygon edges and wireframe topology are not part of the style.

The runtime is deterministic per object. Organic deformation, outline wobble, wash placement and brush particles use stable seeds rather than rerolling random values every frame, so the image should breathe rather than flicker.

## Shared modules

- `shared/graphics/living-watercolor-3d.js`: watercolor material patch, pigment pooling, paper gaps, silhouette shells, ground wash, brush emitters, adaptive paper-space compositor and quality hooks.
- `shared/graphics/living-watercolor-generators.js`: clone-safe organic deformation, semantic brush strokes, sketch-shaped house/tree/volcano/power-plant generators and orthographic illustration camera.
- `shared/graphics/living-watercolor-reference-gate.js`: image-space reference profiles and an advisory score against the four approved sketches.

## Basic use

```js
import * as THREE from 'three';
import {createLivingWatercolor3D} from '/shared/graphics/living-watercolor-3d.js';
import {createIllustrationCamera,createWatercolorTree} from '/shared/graphics/living-watercolor-generators.js';

const camera=createIllustrationCamera(THREE,{
  width:innerWidth,
  height:innerHeight,
  viewHeight:7.2
});

const watercolor=createLivingWatercolor3D({
  THREE,
  renderer,
  scene,
  camera,
  style:{seed:'world-42'}
});

const tree=createWatercolorTree(THREE,{seed:'tree-17'});
scene.add(tree);
watercolor.apply(tree,{seed:'tree-17'});
watercolor.addGroundWash(tree,{width:2.8,depth:1.6,seed:'tree-17-shadow'});
watercolor.attachCompositor({replaceSource:true});

function frame(t){
  watercolor.tick(t);
  renderer.render(scene,camera);
  watercolor.present(t);
  requestAnimationFrame(frame);
}
```

## Style descriptor

Supported controls include `inkColor`, `paperColor`, `washColor`, `washOpacity`, `washLayers`, `edgeWidth`, `edgeJitter`, `granulation`, `bleed`, `shadowWash`, `motion`, `pigmentPooling`, `paperGap`, `paintedLight`, `seed`, and artistic LOD distances. Defaults use warm paper plus muted blue-gray pigment.

## Reference-shaped generators

The supplied generators deliberately avoid generic low-poly primitives where the reference needs a specific silhouette.

- Tree: one merged lumpy canopy, tapered bent trunk, two semantic branches.
- Volcano: irregular radial mesh, non-perfect crater and selected painted erosion/lava channels.
- Power plant: main building, annex, tall stack, cooling tower and only the important semantic details.
- House: organic body, custom gable mass, chimney and selected roof/door/window strokes.

`deformGeometryOrganic` always clones the input geometry before deformation. It is safe to use as a visual layer without mutating collision/gameplay source meshes.

## Semantic ink

Do not render every polygon edge. V2 uses the view-dependent silhouette shell plus explicit semantic strokes for details that an illustrator would actually draw. Meshes can opt out of automatic wash or automatic outline with `watercolorSkipWash` and `watercolorOutline:false`.

## Reference fidelity gate

The four approved sketches are encoded as measured image-space profiles: foreground coverage, dark-pigment coverage, mid-wash coverage, foreground edge density, luminance distribution, bounding-box area and visual center. `scoreWatercolorMetrics` returns an advisory score; **85 or above is the project threshold for a reference-fidelity PASS**.

The metric is deliberately not treated as sufficient proof by itself. A final release still requires fresh browser/mobile screenshots and human side-by-side review because a numeric match can hide stylistic errors.

## Performance and quality

The watercolor layer reuses the existing Three.js renderer and listens to `goldenqualitychange`. The paper-space compositor is quality-adaptive and runs at a reduced working resolution, while the original WebGL renderer remains authoritative for depth. Artistic LOD reduces outline pressure with distance. No second gameplay renderer is created.

## Diagnostic app

`apps/living-watercolor-3d/` renders house, tree, volcano and power plant through the v2 stack. It remains diagnostic-only and deny-by-default in the release registry. The current implementation is materially closer to the sketches than v1, but it is **not production-certified** until the reference gate reaches the required threshold and fresh mobile/desktop visual review agrees.
