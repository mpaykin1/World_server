# Reference Dimensional Fidelity — hard contract

This contract prevents a specific class of visual failure: a task asks for maximum similarity to a true 3D reference, but the implementation silently substitutes a cheaper rendering class and then reports the result as close or final.

## Non-negotiable rule

When the approved reference is volumetric 3D, the final candidate must remain volumetric 3D. A different technology may be used only when it preserves the same visible capabilities. A lower-dimensional substitute is diagnostic/prototype-only and cannot be presented as final.

For a volumetric FPS reference, the following are final-delivery blockers:

- a 2.5D raycaster replacing polygonal perspective geometry;
- billboard/sprite enemies replacing volumetric enemies;
- a HUD/canvas-painted weapon replacing a depth-tested 3D weapon mesh;
- screen-space gradients replacing scene-reactive lighting;
- heightfield/relief tricks replacing walkable volumetric geometry;
- deliberate low-resolution rendering enlarged to the viewport as a quality shortcut.

## Krieger-class reference

For .kkrieger or an equivalent 2004-era fully 3D FPS reference:

- weapon: true 3D depth-tested geometry in the same perspective scene;
- enemies: volumetric 3D mesh with articulated/skinned animation when the reference animates;
- environment: polygonal/depth-tested geometry with real parallax, columns, trims, recesses and floor/ceiling depth;
- materials: must react to scene lighting; metal, stone and emissive surfaces cannot be painted as fixed 2D shading;
- muzzle flash/explosions: particles/emissive effects must alter or participate in scene lighting, not only draw a screen-space orange blob;
- camera: perspective 3D; no raycaster vertical-strip projection;
- render scale: 1.0 by default; below 0.75 is a fidelity downgrade and requires explicit evidence/approval;
- final similarity claim: fresh side-by-side evidence + behavioral browser smoke + score >= 85%, without rounding up.

## Autonomous HTML

When a user asks for one autonomous HTML:

- generated WebAssembly must be embedded in the HTML;
- game data must be embedded, not loaded from a sibling .data file;
- no external runtime script, image, wasm or data request is allowed;
- license/credit notices must travel with the file;
- a static audit must pass before delivery.

## Why the previous prototype failed

The failed prototype reproduced theme but not rendering class: 640x360 internal output, raycaster walls, 96x96 billboard enemies, a canvas/HUD weapon and screen-space glow. Those choices made it impossible to match the original Krieger weapon volume, monster volume, parallax, materials and light response regardless of extra texture polish.

## Required workflow

1. Classify the approved reference before implementation.
2. Record required visible capabilities and forbidden downgrades.
3. Build using technology that can express those capabilities.
4. Run dimensional gate before visual-score gate.
5. If dimensional gate fails, stop; do not compensate with a self-score.
6. Take a fresh candidate screenshot and compare side-by-side with the approved reference.
7. Only after dimensional + behavioral + visual gates pass may the result be called final/ready.

Machine-readable source: `data/reference-fidelity-policy.json`.
Hard checker: `npm run fidelity:check`.


## Failure postmortem

The concrete failure that created this rule is documented in:
`docs/KRIEGER_FAILURE_POSTMORTEM_2026-09-29.md`.

Future agents should read the postmortem before changing Krieger/reference-fidelity code; it records not only the symptoms but the architectural decision errors that caused them.
