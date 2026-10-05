# Illustration Character + KayKit Rig_Medium Motion Transfer

Date: 2026-10-01

## Goal

Teach the accepted childlike Living Watercolor office worker the full motion vocabulary already stored in World Server's KayKit Rig_Medium library, without changing the benchmark house/tree/volcano/power-plant generators.

## Architecture

The worker now uses the real KayKit Rig_Medium skeleton as a hidden motion source:

```text
KayKit Rig_Medium animation GLBs
        ↓
hidden KayKit skeleton
        ↓
painted illustration masses attached to bones
        ↓
Living Watercolor compositor
        ↓
childlike animated office worker
```

The visible worker remains an illustration. KayKit mesh geometry is hidden; only the skeleton and animation tracks drive the painted masses.

## Canonical files

- `shared/graphics/illustration-character-kaykit.js`
- `shared/graphics/illustration-character-rig.js`
- `shared/graphics/illustration-mass-modeler.js`
- `apps/living-watercolor-3d/client.js`
- `assets/characters/kaykit-knight/`
- `test/illustration-character-kaykit.test.mjs`

## Animation coverage

KayKit Rig_Medium provides:

- **139 source clips** across 8 animation GLBs;
- **132 unique motion names**;
- the difference is the repeated `T-Pose` clip present in all 8 groups;
- **40 currently resolved semantic actions** through `semantic-actions.json`.

The browser UI exposes the 132 unique motions directly. This covers the full unique motion vocabulary of the 139 source clips without pretending repeated T-Poses are different behavior.

Examples verified through the live browser driver:

- `Walking_A`
- `Running_A`
- `Jump_Start`
- `Sit_Chair_Idle`
- `Waving`
- `Melee_Unarmed_Attack_Punch_A`
- `Ranged_1H_Shoot`
- `Death_A`

## Important human-review rule

Technical playback does **not** equal behavioral approval.

The previously hand-authored worker `wave` remains a documented failure because its palm/hand direction was wrong for a natural gesture.

KayKit's `Waving` clip is now available through the transferred library, but it must receive fresh human review before being promoted as the replacement success.

Every human gesture should be evaluated for semantic correctness, not only smooth playback.

## Benchmark protection

The motion-transfer change does not modify:

- `createWatercolorHouse()`
- `createWatercolorTree()`
- `createWatercolorVolcano()`
- `createWatercolorPlant()`

Those remain benchmark objects.

## Verification

Focused automated tests:

- 139 source clips are physically present in the GLBs;
- 132 unique names are present;
- `T-Pose` is the only duplicated clip name across groups;
- driver uses real `GLTFLoader` + real animation groups;
- semantic action contract is present;
- Living Watercolor regression tests remain green.

Current focused test result: **15/15 PASS**.

Browser smoke on a 390×844 mobile viewport:

- worker loads without runtime exceptions;
- 132 unique animations populate the selector;
- 139 source-clip count is reported;
- representative locomotion, simulation, combat, ranged and death clips all start successfully.

## Reusable lesson

For stylized characters, do not re-author a large animation library by hand.

Use a mature hidden skeleton as a **motion teacher** and attach the stylized visual language to that skeleton. This separates:

- motion capability;
- visible art style;
- gesture semantics;
- props.

The result can inherit hundreds of motions while keeping the watercolor character visually simple.
