# Living Watercolor 3D / Illustration Worker — MF handoff

Date: 2026-10-05  
MF ID: `living-watercolor-3d`  
Status: `must-finish / in-progress`

## Purpose

Preserve the current Living Watercolor 3D / Illustration Worker project so any future chat can continue from the committed World Server implementation instead of rebuilding it from memory.

Canonical app:

`apps/living-watercolor-3d/`

Public recovery locator:

`https://mpaykin1.github.io/scratch-chain-reaction/living-watercolor-3d/?object=worker`

The stored URL is a locator only. Re-run the current Verified Link Delivery gate before handing it to the user again.

## User-accepted progress

Preserve these as successful baselines:

- house;
- tree;
- power plant;
- Illustration-First volcano;
- volcano smoke;
- KayKit motion transfer;
- 139 source clips / 132 unique motions.

Animation and appearance are separate verdicts. The animation system is accepted; the final worker drawing is not yet user-approved.

## Current worker architecture

The committed worker uses:

- hidden KayKit Rig_Medium for motion;
- Character Illustration Shell;
- pose-aware silhouette;
- pelvis bridge;
- garment grammar;
- semantic paint layers;
- single-outer-contour contract;
- sketch proportion controller;
- bone → visual envelope mapping;
- prop grip constraint;
- Illustration Character reference gate.

Canonical files:

- `shared/graphics/illustration-character-kaykit.js`
- `shared/graphics/illustration-character-shell.js`
- `shared/graphics/illustration-character-reference-gate.js`
- `shared/graphics/illustration-character-rig.js`
- `shared/graphics/illustration-mass-modeler.js`
- `shared/graphics/living-watercolor-3d.js`
- `shared/graphics/living-watercolor-generators.js`

## Explicit unfinished visual requirements

The user has not accepted the current worker rendering yet.

The final character must preserve:

1. torso, pelvis and legs reading as one connected person;
2. a large simple oval head, not a cylinder/cap construction;
3. jacket clearly darker than the light shirt;
4. black tie immediately readable;
5. briefcase immediately readable and attached naturally to the hand;
6. sleeves/trousers reading as continuous illustrated envelopes rather than rig pieces;
7. the sketch controlling visible proportions while KayKit controls motion only.

Structural gate PASS is not a substitute for the user's visual verdict.

## Do not regress

- Do not reduce or replace the accepted 139 source / 132 unique KayKit motion capability.
- Do not modify the accepted house/tree/power-plant/volcano baselines merely to fix the worker.
- Do not convert technical test success into a claim of visual success.
- Do not start a duplicate project if this implementation is available.

## Exit from MF

Remove this project from MF only when:

- final worker visual appearance is explicitly accepted by the user;
- accepted animation coverage remains intact;
- accepted benchmark objects remain intact;
- regression protection exists;
- a stable canonical source/recovery path is committed;
- the user explicitly approves closure/removal from MF.
