#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const POLICY_PATH = path.join(ROOT, 'data', 'gap-closure-policy.json');
const REPORT_PATH = path.join(ROOT, 'GAP_CLOSURE_REPORT.json');
const STATUS_PATH = path.join(ROOT, 'GAP_CLOSURE_STATUS.json');

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.writeFileSync(path.join(ROOT, file), JSON.stringify(value, null, 2) + '\n');
}

function currentBranch() {
  try {
    return cp.execFileSync('git', ['branch', '--show-current'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch { return ''; }
}

function loadPolicy() {
  const fallback = {
    schemaVersion: '1.0.0',
    protectedBranches: ['master', 'main'],
    productionBaseUrl: 'https://world-server.vercel.app',
    productionTimeoutMs: 20000,
    acceptedRuntimeEvidenceMinutes: 20,
    gates: { release: ['blocker'], perfectReadiness: ['blocker', 'major', 'warning'] },
    deterministicFixes: { viewportFit: true }
  };
  try {
    const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
    return { ...fallback, ...policy, gates: { ...fallback.gates, ...(policy.gates || {}) } };
  } catch { return fallback; }
}

function normalizeGap(gap) {
  return {
    key: gap.key,
    domain: gap.domain || 'unknown',
    severity: gap.severity || 'warning',
    scope: gap.scope || 'global',
    source: gap.source || 'local',
    title: gap.title || gap.key,
    description: gap.description || '',
    releaseBlocking: Boolean(gap.releaseBlocking),
    autoFixable: Boolean(gap.autoFixable),
    status: gap.status || 'detected',
    evidence: gap.evidence || {},
    fix: gap.fix || {}
  };
}

function dedupeGaps(gaps) {
  const rank = { blocker: 4, major: 3, warning: 2, info: 1 };
  const map = new Map();
  for (const raw of gaps) {
    const gap = normalizeGap(raw);
    const prev = map.get(gap.key);
    if (!prev || rank[gap.severity] > rank[prev.severity]) map.set(gap.key, gap);
    else if (prev) map.set(gap.key, { ...prev, evidence: { ...prev.evidence, ...gap.evidence } });
  }
  return [...map.values()].sort((a, b) =>
    (rank[b.severity] - rank[a.severity]) || a.key.localeCompare(b.key));
}

function detectProjectReview(gaps) {
  const review = readJson('PROJECT_QUALITY_REVIEW.json');
  if (!review || !Array.isArray(review.findings)) return;
  for (const finding of review.findings) {
    if (!['major', 'blocker'].includes(finding.severity)) continue;
    const isViewport = finding.category === 'mobile' && /viewport-fit=cover missing/i.test(String(finding.message || ''));
    gaps.push({
      key: isViewport ? 'project.mobile.viewport-fit' : `project.review.${finding.category || 'unknown'}.${finding.file || 'unknown'}`,
      domain: finding.category || 'project',
      severity: finding.severity,
      scope: finding.file || 'project',
      source: 'PROJECT_QUALITY_REVIEW.json',
      title: isViewport ? 'Mobile safe-area viewport support is missing' : String(finding.message || 'Project quality finding'),
      description: `${finding.file || 'unknown'}: ${finding.message || ''}`,
      releaseBlocking: isViewport || finding.severity === 'blocker',
      autoFixable: isViewport,
      evidence: finding,
      fix: isViewport ? { type: 'viewport-fit', file: finding.file } : { type: 'desktop-ai' }
    });
  }
}

function detectWorldStatus(gaps) {
  const status = readJson('WORLD_QUALITY_AUTOPILOT_STATUS.json');
  if (!status) return;
  if (Number.isFinite(status.runtimeQualityPercent) && status.runtimeQualityPercent < 100) {
    gaps.push({
      key: 'world.runtime.quality-below-100', domain: 'runtime', severity: 'warning', scope: 'world',
      source: 'WORLD_QUALITY_AUTOPILOT_STATUS.json', title: 'Runtime quality is below 100%',
      description: `runtimeQualityPercent=${status.runtimeQualityPercent}`,
      evidence: { runtimeQualityPercent: status.runtimeQualityPercent },
      fix: { type: 'runtime-evidence-and-optimization' }
    });
  }
  if (Number.isFinite(status.deviceEvidencePercent) && status.deviceEvidencePercent < 100) {
    gaps.push({
      key: 'world.device.evidence-below-100', domain: 'devices', severity: 'major', scope: 'world',
      source: 'WORLD_QUALITY_AUTOPILOT_STATUS.json', title: 'Real-device evidence is incomplete',
      description: `deviceEvidencePercent=${status.deviceEvidencePercent}`,
      evidence: { deviceEvidencePercent: status.deviceEvidencePercent },
      fix: { type: 'real-device-provider', required: ['ios', 'android'] }
    });
  }
  const optimization = status.domainPercent?.optimization;
  if (Number.isFinite(optimization) && optimization < 100) {
    gaps.push({
      key: 'world.optimization.below-100', domain: 'optimization', severity: 'warning', scope: 'world',
      source: 'WORLD_QUALITY_AUTOPILOT_STATUS.json', title: 'Optimization domain is below 100%',
      description: `optimization=${optimization}`,
      evidence: { optimizationPercent: optimization },
      fix: { type: 'profile-optimize-verify' }
    });
  }
  if (Number(status.feedbackSamples || 0) === 0) {
    gaps.push({
      key: 'world.feedback.no-samples', domain: 'learning', severity: 'warning', scope: 'world',
      source: 'WORLD_QUALITY_AUTOPILOT_STATUS.json', title: 'Feedback learner has no runtime samples',
      description: 'The learner cannot validate improvement quality without real feedback samples.',
      evidence: { feedbackSamples: status.feedbackSamples || 0 },
      fix: { type: 'collect-runtime-feedback' }
    });
  }
}

function detectProductionReport(gaps) {
  const report = readJson('PRODUCTION_QUALITY_REPORT.json');
  if (!report || report.pass !== false) return;
  const violations = Array.isArray(report.violations) ? report.violations : [];
  if (!violations.length) {
    gaps.push({
      key: 'production.quality.failed', domain: 'production', severity: 'blocker', scope: 'global',
      source: 'PRODUCTION_QUALITY_REPORT.json', title: 'Production quality gate failed',
      description: 'The production quality report is failing without a normalized violation list.',
      releaseBlocking: true, evidence: report, fix: { type: 'root-cause-production' }
    });
    return;
  }
  for (const v of violations) {
    gaps.push({
      key: `production.${v.type || 'violation'}.${v.app || 'global'}`,
      domain: 'production', severity: 'blocker', scope: v.app || 'global',
      source: 'PRODUCTION_QUALITY_REPORT.json', title: `Production violation: ${v.type || 'unknown'}`,
      description: JSON.stringify(v), releaseBlocking: true, evidence: v,
      fix: { type: 'root-cause-production' }
    });
  }
}

async function detectProductionLive(gaps, policy) {
  const base = String(process.env.QUALITY_BASE_URL || policy.productionBaseUrl || '').replace(/\/$/, '');
  if (!base) return { attempted: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(policy.productionTimeoutMs || 20000));
  try {
    const response = await fetch(`${base}/api/quality-summary?hours=24`, { signal: controller.signal });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json || json.ok !== true) {
      gaps.push({
        key: 'production.summary.unavailable', domain: 'production', severity: 'blocker', scope: 'global',
        source: 'live-production', title: 'Production quality summary is unavailable',
        description: `HTTP ${response.status}; ${(json && json.error) || 'invalid response'}`,
        releaseBlocking: true, evidence: { status: response.status, response: json },
        fix: { type: 'restore-production-quality-summary' }
      });
      return { attempted: true, ok: false, status: response.status };
    }
    return { attempted: true, ok: true, status: response.status, apps: json.apps || {} };
  } catch (error) {
    gaps.push({
      key: 'production.summary.unreachable', domain: 'production', severity: 'blocker', scope: 'global',
      source: 'live-production', title: 'Production quality endpoint is unreachable',
      description: String(error?.message || error), releaseBlocking: true,
      evidence: { error: String(error?.message || error) }, fix: { type: 'restore-production-route-or-deployment' }
    });
    return { attempted: true, ok: false, error: String(error?.message || error) };
  } finally { clearTimeout(timer); }
}

async function syncSupabase(gaps) {
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) return { attempted: false };
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) return { attempted: false };
  try {
    const { createAdminClient } = require('../lib/env');
    const admin = createAdminClient();
    const { data: cycle, error: cycleError } = await admin.rpc('run_gap_closure_db_cycle', { p_trigger: 'repo-gap-closure-engine' });
    if (cycleError) throw cycleError;
    const { data: rows, error } = await admin
      .from('gap_closure_registry')
      .select('gap_key,domain,severity,source,title,description,status,auto_fixable,evidence,fix_strategy,last_seen_at,closed_at')
      .neq('status', 'closed')
      .order('last_seen_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    for (const row of rows || []) {
      gaps.push({
        key: row.gap_key,
        domain: row.domain,
        severity: row.severity,
        source: `supabase:${row.source}`,
        title: row.title,
        description: row.description,
        status: row.status,
        autoFixable: row.auto_fixable,
        evidence: row.evidence || {},
        fix: row.fix_strategy || {},
        releaseBlocking: row.severity === 'blocker'
      });
    }
    return { attempted: true, ok: true, cycle, openRows: (rows || []).length };
  } catch (error) {
    gaps.push({
      key: 'gap-closure.supabase-sync.failed', domain: 'automation', severity: 'warning', scope: 'gap-closure',
      source: 'gap-closure-engine', title: 'Gap registry sync failed', description: String(error?.message || error),
      evidence: { error: String(error?.message || error) }, fix: { type: 'restore-supabase-service-env' }
    });
    return { attempted: true, ok: false, error: String(error?.message || error) };
  }
}

function addViewportFit(content) {
  const metaRe = /<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']\s*\/?\s*>/i;
  const match = content.match(metaRe);
  if (match) {
    if (/viewport-fit\s*=\s*cover/i.test(match[1])) return { changed: false, content };
    const nextValue = `${match[1].trim().replace(/,?\s*$/, '')}, viewport-fit=cover`;
    return { changed: true, content: content.replace(metaRe, `<meta name="viewport" content="${nextValue}">`) };
  }
  const headRe = /<head(\s[^>]*)?>/i;
  if (!headRe.test(content)) return { changed: false, content, error: 'head tag not found' };
  return {
    changed: true,
    content: content.replace(headRe, (m) => `${m}\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`)
  };
}

function applySafeFixes(gaps, policy, branch) {
  const applied = [];
  const skipped = [];
  const protectedBranch = (policy.protectedBranches || ['master', 'main']).includes(branch);
  for (const gap of gaps) {
    if (!gap.autoFixable) continue;
    if (gap.fix?.type === 'viewport-fit') {
      if (protectedBranch) {
        skipped.push({ key: gap.key, reason: `protected branch: ${branch}` });
        continue;
      }
      const rel = gap.fix.file || 'apps/ai3d-voxel-city/index.html';
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) {
        skipped.push({ key: gap.key, reason: `file missing: ${rel}` });
        continue;
      }
      const before = fs.readFileSync(file, 'utf8');
      const result = addViewportFit(before);
      if (result.changed) {
        fs.writeFileSync(file, result.content);
        applied.push({ key: gap.key, file: rel, fix: 'viewport-fit=cover' });
      } else {
        skipped.push({ key: gap.key, reason: result.error || 'already fixed' });
      }
    }
  }
  return { applied, skipped, protectedBranch };
}

function gateFailures(gaps, policy, mode) {
  if (mode === 'perfect') {
    const severities = new Set(policy.gates?.perfectReadiness || ['blocker', 'major', 'warning']);
    return gaps.filter((g) => severities.has(g.severity));
  }
  return gaps.filter((g) => g.releaseBlocking || g.severity === 'blocker');
}

function statusFrom(gaps, live, db, fixes, branch) {
  const counts = { blocker: 0, major: 0, warning: 0, info: 0 };
  for (const g of gaps) counts[g.severity] = (counts[g.severity] || 0) + 1;
  const releaseBlockers = gaps.filter((g) => g.releaseBlocking || g.severity === 'blocker');
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    branch,
    openGapCount: gaps.length,
    counts,
    releaseBlockerCount: releaseBlockers.length,
    perfectReadiness: gaps.length === 0,
    releaseReady: releaseBlockers.length === 0,
    liveProductionChecked: Boolean(live?.attempted),
    liveProductionOk: live?.ok ?? null,
    supabaseRegistryChecked: Boolean(db?.attempted),
    supabaseRegistryOk: db?.ok ?? null,
    fixesApplied: fixes?.applied?.length || 0
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const gate = args.has('--gate') || args.has('--gate=release');
  const perfectGate = args.has('--gate=perfect');
  const policy = loadPolicy();
  const branch = currentBranch();
  const gaps = [];

  detectProjectReview(gaps);
  detectWorldStatus(gaps);
  detectProductionReport(gaps);
  const live = await detectProductionLive(gaps, policy);
  const db = await syncSupabase(gaps);

  let normalized = dedupeGaps(gaps);
  const fixes = apply ? applySafeFixes(normalized, policy, branch) : { applied: [], skipped: [], protectedBranch: false };

  if (apply && fixes.applied.length) {
    // Re-run only local deterministic detectors so an applied fix is not reported as closed until the canonical reviewer regenerates evidence.
    normalized = normalized.map((g) => fixes.applied.some((f) => f.key === g.key)
      ? { ...g, status: 'verifying', evidence: { ...g.evidence, patchApplied: true, verificationPending: true } }
      : g);
  }

  const report = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    policyVersion: policy.schemaVersion || '1.0.0',
    branch,
    mode: apply ? 'apply-safe-fixes' : 'analyze',
    liveProduction: live,
    supabase: db,
    fixes,
    gaps: normalized
  };
  writeJson('GAP_CLOSURE_REPORT.json', report);
  const status = statusFrom(normalized, live, db, fixes, branch);
  writeJson('GAP_CLOSURE_STATUS.json', status);

  console.log(`[GAP_CLOSURE] gaps=${status.openGapCount} blockers=${status.releaseBlockerCount} fixes=${status.fixesApplied} releaseReady=${status.releaseReady}`);

  if (gate || perfectGate) {
    const failures = gateFailures(normalized, policy, perfectGate ? 'perfect' : 'release');
    if (failures.length) {
      console.error(`[GAP_CLOSURE] gate failed: ${failures.map((g) => g.key).join(', ')}`);
      process.exit(41);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[GAP_CLOSURE] fatal', error);
    process.exit(42);
  });
}

module.exports = {
  addViewportFit,
  dedupeGaps,
  gateFailures,
  normalizeGap,
  detectProjectReview,
  detectWorldStatus,
  detectProductionReport
};
