# Causal voxel visual acceptance

This change introduces actual browser-side, CPU-generated four-frame THREE.Sprite billboards in the existing voxel renderer, refreshed from persisted emergence state and animated each frame. Smoke appears for volcano entities; ash, construction dust, burnt-grove smoke, wetland ripples and hot-spring steam appear only when the corresponding staged feature exists. Sprite materials use depth testing, bounded mobile/desktop counts, and dispose on state refresh. No paid API or GPU generation.

**Limitations:** Lava physics, actual villagers, renderer-generated lava-steam collision effects, true automatic placement from the server planner, and user-approved Golden Scene visual parity remain unimplemented. Do not claim a complete cinematic scene. The server event-to-sprite contract is a separate preparatory module; graphics ownership must consolidate the contract with renderer implementation before final release. Require independent exact-SHA Fleet PRE and deployed Fleet POST with desktop/mobile screenshots and FPS before raising whole-system readiness.

**Regression check:** node --test test/world-causal-visuals.test.js; npm run check; browser test on desktop and mobile at city+volcano and forest+volcano, confirm 4-frame animation, no sprite leak across macro ticks, no billboard through terrain, no mobile FPS regression.
