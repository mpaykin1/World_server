# WORLD SERVER SCIENCE STANDARD

## North Star: 100% = Reproducibility + Independence + Falsification

Every scientific, simulation, agent, quality, optimization, world-generation, repair, resilience, or discovery task in `World_server` must move the system toward **100% reproducibility, 100% independence, and 100% falsification pressure**.

No result is allowed to call itself "scientifically proven" only because code returned `pass: true`.

A code experiment can strongly confirm an effect **inside the computational model**. A real scientific claim requires independent reproduction outside the originating implementation and methodology.

### Non-compensating score

Science readiness is not an average. One strong pillar cannot hide a weak one.

`SCIENCE_READINESS = min(REPRODUCIBILITY, INDEPENDENCE, FALSIFICATION)`

Therefore 100% is possible only when all three pillars reach 100.

---

## Pillar 1 — REPRODUCIBILITY

A result must be repeatable from frozen inputs and frozen code.

Required direction of travel:

1. **One-command reproduction.** Every promoted experiment should be runnable from a clean environment with one documented command.
2. **Frozen implementation.** Commit SHA, dependency versions, parameters, environment assumptions and experiment configuration must be recorded before confirmation.
3. **Seed expansion.** Discovery may begin with a small seed set, but confirmation must progressively move through larger unseen sets (for example 6 -> 30 -> 100 -> 1000 where computationally reasonable).
4. **Scale tests.** Validate across materially different world/system sizes instead of one convenient size.
5. **Repeated runs.** Measure run-to-run variance where nondeterminism exists.
6. **Statistics beyond PASS/FAIL.** Record effect size, mean/median, variance, confidence intervals or appropriate uncertainty estimates.
7. **Immutable evidence.** Preserve hypotheses, thresholds, code SHA, seeds, parameters, raw outputs, summarized outputs, failures, and timestamps.
8. **Negative results are evidence.** `pass:false` results must never be hidden, rewritten, silently deleted, or converted into success by changing thresholds after seeing holdout results.
9. **Environment portability.** Reproduction must not depend on one developer machine or hidden local state.
10. **Clean-room replay.** The same result should reproduce from a fresh checkout with no manually preserved state.

---

## Pillar 2 — INDEPENDENCE

A result is stronger when the mechanism that produced it is separated from the mechanism that verifies it.

Required direction of travel:

1. **Independent implementation.** Important discoveries must be reimplemented from the written specification by another agent/code path without copying the original implementation.
2. **Independent verifier.** The test harness should not share the same hidden assumptions or implementation logic as the system under test.
3. **True blind protocol.** The implementation agent must not see final confirmation seeds/cases before the algorithm is frozen.
4. **Train -> Freeze -> Hidden test -> Result.** Confirmation data is opened only after the tested implementation and criteria are frozen.
5. **No threshold tuning after holdout.** Confirmation criteria may not be loosened after holdout output is visible.
6. **Separate roles.** Discovery, criticism, replication and confirmation should be performed by distinct agents/processes where possible.
7. **Independent codebase replication.** Highest-confidence results require reproduction in a separate harness or codebase, not only another branch of the same implementation.
8. **Cross-domain transfer.** General claims must be challenged in other compatible domains, topologies or task families instead of being inferred from a single world type.
9. **Provenance.** Every claim must identify which codebase, branch, commit and agent generated and verified it.
10. **No self-certification.** The implementing agent cannot be the only source of the final confidence level.

---

## Pillar 3 — FALSIFICATION

The system must actively try to prove its own discoveries wrong.

Required direction of travel:

1. **Pre-registration.** State hypothesis, metrics, controls and pass/fail thresholds before confirmation data is inspected.
2. **Red Team Scientist.** Assign an independent agent/process whose primary job is to find reasons the result is false, fragile, leaked, overfit or incorrectly measured.
3. **Adversarial tests.** Replace only-friendly/random perturbations with targeted attacks designed to maximize failure.
4. **Multiple damage/failure modes.** For resilience claims, include random deletion, concentrated damage, center/edge removal, bridge cuts, highest-connectivity removal, weak-point attacks and other relevant targeted failures.
5. **Strong baselines.** Compare against random controls, simple baselines, best-known practical baselines and alternative mechanisms where available.
6. **Ablations.** Remove one proposed causal mechanism at a time. If the effect survives unchanged, the claimed mechanism is not yet established.
7. **Counterexample search.** Automatically search seeds, sizes, topologies and parameter regions that make the result fail.
8. **Leakage checks.** Verify that hidden labels, pristine-world state, future information, global state, or confirmation data did not enter the algorithm through an indirect channel.
9. **Methodology attacks.** Challenge metrics themselves: determine whether an apparently good score can be achieved while the intended behavior is actually absent.
10. **Preserve falsification.** A failed hypothesis is a successful scientific outcome if the failure is valid and reproducible.

---

## Mandatory experimental lifecycle

Every serious scientific line should progress through:

`DISCOVERY -> CRITIQUE -> PREREGISTRATION -> FREEZE -> BLIND HOLDOUT -> RED TEAM -> INDEPENDENT REIMPLEMENTATION -> REPLICATION -> GENERALIZATION -> CONFIRMATION`

Discovery is allowed to be exploratory. Confirmation is not.

### Discovery

Agents may search freely, tune ideas, inspect failures, create hypotheses and explore candidate mechanisms.

### Replication

A frozen discovery is rerun on new unseen cases and by an independent implementation/process.

### Confirmation

A claim is promoted only after it survives its pre-registered tests, red-team attempts, independent implementation, larger hidden sets and appropriate generalization tests.

---

## Evidence levels

Use these levels for every scientific claim:

- **D0 — Idea:** hypothesis only.
- **D1 — Observed:** effect noticed in exploratory work.
- **D2 — Code-confirmed:** a controlled code experiment passed its own criteria.
- **D3 — Blind holdout:** frozen algorithm passed unseen confirmation cases.
- **D4 — Independent implementation:** another implementation reproduced the effect.
- **D5 — Adversarial + scale:** effect survived scale changes, stronger controls and adversarial conditions.
- **D6 — Independent replication:** separate agent/codebase reproduced the result from the written protocol.
- **D7 — External scientific evidence:** independently reviewed/reproduced beyond the originating project; only here may wording approach an externally established scientific result, and even then it must match the actual evidence.

A claim's displayed level must be the **lowest level actually completed**, never an aspirational target.

---

## Required experiment record

For every promoted scientific run, preserve at minimum:

- experiment ID and hypothesis;
- discovery vs confirmation status;
- commit SHA / branch / code provenance;
- preregistered metrics and thresholds;
- train/discovery seeds;
- hidden/holdout seed policy;
- world/system sizes;
- control groups;
- ablation plan;
- adversarial/failure-mode plan;
- environment/dependency versions;
- one-command reproduction command;
- raw and summarized evidence;
- uncertainty/statistical summary;
- negative results and counterexamples;
- red-team findings;
- independent implementation status;
- independent replication status;
- current D0-D7 evidence level;
- reproducibility / independence / falsification scores;
- blockers preventing the next level.

---

## Rules for scientific percentages

Percentages are allowed only if their meaning is explicit.

Never write simply `100% scientifically proven` because a code test passed.

Use separate values:

- `CODE_EXPERIMENT_CONFIRMATION` — how completely the preregistered computational experiment passed;
- `REPRODUCIBILITY` — strength of repeatability evidence;
- `INDEPENDENCE` — separation between origin and verification;
- `FALSIFICATION` — strength of attempts to disprove the claim;
- `SCIENCE_READINESS = min(REPRODUCIBILITY, INDEPENDENCE, FALSIFICATION)`;
- `EVIDENCE_LEVEL = D0..D7`.

Example: an experiment may have `CODE_EXPERIMENT_CONFIRMATION=100` while `SCIENCE_READINESS=65`. That is valid and must not be reported as a 100% law of the real world.

---

## Mandatory behavior for every AI agent

For every task that can affect scientific evidence, simulation behavior, experimental infrastructure, tests, agent reasoning, world generation, resilience, repair, optimization or discovery:

1. Read this standard before changing scientific logic.
2. Do not reduce any of the three pillars without explicitly documenting the reason.
3. Prefer changes that increase at least one pillar while preserving the other two.
4. Convert confirmed bugs into regression tests.
5. Convert confirmed scientific failures into preserved negative evidence.
6. Never optimize only for a green test; optimize for a result that survives an independent attempt to reproduce and falsify it.
7. When proposing the next experiment, prefer the test most likely to disprove the current strongest claim.
8. If the task is not scientific, it must still avoid damaging evidence provenance, reproducibility, logging, isolation or future falsification capability.

---

## The next-step priority rule

When choosing between two scientifically useful tasks, prefer the one that most increases the weakest of the three pillars.

In other words:

> **Do not merely make the discovery look stronger. Make it harder to reproduce incorrectly, harder to self-confirm, and easier to disprove if it is wrong.**

This is the permanent scientific direction of `World_server`.
