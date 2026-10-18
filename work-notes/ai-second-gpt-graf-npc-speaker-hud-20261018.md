# GRAF NPC speaker HUD — independent QA
Task: isolate a speech-bubble identity bug in existing Ostrov Sumerek without touching HybridLOD #525, Sunken City #521, or Codex performance instrumentation.
Why: switching between two NPCs with identical dialogue leaves the previous NPC's name on screen.
Current state: master 9422d5730be1bd5803a0258be65ea5f469cfd60e, games/ostrov-sumerek/engine/84_npcs.js blob 2814cf9a942983753a23e14e7563ca0281f993d8; NPC label updated only when dialogue text changes.
Target state: speaker name follows active NPC independently of dialogue text; preserve dialogue timing, position, graphics, inputs and game logic.
Files / systems: 84_npcs.js, test/ostrov-npc-speaker-hud.test.cjs, games/ostrov-sumerek/docs/ERRORS.md, this note.
Risks: changing bubble rendering or timing; no new HUD controls, no changes to gameplay.
Golden systems preserved: existing Three.js renderer, hero, NPC art, controls, camera, collision, HUD layout.
Errors that must not return: stale NPC name after speaker switch with identical text.
Exact patch plan: move speaker-name assignment outside text-change conditional; execute original updateNpcHud function in vm against deterministic DOM stubs; add regression record.
Tests: node --test test/ostrov-npc-speaker-hud.test.cjs; full repo npm run check and browser/gameplay remain UNVERIFIED in this cloud-only session.
Baseline evidence: isolated exact-source excerpt before fix LOCAL 2 PASS / 1 FAIL, expected B actual A. This is not a real browser capture. No full baseline npm ci/release:gate/quality:diff available.
Deployment / PR plan: separate ai/second-gpt/graf-npc-speaker-hud-20261018 branch, draft PR to master, request independent Claude review; no merge, no production link.
Current progress: QA reproduction complete; branch created; source patch and tests pending.
Next action: patch source and add source-backed test; verify local deterministic result, request independent browser verification.
Completion criteria: source-backed test passes, real desktop/mobile speech switch verified, independent cross-company review, required CI green, owner decision.
Final evidence: PENDING — LOCAL source excerpt before fix 2/3; real game/CI UNKNOWN. Owner PASS/FAIL UNSET.
