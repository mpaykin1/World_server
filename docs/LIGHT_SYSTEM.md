# LIGHT — canonical World Server luminous-line system

Date created: 2026-10-02  
Canonical name: **LIGHT**

## Purpose

LIGHT is the reusable World Server system for rendering a visually rich luminous contour from real 3D geometry.

It exists so future chats and agents do not rebuild glowing silhouette effects as flat 2D strokes.

Canonical rule:

> **Animate volume; LIGHT renders the line.**

The underlying creature/object remains genuine 3D. LIGHT is a rendering layer placed after the 3D pose and camera projection.

## Architecture

```
3D geometry
→ 3D rig / animation
→ perspective camera
→ color capture
→ silhouette mask
→ normal capture
→ depth capture
→ rim classification
→ screen-space edge distance field
→ art-directed intensity zones
→ stable micro-filaments
→ hot core / gold band / amber halo
→ motion-aware temporal stabilization
→ HDR half-float bloom
→ tone-mapped final frame
```

## Canonical modules

- `shared/light/index.mjs` — public API.
- `shared/light/pipeline.mjs` — orchestrates capture, rim extraction, stabilization, bloom and composite.
- `shared/light/capture.mjs` — color, mask, normal and depth render targets.
- `shared/light/shaders.mjs` — rim, distance-field, filament, temporal, bloom and composite shaders.
- `shared/light/profile.mjs` — reusable art profiles; default is `livingGoldProfile`.
- `shared/light/whiskers.mjs` — additive 3D luminous splines for whiskers and hair-like curves.
- `apps/silhouette-3d-lab/` — integration proof using real 3D creature animation.
- `test/light-system.test.js` — structural regression contract.

## What LIGHT provides

### 1. Normal-aware rim

The shader reads the view-space normal buffer and increases energy at grazing angles. This prevents the result from behaving like a uniform 2D outline.

### 2. Depth-aware contour

The depth buffer contributes to contour energy around depth discontinuities, preserving a stronger sense of volume.

### 3. Screen-space distance field

LIGHT estimates distance from the silhouette boundary in several radius bands. The distance drives separate core, gold and halo profiles.

### 4. HDR luminous profile

Default Living Gold profile:

- near-white hot core;
- saturated gold primary band;
- amber/orange halo;
- half-float render targets so light energy can exceed ordinary display range before tone mapping.

### 5. Bloom

A two-stage Kawase-style blur spreads high-energy light into a soft halo. Bloom is composited separately from the sharp line.

### 6. Stable micro-filaments

Small edge energy variations are generated from screen-space stable hashes, not frame-random noise. They add a hair/light-filament quality without crawling every frame.

### 7. Motion-aware temporal stability

The current frame is blended with history only where frame-to-frame energy remains similar. Large changes reject history to reduce trails when a head or tail moves.

### 8. Art-directed zones

The default profile has independent top / middle / bottom gains. Future object-specific profiles may override them without changing shader code.

### 9. 3D light curves

`createLightWhisker` and `createLightWhiskerBundle` provide additive 3D curves for whiskers, antennae, hair strands and other thin luminous elements.

### 10. Anti-aliasing strategy

LIGHT uses soft shader edges and expects the host renderer to keep MSAA/high-DPI antialiasing enabled. Fine curves are kept separate from the silhouette mask.

## Public API

```js
import {
  LightPipeline,
  livingGoldProfile,
  createLightWhiskerBundle
} from '/shared/light/index.mjs';

const light = new LightPipeline({
  renderer,
  colorScene,
  maskScene,
  camera,
  width,
  height,
  profile: livingGoldProfile
});

light.render(timeSeconds);
light.resize(width, height);
light.setProfile({ bloomGain: 1.7, filamentGain: 0.3 });
```

## Relationship to prior user decisions

The user explicitly marked the underlying **3D silhouette system as SUCCESS**.

The user explicitly marked the previously observed plain line quality as **FAILURE**.

The user later explicitly marked the deployed **Living Light Cat 3D** proof as **SUCCESS**. Canonical accepted proof: `https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d/`, accepted production merge SHA `f044aa498b94618bab4d2590b140d7aa4695fdc4`. Full handoff: `LIVING_LIGHT_CAT_3D_SUCCESS.md`.

This SUCCESS belongs to that reviewed proof. Future LIGHT variants still require their own user decision.

## Rule for future chats

When a user asks for glowing contours, living light, luminous silhouettes, golden rim creatures, glowing whiskers or similar effects on World Server:

1. search for **LIGHT**;
2. start from `shared/light/index.mjs`;
3. keep the real 3D geometry/animation underneath;
4. tune a profile rather than rebuilding an outline shader from scratch;
5. never mark visual quality SUCCESS or FAILURE without the user's explicit decision.
