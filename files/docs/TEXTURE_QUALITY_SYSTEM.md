# World Server Texture Quality System V9

V9 — non-destructive texture/material quality pipeline с V1–V8 совместимостью. Он объединяет quality enhancement, PBR/atlas/cache, runtime budgets, semantic saliency, telemetry learning, thermal/OOM/thrash protection, signed delivery, temporal motion validation и staged promotion.

## Новое в V9
- temporal shimmer/flicker motion gate;
- multi-host lease queue с idempotency/heartbeat/fencing/dead-letter;
- bounded shader prewarming;
- persistent bounded route prefetch learning;
- atomic signed content-addressed CDN publisher;
- canonical tile/trim persistent library;
- physical device-lab orchestration/result store;
- executable unified governor adapters;
- cohort distribution drift detector;
- immutable signed promotion ledger.

## Safety model
Ни одна learned/candidate система не может напрямую переписать production. Promotion разрешается только через tests + render/runtime/temporal/device/soak/cohort gates + staged canary. `UNVERIFIED` и `INSUFFICIENT_DATA` не являются PASS. Originals сохраняются; installer имеет byte/tree rollback manifest.

## Честные ограничения
V9 не утверждает hardware sparse residency там, где движок её не предоставляет; не считает synthetic device probe реальным device-lab; не считает still-image render-back temporal shimmer test; не считает local publisher фактическим R2 upload без настроенного remote backend; не считает emitted unified-governor action применённым до подтверждения engine adapter.

## V10 — managed delivery, causal diagnosis and reproducible promotion

V10 keeps every V1–V9 protection and adds twelve production-oriented layers:

1. Managed queue abstraction for Postgres/Redis/managed HTTP endpoints with explicit fencing/idempotency requirements.
2. Verified R2/S3-compatible publisher with post-upload SHA verification before pointer promotion.
3. Motion-compensated temporal comparator for shimmer/mip/moire regressions.
4. Shader/frame hitch telemetry and hot-variant analysis.
5. Persistent second-order bounded route-prefetch model.
6. Cross-project material provenance graph.
7. Trusted remote physical-device executor orchestration.
8. Frame-graph causal-hint profiler across texture/shader/mesh/light/shadow/particle/animation events.
9. Candidate-only automatic regression bisect.
10. Global discrete scene-quality optimization under frame/VRAM/network hard budgets.
11. Long-horizon VRAM/thrash/thermal risk forecast that may block canary before observed failure.
12. HMAC-SHA256 reproducible-build attestations binding artifact hashes to code/toolchain inputs.

Truthfulness rule: unavailable drivers, missing secrets, missing physical devices, insufficient motion samples, or unconfigured remote endpoints remain BLOCKED/PENDING. They are never converted to PASS by static plans.

V10 optimizer output is `schemaVersion: 10`, health reports `textureOptimizer.version=10.0.0`, and the local package regression suite is expected to report `180/180 PASS`.
