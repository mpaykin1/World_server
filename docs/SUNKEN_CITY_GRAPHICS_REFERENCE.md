# Sunken City | graphics production reference

This is a **user-supplied reference library**, not a replacement for a production game.
It is the canonical donor for teaching World_server agents how to construct and
improve procedural pixel-art, isometric sprites, voxel assets, animations and lighting.

## Quick entry points (stable after merge)

- Browser-ready standalone visual catalog: `apps/sunken-city-reference/index.html`.
- Original complete 1,405-file asset pack: `assets/graphics-reference/sunken-city/v1/sunken-city-pack.zip`.
- Small, AI-readable catalog: `assets/graphics-reference/sunken-city/v1/manifest.json`.
- Rebuildable Python generator: inside the original ZIP at `sunken-city-pack/src/build.py`. Browsable source copies are under `assets/graphics-reference/sunken-city/v1/src/` (two over-limit original files are stored as `.py.txt` reference text).
- Machine-readable transfer contract: `.ai/sunken-city-graphics-reference.json`.
- Gate: `node scripts/check-sunken-city-reference.cjs`.

## What to learn and transfer

1. Use one consistent voxel-to-pixel scale: **16 voxels = 1 block = 1 meter**;
   terrain tiles are 16x16 px. Do not mix incompatible world scales.
2. Read `src/assets/*.py` for shapes, poses, voxel materials and clips;
   `src/voxelize.py` + `src/mesher.py` for geometry;
   `src/render.py`, `src/ramps.py`, `src/pixel.py` for shaded pixel art;
   `src/export.py`, `src/gltf.py` for 2D / 2.5D / 3D exports.
3. Apply the **same semantic asset** across 2D side view, directional isometric
   sprite sheets, sprite-stacks, and actual animated GLB / VOX / OBJ.
4. Preserve directional frames, frame size, fps, animation clips and filenames
   from the manifest. The `*_glow.png` mask is separate from the opaque art;
   render with additive glow/bloom, not as a substitute for geometry.
5. Maintain coherent color ramps, top-left illumination, silhouette and
   spatial depth. Study 5-layer parallax, autotiling edges and animated terrain.
6. Transfer the **methods**, not the underwater aesthetic by default:
   new islands may use forest/gothic/futuristic palettes while retaining
   material grammar, coherent shadowing, animated details and matched scales.
7. Reduce CPU/GPU/draw-call cost by keeping a seeded asset catalog,
   reusing atlases and geometry, frustum/chunk culling and capped animation
   work. Measure FPS and memory on desktop and iPhone-sized viewports.
8. A successful integrity test proves archive correctness, **not** visual
   similarity or quality. For an actual graphics improvement show before/after
   captured from the real playable app, functional animations and FPS deltas.
   Record `PLAYER_VISIBLE_PERCENT` only from direct evidence. No invented >85%.
9. Never label an implementation user PASS or FAIL: the owner alone decides;
   preserve results for a later owner verdict and only then record success/failure
   learning. Do not create another AKA scheduled task.

## Rebuild and smoke tests

Use a disposable directory outside the repository, extract the archive there,
install only free `numpy` and `Pillow` as needed and run
`python src/build.py --only glow_fish_teal --no-zip` as a cheap generator smoke test.
To reproduce the entire pack run `python src/build.py` with a clean disposable
workspace and budget adequate CPU time. Output goes into `out/pack`.
Never regenerate and overwrite these accepted source bytes automatically.

The full pack is ZIP-only in git to avoid adding 1,405 individual binary files
and slowing all developers/agents. The `src/` and manifest are extracted separately
for immediate code search and new-chat discovery.

## Provenance and constraints

These bytes came from user uploads on 2026-10-16. Exact archive and HTML SHA256
are pinned in the machine contract and enforced by test. Asset provenance / licenses
beyond user supply are **not independently audited**; review third-party content
before redistributing in unrelated projects. No secrets or paid APIs required.

This is a graphics-technique reference, not an automatic license grant, a
measured similarity score, or proof that any game has already improved.

The original catalog HTML is at `assets/graphics-reference/sunken-city/v1/catalog.html`; `apps/sunken-city-reference/index.html` is the light fullscreen viewport wrapper.
