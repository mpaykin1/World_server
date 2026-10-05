# KRIEGER Native Light Lab

Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

This lab controls the original native lighting/shadow path. It does not add a renderer.

## Exact symbol / call flow

`genscene.cpp::Exec_Scene_Light` → `Engine_::AddLightJob` → `Engine_::Paint2004` → selected `EngLight[0..3]` → `BuildPaintJobs` native `ENGU_SHADOW/ENGU_LIGHT` jobs → `RenderPaintJobs2004` → native shadow mask + `kk04SetLight` → shader constants → `EngMesh::PaintJob` → WebGL draw → framebuffer.

The pinned 2004 shader computes distance attenuation, blends light directions against mesh normals/tangents, applies shadow-mask channels and adds diffuse/specular light.

## Controlled change and VNO

The existing native `GenOverlayManager->EnableShadows` state is controlled through `kkCycleShadows()` and Observatory command 6:

`0 normal → 1 no shadow pass → 2 no shadow or local-light pass → 0 restored`.

The earlier moving-scene oracle was invalid: animation/AI/camera evolution could change more pixels than the lighting control itself. The lab therefore uses Observatory command 15 to hold the native `sSystem_::GetTime()` on one measured tick while the original renderer continues to draw.

Two frozen-time baseline frames establish residual compositor/GPU noise. Then `no-shadows` and `no-lights` are captured at the same simulation time. The lab restores normal lighting, checks that the restored frame returns near the frozen baseline, resumes the native clock, and requires shadow/local-light deltas to dominate residual noise.

This is an ablation, not a replacement shader or second renderer. Freeze-time is Observatory-only and defaults off.

## Promotion rule

A successful exact-SHA CI run promotes `LOCAL LIGHT` and `SHADOW/VISIBILITY` at most to `TESTED`. It does not make either `CONTROL_PROVEN`; that requires owner PASS.
