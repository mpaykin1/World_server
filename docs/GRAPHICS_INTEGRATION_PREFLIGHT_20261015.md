# Graphics integration preflight — 2026-10-15

Status: ISOLATED / NOT INSTALLED / NO PRODUCTION CHANGE.

## Scope
Evaluate ArtCraft/PhotoCraft/VectorCraft, ComfyUI, and the exact candidate model identifiers in a separate graphics lab before integration with games/ostrov-sumerek.

## Non-negotiable safeguards
- Do not install GPU-heavy models on the user's CPU-only server or desktop automatically.
- Do not introduce new hourly automation, new game engine, or modify master/runtime.
- Preserve existing five AKA roles and game/CLEAN_SERVER work. The scheduling priority discrepancy between AI_START_HERE.md and tech-lab LIVE_STATUS.json requires explicit reconciliation, not silent overwrite.
- Confirm each upstream repository URL, version, code license, model weights license, commercial-use rights, and any hosted API terms; unverified candidates are excluded.
- Keep external tools isolated behind optional adapters. No paid API, card, or secrets in client code.
- Pin dependencies and hashes. Cache sizes and CPU/RAM limits must be bounded. Temporary files cleaned safely.
- Never weaken CI, review, security, or deployment gates to pass the experiment.

## Acceptance gates
1. Baseline exact game SHA, browser screenshots and frame-time measurements captured.
2. One reproducible asset produced from a verified licensed source, with SHA and attribution.
3. Game imports that asset without changing core engine; fallback works when the optional tool is unavailable.
4. Desktop and simulated mobile regression tests pass; physical iPhone remains UNKNOWN until measured.
5. Side-by-side reference comparison and render cost recorded; no unearned 85% visibility claim.
6. Independent verification on exact SHA, then user PASS/FAIL; no automatic promotion based only on CI.
7. Only after evidence, propose integration in an existing relevant implementation branch or a single owned PR, not a competing production change.

## Known blockers at time of writing
- Open PRs #379, #491, #496, #500, #511, #512: inspect current gates before any production merge.
- Tech lab checkpoint16 reports independent reference quality >=85/100 UNKNOWN, no real iPhone11, no stable public test URL.
- ArtCraft components and model names/licenses must be individually verified; do not assume PhotoCraft or VectorCraft licensing from a similarly named project.
- Productive 50/50 minutes UNMEASURED; main bootstrap currently prioritizes Ostrov and suspends former 50/50 policy.

## Next executable action
Verify upstream candidates and choose ONE light-weight asset-only experiment; run pinned baseline + candidate screenshots and performance tests in isolated lab. Do not merge this checklist as proof of integration.
