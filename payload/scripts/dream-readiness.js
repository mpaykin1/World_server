#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dream-quality-systems.json'), 'utf8'));
const maxAgeHours = Number(process.env.DREAM_EVIDENCE_MAX_AGE_HOURS || cfg.defaultEvidenceMaxAgeHours || 24);

function headSha() {
  const r = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const sha = headSha();

function getByPath(obj, p) {
  return String(p || '').split('.').filter(Boolean).reduce((v, key) => v == null ? undefined : v[key], obj);
}

function evidenceResult(ev) {
  const file = path.join(ROOT, ev.file);
  if (!fs.existsSync(file)) return { ok: false, reason: 'missing', file: ev.file };
  let content = null;
  if (ev.contains) {
    content = fs.readFileSync(file, 'utf8');
    if (!content.includes(ev.contains)) return { ok: false, reason: 'content-missing', file: ev.file };
  }
  if (ev.maxAgeHours || ev.json) {
    let data;
    try { data = JSON.parse(content ?? fs.readFileSync(file, 'utf8')); }
    catch { return { ok: false, reason: 'invalid-json', file: ev.file }; }
    const ageLimit = Number(ev.maxAgeHours || maxAgeHours);
    if (ev.maxAgeHours !== 0 && data.generatedAt) {
      const ageHours = (Date.now() - Date.parse(data.generatedAt)) / 3600000;
      if (!Number.isFinite(ageHours) || ageHours > ageLimit) {
        return { ok: false, reason: 'stale', file: ev.file, ageHours: Math.round(ageHours * 10) / 10 };
      }
    }
    if (ev.requireHeadSha && sha && data.gitSha && data.gitSha !== sha) {
      return { ok: false, reason: 'wrong-git-sha', file: ev.file, reportSha: data.gitSha, headSha: sha };
    }
    if (ev.json) {
      const actual = getByPath(data, ev.json.path);
      if ('equals' in ev.json && actual !== ev.json.equals) {
        return { ok: false, reason: 'json-value', file: ev.file, actual, expected: ev.json.equals };
      }
      if ('gte' in ev.json && !(Number(actual) >= Number(ev.json.gte))) {
        return { ok: false, reason: 'json-gte', file: ev.file, actual, expected: ev.json.gte };
      }
    }
  }
  return { ok: true, file: ev.file };
}

function ratio(list) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  const results = list.map(evidenceResult);
  return { ratio: results.filter(x => x.ok).length / results.length, results };
}

let totalWeight = 0;
let weightedDream = 0;
let weightedImplementation = 0;
const systems = [];

for (const system of cfg.systems) {
  const source = ratio(system.sourceEvidence || []);
  const automation = ratio(system.automationEvidence || []);
  const runtime = ratio(system.runtimeEvidence || []);
  const sourceRatio = source.ratio || 0;
  const automationRatio = automation.ratio || 0;
  const runtimeRatio = runtime.ratio || 0;
  const implementationPercent = Math.round(100 * (0.75 * sourceRatio + 0.25 * automationRatio));
  const verifiedPercent = Math.round(100 * (0.5 * sourceRatio + 0.2 * automationRatio + 0.3 * runtimeRatio));
  const weight = Number(system.weight || 1);
  totalWeight += weight;
  weightedImplementation += implementationPercent * weight;
  weightedDream += verifiedPercent * weight;
  systems.push({
    id: system.id,
    title: system.title,
    weight,
    implementationPercent,
    verifiedPercent,
    sourceEvidence: source.results || [],
    automationEvidence: automation.results || [],
    runtimeEvidence: runtime.results || []
  });
}

const implementationPercent = Math.round(weightedImplementation / Math.max(1, totalWeight));
const dreamVerifiedPercent = Math.round(weightedDream / Math.max(1, totalWeight));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  gitSha: sha,
  definition: 'Dream = autonomous build/run/play/observe/score/root-cause/fix/retest/canary/deploy loop across Web/Godot/Roblox/devices.',
  implementationPercent,
  dreamVerifiedPercent,
  qualityFrameworkPercent: (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, 'QUALITY_MASTER_REPORT.json'), 'utf8')).overallPercent ?? null;
    } catch { return null; }
  })(),
  systems
};
fs.writeFileSync(path.join(ROOT, 'DREAM_READINESS_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`[DREAM_READINESS] implementation=${implementationPercent}% verified=${dreamVerifiedPercent}% qualityFramework=${report.qualityFrameworkPercent ?? 'n/a'}%`);
