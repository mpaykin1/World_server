# KRIEGER Total Control — Evidence Summary

Canonical source: `data/krieger-total-control-evidence-ledger.json`.

K = **17.39%** (4/23 equally weighted requested nodes are CONTROL_PROVEN).

Scoring is deliberately fail-closed: PARTIAL and TESTED do not add to K; only CONTROL_PROVEN does.

Master baseline: `9fe9ec71b8ea08d4d0a0c8a896868d55758de9f0`
Evidence branch base: `9fe9ec71b8ea08d4d0a0c8a896868d55758de9f0`
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
PR: #472

## Current candidate

- Branch: `ai/chatgpt/krieger-max-deltak-20261005`
- Follow-up base head: `9fe9ec71b8ea08d4d0a0c8a896868d55758de9f0`
- State: **NATIVE_CAUSAL_BROWSER_WASM_QUALITY_LOCK_FLEET_PRE_PASS_CI_PENDING**
- Owner verdict: **UNSET**
- Exact-head browser proof: **b4efd5fa_EXACT_HEAD_PASS_AA_0.180461_AUTHORED_1.192580_RATIO_6.61_ARTIFACT_11367965774**
- Exact-head process-tree proof: **918fcc15_EXACT_HEAD_CI_QUALITY_LOCK_PASS_LOCAL_DESCENDANT_REGRESSIONS_8_OF_8**

## Graphics chain

| Node | Status | Evidence summary |
| --- | --- | --- |
| DATA | TESTED | Pinned target KX class table and runtime data are measured; exact pinned native authoring emits, attaches and losslessly reparses authored KX, with exact-head capability-OFF/A-A WebGL causality. |
| GENERATOR | TESTED | Exact pinned upstream class resolution and native Cube/Bevel/Scene emission; authored GameRecipe scale reaches root 2 and passes capability-OFF/A-A WebGL framebuffer causality (mean delta 1.192580, A/A 0.180461, ratio 6.61). Owner PASS is still required for CONTROL_PROVEN. |
| RUNTIME | CONTROL_PROVEN | Native Scene_Transform control produced a human-visible location change on physical iPhone. |
| CPU | TESTED | Native renderer.frame paint-job telemetry exists and is regression-tested. |
| GPU | TESTED | Native gpu.frame/gpu.draw telemetry reaches WebGL draws. |
| VERTEX/INDEX BUFFERS | PARTIAL | Buffer creation/counts are source-mapped and observable, but isolated controlled buffer mutation is not proven. |
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
| DAMAGE | PARTIAL | HP/game-state structures are observable; isolated damage-control fixture is not proven. |
| PARTICLES/AUDIO | PARTIAL | Particle and V2 audio paths are source-anchored; isolated visible/audible controlled fixture is not proven. |
| EVENT | PARTIAL | KLogic/event and weapon-event paths are mapped; arbitrary event authoring/execution proof is incomplete. |
| AI | PARTIAL | MonsterAI and live monster states are observable; controlled behavior mutation is not proven. |

## Proven weight

CONTROL_PROVEN nodes: RUNTIME, POST, VIEWPORT, CANVAS.

Proven weight: **17.39/100**.

TESTED nodes do not increase K. Promotion to CONTROL_PROVEN requires explicit owner PASS under the project decision rule.
