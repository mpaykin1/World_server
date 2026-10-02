# ActionForge CC0 integration — success record

Date: 2026-10-01
Branch: feat/actionforge-cc0-animations

## Result

World Server can load the ActionForge/Quaternius default humanoid rig and all 85 animation clips currently selectable on ActionForge through the existing universal player runtime.

## What made it work

1. Assets were acquired through the live official ActionForge UI/source URLs instead of recreating animation data.
2. The default ActionForge skeleton was kept end-to-end, so animation tracks bind to the downloaded rig without retargeting.
3. The existing `loadUniversalPlayer` manifest contract was reused instead of adding a second character runtime.
4. Semantic actions map only to animation names verified inside the acquired GLB files.
5. The downloader is reproducible and also refreshes the official licence notice and rig.

## Important exporter edge case

ActionForge reports 85 selectable clips and “85 selected”, but its combined animation-only GLB contains 84 tracks. The missing selectable clip is `fps_test`, served from `assets/animation-library/animations/fps/fps_test.glb`. World Server acquires that official file separately, so the installed library is 85/85.

## Licence boundary

Only the Quaternius rig/animations covered by ActionForge's CC0 notice are vendored. The proprietary ActionForge application code is not copied. The Adobe Mixamo reference skeleton is explicitly excluded and is not vendored.

## Evidence

- Node regression suite: 7/7 relevant tests pass.
- Browser smoke test: 85 clips loaded; `idle_loop` played; `pistol_shoot` resolved; rig meshes present; zero browser errors.
- SHA-256 hashes are recorded in the asset directory.
