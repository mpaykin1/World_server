# META GAMES readiness audit and process repair

## Task / Why
Owner requested verification of MCP 75%, solutions library 60%, bot/autofix 50%, overall 62%. No denominator/weights/evidence accompanied those numbers. Replace unsupported precision with criterion-level evidence and tighten the existing development loop.

## Current state
World master a4d235d51c9b2b9307351387e1e1b78cf96d0e02; meta6 main 84b4d8a90d7f2acce42eb55571adc918fe7f3fc2. Existing meta6-lab discovered at main 09127bc09260744a7213001d9fb5672bc161bfa0; not created by this task.
World public MCP run 42232171671 passed eight HTTPS read tools on 7f57154fcd98390ab83120946f053ec74eb10f9b, four games and zero licensed assets. Current catalog has reusable_assets=[] and partial coverage. #621 is a candidate, not a deployed license change.
World canary 42232632022 failed on exact master. meta6 #303 bot 42199891737 failed. Lab #7 HEAD 0af9d8f93074dc50e66e23474b3c8951c4de39c8: six local stdio tools verified, 364 files, bot in progress at inspection. Lab #8 HEAD 6ab55da9eba4128375ee8f6e75647854fd856a8e: repair run 42327146691 reports BOT_ALREADY_PASS, not a repaired failure. Lab #9 HEAD fb06e9061a07dd4e5407f2ddd3ef39375f7dca4a explicitly blocked by donor policy and failed source gate.
Direct runtime HTTP recheck unavailable from this controller (Node fetch failed, web access failed); historical cloud HTTPS evidence is dated, not a new live PASS.

## Target state / Files / systems involved
Amend existing architecture/meta-games-platform/CONTROL_RULES_RU.md only, plus mandatory branch notes. No new readiness registry, scheduler, platform, gameplay or CI permission changes. Correct executor ID and existing lab routing; define evidence, coverage and release readiness separately.

## Known risks / Golden systems that must be preserved
Policy text alone cannot enforce runtime behavior. Draft PR must not be reported as deployed/enforced. Preserve originals, bot core, baselines, rights blocks and technical gates. Review is advisory for META GAMES per owner waiver.
Concurrent World #621 touches assets/MCP/tests, not this control document. Active lab work left untouched.

## Errors that must not return
Candidate/stdio counted as public production; green no-op counted as repair; file index counted as cleared reusable components; stale running status; percentages without fixed denominator; timestamp-only monitor activity counted as project progress.

## Exact patch / change plan
Update control routing and clarify review/ad policy. Add criterion-based readiness and bounded development loop with ownership, cheap-first checks, exact SHA, regression, no repeated quota retries and fail-closed release criteria.

## Tests to run
Read back exact GitHub diff; validate intended markdown additions and only two changed paths. This is documentation, so no local gameplay/build suite is claimed. Existing cloud CI must evaluate exact candidate SHA before merge. Baseline canary already fails; no automatic merge or technical PASS.

## Deployment / PR plan
Documentation-only DRAFT PR to master. No production publication requested by this patch. No changes to main/meta6, lab candidates, branch protection, schedules, secrets or tariffs.

## Current progress
Primary GitHub source, job logs and current candidate SHAs inspected; control amendment prepared.

## Next action / Completion criteria
Open draft PR, verify changed paths and exact SHA; report corrected readiness with links and unresolved enforcement/CI scope. Project readiness remains NOT READY.

## Final evidence
Primary source URLs and audit findings are recorded in the PR description. Documentation diff validation is pending readback; CI pending exact final SHA. No independent APPROVED, gameplay PASS or fresh public release verification asserted.
