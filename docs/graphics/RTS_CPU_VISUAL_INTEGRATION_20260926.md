# Volcanic RTS — merged visual technology slice

**Visual target:** the user's 2026-09-25 dark, high-detail isometric volcanic RTS reference.
The original screenshot is supplied in the conversation, **not** falsely claimed to be
archived in this branch. The older `WORLD-GFX-FOG-FRONTIER-20260925` photo
is a different reference and is not an acceptance substitute.

## Newly implemented, in actual code

- `cinematic-strategy-camera.mjs`: reused from existing sibling PR #300.
  Mathematical minimum pitch keeps the geometric horizon at least 14° out of view.
  Camera now drives the **real** RTS preview, with desktop and portrait configurations.
- `cinematic-industrial-parallax.mjs`: reused from PR #300. Deterministically
  CPU-paints distant industrial cards. **Deliberately disabled on the regular RTS
  preview** because upright skyline cards obscure a top-down battle map; separate
  `rtsBackdrop=1` opt-in allows isolated cinematic experimentation.
- `cinematic-rts-baked-light.mjs`: three shared instances batches for contact
  shadows below actual buildings, warm magma bank light and blue crystal halos.
  Textures are painted once on CPU. No new real-time light or shadow-map passes.
  Mobile raster = 64² instead of 128²; counts are capped and tested.
- `cinematic-rts-rivers.mjs`: replaces an enormous square lava plane with
  one indexed **actual river-tile geometry** sharing seamless world-space UVs,
  plus one CPU-sculpted, dark ash substrate below all playable terrain.
  This removes the full-square lava geometry, but the current channel layout
  still places bright lava on both sides of the plateau; visual fidelity is
  still substantially below the darker, more richly textured RTS reference.
- `cinematic-rts-touch.mjs`: genuine two-finger camera pinch zoom on the RTS
  canvas, bounded between 85 and 600 world units. One-finger rotation keeps
  the existing orbit control and its horizon floor; no touch modifications to
  the normal first-person city route.
- Native Three.js viewport, gameplay data, and original 37k+ loaded voxel city
  remain intact. These are **visual-only** additional assets; new RTS structures
  still have no authoritative gameplay state or integrated collisions.

## Reproducible QA

Opt-in QA route:
`/apps/ai3d-voxel-city/?cinematicCpu=1&rtsVolcanic=1`

Separate experimental industrial backdrop, **not for ordinary RTS**:
`/apps/ai3d-voxel-city/?cinematicCpu=1&rtsVolcanic=1&rtsBackdrop=1`

Run one repeatable streaming gate (no buffered git diff):
`node scripts/cinematic_cpu/verify_rts_slice.cjs`

Optional real local browser mode with running server, Playwright CLI and
`PLAYWRIGHT_BASE_URL` configured:
`node scripts/cinematic_cpu/verify_rts_slice.cjs --browser`

The focused unit tests also cover
`test/cinematic-rts-baked-light.test.mjs`,
`test/cinematic-rts-rivers.test.mjs`, `test/cinematic-rts-touch.test.mjs`,
`test/cinematic-strategy-camera.test.mjs`
and the existing CPU/RTS Node suites.
Use the existing Playwright desktop + mobile-emulation profiles with
`e2e/cinematic-rts-volcanic.spec.js` and `e2e/cinematic-cpu-preview.spec.js`.
CI must use the exact candidate SHA; never promote a historical PASS.

## Remaining, not certified

The environment is currently a procedural graphics prototype and visually
**below** the supplied high-detail strategy concept. No claim of >85% user
visibility, public release, real smartphone p95/FPS, or production deployment
is made. Independent AI review must pass at the final exact SHA. PR #298 and
sibling #300/#301 still require conflict-aware integration by their owners.
Do not ship this preview as a substitute for Chain Reaction's real server
game-state, simulation, world interactions, collisions and UI.

80-item plan links: direct prototype progress on actual lava geometry (#12),
CPU glow at lava banks (#13, #43), baked contact shadows (#27, #42),
guarded RTS camera (#57–58), distant-fog readability (#47, #63), and mobile
art-tier budgets (#64, #71). Each is source-tested only until visually accepted.
