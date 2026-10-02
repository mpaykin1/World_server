# Silhouette line quality — FAILURE

Date: 2026-10-02

User decision: **FAILURE** for the visual quality of the current silhouette line.

## What failed

The 3D silhouette system works, but the visible contour is not yet artistically strong enough.

Compared with the desired Living Light sketch, the current line is too plain:

- mostly uniform white;
- nearly uniform width;
- weak luminous falloff;
- no hot inner core + warm outer halo separation;
- no rich gold / amber color gradient;
- no soft bloom that feels emitted by light;
- no subtle irregularity, filament detail or fur-like edge energy;
- the contour reads as a technical postprocess outline rather than a living light source.

## Root cause

The baseline fragment shader derives the edge with a small set of radial max samples around the binary mask, then adds:

- one white near-edge term;
- one white far-glow term.

This is enough to prove silhouette extraction, but it is not enough to reproduce the sketch quality.

The current architecture uses hard max-distance dilation rather than a layered luminous profile. It does not model a bright core, several falloff radii, warm spectral shift, or local intensity variation.

## What must change before line quality can be called success

1. Separate the contour into at least three energy bands:
   - near-white hot core;
   - golden primary line;
   - soft amber/orange halo.
2. Replace the single max-style glow with smoother weighted falloff / blur.
3. Add small controlled intensity variation along the rim.
4. Add optional micro-filaments / fur-edge wisps without destroying silhouette readability.
5. Preserve temporal stability: no noisy crawling or flicker.
6. Keep the 3D silhouette architecture unchanged; improve only the rendering of the extracted rim.

## Acceptance rule

Do not mark line quality as SUCCESS until the user explicitly confirms that the emitted-light appearance is close enough to the target sketch.

## Reusable lesson

A technically correct silhouette edge is not the same thing as a beautiful luminous line.

**3D motion system: SUCCESS.**
**Current line rendering quality: FAILURE.**
