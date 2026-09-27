# «Цепная реакция: Рой» — original survivors-style World Server POC
Status: **uncertified, opt-in prototype**. Do not publish a playable link until desktop + mobile real browser QA, fresh production verification and independently measured user visibility >85%.

## Motivation and legal boundaries
This is an *original* game mode inspired by the general gameplay genre that Vampire Survivors helped popularize; there is no copied original game code, textures, characters, sound samples, names, music or trademarks in the runtime. Reuse ideas/mechanics, not protected presentation.

Upstream reference implementations to evaluate if future code integration is desired; **check each asset's own provenance** and preserve license text, notices and attribution:
- [ricardo-foundry/canvas-vampire-survivors](https://github.com/ricardo-foundry/canvas-vampire-survivors) — permissive MIT, no-install Canvas JS reference with auto fire, gems, weapons, passives, bosses, desktop and mobile controls.
- [matthiasbroske/VampireSurvivorsClone](https://github.com/matthiasbroske/VampireSurvivorsClone) — permissive MIT, Unity 2021.3+ mechanics reference; not browser-native, avoid introducing Unity as mandatory World Server dependency.
- [DarkRewar/SurvivorsStarterKit](https://github.com/DarkRewar/SurvivorsStarterKit) — permissive MIT, Godot 4 C# reference; could inform optional Godot pipeline.
- [migalvalm/vampire-survivors-clone](https://github.com/migalvalm/vampire-survivors-clone) — permissive MIT Godot 4 reference.
No upstream repo or external sprite pack was vendored into this first PR. Assets are original lightweight Canvas2D primitives and short locally synthesized Web Audio tones.

## Feedback loop (why this specific genre is unusually compelling)
- **One primary action:** move, while weapons aim/fire automatically. Low motor/cognitive demand leaves attention for situational decisions.
- **Dense, legible, multisensory action feedback:** silhouettes bunch into readable swarms; projectiles, cyan gems, chain arcs, hurt cues, optional subtle tones, big rank/upgrade banners provide multiple layers of cause and effect. Use rate limits to avoid flashing overload.
- **Variable tactical reward at steady pace:** monsters emit XP gems, magnetic pickup makes cleanup feel powerful and triggers visible XP progress; roughly 7-12 meaningful pickups produce early upgrades. Avoid pretending this implies medically verified "dopamine hacks."
- **A short, high-importance pause:** three distinct improvements, then immediately visible results. Choosing a synergy (aura + magnet -> evolution) is more dramatic than choosing isolated +1 bonuses.
- **Power and danger grow together:** scaling enemy counts, 42-second elite milestones, chains and crowd-clearing combos build a recoverable escalation curve. A loss is a replayable experiment, not a hard irreversible shared-world defeat.

## Integration and implementation
- \`shared/survivors-arena-core.mjs\`: deterministic, seeded simulation independent of rendering. Three resident archetypes (warrior, worker, mayor), 9 upgrades, auto targeting/fire, waves, boss, gems/magnet, AOE, branching chain damage, evolution, pause choices; seeded RNG, bounded enemies 30..260, maximum projectiles 100 and gems 210.
- \`apps/survivors-arena/index.html\`, \`style.css\`, \`client.js\`, \`render.mjs\`: responsive original canvas renderer; mobile joystick, desktop WASD/arrows, sound toggle, reduced-motion switch, pause, snapshot evidence object. iPhone target enemy budget=90 and DPR <=1.4.
- The client performs **read-only** \`POST /api/voxel\` with \`action:"macro_read"\` and a validated world id, reads existing \`worldDNA.emergence.entities\` as biome/theme tags and revision. City/forest/village/desert/volcano influence art; volcano also influences one enemy style. If shared backend unavailable, falls back to autonomous arena and reports it honestly. No new world state, accounts, token or schema. **It is not yet synchronized multiplayer or fully embodied canonical resident**.
- \`window.__SURVIVORS_ARENA_READY__.snapshot()\` exposes started, role, worldConnected, readonly status, canvas dimensions, HP, enemy count, position and upgrade pause for behavioral browser verification. Treat this as diagnostic only, not self-certified visual quality.
- The existing first-person Voxel World and currently quarantined \`apps/survival\` remain unchanged, while the new opt-in app is **not** added to the certified public catalog.

## Test protocol and measurable release conditions
1. Node: same seed/commands -> identical combat history; lossless upgrade pause; distinct 3 choices; HP heal; synergy evolution; 42-sec boss; capped mobile enemy/shot/gem budgets; read-only world contract.
2. Playwright: mock only the existing world's API response; desktop real canvas draw, role select, movement, automatic enemy spawn, pause/resume and no page errors; iPhone WebKit real mobile layout, touch-region joystick motion and screenshot; backend offline fallback.
3. Independently visually review screenshots on desktop and iPhone. Verify HUD, entities/gems/attacks are distinguishable amid dense enemies and render remains responsive. Measure 0-100 user visibility against a fixed rubric (on-screen meaningful feedback, text contrast, actor/shot separation, discernible movement, mobile fit) with an independent evaluator; **do not mark >85 by unit tests alone**.
4. Before any production link: review the PR, merge via standard protected branch, run Golden release gate and mobile behavioral tests, certify in release registry only if proven, deploy stable Cloudflare/production target, rerun fresh real browser and exact-link verification (<120s old, not a preview). Until then share PR/source links only.

## Next iteration
Use World Server canonical resident lookup to inhabit **a specific persistent resident**, bidirectionally synchronize defense consequences with the server tick and Telegram narrative, leverage shared original sprites/model library, add gameplay-informed effects to city infrastructure (power/water/defense), and validate actual 60fps on low-end iPhone hardware. Do not claim these features already exist in this isolated POC.
