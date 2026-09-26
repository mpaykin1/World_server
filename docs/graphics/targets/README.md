# Fog Frontier — official geothermal cinematic visual target

**Reference ID:** `WORLD-GFX-FOG-FRONTIER-20260925`  
**Project:** World Server / «Цепная реакция» / «Туманный рубеж»  
**Artist-provided source:** user-attached 864×1536 JPEG, SHA-256 `748039272d09a5294c461be9cae83db205db4c58fc8272445f337c820020777a`  
**Repository visual proxy:** [compressed 280px AVIF](./fog-frontier-geothermal-2026-09-25.avif), derived from the exact user-supplied source; the smaller proxy is for durable code-review lookup, **not the original-resolution file**. Target image can be cited by this stable ID and SHA.

![Official cinematic geothermal target](./fog-frontier-geothermal-2026-09-25.avif)

## Required art direction
- Composition: enormous detailed geothermal complex in foreground/middle-ground, violently glowing stratovolcano and dark ridges on horizon, dramatic multi-layer steam and dense atmospheric depth; preserve visual navigation and interactive objects.
- Geometry: hero hyperboloid cooling tower, turbine hall, pipes with flanges and valves, catwalks, guardrails, cable conduits, rooftop vents and service modules; detail concentrated in hero focal zones.
- Materials: realistic rough concrete, brushed/weathered steel, lava cracks, emissive windows and warning lights, baked AO/normal details; consistent physically-based material scale.
- Lighting: cold dusk/blue-black global fill with warm volcano backlight, lava fissures, street lights, industrial window glow, glowing steam edges; readable silhouette even on low-end mobile.
- Rendering: real distance culling behind fog, LOD, material batching, static light baking and layered cards; CPU-precompute costly source art and use existing Three.js runtime. Fog itself is **not** culling.
- Responsive: preserve readable UI, mobile controls, gameplay interactions and real-world geometry/collision.

## Evidence gates
`source_tested` is not `visually_approved` or `live_verified`.
Automated tests must measure fully loaded geometry; capture identical deterministic desktop and real-phone views; log loaded/visible chunks, draw calls, triangle counts, p50/p95 frame times and visible quality against the source. Human art-direction comparison must explicitly verify **player-visible impact >85%** before any testing URL can be offered; never assign this percentage to an unreviewed screenshot.
The existing procedural CPU demo and optional AI3D viewer pack are **not** visually equivalent to this reference, are visual-only in the viewer, and do not prove real game-state integration. Independent review and canonical deployment are separate gates.

**Related:** issue #294, draft PR #298, existing Golden Painting atmosphere, Chain Reaction gameplay/Graphics owner. Preserve exact-source SHA and update visual proxy when higher-resolution source is transported into the repository.
