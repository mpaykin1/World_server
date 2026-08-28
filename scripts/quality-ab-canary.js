#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
function merge(a,b){const o={...(a||{})};for(const [k,v] of Object.entries(b||{}))o[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(o[k]||{},v):v;return o}
const baseConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'quiet-quality-autopilot.json'), 'utf8'));
let learned={};try{learned=JSON.parse(fs.readFileSync(path.join(ROOT,'.quality-autopilot-state','learned-policy.json'),'utf8'))}catch(_){}
const config = merge(baseConfig, learned.configOverrides||{});
const canary = config.canary || {};
const baseline = (process.env.BASELINE_URL || process.env.QUALITY_BASE_URL || config.productionBaseUrl || '').replace(/\/$/, '');
const candidate = (process.env.CANDIDATE_URL || '').replace(/\/$/, '');
const paths = Array.isArray(canary.paths) && canary.paths.length ? canary.paths : ['/api/apps', '/apps/catalog/'];
const warmups = Number(canary.warmupRequests || 2);
const samples = Number(canary.sampleRequests || 7);
const timeoutMs = Number(canary.requestTimeoutMs || 15000);

if (!baseline || !candidate) {
  console.error('[QUALITY_AB_CANARY] BASELINE_URL/QUALITY_BASE_URL and CANDIDATE_URL are required');
  process.exit(2);
}

function percentile(values, q) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil(q * a.length) - 1));
  return a[i];
}
function pct(candidateValue, baselineValue) {
  if (!Number.isFinite(candidateValue) || !Number.isFinite(baselineValue) || baselineValue === 0) return null;
  return ((candidateValue - baselineValue) / baselineValue) * 100;
}
async function one(base, route) {
  const started = performance.now();
  try {
    const headers = {};
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET && base === candidate) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const r = await fetch(base + route, { redirect: 'follow', cache: 'no-store', headers, signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    return {
      ok: r.ok && !/Internal Server Error/i.test(text),
      status: r.status,
      ms: performance.now() - started,
      bytes: Buffer.byteLength(text),
      bodyError: /Internal Server Error/i.test(text)
    };
  } catch (e) {
    return { ok: false, status: 0, ms: performance.now() - started, bytes: 0, error: String(e.message || e) };
  }
}
async function warm(base, route) { for (let i = 0; i < warmups; i++) await one(base, route); }
function summarize(rows) {
  const ms = rows.map(r => r.ms);
  const errors = rows.filter(r => !r.ok).length;
  return {
    count: rows.length,
    errors,
    errorRatePercent: rows.length ? errors * 100 / rows.length : 100,
    medianMs: percentile(ms, 0.5),
    p95Ms: percentile(ms, 0.95),
    medianBytes: percentile(rows.map(r => r.bytes), 0.5)
  };
}

(async () => {
  const results = [];
  for (const route of paths) {
    await warm(baseline, route);
    await warm(candidate, route);
    const b = [], c = [];
    for (let i = 0; i < samples; i++) {
      if (i % 2 === 0) { b.push(await one(baseline, route)); c.push(await one(candidate, route)); }
      else { c.push(await one(candidate, route)); b.push(await one(baseline, route)); }
    }
    const bs = summarize(b), cs = summarize(c);
    const medianRegressionPercent = pct(cs.medianMs, bs.medianMs);
    const p95RegressionPercent = pct(cs.p95Ms, bs.p95Ms);
    const errorRateDeltaPercent = cs.errorRatePercent - bs.errorRatePercent;
    const bodyRatio = Number.isFinite(cs.medianBytes) && Number.isFinite(bs.medianBytes) && bs.medianBytes > 0 ? cs.medianBytes / bs.medianBytes : null;
    const contentPass = !route.startsWith('/apps/') || bodyRatio === null || bodyRatio >= Number(canary.minHtmlBodyRatio || 0.70);
    const pass =
      contentPass &&
      cs.errorRatePercent <= bs.errorRatePercent + Number(canary.maxErrorRateDeltaPercent || 0) &&
      (medianRegressionPercent === null || medianRegressionPercent <= Number(canary.maxMedianRegressionPercent || 3)) &&
      (p95RegressionPercent === null || p95RegressionPercent <= Number(canary.maxP95RegressionPercent || 3));
    results.push({ route, baseline: bs, candidate: cs, medianRegressionPercent, p95RegressionPercent, errorRateDeltaPercent, bodyRatio, contentPass, pass });
    console.log(`[QUALITY_AB_CANARY] ${route} pass=${pass} medianDelta=${medianRegressionPercent?.toFixed(2) ?? 'n/a'}% p95Delta=${p95RegressionPercent?.toFixed(2) ?? 'n/a'}%`);
  }
  const medianDeltas = results.map(r => r.medianRegressionPercent).filter(Number.isFinite);
  const averageMedianDeltaPercent = medianDeltas.length ? medianDeltas.reduce((a, b) => a + b, 0) / medianDeltas.length : null;
  const report = {
    generatedAt: new Date().toISOString(), baseline, candidate, samples, warmups,
    pass: results.every(r => r.pass),
    averageMedianDeltaPercent,
    averageMedianWinPercent: Number.isFinite(averageMedianDeltaPercent) ? -averageMedianDeltaPercent : null,
    results
  };
  fs.writeFileSync(path.join(ROOT, 'QUALITY_AB_CANARY_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`[QUALITY_AB_CANARY] pass=${report.pass} avgMedianWin=${report.averageMedianWinPercent?.toFixed(2) ?? 'n/a'}%`);
  if (!report.pass) process.exit(31);
})().catch(e => { console.error(e); process.exit(32); });
