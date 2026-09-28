# Pixel Parallax Lab — original moving pixel-art city

The uploaded 41-second reference depicts a Godot parallax effect in a moody pixel-art city. The implementation takes the **technique** (different scroll factors per plane and seamless repeats) and generates all new art procedurally; third-party sprites from the clip are not redistributed.

The World Server browser module shared/graphics/pixel-parallax.mjs is dependency-free. Its five relative speeds are sky 0, clouds .12, skyline .27, city .55 and foreground 1. It generates original buildings with warm windows, clouds, poles, electric wires, an iron fence, recessed concrete wall tiles, pedestrians, and moving snow.

Standalone interactive sample: apps/parallax-lab/index.html. Drag with mouse or one finger; use A/D or arrow keys; toggle snow and pause. Add ?static=1 for deterministic screenshot capture. Supports mobile sizing and prefers-reduced-motion.

Browser adapter example:

~~~js
import {createPixelParallax} from '/shared/graphics/pixel-parallax.mjs';
const visual=createPixelParallax(canvas,{seed:world.seed});
visual.setCamera(game.camera.x);
visual.resize();
visual.dispose();
~~~

For integration with Chain Reaction, attach the canvas **behind** the gameplay UI with pointer-events:none and drive camera from real visible map movement. This PR deliberately does not alter the main 3D Godot scene or the cinematic gameplay simulator. Godot Parallax2D equivalent and quality gates: .agents/skills/pixel-parallax/SKILL.md.

Testing: node --test test/pixel-parallax.test.mjs; node --check on both .mjs files; npm run check. Before public release: live browser test on desktop and mobile, screenshot comparators for negative camera movement and seam-free repeating, user-visible readiness >85%, and fresh verification of the stable production URL.
