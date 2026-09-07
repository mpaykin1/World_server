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

## Progressive 12-domain contract
Science is not a lecture layer. A hypothesis must become observable cause and effect in the game world. The canonical domains are: `visualDestruction`, `recoveryAnimation`, `playerDestruction`, `weapons`, `npcBehavior`, `newBuildings`, `newTextures`, `roads`, `destructionPhysics`, `controls`, `worldGeneration`, and `multiplayer`.

Each domain is independent and moves through `disabled/planned → experimental → verified-runtime → production-enabled`. Planned/disabled domains cannot run. Experimental domains are preview-only. Production requires every domain gate plus explicit `productionEvidence`; no domain is promoted merely because another domain passed.

Every enabled domain needs implementation evidence, real cause→effect, trusted Navigator explanation, no-PII telemetry, regression protection, performance evidence and production evidence. Navigator speaks after or during the actual world transition and explains what the player just caused or saw.

## RUN_072 progressive slice
The first expansion activates three preview domains: player-caused destruction, bounded visual destruction FX, and visible recovery animation. Destruction is still authoritative through the existing Voxel persistence path; debris is transient visual feedback only. Regrowth remains server-authoritative and its animation is only a visual shell around the already-persisted block. FX counts are capped more aggressively on coarse/mobile pointers. The remaining nine domains stay planned and inert until their own gates pass.
