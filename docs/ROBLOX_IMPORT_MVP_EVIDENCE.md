# Roblox import bridge — MVP evidence

Date: 2026-09-30
Scope: infrastructure importer/adapter MVP, not a playable port of the reference game.

## What succeeded

The importer was exercised against the user-provided `городкамни.rbxlx` without executing embedded Luau.
Observed result:

- 193 Roblox instances parsed;
- 39 Script/LocalScript/ModuleScript sources inventoried;
- 3 RemoteEvents found: `ThrowRock`, `DropRock`, `RockCinematic`;
- 25 external asset references / 13 unique Roblox asset IDs recorded;
- behavior classifiers detected procedural world generation, chunk streaming, climbing, air movement, player input, projectile physics, lighting, visual effects, tags, character control and tween animation;
- capability mapping detected raycasts, impulses, velocity, contact events, networking, frame scheduling, CFrame, attributes/tags and lighting;
- runtime adapter delegates to existing Golden controls/physics and an injected authoritative World Server network host rather than creating a second game engine.

The focused synthetic regression suite passes 7 tests after the fixes below.

## Failure found during MVP work

The first focused run failed because nested numeric values inside Roblox `Vector3`/`CFrame` properties were preserved as strings.
Root cause: scalar conversion keyed on XML node type, while child nodes are named `X`, `Y`, `Z`, `R00` etc.
Fix: object-property parsing now converts numeric child text explicitly before emitting World Server IR.
Regression: the fixture asserts `Vector3 Size` becomes numeric `{ X: 4, Y: 12, Z: 4 }`.

## Honest blockers discovered

The reference game is not yet declared playable or visually equivalent.

- All 13 unique external Roblox asset IDs remain `unresolved-external` until owner-authorized/exported bytes are supplied or an evidenced procedural replacement is created.
- The file contains 5 `TerrainRegion` instances. Opaque terrain-region bytes are not fabricated; migration remains blocked until a supported decoder or owner-provided terrain export exists.
- Arbitrary Luau is not executed or blindly transpiled. Recognized behavior becomes a semantic World Server reimplementation plan and must still pass runtime tests.
- Final desktop/mobile/playable/visual quality gates remain mandatory.

## Reusable lesson

A robust Roblox migration should translate **game systems and intent**, not merely copy visible meshes and not blindly transpile source text. The safe reusable path is:

`RBXLX -> typed IR -> asset manifest -> semantic behavior plan -> Golden runtime adapters -> game-specific implementation -> normal World Server quality gates`.

This evidence intentionally preserves both the failed parser assumption and the successful fix so future agents can avoid repeating it.

## Playable MVP release failure found and repaired

During the exact-head release gate, `Golden Standard` rejected the branch with `world registry contains encoding corruption`.
The playable app itself was not the failing component: a Windows PowerShell inline script had converted four newly added Cyrillic registry strings into literal `?` characters before commit.

Root cause: human-readable UTF-8 metadata was passed through a shell/code-page boundary instead of a UTF-8-preserving write path.
Repair: rewrite the affected registry fields through the GitHub UTF-8 contents API and keep the existing Golden corruption gate enabled.
Prevention: generated release metadata with non-ASCII text must use a UTF-8-preserving file/API path; never weaken the `???` fail-closed check to make a release pass.


Exact-head gate rerun marker: registry encoding repaired; playable MVP tree unchanged.

## Playable MVP browser failure: desktop render pressure starved projectile progress

An earlier exact-head Cloudflare run for PR #367 produced useful falsification evidence:
- mobile WebKit passed;
- desktop Chromium failed after three retries;
- the first/third failures reached the physical throw but `impacts` stayed at zero until the 35 s test timeout;
- one retry stalled inside `page.evaluate(fireTest)`, showing main-thread responsiveness itself was degraded.

The failure signature pointed to render/main-thread pressure rather than a missing throw API: the scene kept five active chunks (`KEEP=2`), thousands of separate Gothic meshes and many decorative shadow casters.
Repair in the clean release branch:
- adaptive active-chunk ring: mobile keeps the current chunk, desktop keeps one neighbor each side;
- four buildings per chunk instead of six while preserving the source-derived 128-stud chunk and 54–176-stud Gothic building rules;
- decorative buttresses, torch posts and distant towers no longer cast expensive shadows;
- held-rock transform is initialized before runtime `ready`;
- runtime frame progress is exposed for evidence/debugging.

Lesson: a graphics-first gate must measure not only viewport coverage but also interaction progress under the actual renderer. A scene can occupy 100% of the screen and still be unusable if draw/shadow pressure starves gameplay simulation.

