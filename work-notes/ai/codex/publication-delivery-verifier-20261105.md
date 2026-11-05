# Task
Add bounded public-byte verification required by publish_game.
## Why
Existing local browser acceptance and generic live gate cannot prove delivery of every generated package file. PR/export is not publication.
## Current state
Base b01ca137bd693c5f838dd139086181154f2dd806 after #604. Local four generation tools; publish_game still absent. Browser executor idle/reference-only; no competing file changes.
## Target state
Read-only helper validates a genuine package, reads only existing mpaykin1 GitHub Pages game route and verifies all six files plus exact manifest bytes.
## Files / systems involved
lib/engines/publication-delivery.cjs; test/engines-publication-delivery.test.js; this note.
## Known risks
Delivery alone does not prove rights, browser acceptance or merged release SHA. All returned publication/rights/browser fields remain not_published/not_verified/not_run. No publisher tool claimed implemented.
## Golden systems that must be preserved
Public MCP read-only, local generation behavior, accepted games, Netlify/reserve/SEO/settings/CIpermissions/secrets/plans.
## Errors that must not return
No caller URLs, arbitrary paths, redirects, unbounded downloads, fake published/rights claims, or client evidence promoted to trusted acceptance.
## Exact patch / change plan
Require validator integrity and exact six known package paths; derive fixed Pages URL from bounded slug. GET only, omit credentials, reject redirects, timeout5s/request, enforce expected byte length and 1MiB/file/2MiB/package budgets. Verify public manifest too.
## Tests to run
Three focused Node tests: all seven responses bind expected bytes; stale/missing/redirected/truncated/oversized/network failures deny; corrupt package causes zero requests. Existing exact-head CI; real HTTPS proof still pending.
## Deployment / PR plan
Separate bounded library PR. No public writes, game release or new server. Mandatory exact-head checks before merge. Independent review advisory.
## Current progress
Preflight PASS cleanupfalse RAM5.8% critical, no heavy local browser. Focused tests3PASS/0FAIL exit0 duration398.8794ms with local Response fixtures, not real network.
## Next action
Open PR, verify cloud CI and then real allowed HTTPS behavior; integrate trusted publication workflow only after separate evidence.
## Completion criteria
Public delivery evidence cannot be obtained from stale/corrupt/redirected bytes and remains separate from publication/rights/browser acceptance.
## Final evidence
node --test test/engines-publication-delivery.test.js:3PASS/0FAIL. Actual remote delivery not verified by these mocks. publish_game remains not implemented; no game published by this patch.
