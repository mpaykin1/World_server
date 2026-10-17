# Graphics Motion/FPS experiment — independently executed CI evidence (2026-10-16)

Owner objective: **visual art, animation smoothness, and actual FPS**; new frontend must not depend on copying legacy Supabase history, player saves or AI-learning-memory. User verdict **PENDING**.

## Source and proof

- Branch: `ai/graphics-motion-fps-20261016`; draft [PR #519](https://github.com/mpaykin1/World_server/pull/519).
- Browser CI: [GitHub Actions run 38865474251](https://github.com/mpaykin1/World_server/actions/runs/38865474251) — `success`.
- `node --test games/ostrov-sumerek/test/motion-fps.test.cjs`: **5 passed, 0 failed**.
- Baseline master and candidate built using the exact same `games/ostrov-sumerek/tools/build.py` and Three.js `0.160.0` dependencies.
- Renderer: Chromium **SwiftShader software**, fixed seed 1337, biome `dusk`, prewarmed game state `play`, resolution scale `0.8`, **60 rendered-frame intervals** at each viewport.
- This is **NOT** a physical iPhone 11, hardware GPU, 60 FPS test, independent artistic reference score, or user acceptance.

## Observed frame times (ms)

| Variant | Viewport | Median | p95 | p99 | Observed software FPS |
|---|---|---:|---:|---:|---:|
| master | 960×540 desktop | 550.0 | 1216.6 | 1633.2 | 1.60 |
| candidate | 960×540 desktop | 549.9 | 1066.7 | 1100.0 | 1.94 |
| master | 390×844 mobile-sized viewport | 333.4 | 633.3 | 733.4 | 3.02 |
| candidate | 390×844 mobile-sized viewport | 350.0 | 616.7 | 633.4 | 2.95 |

**Interpretation:** Software rendering is far slower than actual device GPU. In the paired run, p95 was lower for candidate on both viewports, but mobile median worsened and software FPS slightly fell; therefore **NO VERIFIED FPS IMPROVEMENT**. Single-run measurements have high uncertainty; independent repeats + physical iPhone are required. No inventing 85%+ user-noticeability or declaring PASS/FAIL.

## Implementation

- Vertex shader wind (leaf voxels only) uses existing `U.time`; no extra render pass, scene object, CPU timer or draw call. Preserves collision and scene layout. Reduced-motion wind amplitude is smaller.
- FPS feedback uses *actual* wall-clock frame interval, not clamped gameplay dt; ignores background tabs and long resume gaps, with cooldown to prevent jitter.
- CI detects syntax/shader injection/regression, builds old and new versions, captures screenshots and frame measurements. Seven-day Actions screenshots are a **temporary evidence artifact**, not a permanent public testing link.

## Next proof required

1. Independent reviewer compares matched screenshots for moving foliage, sprite readability and reference fidelity; do not mistake shader compilation for artistic quality.
2. Repeat paired tests under controlled real hardware GPU, multiple scenes and seeds with 5+ repetitions; compare median/p95/1%-low and spikes. Especially investigate mobile median regression.
3. Verify iPhone 11 landscape/portrait and touch Game Viewport Lock; mobile sustained FPS and animation smoothness.
4. Integrate built dist through established safe deployment pipeline only when review gates allow. **No production change or cutover from this PR yet**.
5. Owner alone says PASS or FAIL after testing; only then commit analysis/learning classified success/failure.

No extra database, paid provider or sixth scheduled automation was created.
