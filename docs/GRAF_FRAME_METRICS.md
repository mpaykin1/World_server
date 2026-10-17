# GRAF Evolution: passive frame evidence

Coordination: [issue #524](https://github.com/mpaykin1/World_server/issues/524). This is Codex's measurement slice. Claude owns [HybridLOD #525](https://github.com/mpaykin1/World_server/pull/525); ChatGPT owns Sunken City. Owner verdict and independent Claude review are pending.

## Applicability and overlap audit

The full standard is [meta6/graf.md](https://github.com/mpaykin1/meta6/blob/main/graf.md), read together with World_server's alias at `9771388`. This module supports the standard's reproducible FPS/frame-time/counter evidence. It does not constitute the hybrid game MVP or change accepted rendering/gameplay.

| Existing work | Reused knowledge / boundary |
|---|---|
| Claude PR #525, `d6b6a2c6ab42e1121cf832e732bca32822967c95` | Screen-space HybridLOD, hysteresis and continuous animation phase. No edits to its module or tests. |
| ChatGPT graf discovery branch, `9771388532fabc4a5ee3c560f9aeedf544a970c1` | Canonical graphics standard. No new standard or scheduler. |
| Island motion/FPS branch, `b58b1ec4b75b1ff8d778378a1bcc779455b800ad` | Preserve the distinction between uncapped wall time and capped simulation dt; no edits to Island shaders, loop or adaptation. |
| `GoldenQualityDirector` / `WorldQualityAutopilot` | Existing quality controllers own DPR, RAF, smoothing and GPU queries. A passive raw collector supplies separate evidence without changing them. |
| `world-runtime-quality-profiler.js` | Existing capability/source audit remains useful; this slice supplies actual runtime samples rather than a capability percentage. |

All existing 2D/2.5D/3D representations, engine, native camera, controls, LOD decisions, palettes and quality budgets are preserved. Priority physical device in graf is iPhone 11; local emulation is not its hardware benchmark.

## API

Browser script: `shared/graphics/frame-metrics.js` → `GRAFFrameMetrics.createFrameMetrics`.
CommonJS: `require('../shared/graphics/frame-metrics.js').createFrameMetrics`.
No runtime dependency, event listener, timer, RAF, DOM, network, renderer patch or quality mutation is installed.

```js
const metrics = GRAFFrameMetrics.createFrameMetrics({ capacity: 240, targetFps: 60 });

// In the EXISTING game loop, after the pipeline renders one complete frame:
metrics.recordFrame(nowMs, frameCounters); // unmodified RAF/performance timestamp, milliseconds

// Read on demand / at low frequency, not in each render pass:
const evidence = metrics.snapshot({ includeSamples: true });

// In the engine's existing pause/visibility/resume handling:
metrics.markDiscontinuity(); // next frame establishes a new timestamp baseline
// For a new scenario/capture:
metrics.reset();
```

- `capacity`: integer 2..36000, default 240. Storage is a fixed ring of five typed arrays; old intervals and their counters are evicted together. No sorting happens in `recordFrame`; snapshots do bounded sorting.
- `targetFps`: finite 1..1000, default 60. It sets a reported jank threshold, not quality or frame pacing.
- `recordFrame(timestampMs,counters?)`: first timestamp (including zero) establishes a baseline and returns false. Each later strictly increasing timestamp records one interval and returns true. Duplicate/backward timestamps return false and keep the baseline; invalid/negative timestamps throw before changing state. Supply no counters if unavailable.
- Counters use Three.js names `{calls,triangles,lines,points}` and must be nonnegative safe integers. Missing/invalid fields remain unknown and are not converted to zero; each counter has independent coverage. The baseline call contributes no counters.
- `snapshot({includeSamples})`: `{schema:'graf-frame-metrics',version:1,capacity,sampleCount,elapsedMs,fps,frameTimeMs,jank,drawCalls,triangles,lines,points,rawSamples?}`. `rawSamples` is chronological and opt-in. Returned values are detached.
- FPS is `sampleCount*1000/elapsedMs`, using the sum of retained intervals. This is active measured time: explicit discontinuities omit hidden pauses. No 50/100/250 ms cap or automatic stall rejection hides a slow visible frame. This is an interval metric, not GPU time or JS execution duration.
- Frame summary: `{mean,p50,p95,p99,min,max}` milliseconds. Percentiles use **nearest rank**, `ceil(p*N)-1`. Jank is strictly above `1.5*1000/targetFps`, with `{thresholdMs,count,ratio}`. Counter summaries: `{sampleCount,mean,p95,max}`. Empty summaries/unknown values are null; elapsed is zero before measurement.
- `markDiscontinuity()` clears only the timestamp baseline; existing evidence remains until evicted/reset. `reset()` clears both window and baseline.

## Full-frame counters and postprocessing

With Three r160's normal `renderer.info.autoReset=true`, `info.render` can describe only the last `renderer.render` call. Reading it after a composer does not prove a whole-frame draw count. The measurement fixture verifies this with a real box rendered twice: 1 call/12 triangles for the final pass versus 2/24 when aggregated.

The **existing pipeline owner** must provide totals across its passes. If it already owns a single frame reset, collect as below; reconcile with any other profiler before changing that policy:

```js
// Pipeline setup, explicitly owned by the main integrator:
renderer.info.autoReset = false;

// In the existing frame (do not add a second loop or renderer wrapper):
renderer.info.reset();
composer.render(dt);
metrics.recordFrame(nowMs, renderer.info.render);
```

Alternatively sum pass counts already exposed by the pipeline and pass that aggregate. This module cannot infer whether a caller supplied the last pass or the whole frame. It copies numeric values immediately, so a subsequent renderer reset does not change captured evidence. GPU timers, texture-memory estimates, automatic quality decisions and HybridLOD remain with the existing owners.

## Local verification and reproduction

Use existing Node and the existing Python Playwright + Chromium environment. No npm/Python/browser installation is required.

```sh
node --test test/graf-frame-metrics.test.js
```

The script uses an intercepted virtual origin and local Three r160 bytes; no web server, external service or outbound page request is created. The fixture is a graphics/counter test, not a new game or playable release.

Pass an existing local r160 ES module. This session reused `/tmp/observer-cdn-cache/28f7db420fe306d98a79d3556bb3a1b5adcd6e6d99ccfa35a26aea3f25c05c1b`; the cache is not a permanent repository dependency. The original pinned dependency is [Three 0.160.0](https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js), upstream MIT. SHA-256: `76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495`. If the file is absent, a single bounded TLS download of those existing dependency bytes is sufficient; do not reinstall tools or packages.

```sh
# Optional only if no local copy exists:
mkdir -p /tmp/graf-evidence
curl --max-time 15 --fail --location https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js -o /tmp/graf-evidence/three.module.js
sha256sum /tmp/graf-evidence/three.module.js

# Substitute your existing module path if using the cache instead:
python scripts/measure-graf-frames.py --three-module /tmp/graf-evidence/three.module.js --output /tmp/graf-evidence/desktop.json --screenshot /tmp/graf-evidence/desktop.png --viewport 960x540
python scripts/measure-graf-frames.py --three-module /tmp/graf-evidence/three.module.js --output /tmp/graf-evidence/mobile-viewport.json --screenshot /tmp/graf-evidence/mobile-viewport.png --viewport 390x844
```

Default 10 warmup frames + one baseline + 60 measured intervals. `--frames` is bounded to 30..240, `--dpr` to 1..3 and total drawing buffer to 8 megapixels; per-capture RAF deadline 20 seconds, evaluation deadline 25 seconds. Every outbound browser request is intercepted; unexpected requests fail the capture. Missing dependencies or a failed assertion are errors, not successful empty evidence. The screenshots are captured after assertions, with exact collector/Three/script SHA-256 in JSON.

Recorded local results (Chromium 154.0.8037.57, Three r160, ANGLE SwiftShader, DPR 1):

| Viewport | Intervals | Elapsed ms | Observed FPS | Frame p50 / p95 ms | Calls / triangles per two-pass frame |
|---|---:|---:|---:|---:|---:|
| 960×540 | 60 | 1000 | 60.00 | 16.70 / 16.70 | 2 / 24 |
| 390×844 | 60 | 1000 | 60.00 | 16.70 / 16.70 | 2 / 24 |

Raw [desktop JSON](evidence/graf-frame-metrics-20261017/desktop.json), [portrait JSON](evidence/graf-frame-metrics-20261017/mobile-viewport.json), [desktop image](evidence/graf-frame-metrics-20261017/desktop.png), [portrait image](evidence/graf-frame-metrics-20261017/mobile-viewport.png). Both reports assert full counter coverage, FPS/p95 computed from raw intervals, visible RGB pixels, restored auto-reset policy, no lost context, no WebGL error and no page/console error. The difference 1/12 versus 2/24 is a controlled counter comparison on the same rendered box, not an FPS improvement.

`recordFrame` single-call timing mean was ~0.018 ms desktop / ~0.013 ms portrait, p95 ~0.1 ms in these 61 calls (includes baseline). Clock granularity affects these tiny measurements; they do not establish a stable CPU overhead or an optimization gain. These one-second software-rendered fixture captures are **not game FPS, sustained load or physical-phone performance**, and no player-visible quality percentage is asserted.

Local checks: 13 collector tests, real WebGL assertions in both captures, 88-file syntax check plus module/test parsing, architecture, MF, IndieWorlds, desktop work protocol, diff check. The impact graph reports no existing consuming apps for this new opt-in module; existing controller/game code is untouched.

`npm run check` / full release gates are not claimed. Existing `test/collective-brain-remote-bridge.test.js` can execute canonical Git task handlers and older adapter tests perform canonical/network work, so the blanket suite must be isolated before running on this checkout. Safe local syntax, focused module/graphics checks and applicable policy gates are recorded individually. Required checks are not waived; no merge is authorized here.

## Bounded CI diagnosis

Facts from this cloud session, distinct from local test results:

- Git HTTPS fetch works; `gh` 2.46.0 is installed.
- Issue #524 / PR #525 / Actions runs API calls return Forbidden. An independent unauthenticated HEAD receives Envoy CONNECT HTTP 403 **before TLS**. This identifies a cloud-proxy block, not a GitHub token or billing conclusion. No token printed, login repeated, TLS disabled, settings changed or rerun requested.
- Public Actions/issue HTML is unavailable (plain 404). Current run/job/step counts, annotations, Actions permissions, billing/limits and runner availability are **not verified** from this environment.
- At PR #525's exact source SHA, `ci.yml` has `pull_request` targeting master, `check` on `ubuntu-latest`, no path/job suppression, first step `actions/checkout@v4`. Quality Regression, World Quality and Godot preview also have PR triggers. PR #525 changes no workflow file.
- Historical PR #520 annotations reported a billing/spending issue. This is historical evidence only, not the established cause for PR #525.
- The old `independent-pr-review.yml` is retired (`if:false`); it cannot be cited as a completed cross-company review. Request Claude review in the new PR; existing available free review workflows remain optional evidence.

### One read-only snapshot for connected browser ChatGPT

Bound each network request to 15 seconds. Do not rerun CI before classifying the failure:

```sh
timeout 15s gh api 'repos/mpaykin1/World_server/actions/runs?head_sha=d6b6a2c6ab42e1121cf832e732bca32822967c95&per_page=20'
timeout 15s gh api repos/mpaykin1/World_server/actions/runs/RUN_ID/jobs
timeout 15s gh api repos/mpaykin1/World_server/actions/permissions
timeout 15s gh api repos/mpaykin1/World_server/actions/runners
```

Record run ID/head SHA, status/conclusion, jobs/steps counts and first step that actually began. If zero steps, read annotations of the corresponding check run. Check billing/limits only against current server-side evidence, without changing plan/payment; if queued for runners, inspect runner queue/Actions permissions. Return findings to existing issue #524. Local development continues while that access issue is resolved.

## Publication / cross-company review checkpoint

Branch: `ai/codex/graf-frame-metrics-20261017`, base master `c6d0e116a5e3f8c06f8f1ed82167e85af3693f52`. Code SHA, exact measurements and publication status will be updated after the local capture. PR must target master, with code/tests/measurements/recipe; no auto merge or bypass of required checks. Only the owner decides PASS/FAIL, and no verdict-based learning record is written here.
