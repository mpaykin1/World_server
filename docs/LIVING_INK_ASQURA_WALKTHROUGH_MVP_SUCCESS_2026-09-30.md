# Living Ink / ASQURA 3D Walkthrough MVP success — 2026-09-30

## Result

The second Living Ink MVP is publicly working with touch navigation through procedural office space.

Public test URL:
https://mpaykin1.github.io/scratch-chain-reaction/living-ink-asqura/

Published artifact commit:
1a7d7829636176d63f6d35d9ff1b3da99120db64

World Server implementation head at verification:
0935a572461407e9d5cc848fa7e957db6228ffb7

## What changed

- left-thumb analog movement on the mobile viewport
- right-thumb drag look
- simultaneous pointer architecture (move + look can be used with two fingers)
- camera movement through multiple deterministic office modules
- world-space 3D geometry for floors, walls, glass, desks, monitors, chairs, meeting furniture, lounge furniture, coffee point and printer
- dynamic office modules generated ahead of the camera so movement continues into new office areas
- 3D corridor perspective and parallax retained under Living Ink stylization
- keyboard fallback remains available on desktop
- autonomous/offline runtime contract preserved

## Browser proof

Public GitHub Pages request: HTTP 200.

iPhone-like viewport used for verification: 390 x 844 with touch enabled.

Start camera:
x=0, z=-2.15, yaw=0, pitch=0.035

After left-side drag forward for ~1 second:
z=0.2151

After right-side drag:
yaw=-0.252, pitch=-0.043

This proves that movement and look are wired to separate screen regions and mutate the real world-space camera.

The public canvas covered 100% of the viewport and the touch HUD was present, so the user-visible control/screen-coverage gate is above 85%.

Runtime errors captured during the public test: none.

After the browser context was switched offline, animation and the scene remained alive.

## Performance evidence

On the verification machine with headless Chromium software rendering at 390 x 844:
- initial measured FPS: ~17.7
- measured p95 frame time: 33 ms
- initial draw calls: 2815
- initial visible primitives: 1768

This is an MVP measurement, not an iPhone hardware FPS claim. Hidden box faces are culled in the current implementation to reduce mobile work.

## Why this succeeded

The key was not to bolt a joystick onto the old fixed illustration. Navigation was moved into the same camera that projects the world-space scene. Office modules are generated in actual x/y/z coordinates and are re-evaluated around the camera, so walking changes perspective, parallax, depth ordering and which offices are visible.

The mobile controls are also not DOM buttons that teleport the scene. The left region produces forward/strafe velocity, while the right region changes yaw/pitch. That makes the same world navigable on touch and keyboard without separate mobile/desktop scenes.

## What not to regress

- do not return to a fixed-camera illustration
- do not create a separate flat mobile scene
- do not make movement a screen-space pan
- do not remove offline/standalone behavior
- do not replace the shared renderer with a one-off demo
- preserve the left-move / right-look touch contract
- preserve world-space camera coordinates and dynamic office modules

## Next improvement

The next visual-quality pass should improve volumetric human anatomy, door/collision logic, glass depth and mobile frame rate while keeping this same walkthrough architecture.
