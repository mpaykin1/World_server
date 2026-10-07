# KRIEGER Total Control — Evidence Summary

Canonical source: `data/krieger-total-control-evidence-ledger.json`.

METRIC — **krieger-total-control/v2-three-chain-100**
POLICY — **krieger-control-proof/v2-owner-verdict-separated**
KRIEGER MASTER — **39.33%**
KRIEGER CANDIDATE — **39.33%**

Only objective CONTROL_PROVEN weight contributes to K. Owner SUCCESS/FAILURE is a separate owner-only product verdict and never gates technical CONTROL_PROVEN.

Weights: render 40, gameplay 25, native authoring 35; normalized total 100.

Master baseline: `14a942c635a2891ff29cbeeba6cc9406d8347516`
Evidence branch base: `14a942c635a2891ff29cbeeba6cc9406d8347516`
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
PR: #484

## Current candidate

- Branch: `ai/chatgpt/krieger-tail-closure-20261007`
- Owner verdict: **UNSET**
- State: **TAIL_CLOSURE_INTEGRATION_PENDING_EXACT_HEAD_CI**
- Exact-head browser proof: **Historical source proofs PASS; exact PR #484 head revalidation pending.**
- Exact-head process-tree proof: **Run Supervisor tree-containment repair is already in master; exact PR #484 CI/runtime revalidation pending.**

## Render chain

| Node | MASTER | CANDIDATE | Evidence summary |
| --- | --- | --- | --- |
| DATA | TESTED | TESTED | Pinned target KX class table and runtime data are measured; exact pinned native authoring emits, attaches and losslessly reparses authored KX, with exact-head capability-OFF/A-A WebGL causality. |
| GENERATOR | CONTROL_PROVEN | CONTROL_PROVEN | Exact pinned upstream class resolution and native Cube/Bevel/Scene emission; authored GameRecipe scale reaches root 2 and passes capability-OFF/A-A WebGL framebuffer causality (mean delta 1.190247, A/A 0.169386, ratio 7.03). |
| RUNTIME | CONTROL_PROVEN | CONTROL_PROVEN | Native Scene_Transform control produced a human-visible location change on physical iPhone. |
| CPU | TESTED | TESTED | Native renderer.frame paint-job telemetry exists and is regression-tested. |
| GPU | TESTED | TESTED | Native gpu.frame/gpu.draw telemetry reaches WebGL draws. |
| VERTEX/INDEX BUFFERS | CONTROL_PROVEN | CONTROL_PROVEN | Exact-head Browser/WebGL A/B/A proof at 9e43626447a72f0a76e2fd5adc89b3f185abfb73 causally increased native EngMesh topology from 558800/1615188 meshVertices/indexRefs to 558870/1615464 and restored exactly. |
| NORMALS | TESTED | TESTED | Source exact-SHA Browser/WebGL A/B/A proof at 8f3f24d070af63d27538a1c38b699c8f3c5d7ab1 (run 37416924362) inverted the real EngMesh normal stream, changed its native hash and framebuffer beyond A/A noise, and restored the native hash exactly. Clean integration exact-head revalidation is pending. |
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
| INPUT | TESTED | TESTED | Source exact-SHA damage VNO at b08da990f221ab0450dfca960b25c74bd7f5f42a proved irrelevant q and causal k both reach the native SDL KeyBuffer; q preserves Life and k reaches the Hit path. START/USE product reliability remains a separate control tail. Clean integration exact-head revalidation is pending. |
| CONTROL | PARTIAL | PARTIAL | Browser/WASM control bridge is mapped; START and USE have unresolved physical-device failures. |
| CAMERA | TESTED | TESTED | Swipe-to-look works on physical iPhone and camera state is source-mapped; no separate arbitrary-camera control proof package. |
| COLLISION | PARTIAL | PARTIAL | SetScene/SetSceneR/AddMesh/CellConnect path is mapped; collision after large authored edits is not proven. |
| WEAPON | TESTED | TESTED | FIRE reaches KKriegerGame::FireShot and ammo 100->99; reliable USE weapon switching remains open. |
| DAMAGE | PARTIAL | PARTIAL | Source exact-SHA Browser→native damage VNO at b08da990f221ab0450dfca960b25c74bd7f5f42a (run 37447495619) proved q negative control, k→Hit(10), Life 16100→16090 and exact fresh-run restoration to 16100. Clean integration exact-head revalidation is pending. |
| PARTICLES/AUDIO | PARTIAL | PARTIAL | Particle and V2 audio paths are source-anchored; isolated visible/audible controlled fixture is not proven. |
| EVENT | PARTIAL | PARTIAL | KLogic/event and weapon-event paths are mapped; arbitrary event authoring/execution proof is incomplete. |
| AI | PARTIAL | PARTIAL | MonsterAI and live monster states are observable; controlled behavior mutation is not proven. |

## Native Authoring chain

| Node | MASTER | CANDIDATE | Evidence summary |
| --- | --- | --- | --- |
| GAME DESCRIPTION | PARTIAL | PARTIAL | No general natural-language game-description parser has been causally proven through native KX build/runtime. |
| GAME RECIPE | CONTROL_PROVEN | CONTROL_PROVEN | Merged PR #474 changes one GameRecipe tessellation field and proves targeted native KX bytes, Browser/WASM topology change, VNO and exact A/B/A restoration. |
| KRIEGER IR | CONTROL_PROVEN | CONTROL_PROVEN | Merged PR #474 proves a single recipe-field mutation changes exactly the intended semantic IR node while edges and unrelated nodes remain invariant. |
| KX/OPERATOR GRAPH | CONTROL_PROVEN | CONTROL_PROVEN | Merged PR #474 emits real pinned KX operator instances/bytes; the target operator parameter changes while operator IDs/inputs and unrelated bytes remain controlled. |
| DEPENDENCY WIRING | TESTED | TESTED | Compiler emits deterministic graph edges for geometry/material/scene/effect/portal/collision/logic dependencies. |
| PARAMETER BINDING | CONTROL_PROVEN | CONTROL_PROVEN | Merged PR #474 proves GameRecipe tessellate [1,1,1]→[4,3,2] changes exact Mesh_Cube packed bytes and restores them exactly. |
| GEOMETRY | CONTROL_PROVEN | CONTROL_PROVEN | Merged PR #474 crosses GameRecipe tessellation through Mesh_Cube/GenMesh to EngMesh topology; Browser proof increases vertex/index counts and restores exactly. |
| BITMAP/TEXTURE | PARTIAL | PARTIAL | Texture fields exist in recipe/material structures, but native bitmap/texture authoring and runtime causal proof are incomplete. |
| MATERIAL | TESTED | TESTED | Native Material + Mesh_MatLink operators are emitted; isolated recipe-material A/B/A framebuffer proof is still missing. |
| SCENE | TESTED | TESTED | Native Scene operators and root attachment are exercised in the authored Browser/WASM path. |
| ANIMATION | PARTIAL | PARTIAL | No generalized recipe-to-native animation graph compiler has been causally proven. |
| EFFECTS/AUDIO | PARTIAL | PARTIAL | PartSystem/PartEmitter/PlaySample operators are source-anchored, but recipe-to-runtime A/B/A proof is missing. |
| GAMEPLAY GRAPH | PARTIAL | PARTIAL | Weapon/AI runtime bindings are represented, but generalized serialized native gameplay graph synthesis is incomplete. |
| SERIALIZATION | CONTROL_PROVEN | CONTROL_PROVEN | Merged PR #474 proves exact emitted native KX bytes remain losslessly reparsable across baseline/mutation/restoration. |
| BUILD/WASM | CONTROL_PROVEN | CONTROL_PROVEN | Merged PR #474 rebuilds pinned upstream for A/B/A KX variants under bounded CI and the mutation reaches the official Browser/WebGL artifact. |
| RUN | CONTROL_PROVEN | CONTROL_PROVEN | Merged PR #474 runs baseline/mutated/restored native KX variants in real Chromium/WebGL and observes the causal topology effect. |
| VALIDATION | TESTED | TESTED | Fail-closed validators, exact-SHA workflows, A/A controls and artifact checks exist for the current vertical slice. |

## Proven weight

MASTER CONTROL_PROVEN: GENERATOR, RUNTIME, VERTEX/INDEX BUFFERS, LOCAL LIGHT, SHADOW/VISIBILITY, POST, VIEWPORT, CANVAS, GAME RECIPE, KRIEGER IR, KX/OPERATOR GRAPH, PARAMETER BINDING, GEOMETRY, SERIALIZATION, BUILD/WASM, RUN.

CANDIDATE CONTROL_PROVEN: GENERATOR, RUNTIME, VERTEX/INDEX BUFFERS, LOCAL LIGHT, SHADOW/VISIBILITY, POST, VIEWPORT, CANVAS, GAME RECIPE, KRIEGER IR, KX/OPERATOR GRAPH, PARAMETER BINDING, GEOMETRY, SERIALIZATION, BUILD/WASM, RUN.

MASTER proven weight: **39.33/100**.
CANDIDATE proven weight: **39.33/100**.

Metric/policy migrations are score-neutral for session delta: baseline and current must be recomputed with the same metric version.

