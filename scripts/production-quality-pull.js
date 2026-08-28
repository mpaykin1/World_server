#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, 'PRODUCTION_QUALITY_REPORT.json');
const ISSUE_PATH = path.join(ROOT, 'PRODUCTION_QUALITY_ISSUE.md');
const base = (process.env.QUALITY_BASE_URL || 'https://world-server.vercel.app').replace(/\/$/, '');
const timeoutMs = Number(process.env.QUALITY_TIMEOUT_MS || 20000);

function readBudgets() {
  const p = path.join(ROOT, 'data/performance-budgets.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).budgets;
}

function safe(v) {
  if (v === undefined) return null;
  return v;
}

function classify(violations) {
  if (!violations.length) return 'pass';
  return violations.some(v => String(v.type || '').startsWith('monitor-') || v.type === 'summary-unavailable')
    ? 'monitor_failure'
    : 'product_regression';
}

function issueMarkdown(report) {
  const lines = [
    `## Production quality evidence`,
    ``,
    `**Classification:** \`${report.classification}\``,
    `**Generated:** ${report.generatedAt}`,
    `**Base:** ${report.base}`,
    `**Violations:** ${report.violations.length}`,
    ``
  ];

  if (report.violations.length) {
    lines.push('| Type | App | Evidence |', '|---|---|---|');
    for (const v of report.violations) {
      const app = v.app || '—';
      const details = Object.entries(v)
        .filter(([k]) => !['type', 'app'].includes(k))
        .map(([k, val]) => `${k}=${JSON.stringify(val)}`)
        .join(', ')
        .replace(/\|/g, '\\|');
      lines.push(`| \`${v.type}\` | ${app} | ${details || '—'} |`);
    }
  } else {
    lines.push('No violations detected.');
  }

  lines.push(
    ``,
    `Full machine-readable evidence is attached to the workflow run as \`PRODUCTION_QUALITY_REPORT.json\`.`,
    `Do not raise or weaken the quality baseline to silence this failure. Fix the root cause and keep the regression guard.`
  );
  return lines.join('\n') + '\n';
}

function persist(report) {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(ISSUE_PATH, issueMarkdown(report));
  console.log(`[PRODUCTION_QUALITY] pass=${report.pass} classification=${report.classification} violations=${report.violations.length}`);
}

async function main() {
  const violations = [];
  let summary = null;
  let status = null;

  try {
    const budgets = readBudgets();
    let response;

    try {
      response = await fetch(`${base}/api/quality-summary?hours=24`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' }
      });
      status = response.status;
    } catch (error) {
      violations.push({
        type: 'monitor-fetch-failure',
        error: String(error && error.message || error),
        cause: safe(error && error.cause && error.cause.code)
      });
      const report = {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        base,
        httpStatus: status,
        summary,
        violations,
        classification: classify(violations),
        pass: false
      };
      persist(report);
      process.exitCode = 24;
      return;
    }

    try {
      summary = await response.json();
    } catch (error) {
      summary = { ok: false, error: 'invalid json' };
      violations.push({
        type: 'monitor-invalid-json',
        status: response.status,
        error: String(error && error.message || error)
      });
    }

    if (!response.ok || !summary || summary.ok !== true) {
      violations.push({
        type: 'summary-unavailable',
        status: response.status,
        error: safe(summary && summary.error)
      });
    }

    for (const [app, metrics] of Object.entries((summary && summary.apps) || {})) {
      const budget = budgets[app];
      if (!budget || !metrics.sessions) continue;

      if (Number.isFinite(metrics.p10Fps) && metrics.p10Fps < budget.minimumFps) {
        violations.push({
          type: 'production-fps',
          app,
          observed: metrics.p10Fps,
          min: budget.minimumFps
        });
      }

      if (Number.isFinite(metrics.p95LoadMs) && metrics.p95LoadMs > budget.canvasVisibleMs + 2500) {
        violations.push({
          type: 'production-load',
          app,
          observed: metrics.p95LoadMs,
          max: budget.canvasVisibleMs + 2500
        });
      }

      if (Number(metrics.errors || 0) > Math.max(3, Math.ceil(metrics.sessions * 0.05))) {
        violations.push({
          type: 'production-errors',
          app,
          errors: metrics.errors,
          sessions: metrics.sessions
        });
      }
    }

    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      base,
      httpStatus: status,
      summary,
      violations,
      classification: classify(violations),
      pass: violations.length === 0
    };

    persist(report);
    if (!report.pass) process.exitCode = report.classification === 'monitor_failure' ? 24 : 23;
  } catch (error) {
    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      base,
      httpStatus: status,
      summary,
      violations: [{
        type: 'monitor-internal-failure',
        error: String(error && error.stack || error)
      }],
      classification: 'monitor_failure',
      pass: false
    };

    try {
      persist(report);
    } catch (persistError) {
      console.error('[PRODUCTION_QUALITY] unable to persist evidence:', persistError);
      console.error(JSON.stringify(report));
    }
    process.exitCode = 24;
  }
}

main();
