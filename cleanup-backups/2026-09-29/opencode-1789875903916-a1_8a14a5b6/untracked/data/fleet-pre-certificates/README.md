# Fleet PRE certificates (checked-in secondary source)

Optional, checked-in secondary source for the merge-chain Fleet-PRE exact-SHA gate.

The **authoritative** source is a scan of issue #80 comments for the marker:

```
[FLEET][PRE_INTEGRATION_QA][PR_<number>][EXACT_HEAD_<full-40-hex-sha>]
```

containing `READY_FOR_OCEAN=YES`, fetched at gate time by
`scripts/check-fleet-pre-certificate.cjs` through the `gh` CLI.

This directory is only a deterministic offline/fallback mirror for scenarios
where the issue comment scan cannot be performed. Files are named
`<full-40-hex-sha>.json` and must follow schema version 1:

```json
{
  "format": "fleet-pre-certificate",
  "version": 1,
  "source": "issue-80-comment",
  "pr": 118,
  "headSha": "<full-40-hex-sha>",
  "verdict": "READY_FOR_OCEAN",
  "issuedAt": "2026-09-20T01:05:39Z",
  "commentId": 123
}
```

Fail-closed behavior:

- No source available and no checked-in cert => BLOCK (`no-source`).
- Checked-in cert with verdict other than `READY_FOR_OCEAN` => BLOCK.
- Checked-in cert whose head SHA differs from the PR head => BLOCK.
- Checked-in cert older than the max age (default 24 h) => BLOCK.
- Both the issue scan and a checked-in cert exist => BLOCK (`ambiguous`); the
  issue scan is authoritative and a mirror must not run in parallel.

Never fabricate a certificate. A missing cert stays RED until an independent
Fleet PRE_INTEGRATION_QA stage issues an exact-SHA `READY_FOR_OCEAN=YES`.