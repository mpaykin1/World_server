# Task
Add permanent browser regression for actual combine_assets output.
## Why
PR #602 validates composed packages in Node; current browser workflow renders only the original vault.
## Current state
Base c24dd896523259d742d0d5bbb3093cb61ffc1153, local MCP geometry composition merged. Existing browser executor idle/reference-only; no competing file edits identified.
## Target state
Existing workflow builds both original and composed vault, then verifies each in desktop and mobile emulation using actual inputs.
## Files / systems involved
scripts/create-meta-game.cjs; scripts/verify-generated-meta-game.mjs; existing generated-game workflow.
## Known risks
Mobile is emulation, not a physical phone. Browser pass does not establish external rights or publication. Composed scenario remains first source; geometry only.
## Golden systems that must be preserved
Original default build and six-scene ending, existing workflow permissions/dependencies, accepted games, Netlify, SEO and hosting.
## Errors that must not return
No state mutation to fake progression, no arbitrary output paths, no closed asset admission or false publication.
## Exact patch / change plan
Bounded --composed flag builds two actual cached packages, calls combineAssets and rebuilds its result. Fixed separate composed-vault destination. Reuse existing WebGL2/earned ending/two-touch checks; verify composition provenance and translated solids loaded in browser. Upload both artifact directories.
## Tests to run
Node syntax checks and actual bounded composed generation; mandatory exact-HEAD CI and both browser scenarios in cloud. Avoid heavy local Chromium under critical RAM pressure.
## Deployment / PR plan
Separate PR; no public deployment. Merge only after exact-HEAD mandatory checks and actual composed browser PASS. Independent review advisory per owner waiver.
## Current progress
Preflight PASS, cleanup false, RAM13% critical. Implementation complete. Both Node syntax checks and actual --composed generation passed (exit0, under1s); output has 6 files and integrity=true, composition ac894659a2570b32b59b0f8cf6d7d52e0d207f853e33e76488fc5c5fb89bc63c. Browser acceptance remains pending in cloud.
## Next action
Run bounded syntax/build checks, inspect diff, open PR and verify CI execution.
## Completion criteria
Actual composed output reaches Chromium; desktop earns six-scene ending and mobile two-touch works, without JS errors or viewport movement; base case retained.
## Final evidence
Local source c24dd896523259d742d0d5bbb3093cb61ffc1153; composed manifest fae92f94c3373205133902b278c276a23b9d16be99c646732abf61aee99d73b6. node --check passed for both scripts; node scripts/create-meta-game.cjs --composed exited0 with integrity=true and browser=not_run/rights=not_verified/publication=not_published. No composed browser acceptance or publication claimed.
