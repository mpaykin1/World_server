# Fleet PRE Merge Chain — exact-SHA integration gate

GAP B closure (issue #80, 2026-09-16): before any PR targeting `master` may integrate,
an **unambiguous, exact-SHA Fleet PRE certificate** with `READY_FOR_OCEAN=YES` must exist — machine-checked,
never self-certified by Builder, and never greened by a skip/fallback path.

## Problem it closes

- `#116`, `#117`, `#121` merged with **no** independent exact-SHA Fleet PRE certificate.
- Whole-tree grep for `READY_FOR_OCEAN | PRE_INTEGRATION_QA | FLEET_PRE | fleet-cert | merge-chain` was **zero**
  enforcement on `master`.
- This reproduces the `#91`/`#113` false-green bypass class: CI could appear healthy while independent
  pre-integration falsification never happened for the exact final head.

## Authoritative certificate source (deterministic, single)

Only **unauthenticated-OK issue #80 comment scan** is authoritative:

```
[FLEET][PRE_INTEGRATION_QA][PR_<number>][EXACT_HEAD_<40-hex-sha>] ... READY_FOR_OCEAN=YES
```

Rules:

- The comment header must repeat the exact `[FLEET][PRE_INTEGRATION_QA]`, `[PR_<n>]` and `[EXACT_HEAD_<sha>]` tokens.
- `verifiedAt` = the comment `created_at` from the GitHub API.
- A checked-in `data/fleet-pre-certificates/<sha>.json` file is **never** authoritative on its own and can never
  produce a green check (`CERT_FILE_NOT_AUTHORITATIVE`). Repository truth stays Fleet comments; the file variant
  fails closed so a stale or hand-authored file cannot bypass Fleet.
- Anything other than `READY_FOR_OCEAN=YES` for the exact head of the exact PR blocks integration.

## Fail-closed validation rules (`scripts/check-fleet-pre-certificate.cjs`)

| # | Rule | Result |
|---|------|--------|
| 1 | No cert records / source returns nothing | BLOCK `NO_CERT_FOUND` |
| 2 | Skipped, empty or malformed cert (empty verdict/sha/timestamp) | BLOCK `SKIPPED_OR_INVALID_CERT` |
| 3 | `exactHeadSha != PR head SHA` | BLOCK `EXACT_SHA_MISMATCH` |
| 3b | Cert SHA matches but belongs to another PR | BLOCK `PR_MISMATCH` |
| 4 | `verdict != READY_FOR_OCEAN` | BLOCK `VERDICT_NOT_READY_FOR_OCEAN` |
| 5 | `now - verifiedAt > max-age` (default 24h) | BLOCK `STALE_CERTIFICATE` |
| 6 | Source unreachable/error, or same-sha same-time conflicting verdicts | BLOCK `CERT_SOURCE_UNAVAILABLE` / `AMBIGUOUS_CERT` |
| 7 | Exact fresh cert, exact PR, correct verdict | PASS `FRESH_EXACT_SHA_CERTIFICATE` |

`validateCertificates` is a **pure function** (no I/O) and is exported together with the parsers so the offline
test suite exercises every rule without network. CLI I/O (comment fetch) is a separate exported function.

## Workflow

`.github/workflows/fleet-pre-merge-chain.yml` runs on every `pull_request` targeting `master` and on
`workflow_dispatch`. It reports the `fleet-pre-merge-chain` check against the PR **head** SHA and only turns green
when the exact-SHA cert passes. No `|| true`, no `continue-on-error`, no `if: always()`, no Netlify fallback.

The check uses read-only permissions (`contents: read`, `issues: read`). Manual/local runs need no token
(unauthenticated public API); a `GH_TOKEN`/`GITHUB_TOKEN` is honored when present.

Owner later marks `fleet-pre-merge-chain` as a required status check on `master` (owner-only step).

## Local CLI

```powershell
node scripts/check-fleet-pre-certificate.cjs <40-hex-head-sha> --pr <n>
# optional: --max-age-hours <h>  --issue <n>  --repo <org/repo>  --api-base <url>
# exit 0 = PASS, exit 1 = BLOCK, exit 2 = usage error
```

## Integration contract

1. Builder pushes the final exact head on the owned PR.
2. **Fleet PRE** (independent) re-fetches `EXACT_HEAD_<sha>`, re-probes the live slice and the repo gates, and
   publishes `[FLEET][PRE_INTEGRATION_QA][PR_<n>][EXACT_HEAD_<sha>] READY_FOR_OCEAN=YES` on issue #80.
3. `fleet-pre-merge-chain` turns green for that exact head.
4. Ocean integrates **only that SHA**. Fleet POST independently verifies the live master.
5. Missing, skipped, different-SHA, stale or ambiguous certificates keep the check red.

## Regression guard

- Rule tests (7 fail-closed + happy path + PR mismatch + ambiguous) and a bypass-class workflow scan are part of
  `npm run check` (`node --test test/fleet-pre-certificate.test.js`).
- The scan asserts the workflow cannot be green without the cert check and contains no skip/fallback-green pattern.

## Rollback / scope

Revert only this delta's commits (`.github/workflows/fleet-pre-merge-chain.yml`, `scripts/check-fleet-pre-certificate.cjs`,
`test/fleet-pre-certificate.test.js`, `docs/FLEET_PRE_MERGE_CHAIN.md`, `WORK_IN_PROGRESS.md`). Baseline
`master` = `414179ea`; `LIVE_VERIFIED_LKG=414179ea`. No app/game/runtime change; no production deploy by anyone
this cycle; Vercel deploy skipped (only `docs/`, `scripts/`, `test/` and `.github/` touched).