# Krieger AI Handoff

Read this before modifying Krieger.

## Canonical sources
- pinned upstream: MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242
- World Server bridge: PR #355 lineage
- detailed KB: docs/kkrieger/KNOWLEDGE_BASE.md
- machine index: docs/kkrieger/knowledge-index.json
- integration/build: docs/KKRIEGER_WASM_INTEGRATION.md

## Critical invariants
- Evidence beats agent consensus.
- DOM/UI state is not proof of engine-owned game/render state.
- Physical-iPhone issue #34 stays open until user confirmation.
- Preserve good landscape graphics/controls and permanent playable route.
- No paid API/GPU without explicit permission.
- Do not copy protected game assets/design; preserve exact license/provenance.
- Knowledge is SHA-bound; affected entries become NEEDS_REVERIFY after source changes.

## Current unknowns / next diagnostic
Highest-value unknown is the real engine state boundary for weapon switching, START/game state, and portrait final viewport/render target. Add read-only Emscripten Observatory instrumentation before behavior changes.

## Evidence status vocabulary
FOUND / TESTED / INTEGRATED / LIVE_VERIFIED / BLOCKED / PROTOTYPE / NEEDS_REVERIFY.

## Before claiming success
Record exact SHA, file/symbol/call-flow, test/trace/capture, limitations, and update KB/index. If repeatable, update/create a playbook. Another agent should be able to reproduce from these docs without hidden chat context.
