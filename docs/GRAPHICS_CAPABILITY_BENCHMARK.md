# GRAPHICS CAPABILITY BENCHMARK — ChatGPT vs Claude

## Purpose
Measure and improve ChatGPT's **production capability** to create game graphics equal to or better than user-approved Claude examples. This is **not** about training in-game agents or counting game mechanics. Never conflate gameplay completion with graphics quality.

## Inputs
- The exact same user brief for both systems.
- User-approved Claude reference screenshots and, where available, original offline HTML/assets.
- ChatGPT-generated offline HTML and source assets.
- Fixed viewport, camera, scene, seed, animation timestamp and device/browser for reproducibility.

## Evaluation rubric (100 points)
| Dimension | Weight | Evidence |
|---|---:|---|
| Composition and visual hierarchy | 12 | Side-by-side matched screenshots |
| Silhouette, geometry and object complexity | 15 | Close-up and full-scene views |
| Materials, textures, microdetail | 15 | Crop comparison |
| Lighting, shadow, emissive, bloom | 15 | Same scene and exposure |
| Depth, perspective and atmospheric effects | 12 | Near/mid/far layers |
| Animation, secondary motion, transitions | 13 | Timed frame sequence / video |
| Stylistic coherence and adherence to brief | 10 | Requirement-by-requirement review |
| Mobile/offline integration and performance | 8 | file:// run, touch test, FPS p50/p95, memory |

Scoring per dimension: 0–5 anchored to observed evidence, then normalized by weight. Mark **UNKNOWN**, not zero or PASS, when reference or evidence is unavailable. Do not invent measurements. The user has final acceptance authority.

## Mandatory workflow per improvement
1. Identify the reference and exact brief; archive a stable link/hash or mark UNKNOWN.
2. List 3–5 largest visible gaps in descending impact.
3. Implement ONE measurable graphics improvement in an isolated branch/PR. Preserve the existing working game, rendering pipeline and offline requirements.
4. Render before/after and reference at matched camera/viewport/seed/time; inspect screenshots for visual regression.
5. Run functional/offline/mobile tests and FPS profiling where accessible. Clearly distinguish desktop simulation from actual iPhone measurements.
6. Record baseline score, new score, evidence, regressions, limitations, and next experiment. Never claim improvement without comparison.
7. Store reusable techniques and verified failures in development-memory; add a regression test for every confirmed recurring defect; hand off the next experiment.

## Acceptance gate
- Offline single-file HTML works with no network dependency.
- Visual comparison exists and meets the brief.
- Animation and input remain functional.
- FPS and memory meet the agreed target on the target device.
- No regression in existing gameplay.
- User approves visual quality.

## Reporting
Report two independent statuses: (A) workflow/infrastructure readiness, (B) **demonstrated graphics capability vs Claude**. The latter stays UNKNOWN until an apples-to-apples visual comparison is completed. A new commit or extra game mechanic never raises graphics capability by itself.

## Five recurring META6 slots
:05 analyze brief/reference and select highest-impact gap.
:15 create/refine graphics asset and animation.
:30 integrate into actual offline game and profile.
:40 independent visual comparison and defect triage.
:50 quality gate, regression evidence, lessons and handoff.

Existing tasks, schedules, memory rules and anti-break constraints remain in force.


## Reproducible capture tool (2026-10-23)
Source: `tools/graphics-benchmark/capture.mjs`. The script is checked into GitHub, but its successful execution is **not yet verified**.

Install Playwright and Chromium in an isolated environment:
```sh
npm install --no-save playwright
npx playwright install chromium
node tools/graphics-benchmark/capture.mjs \
  --reference /absolute/path/to/claude-reference.html \
  --candidate experiments/creature-civilizations/index.html \
  --out /tmp/graphics-evidence --width 390 --height 844 --duration 5000
```

Outputs: `reference.png`, `candidate.png`, `evidence.json`. The JSON includes browser version, viewport, JS exceptions, canvas counts and requestAnimationFrame p50/p95 frame intervals. Those intervals are **not** GPU render timings. Desktop Chromium touch emulation is **not** a real iPhone benchmark. The tool does not automatically judge artistic quality; human visual review remains mandatory. Both inputs must be offline-capable; missing assets and script failures should fail QA.

### Scoring gate
- Without matching reference images: visual score = **UNKNOWN**.
- Without verified screenshot evidence: improvement = **UNKNOWN**, never an invented +N%.
- Without an actual iPhone run: real-device FPS = **UNKNOWN**.
- A test that has been written but not executed is **NOT RUN**, not PASS.
- No promotion to `master` solely on source-code changes. Preserve PR review, evidence and rollback path.

### Next production cycle
1. Obtain the exact Claude HTML/assets and the original brief; hash inputs.
2. Execute the capture tool and inspect failures.
3. Produce and review paired screenshots and an animation sequence.
4. Rank visual gaps by the weighted rubric; fix the largest gap, not unrelated gameplay mechanics.
5. Repeat capture and log delta with proof; store reusable rendering recipes and failures in development memory.
