# Krieger Learning & Teaching System

Canonical knowledge for Krieger work. Evidence is SHA-bound; hypotheses are never facts.

## Evidence rules

Every entry records: verified source SHA, exact files/symbols/flow, state ownership/lifecycle/invariants, experiment or trace evidence, known unknowns, provenance/license boundary, and World Server applicability. If a referenced file/symbol changes, the entry becomes `NEEDS_REVERIFY` until checked again.

## Current canonical baseline

- World Server integration base: `b12faed1bf7439ba9d257327ae4ccfcf8c17079a`
- pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
- build: Emscripten 6.0.9
- playable handoff remains in `scratch-chain-reaction/kkrieger`; physical-iPhone issue #34 remains OPEN.

## Confirmed subsystem map

The existing bridge documents these upstream entry points at the pinned SHA:

- mesh: `werkkzeug3_kkrieger/genmesh.cpp`, `genminmesh.cpp`
- bitmap/texture: `genbitmap.cpp`
- material/shader: `genmaterial.cpp`, `materials/*`, `wasm/shader_translate.cpp`
- scene: `genscene.cpp`
- effects/render overlay: `geneffect.cpp`, `genoverlay.cpp`
- game runtime: `kkriegergame.cpp`, `engine.cpp`
- audio: `v2/*`, `wasm/v2_bridge.cpp`

These are discovery entry points, not claims that their full data flow is already understood.

## Learning gate

A bounded Krieger investigation is retained only when it can answer:

1. WHAT DID WE LEARN?
2. WHERE IS IT STORED?
3. HOW IS IT VERIFIED?
4. CAN ANOTHER AI REPRODUCE IT?

Repeatable operations also require a playbook. Independent teach-back must use only the onboarding/KB/playbook and must verify conclusions against code/runtime.

## Failure lesson: viewport visibility is not 3D viewport proof

**Symptom:** physical-iPhone portrait can show a full DOM canvas/UI while the actual 3D scene remains a horizontal band.

**Insufficient approach:** asserting only canvas DOM coverage (>85%) or nonblank compositor pixels.

**Why insufficient:** those checks prove the browser surface is visible, not that the engine's final render target/projection/view window fills it.

**Correct diagnostic direction:** instrument the real WASM/C++ path from browser viewport/DPR through engine dimensions, projection and final render target/view window. Keep issue #34 open until physical-device confirmation.

**Regression requirement:** Observatory evidence must expose engine-owned viewport/render-target dimensions and identity, not DOM labels alone.

## Failure lesson: DOM weapon label is not weapon-state proof

A shell-side weapon label or button event cannot prove the engine changed weapons. The diagnostic must observe engine-owned weapon state and the transition timing/state gate. Until Observatory exposes that state, report the behavior as unresolved rather than inferred.

## World Server teaching bridge

Extraction rule: Krieger source concept -> verified general principle -> clean World Server API/module -> style-independent use cases -> tests/performance/license constraints. Do not copy scene-specific protected design/assets. Capability Registry is updated only after runtime evidence.

See:
- `docs/KKRIEGER_WASM_INTEGRATION.md` for build/provenance foundation
- `docs/kkrieger/knowledge-index.json` for machine-readable entries
- `docs/kkrieger/AI_HANDOFF.md` for compact agent onboarding
- `docs/kkrieger/playbooks/` for reproducible operations
