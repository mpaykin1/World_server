# Krieger Observatory Playbook

Status: PROTOTYPE (instrumentation contract; runtime probe not yet implemented)

Last source verification: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`

## Purpose

Diagnose physical-iPhone USE/weapon, START/game-state and portrait/render-target failures from engine-owned C++/WASM state. DOM labels, canvas size, browser logs and nonblank pixels are supporting evidence only.

## Prerequisites

- Work from the pinned upstream SHA above.
- Preserve the canonical playable route and landscape behavior.
- Add Emscripten-only, read-only instrumentation. Do not change gameplay transitions while measuring them.
- Keep issue #34 open until the relevant physical-iPhone behavior is user-confirmed.

## Exact entry points

### Weapon state
`werkkzeug3_kkrieger/kkriegergame.cpp`

Trace:
`mobile input -> WASM key buffer -> KKriegerGame::OnKey -> Player.NextWeapon -> KKriegerGame::AddEvents transition gate -> Player.CurrentWeapon -> WeaponEvent`.

Expose:
- `Player.CurrentWeapon`
- `Player.NextWeapon`
- `Player.WeaponTimer`
- whether/identity of `WeaponEvent`

Invariant: a changed DOM weapon label is not proof that `CurrentWeapon` changed.

### START / game state
`werkkzeug3_kkrieger/kkriegergame.cpp`

Expose the engine/root state sufficient to distinguish browser startup activity from the actual KKrieger game state. Record transitions around the existing INTRO/RUN/INGAME/RESTART root flow.

Invariant: rAF activity, a START button transition, or console output is not proof of the intended game/root state.

### Viewport / render target
Primary source map:
- `werkkzeug3_kkrieger/genoverlay.cpp`
- `werkkzeug3_kkrieger/kkriegergame.cpp`
- `werkkzeug3_kkrieger/engine.cpp`

Trace:
`visualViewport/DPR -> ConfigX/ConfigY -> InitScreens -> genoverlay render target -> projection -> final view.Window`.

Expose:
- `ConfigX`, `ConfigY`
- active/final render-target identity
- active/final render-target width/height
- final `view.Window` width/height (and origin if available)

Invariant: fullscreen DOM canvas coverage is not proof that the engine-owned final 3D viewport fills portrait.

## Ordered experiment

1. Add one Emscripten-only read-only snapshot function at the narrowest owner boundary; native builds must remain unaffected.
2. Return a versioned record, e.g. `schema: "krieger-observatory/v1"`.
3. Sample once after runtime readiness, immediately before and after a weapon-cycle input, after the weapon transition window, around START, and after portrait resize/orientation settles.
4. Store timestamp/sequence plus the engine-owned fields above. Do not infer state from DOM labels.
5. In browser/mobile smoke, assert state transitions against the Observatory record. Keep visual/canvas checks as secondary evidence.
6. For portrait, compare browser backing dimensions with engine render-target and final `view.Window`; report each separately.
7. Capture exact build SHA, upstream SHA, device/browser, trace and screenshot/video reference.
8. Only then modify the failing boundary. Re-run the same trace as regression evidence.

## Verification gate

A diagnostic claim is TESTED only when the trace proves the engine-owned field changed (or failed to change) at the expected boundary. A physical-iPhone bug is LIVE_VERIFIED only after user confirmation on the physical device.

Minimum weapon proof:
`NextWeapon request -> WeaponTimer gate -> CurrentWeapon transition -> WeaponEvent identity`.

Minimum portrait proof:
`ConfigX/Y -> render-target dimensions -> final view.Window` agree with the intended portrait surface, plus physical-iPhone confirmation.

Minimum START proof:
browser action is correlated with an engine/root-state transition, not merely DOM/runtime activity.

## Failure modes

- Reading only JavaScript shadow state: false proof.
- Sampling too early: may miss `WeaponTimer >= 1.0` transition.
- Treating nonblank pixels as correct viewport: false proof.
- Changing gameplay while adding instrumentation: destroys diagnostic isolation.
- Publishing raw pointers: avoid; expose stable ids/booleans/enums.
- Shipping debug instrumentation permanently without a build guard: avoid.

## Rollback / safety

Observatory code must be Emscripten/debug gated and read-only. It must not write Player, game/root, renderer, render-target or viewport state. Removal must restore byte-for-byte gameplay semantics apart from debug/export packaging.

## Knowledge retention

After a successful trace:
- update `docs/kkrieger/KNOWLEDGE_BASE.md`;
- update `docs/kkrieger/knowledge-index.json`;
- attach exact SHA + trace/test evidence;
- convert any newly repeatable operation into a playbook;
- mark affected entries `NEEDS_REVERIFY` whenever referenced source changes.

## World Server teaching bridge

General principle: engine-owned observability must cross the WASM boundary through a stable read-only schema. The reusable World Server capability is a renderer/game-state Observatory adapter that separates semantic state, render-target state and presentation/UI state, preventing false PASS from overlays or shadow DOM state.
