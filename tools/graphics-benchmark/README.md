# Graphics production benchmark — operator runbook

**Goal:** make ChatGPT better at *producing* game graphics by repeated experiments against user-approved Claude examples. This is not a feature of in-game AI.

## Automated smoke test
`.github/workflows/graphics-benchmark.yml` installs desktop Chromium, runs `capture.mjs` against the same offline HTML twice, validates both captures, and uploads a six-frame screenshot sequence plus `evidence.json`. This is a **pipeline self-test only**; passing it does NOT mean ChatGPT's graphics match Claude.

The workflow has been added on a feature branch; do not report CI PASS until a run is observed and inspected. The screenshots are Chromium touch emulation, not iPhone performance.

## Real Claude comparison
Use a user-approved Claude reference HTML and the exact same brief:
```sh
npm install --no-save playwright
npx playwright install chromium
node tools/graphics-benchmark/capture.mjs \
  --reference /path/to/claude-reference.html \
  --candidate /path/to/chatgpt-game.html \
  --out /tmp/graphics-evidence \
  --width 390 --height 844 --duration 5000
```
Capture produces `reference.png`, `candidate.png`, six timed screenshots (`-t1`, `-t2`, `-t3` per input), and `evidence.json`.

**Capture validity:** `comparable=true` means neither side had JavaScript exceptions, failed resource requests, external network dependencies, missing visible canvas, or insufficient animation samples. It does **not** indicate aesthetic parity. Mark the result UNKNOWN until someone reviews the images.

**Visual review:** inspect composition, silhouette, materials, lighting, depth, animation, fidelity to the brief and performance, using `docs/GRAPHICS_CAPABILITY_BENCHMARK.md`. Prioritize the largest gap and produce one verified change in a PR. Record exact inputs, screenshot evidence, before/after differences, failures and lessons. Never invent an improvement percentage.

**Known limitations:** No deterministic virtual time; screenshot timings can drift; Math.random seeding may be overwritten by an app; DOM or WebGL without a canvas is not accepted by the current hard gate; RAF cadence is not GPU duration. Treat these as issues to fix before interpreting results.
