'use strict';

function debtFromAnalysis(projectResult) {
  const debt = [];
  for (const [dimension, score] of Object.entries(projectResult.before.dimensions || {})) {
    if (score < 98) debt.push({ projectId: projectResult.projectId, dimension, score, gap: 100 - score, impact: Math.max(1, 100 - score), confidence: 0.9 });
  }
  for (const issue of projectResult.before.assetQuality?.issues || []) debt.push({ projectId: projectResult.projectId, dimension: 'assetQuality', issue: issue.kind, gap: issue.severity === 'medium' ? 12 : 5, impact: issue.severity === 'medium' ? 12 : 5, confidence: 0.65 });
  return debt.map(d => ({ ...d, priority: Math.round(d.impact * d.confidence * 100) / 100 })).sort((a, b) => b.priority - a.priority);
}
function mergeDebt(oldItems = [], newItems = []) {
  const key = x => [x.projectId, x.dimension, x.issue || 'score'].join('|');
  const map = new Map(oldItems.map(x => [key(x), x]));
  for (const item of newItems) map.set(key(item), { ...map.get(key(item)), ...item, lastSeenAt: new Date().toISOString() });
  return [...map.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
}
module.exports = { debtFromAnalysis, mergeDebt };
