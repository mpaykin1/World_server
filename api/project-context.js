'use strict';

const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');
const contextIndex = require('../.ai/project-context-index.json');
const currentVnoState = require('../.ai/vno-current-state.json');
const vnoCycle = require('../.ai/vno-cycle.json');
const vnoScoring = require('../.ai/vno-scoring.json');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const vno = contextIndex.concepts?.vno || {};
  sendJson(res, 200, {
    project: 'World_server',
    sourceOfTruthBranch: contextIndex.sourceOfTruthBranch || 'master',
    startHere: contextIndex.startHere || 'AI_START_HERE.md',
    contextIndex: '.ai/project-context-index.json',
    currentStateFile: contextIndex.currentState || '.ai/vno-current-state.json',
    vno: {
      acronym: 'ВНО',
      expansionRu: vno.expansionRu || 'Воспроизводимость, Независимость, Опровержение',
      expansionEn: vno.expansionEn || 'Reproducibility, Independence, Falsification',
      canonicalFile: vno.canonicalFile || 'VNO.md',
      aliases: vno.aliases || [],
      formula: vnoCycle.scienceReadinessFormula || 'min(REPRODUCIBILITY, INDEPENDENCE, FALSIFICATION)',
      loop: Array.isArray(vnoCycle.loop)
        ? vnoCycle.loop.map(step => ({ id: step.id, simple: step.kidMeaning }))
        : [],
      scoring: {
        aggregation: vnoScoring.aggregation,
        hundredPercentRequiresEveryMilestone: vnoScoring.promotion?.hundredPercentRequiresEveryMilestone === true
      },
      current: {
        cycle: currentVnoState.currentCycle,
        sourceDiscovery: currentVnoState.sourceDiscovery,
        candidateHypothesis: currentVnoState.candidateHypothesis,
        candidateStatus: currentVnoState.candidateStatus,
        productionEnabled: currentVnoState.productionEnabled,
        activeStep: currentVnoState.activeStep,
        weakestPillar: currentVnoState.vnoPriority?.weakestPillar,
        scores: currentVnoState.vnoPriority?.knownBootstrapScores,
        nextAction: currentVnoState.nextAction,
        loopRule: currentVnoState.loopRule
      }
    },
    canonicalContextFiles: contextIndex.canonicalContextFiles || [],
    ruleForNewAgents: contextIndex.agentBootstrapRule,
    note: 'Project-specific terms and current VNO position should be resolved from this server/repository context before asking the user to redefine them or guessing the next step.'
  });
});
