# Game Motion / Frame Timeline / Procedural Animation V2

## Core
`gameplay signal → MotionGraph / LocomotionClock / Spring / Timeline → native transform/skeleton/shader OR frame index → MotionScheduler/LOD → WorldQualityAutopilot → runtime evidence`

## V2 additions
- MotionGraph state machine;
- distance-synchronized LocomotionClock against foot sliding;
- central MotionScheduler;
- deterministic procedural noise;
- trauma camera shake;
- progressive frame cache with nearest-ready fallback;
- cross-platform Motion Manifest;
- preset library;
- frame sequence metrics / exposure stabilization / seam blending / FFmpeg motion interpolation;
- isolated glTF-Transform + Meshopt keyframe/mesh compression;
- knowledge capture and stricter animation quality gate.

## Existing World_server reuse
- WorldQualityAutopilot: Hz/budget/device adaptation;
- world-animation semantic validator;
- quality/regression/impact/knowledge gates;
- Sentry/production-quality infrastructure where already enabled.

No duplicate quality governor is introduced.
