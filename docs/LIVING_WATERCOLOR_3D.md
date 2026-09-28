# Living Watercolor 3D

`shared/graphics/living-watercolor-3d.js` is the reusable NPR layer for making real Three.js geometry read like the approved blue-gray watercolor / ink sketches without replacing the scene, physics, camera or source mesh.

## Visual contract

The runtime keeps the real 3D mesh, then adds deterministic watercolor density variation, paper-colored wash gaps, a slightly breathing back-face ink shell, soft brush-based ground washes and coherent brush sprites for smoke/steam. Randomness is seeded per object; it is not rerolled every frame, so animation should breathe rather than flicker.

## Basic use

```js
import * as THREE from 'three';
import {createLivingWatercolor3D} from '/shared/graphics/living-watercolor-3d.js';

const watercolor=createLivingWatercolor3D({THREE,renderer,scene,camera,style:{seed:'world-42'}});
watercolor.apply(myObject,{seed:'house-17'});
watercolor.addGroundWash(scene,{x:0,z:0,width:3,depth:2,seed:'house-17-shadow'});
watercolor.createBrushEmitter({parent:myObject,origin:new THREE.Vector3(0,3,0),seed:'chimney'});
function frame(t){watercolor.tick(t);renderer.render(scene,camera);requestAnimationFrame(frame);}
```

## Style descriptor

Supported controls include `inkColor`, `paperColor`, `washColor`, `washOpacity`, `washLayers`, `edgeWidth`, `edgeJitter`, `granulation`, `bleed`, `shadowWash`, `motion`, `seed`, and artistic LOD distances (`near`, `mid`, `far`, `billboard`). Defaults match the current watercolor sketches: warm paper plus muted blue-gray ink.

## Performance and quality

The runtime reuses the existing renderer. It listens to `goldenqualitychange` when available and reduces artistic detail pressure rather than creating a second renderer. Far objects progressively reduce outline opacity. A later approved optimization may replace budget-distance objects with generated watercolor billboards, but that is intentionally not claimed by this first implementation.

## Diagnostic app

`apps/living-watercolor-3d/` renders a procedural house, tree, volcano and power plant through the shared runtime. It is a diagnostic integration target, not a certified public game release. Visual fidelity must be judged from fresh browser screenshots against the approved references before any completion claim.
