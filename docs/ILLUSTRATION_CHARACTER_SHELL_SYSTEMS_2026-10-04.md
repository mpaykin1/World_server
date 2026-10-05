# Illustration Character Shell systems

Date: 2026-10-04

## Purpose

Add the missing character-specific Illustration-First systems needed to keep a rich hidden KayKit animation rig while preventing the skeleton from dictating the visible drawing.

The target architecture is:

```text
KayKit animation
→ hidden skeleton pose
→ Character Illustration Shell
→ visual envelopes + garment grammar
→ semantic paint layers
→ one semantic outer contour
→ Living Watercolor compositor
```

## Added systems

### Character Illustration Shell

Canonical file:

- `shared/graphics/illustration-character-shell.js`

The shell becomes the visible owner of the worker. KayKit remains a motion source only.

### Pose-Aware Silhouette

A dynamic contour proxy follows the current skeleton pose. It is emitted as one semantic outer-contour object rather than allowing every visible limb mass to create its own watercolor outline.

This is intentionally a lightweight first implementation suitable for browser/mobile. It can later be upgraded to a full screen-space union contour without changing the shell API.

### Garment Grammar

The worker now has an explicit garment grammar:

- one dominant jacket mass;
- shirt wash;
- left/right lapel details;
- collar details;
- black tie;
- pocket strokes.

Garment details are subordinate paint layers rather than separate outlined 3D props.

### Semantic Paint Layers

Every shell element declares one of:

- `mass`
- `detail`
- `ink`

The worker root publishes the intended order:

```text
mass → detail → ink
```

### Single Outer Contour

Character shell masses set `watercolorOutline=false`.

The shell creates one dynamic semantic contour object named:

- `worker-single-outer-contour`

This prevents the earlier failure mode where each arm, lapel, trouser segment and prop produced competing technical outlines.

### Sketch Proportion Controller

Visible proportions are now independent from the KayKit skeleton.

Available controls include:

- head scale;
- shoulder/torso proportions;
- upper/lower arm thickness;
- upper/lower leg thickness;
- hand scale;
- foot scale;
- jacket length;
- prop scale.

This lets the hidden animation rig remain compatible while the visible drawing follows a naive sketch proportion language.

### Bone → Visual Envelope Mapper

Bone chains drive painted envelopes rather than directly owning the drawing.

The current implementation maps upper/lower arms and legs to outline-free paint envelopes and keeps the visible silhouette controlled by the shell.

### Prop Grip Constraint

The briefcase follows the hand position while its readable world orientation is stabilized separately from arbitrary wrist twist.

### Illustration Character Reference Gate

Canonical file:

- `shared/graphics/illustration-character-reference-gate.js`

The gate checks construction invariants that matter for the approved style:

- shell exists;
- pose-aware silhouette exists;
- exactly one outer contour object exists;
- shell masses do not create their own outlines;
- jacket grammar exists;
- black tie exists;
- briefcase exists;
- prop grip exists;
- mass/detail/ink layers exist.

This structural gate is **not** a replacement for human visual approval. It prevents known architectural regressions but cannot prove that the resulting drawing matches the target sketch.

## KayKit integration

`shared/graphics/illustration-character-kaykit.js` now delegates visible worker construction to `createCharacterIllustrationShell()`.

The animation system remains unchanged:

- 139 source KayKit clips;
- 132 unique motion names;
- hidden Rig_Medium skeleton;
- existing semantic action mapping.

## Verification

Focused test suite:

- `test/illustration-character-shell.test.mjs`
- existing KayKit and Living Watercolor regression tests

Result:

- **19/19 PASS**

Mobile browser smoke at 390×844:

- no runtime exceptions;
- KayKit loads 132 unique motions / 139 source clips;
- character structural gate = **100 / PASS**;
- exactly one semantic outer contour;
- zero per-part shell outlines;
- jacket / tie / briefcase / grip / semantic layers detected.

## Important status

The systems are implemented and integrated.

The current worker rendering is **not automatically promoted to visual success**. Human review still decides whether the visible result is close enough to the target sketch. The structural gate only proves that the new architecture is active and that the old per-part-outline construction has been removed from the shell.