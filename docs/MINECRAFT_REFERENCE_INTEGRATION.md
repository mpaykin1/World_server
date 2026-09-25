# Minecraft-reference technology transfer: browser + Godot

Reference: https://github.com/Prokopiy8247/Claude-Opus-5.5-Minecraft
Reference tree inspected: `ba1dd531528a2aa4bed14d4dd3c18da5730264d2`.

**License gate:** the inspected reference repository tree contains no LICENSE
file. Public access and downloadable releases are not a redistribution
license. No third-party code, artwork, audio, shaders or game binaries were
copied. This implementation uses independent World Server code and common
voxel-streaming design principles.

## Integrated in this change
- Browser: deterministic nearest-first chunk scheduling with a two-chunk
  loading budget, respecting existing adaptive view-distance controls.
- Browser: block edits invalidate cardinal *and diagonal* loaded neighbors at
  chunk corners, so ambient-occlusion seams can be refreshed.
- Godot: matching deterministic chunk planner, including negative-coordinate
  border invalidation. Native scene streams per-chunk MultiMesh surfaces around
  its camera instead of allocating the entire demo grid at startup.
- Both retain the *existing* WorldGen formulas and block/biome palette; this
  is another renderer of the same World Server world, not a second simulator.

## Validation
- `node --test test/voxel-chunk-planner.test.mjs`
- `node --check apps/voxel-world/client.js`
- `node --check shared/voxel-chunk-planner.mjs`
- `npm run check:fast` and the existing `godot-web-preview` PR workflow.
- The native `--smoke-test <seed>` remains compatible with terrain parity
  checks. `--chunk-plan-test` emits parity vectors for the new planner.

## Not transferred yet
Volumetric Godot mesh generation, worker-thread streaming, block textures,
dynamic lighting, fluids, AI, models, sounds, and shaders remain out of scope.
They need original implementations or explicit reuse permission, plus
performance and browser/mobile validation before any production deployment.
