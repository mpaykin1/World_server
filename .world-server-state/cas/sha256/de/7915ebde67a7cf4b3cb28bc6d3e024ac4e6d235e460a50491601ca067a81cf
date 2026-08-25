'use strict';

const fs = require('fs');
const path = require('path');
const { ENGINE_VERSION, parseChunks, analyzeApng, repairApng } = require('../lib/apng-engine');

const ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['apps', 'shared', 'assets', 'public'].map((p) => path.join(ROOT, p)).filter(fs.existsSync);
const APPLY = process.argv.includes('--apply');
const NORMALIZE_ALL = process.argv.includes('--normalize-all');
const FORCE_TEMPORAL = process.argv.includes('--temporal');
const STRICT_WARNINGS_FLAG = process.argv.includes('--strict-warnings');
const MAX_BYTES = Number(process.env.APNG_GATE_MAX_BYTES || 16 * 1024 * 1024);
const MAX_OUTPUT_BYTES = Number(process.env.APNG_GATE_MAX_OUTPUT_BYTES || 64 * 1024 * 1024);
const MAX_FRAMES = Number(process.env.APNG_MAX_FRAMES || 512);
const MAX_DECODED_BYTES = Number(process.env.APNG_MAX_DECODE_MB || 256) * 1024 * 1024;
const STRUCTURAL_CODES = new Set([
  'APNG_FRAME_COUNT_MISMATCH', 'APNG_BAD_DISPOSE', 'APNG_BAD_BLEND'
]);

function loadPolicy() {
  const file = path.join(ROOT, 'apng-quality.config.json');
  if (!fs.existsSync(file)) return { version: 1, defaults: {}, rules: [] };
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(config.rules)) throw new Error('APNG_POLICY_RULES_INVALID');
  return config;
}

const POLICY = loadPolicy();
const report = {
  version: 3,
  engineVersion: ENGINE_VERSION,
  apply: APPLY,
  normalizeAll: NORMALIZE_ALL,
  policyVersion: POLICY.version || 1,
  scanned: 0,
  png: 0,
  apng: 0,
  repaired: 0,
  normalized: 0,
  errors: 0,
  warnings: 0,
  remainingErrors: 0,
  remainingWarnings: 0,
  acceptedIntentionalIssues: 0,
  qualityScoreAverage: 100,
  failures: [],
  files: []
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, out);
    } else if (/\.(png|apng)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function globRegex(glob) {
  let out = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { out += '.*'; i += 1; }
    else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[\\^$+?.()|{}\[\]]/g, '\\$&');
  }
  return new RegExp(`${out}$`, 'i');
}

function policyFor(rel) {
  const merged = { ...(POLICY.defaults || {}) };
  const intentionalIssues = new Set(merged.intentionalIssues || []);
  for (const rule of POLICY.rules || []) {
    if (!rule || typeof rule.match !== 'string' || !globRegex(rule.match).test(rel)) continue;
    Object.assign(merged, rule);
    for (const code of rule.intentionalIssues || []) intentionalIssues.add(code);
  }
  merged.intentionalIssues = [...intentionalIssues];
  return merged;
}

function classifyIssues(issues, policy) {
  const intentionalCodes = new Set(policy.intentionalIssues || []);
  const active = [];
  const accepted = [];
  for (const issue of issues) {
    if (intentionalCodes.has(issue.code) && !STRUCTURAL_CODES.has(issue.code)) accepted.push({ ...issue, acceptedByPolicy: true });
    else active.push(issue);
  }
  return { active, accepted };
}

function isApng(buffer) {
  try { return parseChunks(buffer).some((chunk) => chunk.type === 'acTL'); }
  catch { return false; }
}

function atomicReplace(file, output) {
  const dir = path.dirname(file);
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const temp = path.join(dir, `.${path.basename(file)}.${token}.tmp`);
  const backup = path.join(dir, `.${path.basename(file)}.${token}.bak`);
  fs.writeFileSync(temp, output);
  let movedOriginal = false;
  try {
    fs.renameSync(file, backup); movedOriginal = true;
    fs.renameSync(temp, file);
    fs.unlinkSync(backup);
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
    try {
      if (movedOriginal && fs.existsSync(backup)) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        fs.renameSync(backup, file);
      }
    } catch {}
    throw error;
  }
}

const engineOptions = { maxFrames: MAX_FRAMES, maxDecodedBytes: MAX_DECODED_BYTES, maxOutputBytes: MAX_OUTPUT_BYTES };
const finalScores = [];

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    report.scanned += 1;
    const input = fs.readFileSync(file);
    if (!input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) continue;
    report.png += 1;
    if (!isApng(input)) continue;
    report.apng += 1;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const policy = policyFor(rel);
    if (input.length > MAX_BYTES) {
      report.failures.push({ file: rel, error: 'APNG_GATE_FILE_TOO_LARGE', bytes: input.length });
      continue;
    }

    try {
      const analysis = analyzeApng(input, engineOptions);
      const beforeClassified = classifyIssues(analysis.issues, policy);
      const errors = beforeClassified.active.filter((issue) => issue.severity === 'error');
      const warnings = beforeClassified.active.filter((issue) => issue.severity === 'warning');
      report.errors += errors.length;
      report.warnings += warnings.length;
      report.acceptedIntentionalIssues += beforeClassified.accepted.length;
      const codecRisk = analysis.issues.some((issue) => issue.code === 'APNG_CODEC_FLICKER_RISK');
      const entry = {
        file: rel,
        bytes: input.length,
        sha256: analysis.inputSha256,
        frames: analysis.frameCount,
        durationMs: analysis.durationMs,
        sourceBitDepth: analysis.codec.sourceBitDepth,
        sourceInterlacedAdam7: analysis.codec.sourceInterlacedAdam7,
        qualityScoreBefore: analysis.qualityScore,
        issues: beforeClassified.active,
        acceptedIntentionalIssues: beforeClassified.accepted,
        policy: {
          minConfidence: Number(policy.minConfidence ?? 0.94),
          allowTemporalRepair: policy.allowTemporalRepair !== false,
          sanitizeTransparentRgb: policy.sanitizeTransparentRgb !== false
        },
        repaired: false,
        normalized: false
      };

      const shouldRepair = APPLY && (errors.length > 0 || codecRisk || NORMALIZE_ALL || analysis.codec.sourceBitDepth === 16 || analysis.codec.sourceInterlacedAdam7);
      if (shouldRepair) {
        const allowTemporalRepair = FORCE_TEMPORAL || (policy.allowTemporalRepair !== false && errors.length > 0);
        const result = repairApng(input, {
          ...engineOptions,
          temporal: allowTemporalRepair,
          minConfidence: Number(policy.minConfidence ?? 0.94),
          sanitizeTransparentRgb: policy.sanitizeTransparentRgb !== false
        });
        atomicReplace(file, result.output);
        const finalAnalysis = analyzeApng(fs.readFileSync(file), engineOptions);
        const finalClassified = classifyIssues(finalAnalysis.issues, policy);
        const finalErrors = finalClassified.active.filter((issue) => issue.severity === 'error');
        if (finalErrors.length) throw new Error(`APNG_ATOMIC_VERIFY_FAILED:${finalErrors.map((i) => i.code).join(',')}`);
        entry.repaired = errors.length > 0;
        entry.normalized = true;
        entry.outputBytes = result.output.length;
        entry.outputSha256 = result.report.outputSha256;
        entry.actions = result.report.actions;
        entry.verify = { pixelExact: result.report.pixelExactToRepairTarget, timelineExact: result.report.timelineExact };
        entry.qualityScoreAfter = finalAnalysis.qualityScore;
        entry.issuesAfter = finalClassified.active;
        entry.acceptedIntentionalIssuesAfter = finalClassified.accepted;
        report.repaired += entry.repaired ? 1 : 0;
        report.normalized += 1;
        report.remainingErrors += finalErrors.length;
        report.remainingWarnings += finalClassified.active.filter((i) => i.severity === 'warning').length;
        finalScores.push(finalAnalysis.qualityScore);
      } else {
        entry.qualityScoreAfter = analysis.qualityScore;
        entry.issuesAfter = beforeClassified.active;
        report.remainingErrors += errors.length;
        report.remainingWarnings += warnings.length;
        finalScores.push(analysis.qualityScore);
        if (!APPLY && errors.length) report.failures.push({ file: rel, error: 'APNG_QUALITY_ERRORS', codes: errors.map((i) => i.code) });
      }
      report.files.push(entry);
    } catch (error) {
      report.failures.push({ file: rel, error: error.message || 'APNG_GATE_FAILED' });
    }
  }
}

report.qualityScoreAverage = finalScores.length ? Math.round((finalScores.reduce((a, b) => a + b, 0) / finalScores.length) * 100) / 100 : 100;
const strictWarnings = STRICT_WARNINGS_FLAG || POLICY.defaults?.strictWarnings === true;
if (strictWarnings && report.remainingWarnings) report.failures.push({ error: 'APNG_STRICT_WARNINGS_REMAIN', count: report.remainingWarnings });
fs.writeFileSync(path.join(ROOT, 'APNG_QUALITY_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[APNG v${ENGINE_VERSION}] scanned=${report.scanned} png=${report.png} apng=${report.apng} repaired=${report.repaired} normalized=${report.normalized} remainingErrors=${report.remainingErrors} remainingWarnings=${report.remainingWarnings} acceptedIntentional=${report.acceptedIntentionalIssues} avgScore=${report.qualityScoreAverage} failures=${report.failures.length}`);
if (report.failures.length) process.exitCode = 1;
