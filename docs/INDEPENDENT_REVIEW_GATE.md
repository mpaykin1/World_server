# Independent maintainer review gate

This gate implements **Builder != Reviewer != Maintainer**. It adds no scheduled
task; it runs on PRs and can be dispatched manually against an existing PR.

- Reviewer pins the exact SHA of trusted **master** before checkout. Historic
  PR base SHAs are used **only for the diff**, never as executable checkout.
  PR code is fetched as *inert* Git diff; no untrusted script runs with credentials.
- At runtime, the OpenRouter catalog is inspected. Two **distinct model
  families** with verified zero prompt/completion price are selected; where
  supported, JSON-only output is requested. An unavailable or malformed free
  model is recorded as INCONCLUSIVE, and a different verified free model may
  provide another independent review; a BLOCK always vetoes. The
  default Builder family (Qwen) is excluded. `WORLD` repository secret is read
  only by the trusted reviewer step. No fallback to a paid model. Transient
  HTTP 429/502/503/504 gets one bounded retry, unsupported advertised JSON mode
  gets one strict-parser retry without response_format, and a 65-second timeout
  moves to a distinct free alternative; truncated output can never yield PASS.
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

## 2026-09-23: Independent free-provider diversification

OpenRouter's Free account has a shared quota (currently 50 requests/day).
Adding more model IDs alone cannot solve account-wide 429 responses.
The reviewer now attempts zero-priced, live-catalog-verified OpenRouter
model families sequentially and stops after 429s from two different
families rather than burning more of the same account quota.

Cloudflare Workers AI is a separately metered optional provider. Its
documented Workers Free allocation is 10,000 Neurons/day, and the
independently trained Google Gemma 4, Z-AI GLM 4.7 Flash and NVIDIA
Nemotron 3 families are listed for Workers Free access. The workflow
uses repository secrets named CLOUDFLARE_ACCOUNT_ID and
WORLD_CF_AI_API_TOKEN, created with Workers AI Read/Edit permissions.
The separate CLOUDFLARE_API_TOKEN is reserved for deployment. The
new review secret exists, but live API permission is not yet verified.
Do not print or export token values. The existing review job executes
ONLY the trusted master checkout and passes the inert PR diff as data.

**Non-negotiable free-only activation:** the GitHub repository variable
WORLD_CF_WORKERS_FREE_CONFIRMED must be set to the literal `true` only
after the account's *Workers Free plan* is verified. Workers Paid can
charge for usage above the free daily allocation, so unknown or paid
accounts remain disabled. A Cloudflare 401/403/429 fails closed and
falls back to available OpenRouter families. No unapproved paid fallback.
Cloudflare only receives patches at or below 18 KB, conserving budget.

Two PASS results must come from distinct MODEL FAMILIES even when
provider endpoints differ. One BLOCK vetoes every PASS. Missing
credentials, quota exhaustion, malformed output and empty reasoning
responses cannot approve a patch. Model results never replace the
maintainer decision or production user-visibility verification.

## Token-value-only rule (2026-09-23)

For `WORLD_CF_AI_API_TOKEN`, paste ONLY the raw token value, not a
Cloudflare REST API example, curl command, JSON response, or HTTP header.
A pasted command previously caused a native header-validation error with
credential text in an artifact. The affected artifact was deleted and
the malformed GitHub secret removed; Workers AI remains disabled pending
Cloudflare token revocation and replacement. Never store the token in
this repository, issue text, PR comments, test logs, or screenshots.

The reviewer validates token syntax before building headers and emits
only explicitly allowlisted, credential-free error messages. The same
sanitization applies to OpenRouter transport failures. Re-enable Workers
AI only after the replacement token is safely stored, the Workers Free
plan is reconfirmed, and the redaction patch has passed all CI checks.
