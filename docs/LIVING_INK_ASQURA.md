# Living Ink / ASQURA graphics stack

## Status

First vertical slice. The runtime is deliberately dependency-free so the first standalone artifact can be audited and run offline without CDN/API/model/texture requests.

## Pipeline

`WorldRecipe -> procedural layout -> procedural props/characters -> behavior state -> Living Ink primitives -> artistic LOD -> painter/depth ordering -> standalone compiler -> autonomous HTML`

Current reusable modules:

- `shared/living-ink-core.js` — seeded projection, selective ink primitives, paper background, translucent washes, soft contact shadows, glass, depth fade and distance-driven artistic LOD.
- `shared/living-ink-office.js` — parameterized office people, suit details, office props, deterministic behavior cycle, reusable animation actions and room assembly.
- `lib/living-ink-compiler.js` — validates a WorldRecipe and embeds runtime + recipe into one self-contained HTML.
- `scripts/build-living-ink-office.js` — reproducible build command for the first recipe.

The reference style is intentionally non-photorealistic: cream paper, thin blue-gray line work, watercolor-like translucent masses, sparse detail and stronger simplification with distance.

## First slice contract

One office room, two desks, monitors, chairs, plants, coffee machine, three procedurally distinct suited employees, `walk`, `sit`, `type`, `coffee`, deterministic seeded variation, and three artistic information levels (near/medium/far). The HTML must continue to animate after network access is removed.

## License policy and discovery record

No external implementation is imported in this first slice. This avoids prematurely inheriting an engine or asset license. Candidates researched for later GLB/mesh stages:

| Candidate | Official upstream | Observed license | Potential use | Decision for this slice |
|---|---|---|---|---|
| three.js | https://github.com/mrdoob/three.js | MIT | optional WebGL geometry backend | not imported; existing World Server rendering should be reused first |
| meshoptimizer | https://github.com/zeux/meshoptimizer | MIT | mesh simplification/compression, later GLB factory | audit-only; pin exact tag/commit and SHA before import |
| glTF-Transform | https://github.com/donmccurdy/glTF-Transform | MIT | reproducible GLB optimization/export | audit-only; pin exact version/commit and SHA before import |

Important: code and asset licenses are never inferred from each other. Example/model/font/texture folders require their own provenance review even when an engine's source code is MIT.

`third-party-manifest.json` is deny-by-default. `scripts/check-third-party-licenses.js` blocks unknown/non-allowlisted licenses, missing provenance hashes/import lists, missing notices, or entries not explicitly marked for commercial use. Assets allow only CC0/Public Domain by default; code allowlist is 0BSD/Unlicense/MIT/Apache-2.0.

## Next slices

1. GLB adapter with edge/crease extraction and hidden-line support.
2. Server-side simplified mesh + impostor/sprite atlas factory under a stable `asset_id`.
3. Larger office grammar with collision-free furniture/door placement and navigation graph.
4. Rig/retarget adapter for richer animation clips without changing the procedural fallback.
5. Measured browser performance gate: FPS, p95 frame time, draw calls, primitive/triangle counts, heap, load time and artifact bytes.
6. Reference-image browser capture and visual gate before any public test link.
