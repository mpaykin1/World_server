# Independent maintainer review gate

This gate implements **Builder != Reviewer != Maintainer**. It adds no scheduled
task; it runs on PRs and can be dispatched manually against an existing PR.

- Reviewer executes the latest trusted **master** code. Historic PR base SHAs
  are used **only for the diff**, never as a reviewer executable checkout.
  PR code is fetched as *inert* Git diff; no untrusted script runs with credentials.
- At runtime, the OpenRouter catalog is inspected. Two **distinct model
  families** with verified zero prompt/completion price are selected; the
  default Builder family (Qwen) is excluded. `WORLD` repository secret is read
  only by the trusted reviewer step. No fallback to a paid model.
- Both models independently try to falsify the change: real defects, security,
  backwards compatibility, concurrency, performance and missing negative tests.
- A single BLOCK vetoes. Unavailable key, model, invalid response, oversized or
  binary patch, model disagreement or catalog outage yield INCONCLUSIVE.
  Neither is equivalent to PASS. Reports bind to exact base/head and patch SHA.
- Even two PASS verdicts do **not** merge or approve the PR. Existing mandatory
  CI, human maintainer judgment and user-visible acceptance remain necessary.

## Initial installation and protection

This workflow uses `pull_request_target`: it runs only trusted base code,
not workflow modifications proposed by a PR. On its own installation PR the
workflow is not yet in master; existing CI and local offline tests must pass.
After merging and verifying a **live** review, require the exact-head check
`World Independent Adversarial Review` in GitHub branch protection. Never mark
the reviewer required before a non-bootstrap run is successful.

To run against an existing open PR after installation: use workflow dispatch
with `pr_number`. Reports are GitHub Actions artifacts, not magic percentage
claims. Review model outage must be fixed or escalated to a human; do not
silently convert an unavailable review to a PASS.

Local checks: `node --test test/independent-review-gate.test.js` and
`node --check scripts/independent-review-gate.cjs`. The test suite mocks
providers and does not spend tokens.

## Next-experiment planning (reuses current World Quality Autopilot)

The scheduled world-quality workflow already runs daily; **no sixth scheduled task**
is added. Its existing Candidate Lab now feeds `scripts/world-next-experiment.cjs`,
which writes `WORLD_NEXT_EXPERIMENT_REPORT.json`. Every proposal has a fixed
same-tier counterfactual, input hash, measurable acceptance and rejection
rules. It never changes world configuration or calls a prediction measured.
A candidate must survive the separate independent PR review plus existing
Golden Standard, CI, real-device comparisons and >=85% user visibility before
any testing link is delivered.
