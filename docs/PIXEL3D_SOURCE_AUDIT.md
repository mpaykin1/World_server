# Pixel2World source audit

Полный исходный набор зафиксирован по конкретным revision:

| Repository | License | Revision | Files | Decision counts |
|---|---|---|---:|---|
| GazPrash/2d-to-3d-voxelizer | MIT | `65ccdf72b564567925a7ff3557960f08b4daed54` | 52 | ADAPT 5 · LEARN-REIMPLEMENT 2 · PRESERVE 5 · SKIP 40 |
| felirami/orthovoxel-studio | MIT | `7cae5a3e640302fa9ef735b453fd4b7a0f4952b1` | 21 | ADAPT 3 · LEARN-REIMPLEMENT 1 · PRESERVE 2 · SKIP 15 |
| CreggHancock/SpriteToVoxel | MIT | `145d30a5911a10e422fe9bf6d489867efa880d48` | 9 | LEARN-REIMPLEMENT 1 · PRESERVE 1 · SKIP 7 |
| JannisX11/blockbench | GPL-3.0 | `e2ede0809ee6bc91f374ac7e00d34cffbdf86a14` | 427 | LEARN-REIMPLEMENT 16 · PRESERVE 80 · SKIP 331 |

**Total: 509/509 files classified.** ADAPT 8 · LEARN-REIMPLEMENT 20 · PRESERVE-FOR-LATER 88 · SKIP 393. No whole repository or foreign framework was imported.

The authoritative per-file list is `data/pixel3d-source-audit.json`. Each source blob has path, size, Git blob SHA, decision and reason. `scripts/pixel3d-source-audit.cjs` is the reproducible deep scanner that additionally reads every local file, calculates SHA-256, line counts and capability hits.

## Decision semantics

- **IMPORT** — direct copy only when uniquely useful and license-safe. Result here: 0; no whole source file needed direct copying.
- **ADAPT** — port only the needed algorithm into World Server conventions.
- **LEARN-REIMPLEMENT** — study behavior/architecture and implement independently.
- **PRESERVE-FOR-LATER** — useful knowledge, not needed in the current capability.
- **SKIP** — duplicate renderer/runtime, generated code, build plumbing, demo asset, irrelevant subsystem, or licensing-risky material.

## What was actually selected

### OrthoVoxel Studio — ADAPT

- `src/lib/voxelEngine.ts`: multi-view orthographic silhouette intersection / visual hull.
- `src/lib/projections.ts`: projection orientation and image normalization.
- `src/types.ts`: minimal multi-view schema concepts.

The React application shell and exporter are not imported because World Server already has rendering, voxel representation and meshing.

### 2d-to-3d-voxelizer — ADAPT

- `backend/generator.go`
- `backend/processor.go`
- `backend/quantizer.go`
- `backend/editor.go`
- `backend/voxel.go`

Useful ideas: distance-based volume priors, palette quantization, sparse voxel editing, face culling. They are not copied as a Go/Wails subsystem.

### SpriteToVoxel — LEARN-REIMPLEMENT

`main.js` is kept only as the simplest baseline/oracle: opaque pixel → voxel. Its useful capability is already superseded by World Server.

### Blockbench — LEARN-REIMPLEMENT only

Blockbench is GPL-3.0. **No Blockbench code is copied into World Server.**

The useful references are image extrusion, cube/mesh editing, undo model, painter/UV/editor behavior, file/project architecture and raycast interaction. They are treated as behavior/architecture references for clean-room implementation.

## World Server duplicate check

World Server already had:
- single-image CPU depth/heightfield reconstruction;
- single-image voxel-city generation;
- palette-index voxel representation;
- chunked greedy surface meshing;
- world/runtime/camera infrastructure;
- microdetail and lighting systems.

Therefore the new code does **not** add another renderer, another world engine, another exporter stack, or another database. The missing capability was multi-view geometric constraint.

## Integrated capability

The new core is `shared/pixel3d/multiview-voxel.mjs`.

For FRONT + RIGHT:
1. normalize both pixel grids;
2. convert alpha/silhouette into hard constraints;
3. evaluate candidate `(x,y,z)` voxels;
4. keep only voxels allowed by every supplied view;
5. fuse palette/color evidence;
6. measure reprojection agreement;
7. emit World Server-compatible `[x,y,z,paletteIndex]`;
8. allow ADD / ERASE / PAINT without mutating source sketches.

The browser lab is `apps/pixel3d-multiview/`.

## Important truth condition

Two orthographic sketches produce a **visual hull**, not omniscient hidden geometry. It is the maximal volume consistent with the supplied silhouettes. A third TOP view removes more ambiguity.

Two arbitrary perspective screenshots need camera pose/FOV estimation before they can be treated as hard geometric projections. That is a separate next layer and must not be falsely presented as exact reconstruction.
