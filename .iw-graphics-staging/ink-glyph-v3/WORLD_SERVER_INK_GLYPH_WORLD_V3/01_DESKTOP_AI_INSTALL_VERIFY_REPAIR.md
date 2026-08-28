# DESKTOP AI — INK GLYPH WORLD V3
## INSTALL → VERIFY → REPAIR UNTIL ALL PASS

Goal: upgrade the existing Ink Glyph World in `C:\Users\user\Desktop\World_server` without duplicating systems. Preserve WorldQualityAutopilot, existing quality gates, user changes and unrelated apps.

## 1. Branch + preflight
```powershell
cd C:\Users\user\Desktop\World_server
git status --short
git switch -c ai/desktop/ink-glyph-world-v3
node --version
npm --version
```
If the branch exists, reuse it or create `ai/desktop/ink-glyph-world-v3-<timestamp>`. Never delete unrelated work and never push directly to `master`.

## 2. Install the patch
```powershell
node <PATCH_FOLDER>\install-ink-glyph-world.cjs --repo C:\Users\user\Desktop\World_server
```
The installer must:
- verify `PAYLOAD_SHA256.json` before writing;
- back up overwritten files under `.ink-glyph-backups/<timestamp>/`;
- copy V3 in-place rather than create a duplicate system;
- integrate npm scripts idempotently;
- upgrade `release:gate` from V2 `quality:ink-glyph` to `quality:ink-glyph:production` exactly once;
- download/verify fonts, opentype vendor, Hanzi stroke data and local optimization tools;
- run basic quality tests + benchmark;
- write `INK_GLYPH_WORLD_INSTALL_REPORT.json`.

## 3. Brush fonts — official Google Fonts only
Automatic:
```powershell
npm run fonts:ink:download
npm run fonts:ink:verify
```
Official source folders and direct files:
- Liu Jian Mao Cao
  - https://github.com/google/fonts/tree/main/ofl/liujianmaocao
  - https://raw.githubusercontent.com/google/fonts/main/ofl/liujianmaocao/LiuJianMaoCao-Regular.ttf
  - https://raw.githubusercontent.com/google/fonts/main/ofl/liujianmaocao/OFL.txt
- Ma Shan Zheng
  - https://github.com/google/fonts/tree/main/ofl/mashanzheng
  - https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf
  - https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/OFL.txt
- Zhi Mang Xing
  - https://github.com/google/fonts/tree/main/ofl/zhimangxing
  - https://raw.githubusercontent.com/google/fonts/main/ofl/zhimangxing/ZhiMangXing-Regular.ttf
  - https://raw.githubusercontent.com/google/fonts/main/ofl/zhimangxing/OFL.txt
- Long Cang
  - https://github.com/google/fonts/tree/main/ofl/longcang
  - https://raw.githubusercontent.com/google/fonts/main/ofl/longcang/LongCang-Regular.ttf
  - https://raw.githubusercontent.com/google/fonts/main/ofl/longcang/OFL.txt

Files belong in `assets/fonts/ink-glyph/`. Keep each OFL file. Do not use random font sites. `--strict-pin` must stop if a pinned upstream Git blob changes unexpectedly.

## 4. Vector outline parser
Automatic:
```powershell
npm run vendor:ink:download
npm run vendor:ink:verify
```
Pinned: `opentype.js 2.0.0`
- https://github.com/opentypejs/opentype.js
- https://www.npmjs.com/package/opentype.js

If unavailable, the app may fall back to native `FontFace`, but production verification must still restore and verify the pinned vendor file.

## 5. Real stroke-order data
Automatic default preload:
```powershell
npm run strokes:ink:download
npm run strokes:ink:verify
```
Default downloader preloads: `龍山水火天地人風雨雷月日木金土空`.

Add more characters at any time:
```powershell
node scripts\download-ink-glyph-strokes.cjs --glyphs "龍鳳雲海神鬼城門天地玄黃"
npm run strokes:ink:verify
```
Sources:
- https://github.com/chanind/hanzi-writer-data
- https://www.npmjs.com/package/hanzi-writer-data
- CDN pattern: `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/<CHAR>.json`

License is **Arphic Public License**, separate from Hanzi Writer's MIT code. Keep `assets/hanzi-strokes/ARPHICPL.TXT` unchanged and keep `MANIFEST.json`. Do not relabel the data as MIT/OFL.

## 6. WOFF2 font optimization
Use an isolated venv:
```powershell
py -m venv .ink-glyph-tools\python
.\.ink-glyph-tools\python\Scripts\python.exe -m pip install --upgrade pip
.\.ink-glyph-tools\python\Scripts\python.exe -m pip install "fonttools[woff]"
.\.ink-glyph-tools\python\Scripts\python.exe scripts\optimize-ink-glyph-fonts.py
```
Source: https://github.com/fonttools/fonttools
Keep original TTF files as provenance/source assets.

## 7. GLB optimization tools
Automatic isolated install (does not pollute the root dependency graph):
```powershell
npm run tools:ink:install
npm run tools:ink:verify
```
Pinned free MIT tools:
- `gltfpack 1.2.0` — https://www.npmjs.com/package/gltfpack
- `meshoptimizer 1.2.0` — https://www.npmjs.com/package/meshoptimizer
- upstream — https://github.com/zeux/meshoptimizer

After browser `Export GLB`:
```powershell
npm run ink:glyph:glb:validate -- C:\path\world.glb
npm run ink:glyph:glb:optimize -- C:\path\world.glb
```
The optimizer runs `gltfpack`, then automatically performs structural GLB 2.0 validation. Any invalid/truncated output is a hard failure.

## 8. Mandatory local verification
```powershell
npm run vendor:ink:verify
npm run fonts:ink:verify
npm run strokes:ink:verify
npm run tools:ink:verify
npm run quality:ink-glyph
npm run quality:ink-glyph:production
npm run quality:ink-glyph:bench
npm run check
npm run release:gate
```
Every command must exit `0`. Do not bypass a gate.

## 9. Browser / Playwright
Start the normal project server, then:
```powershell
npm run quality:ink-glyph:e2e
```
Open `http://localhost:3000/apps/ink-glyph-world/` on desktop and a real phone.

Verify all of the following:
- 4 fonts visibly produce different silhouettes;
- `龍`, `山`, `水`, `火` show real multi-stroke status rather than procedural fallback;
- `Write with brush` reveals world structures in stroke order;
- all 4 world presets build;
- Quality tournament returns a score and selected candidate;
- nav status has nodes and connected coverage; red A* preview path is visible;
- topology status reports landmarks/cycles and `data-ink-glyph-topology-ready="1"`;
- Full / Medium / Low LOD changes rendered instance count without deleting the world recipe;
- repeated identical build uses cache;
- glyph/font/preset/quality/stroke-source changes invalidate cache correctly;
- GLB download succeeds;
- exported GLB passes `npm run ink:glyph:glb:validate -- ...`;
- optimized GLB passes automatic post-optimization validation;
- drag/touch orbit, wheel/pinch and mobile UI work;
- `data-ink-glyph-ready="1"`, `data-ink-glyph-nav-ready="1"`, and `data-ink-glyph-topology-ready="1"`;
- zero uncaught page errors and no main-thread freeze.

## 10. Repair loop — mandatory
For every failure:
1. Capture exact command, exit code, stderr, browser console/network failure and failed assertion.
2. Identify the root cause, not the symptom.
3. Fix code/config/network/path/license/provenance.
4. Add or strengthen a regression test for that exact failure.
5. Rerun the failed check.
6. Rerun **all** commands from sections 8 and 9.
7. Save the failure + root cause + fix into the existing World_server regression/knowledge mechanism when available.
8. Continue until all mandatory checks pass.

Forbidden shortcuts: permanent SKIP, disabling release gate/tests, hiding browser errors, replacing real downloaded fonts with system fonts, deleting license/provenance, reducing quality only to make a test pass, or creating a second duplicate renderer/world stack.

## 11. Git / CI / Vercel
After local PASS:
```powershell
git status --short
git add apps/ink-glyph-world shared/ink-glyph-world-core.js shared/vendor data/ink-glyph-font-registry.json assets/fonts/ink-glyph assets/hanzi-strokes scripts test e2e docs package.json INK_GLYPH_WORLD_*.json
git commit -m "Upgrade Ink Glyph World to V3 production pipeline"
git push -u origin ai/desktop/ink-glyph-world-v3
```
Open a PR to `master`. Wait for CI/Vercel. Verify production `/apps/ink-glyph-world/` on desktop + phone. Fix failures on the same branch and rerun all gates.

Do **not** add `.ink-glyph-tools/npm/node_modules` to Git. It is a local build tool cache. If not already ignored, add `.ink-glyph-tools/` to `.gitignore` while preserving any intentional tracked documentation.

## 12. Completion definition
Only report 100% when:
- 4/4 TTF + OFL verified;
- opentype vendor verified;
- Hanzi stroke data + Arphic license verified;
- local gltfpack/meshoptimizer tools verified;
- 13+ unit tests PASS;
- benchmark PASS;
- full existing project checks + release gate PASS;
- Playwright including GLB download PASS;
- optimized exported GLB opens correctly;
- production page PASS on desktop + real phone;
- zero uncaught errors;
- branch pushed + PR checks green;
- no duplicate systems or regressions.
