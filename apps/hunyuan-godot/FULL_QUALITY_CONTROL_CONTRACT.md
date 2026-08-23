# Hunyuan V3 production contract

A build is forbidden from promotion to `apps/hunyuan-world/` unless ALL invariants pass.

## Visual quality hard gate
- Godot Web and desktop must load `visual_full_quality.glb`.
- Exact source count: **686,093 vertices / 1,313,748 triangles**.
- The asset must remain >30 MB and keep vertex colors + normals.
- No `visual_lod0`, `visual_lod1`, panorama, screenshot, billboard, or collision mesh may replace production visual geometry.

## Controls hard gate
- World is Y-up and its transform is immutable at runtime.
- Player origin is feet; head/camera is above feet.
- Spawn must settle on street-level collision, not roof/air.
- Space modifies only `velocity.y`.
- Walking uses yaw only; camera pitch never leaks into movement.
- Body rotates only around world Y; head rotates only around local X.
- Roll is always 0.
- Pitch reaches ±89.5° so sky directly overhead and floor below are visible.

## Release rule
Candidate → Godot regression test → Godot Web export → Playwright browser smoke → repository tests → promote. Any failure = do not overwrite current public build.
