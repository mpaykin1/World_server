# Generator artifact integrity

## Task
Provide bounded deterministic in-memory artifact packaging for future create_game.
## Why
Generator operations are missing; source/trace integrity is an independent prerequisite that does not need anonymous write endpoints or unreviewed engine merge.
## Current state
#590 composition tests pass; actual generator/publication remains absent.
## Target state
Hash-addressed manifest/file bundle with explicit unverified rights/browser/publication, not a runnable game claim.
## Files / systems involved
lib/engines/artifact.cjs; test/engines-artifact.test.js; this note.
## Known risks
Hashes are integrity checks, not signatures or authorization. Does not audit licenses, parse JS, sandbox code or run browser. Pipeline provenance is supplied by trusted caller, not authenticated by this module.
## Golden systems that must be preserved
Existing games, engines, rights gate, MCP read-only transport, CI and schedules.
## Errors that must not return
Traversal/case collisions, false validation/publication status, missing pipeline outputs, mutable file references, silent size overflow.
## Exact patch / change plan
Pure module and focused tests only, no file writes/network/deploy. Bound file names/count/bytes and require full unverified stage trace. Manifest includes SHA-256 of canonical evidence and files.
## Tests to run
Six focused tests pass locally; repeat remote source and mandatory CI; independent signed review before merge.
## Deployment / PR plan
Separate draft PR, no runtime integration/deploy or master modification.
## Current progress
6/6 focused tests pass (including tampering, Windows device names, failed trace and false verified status).
## Next action
Cloud checks and independent review, then connect to actual generator after dependencies merge.
## Completion criteria
Packaging primitive reviewable/tested; does not itself fulfill create_game or generate a playable game.
## Final evidence
Local 6/6 PASS, immutable source readback and cloud results in PR. No product/browser/license/production PASS claimed.
