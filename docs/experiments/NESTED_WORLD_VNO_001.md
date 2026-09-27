# NESTED_WORLD_VNO_001 — preregistration

Status: preregistered, not production evidence.

## Observation
World Server already has a deterministic consequence engine, deterministic creature spawning, VNO scoring, replay requirements, and a science-to-gameplay adapter. It does not yet have a verified parent/child world-state contract for nested fictional simulations.

## Hypothesis
A bounded nested-world state can preserve deterministic replay while carrying a second-planet colony, an adapted fictional species, a child simulation, and a fictional message from child inhabitants to their creators, without adding a second consequence engine.

## Frozen vertical slice
1. Create a colony on a second procedural planet with positive travel delay and transport cost.
2. Derive a fictional adapted-species profile from a deterministic seed. Mark it explicitly as a game rule, not real biology.
3. Create one child simulation with parent_world_id, child world_id, law version, seed, depth, CPU-tick budget and memory budget.
4. Child inhabitants detect a seeded in-game anomaly and emit a fictional message to the parent world.
5. Canonical world consequence logic chooses one of two bounded game outcomes: negotiation or a tighter information boundary.
6. Save, reload and replay must reproduce identifiers, outcome and consequences.

## Baseline and negative controls
Baseline: same parent world and seed with no child simulation; no child message or parent consequence may appear.

Negative controls must reject zero travel delay, zero transport cost, unknown colony/species links, depth overflow, child-count overflow, event-budget overflow and memory-budget overflow.

## Falsification
The hypothesis is refuted for this slice if any of these occur:
- same frozen seed and actions produce different state after save/reload;
- child state exceeds a declared resource limit;
- a child message causes external I/O or code execution rather than a game-state event;
- transport changes resources outside the canonical world consequence engine;
- changing a hidden seed cannot produce both preregistered bounded outcomes across the hidden suite;
- the adapted species is presented as real biological evidence.

## Independence
Implementation evidence does not count as independent PASS. Fleet PRE must test the exact candidate SHA without reusing implementation decision logic. Hidden seeds belong to the verifier. A quota error, timeout, or self-review is not independence.

## Applicability
Primary applicable systems: world generation, creatures, NPC behavior, persistence/multiplayer state, resources/economy, Navigator/science gameplay. Combat and unrelated graphics are NOT_APPLICABLE to this first slice unless implementation adds a direct causal dependency.

## Resource envelope
Initial hard target: max depth 3, max 4 child worlds per parent, max 64 nested events per state, serialized nested state under 32 KiB, and no unbounded recursive execution.

## Player-visible wording
“Жители маленького мира заметили странность и послали письмо создателям. Это история внутри игры. Она не даёт им доступ к настоящему компьютеру.”

## Promotion rule
No production activation from this document. A candidate requires code, regression tests, exact-SHA Fleet PRE, protected integration, and Fleet POST live evidence under the existing pipeline.
