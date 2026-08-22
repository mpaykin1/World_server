# AI3D Auto-Discovery (2026-08-21T17:19:13.439Z)

Scanned automatically from:
- `C:\Users\user\Desktop\3дгенерация`
- `C:\Users\user\Desktop\майн`

## Primary pipeline
- **TRELLIS.2** — READY — `C:\Users\user\Desktop\3дгенерация\TRELLIS.2` @ `75fbf01`
- **Depth-Anything-V2** — READY — `C:\Users\user\Desktop\3дгенерация\Depth-Anything-V2` @ `a561b84`
- **BuildingGeneratorThreeJS** — READY — `C:\Users\user\Desktop\3дгенерация\BuildingGeneratorThreeJS` @ `74cb71b`
- **bene-proggen-maps** — READY — `C:\Users\user\Desktop\3дгенерация\bene-proggen-maps` @ `ed622c5`

## Blender (auto-found)
- Path: `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` — found (ProgramFilesGlob) — World_server no longer requires manual BLENDER_BIN

## Unified capabilities
- **trellis**: `{"available":true,"note":"Linux + CUDA 24GB, else fallback","commit":"75fbf01"}`
- **instantmesh**: `{"available":true,"bridge":"INSTANTMESH_GPU_WORKER_SERVER_BRIDGE","path":"C:\\Users\\user\\Desktop\\майн\\InstantMesh","commit":"08822c5"}`
- **depth_anything_small**: `{"available":true,"license":"Apache-2.0 Small only","commit":"a561b84"}`
- **blender**: `{"path":"C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe","found":true,"source":"ProgramFilesGlob","requiredFor":["BuildingGeneratorThreeJS","bene-proggen-maps"]}`
- **building_generator**: `{"available":true,"path":"C:\\Users\\user\\Desktop\\3дгенерация\\BuildingGeneratorThreeJS"}`
- **procgen_maps**: `{"available":true,"path":"C:\\Users\\user\\Desktop\\3дгенерация\\bene-proggen-maps","license":"GPL-3.0"}`
- **godot_voxel_factory**: `{"available":true,"engine":"Godot 4.x glTF + tscn stub + voxel json","voxelsrv":true,"littlecubes":true}`
- **voxel_tools**: `{"voxelsrv":true,"littlecubes":true,"hytopia":true}`

## AUTO mode
- Choice: `trellis2_or_instantmesh` — TRELLIS source ready, will try TRELLIS on Linux CUDA else InstantMesh fallback
- Fallback chain: TRELLIS.2 (Linux+CUDA) → InstantMesh (`майн/InstantMesh`, INSTANTMESH_GPU_WORKER_SERVER_BRIDGE) → placeholder GLB + diagnostic

## Extended tools detected
- **InstantMesh** — `C:\Users\user\Desktop\майн\InstantMesh` @ 08822c5
- **voxelsrv** — `C:\Users\user\Desktop\майн\voxelsrv` @ 6e1c07b
- **LittleCubes** — `C:\Users\user\Desktop\майн\LittleCubes` @ 7d1ff0c
- **mcp-blender** — `C:\Users\user\Desktop\майн\mcp-blender` @ c3bfcd1
- **UPNG.js** — `C:\Users\user\Desktop\майн\UPNG.js` @ 88f504b
- **UniRig** — `C:\Users\user\Desktop\майн\UniRig` @ 6793c66
- **mpfb2** — `C:\Users\user\Desktop\майн\mpfb2` @ 437dd513
- **graphify** — `C:\Users\user\Desktop\майн\graphify` @ b14b52e
- **graphify-godot** — `C:\Users\user\Desktop\майн\graphify-godot` @ cd3d27c
- **Gut** — `C:\Users\user\Desktop\майн\Gut` @ cf45f66
- **hytopia-source** — `C:\Users\user\Desktop\майн\hytopia-source` @ 44f2a42
- **apngasm** — `C:\Users\user\Desktop\майн\apngasm` @ f105b2d
- **godot-gdscript-toolkit** — `C:\Users\user\Desktop\майн\godot-gdscript-toolkit` @ f61a1f3

## Godot voxel factory
- GLB is always Godot 4.x glTF importable; worker emits `godot_import.tscn` + `godot_voxel.json` alongside every GLB for auto pipeline. Existing `apps/voxel-world` untouched.

## Notes
- Heavy weights/repositories are not copied into Git; the worker references them via environment paths (`TRELLIS2_HOME`, `DEPTH_ANYTHING_HOME`, `INSTANTMESH_HOME`, etc.) and can clone pinned commits on a Linux GPU host.
- TRELLIS.2 is Linux-only and requires NVIDIA CUDA with 24GB+ VRAM per upstream docs — Windows smoke tests will report unavailable and fallback to InstantMesh placeholder.
- Depth Anything V2 Small (Apache-2.0) is the default; Base/Large/Giant are intentionally not enabled.
