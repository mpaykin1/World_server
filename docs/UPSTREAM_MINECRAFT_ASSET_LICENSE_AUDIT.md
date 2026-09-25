# Upstream asset licensing audit — 2026-09-26

Source: https://github.com/Prokopiy8247/Claude-Opus-5.5-Minecraft

## Evidence checked
- Root LICENSE: GitHub API 404.
- `Godot Opus 5.5 Minecraft/LICENSE`: GitHub API 404.
- `Unity Opus 5.5 Minecraft/LICENSE`: GitHub API 404.
- `Unreal Opus 5.5 Minecraft/LICENSE`: GitHub API 404.
- Root README says the project's models, code, textures and sounds were created separately from Minecraft. This establishes a claim of original creation, **not** a license to reuse them.
- Godot DEVELOPMENT.md describes scripted Blender models in `GodotMinecraft.blend` and GLB rigs. Unreal DEVELOPMENT.md describes `UnrealMinecraft.blend`, FBX exports and generated procedural PBR. Unity README describes a Blender pipeline. None of those descriptions is a redistribution grant.
- No per-model license, copyright assignment, CC0 declaration, MIT grant or explicit commercial redistribution permission was established in the inspected documents. GitHub public visibility and downloadable releases do not imply such permission.

## Asset disposition
| Candidate | Status | Action |
| --- | --- | --- |
| Godot GLB rigs / Blender .blend models | BLOCKED_LICENSE | Do not import, repackage or redistribute without a documented grant. |
| Unity Blender/FBX models and generated textures | BLOCKED_LICENSE | Do not import or redistribute. |
| Unreal Blender/FBX/.uasset models, texture arrays | BLOCKED_LICENSE | Do not import or redistribute. |
| Upstream original code, sound, procedural texture generator | BLOCKED_LICENSE | Study general techniques only; no code copy. |
| General ideas: CPU asset factory, procedural PBR, worker budgets | INDEPENDENT_REIMPLEMENTATION | Original World Server code/assets only. |
| `tools/generate_original_volcanic_glb.py` | ORIGINAL_WORLD_SERVER | Reproducible original basalt, geothermal and lava GLBs; requires Blender execution and visual review. |

## Permission needed
Ask upstream owner to add an explicit license covering **source code and all asset files**, including Blender sources, GLB/FBX, generated textures, sounds and redistribution/commercial use, with a list of third-party dependencies and exceptions. Preserve any attribution and license notices if permission is granted. Until then, do not present upstream models as portable.

## Delivery gates
Original Blender generator is source-only until executed on CPU and its three exported GLBs are inspected. No claim of validated visual quality, FPS or engine integration is made. Integration into existing Three.js / Godot must pass independent review and graphics gates.
