# SYSTEM_INTEGRATION_LAYER_V7_5_RUNTIME_CLOSURE

V7.5 extends V7.4 without replacing certified behavior.

New systems:
- CAS Replication Controller: quorum writes, digest verification, read-repair, explicit independent-failure-domain truth claim.
- Physical Device Fleet Evidence: Android+iOS worker evidence freshness and digest verification; mock protocol is never called physical proof.
- Production SLO Autopilot: maps error-budget decisions to canary freeze/rollback, but automatic rollback requires production evidence + explicit authorization.
- Migration Fencing Runtime Verifier: stale fencing tokens and contract-before-backfill are rejected.
- Checkpointed Long Soak Runner: supports 8h/24h checkpoint/resume; short selftest validates harness only.
- Native Causal Collector: discovers Windows ETW/WPR/logman, Linux eBPF/perf and OpenTelemetry Collector separately from causal graph logic.
- Legacy Evidence Recipe Expansion: explicit recipe catalog now covers all 18 legacy patch families; eligibility still requires static + integration + executed regression evidence.

Truth rule: internal structural readiness may reach 100% while operational readiness remains below 100% until real external/native evidence exists.
