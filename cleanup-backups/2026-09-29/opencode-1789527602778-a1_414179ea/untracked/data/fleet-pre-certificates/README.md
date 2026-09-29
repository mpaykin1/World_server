# Fleet PRE certificates (merge-chain gate)

Machine-readable authority for the **merge-chain Fleet PRE exact-SHA gate**
(`scripts/check-fleet-pre-certificate.cjs` + `.github/workflows/fleet-pre-merge-chain.yml`)
that closes control-plane GAP B: Ocean may integrate a PR only when an
unambiguous Fleet PRE certificate says `READY_FOR_OCEAN` for the **exact final
PR HEAD_SHA**.

## Certificate JSON (file form)

For deterministic offline validation the certificate is stored at
`data/fleet-pre-certificates/<exactHeadSha>.json`:

```json
{
  "certificate": "FLEET_PRE",
  "schemaVersion": 1,
  "pr": 118,
  "branch": "opencode/merge-chain-fleet-pre-gate",
  "exactHeadSha": "0123456789abcdef0123456789abcdef01234567",
  "verdict": "READY_FOR_OCEAN",
  "verifiedAt": "2026-09-16T01:06:33Z",
  "source": "fleet-pre-certificates",
  "canonical": "<sha256 of the canonical JSON WITHOUT the canonical field>"
}
```

The `canonical` field is mandatory in the file form: `sha256` (lowercase hex) of
the deterministic canonical serialization (sorted keys, empty/null/undefined
fields dropped, `canonical` excluded). A missing or non-matching `canonical` is a
BLOCK. `canonicalJson`/`formatIssuedCert` in the checker produce it
deterministically.

## Issue form (CI-authoritative)

The CI gate uses the **issue comment scan**, not the file:

- source: public `issues/<issue>/comments` (default issue 80) on the repo;
- recognized heading: `[FLEET][PRE_INTEGRATION_QA][PR_<number>][EXACT_HEAD_<40hex>]`;
- ready markers (any of): `READY_FOR_OCEAN=YES`, `PRE_VERDICT=READY_FOR_OCEAN`,
  `VERDICT: READY_FOR_OCEAN` / `VERDICT=READY_FOR_OCEAN`;
- `verifiedAt` = the comment's `created_at`; a **newer** Fleet comment on the same
  exact head supersedes an older one (a newer `RETURN_TO_BUILDER`/`NOT_READY`
  verdict vetoes an older `READY_FOR_OCEAN`).

**Why not the file in CI:** a PR author can add `data/fleet-pre-certificates/<sha>.json`
to their own PR — the file is Builder self-certification, which the independence
rule forbids. Issue #80 comments can only be posted by a repository collaborator
(Fleet), so the issue source is authoritative and unforgeable by a PR author.
The file source therefore exists for deterministic offline tests only and is
never used by CI; the two sources never fall back to each other (fail-closed).

## Fail-closed rules (each is a regression test)

1. no certificate / source absent => BLOCK
2. skipped or empty certificate => BLOCK
3. `exactHeadSha` != requested head SHA => BLOCK
4. verdict != `READY_FOR_OCEAN` => BLOCK
5. certificate older than `--max-age-hours` (default 24 h) => BLOCK
6. source unavailable or ambiguous => BLOCK
7. `canonical` sha256 missing/mismatched (file form) => BLOCK
8. fresh exact-SHA `READY_FOR_OCEAN` certificate => PASS

## Usage

```sh
node scripts/check-fleet-pre-certificate.cjs \
  --sha <40hex> --pr <n> --source issues --token "$GITHUB_TOKEN"
node scripts/check-fleet-pre-certificate.cjs \
  --sha <40hex> --pr <n> --source file --cert-file data/fleet-pre-certificates/<sha>.json
```

Exit 0 = `FLEET_PRE_CERT_PASS`, exit 1 = `FLEET_PRE_CERT_BLOCK reason=...`.
The gate must never be bypassed with `|| true`, `continue-on-error` or a
fallback-green path; `test/fleet-pre-certificate.test.js` scans the workflow to
enforce that.