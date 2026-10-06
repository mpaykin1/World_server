# KRIEGER Total Control — Evidence Summary

Canonical source: `data/krieger-total-control-evidence-ledger.json`.

METRIC — **krieger-total-control/v2-three-chain-100**
POLICY — **krieger-control-proof/v2-owner-verdict-separated**
KRIEGER MASTER — **22.86%**
KRIEGER CANDIDATE — **28.49%**

Only objective CONTROL_PROVEN weight contributes to K. Owner SUCCESS/FAILURE is a separate owner-only product verdict and never gates technical CONTROL_PROVEN.

Weights: render 40, gameplay 25, native authoring 35; normalized total 100.

Master baseline: `d73b367b1ae216faccbe25cf997b9b99477a4617`
Evidence branch base: `d73b367b1ae216faccbe25cf997b9b99477a4617`
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
PR: #476

## Current candidate

- Branch: `ai/chatgpt/krieger-normal-causality-20261006`
- Owner verdict: **UNSET**
- State: **METRIC_V2_MIGRATION_WITH_NORMALS_AND_DAMAGE_TECHNICAL_CONTROL_PROVEN**
- Exact-head browser proof: **PR476 run 37416924362 PASS; PR477 damage run 37447495619 PASS**
- Exact-head process-tree proof: **PR476 all nine exact-head workflows PASS; PR477 exact-head damage/CI/Fleet/quality/science/deploy workflows PASS**

## Render chain

| Node | MASTER | CANDIDATE | Evidence summary |
| --- | --- | --- | --- |
| DATA | TESTED | TESTED | Pinned target KX class table and runtime data are measured; exact pinned native authoring emits, attaches and losslessly reparses authored KX, with exact-head capability-OFF/A-A WebGL causality. |
| GENERATOR | CONTROL_PROVEN | CONTROL_PROVEN | Exact pinned upstream class resolution and native Cube/Bevel/Scene emission; authored GameRecipe scale reaches root 2 and passes capability-OFF/A-A WebGL framebuffer causality (mean delta 1.190247, A/A 0.169386, ratio 7.03). |
| RUNTIME | CONTROL_PROVEN | CONTROL_PROVEN | Native Scene_Transform control produced a human-visible location change on physical iPhone. |
| CPU | TESTED | TESTED | Native renderer.frame paint-job telemetry exists and is regression-tested. |
| GPU | TESTED | TESTED | Native gpu.frame/gpu.draw telemetry reaches WebGL draws. |
| VERTEX/INDEX BUFFERS | CONTROL_PROVEN | CONTROL_PROVEN | Exact-head Browser/WebGL A/B/A proof at 9e43626447a72f0a76e2fd5adc89b3f185abfb73 causally increased native EngMesh topology from 558800/1615188 meshVertices/indexRefs to 558870/1615464 and restored exactly. |
| NORMALS | TESTED | CONTROL_PROVEN | Exact-head Browser/WebGL A/B/A proof at dc89fe159ee86a9b6c2683bcb67d499d7c0811ed inverted the real EngMesh normal stream, changed its native hash and framebuffer beyond A/A noise, and restored the native hash exactly. |
| SHADER/MATERIAL | TESTED | TESTED | Material passes and KDoc provenance are observable; no arbitrary-material causal runtime proof. |
| LOCAL LIGHT | CONTROL_PROVEN | CONTROL_PROVEN | Exact-SHA native frozen-time framebuffer VNO passed at 2da7449a323472886b5747fa00a0241bef6059a7: zero baseline noise; no-local-light changed 31.577348% of pixels (meanAbs 6.856152); restoration delta returned to zero. |
| SHADOW/VISIBILITY | CONTROL_PROVEN | CONTROL_PROVEN | Portal visibility is observable and exact-SHA native shadow ablation passed at 2da7449a323472886b5747fa00a0241bef6059a7: zero baseline noise; no-shadows changed 5.254587% of pixels (meanAbs 1.129803); restoration delta returned to zero. |
| FRAMEBUFFER | TESTED | TESTED | Native location rebuild has automated changed-pixel proof and public exact-byte verification. |
| POST | CONTROL_PROVEN | CONTROL_PROVEN | Portrait fix changed native full-size postprocess target policy and was user-confirmed on physical iPhone. |
| VIEWPORT | CONTROL_PROVEN | CONTROL_PROVEN | Native master viewport/projection fix is measured and user-confirmed on physical iPhone. |
| CANVAS | CONTROL_PROVEN | CONTROL_PROVEN | Physical-iPhone proof reached 100% textured scene height coverage on the real canvas/backbuffer chain. |

## Gameplay chain

| Node | MASTER | CANDIDATE | Evidence summary |
| --- | --- | --- | --- |
| INPUT | TESTED | TESTED | Real mobile walking/FIRE/swipe input reaches the game, but START remains intermittently unreliable. |
| CONTROL | PARTIAL | PARTIAL | Browser/WASM control bridge is mapped; START and USE have unresolved physical-device failures. |
| CAMERA | TESTED | TESTED | Swipe-to-look works on physical iPhone and camera state is source-mapped; no separate arbitrary-camera control proof package. |
| COLLISION | PARTIAL | PARTIAL | SetScene/SetSceneR/AddMesh/CellConnect path is mapped; collision after large authored edits is not proven. |
| WEAPON | TESTED | TESTED | FIRE reaches KKriegerGame::FireShot and ammo 100->99; reliable USE weapon switching remains open. |
| DAMAGE | PARTIAL | CONTROL_PROVEN | HP/game-state structures are observable; isolated damage-control fixture is not proven. |
| PARTICLES/AUDIO | PARTIAL | PARTIAL | Particle and V2 audio paths are source-anchored; isolated visible/audible controlled fixture is not proven. |
| EVENT | PARTIAL | PARTIAL | KLogic/event and weapon-event paths are mapped; arbitrary event authoring/execution proof is incomplete. |
| AI | PARTIAL | PARTIAL | MonsterAI and live monster states are observable; controlled behavior mutation is not proven. |

## Native Authoring chain

| Node | MASTER | CANDIDATE | Evidence summary |
| --- | --- | --- | --- |
| GAME DESCRIPTION | PARTIAL | PARTIAL | No general natural-language game-description parser has been causally proven through native KX build/runtime. |
| GAME RECIPE | TESTED | TESTED | Deterministic bounded GameRecipe schema is compiled and round-tripped with fail-closed validation. |
| KRIEGER IR | TESTED | TESTED | Source-anchored native authoring plan/IR is deterministic and validated, but whole-chain generalized native runtime control is not yet proven. |
| KX/OPERATOR GRAPH | TESTED | TESTED | Real pinned KX operator IDs/classes are emitted and applied; generalized no-manual graph synthesis remains unproven. |
| DEPENDENCY WIRING | TESTED | TESTED | Compiler emits deterministic graph edges for geometry/material/scene/effect/portal/collision/logic dependencies. |
| PARAMETER BINDING | TESTED | TESTED | Recipe scale was causally observed at authored root 2; broader field-by-field round-trip proof is incomplete. |
| GEOMETRY | TESTED | TESTED | Cube/Bevel/native mesh operators are emitted and reach the Browser/WebGL authored scene. |
| BITMAP/TEXTURE | PARTIAL | PARTIAL | Texture fields exist in recipe/material structures, but native bitmap/texture authoring and runtime causal proof are incomplete. |
| MATERIAL | TESTED | TESTED | Native Material + Mesh_MatLink operators are emitted; isolated recipe-material A/B/A framebuffer proof is still missing. |
| SCENE | TESTED | TESTED | Native Scene operators and root attachment are exercised in the authored Browser/WASM path. |
| ANIMATION | PARTIAL | PARTIAL | No generalized recipe-to-native animation graph compiler has been causally proven. |
| EFFECTS/AUDIO | PARTIAL | PARTIAL | PartSystem/PartEmitter/PlaySample operators are source-anchored, but recipe-to-runtime A/B/A proof is missing. |
| GAMEPLAY GRAPH | PARTIAL | PARTIAL | Weapon/AI runtime bindings are represented, but generalized serialized native gameplay graph synthesis is incomplete. |
| SERIALIZATION | TESTED | TESTED | Authored KX is losslessly reparsed in exact-head tests; generalized multi-game round-trip remains incomplete. |
| BUILD/WASM | TESTED | TESTED | Pinned native KX/WASM build is automated and bounded under Run Supervisor. |
| RUN | TESTED | TESTED | Authored native result runs in real Chromium/WebGL; generalization across three unseen games is not yet proven. |
| VALIDATION | TESTED | TESTED | Fail-closed validators, exact-SHA workflows, A/A controls and artifact checks exist for the current vertical slice. |

## Proven weight

MASTER CONTROL_PROVEN: GENERATOR, RUNTIME, VERTEX/INDEX BUFFERS, LOCAL LIGHT, SHADOW/VISIBILITY, POST, VIEWPORT, CANVAS.

CANDIDATE CONTROL_PROVEN: GENERATOR, RUNTIME, VERTEX/INDEX BUFFERS, NORMALS, LOCAL LIGHT, SHADOW/VISIBILITY, POST, VIEWPORT, CANVAS, DAMAGE.

MASTER proven weight: **22.86/100**.
CANDIDATE proven weight: **28.49/100**.

Metric/policy migrations are score-neutral for session delta: baseline and current must be recomputed with the same metric version.
