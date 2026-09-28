---
name: pixel-parallax
description: Build and integrate original procedural pixel-art multi-plane parallax for World Server, its web games and Godot 4.x.
---

# Pixel Parallax — World Server

Use this skill when a user asks for pixel art, living 2D backgrounds, Godot ParallaxLayer/Parallax2D, a seemingly deep 2D city, animated skyline, looping backgrounds, or a visual reference with several independently moving planes.

## What was learned from the user's 41-second reference

A moody blue-grey pixel-art city with warm illuminated windows, clouds, wires, a patterned concrete wall and tiny walkers looks spatial because the planes move at **different fractions of the same camera displacement**. The clip shows an older Godot ParallaxLayer inspector (Motion Scale and Mirroring). In new World Server Godot 4.x scenes, prefer modern Parallax2D with scroll_scale and repeat_size. The browser equivalent has been implemented in shared/graphics/pixel-parallax.mjs.

The reference is a **method and art direction**, not licensed game assets. Create original city/building/ground/sky sprites, procedural tiles and animations. Never extract third-party pixel-art images from the video and claim them as original.

## Required routine before changing anything

1. Read AGENTS.md, WORK_IN_PROGRESS.md, app release gates, and the current app or Godot scene.
2. Get fresh master SHA; keep dirty worktrees intact; work in a new ai/* branch and PR, never direct master push.
3. Reuse shared/graphics/pixel-parallax.mjs and apps/parallax-lab. Do not create a second engine or replace existing 3D graphics.
4. Preserve simulator state, controls, mobile interaction, save files and existing 3D camera.

## Style and layering recipe

- Original moody pixel-art: muted slate/steel blue sky, warm amber windows, dark rooftops, thin crooked power cables, railings and relief wall tiles.
- Five logical planes, one shared camera: sky 0.0, clouds 0.12, distant skyline 0.27, main city 0.55, foreground wall/fence/poles 1.0. Tweak per game camera but maintain strictly increasing motion with proximity.
- Paint separate transparent images, nearest-neighbour texture filtering, pixel snapping and positive modulo for negative camera displacement.
- Add small movement: slow clouds, sparse snow/haze, tiny walkers and occasional modest window shimmer. Avoid flashing lightning or forced camera shake. Respect reduced-motion settings.
- Generate from a stable world seed so each world's atmosphere reproduces after reload. Enhance selected layers later with own APNG or GLB models without delaying first playable delivery.
- No gameplay collision on distant layers. Put interface in its own top layer and do not let visual canvas block build clicks.

## Browser integration

The repository includes a standalone original working procedural demonstration at apps/parallax-lab/index.html and reusable code at shared/graphics/pixel-parallax.mjs. It is an isolated example, not a replacement of Chain Reaction's main game.

~~~js
import {createPixelParallax} from '/shared/graphics/pixel-parallax.mjs';
const background = createPixelParallax(document.querySelector('#background'), {seed: world.seed});
function onCameraMoved(cam) { background.setCamera(cam.x); }
function onResize() { background.resize(); }
function onClose() { background.dispose(); }
~~~

Use pointer-events:none for a decorative canvas. If the parallax demo owns the input, support pointer capture with pointerup/pointercancel, one-finger swipes, A/D and arrows. Match its camera position to the **actual gameplay camera**, not its own random ticker.

## Godot 4.x adapter

In a new 2D scene create one Parallax2D node for each separated Sprite2D texture. A single Camera2D drives all nodes. For example:

~~~gdscript
var clouds := Parallax2D.new()
clouds.scroll_scale = Vector2(0.12, 1.0)
clouds.repeat_size = Vector2(960.0, 0.0)
clouds.repeat_times = 3
add_child(clouds)

var image := Sprite2D.new()
image.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
image.centered = false
image.texture = preload("res://art/parallax/clouds.png")
clouds.add_child(image)
~~~

Use separate Parallax2D nodes at x scroll scales 0.27, 0.55 and 1.0 for distant buildings, city and foreground. repeat_size.x must be the actual seam-free texture width, not arbitrary; repeat_times covers the widest target viewport. Existing Node3D in godot/world-client/main.tscn MUST NOT be changed into a 2D root. For 3D games use a dedicated 2D scene / SubViewport or implement equivalent depth-background layers in the existing world camera.

Official Godot 4 documentation: https://docs.godotengine.org/en/4.4/classes/class_parallax2d.html ; https://docs.godotengine.org/en/4.4/tutorials/2d/2d_parallax.html

## Acceptance and release gate

Run node --test test/pixel-parallax.test.mjs, npm run check and desktop/mobile browser interaction tests on exact target SHA. Verify positive and negative camera movement, repeat without blank gaps, mobile swipe and clickable gameplay controls. Keep a pair of genuine before/after camera screenshots and FPS measurements. Do not claim numerical style-matching scores without measurement. The user's production gate requires demonstrated >85% user-visible readiness and blockers eliminated. Never give an unverified demo link or temporary preview as a finished release. Review PR before merge, then verify the exact stable production URL live and only then send it.

Next improvement after proving real browser integration: replace procedurally generated foreground details with original animated APNG sprites. Fold the work into an **existing** AKA graphics task, not a sixth automation.
