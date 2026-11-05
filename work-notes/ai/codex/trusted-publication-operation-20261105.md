# Task
Add a trusted publication coordinator without exposing a public write path.
## Why
Delivery proof alone cannot authorize a release. A package needs trusted artifact rights/browser acceptance, a bounded idempotent candidate, exact merged-release acceptance and public bytes before published.
## Current state
Base a17eb7d6b3d54425db206b536369d5a169b16a92. Four local MCP tools remain; publish_game registration/backend wiring is not implemented. Existing browser executor idle/reference-only, no competing file edits identified.
## Target state
Host-configured coordinator separates pending review/release acceptance/delivery from publication. Default construction without backend fails closed.
## Files / systems involved
lib/engines/publication-operation.cjs; test/engines-publication-operation.test.js; this note.
## Known risks
Backend is a trusted host authority, not request evidence. Tests use a fake backend; no real GitHub candidate or public game is created. Backend implementation, durable idempotence and MCP wiring remain required.
## Golden systems that must be preserved
Accepted routes, public MCP read-only, existing generation tools, Netlify/reserve/SEO, credentials, CIpermissions, tariffs and five schedules.
## Errors that must not return
Client rights/PASS must not authorize publishing. PR/merge alone must not return published. No arbitrary repo/path/URL/code, automatic merge, overwrite of accepted routes or duplicate concurrent candidates.
## Exact patch / change plan
Accept only artifact_id from callers; validate cached package/source. Restrict new routes to generated-*. Host acceptance binds manifest/source. Candidate fixed to mpaykin1/meta6 main with create_only. Merge receipt binds acceptance_commit to merge_commit. Real default delivery verifier binds bytes/source/manifest/URL. At most four active operations and concurrent duplicates share one Promise.
## Tests to run
Focused four tests for concurrent duplicates, pending states, stale merge acceptance, delivery failure, caller/rights/corrupt rejection, accepted route and repository mismatch denial. Mandatory exact-head CI and generated browser regression.
## Deployment / PR plan
Separate coordinator library PR. No real publication or new endpoint in this patch. Next integrate a concrete trusted GitHub backend with persistent idempotence and safe credential handling before enabling publish_game.
## Current progress
Preflight development PASS cleanupfalse. Four focused Node tests PASS/0FAIL exit0 duration309.9513ms; no network writes/browser. Initial command listing a sparse-absent delivery test ran only the three then-present operation tests; no claim of six tests.
## Next action
Open PR, inspect exact-head CI; do not claim the full publish_game pipeline is ready. Finish this slice before new capability work.
## Completion criteria
Coordinator cannot return published without host artifact acceptance, exact merge acceptance and bound delivery; no backend defaults or RPC-provided authority.
## Final evidence
4 focused tests PASS with test doubles. Actual GitHub backend/candidate/publication and MCP registration are not verified or supplied by this patch. No external rights cleared; no new game published.
