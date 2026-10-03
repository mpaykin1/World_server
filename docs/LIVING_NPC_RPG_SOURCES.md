# Living NPC RPG — source ledger

This module is an independent JavaScript implementation informed by permissively licensed reference projects. No upstream source code or assets are vendored verbatim in this change.

- PlayerEx — MIT — CleverNucleus/playerex — branch `1.19.2/main` — commit `bce9700cfb9d5445cd75d07dc8d9dc627c4dcfbf`
  - https://github.com/CleverNucleus/playerex
  - Studied: actor attributes, levels and skill-point state.
- Parry — MIT — FoundationGames/Parry — branch `1.18` — commit `819e51e341fa70da3ebdf891778072e6508c7167`
  - https://github.com/FoundationGames/Parry
  - Studied: guard/parry state and configurable damage reduction.
- Terasology Dialogs — Apache-2.0 — Terasology/Dialogs — branch `develop` — commit `d510447014510f49480cc060a344737fba162c78`
  - https://github.com/Terasology/Dialogs
  - Studied: first-page dialog graphs, responses and actions.

World Server adds its own relationship axes, recruitment/party model, class presets, perfect-parry window, dodge-roll state and browser-neutral serialized runtime. GPL/source-available/no-license projects are excluded from this core.
