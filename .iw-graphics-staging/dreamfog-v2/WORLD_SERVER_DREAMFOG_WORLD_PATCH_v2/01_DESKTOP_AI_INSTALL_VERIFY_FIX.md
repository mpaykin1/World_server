# Desktop AI — install → verify → fix-until-PASS

## Goal

Integrate DreamFog as a reusable World_server atmospheric-world system without weakening any existing world, graphic baseline, physics, mobile behavior or release guard.

## 0. Non-negotiable rules

- Work on a branch/worktree, never destructively on another agent's active worktree.
- Reuse before creating. Existing Golden Standard systems are authoritative.
- Do not remove effects or reduce visual intent merely to make a test green. Use quality tiers and cheaper implementations instead.
- CPU/no-GPU operation is mandatory. GPU may accelerate generation but must never be required to enter/play DreamFog.
- Do not claim metric geometry from monocular depth. DreamFog layers are `MONOCULAR_INFERRED_RELATIVE`.
- Never make DreamFog visible/certified until `node verify.mjs --full` passes.
- Every real failure must end with: root cause fixed + regression guard + rerun + saved learning.

## 1. Preflight

Target repo: `C:\Users\user\Desktop\World_server`

Verify:

```powershell
cd C:\Users\user\Desktop\World_server
git status --short
git branch --show-current
node --version
python --version
```

The current repository declares **Node 24.x**. Use Node 24, not the older Node 20 assumption from previous DreamFog notes.

Create a safe branch if this patch has not already been integrated by another AI:

```powershell
git switch -c ai/dreamfog-world-v2
```

If the branch already exists, inspect and reuse it; do not create duplicate work.

## 2. What to download / install

### Required repository dependencies

```powershell
npm install
npx playwright install chromium webkit
```

Do **not** add a second copy of Three.js, a second physics engine, a second DPR autoscaler, or a second depth pipeline just for DreamFog. The patch follows current World_server conventions and loads the same Three.js generation used by the existing voxel world while reusing shared server systems.

### Python worker / image-to-DreamFog preparation

The server already contains `services/ai3d-worker/ai3d/plugins/depth_anything.py`. Reuse it.

If `Depth-Anything-V2` is not present under your configured external root, install the official open-source source once:

```powershell
mkdir "$env:USERPROFILE\Desktop\3дгенерация" -Force
git clone https://github.com/DepthAnything/Depth-Anything-V2.git "$env:USERPROFILE\Desktop\3дгенерация\Depth-Anything-V2"
```

Then run the server's existing bootstrap rather than inventing a new environment:

```powershell
cd C:\Users\user\Desktop\World_server\services\ai3d-worker
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-windows.ps1
```

That existing bootstrap creates `.venv`, installs worker requirements, and when Depth Anything is found installs `torch`, `torchvision` and `opencv-python-headless`. The existing Depth Anything plugin downloads its Small checkpoint into the server model cache and chooses CUDA/MPS/CPU automatically.

Optional external tools are **not required** for DreamFog runtime. Blender/TRELLIS/InstantMesh may stay installed for other AI3D pipelines, but do not block DreamFog on them.

## 3. Integrate patch

From the downloaded patch folder:

```powershell
node .\install.mjs --repo "C:\Users\user\Desktop\World_server"
```

Installer actions:

- copies DreamFog app/runtime/tests/tools into existing directories;
- adds DreamFog npm scripts without deleting existing scripts;
- adds `dreamfog-world` to the existing deny-by-default release registry as hidden `quarantine`;
- preserves existing certified apps;
- never promotes automatically.

Review:

```powershell
cd C:\Users\user\Desktop\World_server
git diff --stat
git diff -- data/app-release-registry.json package.json
npm run duplicates:check
```

If existing files contain newer equivalent code, merge capabilities instead of overwriting the newer implementation.

## 4. Generate layered depth from the supplied reference image

From World_server:

```powershell
npm run dreamfog:from-image -- --input "<PATCH_FOLDER>\reference\IMG_4868.jpeg" --repo . --layers 8
```

Expected output:

```text
apps/dreamfog-world/assets/generated/
  reference.jpeg
  depth.png
  layer_00.png ... layer_07.png
  dreamfog-scene.json
```

The scene still works without generated assets: it falls back to seeded procedural atmosphere. Generated layers add image-specific palette and Layered Depth Image cards.

If depth generation fails:

1. Check `DEPTH_ANYTHING_HOME` points to a valid `Depth-Anything-V2` checkout containing `depth_anything_v2/dpt.py`.
2. Run existing worker bootstrap.
3. Run the plugin directly in its `.venv` if necessary.
4. Do not substitute grayscale and call it AI depth.
5. Add the root cause to server error prevention / learned fix systems after repair.

## 5. Run verification

First fast gates:

```powershell
npm run dreamfog:static
node --test test/dreamfog-config.test.js
npm run dreamfog:e2e
```

Then the patch verifier:

```powershell
node "<PATCH_FOLDER>\verify.mjs" --repo "C:\Users\user\Desktop\World_server" --full
```

Full verification runs:

- dependency install;
- DreamFog static/de-dup gate;
- DreamFog Node tests;
- whole repository `check`;
- duplicate system review;
- system contract review;
- Playwright DreamFog on desktop Chromium + mobile Chromium;
- Golden Standard check;
- world runtime profiler;
- visibility optimizer;
- device matrix;
- regression capture;
- full `release:gate`.

Result is written to:

```text
World_server/DREAMFOG_VERIFICATION_REPORT.json
```

## 6. Fix-until-PASS protocol

For **every** failing gate:

1. Reproduce exactly.
2. Capture browser console, page errors, failing assertion, network status, and relevant quality report.
3. Identify the root cause; do not patch only the symptom.
4. Search existing `shared/`, `scripts/`, `data/*policy*`, `data/error-prevention-registry.json`, and previous fixes before writing a new subsystem.
5. Fix the smallest authoritative layer that prevents recurrence.
6. Add/strengthen a test in `test/` or `e2e/`.
7. Rerun the failing test.
8. Rerun `npm run dreamfog:test`.
9. Rerun full verifier.
10. When fixed and proven, run:

```powershell
npm run quality:learn-fix
npm run regressions:capture
npm run quality:knowledge
```

11. Record the root cause and successful pattern in the existing server knowledge/error-prevention mechanism where its schema allows it. Do not corrupt JSON schemas just to add prose.
12. Continue until all mandatory gates are PASS. Do not report 100% while any mandatory gate is failing, skipped without evidence, or untested on required target.

## 7. Performance diagnosis order

If FPS is low, preserve appearance in this order:

1. Let existing Golden DPR autotuner lower renderer pixel ratio.
2. DreamFog tier reduces weather particles.
3. Reduce mist particle draw range.
4. Reduce number of fog banks.
5. Disable depth-aware post FX on mobile/low tier.
6. Reduce active light pockets.
7. Reduce active procedural creatures.
8. Only after that consider shader complexity changes.

Never remove fog, water, silhouette motion or the overall atmospheric composition as a “performance fix”.

Targets in `data/dreamfog-quality-profile.json`:

- high desktop: target 58 FPS / minimum 45;
- desktop: target 52 / minimum 36;
- mobile: target 38 / minimum 26;
- low mobile: target 30 / minimum 22.

These are engineering budgets, not a claim that every physical device will meet them before measurement.

## 8. Promote only after evidence

When full verifier exits 0:

```powershell
node "<PATCH_FOLDER>\install.mjs" --repo "C:\Users\user\Desktop\World_server" --promote
npm run dreamfog:static
npm run release:gate
```

The `--promote` command refuses to certify DreamFog unless `DREAMFOG_VERIFICATION_REPORT.json` has both `passed: true` and `full: true`.

Then deploy a Preview and test:

- desktop Chromium;
- Android/Pixel emulation;
- iPhone/WebKit emulation;
- at least one real phone when available;
- pointer lock / mouse look;
- touch move/look/jump;
- collision around solid silhouettes;
- no black canvas;
- stable fog/water after 60+ seconds;
- no runaway memory trend;
- catalog entry only after certification.

## 9. Definition of done

DreamFog is done only when:

- full verifier PASS;
- release gate PASS;
- generated-depth path works or is explicitly documented unavailable without lying;
- procedural fallback works with zero generated assets;
- desktop + mobile Playwright PASS;
- real device evidence recorded when available;
- no duplicate Golden subsystem introduced;
- DreamFog remains visually foggy/strange at every quality tier;
- fixes are captured for regression prevention.
