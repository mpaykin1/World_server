# Krieger AI Handoff

Read this before modifying Krieger.

## Canonical sources
- pinned upstream: MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242
- World Server bridge: PR #355 lineage
- detailed KB: docs/kkrieger/KNOWLEDGE_BASE.md
- machine index: docs/kkrieger/knowledge-index.json
- integration/build: docs/KKRIEGER_WASM_INTEGRATION.md
- practical diagnostics: docs/kkrieger/playbooks/

## Critical invariants
- Evidence beats agent consensus.
- DOM/UI state is not proof of engine-owned game/render state.
- Physical-iPhone issue #34 stays open until user confirmation.
- Preserve good landscape graphics/controls and permanent playable route.
- No paid API/GPU without explicit permission.
- Do not copy protected game assets/design; preserve exact license/provenance.
- Knowledge is SHA-bound; affected entries become NEEDS_REVERIFY after source changes.
- Never record a hypothesis as VERIFIED knowledge.

## Current unknowns / next diagnostic
Highest-value unknown is the real engine state boundary for weapon switching, START/game state, and portrait final viewport/render target. Add read-only Emscripten Observatory instrumentation before behavior changes.

The Observatory must expose engine-owned evidence, at minimum:
- CurrentWeapon, NextWeapon, WeaponTimer and WeaponEvent presence/identity;
- game/root state sufficient to distinguish browser START UI from real KKrieger game state;
- ConfigX/ConfigY;
- active/final render-target identity and dimensions;
- final view.Window dimensions.

## Knowledge Retention Gate
A bounded Krieger investigation is not complete until it answers all four questions:
1. WHAT DID WE LEARN?
2. WHERE IS IT STORED?
3. HOW IS IT VERIFIED?
4. CAN ANOTHER AI REPRODUCE IT?

Store important verified findings in the KB and machine index. If the finding describes a repeatable operation, create or update a playbook with prerequisites, exact entry points, ordered steps, verification, failure modes, rollback/safety notes, and last verified SHA.

## Teach-back Gate
Periodically give an independent available agent only this handoff + linked KB/playbook, without hidden investigator context. Ask it to reproduce the explanation, diagnostic, or a safe experiment. Compare its answer with the exact source/runtime evidence. Agent consensus is not proof. If reproduction fails, improve the docs before treating the skill as transferable.

## Failure-learning rule
For material failures, especially portrait / USE / START:
symptom → failed approach → why insufficient → measured root cause or remaining unknown → correct diagnostic method → regression test.

Known false proofs that must not return:
- fullscreen DOM canvas does not prove the final 3D viewport/render target is fullscreen;
- a DOM weapon label does not prove Player.CurrentWeapon changed;
- browser START/rAF/log activity does not by itself prove the intended KKrieger game/root state.

## World Server teaching bridge
For each extracted capability record:
Krieger source/concept → general principle → clean World Server API/module → style-independent use cases → example integration → tests/performance constraints → license/provenance.

Do not call a capability broadly INTEGRATED until the adapter and evidence exist.

## Evidence status vocabulary
FOUND / TESTED / INTEGRATED / LIVE_VERIFIED / BLOCKED / PROTOTYPE / NEEDS_REVERIFY.

## Before claiming success
Record exact SHA, file/symbol/call-flow, test/trace/capture, limitations, and update KB/index. If repeatable, update/create a playbook. Another agent should be able to reproduce from these docs without hidden chat context.
