# Production 100% Truth Gate V1

This patch fixes the false-100% path in World Quality Autopilot V4.1.

## What it changes

- Visual quality is no longer considered fully evidenced when only one baseline is approved.
- Animation is no longer considered fully evidenced by synthetic/local-test rigs.
- Physical-device certification requires a configured provider + 100% device matrix + physicalProvider=true.
- 100% additionally requires a CI recomputation after the required checks pass.
- If any certification proof is missing, `readinessPercent` is capped below 100 and `production100Certified=false`.
- The ordinary release threshold remains usable; missing external physical-device evidence does not freeze all development/deployments.
- A dedicated regression test prevents the false-100% behavior from returning.
- Desktop AI instructions are updated so synthetic evidence, emulation, or auto-approving aesthetic baselines cannot be used to game the score.

## Apply

From the `World_server` repository root:

`node apply-production-100-truth-gate.cjs`

The installer:
- refuses a dirty working tree;
- automatically creates `ai/desktop/production-100-truth-gate-v1` when started from master/main;
- validates the exact expected Git blob versions before replacement;
- backs up every replaced file;
- installs the patch;
- runs syntax and truth-gate tests;
- runs `npm run quality:world`;
- writes `PRODUCTION_100_TRUTH_GATE_INSTALL_REPORT.json`;
- rolls back the patched source files if installation/tests fail.

After it passes, Desktop AI must run the full repository protocol, push the branch, open a PR, wait for CI, merge only when required checks pass, then verify Vercel production.

## Expected current result

With the current repository evidence (1/6 approved visual baselines, no physical provider, synthetic-only rig evidence), 100% must be BLOCKED.

Do not try to “fix” those blockers by:
- auto-approving the five aesthetic candidates;
- renaming synthetic samples;
- counting emulation as a physical phone;
- setting the CI flag manually outside the required CI workflow.
