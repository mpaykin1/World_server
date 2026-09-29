# Fleet PRE certificates (merge-chain gate)

Machine-checkable evidence store behind the `fleet-pre-cert` required CI check and
`scripts/check-fleet-pre-certificate.js`.

## Purpose

The canonical integration pipeline is `Builder -> Fleet PRE -> Ocean -> Fleet POST`.
This gate makes the protected integration step (`master`) dependency-checkable:

> A PR may be integrated only when an unambiguous **Fleet PRE** certificate says
> `READY_FOR_OCEAN = yes` for the **exact final PR HEAD_SHA**.

It rejects stale certificates, SHA mismatches, missing/skipped certificates,
future-dated certificates, duplicate/conflicting certificates for the same SHA,
and Builder self-certification.

## File naming

```
data/fleet-pre-certificates/fleet-pre-<40-hex HEAD_SHA>.json
```

One certificate per exact SHA. Any additional certificate that references the same
exact SHA blocks the gate (`DUPLICATE_CERTIFICATE`).

## Schema (schemaVersion 1)

```json
{
  "schemaVersion": "1",
  "stage": "PRE_INTEGRATION_QA",
  "role": "FLEET_PRE",
  "verdict": "READY_FOR_OCEAN",
  "status": "yes",
  "certificateId": "<unique id, >= 16 chars>",
  "pr": 123,
  "headSha": "<40-hex exact final PR HEAD_SHA>",
  "baseSha": "<40-hex master base the head was certified against>",
  "certifier": "<independent verifier identity, never the PR head author>",
  "certifiedAt": "<ISO-8601 UTC>",
  "summary": "probes: /api/worlds 200 x3; /data/world-graph-index.json 200 x3; sha attestation ok; desktop+mobile ok"
}
```

## Gate semantics (exact-SHA, fail-closed)

| Condition | Result |
| --- | --- |
| no certificate for the exact HEAD_SHA | BLOCK `MISSING_CERTIFICATE` |
| certificate file for HEAD_SHA declares a different SHA | BLOCK `SHA_MISMATCH` |
| certificate for HEAD_SHA says `RETURN_TO_BUILDER` / `status != yes` | BLOCK `NOT_READY_FOR_OCEAN` |
| certificate role/stage is not Fleet PRE / PRE_INTEGRATION_QA | BLOCK `WRONG_ROLE` / `WRONG_STAGE` |
| certificate older than 48h or future-dated | BLOCK `STALE_CERTIFICATE` / `FUTURE_CERTIFICATE` |
| more than one certificate for the same SHA | BLOCK `DUPLICATE_CERTIFICATE` |
| `certifier` equals the PR head author | BLOCK `SELF_CERTIFIED` |
| `baseSha` provided and does not match certificate base | BLOCK `BASE_SHA_MISMATCH` |
| exactly one valid Fleet PRE READY certificate for the exact SHA | PASS |

## Who can issue

Only the independent **Fleet PRE** verifier role publishes certificates here
(never the Builder that authored the PR head). Pipeline routing in `issue #80`
enforces role separation; the machine gate additionally rejects
self-certification and wrong-role certificates.

## Usage

```bash
node scripts/check-fleet-pre-certificate.js \
  --head-sha <40-hex PR HEAD_SHA> \
  --base-sha <40-hex master base> \
  --certifier-must-not-equal <PR head author login>
```

Exit code `1` blocks integration; exit code `0` permits the exact candidate to
proceed to Ocean. CI wiring: `.github/workflows/ci.yml` job `fleet-pre-cert`
(run on every `pull_request` targeting `master`; must be listed as a required
status check in branch protection for `master`).