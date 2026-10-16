# WORK IN PROGRESS — ai/claude/canary-browser-gate

> Updated 2026-10-16. Task notes for this branch (AGENTS.md §11).

## Task
Make the Quality Canary browser gate honest about real defects: the HUD audit must not count aria-hidden, click-through render layers as HUD, and the offline-resilience test must target the renderer canvas.

## Why
The owner asked to fix every breakage that hinders work (2026-10-14). After #505 the canary passes `Release gate` and `Deploy` for the first time since 2026-09-21. Its `Browser gate` fails on every master push: 17 of 245 tests, readable now as annotations.

Most of the failures come from two stale test assumptions:
- **hud-audit voxel-world / ai3d-voxel-city** (8 failures). `#phaser4FxLayer` (Phaser FX, #165) and `#goldenCinematicPost` (vignette/grade, #120) are full-viewport, aria-hidden, `pointer-events:none` render layers. The audit counts any fixed element over 8% of the viewport as a HUD overlay.
- **voxel-offline-resilience** (3 failures). `page.locator('canvas')` now matches two canvases, the renderer and the FX layer canvas, and fails Playwright's strict mode.

## Current state
master 644d217; canary run 38664937005 on af601f6: 17 failed, 228 passed, 27 skipped.

Failures outside this patch:
- perceptual-baseline ai3d-voxel-city on 4 devices: 85% pixel difference from the 2026-08-24 baseline. Approving a new aesthetic baseline is not automatic (data/visual-baselines.json policy).
- mobile-webkit only: hud-audit catalog and golden-mobile-world-experience newspaper. Details were cut off by the 10-annotation limit; this patch frees those slots.

## Target state
- The audit skips only layers that are marked with `data-golden-render-layer`, aria-hidden and click-through; everything else stays under the guard.
- The offline test checks the renderer canvas.
- The canary run on this branch shows the remaining failures with details.

## Files / systems involved
- shared/graphics/phaser4-fx-layer.js, shared/golden-painting-atmosphere.js (one attribute each, no visual change)
- e2e/hud-visual-audit.spec.js (in-page audit as one function, render-layer rule, synthetic rule test)
- e2e/voxel-offline-resilience.spec.js
- test/phaser4-fx-layer.test.js, test/golden-painting-atmosphere.test.js

## Known risks
- An overlay that blocks the view could hide behind the marker: the exemption also requires aria-hidden and `pointer-events:none`, and the synthetic test proves the marker alone exempts nothing.
- No visual change: the layers keep their styles; only an attribute is added.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- Render layers reported as HUD overlays.
- Ambiguous locators that break when a second canvas appears.

## Exact patch / change plan
1. Mark both layers with `data-golden-render-layer` (fx / post).
2. Audit: one in-page function; skip marked layers that are aria-hidden and click-through; synthetic test with a valid layer, a marked-but-interactive layer, a marked-but-announced layer and a plain modal.
3. Offline test: `canvas[data-golden-three="1"]`.
4. Source tests pin the markers.
5. Dispatch the canary on this branch; read the remaining failures.

## Tests to run
- npx playwright test e2e/hud-visual-audit.spec.js (local Chromium: synthetic rule, catalog, ai3d-voxel-city)
- node --test test/phaser4-fx-layer.test.js test/golden-painting-atmosphere.test.js
- npm run check (ARCHITECTURE_BASE_REF=644d217), npm run golden:check, check-agent-rules, desktop-ai:check
- Quality Canary on this branch (workflow_dispatch)

## Deployment / PR plan
Task branch -> CI -> canary dispatch on the branch -> PR -> merge on the owner's instruction (2026-10-14). The canary worker is a test worker; production is untouched.

## Current progress
Patch done; local checks green.

## Next action
Push, open the PR, dispatch the canary on the branch.

## Completion criteria
- The 11 HUD-audit and offline failures are gone in the canary run on this branch.
- Required checks green.

## Final evidence
- Local Chromium (desktop, mobile, tablet): synthetic rule test, catalog and ai3d-voxel-city audits — 9 passed. Without the exemption the synthetic test fails on `fxLayer`.
- Locally the voxel-world pages exceed the timeout in software WebGL; they are verified in the canary.
- node --test (FX layer, atmosphere): 35/35.
- npm run check (ARCHITECTURE_BASE_REF=644d217): Syntax OK (88 files); Architecture PASS (6 changed code files); 1280 tests, 1275 pass, 0 fail.
- golden:check: PASS. check-agent-rules: PASS.
