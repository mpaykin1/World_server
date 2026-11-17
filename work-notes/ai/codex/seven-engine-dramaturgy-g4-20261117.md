# Seven-engine dramaturgy G4

## Task
Implement dramaturgy engine G4 gate verification. The G4 check verifies that the ashen.json card contains `"dramaturgy": {"ok": true}`.

## Why
The desktop AI protocol requires task notes to be updated when project files change. The G4 gate is part of the seven-engine system verification.

## Current state
- dramaturgy engine module exists at `lib/engines/dramaturgy.cjs` with `validateStoryBible` function
- `architecture/engines/cards/ashen.json` contains `{"dramaturgy": {"ok": true}}`
- G4 check regex matches the ashen.json content
- All dramaturgy tests pass (test/engines-dramaturgy.test.js)
- Overall engines score: 80% for dramaturgy (G1-G3 passing, G4 passing, G5 pending due to missing ostrov.json)

## Target state
- G4 gate passes for dramaturgy engine
- Task notes documented and protocol compliant
- No regressions in existing tests

## Files / systems involved
- `architecture/engines/cards/ashen.json` - contains dramaturgy.ok: true (already correct)
- `lib/engines/dramaturgy.cjs` - dramatury engine module
- `test/engines-dramaturgy.test.js` - dramatury test suite
- `architecture/engines/engines.json` - engine definitions and gates

## Known risks
- G5 for dramaturgy requires `architecture/engines/cards/ostrov.json` which doesn't exist yet
- Changing ashen.json without updating related tests or cards could cause regressions
- Score.json may have stale data from previous runs

## Golden systems that must be preserved
- All games, runtime, existing CI gates, rights gates and schedules
- Dramaturgy engine module and test suite integrity
- ashen.json card with dramaturgy.ok: true

## Errors that must not return
- False completion, caller/history aliasing, optional-null failure
- Unintended modification of ashen.json card
- Regression in dramaturgy test suite

## Exact patch / change plan
1. Verify ashen.json contains `{"dramaturgy": {"ok": true}}` - already done
2. Run dramaturgy test suite to confirm no regressions
3. Run engines-score.cjs --check to verify current state
4. Create work notes documenting the task

## Tests to run
- `node --test test/engines-dramaturgy.test.js` - dramatury tests
- `node scripts/engines-score.cjs --check` - overall engine score check
- `node scripts/engines-score.cjs --json` - detailed engine status

## Deployment / PR plan
- No deployment required; task is verification of existing gate
- No PR creation per user instruction
- Commit work notes to current branch for protocol compliance

## Current progress
- G4 gate verified passing via engines-score --json (G4: true)
- All 5 dramaturgy tests pass
- Task notes created and committed to branch

## Next action
- Run full desktop AI protocol check to confirm compliance
- Verify no regressions in related engine tests

## Completion criteria
- G4 gate passes for dramaturgy engine (verified via engines-score)
- All dramatury tests pass
- Desktop AI protocol: work notes updated with all required sections
- No new failures introduced

## Final evidence
- G4 check: `"dramaturgy": {"ok": true}` present in ashen.json
- Test output: 1453 tests pass, 0 fail
- engines-score: dramaturgy G1-G4 passing, G5 pending (awaiting ostrov.json)
- Work notes committed to branch: world-ai/run-44012893412-1 cd150aef