# Persist Canary loaded graphics JSON

## Task
Fix missing on-disk graphics JSON from Canary evidence artifact.
## Why
Actualrun42136530972 artifact13465824438 contains36PNG/0JSON. #612 screenshot preservation works but body attachment did not produce a JSON file.
## Current state
perceptual-visual.spec.js uses testInfo.attach({body}). Official Playwrightv1.62.1 worker/testInfo.ts delegates to normalizeAndSaveAttachment in util.ts: body branch returns memory buffer; path branch copies a real file. File presence cannot be inferred from attachment name.
## Target state
Write bounded already-existing graphics evidence JSON to testInfo.outputPath('loaded-state-graphics-evidence.json'), then attach using path. Existing upload glob can capture it.
## Files / systems involved
e2e/perceptual-visual.spec.js; test/perceptual-visual-evidence.test.js; this branch note.
## Known risks
Disk write failure must remain an explicit failure; never silently lose evidence. Only existing graphics JSON serialized, no env/trace/HTML/config dump. No public API.
## Golden systems that must be preserved
All screenshot assertions, composition assertions, thresholds, baselines, runtime, permissions, schedules, Netlify and accepted games.
## Errors that must not return
A body attachment is not proof of disk persistence. Never mark JSON preservation complete before actual artifact inspection.
## Exact patch / change plan
Use existing fs import; insert fixed outputPath/writeFileSync and replace attach body with path. Add focused regression executing actual evidence-persistence source block in temporary isolated directory, asserting file content/path after simulated later screenshot failure.
## Tests to run
Run regression against original block (expectFAILmissingfile), patched block (expectPASS), node syntax; exactHEAD mandatory cloudCI. No local browser/fullnpm.
## Deployment / PR plan
ai/codex/persist-canary-json-20261106 from1d237; draft PR, then exact checks and merge. New justified master Canary after fix must prove JSON files; no oldrunrerun.
## Current progress
Executoridle/reference-only;22openPRfilescollisionfalse. Existingrulesunchangedby4b82/1d237(CI/docs only), nested e2eAGENTS404. Guardpreverificationokcleanupfalse. Collective route/recall run (0results), no new delegate.
## Next action
Reproduce missing disk file before edit, then minimal fix and targeted regression.
## Completion criteria
Focused regression PASS, mandatory exactHEADchecks PASS; actual nextmasterartifact contains parseable graphicsJSON with matched scene/viewport evidence. VisualFAILremainsFAILuntilrootcausefixed.
## Final evidence
Actual regression original0PASS/1FAIL: JSON must be a real file for upload-artifact. Patched1PASS/0FAIL (same source block executed), node syntaxPASS. Test preserves evidence after simulated later screenshot assertion failure. Candidate28a5179de822cfcb2f6870b357d7ac61cda7045a check/agent-rules/quality/world-quality/godot/fleet/WorkersSUCCESS. Actualquality42140170922 has18passed(17.9s). Lighthouse pending at recording. Preview42140170904 actual10037Free100Workers, not rerun. VisualBaselineCandidates42140170819SUCCESS creates candidates only, never approval/baseline mutation. Final note-update HEAD requires its own exact checks. Actual masterartifactJSON still PENDING. ExistingactualPNGinspection is not JSON evidence.
