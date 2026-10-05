# Illustration Office Worker — SUCCESS memory

Date: 2026-10-01

## Human acceptance

The new Living Watercolor **office worker is accepted as a success**, with one explicit exception:

- `wave` / hand-waving animation is NOT accepted and is documented separately as a failure.

The character itself, its childlike watercolor construction, rig, idle behavior, walking and briefcase-carry behavior are accepted as the reusable success baseline.

## Canonical implementation

- `shared/graphics/illustration-character-rig.js`
- `shared/graphics/illustration-mass-modeler.js`
- `shared/graphics/living-watercolor-3d.js`
- `apps/living-watercolor-3d/client.js`

Core constructor:
- `createIllustrationOfficeWorker()`

Animator:
- `createIllustrationCharacterAnimator()`

## Why the worker succeeds

The successful principle is the same Illustration-First idea that worked for the watercolor volcano, extended to characters:

```text
childlike visual grammar
→ simple painted body masses
→ hidden humanoid joint hierarchy
→ semantic ink accents
→ watercolor compositor
→ simple animation controller
```

Important successful choices:

1. **Low-detail anatomy.** The figure is built from very simple painted masses instead of realistic limbs, fingers, skin or facial detail.
2. **Blank/simple face.** This preserves the naive child-drawing style and avoids realism drift.
3. **Hidden rig, visible illustration.** The joint hierarchy provides real 3D motion while the visible surface remains painterly.
4. **Sparse semantic ink.** Tie and jacket accents are semantic strokes, not exposed mesh topology.
5. **Independent action controller.** `idle`, `walk`, `carry` and `wave` are explicit actions, allowing accepted motions to remain stable while one failed motion is repaired separately.
6. **Briefcase as a simple prop mass.** It communicates “office worker” without adding unnecessary detail.
7. **Watercolor compositor remains the final visual authority.** The character stays in the same world language as house/tree/volcano/power plant.

## Accepted motion baseline

Human review accepts the worker as a success except for the wave gesture.

Treat these as the current positive baseline:

- `idle`
- `walk`
- `carry`

Do not regress them while repairing `wave`.

## Reuse rule

For future simple people in this style:

- build from painted masses, not realistic anatomy;
- keep the rig hidden;
- use very few semantic strokes;
- keep props simple;
- animate at the joint level;
- validate every human gesture for behavioral plausibility, not only whether the joints move.

## Status

**SUCCESS / REUSE.**

The worker character is an accepted benchmark. The `wave` action is excluded from that success and must remain marked failed until separately corrected and human-approved.
