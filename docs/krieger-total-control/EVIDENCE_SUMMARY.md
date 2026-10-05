# KRIEGER Total Control — Evidence Summary

Canonical source: `data/krieger-total-control-evidence-ledger.json`.

K = **17.39%** (4/23 equally weighted requested nodes are CONTROL_PROVEN).

Scoring is deliberately fail-closed: PARTIAL and TESTED do not add to K; only CONTROL_PROVEN does.

Master baseline: `57f9861272238204be9829833e006bd3d1346fa3`
Evidence branch base: `2da7449a323472886b5747fa00a0241bef6059a7`
Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
PR: #441

## Graphics chain

| Node | Status | Evidence summary |
| --- | --- | --- |
| DATA | TESTED | Pinned KX graph and runtime data.document are measured; no arbitrary write/round-trip yet. |
| GENERATOR | PARTIAL | Generator symbols and operator provenance are mapped, but arbitrary native .kx emission is not proven. |
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

