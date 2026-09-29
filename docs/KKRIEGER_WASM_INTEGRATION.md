# Kkrieger WebAssembly bridge for World Server

World Server now has a reproducible bridge to the real open-source `.kkrieger` / werkkzeug3 browser port rather than a visual JavaScript imitation.

## Pinned upstream

- `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`
- Emscripten `6.0.9`

The upstream browser port retains the original C/C++ engine path and replaces the old Win32/Direct3D/DirectSound platform layer with Emscripten, SDL2, WebGL2 and Web Audio. The build uses the original procedural game data and generation pipeline.

## What World Server adds

`tools/kkrieger-wasm/build-singlefile.sh` applies packaging-only changes to the pinned upstream build:

1. converts Emscripten `--preload-file` assets to `--embed-file`;
2. adds `-sSINGLE_FILE=1`;
3. requires the output directory to contain no runtime sidecar files;
4. embeds the farbrausch BSD notice and MojoShader zlib notice inside the generated HTML.

`tools/kkrieger-wasm/verify-singlefile.mjs` rejects builds that are too small, missing the WebAssembly/game markers, missing the embedded notices, or contain external resource tags.

`tools/kkrieger-wasm/browser-smoke.mjs` performs a real Chromium/WebGL2 smoke, including a hard >85% primary-surface visibility gate, runtime log activity and non-blank rendered pixels.

## Procedural technology map

The pinned upstream source provides the concrete foundation we want to reuse:

- procedural meshes: `werkkzeug3_kkrieger/genmesh.cpp`, `genminmesh.cpp`;
- procedural textures/bitmaps: `genbitmap.cpp`;
- materials and translated shaders: `genmaterial.cpp`, `materials/*`, `wasm/shader_translate.cpp`;
- scene graph: `genscene.cpp`;
- procedural effects/overlays: `geneffect.cpp`, `genoverlay.cpp`;
- game runtime: `kkriegergame.cpp`, `engine.cpp`;
- skeletal/animation paths: scene/mesh animation operators inside werkkzeug3;
- procedural music and SFX: `v2/*` plus `wasm/v2_bridge.cpp`.

The first integration boundary is intentionally build-and-verify rather than copying a large upstream tree into World Server. This keeps provenance exact, avoids silent divergence and lets future work expose selected generators behind a stable World Server API.

## Build contract

The CI workflow checks out the exact upstream SHA, sets up Emscripten 6.0.9, builds one HTML, verifies single-file packaging and then runs a real browser smoke. Heavy compilation stays in GitHub Actions rather than on the user's PC.

No existing World Server app or public route is modified by this bridge.
