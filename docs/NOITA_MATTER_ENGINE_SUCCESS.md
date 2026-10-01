# Noita-style Matter Engine MVP — success record

Date: 2026-10-01

## Result

World Server now has a sparse deterministic 3D matter simulation in lib/world-matter-engine.js.

Implemented in the MVP:
- active-cell wake/sleep scheduling instead of updating the whole world;
- 16x16x16 chunk identity aligned with the voxel layer;
- solids, powders, liquids and gases;
- density displacement, including water sinking through lighter oil;
- sand gravity and diagonal settling;
- liquid gravity and lateral flow;
- gas rise;
- temperature and water/steam phase transitions;
- fire, ignition, fuel consumption and ash;
- lava + water -> stone + steam from local rules;
- deterministic evolution from seed + tick + coordinates;
- snapshots and runtime activity statistics.

## Why it worked

The key architectural choice is sparse activity. Stable stone sleeps. A cell wakes only when its neighbourhood changes, so work scales with the active frontier rather than total map size.

The second key choice is universal material rules instead of scene scripts. Lava does not invoke a special scripted cooling scene: it reacts with adjacent water. The same rule works anywhere in the world.

The third key choice is determinism. Identical input, seed and tick sequence produce identical state, which is suitable for server authority, replay, persistence and regression tests.

## Failure found during development

The first test run passed 5/8. Two failures were bad fixtures: a single support block cannot keep sand or ash in place because powders correctly slide away. The real engine bug was fire movement: a fire cell could rise before neighbouring wood was guaranteed to enter the burning state.

Fix: fire now explicitly ignites adjacent flammable cells before it moves. Tests now use physical floors/walls instead of assuming particles remain pinned to one coordinate.

## Verified behavior

The dedicated matter suite passes 8/8, covering phases, gravity, density, lava-water reaction, combustion, phase changes, sleeping and determinism.

## Next integration

Map existing voxel block types to matter materials, wake matter around destruction and macro events, persist only changed chunks, then stream and render those chunks through the existing voxel/Krieger path. Structural connectivity and detached rigid bodies are the next major physics layer.
