# Fleet PRE certificates — integration authorization (deny-by-default)

This directory is the **single authoritative machine-readable source** for
exact-SHA Fleet PRE certificates. Nothing in this repository may be fully
signed off for Ocean integration without a fresh certificate that passes
`scripts/check-fleet-pre-certificate.cjs` for the exact PR head.

## Contract

- **What it authorizes:** `READY_FOR_OCEAN` — the independently verified Fleet
  PRE verdict for one exact PR head SHA.
- **Deny-by-default:** if this directory is absent, empty, malformed,
  ambiguous, stale (default max age 24 h) or not the exact head SHA, the gate
  **BLOCKs**. Absence is never treated as "nothing to verify".
- **Only an independent Fleet PRE stage writes certificates here.** A Builder,
  Ocean, Architect or any non-independent stage must never self-issue one.
- **One head = one certificate.** Conflicting certificate files for the same
  head BLOCK.

## File layout

```
data/fleet-pre-certificates/<exactHeadSha>.json
```

The file name and the `exactHeadSha` field must match the PR head exactly;
a mismatch between file name and content BLOCKs.

## Certificate schema

```json
{
  "certificate": "FLEET_PRE",
  "pr": "#1234",
  "exactHeadSha": "<40 hex characters of the exact PR head>",
  "verdict": "READY_FOR_OCEAN",
  "verifiedAt": "2026-09-19T15:12:49Z",
  "canonicalSha256": "<64 hex characters identifying the retained evidence artifact>"
}
```

Required fields:

| Field | Meaning |
| --- | --- |
| `certificate` | Literally `FLEET_PRE`. Anything else BLOCKs. |
| `pr` | The PR this certificate belongs to. Missing/empty BLOCKs. |
| `exactHeadSha` | The exact candidate SHA. Must equal the PR head and the file name. |
| `verdict` | Literally `READY_FOR_OCEAN`. Any other verdict BLOCKs. |
| `verifiedAt` | ISO 8601 timestamp of the independent verification. Future or older than 24 h BLOCKs. |
| `canonicalSha256` | 64-hex digest of the retained Fleet evidence artifact. Malformed/missing BLOCKs. |

## Gate wiring

- CLI check: `node scripts/check-fleet-pre-certificate.cjs <head-sha>`
  (exit 0 = PASS, exit 1 = BLOCK).
- CI: `.github/workflows/fleet-pre-merge-chain.yml` reports a
  `fleet-pre-merge-chain` check on every PR targeting `master`; it is green
  only when this script passes on the exact PR head SHA.
- Regression tests: `test/fleet-pre-certificate.test.js` (inside `npm run check`).