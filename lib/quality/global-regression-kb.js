'use strict';
const crypto = require('node:crypto');

function normalizeSignature(event = {}) {
  return [event.kind || 'unknown', event.signature || event.message || '', event.sourcePattern || '']
    .join('|').toLowerCase().replace(/\b\d+\b/g, '#').replace(/\s+/g, ' ').trim();
}
function ruleId(event) { return crypto.createHash('sha1').update(normalizeSignature(event)).digest('hex').slice(0, 16); }
function compatible(rule, engine = {}) {
  if (!rule) return false;
  if (rule.engines?.length && !rule.engines.includes(engine.engine)) return false;
  if (rule.engineVersions?.length && engine.version && engine.version !== 'unknown' && !rule.engineVersions.includes(engine.version)) return false;
  if (rule.expiresAt && Date.parse(rule.expiresAt) < Date.now()) return false;
  return true;
}
function upsertRule(kb, event, engine, outcome = 'blocked') {
  const id = ruleId(event); const now = new Date().toISOString(); const rules = kb.rules || (kb.rules = []);
  let rule = rules.find(r => r.id === id);
  if (!rule) { rule = { id, signature: normalizeSignature(event), kind: event.kind || 'unknown', sourcePattern: event.sourcePattern || null, engines: [], engineVersions: [], projects: [], hits: 0, blockedRegressions: 0, createdAt: now }; rules.push(rule); }
  if (engine?.engine && !rule.engines.includes(engine.engine)) rule.engines.push(engine.engine);
  if (engine?.version && engine.version !== 'unknown' && !rule.engineVersions.includes(engine.version)) rule.engineVersions.push(engine.version);
  if (event.projectId && !rule.projects.includes(event.projectId)) rule.projects.push(event.projectId);
  rule.hits++; if (outcome === 'blocked') rule.blockedRegressions++; rule.updatedAt = now; rule.confidence = Math.min(1, 0.45 + rule.hits * 0.08 + rule.projects.length * 0.05);
  return rule;
}
function matchingRules(kb, engine, minimumConfidence = 0.6) { return (kb.rules || []).filter(r => compatible(r, engine) && Number(r.confidence || 0) >= minimumConfidence); }
module.exports = { compatible, matchingRules, normalizeSignature, ruleId, upsertRule };
