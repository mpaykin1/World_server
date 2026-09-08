'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/project-context');

function mockResponse() {
  const headers = {};
  return {
    statusCode: 0,
    body: '',
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    end(value = '') { this.body += value; }
  };
}

test('GET /api/project-context exposes canonical VNO discovery data', async () => {
  const res = mockResponse();
  await handler({ method: 'GET' }, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.getHeader('content-type'), /application\/json/);
  const body = JSON.parse(res.body);
  assert.equal(body.project, 'World_server');
  assert.equal(body.sourceOfTruthBranch, 'master');
  assert.equal(body.startHere, 'AI_START_HERE.md');
  assert.equal(body.currentStateFile, '.ai/vno-current-state.json');
  assert.equal(body.vno.acronym, 'ВНО');
  assert.equal(body.vno.expansionRu, 'Воспроизводимость, Независимость, Опровержение');
  assert.equal(body.vno.expansionEn, 'Reproducibility, Independence, Falsification');
  assert.equal(body.vno.canonicalFile, 'VNO.md');
  assert.ok(body.vno.aliases.includes('VNO cycle'));
  assert.ok(Array.isArray(body.vno.loop) && body.vno.loop.length === 7);
  assert.equal(body.vno.scoring.hundredPercentRequiresEveryMilestone, true);
  assert.equal(body.vno.current.cycle, 2);
  assert.equal(body.vno.current.sourceDiscovery, 'RUN_059');
  assert.equal(body.vno.current.candidateHypothesis, 'RUN_074_CANDIDATE_DETERMINISTIC_BASE_PLUS_CAUSAL_DELTAS');
  assert.equal(body.vno.current.candidateStatus, 'PREREGISTRATION_REQUIRED_BEFORE_CONFIRMATION');
  assert.equal(body.vno.current.productionEnabled, false);
  assert.equal(body.vno.current.activeStep.number, 4);
  assert.equal(body.vno.current.activeStep.id, 'PROVE_IN_CODE');
  assert.equal(body.vno.current.weakestPillar, 'INDEPENDENCE');
  assert.equal(body.vno.current.scores.scienceReadiness, 10);
  assert.equal(body.vno.current.nextAction.id, 'RUN_074_PREREGISTER_AND_INDEPENDENTLY_TEST');
  assert.ok(body.canonicalContextFiles.includes('SCIENCE_STANDARD.md'));
  assert.ok(body.canonicalContextFiles.includes('.ai/vno-current-state.json'));
});

test('/api/project-context is read-only', async () => {
  const res = mockResponse();
  await handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader('allow'), 'GET');
});
