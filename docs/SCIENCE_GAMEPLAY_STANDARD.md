# Science → Gameplay Standard

This is a hard production rule for `World_server` starting with `RUN_072`.

## Completion rule
A scientific patch is **not 100% implemented** just because evidence exists. A verified run is complete only when all seven gates are true: `scienceEvidence`, `productionRuntime`, `visibleEffect`, `playerInteraction`, `navigatorAge5`, `telemetry`, and `regressionTests`.

Every `SCIENCE_RUN_###*.json` from RUN_072 onward must have a matching declarative `science/gameplay/RUN_###.gameplay.json` contract. The shared `lib/science-gameplay-adapter.js` discovers these contracts by convention. A verified PASS run may activate gameplay only through this adapter. Failed/refuted science stays inactive and is described honestly.

## Navigator age-5 contract
Navigator talks to the player as if the player were five years old:
- short sentences;
- one idea at a time;
- concrete examples from ordinary life;
- no unexplained scientific jargon or abbreviations;
- never simplify by changing what the science actually says;
- distinguish a small playable demonstration from the full scientific experiment.

The goal is not childish nonsense. The goal is **simple words with scientific honesty**.

## Runtime contract
Science must change the world, not only a report. The adapter must provide bounded deterministic mechanics, player-visible effects, shared multiplayer state where applicable, simple Navigator feedback, telemetry without PII, and regression tests. Existing graphics, physics, controls, performance and persistence must not be weakened to make science pass.

## RUN_072 first implementation
RUN_072 maps its verified redundant/cycle-closing growth rule to player-built voxel networks. Natural terrain never triggers it. When an eligible connected player-built structure is damaged, the server may add a small bounded cycle-closing regrowth effect into an earlier player-created gap near the damage. It must not blindly repair the exact destroyed block. The client applies server-returned effects immediately and broadcasts them through the existing realtime channel.