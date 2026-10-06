# KRIEGER Total Control — Evidence Summary

Canonical source: `data/krieger-total-control-evidence-ledger.json`.

K = **17.39%** (4/23 equally weighted requested nodes are CONTROL_PROVEN).

Scoring is deliberately fail-closed: PARTIAL and TESTED do not add to K; only CONTROL_PROVEN does.

Master baseline: `d73b367b1ae216faccbe25cf997b9b99477a4617`
Evidence branch base: `d73b367b1ae216faccbe25cf997b9b99477a4617`
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
PR: #477

## Current candidate

- Branch: `ai/chatgpt/krieger-damage-causality-20261006`
- Follow-up base head: `d73b367b1ae216faccbe25cf997b9b99477a4617`
- State: **DAMAGE_CAUSALITY_TESTED_PENDING_OWNER_VERDICT_UNSET**
- Owner verdict: **UNSET**
- Exact-head browser proof: **b08da990_RUN_37447495619_PASS_NATIVE_Q_K_TELEMETRY_DAMAGE_10_RESTORATION_EXACT**
- Exact-head process-tree proof: **b08da990_ALL_EIGHT_EXACT_HEAD_WORKFLOWS_PASS_PR_477**

## Graphics chain

| Node | Status | Evidence summary |
| --- | --- | --- |
| DATA | TESTED | Pinned target KX class table and runtime data are measured; exact pinned native authoring emits, attaches and losslessly reparses authored KX, with exact-head capability-OFF/A-A WebGL causality. |
| GENERATOR | TESTED | Exact pinned upstream class resolution and native Cube/Bevel/Scene emission; authored GameRecipe scale reaches root 2 and passes capability-OFF/A-A WebGL framebuffer causality (mean delta 1.190247, A/A 0.169386, ratio 7.03). Owner PASS is still required for CONTROL_PROVEN. |
| RUNTIME | CONTROL_PROVEN | Native Scene_Transform control produced a human-visible location change on physical iPhone. |
| CPU | TESTED | Native renderer.frame paint-job telemetry exists and is regression-tested. |
| GPU | TESTED | Native gpu.frame/gpu.draw telemetry reaches WebGL draws. |
| VERTEX/INDEX BUFFERS | TESTED | Exact-head Browser/WebGL A/B/A proof at 9e43626447a72f0a76e2fd5adc89b3f185abfb73 causally increased native EngMesh topology from 558800/1615188 meshVertices/indexRefs to 558870/1615464 and restored exactly. Owner PASS is still required for CONTROL_PROVEN. |
| NORMALS | PARTIAL | Normal/tangent streams and shader use are source-mapped; isolated normal ablation is not proven. |
| SHADER/MATERIAL | TESTED | Material passes and KDoc provenance are observable; no owner-approved arbitrary material authoring claim. |
| LOCAL LIGHT | TESTED | Exact-SHA native frozen-time framebuffer VNO passed at 2da7449a323472886b5747fa00a0241bef6059a7: zero baseline noise; no-local-light changed 31.577348% of pixels (meanAbs 6.856152); restoration delta returned to zero. |
| SHADOW/VISIBILITY | TESTED | Portal visibility is observable and exact-SHA native shadow ablation passed at 2da7449a323472886b5747fa00a0241bef6059a7: zero baseline noise; no-shadows changed 5.254587% of pixels (meanAbs 1.129803); restoration delta returned to zero. |
| FRAMEBUFFER | TESTED | Native location rebuild has automated changed-pixel proof and public exact-byte verification. |
| POST | CONTROL_PROVEN | Portrait fix changed native full-size postprocess target policy and was user-confirmed on physical iPhone. |
| VIEWPORT | CONTROL_PROVEN | Native master viewport/projection fix is measured and user-confirmed on physical iPhone. |
| CANVAS | CONTROL_PROVEN | Physical-iPhone proof reached 100% textured scene height coverage on the real canvas/backbuffer chain. |

## Gameplay chain

| Node | Status | Evidence summary |
| --- | --- | --- |
| INPUT | TESTED | Real mobile walking/FIRE/swipe input reaches the game, but START remains intermittently unreliable. |
| CONTROL | PARTIAL | Browser/WASM control bridge is mapped; START and USE have unresolved physical-device failures. |
| CAMERA | TESTED | Swipe-to-look works on physical iPhone and camera state is source-mapped; no separate arbitrary-camera control proof package. |
| COLLISION | PARTIAL | SetScene/SetSceneR/AddMesh/CellConnect path is mapped; collision after large authored edits is not proven. |
| WEAPON | TESTED | FIRE reaches KKriegerGame::FireShot and ammo 100->99; reliable USE weapon switching remains open. |
| DAMAGE | TESTED | Exact-head Browser/WASM A/N/B/A2 proof at b08da990f221ab0450dfca960b25c74bd7f5f42a routed q and k through the native SDL KeyBuffer; q preserved Player.Life=16100, k reached KKriegerGame::OnKey and Player.Hit(10) to produce 16090, and a fresh A2 restored 16100 exactly. Owner PASS is still required for CONTROL_PROVEN. |
| PARTICLES/AUDIO | PARTIAL | Particle and V2 audio paths are source-anchored; isolated visible/audible controlled fixture is not proven. |
| EVENT | PARTIAL | KLogic/event and weapon-event paths are mapped; arbitrary event authoring/execution proof is incomplete. |
| AI | PARTIAL | MonsterAI and live monster states are observable; controlled behavior mutation is not proven. |

## Proven weight

CONTROL_PROVEN nodes: RUNTIME, POST, VIEWPORT, CANVAS.

Proven weight: **17.39/100**.

TESTED nodes do not increase K. Promotion to CONTROL_PROVEN requires explicit owner PASS under the project decision rule.
