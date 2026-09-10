# ArmorPaint → World Server Material Forge

## Integration boundary

ArmorPaint is an optional authoring application. It is not shipped to players and is not required by the server, Cloud Run or browser runtime. World_server consumes only verified exported PBR maps and always keeps its procedural material/microdetail fallback.

The canonical path is:

`ArmorPaint project → World Server export preset → strict importer → deterministic registry → adaptive existing Three.js renderer`

This reuses World Quality V4 and Universal Voxel Microdetail. It does not create another renderer, collision system, asset registry or automation worker.

## Export from ArmorPaint

1. Copy or import `data/material-forge/armorpaint-world-server.json` as an ArmorPaint export preset.
2. Export 8-bit PNG maps. Use 512 or 1024 pixels for repeated world materials and at most 2048 for important assets. Runtime maps above 4096 are rejected; 16K is never admitted to the web build.
3. Place the exported files in `shared/materials/<material-id>/` and name them with one unambiguous channel token:
   - `<id>_basecolor_HIGH.png`
   - `<id>_normal_HIGH.png`
   - `<id>_orm_HIGH.png`
4. Optional tier suffixes are `SAFE`, `BALANCED`, `HIGH`, and `ULTRA`. Multiple tier variants let the runtime choose the largest asset inside the current device budget.

The ORM map follows the glTF/Three.js convention used by Material Forge: red = ambient occlusion, green = roughness, blue = metallic. Normal output uses the OpenGL orientation (`nor_g`), not the DirectX-inverted green channel.

## Import on a feature branch

```bash
npm run material-forge:import -- \
  --source shared/materials/gothic-stone \
  --id gothic-stone \
  --name "Gothic Stone" \
  --class stone \
  --author "Artist name" \
  --license project-owned \
  --project gothic-stone.arm \
  --mapping triplanar \
  --semantics stone,brick \
  --worlds voxel-world,ai3d-voxel-city
```

The importer refuses to write on `master`, arbitrary remote URLs, path traversal, symlinks, unsupported formats, non-power-of-two maps, missing provenance, invalid ORM evidence, oversized files and runtime dimensions above 4096. It records exact byte counts, dimensions and SHA-256 hashes, then recompiles `shared/material-forge-registry.json` deterministically.

Run the drift/security check with:

```bash
npm run material-forge:check
```

The same check is part of `npm run check` and therefore of the full release gate.

## Runtime behavior

- `SAFE`: base color only, up to 512 px.
- `BALANCED`: base color + ORM, up to 1024 px.
- `HIGH`: base color + normal + ORM + emissive, up to 2048 px.
- `ULTRA`: all approved channels, up to 4096 px.
- A sustained performance drop lowers both microdetail and Material Forge together.
- UV meshes receive native Three.js maps. Voxel/UV-less surfaces use the shared triplanar shader path.
- Missing, rejected or failed maps leave the procedural PBR/microdetail result intact.
- Height/displacement is ignored unless a specific material explicitly sets `material.userData.materialForgeAllowDisplacement = true`.

Materials are selected automatically from their semantic class. A specific asset can opt into an exact recipe with:

```js
mesh.userData.materialForgeId = 'gothic-stone';
```

## Honest readiness boundary

The repository integration, validation, deterministic registry, adaptive binding and procedural fallback can be verified without ArmorPaint or a discrete GPU. A particular authored texture set is not production-verified until its real exported files, exact hashes, browser screenshots and mobile/desktop performance evidence pass Fleet QA. Visual baselines remain human-approved and cannot be rewritten by the importer.
