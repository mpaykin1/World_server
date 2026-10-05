# Living Watercolor 3D / Illustration Worker — MF handoff

Date: 2026-10-05  
MF ID: `living-watercolor-3d`  
Status: `must-finish / in-progress`

## Canonical recovery point

World Server source branch: `ai/chatgpt/living-watercolor-3d`  
Preserved World Server head: `4f73c56fbd7fb5893876b38bd50db2c60cf31505`

Canonical project paths on that branch:

- `apps/living-watercolor-3d/`
- `shared/graphics/living-watercolor-3d.js`
- `shared/graphics/living-watercolor-generators.js`
- `shared/graphics/living-watercolor-reference-gate.js`
- `shared/graphics/illustration-character-kaykit.js`
- `shared/graphics/illustration-character-shell.js`
- `shared/graphics/illustration-character-reference-gate.js`
- `shared/graphics/illustration-character-rig.js`
- `shared/graphics/illustration-mass-modeler.js`

Public recovery locator:

`https://mpaykin1.github.io/scratch-chain-reaction/living-watercolor-3d/?object=worker`

Public mirror repo: `mpaykin1/scratch-chain-reaction`  
Last known mirror head when MF was recorded: `4d09f3aba3999d8f7c3559ea1a23952d4032a2cb`

The stored URL is a locator, not live proof. Re-run Verified Link Delivery before handing it to the user.

## User-approved progress

Preserve these as accepted:

- house benchmark;
- tree benchmark;
- power-plant benchmark;
- Illustration-First volcano;
- volcano smoke;
- KayKit motion transfer;
- 139 source clips / 132 unique motions.

Animation and appearance are separate verdicts. Animation is accepted. The final worker drawing is not yet user-approved.

## Current worker architecture

The preserved source includes:

- hidden KayKit Rig_Medium motion driver;
- Character Illustration Shell;
- pose-aware silhouette;
- pelvis bridge;
- garment grammar;
- semantic paint layers;
- single outer contour contract;
- sketch proportion controller;
- bone → visual envelope mapping;
- prop grip constraint;
- structural character reference gate.

## Explicit unfinished visual requirements

The project remains unfinished until the worker visually satisfies the user's sketch:

1. torso, pelvis and legs read as one connected person;
2. head reads as one large simple oval;
3. jacket is clearly darker than the light shirt;
4. black tie is immediately readable;
5. briefcase is immediately readable and naturally attached to the hand;
6. sleeves and trousers read as continuous illustrated envelopes rather than rig pieces;
7. the sketch controls visible proportions while KayKit controls motion only.

Structural/runtime PASS is not visual acceptance.

## Do not regress

- Do not reduce 139 source clips / 132 unique motions.
- Do not modify accepted house/tree/power-plant/volcano baselines just to fix the worker.
- Do not treat a test gate as owner acceptance.
- Do not create a replacement MVP while this source branch remains recoverable.

## Exit from MF

Only after:
- user explicitly accepts final worker rendering;
- accepted animation coverage remains intact;
- accepted benchmark objects remain intact;
- canonical source is integrated/recoverable with regression protection;
- user explicitly approves closure/removal from MF.
