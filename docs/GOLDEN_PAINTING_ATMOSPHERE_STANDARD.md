# Golden Painting & Atmosphere Standard

This is the canonical visual-depth and day/night rule for every playable World Server world.

## Painting depth

- Foreground: warmer local colour, strongest useful contrast, clearest texture and edges.
- Midground: moderated warmth, saturation, contrast and detail; keep the compositional focus readable.
- Background: progressively atmosphere-tinted, usually cooler/bluer, less saturated, lower contrast, softer and less detailed.
- The warm-near / cool-far rule is a daylight tendency, not an absolute law. Sunset, sunrise, fog, smoke, dust, snow and world-specific atmospheres may warm, neutralise or recolour the distance.
- Engine implementation should prefer real fog/aerial perspective and lighting over a flat screen filter. Fallback canvas treatment is allowed only where the renderer cannot expose depth.

## Canonical time cycle

Natural order: **Day → Sunset → Night → Sunrise → repeat**.

| Phase | Duration |
| --- | ---: |
| Day | 60 s |
| Sunset | 60 s |
| Night | 10 s |
| Sunrise | 60 s |
| Full cycle | 190 s |

Transitions are continuous; sunrise and sunset pass through warm atmospheric colours while night lowers exposure and contrast without making gameplay unreadable.
## Night illumination vocabulary

Every world may select emitters appropriate to its lore. The shared runtime supplies a low-cost baseline and worlds can add their own:

- very bright stars and a readable moon with moonlight;
- meteor streaks and occasional distant comets;
- aurora / atmospheric glow;
- fireflies, luminous spores and floating bioluminescent wisps;
- luminous crystals or magical minerals where appropriate;
- lanterns, street lamps, beacons and lit windows;
- campfires, embers, furnaces and torches;
- lightning and storm flashes where weather systems allow it.

Night lights must guide the eye rather than fill every surface. Nearby lights may be warmer; distant night haze should normally remain cooler and lower contrast.

## Runtime contract

Canonical implementation: `shared/golden-painting-atmosphere.js`.

Playable worlds load the shared runtime before their renderer. Three.js worlds register their scene so the standard can control fog, tone mapping, world lights and celestial lighting. Raw/custom WebGL worlds must feed the shared phase state into their own shader and apply aerial-perspective mixing by distance.

For QA, append `?goldenPhase=night&goldenAtmosphereDebug=1` (or `day`, `sunset`, `sunrise`) to a world URL. `goldenProgress=0..1` can pin a point within sunrise/sunset for deterministic visual checks.
