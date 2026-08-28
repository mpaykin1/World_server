# WORLD_SERVER_3DGS_360_CPU_QUALITY_V6

CPU-first autonomous GS360 patch for the existing `World_server`.

## V6 adds
- input/config fingerprint so stale resume cannot reuse the wrong generation;
- cached ONNX Runtime depth sessions;
- cached OpenVINO compiled depth model + persistent OpenVINO model cache;
- synthetic-view consistency gate;
- OpenSplat checkpoint/resume preservation;
- safe PlayCanvas SplatTransform adapter;
- SPZ / SOG / LOD / HTML delivery variants;
- NaN/Inf cleanup into a copy with rollback to master PLY;
- updated open-source/license/resource plan;
- existing V5 Autopilot, ETA, CPU/GPU routing, queue/DLQ, artifact audit, capture coach, quality gate, timer/retry and doctor.

## Install
```bat
node install-gs360-cpu-quality-v6.cjs C:\Users\user\Desktop\World_server
```
Then follow `DESKTOP_AI_INSTRUCTIONS.md`.
