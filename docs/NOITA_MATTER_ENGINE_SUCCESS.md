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

## Independent-review hardening

The first adversarial review returned BLOCK on two claims that did not reproduce: it interpreted horizontal direction tuples as broken vertical movement, and it confused fire `life` (TTL) with combustible-material `fuel`. Instead of bypassing the review, the implementation was made unambiguous: horizontal directions are now explicit 2D offsets, fire TTL is named separately in `_processFire`, and falsification tests cover diagonal powder settling, horizontal liquid flow, vertical gas rise, and one-tick wood ignition/fuel survival.

This is useful process evidence: even a false-positive review can expose code that is technically correct but too easy to misread. The fix was clarity plus executable counterexamples, not disabling the reviewer.

A second adversarial run produced one useful hardening finding among mostly unsupported claims: callers could forge `burning:true` on inert materials because cell normalization accepted the flag for every material. The engine now accepts burning state only for materials with an ignition threshold, and `_combust` also fails closed for inert matter. The same review invented per-chunk/inverted Y axes; the engine now exports an explicit fixed world gravity contract `{x:0,y:-1,z:0}` and tests falling/rising across a 16-cell chunk boundary, making the World Server Y-up convention executable rather than implicit.

## Verified behavior

The dedicated matter suite passes 11/11, covering phases, gravity, diagonal settling, horizontal liquid flow, vertical gas rise, density, lava-water reaction, combustion, phase changes, sleeping and determinism.

## Next integration

Map existing voxel block types to matter materials, wake matter around destruction and macro events, persist only changed chunks, then stream and render those chunks through the existing voxel/Krieger path. Structural connectivity and detached rigid bodies are the next major physics layer.
