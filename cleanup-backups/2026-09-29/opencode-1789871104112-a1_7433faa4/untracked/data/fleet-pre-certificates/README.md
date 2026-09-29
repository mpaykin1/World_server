# data/fleet-pre-certificates/ — Fleet PRE certificate secondary source

Optional checked-in machine-readable certificates consumed by
`scripts/check-fleet-pre-certificate.cjs` when the primary source (issue #80
comment scan via `gh api`) is not reachable from a hermetic environment.

The **authoritative** source remains issue #80 comment markers:

`[FLEET][PRE_INTEGRATION_QA][PR_<num>][EXACT_HEAD_<full_sha>]` together with
`READY_FOR_OCEAN=YES` in the same comment, fetched through the GitHub API and
deterministically parsed. Files in this directory are only a secondary,
checked-in fallback; they never override a fresh exact-SHA issue comment and a
conflict between sources is BLOCK (`source-unavailable-or-ambiguous`), never a
green.

## File format

Each `*.json` file is either a single certificate object or an array of them:

```json
{
  "schema": "fleet-pre-certificate-v1",
  "pr": 187,
  "exactHeadSha": "8324f889c372fbcaad2bf4e717c9010a4e173cb4",
  "verdict": "READY_FOR_OCEAN",
  "createdAt": "2026-09-20T12:00:00.000Z"
}
```

- `schema` — must equal `fleet-pre-certificate-v1`.
- `verdict` — `READY_FOR_OCEAN` or `RETURN_TO_BUILDER`. Anything else, a
  skipped flag, or an empty record is BLOCK.
- `exactHeadSha` — full 40-char hex lowercase PR head SHA. A SHA mismatch
  against the PR head is BLOCK.
- `createdAt` — ISO-8601 UTC timestamp. Older than 24h (default max-age) is
  BLOCK (`stale-certificate`).

## Lifecycle

The Fleet PRE role posts certificates to issue #80. Files here are regenerated
only when a deterministic offline check-in is explicitly requested for a given
merge-chain dispatch; stale or superseded files must be removed rather than
kept as misleading history.

Gate: `.github/workflows/fleet-pre-merge-chain.yml` + regression tests in
`test/fleet-pre-certificate.test.js`. Do not edit without re-running
`npm run check`.