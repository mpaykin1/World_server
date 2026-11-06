# Canary visual failure evidence recovery

## Task
Preserve real screenshot and loaded-state evidence from the existing Canary browser gate.
## Why
Master4b82 run42132249394/job127611484408:245passed/4perceptual failures; artifacts endpoint total_count0. Historical actual/diff files are lost with runner, blocking diagnosis. Do not guess correct baselines.
## Current state
Existing quality-canary.yml runs public browser tests, but no upload step. e2e/perceptual-visual.spec.js already attaches loaded-state-graphics-evidence.json; Playwright generates actual/diff PNG.
## Target state
Always retain only test-results PNG and explicitly named loaded-state JSON for3days after an existing justified run; preserve failure status.
## Files / systems involved
.github/workflows/quality-canary.yml and this branch work note only.
## Known risks
Upload may produce no files when failure occurs before browser startup; warn honestly. PNG/loaded state capture public test pages and selected graphics state; no ZIP traces, HTML reports, environment/config dumps or hidden files selected.
## Golden systems that must be preserved
All baselines, thresholds, spec/runtime, tests, secrets/permissions, deployment target, cron configuration, concurrency, timeout and schedules.
## Errors that must not return
Never rerun unchanged failure hoping for green. Never substitute a current screenshot for historical actual/diff; never label missing artifacts PASS.
## Exact patch / change plan
Append actions/upload-artifact@v4 immediately after browser gate with if always(), retention3, include-hidden-filesfalse, fixed test-results PNG and loaded-state JSON globs. No workflow trigger changes or new runner/host.
## Tests to run
Exact original workflow equality after removing added step; check fixed allowlist/retention/always condition. Existing mandatory CI on exactHEAD. Actual failed-run upload only verifiable after next justified master Canary; not claimed before execution.
## Deployment / PR plan
Separate ai/codex/canary-visual-evidence-20261106 from4b82; draft PR for cloud checks. Existing canary dispatch is not run by this patch preparation; no additional service/scheduler.
## Current progress
Executoridle/reference-only;22openPRfiles collisionfalse for target. Root AGENTS/protocol already read; since source0aff only CI/worknote changed. Nested AGENTS absent. Guardpreflightverificationok cleanupfalse, high RAM pressure; no local browser. Existing collective route desktop-ai secondaryclaude; recall0, no delegation started.
## Next action
Check final note-update HEAD mandatory gates, then ready/merge expectedSHA only when passed. After merge inspect next existing Canary artifacts; no duplicate dispatch.
## Completion criteria
Mandatory exactHEAD checks pass; upload remains observation-only and cannot suppress browser failure. After merge inspect actual artifact contents from next existing Canary before diagnosing graphics.
## Final evidence
Baseline run42132249394 has4visualfailures/245passed/noartifacts. Source runtime unchanged. Candidate99a742b8b755fd7bd07ee09988033459e2d9c8c9: check/agent-rules/quality-regression/world-quality/godot-web-preview/fleet-pre/WorkersSUCCESS. Quality42134975031/job127620691825 has actual18behavioraltests passed. Lighthouse still pending at evidence recording. Preview42134974992 actualCloudflare10037Free100Workers, not rerun. Removing only the upload block restores original workflow byte-for-byte, confirming no gate/trigger/permission/runtime delta. Final note-update SHA must receive its own checks; historical candidate PASS must not substitute for it. Actual artifact preservation remains unproved until existing master Canary executes.
