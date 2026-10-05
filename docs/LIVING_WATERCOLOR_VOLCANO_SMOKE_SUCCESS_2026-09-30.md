# Living Watercolor volcano smoke — SUCCESS memory

Date: 2026-09-30

## Human acceptance

The volcano **smoke is explicitly accepted as a success**. Preserve this implementation as a reusable golden example for future World Server effects.

## Canonical implementation

The accepted smoke is created in `apps/living-watercolor-3d/client.js` with the Living Watercolor brush emitter:

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

## Why this effect works

The success comes from the combination, not from any one number:

- large translucent brush puffs rather than tiny particle dots;
- enough overlap to read as one soft watercolor cloud;
- low opacity so the paper remains visible through the plume;
- modest wind and coherent upward rise, so motion feels alive but not noisy;
- deterministic seed, preventing flicker and preserving a stable painted identity;
- the smoke is visually broader and softer than the volcano geometry, matching the watercolor language.

## Reuse rule

For smoke, steam, fog or magical vapor in the Living Watercolor style, start from this emitter behavior:

**large soft puffs + overlap + low opacity + coherent rise + seeded motion**.

Do not replace it with:
- opaque billboard sprites;
- tiny high-count particles;
- fast turbulent noise;
- per-frame random respawning that flickers;
- realistic volumetric smoke that breaks the sketch language.

## Status

**GOLDEN SUCCESS.** Future AI/chats should preserve this effect unless a later human review explicitly replaces it.
