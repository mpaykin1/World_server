'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { inspectAssets } = require('./quality/asset-inspector');
const { buildCodeGraph } = require('./quality/code-graph');
const { summarizeAssets, performanceScore } = require('./quality/performance-budget');
const { detectEngine, goldenCompatible } = require('./quality/engine-adapters');
const { evaluateTelemetry, readTelemetry } = require('./quality/telemetry-gate');
const { rankCandidates, paretoFront } = require('./quality/tournament');
const { clusterFailures } = require('./quality/root-cause');
const { debtFromAnalysis, mergeDebt } = require('./quality/quality-debt');
const { appendAudit } = require('./quality/audit-chain');
const { compileRegressionTests } = require('./quality/error-to-regression');
const { validateWorld } = require('./quality/semantic-world-validator');
const { proposeEngineOptimizations } = require('./quality/engine-optimizer');
const { matchingRules, upsertRule } = require('./quality/global-regression-kb');

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.css', '.html', '.htm', '.txt', '.yml', '.yaml', '.gd', '.luau']);

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function stableHash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20); }
function safeProjectFileName(id) { return id.replace(/[^a-z0-9._-]+/gi, '__'); }

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next', 'dist', 'build', '.vercel', '.godot', '.cache'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

function projectPriority(id, config) {
  const explicit = config.projectPriority?.[id];
  if (Number.isFinite(explicit)) return explicit;
  for (const rule of config.priorityRules || []) {
    try { if (new RegExp(rule.pattern).test(id)) return Number(rule.priority || 0); } catch {}
  }
  return 0;
}

function discoverProjects(repoRoot, config) {
  const projects = [];
  for (const rootName of config.projectRoots || ['apps']) {
    const root = path.join(repoRoot, rootName);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const files = walk(dir);
      const hasEntry = (config.entryFiles || ['index.html']).some(name => fs.existsSync(path.join(dir, name)));
      if (hasEntry || files.some(f => /\.(js|ts|html|godot|gd|luau|rbxlx|json)$/i.test(f))) {
        const id = `${rootName}/${entry.name}`;
        projects.push({ id, dir, files, priority: projectPriority(id, config) });
      }
    }
  }
  return projects.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function checkJavaScriptSyntax(files, repoRoot, maxBytes) {
  const errors = [];
  for (const file of files) {
    if (!/\.(js|mjs|cjs)$/i.test(file) || !fs.existsSync(file)) continue;
    const stat = fs.statSync(file); if (stat.size > maxBytes) continue;
    const result = spawnSync(process.execPath, ['--check', file], { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) errors.push({ kind: 'syntax', file: path.relative(repoRoot, file), source: path.relative(repoRoot, file), message: (result.stderr || result.stdout || 'syntax error').trim().slice(0, 500) });
  }
  return errors;
}

function loadProjectTelemetry(repoRoot, projectId, config) {
  const base = path.join(repoRoot, config.telemetry?.directory || 'data/quality-autopilot/telemetry');
  const stem = safeProjectFileName(projectId);
  const baseline = readTelemetry(path.join(base, `${stem}.baseline.json`));
  const current = readTelemetry(path.join(base, `${stem}.current.json`));
  const hasData = Object.keys(current).length > 0;
  const gate = hasData ? evaluateTelemetry(baseline, current, config.telemetry?.rules) : { ok: true, status: 'no-data', coverage: 0, checks: [], failed: [] };
  return { baseline, current, gate };
}

function analyzeProject(project, repoRoot, config, regressions = [], globalKb = { rules: [] }) {
  const maxBytes = config.budget?.maxFileBytesToInspect || 2 * 1024 * 1024;
  const files = project.files.filter(fs.existsSync);
  const assetSummary = summarizeAssets(files);
  const entryName = (config.entryFiles || ['index.html']).find(name => fs.existsSync(path.join(project.dir, name)));
  const missingEntry = entryName ? 0 : 1;
  let html = '';
  if (entryName) { const entry = path.join(project.dir, entryName); if (fs.statSync(entry).size <= maxBytes) html = fs.readFileSync(entry, 'utf8'); }

  const hasCharset = /<meta\s+[^>]*charset\s*=|<meta\s+charset/i.test(html);
  const hasViewport = /<meta\s+[^>]*name\s*=\s*["']viewport["']/i.test(html);
  const syntaxErrors = checkJavaScriptSyntax(files, repoRoot, maxBytes);
  const assetQuality = inspectAssets({ ...project, files }, config.assetQuality || {});
  const codeGraph = buildCodeGraph({ ...project, files }, maxBytes);
  const perf = performanceScore(assetSummary, config.deviceBudgets || {});
  const telemetry = loadProjectTelemetry(repoRoot, project.id, config);
  const engine = detectEngine({ ...project, files });
  const semantic = validateWorld({ ...project, files }, engine);
  const engineOptimizations = proposeEngineOptimizations({ ...project, files }, engine, semantic, config.engineOptimizer || {});

  const integrity = Math.max(0, 100 - missingEntry * 35 - syntaxErrors.length * 25);
  const mobile = entryName ? (hasViewport ? 100 : 62) : engine.engine === 'webgl' ? 50 : 85;
  const webStandards = entryName ? ((hasCharset ? 50 : 25) + (hasViewport ? 50 : 25)) : engine.engine === 'webgl' ? 50 : 90;
  const performance = perf.score;
  const assets = assetQuality.score;
  const maintainability = codeGraph.score;
  const liveQuality = telemetry.gate.status === 'no-data' ? 85 : telemetry.gate.ok ? 100 : 40;
  const semanticQuality = semantic.score;
  const score = Math.round(integrity * 0.24 + mobile * 0.10 + webStandards * 0.08 + performance * 0.16 + assets * 0.10 + maintainability * 0.10 + liveQuality * 0.10 + semanticQuality * 0.12);

  const regressionFailures = [];
  for (const rule of regressions.filter(r => r.projectId === project.id || r.scope === 'global')) {
    if (rule.kind === 'requires-viewport' && !hasViewport) regressionFailures.push(rule);
    if (rule.kind === 'requires-charset' && !hasCharset) regressionFailures.push(rule);
  }
  const kbRules = matchingRules(globalKb, engine, config.globalRegressionKb?.minimumConfidence || 0.6);
  for (const rule of kbRules) {
    if (!rule.sourcePattern) continue;
    const hit = files.some(file => {
      if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) return false;
      try { if (fs.statSync(file).size > maxBytes) return false; return fs.readFileSync(file, 'utf8').includes(rule.sourcePattern); } catch { return false; }
    });
    if (hit) regressionFailures.push({ ...rule, scope: 'global-kb' });
  }

  return {
    projectId: project.id, score,
    dimensions: { integrity, mobile, webStandards, performance, assets, maintainability, liveQuality, semanticQuality },
    metrics: { missingEntry, syntaxErrorCount: syntaxErrors.length, totalBytes: assetSummary.totalBytes, largestFileBytes: assetSummary.largestFileBytes, hasCharset, hasViewport, regressionFailureCount: regressionFailures.length, telemetryCoverage: telemetry.gate.coverage, duplicateCodeGroups: codeGraph.duplicateGroups.length, assetIssueCount: assetQuality.issues.length, semanticCriticalCount: semantic.critical, engineOptimizationCount: engineOptimizations.length },
    syntaxErrors, regressionFailures, assetSummary, assetQuality, codeGraph, telemetry, engine, semantic, engineOptimizations,
    performanceBudgets: perf.checks
  };
}

function weakestDimension(analysis) { return Object.entries(analysis.dimensions).sort((a, b) => a[1] - b[1])[0]?.[0] || 'integrity'; }
function nextQualityGoal(score, goals = [80, 90, 95, 98]) { return goals.find(goal => score < goal) || 100; }

function protectedWorsened(before, after, config) {
  const p = config.protectedMetrics || {};
  if (after.score < before.score - (p.allowScoreDrop || 0)) return 'quality-score';
  if (after.metrics.syntaxErrorCount > before.metrics.syntaxErrorCount + (p.allowNewSyntaxErrors || 0)) return 'syntax-errors';
  if (after.metrics.missingEntry > before.metrics.missingEntry + (p.allowNewMissingEntries || 0)) return 'missing-entry';
  if (after.metrics.regressionFailureCount > before.metrics.regressionFailureCount) return 'regression-rule';
  if (after.metrics.assetIssueCount > before.metrics.assetIssueCount + (p.allowNewAssetIssues || 0)) return 'asset-quality';
  if (after.metrics.duplicateCodeGroups > before.metrics.duplicateCodeGroups + (p.allowNewDuplicateGroups || 0)) return 'maintainability';
  if (after.metrics.semanticCriticalCount > before.metrics.semanticCriticalCount + (p.allowNewSemanticCritical || 0)) return 'semantic-world';
  if (before.telemetry?.gate?.status !== 'no-data' && after.telemetry?.gate?.status === 'rollback') return 'live-telemetry';
  return null;
}

function isProtectedFile(repoRoot, file, config) {
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
  for (const p of config.neverMutate || []) {
    if (rel === p || rel.startsWith(p.replace(/\/$/, '') + '/')) return true;
    try { if (new RegExp(p).test(rel)) return true; } catch {}
  }
  return false;
}

function fixFingerprint(projectId, fixId, targetFile, beforeContent) { return stableHash([projectId, fixId, targetFile, stableHash(beforeContent)].join('|')); }

function proposeSafeFixes(project, analysis, config, repoRoot = process.cwd()) {
  const allowed = new Set(config.safeFixes || []); const fixes = []; const index = path.join(project.dir, 'index.html');
  if (fs.existsSync(index) && !isProtectedFile(repoRoot, index, config)) {
    const html = fs.readFileSync(index, 'utf8');
    if (allowed.has('html-meta-charset') && !analysis.metrics.hasCharset && /<head(?:\s[^>]*)?>/i.test(html)) fixes.push({ id: 'html-meta-charset', file: index, description: 'Add UTF-8 charset metadata' });
    if (allowed.has('html-meta-viewport') && !analysis.metrics.hasViewport && /<head(?:\s[^>]*)?>/i.test(html)) fixes.push({ id: 'html-meta-viewport', file: index, description: 'Add mobile viewport metadata' });
  }
  if (allowed.has('text-final-newline')) {
    const candidate = project.files.find(file => !isProtectedFile(repoRoot, file, config) && TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()) && fs.statSync(file).size < (config.budget?.maxFileBytesToInspect || 2 * 1024 * 1024) && !fs.readFileSync(file, 'utf8').endsWith('\n'));
    if (candidate) fixes.push({ id: 'text-final-newline', file: candidate, description: 'Normalize final newline' });
  }
  return fixes.slice(0, config.budget?.maxFixesPerProject || 4);
}

function applySafeFix(fix) {
  const before = fs.readFileSync(fix.file, 'utf8'); let after = before;
  if (fix.id === 'html-meta-charset') after = before.replace(/<head(?:\s[^>]*)?>/i, match => `${match}\n    <meta charset="utf-8">`);
  else if (fix.id === 'html-meta-viewport') after = before.replace(/<head(?:\s[^>]*)?>/i, match => `${match}\n    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`);
  else if (fix.id === 'text-final-newline') after = before + '\n'; else throw new Error(`Unknown safe fix: ${fix.id}`);
  if (after !== before) fs.writeFileSync(fix.file, after); return { before, after, changed: after !== before };
}

function subsets(items, maxCandidates = 8) {
  const out = []; const n = Math.min(items.length, 8);
  for (let mask = 1; mask < (1 << n) && out.length < maxCandidates; mask++) out.push(items.filter((_, i) => mask & (1 << i)));
  return out;
}

function tournamentSafeFixes(project, before, fixes, repoRoot, config, regressions) {
  if (!fixes.length) return { winner: null, ranked: [], pareto: [] };
  const candidates = [];
  for (const combo of subsets(fixes, config.tournament?.maxCandidates || 8)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tournament-')); const cloneDir = path.join(tmp, 'project');
    fs.cpSync(project.dir, cloneDir, { recursive: true });
    const clone = { id: project.id, dir: cloneDir, files: walk(cloneDir), priority: project.priority };
    let valid = true;
    for (const fix of combo) {
      const rel = path.relative(project.dir, fix.file); const mapped = { ...fix, file: path.join(cloneDir, rel) };
      try { applySafeFix(mapped); } catch { valid = false; break; }
    }
    clone.files = walk(cloneDir);
    const after = valid ? analyzeProject(clone, repoRoot, config, regressions, { rules: [] }) : before;
    const regression = !valid ? 'apply-failed' : protectedWorsened(before, after, config);
    candidates.push({ id: combo.map(f => f.id).join('+'), fixes: combo.map(f => f.id), score: after.score, metrics: { score: after.score, integrity: after.dimensions.integrity, performance: after.dimensions.performance, assets: after.dimensions.assets }, regression, after });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const ranked = rankCandidates(candidates, config.tournament?.weights || { integrity: 0.02, performance: 0.01, assets: 0.01 });
  return { ...ranked, pareto: paretoFront(candidates.filter(c => !c.regression), ['score', 'integrity', 'performance']) };
}

function runVerificationCommands(repoRoot, commands, retries = 1) {
  const results = [];
  for (const command of commands || []) {
    let attempts = []; let ok = false;
    for (let i = 0; i <= retries; i++) {
      const result = spawnSync(command, { cwd: repoRoot, shell: true, encoding: 'utf8', timeout: 10 * 60 * 1000 });
      attempts.push({ status: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}`.trim().slice(-4000) });
      if (result.status === 0) { ok = true; break; }
    }
    results.push({ command, ok, flaky: ok && attempts.length > 1, attempts });
    if (!ok) break;
  }
  return results;
}

function loadState(repoRoot) {
  const base = path.join(repoRoot, 'data', 'quality-autopilot');
  return { base,
    memory: readJson(path.join(base, 'memory.json'), { version: 2, attempts: {} }),
    golden: readJson(path.join(base, 'golden.json'), { version: 2, fixes: {} }),
    regressions: readJson(path.join(base, 'regressions.json'), { version: 2, rules: [] }),
    debt: readJson(path.join(base, 'quality-debt.json'), { version: 2, items: [] }),
    failureEvents: readJson(path.join(base, 'failure-events.json'), { version: 3, events: [] }),
    globalKb: readJson(path.join(base, 'global-regression-kb.json'), { version: 3, rules: [] })
  };
}
function saveState(state) { writeJson(path.join(state.base, 'memory.json'), state.memory); writeJson(path.join(state.base, 'golden.json'), state.golden); writeJson(path.join(state.base, 'regressions.json'), state.regressions); writeJson(path.join(state.base, 'quality-debt.json'), state.debt); writeJson(path.join(state.base, 'failure-events.json'), state.failureEvents); writeJson(path.join(state.base, 'global-regression-kb.json'), state.globalKb); }

function recordSuccessfulFix(state, projectId, fix, fingerprint, config, engineInfo) {
  state.memory.attempts[fingerprint] = { status: 'accepted', projectId, fixId: fix.id, engine: engineInfo.engine, at: new Date().toISOString() };
  const golden = state.golden.fixes[fix.id] || { successfulProjects: [], status: 'learning', engines: [] };
  if (!golden.successfulProjects.includes(projectId)) golden.successfulProjects.push(projectId);
  if (!golden.engines.includes(engineInfo.engine)) golden.engines.push(engineInfo.engine);
  if (golden.successfulProjects.length >= (config.golden?.minimumSuccessfulProjects || 3)) golden.status = 'golden';
  const decayDays = config.golden?.revalidateDays || 30; golden.updatedAt = new Date().toISOString(); golden.expiresAt = new Date(Date.now() + decayDays * 86400000).toISOString();
  state.golden.fixes[fix.id] = golden;
  const kind = fix.id === 'html-meta-viewport' ? 'requires-viewport' : fix.id === 'html-meta-charset' ? 'requires-charset' : null;
  if (kind && !state.regressions.rules.some(r => r.projectId === projectId && r.kind === kind)) state.regressions.rules.push({ id: stableHash(`${projectId}|${kind}`), projectId, kind, sourceFix: fix.id, createdAt: new Date().toISOString() });
}
function recordRejectedFix(state, projectId, fix, fingerprint, reason) { state.memory.attempts[fingerprint] = { status: 'rejected', projectId, fixId: fix.id, reason, at: new Date().toISOString() }; }

function renderWorkInProgress(run) {
  const changed = run.projects.filter(p => p.acceptedFixes.length > 0); const lines = ['# WORK IN PROGRESS — Quality Autopilot v3','',`Updated: ${run.finishedAt}`,`Mode: ${run.mode}`,`Projects scanned: ${run.projects.length}`,`Projects improved: ${changed.length}`,`Accepted fixes: ${run.summary.acceptedFixes}`,`Rejected fixes: ${run.summary.rejectedFixes}`,`Quality: ${run.summary.averageBefore}% → ${run.summary.averageAfter}%`,`Telemetry coverage: ${run.summary.telemetryCoverage}%`,'','## Improvements'];
  if (!changed.length) lines.push('- No repository changes accepted in this run.');
  for (const p of changed) lines.push(`- **${p.projectId}**: ${p.before.score}% → ${p.after.score}% (${p.acceptedFixes.map(f => f.id).join(', ')})`);
  lines.push('', '## Highest quality debt'); for (const d of (run.qualityDebt || []).slice(0, 12)) lines.push(`- ${d.projectId}: ${d.dimension}${d.issue ? `/${d.issue}` : ''} priority=${d.priority}`);
  lines.push('', '## Safety', '- Production/master is never edited directly.', '- All mutations are allow-listed and denylisted paths are immutable.', '- Candidate tournament tests variants in isolated copies and keeps only a non-regressing winner.', '- Existing repository verification is a hard gate and failed candidates are rolled back.', '- Live telemetry/canary controller blocks Full Autopilot when evidence is missing or worse.', '- Rejected fingerprints are never retried unchanged; successful fixes become regression rules and Golden knowledge.', '- Every run appends a tamper-evident hash-chain audit record.', '');
  return lines.join('\n');
}

function runAutopilot(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd()); const configPath = path.resolve(repoRoot, options.configPath || 'config/quality-autopilot.json'); const config = readJson(configPath, {}); const mode = options.mode || config.mode || 'observe'; const mutate = mode === 'candidate' || mode === 'full'; const state = loadState(repoRoot); const started = Date.now();
  const projects = discoverProjects(repoRoot, config).slice(0, config.budget?.maxProjectsPerRun || 20); const projectResults = []; const allSnapshots = new Map(); let stateChanged = false; let inspectedBytes = 0;

  for (const project of projects) {
    if ((Date.now() - started) / 1000 > (config.budget?.maxRuntimeSeconds || 900)) break;
    const bytes = project.files.filter(fs.existsSync).reduce((n, f) => n + fs.statSync(f).size, 0); inspectedBytes += bytes; if (inspectedBytes > (config.budget?.maxInspectedBytesPerRun || 512 * 1024 * 1024)) break;
    const before = analyzeProject(project, repoRoot, config, state.regressions.rules, state.globalKb); const result = { projectId: project.id, priority: project.priority, engine: before.engine, before, after: before, weakest: weakestDimension(before), target: nextQualityGoal(before.score, config.qualityGoals), acceptedFixes: [], rejectedFixes: [], skippedFixes: [], tournament: null };

    if (mutate) {
      const fixes = proposeSafeFixes(project, before, config, repoRoot).filter(f => {
        const g = state.golden.fixes[f.id]; return !g || g.status !== 'golden' || goldenCompatible(g, before.engine);
      });
      const tournament = tournamentSafeFixes(project, before, fixes, repoRoot, config, state.regressions.rules); result.tournament = { winner: tournament.winner?.id || null, ranked: tournament.ranked.map(c => ({ id: c.id, score: c.score, regression: c.regression })), pareto: tournament.pareto.map(c => c.id) };
      const winnerIds = new Set(tournament.winner?.fixes || []);
      for (const fix of fixes) {
        if (!winnerIds.has(fix.id)) { result.skippedFixes.push({ id: fix.id, reason: tournament.winner ? 'not-tournament-winner' : 'no-safe-winner' }); continue; }
        const original = fs.readFileSync(fix.file, 'utf8'); const fingerprint = fixFingerprint(project.id, fix.id, path.relative(repoRoot, fix.file), original);
        if (state.memory.attempts[fingerprint]?.status === 'rejected') { result.skippedFixes.push({ id: fix.id, reason: 'never-retry-bad-fix' }); continue; }
        if (!allSnapshots.has(fix.file)) allSnapshots.set(fix.file, original);
        const applied = applySafeFix(fix); if (!applied.changed) continue;
        project.files = walk(project.dir); const afterFix = analyzeProject(project, repoRoot, config, state.regressions.rules, state.globalKb); const regression = protectedWorsened(result.after, afterFix, config);
        if (regression) { fs.writeFileSync(fix.file, original); recordRejectedFix(state, project.id, fix, fingerprint, regression); stateChanged = true; result.rejectedFixes.push({ id: fix.id, reason: regression }); }
        else { recordSuccessfulFix(state, project.id, fix, fingerprint, config, before.engine); stateChanged = true; result.acceptedFixes.push({ id: fix.id, file: path.relative(repoRoot, fix.file), description: fix.description, fingerprint }); result.after = afterFix; }
      }
    }
    projectResults.push(result);
  }

  let verification = [];
  if (mutate && options.verify && projectResults.some(p => p.acceptedFixes.length)) {
    verification = runVerificationCommands(repoRoot, config.verificationCommands || [], config.verification?.retries ?? 1);
    if (verification.some(v => !v.ok)) {
      for (const [file, content] of allSnapshots) fs.writeFileSync(file, content);
      for (const p of projectResults) { for (const fix of p.acceptedFixes) recordRejectedFix(state, p.projectId, { id: fix.id }, fix.fingerprint, 'verification-gate-failed'); p.rejectedFixes.push(...p.acceptedFixes.map(f => ({ id: f.id, reason: 'verification-gate-failed' }))); p.acceptedFixes = []; const project = projects.find(x => x.id === p.projectId); project.files = walk(project.dir); p.after = analyzeProject(project, repoRoot, config, state.regressions.rules, state.globalKb); }
      stateChanged = true;
    }
  }

  const failureEvents = projectResults.flatMap(p => [...p.after.syntaxErrors.map(e => ({ ...e, projectId: p.projectId })), ...p.rejectedFixes.map(e => ({ kind: 'rejected-fix', projectId: p.projectId, message: `${e.id}:${e.reason}`, signature: `${e.id}:${e.reason}` }))]);
  const productionErrors = readJson(path.join(state.base, 'production-errors.json'), { events: [] }).events || [];
  for (const event of productionErrors) {
    if (!event.sourcePattern) continue;
    const pr = projectResults.find(p => p.projectId === event.projectId);
    upsertRule(state.globalKb, event, pr?.engine || { engine: 'generic', version: 'unknown' }, 'blocked'); stateChanged = true;
  }
  const rootCauses = clusterFailures([...(state.failureEvents.events || []).slice(-500), ...failureEvents, ...productionErrors.slice(-200)]);
  state.failureEvents.events = [...(state.failureEvents.events || []), ...failureEvents].slice(-1000);
  const qualityDebt = mergeDebt(state.debt.items || [], projectResults.flatMap(debtFromAnalysis)); state.debt.items = qualityDebt;
  if (mutate && stateChanged && options.writeState !== false) saveState(state);

  const finishedAt = new Date().toISOString(); const telemetryCoverage = projectResults.length ? Math.round(projectResults.reduce((n, p) => n + (p.after.telemetry?.gate?.coverage || 0), 0) / projectResults.length) : 0;
  const run = { version: 3, mode, startedAt: new Date(started).toISOString(), finishedAt, verification, projects: projectResults, rootCauses: rootCauses.slice(0, 20), qualityDebt: qualityDebt.slice(0, 100), summary: { scanned: projectResults.length, improved: projectResults.filter(p => p.acceptedFixes.length).length, acceptedFixes: projectResults.reduce((n, p) => n + p.acceptedFixes.length, 0), rejectedFixes: projectResults.reduce((n, p) => n + p.rejectedFixes.length, 0), averageBefore: projectResults.length ? Math.round(projectResults.reduce((n, p) => n + p.before.score, 0) / projectResults.length) : 0, averageAfter: projectResults.length ? Math.round(projectResults.reduce((n, p) => n + p.after.score, 0) / projectResults.length) : 0, telemetryCoverage, inspectedBytes } };

  if (options.reportPath) writeJson(path.resolve(repoRoot, options.reportPath), run);
  if (mutate && run.summary.acceptedFixes > 0 && options.writeWip !== false) fs.writeFileSync(path.join(repoRoot, 'WORK_IN_PROGRESS.md'), renderWorkInProgress(run));
  if (options.compileRegressions) compileRegressionTests(repoRoot, productionErrors);
  if (options.writeAudit !== false) appendAudit(repoRoot, { type: 'quality-run', mode, summary: run.summary, rootCauseIds: run.rootCauses.map(x => x.id) });
  return run;
}

module.exports = { analyzeProject, applySafeFix, discoverProjects, nextQualityGoal, protectedWorsened, proposeSafeFixes, runAutopilot, tournamentSafeFixes, weakestDimension };
