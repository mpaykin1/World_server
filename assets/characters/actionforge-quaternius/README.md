# ActionForge / Quaternius CC0 character pack

World Server copy of the CC0 humanoid rig and animation library currently exposed by https://actionforge.app/.

## What is vendored

- `rig-human.glb` — ActionForge default human rig/mannequin.
- `actionforge-quaternius-animations.glb` — the official "All" GLB animation-only export; it contains 84 animation tracks.
- `fps_test.glb` — the 85th selectable clip, which ActionForge exposes from a separate FPS path but omits from the combined export.
- `semantic-actions.json` — World Server semantic names mapped only to real clip names present across those files.
- `SHA256SUMS.txt` — integrity hashes for the acquired binary/licence files.
- `THIRD-PARTY-NOTICES.txt` — ActionForge's published licence/provenance notice.

The ActionForge application code is **not** copied into this repository.

## Licence boundary

ActionForge states that the animations, rig and props are created by Quaternius and dedicated to the public domain under CC0 1.0, including ActionForge's retargeted/edited/repackaged versions. Its application code remains © CGstuff, all rights reserved.

The Adobe Mixamo reference skeleton is explicitly excluded from CC0 and is not vendored here. This pack uses ActionForge's **Default** skeleton.

## Runtime

Use `loadActionForgePlayer()` from `/shared/universal-player-character.mjs`, or call `loadUniversalPlayer({ baseUrl: '/assets/characters/actionforge-quaternius' })`.

## Reproducible acquisition

Run `node scripts/download-actionforge-cc0.cjs` with Playwright available. The script opens the official site, downloads the current default rig and licence notice, captures the separately served `fps_test`, selects every current library clip, and exports the animation-only GLB bundle here.
