'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, '.ai', 'vno-scoring.json');
let failed = false;

function check(ok, message) {
  if (ok) console.log(`OK: ${message}`);
  else { console.error(`VNO SCORE FAIL: ${message}`); failed = true; }
}

check(fs.existsSync(file), '.ai/vno-scoring.json exists');
if (!fs.existsSync(file)) process.exit(1);
const rubric = JSON.parse(fs.readFileSync(file, 'utf8'));

check(rubric.principle === 'Воспроизводимость, Независимость, Опровержение', 'canonical VNO principle name is intact');
check(rubric.aggregation === 'SCIENCE_READINESS = min(REPRODUCIBILITY, INDEPENDENCE, FALSIFICATION)', 'weakest pillar remains the readiness score');

for (const pillar of ['reproducibility', 'independence', 'falsification']) {
  const rows = rubric[pillar];
  check(Array.isArray(rows) && rows.length === 10, `${pillar} has ten explicit evidence milestones`);
  if (Array.isArray(rows)) {
    check(new Set(rows.map(row => row.id)).size === rows.length, `${pillar} milestone IDs are unique`);
    check(rows.every(row => Number.isInteger(row.points) && row.points > 0), `${pillar} milestones have positive integer points`);
    check(rows.reduce((sum, row) => sum + row.points, 0) === 100, `${pillar} milestones total exactly 100`);
    check(rows.every(row => typeof row.requirement === 'string' && row.requirement.length > 20), `${pillar} milestones describe concrete evidence`);
  }
}

const rules = rubric.rules || {};
for (const key of [
  'selfReportedEvidenceCounts',
  'documentationOnlyCountsAsScientificEvidence',
  'failedAttemptCountsAsPassedMilestone',
  'sameAgentSelfReviewCountsAsIndependence',
  'sameImplementationSecondRunCountsAsIndependentImplementation',
  'thresholdRetuningAfterHoldoutAllowed',
  'negativeResultsMayBeDeleted',
  'onePillarMayCompensateAnother',
  'scoreMayIncreaseWithoutNewEvidence'
]) {
  check(rules[key] === false, `${key} remains false`);
}
check(rules.scoreMayDecreaseWhenEvidenceIsInvalidated === true, 'invalidated evidence can lower a VNO score');
check(rules.evidenceMustReferenceArtifactOrRun === true, 'every earned milestone must reference evidence');

const promotion = rubric.promotion || {};
check(Array.isArray(promotion.D4Requires) && promotion.D4Requires.includes('I4'), 'D4 requires clean-room reimplementation');
check(Array.isArray(promotion.D5Requires) && promotion.D5Requires.includes('F6'), 'D5 requires adversarial testing');
check(Array.isArray(promotion.D6Requires) && promotion.D6Requires.includes('I6'), 'D6 requires different-agent/provider replication');
check(promotion.D7CannotBeSelfAssigned === true, 'D7 cannot be self-assigned');
check(promotion.hundredPercentRequiresEveryMilestone === true, '100% requires every rubric milestone');

if (failed) {
  console.error('\nVNO scoring check FAILED');
  process.exit(1);
}
console.log('\nVNO scoring check PASSED');
