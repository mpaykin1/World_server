# Fleet PRE certificates — repo source of truth

This directory is the deterministic, checked-in source of Fleet
`PRE_INTEGRATION_QA` certificates used by the merge-chain gate.

## File naming

`data/fleet-pre-certificates/<exact-40-hex-head-sha>.json`

## Certificate schema

```json
{
  "certificate": "FLEET_PRE",
  "pr": 117,
  "exactHeadSha": "<40-hex Git SHA of the exact PR head>",
  "verdict": "READY_FOR_OCEAN",
  "verifiedAt": "2026-09-16T12:00:00.000Z",
  "canonical": {
    "pr": 117,
    "sha256": "<optional 64-hex sha256 of the certificate document>"
  }
}
```

Rules (all enforced by `scripts/check-fleet-pre-certificate.cjs`):

- missing certificate => BLOCK
- skipped/empty certificate => BLOCK
- `exactHeadSha != PR head SHA` => BLOCK
- `verdict != READY_FOR_OCEAN` => BLOCK
- `verifiedAt` older than max age (default 24h, `FLEET_PRE_MAX_AGE_HOURS`) => BLOCK
- source unavailable/ambiguous => BLOCK
- exact fresh certificate => PASS

The merge-chain gate (`fleet-pre-merge-chain` GitHub Actions check) uses this
repo source only. The alternate unauthenticated issue #80 comment scan
(`[FLEET][PRE_INTEGRATION_QA][PR_<n>][EXACT_HEAD_<sha>]...READY_FOR_OCEAN=YES ... VERIFIED_AT=<ISO>`) is available only as an explicit opt-in
(`--source=issue80`) and never falls back to the repo source; choose ONE
deterministic source per run.