# Living Watercolor 3D — cross-chat handoff

Date: 2026-10-05  
MF id: **MF-001**  
Status: **MUST FINISH**

## What this project is

Living Watercolor 3D is the World Server Illustration-First / watercolor NPR lab used to turn simple 3D scaffolds and animated rigs into deliberately childlike painted objects.

Canonical app: `apps/living-watercolor-3d/`.

The current public MVP is:

`https://mpaykin1.github.io/scratch-chain-reaction/living-watercolor-3d/?object=worker`

Do not create a replacement MVP just because a new chat does not remember this project. Restore this code and continue it.

## User-approved baselines

The following are preserved as successful references and must not be degraded while fixing the worker:

- house;
- tree;
- power plant;
- Illustration-First volcano;
- volcano smoke.

Their design/evidence documents are committed next to this handoff.

## Worker animation status

KayKit motion transfer is accepted as **SUCCESS**.

Invariant:

- hidden KayKit Rig_Medium remains the motion source;
- 139 source animation clips;
- 132 unique motion names;
- the visible illustration shell must not break the accepted animation capability.

Canonical evidence:

- `docs/ILLUSTRATION_CHARACTER_KAYKIT_MOTION_TRANSFER_2026-10-01.md`
- `docs/ILLUSTRATION_OFFICE_WORKER_KAYKIT_ANIMATION_SUCCESS_2026-10-01.md`
- `shared/graphics/illustration-character-kaykit.js`

## Worker rendering status

The worker visual rendering remains **NOT YET USER-ACCEPTED**.

The user identified the important visual failure class:

1. torso and legs must read as one connected person, not separate modules;
2. the head must be one large, simple oval illustration mass rather than a cylinder/cap construction;
3. the jacket must be visibly darker than the shirt;
4. jacket, white/light shirt, black tie and briefcase must read immediately;
5. limbs must read as continuous sleeves/trousers rather than exposed rig segments;
6. the visible character must be controlled by the sketch, while KayKit controls only motion.

The current shell architecture includes:

- Character Illustration Shell;
- pelvis bridge;
- pose-aware silhouette;
- garment grammar;
- semantic paint layers;
- single outer contour contract;
- sketch proportion controller;
- bone→visual envelope mapping;
- prop grip constraint;
- structural character reference gate.

Canonical implementation:

- `shared/graphics/illustration-character-shell.js`
- `shared/graphics/illustration-character-reference-gate.js`
- `shared/graphics/illustration-character-kaykit.js`

## Important evidence semantics

Structural/runtime PASS is not visual acceptance.

Do not convert a character gate, unit test, screenshot metric or animation test into the claim that the worker drawing is finished. The final rendering leaves MF only after explicit user visual acceptance.

## Next action for a fresh chat

1. read `MF.md` and `data/must-finish.json`;
2. open the files above;
3. preserve the accepted benchmark objects and animation library;
4. inspect the latest current worker before editing;
5. improve only the worker visual shell;
6. produce fresh browser/mobile evidence;
7. ask for / use the user's visual verdict;
8. record SUCCESS or FAILURE without erasing prior evidence.

## Completion definition

The project can leave MF only when the user explicitly accepts the worker appearance and the accepted animations/benchmark objects still pass their regression evidence.
