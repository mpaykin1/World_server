# Task
Add bounded trusted-local `combine_assets` for geometry from actual generated packages.
## Why
The local generator can create/validate/preview but cannot combine its own generated world assets. External indexed components remain rights-denied.
## Current state
Base ee26d210a9511197268fbef972dc89a92ac6695b; three local tools; no cleared external assets. Browser executor idle/reference-only; no new commands sent. No competing PR edits these files.
## Target state
Combine 2..4 cached generated packages into translated world geometry with source artifact hashes; reuse the result in actual create_game. No code imports, file paths, network, publication or external asset admission.
## Files / systems involved
lib/engines/world-composition.cjs, generation-service.cjs, local-generator-mcp.cjs; focused tests.
## Known risks
Composition is geometry only: scenarios, audio and arbitrary game code are not merged; no playability/rights PASS from integrity. Source packages can be evicted. Coordinate/part/solid/data budgets must fail closed.
## Golden systems that must be preserved
Existing create/validate/preview, seven engines, mandatory CI, source SHA, accepted games and closed six components. No Netlify, settings, credentials, hosting or SEO changes.
## Errors that must not return
No fabricated asset reuse permission, anonymous write path, script execution, remote URL/path access, or publication claim.
## Exact patch / change plan
Read cached artifacts only; validate their integrity/source. Parse generated JSON without execution. Translate solids and first world's spawn/markers; preserve first world physics, require compatible physics across parts. Record ordered artifact IDs/translations and a digest. Expose through existing local MCP.
## Tests to run
Actual two-source composition -> create -> validate -> preview; deterministic digest, data isolation, denied unknown/evicted IDs, incompatible physics, invalid coordinates/paths/extra fields, part/solid limits. Existing stdio tests and required CI on final HEAD.
## Deployment / PR plan
Separate branch ai/codex/local-world-composition-20261105 and PR to master. No public HTTP deployment or publish operation. Merge only after mandatory exact-head technical checks and resolved defects; external review advisory per owner decision.
## Current progress
Preflight PASS (cleanup false, no heavy tests). Implementation and four integration/negative tests complete. First run failed four new cases because test seeds were strings; helper corrected to deterministic safe integers. On 2026-11-05 at 14:27 UTC the same approved execution path recovered and all 8 focused tests passed (999 ms): four existing MCP/stdio tests and four composition tests. No public deployment or publication.
## Next action
Open the separate PR and verify mandatory technical checks on its exact HEAD. Preserve the known pre-existing Quality Canary perceptual baseline failure; do not weaken thresholds or fabricate a PASS. Actual composed-world browser playability remains unverified.
## Completion criteria
Real generated geometry is combined and consumed by builder; negative cases fail closed; existing tools regressions pass; exact-head CI verified.
## Final evidence
node --test test/engines-world-composition.test.js test/engines-local-generator-mcp.test.js: 8 PASS, 0 FAIL, exit 0, duration 999.1923 ms. Validates actual two-package composition -> create -> validate -> preview and fail-closed paths/IDs/physics/coordinates/budgets/eviction. External references remain denied. This is geometry composition only; no scenario/audio/code merge, browser PASS, rights grant or publication claim. Required exact-HEAD CI and postflight/tail closure remain pending.