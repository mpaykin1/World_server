# CURRENT SERVER GRAPHICS TECHNOLOGY SCAN — 2026-08-24

Проверен актуальный `mpaykin1/World_server` master перед подготовкой V6.

## Текущее состояние

- master HEAD: `fa3445713f8f9f84130c2795421b9cb1ca2d6640` — merge World Quality Autopilot V4.1 Windows hotfix.
- Production/integrated graphics stack по текущему audit: Three.js/WebGL2, Python/FastAPI AI3D worker, AI3D auto-discovery, Depth Anything adapter, Blender pipeline, Godot bridge/runtime smoke, Hunyuan3D routing, InstantMesh, TRELLIS.2, voxel/mesh quality pipeline.
- AI3D plugin tree включает: `blender_building`, `cpu_reconstruction`, `depth_anything`, `godot_voxel`, `gpu_router`, `instantmesh`, `mesh_quality_optimizer`, `procgen_maps`, `trellis2`, `voxel_city`, `world_quality`.
- `MPFB`, `UniRig`, `Rigify`, `Goo Engine`, `UPBGE` видны orchestrator-у, но текущий audit прямо помечает их runtime как непроверенный.
- Hunyuan Full Quality / Godot PR #6 остаётся отдельным открытым кандидатом и не считается частью master только по наличию PR.

## Что V6 делает с этим автоматически

Каждый cycle сначала пересканирует repository/audit/plugins/apps/dependencies. Каждая runtime graphics technology получает detail adapter + optimization adapter. Если появилась неизвестная технология или новая runtime technology без пары adapters, drift/integration gate блокирует promotion. CPU-safe paths выбираются первыми; GPU-only route остаётся optional.

## Выявленные proof gaps текущего master

- Visual: один auto-verified front fixture, не human-approved aesthetic multiview.
- Animation: synthetic/local-test rig evidence, не real generated/Roblox/Godot playback.
- Devices: physical iOS/Android provider status NOT_CONFIGURED.
- Runtime resilience: voxel-world master всё ещё импортирует Three.js через unpkg CDN; local vendor следует продвинуть отдельным проверенным патчем.
