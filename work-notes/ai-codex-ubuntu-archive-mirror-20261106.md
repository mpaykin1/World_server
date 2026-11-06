# Ubuntu apt mirror recovery

## Task / why / current state
Quality #614 job127664271744 and #615 job127674712216 timed out downloading noble packages from azure.archive.ubuntu.com before browser tests. Base a0303d97038eecc5d77c3d793825b4b8ca6e1989.
## Target / direction
Restore real desktop/mobile verification; official archive mirror replacement is a hypothesis pending cloud evidence.
## Files / exact plan
Fixed-path scripts/configure-ubuntu-apt-mirror.cjs; targeted fixture test; insert helper before unchanged Playwright installs in ci.yml and quality-regression.yml. Replace exact Azure archive URL only in apt list/deb822/mirror files. Log changed filenames/no-op.
## Risks / golden systems
Keep Suite/Components/Signed-By/keys/signatures, package selection, browser assertions, timeout, permissions/triggers, Netlify, accepted games/schedules and free tier. No arbitrary path CLI or unsigned/trusted bypass. #379 adds steps AFTER Playwright in ci.yml; our separate insertion BEFORE it preserves those changes and does not edit that PR. All open PR files checked, no other target collisions. Executor idle/reference-only.
## Tests / deployment / PR
Pure fixture regressions for deb822/list/mirror URLs, unrelated hosts, trust fields and idempotence; Node syntax. Separate draft PR, real exact-SHA install/browser gate required. No unchanged reruns614/615. Final cloud evidence in PR checks/comments to avoid self-referential note commits.
## Progress / next / completion
Preflight verification allowed cleanup=false; RAM critical, no heavy install. Route read; recall required. Notes before patch. Completion requires actual cloud install and browser PASS plus normal merge. Owner acceptance/catalog permission/visual failures remain open.
