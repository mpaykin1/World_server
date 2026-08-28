# systems/gs360 — V6

Core commands:
- `node run.cjs ...`
- `node autopilot.cjs ...`
- `node consistency.cjs --output <out>`
- `node splat-optimizer.cjs --output <out> --target spz`
- `node trainer-runner.cjs --output <out> --resume`
- `node resource-advisor.cjs <server-root>`
- `node doctor.cjs <server-root> --repair`

V6 guarantees:
- stale resume is invalidated if input/config fingerprint changes;
- ONNX/OpenVINO depth model setup is cached per job;
- original PLY is preserved when delivery optimization runs;
- compressed variants do not become active unless explicitly requested;
- preview is never mislabeled as trained 3DGS.
