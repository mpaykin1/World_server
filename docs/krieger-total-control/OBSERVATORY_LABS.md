# Krieger Observatory and Laboratory

## Observatory V1

The instrumentation patch adds a compact in-game debug panel and a structured event buffer at `window.__kkForensics`.

V1 channels are deliberately centered on the three user-reproduced failures:

- browser / canvas / DPR / orientation;
- engine screen;
- master viewport;
- projection aspect;
- IPP viewport;
- WebGL viewport;
- lifecycle / START;
- weapon request / ownership / pending / commit.

The analyzer is `tools/krieger-total-control/observatory-core.mjs`.

Later channels should use existing engine debug hooks rather than reimplementing them. Upstream already contains debug painting for AABBs/rectangles/lines/triangles and browser-port toggles for portal visibility, pass filtering, shadows, shadow volumes, frustum culling, material isolation and lighting terms.

## Laboratory

`data/krieger-labs.json` is the machine-readable contract.

Viewport Lab is executable now through the torture harness. Weapon Lab and Lifecycle Lab are observable now through real C++ state/lifecycle channels. Mesh, Material, Creature, Light and Level Labs are intentionally marked SCAFFOLD until they have isolated executable fixtures.

A lab is not considered implemented because a document names it. It becomes executable only when one isolated input produces measurable outputs without requiring a full game-level investigation.

## Infinite Krieger direction

The extraction target is not “make more hard-coded Krieger levels.” It is to replace fixed terminal structures with recipe interfaces:

- `WorldRecipe → deterministic sector/chunk graph → generated geometry/materials/entities`;
- `WeaponRecipe → mesh/material/stats/animation/muzzle/projectile/sound`;
- `CreatureRecipe → morphology/mesh/material/rig/animation/behavior/abilities`;
- procedural material graph → compact generated texture/material state.

Krieger remains the reference laboratory. World Server owns the future semantic recipes and modernized runtime boundaries.


## Native Light Lab V1

`tools/krieger-total-control/light-lab.mjs` exercises the pinned native 2004 renderer without replacing it. It requires selected native lights and shadow jobs, captures untouched baseline framebuffer noise, then drives `kkCycleShadows()` through Observatory command 6: `0 normal → 1 no shadows → 2 no shadows/no local lights → 0 restored`.

For deterministic framebuffer evidence, Observatory command 15 freezes only the native `sSystem_::GetTime()` while the original render loop keeps running; default runtime behavior is unchanged. Shadow and local-light framebuffer deltas must dominate residual frozen-frame noise, lighting restoration must return near baseline, and the clock must resume. This is a TEST gate only; it cannot become `CONTROL_PROVEN` or a user SUCCESS/FAILURE record without the owner verdict.
