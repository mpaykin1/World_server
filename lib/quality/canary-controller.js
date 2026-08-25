'use strict';

const { evaluateTelemetry } = require('./telemetry-gate');

function decideCanary({ baseline = {}, canary = {}, rules, minSessions = 20, sessions = 0, minMinutes = 10, elapsedMinutes = 0 }) {
  if (sessions < minSessions || elapsedMinutes < minMinutes) return { decision: 'hold', reason: 'insufficient-observation', sessions, elapsedMinutes };
  const gate = evaluateTelemetry(baseline, canary, rules);
  if (gate.status === 'rollback') return { decision: 'rollback', reason: 'protected-live-metric-regressed', gate };
  if (gate.status === 'promote') return { decision: 'promote', reason: 'all-live-gates-pass', gate };
  return { decision: 'hold', reason: 'missing-telemetry', gate };
}
module.exports = { decideCanary };
