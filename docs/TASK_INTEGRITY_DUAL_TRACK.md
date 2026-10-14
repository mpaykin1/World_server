# Dual-track evidence contract

This document describes the candidate implementation in PR #496. The existing AI Bridge schedule invokes its monitor after protected integration into master. Shared role instructions: .ai/task-integrity-dual-track.json. Visual policy: data/graphics-evolution-policy.json.

## Event fields

Keep the existing marker and core fields. New or strengthened fields:

- `actor_id`: stable role/worker identity for the performer.
- `lease_id`: the exact work lease/session that owns the interval.
- `productive_segments`: one or more measured active intervals within `started_at` and `finished_at`; pauses are excluded.
- `measurement_source`: descriptive provenance only. A string value by itself is not proof.
- `evidence_ref` and `evidence_sha`: immutable commit, PR, or playable artifact reference and its content hash.

The external `measurementVerifier(event)` callback must match the receipt to a trusted execution record, actor/role, lease, active segments, minutes, and evidence hash. The callback is absent in the production CLI, so `measurement_verified=false` and `verification_pass=false`. A comment, claimed field, timer invocation, or successful workflow run cannot verify work time by itself.

## Monitor states

- `telemetry_balanced` says only that structurally accepted, attributed claims in the rolling four-hour window are numerically balanced.
- `ok` preserves the existing checker meaning: valid balanced telemetry.
- `measurement_verified` means an injected trusted time verifier matched the claimed active work intervals.
- `evidence_verified` means accessible artifact contents were checked against the supplied hash and type.
- `verification_pass` is true only when the window is balanced and both time and artifact evidence are independently verified.
- Library refs that the workflow cannot fetch remain `CONTENT_UNVERIFIED`. Do not promote their hashes into verified evidence.
- `owner_verdict` and Fleet visual score remain `UNSET` / `UNKNOWN`.

The CLI exits nonzero unless `verification_pass` is true. A monitor result or green CI never sets the owner verdict and never substitutes for Fleet PRE/POST.

## Window and overlap rules

Active segments are clipped to the rolling four-hour boundary. Legacy events without segments are counted only as self-attested estimates and clipped conservatively by elapsed-time proportion. Overlapping productive segments for the same performer invalidate the conflicting events; separate performers may work in parallel. Unverified actor labels are not strong evidence of performer identity.

## Recovery

The checker reports the lane with the greatest shortfall and the owed minutes. An alert is not recovery. The next safe execution cycle must perform and evidence actual work for that lane; reporting, planning, and repeated monitoring do not repay the debt. Safety gates and the single shared repository writer remain in force. If repository work is blocked, use the already-authorized isolated graphics work path where safe.

Each event envelope is capped at 60 minutes, and GitHub evidence lookup is bounded to 20 event checks (four concurrent); excess checks stay `CONTENT_UNVERIFIED`. `actual_minutes` is retained as a legacy alias explicitly marked `ATTESTED_UNVERIFIED`; `attested_minutes` is the claim total, while `verified_actual_minutes` stays `null` until a trusted measurement verifier exists. The current CLI has no such production verifier, so this draft cannot produce `verification_pass=true` from comments alone.