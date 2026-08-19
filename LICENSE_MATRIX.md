# Voxel World v3 — license / donor matrix

This package does **not** blindly merge donor repositories. The implementation in
`chunk-worker.js` and the v3 client changes are original adaptations built around
our existing World Server architecture.

| Project | License evidence in uploaded archive | v3 use | Rule |
|---|---|---|---|
| HYTOPIA source | root `LICENSE.md`: MIT, © HYTOPIA, Inc. | architecture reference for chunk workers, chunk mesh management, performance metrics | **Do not copy** `assets/` or `sdk/`: they have their own licenses. No HYTOPIA assets/SDK are included here. |
| LittleCUBES | root `LICENSE`: MIT, © Pau Garcia-Mila | reference for chunk lifecycle, modified-world persistence approach, touch/performance UX | No assets copied. Keep MIT notice if literal code is ever imported later. |
| VoxelSrv | `package.json`: `license: MIT` | reference for multiplayer/inventory UX direction | Abandoned project; use only audited pieces or reimplement ideas. No assets copied here. |
| Minicraft | uploaded README states MIT, but uploaded archive has no standalone LICENSE file and package metadata does not carry the license | **ideas only**: sprint FOV, lighting/audio feel | Do not copy source/assets until canonical license is independently confirmed. |
| Three.js r165 | official `LICENSE`: MIT | runtime rendering library; must be vendored locally as `apps/voxel-world/vendor/three.module.min.js` | Keep `THREE_LICENSE`. |

## HYTOPIA exclusions

The uploaded HYTOPIA tree includes separate licenses in `sdk/LICENSE.md`,
`assets/LICENSE.md`, and `assets/release/LICENSE.md`. Those directories are not
covered by the simple assumption that everything is MIT. v3 therefore takes no
HYTOPIA asset or SDK file.

## Commercial-use policy for this project

1. Prefer original implementation of mechanics/ideas.
2. Literal third-party code may only enter the repository after its exact file
   license is verified and the notice is preserved.
3. Never import donor textures/models/audio merely because the donor code is open.
4. Keep this matrix updated when a new donor is used.
