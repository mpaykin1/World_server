# KRIEGER Native Light Lab

Pinned upstream: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

This lab controls the original native lighting/shadow path. It does not add a renderer.

## Exact symbol / call flow

`genscene.cpp::Exec_Scene_Light` → `Engine_::AddLightJob` → `Engine_::Paint2004` → selected `EngLight[0..3]` → `BuildPaintJobs` native `ENGU_SHADOW/ENGU_LIGHT` jobs → `RenderPaintJobs2004` → native shadow mask + `kk04SetLight` → shader constants → `EngMesh::PaintJob` → WebGL draw → framebuffer.

The pinned 2004 shader computes distance attenuation, blends light directions against mesh normals/tangents, applies shadow-mask channels and adds diffuse/specular light.

## Controlled change and VNO

The existing native `GenOverlayManager->EnableShadows` state is controlled through `kkCycleShadows()` and Observatory command 6:

`0 normal → 1 no shadow pass → 2 no shadow or local-light pass → 0 restored`.

Two untouched baseline frames establish framebuffer variation/noise. Then `no-shadows` and `no-lights` are captured. Shadow and local-light deltas must each dominate untouched baseline noise.

This is an ablation, not a replacement shader or second renderer.

## Promotion rule

A successful exact-SHA CI run promotes `LOCAL LIGHT` and `SHADOW/VISIBILITY` at most to `TESTED`. It does not make either `CONTROL_PROVEN`; that requires owner PASS.
