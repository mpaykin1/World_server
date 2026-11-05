# PR595 pillar correction

Task: owner-authorized corrective review of browser GPT generator. Scope claimed in #595 before writes: only two cube calls and new test/engines-game-geometry.test.js. No architectural/world/gameplay changes.

Current/target: marker Z was used as Y2, making far pillars31.78m tall and anchored across the world; require both pillars 2.7m high at each authored position.

Plan: preserve current runtime blob, patch two calls with Contents API SHA guard, add real emitted-vertex bbox regression. If file changed concurrently, stop rather than overwrite. Existing generator author retains architecture/scene ownership.

Evidence: 3 actual-geometry cases (origin, distant marker and nonzero XY/negativeZ) all FAIL before fix and3/3 PASS after. Test executes actual vertex/cube/marker fragment through bounded Node vm, checks both emitted meshes rather than string equality.

Risks: anchor extraction must be maintained if geometry is refactored; current browser QA still needs independent orbit assertion improvement. No browser or publication PASS from this local test.

Next: full exact-head CI and generated WebGL2 browser rerun, inspect fresh screenshots, then close confirmed blocker. No merge/publish while confirmed errors remain. Independent review advisory per owner policy, no fabricated signature.
