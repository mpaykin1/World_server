# APNG Quality System v3.0

## Purpose
Production APNG validation, deterministic decode/composite, visual defect detection, conservative repair, codec normalization, browser compatibility verification and repository regression prevention for `World_server`.

## Pipeline
`validate -> structural/resource guard -> 8/16-bit + Adam7 decode -> APNG composite -> pixel/edge/motion/timeline QA -> policy-aware confidence repair -> transparent-RGB sanitize -> full-frame RGBA8 normalize -> decode again -> exact pixel/timeline verify -> repository/release/browser CI gates`

## Implemented in v3
- strict `acTL/fcTL/fdAT` ordering and sequence validation;
- CRC/truncation/trailing-data fail-closed handling;
- frame/pixel/decode/output resource guards;
- 8-bit and 16-bit byte-aligned grayscale/truecolor/GA/RGBA decoding;
- Adam7 interlace decoding, including 16-bit + Adam7 combination;
- 8-bit palette + `tRNS`; grayscale/truecolor `tRNS` handling;
- exact blend/dispose APNG reconstruction;
- brightness, color and alpha-collapse detection;
- anchor drift + coarse translation/motion reversal analysis;
- alpha-edge, hidden-RGB and fringe-risk diagnostics;
- duplicate-frame, delay-jitter, loop-seam and codec-risk diagnostics;
- confidence-gated temporal repair;
- safe RGB cleanup only when alpha is exactly zero;
- full-frame RGBA8 / `dispose=NONE` / `blend=SOURCE` normalization;
- frame count, play count and exact total duration verification;
- exact decode-after-repair pixel-target verification;
- deterministic/idempotent codec normalization;
- atomic repository replacement + rollback;
- explicit policy for intentional effects via `apng-quality.config.json`;
- health/analyze/repair API and APNG Lab;
- repository quality report with average score and accepted intentional issues;
- integration into existing `release:gate`;
- `APNG_QUALITY_REPORT.json` is attached to central `QUALITY_MASTER_REPORT.json` as `apngQuality`;
- scheduled repair PR, never direct writes to `master`;
- Chromium + Firefox + WebKit native playback CI gate;
- 26 automated Node regression tests + seeded 25-case roundtrip corpus + 80 mutation-fuzz cases.

## Detected visual/codec issues
### Error-level
- `APNG_FRAME_COUNT_MISMATCH`
- `APNG_BRIGHTNESS_FLASH`
- `APNG_COLOR_FLASH`
- `APNG_ALPHA_COLLAPSE`

### Warning/diagnostic
- `APNG_ANCHOR_DRIFT`
- `APNG_MOTION_REVERSAL_SPIKE`
- `APNG_ALPHA_HALO_RISK`
- `APNG_EDGE_POP`
- `APNG_SUSPICIOUS_DELAY`
- `APNG_DELAY_JITTER`
- `APNG_DUPLICATE_FRAME`
- `APNG_LOOP_SEAM`
- `APNG_CODEC_FLICKER_RISK`

Structural corruption (CRC, sequence, bounds, unsafe budgets, invalid chunk ordering) fails before visual repair.

## Repair guarantees
1. Source animation is first reconstructed using real APNG blend/dispose semantics.
2. No upscale, blur, smoothing, palette reduction or lossy image simplification is introduced.
3. Temporal replacement is high-confidence and policy-aware.
4. Hidden RGB cleanup changes only RGB where alpha is exactly zero.
5. Output uses full-canvas RGBA8 SOURCE/NONE frames to remove decoder-specific disposal flicker.
6. Frame count, loop count and timeline must match.
7. Generated output is decoded again and must exactly equal the chosen repair target.
8. Any remaining error-level issue rejects the repair.

## Intentional-effect policy
`apng-quality.config.json` supports scoped rules by path glob. Intentional visual codes may be accepted explicitly; structural failures cannot be suppressed. Accepted issues remain visible in `APNG_QUALITY_REPORT.json`.

## API
- `GET /api/apng?action=health`
- `POST /api/apng?action=analyze`
- `POST /api/apng?action=repair&temporal=1&confidence=0.94&sanitize=1`

Repair response contains:
- `X-APNG-Verified: 1`
- `X-APNG-Quality-Score`
- `X-APNG-Repair` compact base64url report.

## npm integration
- `npm run apng:test`
- `npm run apng:check`
- `npm run apng:fix`
- `npm run apng:verify`
- `npm run apng:browser`

`release:gate` is extended idempotently with `npm run apng:check`.

## Remaining roadmap toward true 100%
Not claimed as implemented:
- incremental streaming decode/encode so huge APNGs do not require complete displayed-frame retention;
- worker-thread pool for parallel very-large repository corpora;
- independent native libpng decoder differential in addition to Node + browser playback;
- per-frame Chromium/Firefox/WebKit screenshot comparison using perceptual metrics, not only native decode + frame advancement;
- dense optical flow and semantic body/hand/weapon anchor tracking for character animations;
- automatic learning of approved per-character motion/flash baselines from golden assets;
- long-running real-device Safari/Chrome mobile soak tests;
- continuous large mutation/fuzz corpus in CI with retained crash seeds.
