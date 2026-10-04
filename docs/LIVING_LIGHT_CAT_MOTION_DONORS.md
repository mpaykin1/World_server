# Living Light Cat motion donors

Date researched: 2026-10-03

The accepted Living Light Cat visual appearance is preserved as the reference. This V2 motion experiment does not replace the accepted V1 proof until the owner reviews it.

## Integrated motion research

### Low Poly Cat Thing — miziziziz / OpenGameArt
- Source: https://opengameart.org/content/low-poly-cat-thing
- License: CC0.
- Runtime format in source pack: Collada DAE.
- Source clip set: idle, walk, jump.
- Inspected source rig joints: body, head, leg.l, leg.r, tail.
- Use in World Server: quadruped timing/phase donor. The source model is not rendered in the final app; movement principles are retargeted to the World Server cat's own rig/proportions.

### Cat Pilot — Tomcat94 / OpenGameArt
- Source: https://opengameart.org/content/cat-pilot-rigged-animated
- License: CC0.
- Original source: Blender .blend.
- Inspected actions: Walk, Run, Cheer, PutOnGoggles, FlyingPlane and variants.
- Inspected bones include Head, Tail1..Tail6 and articulated limb chains.
- Use in World Server: additional run/body/head/tail motion reference. It is a stylized bipedal cat, so its limb pose is not copied directly to the quadruped rig.

## Researched but not integrated as a binary donor

### Somali Cat Animated ver 1.2 — DreamNoms / Sketchfab
- Source: https://sketchfab.com/3d-models/somali-cat-animated-ver-12-e185c3fd92b64c32b4515a32b29252fc
- License shown by source: CC Attribution.
- Source advertises idle, walk, sit, sit-down and stand-up.
- A public comment reports leg deformation in sit-down/stand-up.
- It was therefore used only as evidence that these feline transition clips are practical; this implementation authors its own sit/stand transitions and keeps the runtime CC0-derived/self-authored.

## V2 animation set

Idle, walk, run, sit-down, sit, groom, stand-up, jump, stretch, lie-down, sleep, rise.

The key rule remains: **animate real 3D volume first; LIGHT renders/amplifies the line.**
