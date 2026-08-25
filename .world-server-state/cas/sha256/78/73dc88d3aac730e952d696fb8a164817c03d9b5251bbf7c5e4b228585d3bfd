# Recovered orchestrator work — integrated into V7.2

The exact standalone ZIP from the earlier “repair orchestrator” chat was not present in the available File Library. V7.2 therefore does **not** pretend to import an unknown binary. It recovers and implements the useful mechanisms that were available in the prior QA/diagnostic artifacts and merges them into the existing canonical supervisor.

## Mechanisms recovered and implemented

- bounded watchdog restart; no infinite crash loop;
- Stable is immutable while recovery is failing;
- repeated crash fingerprint quarantine + circuit breaker;
- automatic minimal reproducible ZIP with logs/hashes/evidence and secret redaction;
- Working → Candidate → Stable promotion only after release gate;
- patch manifest/project/base/payload SHA verification before staging;
- bad patch rejection must preserve Stable;
- generation-token monitor lifecycle; stale watchers are cancelled/rejected;
- exact identity predicate and startup settle/readiness barrier before monitoring;
- monitor is rebuilt after reconfiguration rather than continuing with deleted/stale objects;
- hash proof before/after risky operations;
- automate reconnect/rollback/chaos/soak scenarios when executable; unavailable true runtime evidence is NOT_RUN/BLOCKED, never fake PASS.

## Integration rule

No second orchestrator was added. `scripts/orchestrator-supervisor.cjs` remains canonical. V7.2 strengthens it and preserves the legacy `orchestrator-supervisor` Honest-100 function identity while adding a richer `orchestrator-supervisor-v7-2` contract.
