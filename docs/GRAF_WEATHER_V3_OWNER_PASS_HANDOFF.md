# GRAF Weather V3 — OWNER PASS / cross-repository handoff

**Owner verdict:** PASS, 2026-10-17, for standalone *Ostrov Sumerek Compact Weather V3* only. Previous big-menu / invisible-weather version was explicitly FAIL. Do not conflate them.

## Canonical public artifacts

- GRAF standard, including §27.1: https://github.com/mpaykin1/meta6/blob/main/graf.md
- Short reusable discovery/agent contract: https://github.com/mpaykin1/meta6/blob/main/weather.md
- **Exact owner-accepted source:** https://github.com/mpaykin1/meta6/blob/main/weather-showcase-graf-20261017/index.html
- Autonomous HTML raw download: https://raw.githubusercontent.com/mpaykin1/meta6/main/weather-showcase-graf-20261017/index.html
- Intended Pages showcase (live HTTP/actual mobile GPU should be rechecked by consumer): https://mpaykin1.github.io/meta6/weather-showcase-graf-20261017/
- Success and limitations: https://github.com/mpaykin1/meta6/blob/main/docs/SUCCESS_WEATHER_LAB_2026-10-17.md
- Earlier FAIL/lessons: https://github.com/mpaykin1/meta6/blob/main/docs/lessons/2026-10-17-weather-preview-v2-owner-fail.md

**Integrity:** HTML Git blob SHA `cbea04b78accded2a9bedfdbcd87919037b5a8c3`, SHA-256 `d0cb220f3f1e2b2fe44e6e5322b5b9e3ef676138a0281a281692182fe03c49a7`.

## What to reuse in World_server / other games

- Real 3D weather baseline, perspective island scene, transparent 2D/2.5D animated FX and lighting response in one coordinated weather state.
- Just **one compact upper-right weather icon button** (47 px on mobile / up to 50 px desktop), not a half-screen menu. Keep canvas/HUD fixed; input must not scroll the page.
- Owner-approved 11 display modes: autumn leaves, five petal winds (white/red/black/pink/multicolor), snow, fireflies, storm, mist, magic. Every mode must look visually distinct and animated.
- Original acceptance included simulated-grid perceptual test >85% (minimum 91/100 mobile and 86/100 desktop). Recheck in each changed target scene; this is not real physical iPhone 11 performance.
- When incorporating effects into existing Three.js scenes use the engine's existing renderer, camera, requestAnimationFrame and lifecycle; **never copy a second fullscreen render loop**. Preserve gameplay, controls, collisions and accepted versions.
- Use deterministic seeds / offline atlas baking / particle pooling; test actual click switching, visible pixels/screenshots, JS errors, fixed mobile viewport, CPU/GPU draw budgets, and actual FPS separately.
- New game integrations and iPhone 11 FPS remain **UNKNOWN**, not automatically PASS.

This document is only a cross-repository discovery pointer. Canonical code, assets, PASS record and rules remain in public `mpaykin1/meta6`, avoiding divergent copies. Do not bypass World_server master protection: PR and required independent review apply.
