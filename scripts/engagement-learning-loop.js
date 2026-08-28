#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const TELEMETRY_PATH = process.env.IW_ENGAGEMENT_TELEMETRY || path.join(ROOT, 'data', 'engagement-telemetry-export.json');
const POLICY_PATH = path.join(ROOT, 'apps', 'improve-world-home', 'public', 'engagement-policy.json');
const REPORT_PATH = path.join(ROOT, 'ENGAGEMENT_LEARNING_REPORT.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,Number(v)||0)); }
function bool(v){ return v === true || v === 1; }

const policy = readJson(POLICY_PATH, null);
if (!policy) throw new Error(`Missing ${POLICY_PATH}`);
const input = readJson(TELEMETRY_PATH, { sessions: [] });
const sessions = Array.isArray(input.sessions) ? input.sessions : [];

function reward(s) {
  const totalSteps = Math.max(1, Number(s.totalSteps) || 31);
  const depth = clamp((Number(s.maxStep) || 0) / totalSteps, 0, 1);
  const completion = bool(s.completed) ? 1 : 0;
  const firstWowMs = Math.max(0, Number(s.firstWowMs) || 120000);
  const wow = clamp(1 - firstWowMs / 90000, 0, 1);
  const agency = clamp(Number(s.worldInteractions) / 8, 0, 1);
  const continuation = bool(s.published) || bool(s.merged) || bool(s.shared) ? 1 : 0;
  const returnSignal = bool(s.returnedWithin7d) ? 1 : 0;
  const skipRate = clamp(Number(s.skips) / totalSteps, 0, 1);
  const errors = Math.max(0, Number(s.errorCount) || 0);
  const crashed = bool(s.crashed);
  const fpsP10 = Number(s.fpsP10) || 0;
  const device = String(s.device || '').toLowerCase();
  const fpsTarget = device.includes('mobile') ? policy.guardrails.mobileFpsP10 : policy.guardrails.desktopFpsP10;
  const fps = fpsP10 ? clamp(fpsP10 / fpsTarget, 0, 1) : .7;
  const reliability = crashed ? 0 : clamp(1 - errors * .18, 0, 1);
  return clamp(
    completion * .22 +
    depth * .18 +
    wow * .14 +
    agency * .12 +
    continuation * .12 +
    returnSignal * .08 +
    (1 - skipRate) * .05 +
    fps * .05 +
    reliability * .04,
    0, 1
  );
}

function guardrailStats(rows) {
  if (!rows.length) return { pass: false, reason: 'no-samples', errorRate: null, crashRate: null, fpsP10: null };
  const errorSessions = rows.filter(s => (Number(s.errorCount) || 0) > 0).length;
  const crashes = rows.filter(s => bool(s.crashed)).length;
  const fpsValues = rows.map(s => Number(s.fpsP10)).filter(Number.isFinite).filter(v => v > 0).sort((a,b)=>a-b);
  const fpsP10 = fpsValues.length ? fpsValues[Math.max(0, Math.floor((fpsValues.length - 1) * .1))] : null;
  const errorRate = errorSessions / rows.length;
  const crashRate = crashes / rows.length;
  const mobileRows = rows.filter(s => String(s.device || '').toLowerCase().includes('mobile'));
  const desktopRows = rows.filter(s => !String(s.device || '').toLowerCase().includes('mobile'));
  const avgFps = group => {
    const v = group.map(s=>Number(s.fpsP10)).filter(Number.isFinite).filter(x=>x>0);
    return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
  };
  const mobileFps = avgFps(mobileRows), desktopFps = avgFps(desktopRows);
  const pass = errorRate <= policy.guardrails.maxErrorRate && crashRate <= policy.guardrails.maxCrashRate &&
    (mobileFps === null || mobileFps >= policy.guardrails.mobileFpsP10) &&
    (desktopFps === null || desktopFps >= policy.guardrails.desktopFpsP10);
  return { pass, errorRate:+errorRate.toFixed(4), crashRate:+crashRate.toFixed(4), fpsP10, mobileFps, desktopFps };
}

function summarizeDimension(name) {
  const variants = policy.variants[name] || [];
  const groups = variants.map(variant => {
    const rows = sessions.filter(s => String(s.variant?.[name] || '') === variant);
    const rewards = rows.map(reward);
    const mean = rewards.length ? rewards.reduce((a,b)=>a+b,0)/rewards.length : 0;
    const n = rewards.length;
    const total = Math.max(1, sessions.length);
    const exploration = n ? Math.sqrt(2 * Math.log(total + 1) / n) : 1;
    return { variant, samples:n, meanReward:+mean.toFixed(4), ucb:+(mean + exploration*.08).toFixed(4), guardrails:guardrailStats(rows) };
  }).sort((a,b)=>b.ucb-a.ucb);
  const activeName = policy.active[name];
  const active = groups.find(g => g.variant === activeName) || { meanReward:0, samples:0 };
  const winner = groups[0] || null;
  const enoughEvidence = groups.length > 0 && groups.every(g => g.samples >= policy.minimumEvidence.sessionsPerVariant);
  const lift = winner ? winner.meanReward - active.meanReward : 0;
  const promotable = Boolean(winner && winner.variant !== activeName && enoughEvidence && winner.guardrails.pass && lift >= policy.minimumEvidence.minimumLift);
  return { name, active:activeName, winner, enoughEvidence, lift:+lift.toFixed(4), promotable, variants:groups };
}

const dimensions = Object.keys(policy.variants || {}).map(summarizeDimension);
const allRewards = sessions.map(reward);
const meanReward = allRewards.length ? allRewards.reduce((a,b)=>a+b,0)/allRewards.length : 0;
const commercialScore = Math.round(meanReward * 100);
const promoted = [];

if (APPLY) {
  for (const d of dimensions) {
    if (d.promotable) {
      policy.active[d.name] = d.winner.variant;
      promoted.push({ dimension:d.name, from:d.active, to:d.winner.variant, lift:d.lift, samples:d.winner.samples });
    }
  }
  if (promoted.length) {
    policy.policyVersion = Number(policy.policyVersion || 0) + 1;
    policy.updatedAt = new Date().toISOString();
    fs.writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2) + '\n');
  }
}

const report = {
  schemaVersion:'1.0.0',
  system:'IW_ENGAGEMENT_ONLINE_LEARNER',
  generatedAt:new Date().toISOString(),
  telemetryPath:TELEMETRY_PATH,
  sessions:sessions.length,
  commercialScore,
  meanReward:+meanReward.toFixed(4),
  guardrails:guardrailStats(sessions),
  dimensions,
  applyRequested:APPLY,
  promoted,
  automaticQuestionMutation:false,
  notes:[
    'This is guarded online learning: UCB exploration ranks UX variants from observed outcomes.',
    'No answer text is required. Use aggregated session metrics only.',
    'The 31/28 question contract, safety gates and FPS/error/crash guardrails cannot be bypassed by the learner.'
  ]
};
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
console.log(`[IW_ENGAGEMENT_LEARN] sessions=${sessions.length} score=${commercialScore} promoted=${promoted.length}`);
