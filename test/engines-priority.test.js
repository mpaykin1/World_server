'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const definition = require('../architecture/engines/engines.json');
const { nextSteps } = require('../scripts/engines-score.cjs');
const GATES = ['G1','G2','G3','G4','G5'];
function snapshot() {
  const engines = {};
  for (const e of definition.engines) {
    engines[e.id] = {gates: Object.fromEntries(GATES.map(g => [g,true]))};
  }
  engines.calc.gates.G2 = false;
  engines.dramaturgy.gates.G2 = false;
  engines.pipeline.gates.G1 = false;
  engines.onboarding.gates.G2 = false;
  return {engines,infra:Object.fromEntries(definition.infra.map(i => [i.id,true])),visible:{}};
}
test('required dramaturgy precedes optional calc and pipeline', () => {
  const s = snapshot();
  assert.equal(nextSteps(definition,s).ENGINES.id,'dramaturgy.G2');
  s.engines.dramaturgy.gates.G2 = true;
  s.engines.dramaturgy.gates.G3 = false;
  assert.equal(nextSteps(definition,s).ENGINES.id,'dramaturgy.G3');
  s.engines.dramaturgy.gates.G3 = true;
  assert.equal(nextSteps(definition,s).ENGINES.id,'pipeline.G1');
});
test('pipeline precedes onboarding and optional calc', () => {
  const s = snapshot();
  s.engines.dramaturgy.gates.G2 = true;
  for (const gate of ['G1','G2','G3']) {
    s.engines.pipeline.gates[gate] = false;
    assert.equal(nextSteps(definition,s).ENGINES.id,'pipeline.'+gate);
    s.engines.pipeline.gates[gate] = true;
  }
  assert.equal(nextSteps(definition,s).ENGINES.id,'onboarding.G2');
  s.engines.onboarding.gates.G2 = true;
  assert.equal(nextSteps(definition,s).ENGINES.id,'calc.G2');
});
