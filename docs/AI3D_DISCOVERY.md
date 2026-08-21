# AI3D Auto-Discovery (2026-08-21T15:16:28.987Z)

Scanned automatically from:
- `C:\Users\user\Desktop\3дгенерация`
- `C:\Users\user\Desktop\майн`

## Primary pipeline
- **TRELLIS.2** — READY — `C:\Users\user\Desktop\3дгенерация\TRELLIS.2` @ `75fbf01`
- **Depth-Anything-V2** — READY — `C:\Users\user\Desktop\3дгенерация\Depth-Anything-V2` @ `a561b84`
- **BuildingGeneratorThreeJS** — READY — `C:\Users\user\Desktop\3дгенерация\BuildingGeneratorThreeJS` @ `74cb71b`
- **bene-proggen-maps** — READY — `C:\Users\user\Desktop\3дгенерация\bene-proggen-maps` @ `ed622c5`

## Blender
- Path: `blender` — NOT FOUND (required for building/map modes)

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

## Notes
- Heavy weights/repositories are not copied into Git; the worker references them via environment paths (`TRELLIS2_HOME`, `DEPTH_ANYTHING_HOME`, etc.) and can clone pinned commits on a Linux GPU host.
- TRELLIS.2 is Linux-only and requires NVIDIA CUDA with 24GB+ VRAM per upstream docs — Windows smoke tests will report unavailable.
- Depth Anything V2 Small (Apache-2.0) is the default; Base/Large/Giant are intentionally not enabled.
