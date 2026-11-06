# Restore actual eight-tool HTTPS smoke coverage
## Task / why
Existing smoke discovers eight names but calls only six, then prints eight-tool PASS. Add search_mechanics and get_dependencies checks.
## Current / target
Base a0303d97038eecc5d77c3d793825b4b8ca6e1989. Three regression counterexamples fail before repair. Target: eight actual calls, empty unlicensed mechanics, all six candidates and unknown dependencies denied.
## Files / risks / preserved systems
Only mcp/live-smoke.mjs, test/meta-games-live-smoke-coverage.test.js and this note. #594 also edits live-smoke, but its catalog/count/Veil hunks are separate and remain untouched. Executor idle; no active edit reported. No server permissions, Netlify, catalog counts, deployment, schedules or game changes.
## Plan / tests
Add strict-gate mechanics call and dependency denial loop. Execute actual smoke source with controlled transport in three meaningful Node regressions; node syntax check. Cloud CI and real HTTPS workflow required on exact final HEAD.
## PR / progress / next action
Separate branch and PR. Preflight cleanup=false verification allowed; RAM critical so no heavy installation/browser. Before repair 0 PASS / 3 FAIL. After repair and exact CI evidence recorded in PR checks/comments, avoiding self-referential note commits.
## Completion criteria / final evidence
Three regressions pass; real HTTPS calls all eight names and denies 21 candidate/unknown reads. No claim that controlled transport proves deployment. #614 quality timed out downloading Ubuntu packages; browser gate skipped, merge remains blocked. Owner acceptance, #594 permission and visual Canary failures remain open.
