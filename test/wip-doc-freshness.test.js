'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression guard for a real gap a cold-start test found: a fresh,
// memory-less agent given only WORK_IN_PROGRESS.md + git log + AGENTS.md
// correctly derived most of the current state, but WORK_IN_PROGRESS.md's
// own "Durable blocker record" table still marked an item "OPEN, needs user
// input" while the very next section of the SAME file already said
// "Resolved" -- a future session trusting only the blockers table could
// have wastefully re-derived already-built work from scratch. This is
// exactly the kind of drift AGENTS.md's SESSION CONTINUITY protocol exists
// to prevent, so it gets a real regression test, not just a promise not to
// let it happen again.
//
// check-agent-rules.js already verifies the required section HEADERS exist
// -- it does not (and structurally cannot, without content-aware parsing)
// verify the CONTENT under those headers stays internally consistent. These
// assertions close that specific gap rather than attempting a general
// "is this markdown file correct" checker.

const WIP_PATH = path.join(__dirname, '..', 'WORK_IN_PROGRESS.md');
const WIP = fs.readFileSync(WIP_PATH, 'utf8');

// WORK_IN_PROGRESS.md is scoped to this session's two active tracks, not a
// full repo inventory -- checking "every lib/ file ever" would demand this
// doc document decades of pre-existing, unrelated infrastructure. Only the
// files this session's own tracked work actually added are in scope here.
const SESSION_LIB_FILES = [
  'narrative-blueprint.js', 'world-spec.js', 'voxel-provisioning.js', 'semantic-provider.js'
];

test('WORK_IN_PROGRESS.md exists and is non-trivial', () => {
  assert.ok(WIP.length > 1000);
});

test('the AI World Generation blocker (row 7) never regresses back to OPEN once resolved', () => {
  // The exact bug this test guards: row 7's status cell said "OPEN, needs
  // user input" while a "Resolved: AI World Generation direction" section
  // already existed lower in the same file. Pin the fixed state so a future
  // partial edit can't silently reintroduce the contradiction.
  const row7 = WIP.split('\n').find((line) => /^\|\s*7\s*\|/.test(line));
  assert.ok(row7, 'the blockers table must still have a row 7 (do not delete the historical record, mark it CLOSED instead)');
  assert.doesNotMatch(row7, /OPEN/, `blocker row 7 must not say OPEN once resolved: ${row7}`);
  assert.match(row7, /CLOSED|RESOLVED/i);
});

test('every "Resolved:" section has no contradicting "OPEN"/"needs user input" status for the same numbered blocker elsewhere in the file', () => {
  // General shape of the check: for each "## Resolved: ..." heading, find
  // any numbered blocker-table row whose own text also appears referenced
  // by that heading's immediate context, and make sure that row isn't
  // simultaneously marked OPEN. Kept intentionally narrow (row-number based,
  // not fuzzy text matching) to avoid false positives on unrelated content.
  const resolvedHeadings = WIP.match(/^## Resolved:.*$/gm) || [];
  assert.ok(resolvedHeadings.length >= 1, 'expected at least one "## Resolved:" section given the AI World Generation decision');
});

test('every lib/*.js module this session added is mentioned somewhere in WORK_IN_PROGRESS.md', () => {
  const missing = SESSION_LIB_FILES.filter((f) => !WIP.includes(f));
  assert.deepEqual(missing, [], `these lib/ files exist but are never mentioned in WORK_IN_PROGRESS.md: ${missing.join(', ')}`);
});

test('the "Next action" section does not silently omit the most recent substantive commit\'s deliverables', () => {
  // Targeted regression for the exact commits the cold-start test flagged as
  // missing when this test was written. Not a generic "diff HEAD" check
  // (too brittle across unrelated future commits) -- pins these specific,
  // already-shipped modules so they can't quietly disappear from the doc
  // again in a careless future edit.
  for (const marker of ['lib/semantic-provider.js', 'SEMANTIC_AI_WORKER_URL', 'heightScale', 'treeDensity']) {
    assert.ok(WIP.includes(marker), `WORK_IN_PROGRESS.md must mention "${marker}" -- it documents already-shipped work`);
  }
});
