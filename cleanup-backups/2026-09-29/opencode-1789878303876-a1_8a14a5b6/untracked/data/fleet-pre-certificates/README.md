# Fleet PRE certificates (optional corroborating source)

This directory is an **optional secondary source** for the merge-chain Fleet-PRE
gate (`scripts/check-fleet-pre-certificate.cjs` + `.github/workflows/fleet-pre-merge-chain.yml`).

## Authoritative source

The authoritative certificate source is **issue #80**, scanned as comments for the
machine-readable marker:

```
[FLEET][PRE_INTEGRATION_QA][PR_<PR_NUMBER>][EXACT_HEAD_<40_hex_sha>]
READY_FOR_OCEAN=YES
```

A checked-in JSON file here can only **corroborate** the issue #80 certificate.
It can **never** grant a PASS by itself: evaluation fails closed with
`BLOCKED_SOURCE_UNAVAILABLE` when the authoritative issue #80 source is absent, and
with `BLOCKED_AMBIGUOUS` when this secondary source contradicts the authoritative
verdict for the exact head SHA.

## File format

Each tracked file must be JSON. It may be a single object or an array of objects:

```json
{
  "pr": 188,
  "exactHeadSha": "0123456789abcdef0123456789abcdef01234567",
  "verdict": "READY_FOR_OCEAN",
  "verifiedAt": "2026-09-20T12:00:00.000Z"
}
```

- `pr` — numeric PR number.
- `exactHeadSha` — full 40-character lowercase Git SHA of the PR head.
- `verdict` — `READY_FOR_OCEAN`, `RETURN_TO_BUILDER`, `BLOCKED`, or omitted/unknown.
- `verifiedAt` — ISO-8601 timestamp of the independent Fleet PRE verification.

Do not check in files that claim a PASS for an SHA that has no matching
`[FLEET][PRE_INTEGRATION_QA]` certificate with `READY_FOR_OCEAN=YES` in issue #80;
the gate will block anyway.