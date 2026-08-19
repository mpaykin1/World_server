# Voxel World Upgrade v3

## What v3 changes

### Performance
- Chunk geometry is generated in Web Workers instead of blocking the main UI thread.
- Opaque voxel faces use greedy rectangle meshing; large flat areas collapse into
  a few quads rather than one quad per block face.
- Desktop uses up to two mesh workers; coarse/mobile devices use one.
- Mesh results are versioned. A stale worker result cannot overwrite a newer edit.
- Neighbor chunks are re-meshed when a boundary changes or a new neighbor loads.
- Render distance adapts to sustained FPS within conservative desktop/mobile limits.
- Pixel ratio is adapted with the render distance instead of letting GPU load grow
  without bound.
- `P` toggles the live FPS / render-distance / mesh-time line.

### Memory / streaming
- Persistent block overrides are indexed per chunk in memory and are released when
  the chunk is unloaded. They are re-fetched from Supabase when the chunk is visited
  again, so travelling no longer grows the override map forever.
- Remote avatars outside the useful render radius are hidden and disconnected
  presences are disposed.

### Multiplayer correctness
- Local edits still feel immediate, but `block_set` is broadcast only after the
  authoritative `/api/voxel` write succeeds.
- Remote block broadcasts are validated before use.
- A received block broadcast schedules a debounced authoritative chunk refresh,
  so a spoofed/late ephemeral Broadcast cannot remain the permanent visual truth.

### API hardening
- `player_save.selectedBlock` now goes through the same `safeBlockType()` validation
  as block placement. It can no longer send 14..255 into a DB column constrained
  to block ids 0..13.

### Presentation
- Sprint smoothly widens FOV and returns it to normal afterward.
- Procedural WebAudio adds lightweight block/footstep feedback without third-party
  audio assets or licenses.
- The directional sun/shadow target follows the player, so shadows do not stay
  centered around world origin while the player explores.

### Dependency isolation
- The client first loads `./vendor/three.module.min.js`.
- CDN is only a temporary fallback while the vendor file is absent.
- Before PR #2 is merge-ready, Codex must add official Three.js r165 locally and
  verify no request to unpkg/jsdelivr occurs during a production browser run.

## Tests added
- Greedy worker test: a solid 16×32×16 prism produces 5 exposed quads / 10 triangles.
- Worker malformed-message rejection.
- Static client/API hardening tests.
- Existing voxel rule tests continue to reject block ids >13.
