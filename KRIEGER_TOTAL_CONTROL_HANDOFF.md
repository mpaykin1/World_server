# KRIEGER TOTAL CONTROL — fresh-chat handoff

Canonical program: `docs/krieger-total-control/README.md`.

## Current executable layers

- Knowledge graph: `data/krieger-knowledge-graph.json`
- Capability map: `data/krieger-capability-map.json`
- Labs: `data/krieger-labs.json`
- Runtime Observatory: `tools/krieger-total-control/observatory-core.mjs`
- Native authoring compiler: `tools/krieger-total-control/native-authoring-compiler.mjs`
- CLI: `tools/krieger-total-control/compile-native-authoring.mjs`
- CI: `.github/workflows/krieger-total-control.yml`
- Canonical evidence ledger: `data/krieger-total-control-evidence-ledger.json`
- Committed summary: `docs/krieger-total-control/EVIDENCE_SUMMARY.md`
- Native LightLab: `tools/krieger-total-control/light-lab.mjs`

Pinned donor: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

## What is solved at this layer

A World Server semantic recipe can be compiled deterministically into a source-anchored Krieger operator plan for geometry, materials, scenes, effects, weapons, creatures/AI, collision, triggers and audio. Unsupported or dangling semantics fail closed.

## Latest exact-SHA evidence

Native LightLab passed on `2da7449a323472886b5747fa00a0241bef6059a7` in workflow run `37276552526`.

- frozen native-time baseline noise: 0 changed pixels;
- no-shadows: 5.254587% changed pixels, meanAbs 1.129803;
- no-local-light: 31.577348% changed pixels, meanAbs 6.856152;
- restored normal lighting: framebuffer delta 0.

Therefore `LOCAL LIGHT` and `SHADOW/VISIBILITY` are `TESTED`, not `CONTROL_PROVEN`. The canonical K remains 17.39% until the owner explicitly promotes evidence with PASS.

## What is NOT solved yet

Do not claim arbitrary native `.kx` generation yet. The compiler intentionally reports `emitsNativeKxBinary:false`. The next highest-value task is an exact pinned-source operator resolver/serializer that maps symbolic plan nodes to real command IDs/data layouts and proves binary round-trip on real Krieger documents.

## User-decision rule

Implementation commits may proceed normally. Do not record a user SUCCESS or FAILURE analysis for an MVP until the owner explicitly gives PASS/FAIL.
