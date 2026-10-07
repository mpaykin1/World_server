# Real-source 2.5D gallery — failure and success (2026-10-01)

## Failure to preserve
The first 2.5D gallery was a failed implementation: it procedurally redrew game-like locations and characters, then labeled them with real project names. That did not prove reuse of the actual open-source files.

Root cause:
- "small piece from each game" was interpreted as permission to recreate the look;
- provenance was not an acceptance gate;
- a public page was prioritized before verifying the identity of every visual asset.

Permanent rule:
> When the user asks for real/open-source game content, every visible in-game object must trace to a concrete source-repository file. No procedural recreation, generated substitute, placeholder, lookalike, or hand-drawn replacement is allowed unless explicitly requested.

## Corrected success
Implementation:
- https://github.com/mpaykin1/scratch-chain-reaction/tree/main/2p5d-hero-gallery
- deployed head verified: `44c99565794b7a438b374760cbd6759fb268a5cf`

Only projects that passed source, license, and runtime checks are included.

### Caapora 2.5D
- source: https://github.com/CaaporaGames/Caapora2.5D
- inspected revision: `bbd76e8`
- license checked: root `LICENSE.md` (MIT)
- location: `Caapora1.png`
- character sheet: `Assets/Caapora/Resources/Sprites/CaiporaRunning.png`
- frame rectangles: `CaiporaRunning.png.meta`
- animation timing/order: `Assets/Caapora/Resources/Animation/Animations/Caapora/CaaporaRunning-Down.anim`
- source clip: 4 frames at 12 fps.

### Moral Matrix
- source: https://github.com/sedmugen/moral-matrix
- inspected revision: `96ee552`
- license checked: root `LICENSE` (MIT)
- location: `Assets/images/gameplay_sample.jpg`
- character sheet: `Assets/Sprites/MC_8Direction_SpriteSheet.png`
- frame rectangles: `MC_8Direction_SpriteSheet.png.meta`
- animation: `Assets/Animation/Clips/McWalk0.anim`
- source clip: 8 frames at 8 fps, looping.

### Flare: Empyrean Campaign
- source: https://github.com/flareteam/flare-game
- inspected revision: `af6eee6d339ac98011864bfe89da837fe7769c28`
- art/data: CC-BY-SA 3.0 or later; engine: GPLv3+
- location: `distribution/screenshot1.jpg`
- character sheet: `mods/fantasycore/images/npcs/peasant_man1.png`
- animation definition: `mods/fantasycore/animations/npcs/peasant_man1.txt`
- source animation: `stance`, 4 frames, 1600 ms, `back_forth`.

## Excluded instead of faked
- Sovereign: current checkout did not yield a self-contained real location + animated-player asset pair suitable for the browser gallery; its documentation also records third-party CC-BY-SA graphics.
- SimpleHD2D: no repository license file found; character filenames identify Final Fantasy VI / Terra material.
- Hero of Allacrost: the GitHub mirror states that media files are not included.

## Acceptance gate for future source-reuse MVPs
For every included project require:
1. repository actually downloaded/cloned;
2. exact source revision recorded;
3. redistribution license checked for the concrete assets;
4. exact location path recorded;
5. exact character path recorded;
6. exact animation metadata path recorded;
7. runtime uses source assets only;
8. no fallback placeholder or recreated object exists;
9. page/script/styles/assets all return HTTP 200 publicly;
10. mobile render is visually inspected before publishing the test link.

If any gate fails, exclude the project rather than substitute content.

## Verification
Corrected gallery was rendered at a 414×896 portrait viewport.
- Caapora real location + real running character: visible and large.
- Moral Matrix real gameplay image + real walk character: visible and large.
- Flare real gameplay screenshot + real character: visible and large.
- all six copied source assets returned HTTP 200 from GitHub Pages;
- deployed JavaScript only selects original frame rectangles and calls `drawImage`; the procedural fake renderer is absent.

Why this succeeds:
- provenance is now a hard requirement;
- original animation metadata controls frame selection;
- license uncertainty causes exclusion, not imitation;
- mobile visual QA happens before the page is called ready.
