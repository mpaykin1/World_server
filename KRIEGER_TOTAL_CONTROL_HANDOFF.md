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

Pinned donor: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

## What is solved at this layer

A World Server semantic recipe can be compiled deterministically into a source-anchored Krieger operator plan for geometry, materials, scenes, effects, weapons, creatures/AI, collision, triggers and audio. Unsupported or dangling semantics fail closed.

## What is NOT solved yet

Do not claim arbitrary native `.kx` generation yet. The compiler intentionally reports `emitsNativeKxBinary:false`. The next highest-value task is an exact pinned-source operator resolver/serializer that maps symbolic plan nodes to real command IDs/data layouts and proves binary round-trip on real Krieger documents.

## User-decision rule

Implementation commits may proceed normally. Do not record a user SUCCESS or FAILURE analysis for an MVP until the owner explicitly gives PASS/FAIL.
