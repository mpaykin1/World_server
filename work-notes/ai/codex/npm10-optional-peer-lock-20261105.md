# Task
Repair npm10 clean-install of existing optional Puppeteer peer dependency.
## Why
Cloudflare Workers Build8366e8a0-d950-4587-b0bf-1950a28c1b1e fails npm10.9.2 EUSAGE with missing proxy-agent8.0.2 tree. Distinct from quota10037.
## Current state
Base b01ca137bd693c5f838dd139086181154f2dd806. package.json blobbad8ff33734f3ec4cec78533b641b1bb6e5c72c3 and lockblobc6202cffe30ac3dbbe88f4d8b9f060b98cf7f312 identical on base and #605. No concurrent lock edit identified.
## Target state
Both npm10 and npm11 accept the same lockfile without changing existing versions/resolutions/integrity or root dependency declarations.
## Files / systems involved
package-lock.json and this note only.
## Known risks
Fourteen newly locked optional peer/transitive entries, including quickjs-wasi. No scripts were run or browser installed locally. Actual Cloudflare build still requires verification.
## Golden systems that must be preserved
package.json, existing versions/integrities, CIpermissions/secrets/tariffs/hosting settings, Netlify/reserve, games and SEO.
## Errors that must not return
Do not label npm EUSAGE quota10037 or weaken install/check gates. No npm audit fix, broad dependency update or global npm change.
## Exact patch / change plan
Run npm10.9.2 install --package-lock-only --ignore-scripts in isolated scratch. Admit only missing optional peer tree; retain all existing entries unchanged.
## Tests to run
Baseline npm10 ci --dry-run reproduces EUSAGE; repaired npm10 and npm11 ci --dry-run exit0. Compare every prior version/resolved/integrity and root entry. Mandatory exact-head CI and actual Workers Build.
## Deployment / PR plan
Separate tail-closure repair PR. #605 remains preserved separately; no overlapping helper changes. No direct deployment settings change.
## Current progress
Read actual Cloudflare logs (truncatedfalse), reproduced exact14missingpackages locally. Preflight tail-closure PASS cleanupfalse.
## Next action
Verify exact-head CI/Cloudflare build; merge repair only after gates. Then re-evaluate #605 on repaired base.
## Completion criteria
npm10/npm11 deterministic clean-install acceptance and actual Workers Build recovered, no prior dependency version changes.
## Final evidence
Original npm10.9.2 dry-run exit1 same EUSAGE. Repaired npm10 dry-run exit0; npm11.12.1 dry-run exit0; node_modules absent. existingChanges=[] rootSame=true, added14entries. Optionalpeer source puppeteer-core/node_modules/@puppeteer/browsers3.2.2 peer proxy-agent>=8.0.1. No local dependency install or source scripts.
