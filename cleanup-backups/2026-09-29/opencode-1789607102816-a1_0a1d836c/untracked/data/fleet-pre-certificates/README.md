# Fleet PRE certificate registry

This directory is the deterministic repo-truth registry for **Fleet PRE
integration certificates**. It exists to close GAP B (merge chain): since
v2.3, a PR targeting `master` is not fully green until the
`fleet-pre-merge-chain` check proves that an exact, fresh, unambiguous
`READY_FOR_OCEAN` certificate exists for the **exact PR HEAD SHA**.

Nobody may merge a PR whose exact final HEAD SHA does not carry such a
certificate. The Builder never self-certifies; the certificate is issued and
pushed by the independent Fleet PRE role only.

## Certificate file

One file per certified head:

```
data/fleet-pre-certificates/<headSha>.json
```

```json
{
  "certificate": "FLEET_PRE",
  "pr": "123",
  "exactHeadSha": "<40-hex git sha of the exact PR HEAD that was verified>",
  "verdict": "READY_FOR_OCEAN",
  "verifiedAt": "2026-09-16T12:00:00Z",
  "canonicalSha256": "<64-hex canonical fingerprint of the certificate fields>"
}
```

`canonicalSha256` must equal `sha256(JSON.stringify([certificate, pr,
exactHeadSha.toLowerCase(), verdict, verifiedAt]))`. The gate recomputes it and
rejects any tampered certificate.

## Gate behavior (fail closed)

`node scripts/check-fleet-pre-certificate.cjs --head <sha>` exits `0` only when
an exact, unexpired (<= 24 h), unambiguous `READY_FOR_OCEAN` certificate is
found. It blocks on:

1. no certificate source available;
2. skipped / empty certificate;
3. `exactHeadSha` != PR head SHA;
4. verdict != `READY_FOR_OCEAN`;
5. certificate older than the max age (default 24 h);
6. unparseable / future `verifiedAt`, invalid schema, or bad `canonicalSha256`;
7. conflicting certificates for the same exact head.

Source precedence (`--source auto`, the CI default): the file in this
directory first, then the copy present on `origin/master`
(`data/fleet-pre-certificates/<headSha>.json`), then the issue #80 comment
scan mirror (`[FLEET][PRE_INTEGRATION_QA][PR_#N][EXACT_HEAD_<sha>] ...`
`READY_FOR_OCEAN=YES` with a `verifiedAt`). Every unavailable/ambiguous source
fails closed; a rejected certificate (`READY_FOR_OCEAN=NO` or a different
exact head) blocks the merge.

## Lifecycle

1. Builder pushes the final exact head on the PR.
2. Fleet PRE independently re-fetches the exact HEAD SHA, runs its full
   falsification probes, then commits
   `data/fleet-pre-certificates/<headSha>.json` (and, where available, the
   issue #80 comment mirror) for the exact certified head.
3. `fleet-pre-merge-chain` re-runs on the new head and turns green only when
   the exact fresh certificate is present.
4. Ocean integrates only that SHA; Fleet POST re-verifies the integrated
   master.

The registry is signed by the canonical fingerprint only; it is *not* a
cryptographic identity oracle. Fleet PRE distinct-role enforcement is the
process-level guarantee.