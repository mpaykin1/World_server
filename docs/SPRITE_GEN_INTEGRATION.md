# sprite-gen → World Server (2D characters inside the voxel world)

Source: aldegad/sprite-gen on GitHub (Apache-2.0), version 2.5.6 at integration time. Upstream code is NOT vendored: install it in a dedicated environment outside the World Server repository. The World Server runtime and importer are original integration code.

## What players see immediately

The voxel world displays three locally generated animated NPC sprites (slime, fox, robot), with idle and walk loops. The upper-right «Живые существа» panel hides/shows them and imports a real sprite-gen manifest.json with its PNG/WebP atlas. The built-in demonstration is PROCEDURAL art, not AI-generated art; there is no paid API call or GPU inference in the browser.

A published sprite-gen character loads automatically when included in shared/sprite-gen/catalog.json. A player can also import a character locally, without uploading to the server. Local imports last only for the current session; publishing to all players requires an explicit repository operation.

Three.js uses transparent camera-facing sprite billboards. This does not create 3D geometry or skeletal animation. The adapter reads absolute frame_layout rectangles and durations_ms from sprite-gen, rather than guessing grid coordinates.

## Free CPU setup

Install Python 3.11+ in an isolated virtualenv outside Desktop:

    git clone --depth 1 https://github.com/aldegad/sprite-gen.git
    cd sprite-gen
    python -m venv .venv
    .venv/bin/python -m pip install -e .

On Windows use .venv/Scripts/python.exe instead. Set PYTHONIOENCODING=utf-8 for consoles with legacy codepages. The upstream full curation/import path uses POSIX fcntl for safe publication: run those paths in Linux/WSL if Windows rejects the lock. Windows installation and CLI --help do not guarantee all upstream stages work on Windows.

Deterministic utilities such as cutout and slice-sheet operate on existing art; full generated atlas pipelines require a prepared run. Example image-provider route (provider cost/subscription may apply):

    sprite-gen prepare --out-dir /art/fox --character-id fox --base-image fox.png
    sprite-gen gen-set --run-dir /art/fox --provider codex
    sprite-gen extract --run-dir /art/fox
    sprite-gen compose-atlas --run-dir /art/fox

For existing frames instead, upstream supports unpack-atlas --pngs-dir /art/frames --out-dir /art/fox, with one folder per motion state and numerically ordered frames; then compose-atlas. Curation edits are applied by compose-atlas, NOT by copying raw frames from the upstream run. The optional video pipeline needs ffmpeg, img2webp and the user's own Grok account or API key. It is not called by World Server.

## Publish a finished character to all players

After upstream compose creates manifest.json and sprite-sheet-alpha.png:

    node scripts/import-sprite-gen.mjs "/absolute/path/to/fox-run" --id my-fox
    node --test test/sprite-gen-runtime.test.mjs

Commit the new directory in shared/sprite-gen/my-fox/ and updated shared/sprite-gen/catalog.json; deploy normally. The importer checks PNG signature and dimensions, validates animation rectangles, refuses stale curation, and copies only the runtime manifest and composed atlas. It never publishes generation caches, API keys or Python virtualenvs. Already published IDs cannot silently be overwritten; choose a versioned ID for updates.

The public runtime loads up to three catalog entries alongside its three built-in demos, capped at eight creatures per session.

## Acceptance tests and runtime health

Run in the browser console:

    window.VoxelWorldRuntime.stats().spriteNPCs

Returns enabled, total, visible and error. Also inspect desktop/mobile screenshots, verify the touch controls and import panel, observe idle/walk frame changes, measure FPS and ensure other world controls and physics remain functional. Browser-local imports validate images under 8 MiB and frame rectangles within atlas dimensions.

The sprite adapter is deliberately separate from multiplayer avatars, NPC damage and world-physics collisions.
