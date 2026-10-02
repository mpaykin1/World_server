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


## Universal Player Character

This bundle is the default **Universal Player Character** for compatible World Server humanoid games and for Roblox ports that used the standard Roblox Humanoid/avatar.

Canonical integration points:

- model + animation groups: `manifest.json`;
- semantic gameplay actions: `semantic-actions.json`;
- browser loader/controller: `/shared/universal-player-character.mjs`.

Games should call semantic actions such as `idle`, `walk`, `run`, `jump_start`, `airborne`, `land`, `primary_attack`, `ranged_shoot`, `hit`, `death`, `interact`, `throw` and related actions. The runtime resolves those semantics to a real clip present in the pinned Rig_Medium animation bundle.

A Roblox standard Humanoid may be replaced by this character by default. An explicitly supplied custom avatar that the project has rights to use is preserved unless the port opts into replacement.
