# Playbook: Viewport & Render-Target Forensics

Last verified upstream SHA: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
Status: FOUND — diagnostic procedure; engine Observatory fields still require runtime proof.

## Purpose
Diagnose cases where the browser canvas/UI fills the screen but Krieger's actual 3D view does not. This playbook prevents the known false PASS of measuring DOM canvas coverage alone.

## Prerequisites
- Work from the pinned upstream SHA above, or first mark this playbook `NEEDS_REVERIFY`.
- Preserve the current permanent playable URL and landscape behavior.
- Keep physical-iPhone issue #34 OPEN until the user confirms the physical-device defect is gone.
- Do not change gameplay/render behavior before collecting engine-owned evidence.

## Exact entry points
- Browser/mobile resize bridge: trace `visualViewport`, DPR and `kkMobileResize`.
- Engine dimensions: `ConfigX` / `ConfigY`, then `InitScreens`.
- Render-target allocation/composition: `genoverlay.cpp`.
- Projection/game view: `kkriegergame.cpp`, `engine.cpp`; trace projection/ZoomY and final `view.Window`.

## Ordered procedure
1. Record exact repo SHA, build SHA, device/orientation, CSS viewport, `visualViewport`, DPR and canvas backing dimensions.
2. Capture the browser→WASM resize call and the values delivered to engine-owned `ConfigX/ConfigY`.
3. With Emscripten-only read-only Observatory instrumentation, expose after `InitScreens`: engine ConfigX/ConfigY; current/final render-target identity and width/height; final `view.Window` x/y/width/height; game-state marker needed to know the gameplay frame is actually rendering.
4. Capture the same fields in landscape and portrait without altering renderer behavior.
5. Compare boundaries in order: browser viewport → canvas backing store → ConfigX/Y → allocated render target → projection/aspect → final view.Window.
6. The first boundary whose dimensions/aspect diverge is the root-cause candidate. Prove it by a minimal diagnostic experiment before patching.
7. Only then make one bounded fix at that boundary. Re-run the identical trace and regression captures.

## Verification
A viewport fix is not PASS merely because the DOM canvas covers >85% of the screen. Evidence must show engine-owned final render target and final 3D view/window have the intended portrait dimensions/aspect, preserve landscape behavior, and physical-iPhone confirmation is still required before closing #34.

## Failure modes
- **False PASS:** CSS/canvas is fullscreen but final 3D view is a horizontal band.
- **Wrong state:** measurements are from intro/loading rather than gameplay.
- **Stale knowledge:** upstream/source files changed after the verified SHA.
- **Instrumentation changes behavior:** Observatory writes state or alters timing; reject it. Instrumentation must be read-only and Emscripten-only.

## Rollback / safety
Keep instrumentation behind an Emscripten/debug guard and read-only. Do not replace renderer targets, projection or gameplay state merely to make the diagnostic green. Revert any behavioral patch that regresses landscape, desktop, controls, graphics, or permanent URL.

## Retention / teach-back
Store trace/capture evidence with exact SHA. A fresh agent should be able to identify the first divergent boundary using only AI_HANDOFF.md, KNOWLEDGE_BASE.md, knowledge-index.json and this playbook. If it cannot, improve these documents before treating the investigation as retained knowledge.
