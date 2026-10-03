# Living NPC RPG — source ledger

First import tranche for World Server. The runtime is a JavaScript adaptation layer, not a bundled Minecraft/Fabric mod.

## Imported ideas/code patterns

- **PlayerEx** — MIT License. Source: `CleverNucleus/playerex`, branch `1.19.2/main`, commit `bce9700cfb9d5445cd75d07dc8d9dc627c4dcfbf`.
  - Reused pattern: persistent per-actor RPG attributes, skill points, level/value separation and reset-friendly state shape.
  - World Server adaptation: framework-independent JSON state and deterministic XP progression.
- **Parry** — MIT License. Source: `FoundationGames/Parry`, branch `1.18`, commit `819e51e341fa70da3ebdf891778072e6508c7167`.
  - Reused pattern: weapon guard state plus configurable damage multiplier.
  - World Server adaptation: adds a short perfect-parry window, attacker stagger signal, stamina cost, roll cooldown and invulnerability window.
- **Terasology Dialogs** — Apache-2.0. Source: `Terasology/Dialogs`, branch `develop`, commit `d510447014510f49480cc060a344737fba162c78`.
  - Reused pattern: dialog component with `firstPage`, page IDs, response options and actions.
  - World Server adaptation: serializable dialog graph with branching responses.

## Deliberately not copied

GPL / source-available / no-license projects are not imported into this core. Their behaviour may be studied later and reimplemented independently if useful.

## World Server extensions

The runtime adds original World Server state for:
- relationship axes: trust / affection / respect / fear;
- recruitment gates;
- party membership and commands;
- six starter classes;
- perfect parry and dodge-roll state;
- reusable NPC dialog graphs.

The third-party licenses remain with their original projects. Keep this ledger if the adapted runtime is redistributed.
