# Desktop AI — System Integration V7.5

## Mandatory behavior
1. Never install on `master`/`main`; create an `ai/desktop/...` branch.
2. Install patches 01→18 in order, then install patch 19 V7.5 last.
3. Do not use last-writer-wins. Unknown or locally improved files require semantic merge and a version bump.
4. Never call a function 100% because a file exists. `CERTIFIED_100` requires its explicit machine-readable contract and fresh evidence newer than the source.
5. A new feature must strengthen existing `CERTIFIED_100` functions. Run Honest-100 + Monotonic Guard before promotion. If a certified function regresses, block promotion and restore/fix it; do not waive the gate.
6. Preserve mandated technologies/APNG and finished graphics. Never simplify/remove working graphics, physics, movement, shadows, textures, light, sound variation or gameplay spatial contracts.
7. Prefer scalable, CPU-first, minimum-manual-action solutions. Improve safe items automatically; never require GPU.
8. Always deliver full corrected files, never ask the user to edit individual lines. Never paste HTML into chat; provide a downloadable artifact instead.

## Exact V7.5 verification
Run from repository root:
`npm run integration:full`
`npm run release:gate`
`npm run integration:functions:audit`
`npm run integration:functions:coverage`
`npm run integration:functions:verify`
`npm run integration:cas:replicate`
`npm run integration:device-fleet`
`npm run integration:slo:autopilot`
`npm run integration:db:fencing`
`npm run integration:causal:native`

## Long-run evidence — never fake it
Run `npm run integration:soak:long` until at least 8 real wall-clock hours are recorded; 24h is preferred. Short smoke PASS proves the harness only and MUST NOT set `longSoakCertified=true`.

## External/native truth gates
Operational 100% is forbidden until all applicable evidence is real/fresh: safe Cosign >=3.1.3; independent remote CAS peer; fresh real Android+iOS; native Wasmtime/TLC where required; completed dependency security scan; transactional production deployment evidence; fenced production leader lease; live fenced migration evidence when migrations are in scope; native ETW/eBPF/perf/OBI collector when native causal coverage is claimed; >=8h long-soak evidence.

## Failure loop
For every reproducible failure: root cause → replace/fix complete file/system → rerun affected tests → `integration:full` → `release:gate`. Never stop at a false green. Preserve Stable until Candidate passes all evidence.

## Final report
Report separately: structural readiness %, evidence confidence %, operational readiness %, Honest-100 certified/contracted count, global capability certification %, external blockers, failed gates, branch/commit/deployment evidence. Never merge those into a misleading single 100%.
