# Godot Voxel Game Starter

Mandatory baseline for every new Godot voxel-art project on World_server.
Read `data/godot-voxel-game-baseline.json` for the machine-checkable rules
this template encodes. Every rule below was learned the hard way in the
`dark-void-scene` project on 2026-08-28 - see
`data/error-prevention-registry.json` for the specific bugs that produced
each rule. Do not rediscover these; copy the pattern.

## The one hard rule: 5:1 voxel scale

**Hero/character voxels are always exactly 5x smaller than world/terrain
voxels.** This is a standing user requirement, not a per-project choice.

```gdscript
const WORLD_VOX := 0.34   # terrain/mountain/structures
const HERO_VOX := WORLD_VOX / 5.0   # player, NPCs, any "hero" subject
```

A hero built at world scale reads as a flat sheet pasted onto the world
instead of a distinct, detailed subject. 5x finer voxels at 5x smaller
overall size is what makes a hero read as an object IN the world rather
than a wall THE SAME AS the world.

## Camera: true orbit, not first-person-with-an-offset

Copy `orbit_camera_rig.gd` as-is (rename the class, keep the structure).
The critical detail: **the rig node's own `position` must be `(0,0,0)`,
exactly at the tracked subject's origin.** The camera's actual
back/up offset lives in the rig's *internal* `_ready()`-built child
(`camera.position = Vector3(0, height, distance)`), never as a second,
duplicate offset set on the rig node itself in the scene file.

Getting this wrong is invisible until you actually test it: the camera
still orbits *something*, movement still "looks correct" in a static
screenshot, and only a real yaw sweep reveals the tracked subject drifting
off-frame instead of staying centered. Verify with `game_eval`:

```gdscript
# before and after a real yaw change, the subject's own global_position
# must be IDENTICAL - only the camera moves.
```

Movement lives on the SUBJECT (the hero), not the rig: the hero moves
relative to whichever way the rig currently faces (`rig.global_transform.basis`),
never the reverse.

## World is static, hero is free

The world/terrain and the hero are SIBLINGS, never parent/child. A world
object parented under the hero drags the whole world along when the hero
moves - invisible at rest, only obvious once you actually move and check
that the world's `global_position` hasn't changed. If a "hero embedded in
the world" look is wanted at spawn, position the hero AT the world
object's socket coordinates; do not achieve it by parenting.

## Materials: white base + per-instance palette, capped hard

```gdscript
mat.albedo_color = Color(1, 1, 1)
mat.vertex_color_use_as_albedo = true
mat.roughness = 0.8   # NEVER 1.0 - a roughness=1.0 material can't take a
                       # specular highlight from any light, so a rim/key
                       # light can never define its silhouette edges.
```

Then set REAL per-instance colors (not a grayscale brightness multiply)
by lerping between measured dark/mid/lit palette anchors - extract them
from the actual reference image if one exists, don't guess hex values.
**Cap the lerp hard** (max ~15-20% of the way toward the lit anchor for
most voxels, pow() curve so only true edge/surface voxels move at all).
A first attempt at full palette strength will read as a uniform warm
wash across the whole silhouette - this is the single most common
mistake making this pattern, budget an iteration for it.

## Lighting: dedicated rim/key light, sky_mode = LIGHT_ONLY

```gdscript
# DirectionalLight3D, angled to graze across the hero/terrain silhouette
light.sky_mode = 1  # LIGHT_ONLY - otherwise it paints an ugly sun disc
                     # in what's supposed to be a dark/void sky
```

## Rendering driver for older/integrated GPUs

If the target machine has an old/weak GPU, Forward+ can silently crash on
device selection with zero error output. Set in `project.godot`:
```
[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
```
and launch with `--rendering-driver opengl3`. Volumetric fog does NOT
work under gl_compatibility (silent engine warning, not a crash) - don't
rely on it for atmosphere on such a target; use exponential/height fog
(`fog_density`, `fog_height`, `fog_height_density`, `fog_aerial_perspective`)
instead.

## Verify with a REAL standalone run, not just editor Play

A `var x := expr` that Godot's static analyzer can't type (generic
builtins like `max()`/`min()`/`clamp()` instead of `maxi`/`minf`/`clampf`,
or when calling a method that returns Variant) is only a WARNING in the
editor's live Play session, but the same project can silently treat it as
a hard parse error when run as a real standalone build - the affected
script fails to load entirely and whatever it controlled (often the
camera) never runs, with no player-visible error, just a blank/grey
screen. Always give `var x := ...` an explicit type when its source is a
generic builtin. Before calling any Godot task done, launch it for real:
```
<godot_editor.exe> --path <project> --rendering-driver opengl3
```
(not `--editor`) and check the console output for `SCRIPT ERROR` /
`Parse Error` lines - a screenshot alone does not catch this class of bug.

## MCP tool gotcha (godot-ai)

`node_create`'s parent parameter is `parent_path`, not `parent`. Passing
`parent` is silently accepted and ignored - the node lands at the scene
root instead of erroring. Always use `parent_path`.

## Files in this template

- `orbit_camera_rig.gd` - the proven camera rig, copy as-is.
- `voxel_noise_utils.gd` - shared `_hash2`/`_fbm1` helpers so every
  generator script in a project doesn't reimplement its own copy (this
  happened 4 times in dark-void-scene before being worth fixing here).
