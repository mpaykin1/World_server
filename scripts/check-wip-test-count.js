'use strict';

// Verifies WORK_IN_PROGRESS.md's "## Tests to run" section states the real,
// current `node --test` pass count -- not a stale one. A second cold-start
// recovery test (see test/wip-doc-freshness.test.js) found this had drifted
// (185/216 quoted vs. 221 actual) even after an earlier, more severe
// staleness bug in the same file had already been fixed once.
//
// Deliberately a standalone script, not a node --test *test file*: a test
// file that spawns `node --test` (the whole suite, which includes that very
// file) recurses into itself. This script runs once, standalone, with no
// such self-reference -- matching this repo's own convention of dedicated
// scripts/check-*.js gates for exactly this kind of thing.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

const result = spawnSync(process.execPath, ['--test'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const output = `${result.stdout || ''}${result.stderr || ''}`.replace(/\r/g, '');
const passMatch = output.match(/^ℹ pass (\d+)$/m);
if (!passMatch) {
  console.error('Could not parse a pass count from `node --test` output.');
  process.exit(1);
}
const actualPass = Number(passMatch[1]);

const wip = fs.readFileSync(path.join(root, 'WORK_IN_PROGRESS.md'), 'utf8');
const section = wip.split('## Tests to run')[1]?.split('\n## ')[0] || '';
const claimedMatch = section.match(/node --test`\s*—\s*(\d+)\/(\d+)/);
if (!claimedMatch) {
  console.error('WORK_IN_PROGRESS.md\'s "## Tests to run" section does not state a `node --test` count in the expected N/N shape.');
  process.exit(1);
}
const [, claimedA, claimedB] = claimedMatch;
if (claimedA !== claimedB) {
  console.error(`WORK_IN_PROGRESS.md claims ${claimedA}/${claimedB} -- that isn't even internally consistent (expected N/N).`);
  process.exit(1);
}
const claimedPass = Number(claimedA);
if (claimedPass !== actualPass) {
  console.error(`WORK_IN_PROGRESS.md's "Tests to run" claims ${claimedPass}/${claimedPass}, but \`node --test\` actually reports ${actualPass} passing. Update WORK_IN_PROGRESS.md.`);
  process.exit(1);
}
console.log(`OK: WORK_IN_PROGRESS.md's node --test count (${actualPass}) matches the real suite.`);
