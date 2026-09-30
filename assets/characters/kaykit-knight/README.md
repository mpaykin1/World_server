# KayKit Knight — World Server reusable humanoid

This directory is the canonical runtime bundle for a generic humanoid replacement in World Server ports, including games whose original implementation used a Roblox avatar.

## What is vendored

- KayKit Adventurers 2.0 `Knight.glb` using `Rig_Medium`.
- The complete KayKit Character Animations 1.1 `Rig_Medium` GLB groups: General, MovementBasic, MovementAdvanced, CombatMelee, CombatRanged, Simulation, Special and Tools.
- The matching Knight texture.
- The KayKit CC0 license and SHA-256 checksums.

The official animation pack currently describes 161 humanoid animations across its supported rigs. The Knight-compatible `Rig_Medium` runtime contains 139 clips across eight groups. `manifest.json` records both numbers so we do not falsely claim that one character exposes all 161 clips.

## License / commercial games

KayKit states that these assets are Creative Commons Zero (CC0), can be used in personal, educational and commercial projects, and attribution is not mandatory. The original license text is stored as `LICENSE.txt`.

This license covers the KayKit assets only. It does not grant rights to unrelated Roblox game code, maps, trademarks, audio, user-generated content or other third-party assets.

## Runtime contract

Use `manifest.json` as the stable entry point. Do not hard-code upstream URLs in games. Porting tools should resolve the model and animation groups from this manifest so a future KayKit update can be reviewed once and reused everywhere.

The files are pinned to upstream collection commit `af08a62d3669370ec4636ae6314b38cdcd5dd759`; do not silently replace them with mutable upstream HEAD.
