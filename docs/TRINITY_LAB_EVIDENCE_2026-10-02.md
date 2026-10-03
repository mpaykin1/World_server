# Trinity Lab evidence — 2026-10-02

Trinity Lab is a diagnostic integration consumer for one semantic scene and three interpretations: KRIEGER, INK, and CUBE. It must not be used as evidence that missing native capabilities exist.

## User acceptance verdict — 2026-10-03

The later live user review supersedes any interpretation of technical capability evidence as final graphics acceptance:

- **KRIEGER — USER-CONFIRMED SUCCESS:** graphics-quality parameters are satisfied.
- **INK — USER-CONFIRMED FAILURE / NOT SUCCESS:** graphics-quality parameters are not satisfied.
- **CUBE — USER-CONFIRMED FAILURE / NOT SUCCESS:** graphics-quality parameters are not satisfied.

Technical capabilities documented below remain valid, but they must not be used to relabel INK or CUBE as successful. See `docs/TRINITY_LAB_USER_VERDICT_2026-10-03.md` and `data/trinity-lab-user-verdict.json`.

## Confirmed technical capabilities

- One immutable `TrinitySceneRecipe`, seed `731942`, signature `e0e04f5a` drives all three modes.
- KRIEGER adapter renders real interactive WebGL geometry, materials, shadows, semantic local light, water, vegetation, and an animated procedural character.
- INK reuses the existing real-mesh Living Ink NPR renderer; semantic object IDs remain identical and style survives camera movement.
- CUBE starts with exactly one physical cube, then generates real intermediate geometry rather than revealing a hidden finished scene.
- CUBE evidence: 1 physical object at start, 79 at 46% progress, 306 at final; final semantic IDs equal the source recipe.
- Desktop visibility measured 100%; portrait synthetic-mobile visibility measured 90%. Both exceed the 85% delivery gate.
- Fixed viewport evidence: scrollX=0, scrollY=0; CSS/backing/DPR/camera aspect remain synchronized.
- Local browser suite: 6/6 PASS across desktop Chromium and mobile Chromium.
- Shared recipe tests: 3/3 PASS.

## Important limits

- KRIEGER native custom-scene authoring is still MISSING. Trinity does not route its recipe through native werkkzeug3 GenScene/Sector/Portal/Light/Engine jobs.
- The current KRIEGER mode is therefore a PARTIAL Krieger-class procedural adapter, not proof of Total Control.
- Graphics Quality Governor currently fails KRIEGER semantic-detail, secondary-geometry, near-object, material, and environment gates.
- INK semantic contours and camera persistence are real; watercolor/pigment pooling remains PARTIAL.
- CUBE has REAL split/move/transform/settle, PARTIAL attach, and MISSING extrude/merge.
- Character and animation are procedural PARTIAL capabilities, not a full shared skeletal animation pipeline.
- Headless local performance evidence was ~20 FPS / 50 ms p95 on the remote test machine; do not claim 60 FPS from this run.

## Failures found and root causes

1. **Wrong assumed default branch.** World Server uses `master`, not `main`. Work started only after resolving `origin/HEAD`; future agents must not assume a branch name.
2. **Three.js 404.** The local World Server server does not expose root `/vendor/`; Living Ink initially failed to boot. Fix: retain the MIT vendor under served `shared/vendor/three-r160/`.
3. **CUBE compact-declaration scope bugs.** `s` in rock generation and `cells` in bridge generation were accidentally left undeclared by comma expressions after statements. Browser e2e exposed both; explicit declarations fixed them.
4. **CUBE manual-progress race.** Evidence helper `setCubeProgress(1)` was overwritten by autoplay on the next frame. Fix: manual progress freezes autoplay until restart.
5. **Shared viewport exposed task-compiler coupling.** Adding `shared/fixed-game-viewport.js` caused an unrelated explicit HTML task to pull the shared file into level-1 agent context. Root fix: when level 1 has explicit existing paths, scoped-task-compiler now returns only those explicit paths.

These are useful failures: they caught hidden integration coupling that isolated demos did not expose.

## Recalculated readiness

- **KRIEGER TOTAL CONTROL — 48%.** Real C/C++→Emscripten→WASM→WebGL2 runtime exists in the canonical Krieger repository and renderer forensics/portrait control are proven, but arbitrary Trinity semantic scenes still cannot be authored through the native Krieger scene/runtime path.
- **INK / LIVING INK — 74%.** Same-scene real-mesh semantic ink, interactive camera persistence, paper/wash treatment and depth are integrated; pigment pooling, richer semantic detail, character fidelity and target-reference visual fidelity remain incomplete.
- **CUBE / CUBE-TO-WORLD — 78%.** Deterministic one-cube start, real intermediate generated states, terrain/biome/architecture/material/light/life stages and final semantic equivalence are proven; extrude/merge are missing and attach/material-continuity are incomplete.

The percentages intentionally decreased or stayed conservative where Trinity falsified earlier assumptions. They represent capability readiness, not beauty scores.

## Provenance and reuse

Reused shared capabilities were taken from existing World Server branches rather than independently reimplemented: semantic scene/evolution runtime, Living Ink WebGL NPR, Graphics Quality Governor, and fixed-game viewport. Three.js r160 is vendored with its MIT license. No protected game assets, screenshots, or prerendered video are used.

Canonical Krieger evidence was re-read from current `scratch-chain-reaction/origin/main` before implementation. The real Krieger engine remains a separate canonical C/C++/WASM/WebGL2 path; Trinity records its custom-authoring gap instead of substituting a fake native claim.

## Next blocker

The highest-value next step is **Native Krieger Scene Adapter v1**: compile a minimal `TrinitySceneRecipe` subset (tower/bridge/light) into the real GenScene → Sector/Portal → Light → Engine job path, with a render proof and no Three.js fallback. That single capability would remove the largest gap revealed by Trinity and raise cross-system reuse for future scenes.
