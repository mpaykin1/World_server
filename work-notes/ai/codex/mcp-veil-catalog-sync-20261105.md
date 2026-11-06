# MCP Veil catalog synchronization

## Task
Expose published Veil Terraces in the existing read-only MCP game inventory.
## Why
Live audit: public portal has five games but MCP health/list/enum has four. Smoke/tests hardcode four.
## Current state
8 tools public on 2f500eb4; all 4 games inspected; all 21 source/dependency denials PASS. Portal/game deployed via meta6 #264/#265.
## Target state
Five discoverable games, pinned Veil entry, unchanged six denied reusable candidates and audit grants; smoke validates actual inventory.
## Files / systems involved
ASSET_INDEX.json games only; worker.test.mjs; render-server.test.mjs; live-smoke.mjs; this note.
## Known risks
Catalog listing must not grant source reuse. Global candidate source_commit/RIGHTS_REVIEW remain untouched. Game entry pinned independently to meta6 3f78a5331b5212dc5015a9f70047630891e4667c, blob 99243a7d78b4249a13683e881db5000b8e6452a5.
## Golden systems that must be preserved
Four prior entries, eight read-only tools, zero licensed assets, six blocked candidates, all existing games and schedules.
## Errors that must not return
Portal/MCP drift; false count validation; accidental licensing permission.
## Exact patch / change plan
Add one game; assert five plus new inspect/schema case; live smoke use catalog inventory and verify fifth HTML.
## Tests to run
Focused worker/render/catalog checks via cloud CI. Live HTTPS after merge/deploy; no publication claim before exact SHA.
## Deployment / PR plan
Separate PR, technical gates then authorized Render CD already in repository. No secrets/permissions changes.
## Current progress
Gap reproduced via real public HTTPS; claim posted in #580.
## Next action
Publish patch and run CI, then merge/deploy/public verification.
## Completion criteria
Five actual public MCP games, Veil inspect succeeds, all six rights candidates still denied.
## Final evidence
Pre-fix public audit saved locally and summarized in #580. Post-fix CI/deploy evidence recorded in PR; currently pending.
