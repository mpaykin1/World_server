# Desktop AI — autonomous blocker repair action

Generated: 2026-08-29T05:18:27.712Z
Repair engine: 1.0.0

## 1 blocker(s) require Desktop AI root-cause repair

### local-gates

Status: **requires_ai**

Reason: 2/6 gates PASS


## Mandatory repair loop

1. Diagnose the ROOT CAUSE from the evidence above.
2. Reuse existing World_server systems before creating anything new.
3. Apply the smallest production-safe fix; never use fake PASS, SKIP_FULL_VERIFY, stubs, or fabricated evidence.
4. Add or strengthen a regression test for the root cause.
5. Run `npm run blockers:tick`.
6. If `state/blocker-repair/DESKTOP_AI_NEXT_ACTION.md` is regenerated, continue fixing.
7. Stop only when the engine reports no `requires_ai` blockers; real external blockers may remain honestly WAITING/EXTERNAL.
