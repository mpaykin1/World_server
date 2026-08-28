# WORLD_SERVER_DREAMFOG_WORLD_PATCH_v2

Production-oriented patch for a blurred surreal 3D world: layered fog, strange silhouettes, water, depth softness, slow deformation, anomalous appearances, lightweight weather, soundscape, image-derived layered depth, and adaptive mobile/desktop quality.

## Fast path for Desktop AI

1. Read `01_DESKTOP_AI_INSTALL_VERIFY_FIX.md` completely.
2. From this patch folder run:
   - Windows: `node install.mjs --repo "C:\Users\user\Desktop\World_server"`
   - Then: `node verify.mjs --repo "C:\Users\user\Desktop\World_server" --full`
3. If any command fails, **do not promote**. Fix the root cause in World_server, strengthen regression coverage, rerun the failed gate and then rerun the full verify.
4. Only after `DREAMFOG_VERIFICATION_REPORT.json` says `passed: true` and `full: true` run:
   - `node install.mjs --repo "C:\Users\user\Desktop\World_server" --promote`
5. Rerun `npm run release:gate`, deploy Preview, smoke-test desktop + real phone, then merge according to the repository's normal process.

## Important

The installer is idempotent and deliberately keeps DreamFog hidden/quarantined until full verification passes. It reuses the server's existing Golden Standard physics, controls, performance autotuner, telemetry, world-quality systems and existing Depth Anything V2 integration rather than creating duplicates.
