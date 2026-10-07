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

## Progressive 12-domain runtime contract
Science is not a lecture layer. A hypothesis must become observable cause and effect in the game world. The legacy/runtime domains are: `visualDestruction`, `recoveryAnimation`, `playerDestruction`, `weapons`, `npcBehavior`, `newBuildings`, `newTextures`, `roads`, `destructionPhysics`, `controls`, `worldGeneration`, and `multiplayer`.

Each runtime domain is independent and moves through `disabled/planned → experimental → verified-runtime → production-enabled`. Planned/disabled domains cannot run. Experimental domains are preview-only. Production requires every domain gate plus explicit `productionEvidence`; no domain is promoted merely because another domain passed.

Every enabled domain needs implementation evidence, real cause→effect, trusted Navigator explanation, no-PII telemetry, regression protection, performance evidence and production evidence. Navigator speaks after or during the actual world transition and explains what the player just caused or saw.

## RUN_072 progressive slice
The first expansion activates three preview domains: player-caused destruction, bounded visual destruction FX, and visible recovery animation. Destruction is still authoritative through the existing Voxel persistence path; debris is transient visual feedback only. Regrowth remains server-authoritative and its animation is only a visual shell around the already-persisted block. FX counts are capped more aggressively on coarse/mobile pointers. The remaining nine domains stay planned and inert until their own gates pass.

---

# Принцип ВНО: постоянный цикл Science → Gameplay

**ВНО = Воспроизводимость, Независимость, Опровержение.**

The runtime adapter above remains the only science-gameplay activation path. VNO does **not** replace or bypass it. VNO is the higher-level development loop that decides what to test next, how to translate it into gameplay, how to attack the hypothesis, and what may be promoted.

Canonical machine policy: `.ai/vno-cycle.json`.
Canonical complete game-system map: `data/vno-gameplay-systems.json`.
Machine gate: `node scripts/check-vno-cycle.js`.

## Seven-step VNO loop

1. **Возьми открытие.** Select a real preserved result. State what code established and what remains unknown.
2. **Придумай следующий вопрос.** Derive one falsifiable development hypothesis. Freeze prediction, baseline and failure condition before confirmation.
3. **Преврати в игру.** Evaluate every canonical game system. For each system say `APPLICABLE` or `NOT_APPLICABLE` with a reason. If applicable, define a concrete player-visible feature and an age-5 Russian explanation.
4. **Проверь кодом.** Every applicable system gets its own cause→effect test, baseline/control, regression protection and a test intended to make the idea fail. One system can never certify another.
5. **Усиль ВНО.** Reproduce cleanly, expand hidden cases and scale, use an independent verifier/implementation, and run Red Team/adversarial tests. Readiness is the weakest pillar, never an average.
6. **Улучши лабораторию.** Every confirmed weakness in methodology becomes a permanent check, guard, control, ablation or regression test. Never change the scoring rules just to raise the number.
7. **Начни снова.** Carry forward the strongest surviving result or most informative failure and return to step 1.

## Full-game evaluation is broader than runtime activation

The existing 12 domains are the safe activation interface. VNO additionally evaluates the whole game through `data/vno-gameplay-systems.json`, including world generation, terrain/resources, buildings, roads/navigation, creatures/enemies, combat/shooting, damage/destruction, physics/movement, animation, weather/environment, visual effects, materials/textures, audio, progression/economy, UI/Navigator, multiplayer, persistence/history and performance/streaming.

This **does not mean every hypothesis must apply to every system**. A scientifically honest `NOT_APPLICABLE` is a success of the method. It is better than inventing a fake connection merely to claim 100% coverage.

For every `APPLICABLE` transfer, the VNO record must contain:
- the concrete gameplay feature;
- what the player should observe;
- a matched baseline/control;
- implementation paths;
- a code test plan;
- a falsification/adversarial attack;
- a simple Russian explanation understandable to a five-year-old;
- a fail-closed stage that cannot jump to production without the existing runtime gates.

## User communication rule

Internal agents may use technical language with each other. The player-facing Navigator must not.

The player should hear things like:

> «Если одна дорожка сломалась, хорошо иметь другую.»

not unexplained terms such as LCC, betweenness, ablation, topology or confidence interval.

The simple explanation must still say whether something is only an idea, an experiment, a preview feature or already verified in the game. Simple language must never become exaggerated certainty.

## AI execution and computer protection

VNO is **cloud-first** and reuses `scripts/master-coordinator.cjs`, Collective Brain and the existing agent-session guard. It must not create a second orchestration stack.

Local/Desktop agents are allowed only for the smallest necessary step that cannot reasonably run in browser/cloud. They must obey the existing zero-chaos policy: no Desktop worktrees/clones/caches/builds, no unnecessary heavy local models or repeated heavy loops, cleanup of proven session-owned temporary artifacts, and no degradation of computer performance. A slowdown caused by VNO work is a correctness regression and must be fixed/offloaded rather than accepted.
