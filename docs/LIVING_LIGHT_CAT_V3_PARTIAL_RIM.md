# Living Light Cat 3D V3 — partial directional rim candidate

Date: 2026-10-04

This V3 starts from the user-approved Living Light Cat 3D V2 geometry/motion baseline and changes only the LIGHT treatment.

## Requested visual behavior

Reference target:
- line thickness is not uniform;
- the cat is not outlined everywhere;
- bright contour appears only where the virtual light reaches the form;
- shadow-side contour can become extremely faint or disappear;
- strongly lit regions receive a thicker gold/amber energy band and bloom.

## Implementation

Canonical shared LIGHT now supports optional directional contour controls:
- `directionalStrength`
- `lightDirection`
- `lightCutoff`
- `lightSoftness`
- `shadowFloor`
- `thicknessVariation`

Defaults keep directional modulation disabled, so accepted older LIGHT consumers preserve their previous rendering.

V3 enables these controls with a warm upper-right key-light profile while reusing the accepted V2 cat rig and motion library.

## Decision boundary

V1 and V2 remain user-approved SUCCESS baselines.
V3 is a new visual candidate and must not be marked SUCCESS/FAILURE until the owner reviews it.
