# World_server — Priority Improvement Plan

Baseline: structural 100%, evidence 100%, operational 99%; Android/iOS out of current web/server scope.

## P0 — Reliability and self-healing
1. Keep the real 8h continuous soak alive with a Windows watchdog and strict heartbeat continuity.
2. Make blocker-repair launch the real `run 8` soak and detect the root `LONG_SOAK_STATUS.json` certificate.
3. Keep production leader fencing and live fenced-migration proof machine-verifiable.

## P0 — Reproducibility / delivery
4. Store every production Supabase schema/function change in `supabase/` without committing secrets.
5. Verify deployed production bytes against the Git source artifact and record source commit/blob evidence.
6. Run targeted regressions, full control-plane and release gate before push.

## P1 — Security and performance
7. Remove unauthenticated access from privileged worker-health reconciliation while preserving token-auth worker RPCs.
8. Add the missing `image_world_jobs(world_id)` FK index.
9. Consolidate duplicate permissive `world_remote_tasks` SELECT policies without changing effective authorization.

## P1 — Continuous improvement
10. Keep Android/iOS as future capability, not a blocker for the current web/server release profile.
11. Preserve remote CAS replication/read-repair and production transaction evidence as mandatory runtime checks.
12. Do not mass-delete unused indexes until real query telemetry proves they are redundant.

Implementation target for this cycle: >=99% of the executable plan items complete; the only time-bound item allowed to remain in progress is the already-running real 8h soak.