# Living Watercolor volcano — ILLUSTRATION-FIRST GOLDEN SUCCESS

Date: 2026-09-30

## Human acceptance

The rebuilt volcano is explicitly accepted as a **success and golden reference**.

This acceptance applies to the new **Illustration-First** construction principle, not merely to the final silhouette of one volcano. Future AI agents and chats should reuse the construction logic when creating new stylized watercolor 3D objects.

The already-approved volcano smoke remains a separate golden success and should continue to be preserved.

## Golden principle

The successful volcano is **not** built as:

```text
3D primitive
→ deform mesh
→ add technical crater geometry
→ decorate with strokes
→ watercolor filter
```

It is built as:

```text
illustration grammar
→ broad painted masses
→ painted void / crater
→ sparse semantic strokes
→ hidden 3D scaffold
→ watercolor compositor
→ coherent smoke
```

This is the architectural lesson to preserve.

## Canonical implementation

Core systems:

- `shared/graphics/illustration-mass-modeler.js`
- `shared/graphics/living-watercolor-generators.js`
- `shared/graphics/living-watercolor-3d.js`
- `apps/living-watercolor-3d/client.js`

The accepted volcano generator is `createWatercolorVolcano()`, implemented with `createIllustrationMassModeler()`.

## Why the rebuilt volcano works

### 1. Painted masses own the form

The volcano is assembled from several overlapping illustration masses:

- one dominant mountain mass;
- left pigment mass;
- right pigment mass;
- central wash mass.

The visible object is therefore governed by a painterly hierarchy instead of a radial cone formula.

### 2. The crater is a painted void

The crater uses an irregular painted void rather than a technical `CircleGeometry + TorusGeometry` ring construction.

This prevents the summit from reading as a 3D mechanical rim.

### 3. Sparse semantic strokes explain shape

Only a few slope strokes are used. They are there because an illustrator would place them to explain volume, not because they correspond to polygon edges.

The model must never expose wireframe/topology as drawing detail.

### 4. Hidden 3D remains useful

The object is still genuine 3D for:

- depth;
- camera movement;
- animation;
- interaction;
- placement in the world;
- future physics/destruction hooks.

But hidden structural 3D no longer dictates the visible artistic language.

### 5. Smoke is kept independent

The successful `smokeVol` brush emitter remains unchanged in principle:

```js
const smokeVol=watercolor.createBrushEmitter({
  parent:items.volcano,
  origin:new THREE.Vector3(0,2.28,0),
  count:18,
  scale:.58,
  rise:.62,
  spread:.56,
  wind:.045,
  seed:'volcano-smoke-v3',
  opacity:.14
});
```

Smoke and body are separate systems so either can evolve without damaging the other.

## Reusable World Server rule

For future watercolor / illustrated 3D objects:

1. define the object's **visual grammar**;
2. create a few broad **painted masses**;
3. create negative/dark regions as **painted voids**, not technical rings;
4. add only a few **semantic strokes**;
5. keep the 3D scaffold hidden from the visible style;
6. let the watercolor compositor unify pigment and paper;
7. validate by human visual review, not only metrics.

## What this supersedes

The previous volcano-body failure record described the radial-cone / technical-crater approach as rejected. That diagnosis remains valuable as a negative lesson, but it is no longer the current volcano status.

The current Illustration-First volcano **supersedes the failed implementation** and is now the canonical golden example.

## Golden status

**SUCCESS / ETALON / REUSE.**

Future agents should treat this volcano as the reference implementation for the new World Server **Illustration-First 3D Objects** family.

Do not revert it to primitive-first construction unless a later explicit human review replaces this benchmark.
