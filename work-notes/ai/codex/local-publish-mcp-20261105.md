# Task
Connect the existing trusted publication coordinator to local generation/MCP.
## Why
The coordinator cannot read the service-owned artifact cache and the stdio transport does not await asynchronous operations.
## Current state
Base dd3575df836cafc3184b78bd853c47fa2ae01bc4. Postmerge CI, seven engines, quality and generated browser SUCCESS; Canary still running. Existing browser executor idle/reference-only; no competing publication files in open PRs.
## Target state
Only a trusted host-configured backend enables publish_game. Default local CLI continues to advertise four tools. No public HTTP changes.
## Files / systems involved
generation-service.cjs, local-generator-mcp.cjs, meta-game-generator-stdio.cjs, engines-local-publication.test.js and this note.
## Known risks
Concrete GitHub backend and durable remote idempotence remain absent. Tests use test-only backend receipts, not real publication. A hung backend can block ordered stdio requests; no backend is configured in the CLI.
## Golden systems that must be preserved
Accepted games, public read-only MCP, Netlify/reserve/SEO, credentials, CI permissions, tariffs and schedules.
## Errors that must not return
Client arguments must not configure authority. Notifications must never publish. Pending PR must not appear published. Promise rejection must not leak backend details or become an empty successful JSON response.
## Exact patch / change plan
Service wires its private read function into createPublicationOperation only with publicationBackend supplied by trusted host. MCP lists publish_game only then, preserving existing synchronous calls. Async results are awaited and rejected operations return generic tool errors. Stdio awaits handler results before emitting JSON.
## Tests to run
Existing local MCP/real stdio tests plus actual cached-package publication, concurrent duplicate candidates, caller authority/path/unknown artifacts, notifications, invalid host configuration and asynchronous error containment.
## Deployment / PR plan
Separate PR against master. No configured backend, credentials, HTTP writes, real candidate or release in this patch. Exact-head mandatory CI/browser required before merge.
## Current progress
Preflight PASS cleanup=false. Seven focused tests PASS/0FAIL, 1026.8464ms. Note was created after initial edits instead of before as AGENTS requires; this ordering error is recorded, not presented as compliant chronology.
## Next action
Inspect diff, open PR, verify exact-head CI and finish this integration slice. Then implement concrete trusted GitHub backend rather than claiming full pipeline readiness.
## Completion criteria
Configured host can invoke existing coordinator on cached artifacts with async response correctness; unconfigured CLI cannot discover or invoke publish_game; no caller authority or public write path introduced.
## Final evidence
Seven focused tests use actual generated cache packages and test backend; default real stdio tests remain PASS. No browser/rights/publication acceptance from these tests. No game is published.
