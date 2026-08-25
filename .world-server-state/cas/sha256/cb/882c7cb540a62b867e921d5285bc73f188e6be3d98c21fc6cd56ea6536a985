'use strict';

const { evaluateTelemetry } = require('./telemetry-gate');

const DEFAULT_STAGES = [
  { traffic: 1, minSessions: 20, minMinutes: 10 },
  { traffic: 5, minSessions: 60, minMinutes: 20 },
  { traffic: 20, minSessions: 150, minMinutes: 30 },
  { traffic: 50, minSessions: 300, minMinutes: 45 },
  { traffic: 100, minSessions: 500, minMinutes: 60 }
];

function stageAt(index, stages = DEFAULT_STAGES) {
  return stages[Math.max(0, Math.min(index, stages.length - 1))];
}

function decideProgressiveCanary({ baseline = {}, current = {}, stageIndex = 0, sessions = 0, elapsedMinutes = 0, rules, stages = DEFAULT_STAGES, consecutivePasses = 0, requiredConsecutivePasses = 2 }) {
  const stage = stageAt(stageIndex, stages);
  if (sessions < stage.minSessions || elapsedMinutes < stage.minMinutes) {
    return { decision: 'hold', stageIndex, traffic: stage.traffic, reason: 'insufficient-observation', sessions, elapsedMinutes, required: stage };
  }
  const gate = evaluateTelemetry(baseline, current, rules);
  if (gate.status === 'rollback') return { decision: 'rollback', stageIndex, traffic: stage.traffic, reason: 'protected-live-metric-regressed', gate, nextTraffic: 0 };
  if (gate.status !== 'promote') return { decision: 'hold', stageIndex, traffic: stage.traffic, reason: 'missing-telemetry', gate };
  const passes = consecutivePasses + 1;
  if (passes < requiredConsecutivePasses) return { decision: 'hold', stageIndex, traffic: stage.traffic, reason: 'needs-consecutive-pass', gate, consecutivePasses: passes };
  if (stageIndex >= stages.length - 1) return { decision: 'complete', stageIndex, traffic: 100, reason: 'full-rollout-stable', gate, consecutivePasses: passes };
  const next = stageAt(stageIndex + 1, stages);
  return { decision: 'advance', stageIndex, traffic: stage.traffic, nextStageIndex: stageIndex + 1, nextTraffic: next.traffic, reason: 'stage-stable', gate, consecutivePasses: 0 };
}

module.exports = { DEFAULT_STAGES, decideProgressiveCanary, stageAt };
