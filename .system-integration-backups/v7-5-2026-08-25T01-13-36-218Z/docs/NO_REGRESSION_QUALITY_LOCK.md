# WORLD SERVER V4 — NO REGRESSION QUALITY LOCK

## Principle
Quality is monotonic. A new version may improve or preserve every accepted indicator, but may not silently reduce any one of them.

The gate compares the candidate against the last accepted baseline.

### Hard comparisons
- every quality metric: candidate >= baseline;
- every tracked technology integration: candidate >= baseline;
- project overall average: candidate >= baseline;
- unresolved release blockers: candidate <= baseline;
- every confirmed/protected error stays protected;
- every Golden Component remains canonical unless a verified migration exists;
- every certified app remains certified and keeps its accepted required capabilities;
- every critical regression test remains present.

One strong improvement cannot compensate for a regression elsewhere.

## Files
- `data/quality-policy.json` — immutable policy.
- `data/quality-baseline.json` — last accepted quality floor.
- `data/quality-scorecard.json` — current candidate scores.
- `data/quality-evidence.json` — evidence for improvements.
- `data/quality-migrations.json` — verified Golden/app contract migrations.
- `data/quality-history.json` — baseline acceptance history.
- `scripts/quality-regression-gate.js` — fail-closed comparison.
- `scripts/quality-score.js` — improvement-only score editor.
- `scripts/quality-accept-baseline.js` — promotes a verified release to the new floor.
- `QUALITY_REGRESSION_REPORT.json` — machine report.
- `QUALITY_DIFF.md` — Было / Сейчас / Δ.

## Workflow
1. Change code/assets.
2. Run `npm run release:gate`.
3. Run desktop + mobile Playwright.
4. If a metric objectively improves, update it only through `quality-score.js` with evidence.
5. User-confirmed fixed errors become `protected`.
6. User-approved reusable successes become Golden Components.
7. After verified release/user acceptance, run `QUALITY_ACCEPT_BASELINE=YES npm run quality:accept`.
8. That accepted state becomes the new minimum for every later version.

## Important platform lock
Repository code can detect and fail regression, but GitHub must also protect `master` and require the `quality-regression` status check. Without branch protection, a direct push can move `master` before CI reports failure. Vercel also receives `buildCommand: npm run release:gate` so a source/quality regression fails the deployment build.
