# Seven-engine composition regression

## Task
Persist integration coverage for #581–588 including #587 isolation.
## Why
Previous one-off integration did not declare #587, and browser GPT dispatch produced user messages without execution.
## Current state
Engine PRs remain separate and unmerged. Exact module sources composed in ignored work/ fixture; 5/5 focused Node tests PASS, 237 ms.
## Target state
Reproducible immutable candidate-composition CI, never represented as master integration or browser gameplay.
## Files / systems involved
scripts/verify-seven-engine-composition.cjs; test/fixtures/seven-engine-composition.json; .github/workflows/seven-engine-composition.yml; this note.
## Known risks
Pinned candidates can become stale; manifest is explicit and must be updated deliberately. Candidate code executes without secrets, write permissions or checkout credentials.
## Golden systems that must be preserved
All games, runtime, existing CI gates, rights gates and schedules.
## Errors that must not return
False completion, caller/history aliasing, optional-null failure.
## Exact patch / change plan
Task notes first; add test, pinned manifest and dedicated read-only CI. No changes to other PR branches.
## Tests to run
Five focused integration cases plus new CI. Existing required repository checks and independent review before merge.
## Deployment / PR plan
Test-only draft PR; no deploy/merge claimed. No paid service.
## Current progress
5/5 targeted local cases PASS with actual eleven modules from immutable source commits.
## Next action
Verify cloud workflow; address reproducible failures and obtain independent review.
## Completion criteria
Reproducible pinned composition test with declared limitations, required CI and independent review before merge.
## Final evidence
Local Node tests pass 5/5: calc enabled/disabled across seeds 3,42,71; invalid method failure; producer/consumer/caller isolation through core path; null optional calc continues through all real consumers. Cloud result recorded in PR after execution. Not WebGL, deployed game, physical device or independent review evidence.

## Integration extension 05:30 UTC
Real candidate outputs now feed packArtifact from pinned #591 1d1aff10e58fd1858e64fb51d895732493e45ed0. Tests preserve actual GLSL sources and pipeline JSON, detect tampering and confirm rights/publication stay unverified. The real mechanics state enters all scenes, resolves all required choices and earns a reachable ending. HTML in this test is explicitly only packaging fixture, NOT playable output. Updated cloud CI must confirm this new composition; previous local/cloud PASS applies only to the previous version. No new runtime or publication claimed.
