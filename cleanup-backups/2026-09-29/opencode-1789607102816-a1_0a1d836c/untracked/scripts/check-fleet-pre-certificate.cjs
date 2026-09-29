'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const SHA1_RE = /^[0-9a-f]{40}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const VERDICT_OK = 'READY_FOR_OCEAN';
const CERT_MARKER = 'FLEET_PRE';
const HEADER_RE = /^\[FLEET\]\[PRE_INTEGRATION_QA\](?:\[PR[^\]]*\])+\[EXACT_HEAD_([0-9a-fA-F]{40})\]/;
const READY_RE = /READY_FOR_OCEAN=(YES|NO)/;
const VERIFIED_AT_RE = /verifiedAt\s*[:=]\s*["']?([0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?(?:Z|[+-][0-9]{2}:?[0-9]{2})?)/i;

const BLOCKING_RULES = new Set([
  'sha-mismatch',
  'verdict',
  'stale',
  'future',
  'schema',
  'fingerprint',
  'empty',
  'ambiguous'
]);

function certificateFingerprint(cert) {
  const basis = [
    String(cert.certificate || ''),
    String(cert.pr || ''),
    String(cert.exactHeadSha || '').toLowerCase(),
    String(cert.verdict || ''),
    String(cert.verifiedAt || '')
  ];
  return crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex');
}

function normalizeCert(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, rule: 'schema', reason: 'certificate source is empty or not an object' };
  }
  if (raw.certificate !== CERT_MARKER) {
    return { ok: false, rule: 'schema', reason: 'certificate marker is not FLEET_PRE' };
  }
  if (raw.pr === undefined || raw.pr === null || String(raw.pr).trim() === '') {
    return { ok: false, rule: 'schema', reason: 'certificate is missing its PR number' };
  }
  if (typeof raw.exactHeadSha !== 'string' || !SHA1_RE.test(raw.exactHeadSha)) {
    return { ok: false, rule: 'schema', reason: 'exactHeadSha is not a 40-hex commit sha' };
  }
  if (raw.verdict !== VERDICT_OK) {
    return { ok: false, rule: 'schema', reason: `verdict is not ${VERDICT_OK}` };
  }
  const verifiedAtMs = Date.parse(raw.verifiedAt);
  if (Number.isNaN(verifiedAtMs)) {
    return { ok: false, rule: 'schema', reason: 'verifiedAt is not a parseable timestamp' };
  }
  if (typeof raw.canonicalSha256 !== 'string' || !SHA256_RE.test(raw.canonicalSha256)) {
    return { ok: false, rule: 'fingerprint', reason: 'canonicalSha256 is missing or not 64-hex' };
  }
  const fingerprint = certificateFingerprint(raw);
  if (raw.canonicalSha256.toLowerCase() !== fingerprint) {
    return { ok: false, rule: 'fingerprint', reason: 'canonicalSha256 does not match the certificate fields' };
  }
  const cert = {
    certificate: CERT_MARKER,
    pr: String(raw.pr),
    exactHeadSha: String(raw.exactHeadSha).toLowerCase(),
    verdict: VERDICT_OK,
    verifiedAt: String(raw.verifiedAt),
    canonicalSha256: fingerprint,
    verifiedAtMs,
    fingerprint
  };
  return { ok: true, rule: 'ok', cert };
}

function evaluateCertificate(cert, options = {}) {
  const headSha = String(options.headSha || '').toLowerCase();
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_MAX_AGE_MS;
  if (!cert || typeof cert !== 'object') {
    return { ok: false, rule: 'empty', reason: 'no certificate supplied' };
  }
  if (!SHA1_RE.test(headSha)) {
    return { ok: false, rule: 'schema', reason: 'PR head sha is not a 40-hex commit sha' };
  }
  if (String(cert.exactHeadSha || '').toLowerCase() !== headSha) {
    return { ok: false, rule: 'sha-mismatch', reason: `exactHeadSha ${cert.exactHeadSha} != PR head ${headSha}` };
  }
  if (cert.verdict !== VERDICT_OK) {
    return { ok: false, rule: 'verdict', reason: `verdict ${cert.verdict} != ${VERDICT_OK}` };
  }
  const verifiedAtMs = Number.isFinite(cert.verifiedAtMs) ? cert.verifiedAtMs : Date.parse(cert.verifiedAt);
  if (Number.isNaN(verifiedAtMs)) {
    return { ok: false, rule: 'schema', reason: 'verifiedAt is not a parseable timestamp' };
  }
  if (verifiedAtMs > nowMs + FUTURE_TOLERANCE_MS) {
    return { ok: false, rule: 'future', reason: 'certificate verifiedAt is in the future' };
  }
  if (nowMs - verifiedAtMs > maxAgeMs) {
    return { ok: false, rule: 'stale', reason: `certificate older than ${maxAgeMs}ms` };
  }
  if (cert.canonicalSha256 && certificateFingerprint(cert) !== cert.canonicalSha256) {
    return { ok: false, rule: 'fingerprint', reason: 'canonicalSha256 does not match the certificate fields' };
  }
  return { ok: true, rule: 'ok', reason: 'exact fresh Fleet PRE READY_FOR_OCEAN certificate', cert };
}

function scanIssue80Comments(text, headSha) {
  const targetHead = String(headSha).toLowerCase();
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return { ok: false, rule: 'source-unavailable', reason: 'issue #80 text source unavailable' };
  }
  const candidates = [];
  const bodies = String(text).split(/\r?\n(?=\[FLEET\]\[PRE_INTEGRATION_QA\])/);
  for (const body of bodies) {
    const header = HEADER_RE.exec(body);
    if (!header) continue;
    const exactHeadSha = header[1].toLowerCase();
    if (exactHeadSha !== targetHead) continue;
    const ready = READY_RE.exec(body);
    if (!ready || ready[1] !== 'YES') continue;
    const timestamp = VERIFIED_AT_RE.exec(body);
    if (!timestamp) continue;
    const verifiedAt = timestamp[1].trim();
    const pr = (/\[PR[_:]?(#?\d+)\]/i.exec(body) || [])[1];
    if (!pr) continue;
    const raw = { certificate: CERT_MARKER, pr, exactHeadSha, verdict: VERDICT_OK, verifiedAt };
    raw.canonicalSha256 = certificateFingerprint(raw);
    const normalized = normalizeCert(raw);
    if (normalized.ok) candidates.push(normalized.cert);
  }
  return { ok: true, candidates };
}

function selectVerdict(results) {
  const list = Array.isArray(results) ? results : [];
  const blockers = list.filter((r) => r && r.ok === false && BLOCKING_RULES.has(r.rule));
  if (blockers.length > 0) {
    return { ok: false, rule: blockers[0].rule, blocked: true, reason: blockers.map((r) => r.reason).join(' | ') };
  }
  const valid = list.filter((r) => r && r.ok === true && r.cert);
  if (valid.length === 0) {
    const absent = list.map((r) => r && r.reason).filter(Boolean).join(' | ');
    return { ok: false, rule: 'source-unavailable', reason: `no exact fresh Fleet PRE certificate found${absent ? ` (${absent})` : ''}` };
  }
  const distinct = new Set(valid.map((r) => r.cert.fingerprint));
  if (distinct.size > 1) {
    return { ok: false, rule: 'ambiguous', blocked: true, reason: 'conflicting Fleet PRE certificates for the same exact head' };
  }
  return { ok: true, rule: 'ok', reason: 'PASS', cert: valid[0].cert };
}

function loadCertFileResult(filePath, options) {
  const source = `file:${path.resolve(filePath)}`;
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, rule: 'source-absent', reason: `no certificate file at ${source}`, source };
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, rule: 'empty', reason: `certificate file at ${source} is empty`, source };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, rule: 'schema', reason: `certificate file at ${source} is not valid JSON`, source };
  }
  const normalized = normalizeCert(parsed);
  if (!normalized.ok) return { ok: false, rule: normalized.rule, reason: `${normalized.reason} (${source})`, source };
  return { ...evaluateCertificate(normalized.cert, options), source, cert: normalized.cert };
}

function loadIssue80Result(text, options) {
  const scan = scanIssue80Comments(text, options.headSha);
  if (!scan.ok) return { ok: false, rule: scan.rule, reason: scan.reason, source: 'issue80' };
  if (scan.candidates.length === 0) {
    return { ok: false, rule: 'source-unavailable', reason: `no issue #80 comment attests EXACT_HEAD ${options.headSha} with READY_FOR_OCEAN=YES and verifiedAt`, source: 'issue80' };
  }
  const results = scan.candidates.map((cert) => ({ ...evaluateCertificate(cert, options), source: 'issue80', cert }));
  return { scan, results };
}

function parseArguments(argv) {
  const args = {
    headSha: '',
    maxAgeHours: DEFAULT_MAX_AGE_MS / (60 * 60 * 1000),
    source: 'auto',
    certDir: path.resolve(process.cwd(), 'data', 'fleet-pre-certificates'),
    certFiles: [],
    issue80TextFile: ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const value = () => argv[i + 1] !== undefined ? String(argv[i + 1]) : '';
    if (token === '--head') { args.headSha = value(); i += 1; }
    else if (token === '--max-age-hours') { args.maxAgeHours = Number(value()); i += 1; }
    else if (token === '--source') { args.source = value(); i += 1; }
    else if (token === '--cert-dir') { args.certDir = path.resolve(value()); i += 1; }
    else if (token === '--cert-file') { args.certFiles.push(path.resolve(value())); i += 1; }
    else if (token === '--issue80-text-file') { args.issue80TextFile = path.resolve(value()); i += 1; }
    else if (token === '--help' || token === '-h') { args.help = true; }
  }
  return args;
}

function run(args, env, out) {
  if (args.help || !SHA1_RE.test(String(args.headSha || ''))) {
    out(JSON.stringify({
      ok: false,
      usage: 'node scripts/check-fleet-pre-certificate.cjs --head <40-hex-sha> [--max-age-hours N] [--source auto|file|issue80] [--cert-dir DIR] [--cert-file FILE]... [--issue80-text-file FILE]'
    }, null, 2));
    return { ok: false, exit: 2 };
  }
  const headSha = String(args.headSha).toLowerCase();
  const maxAgeMs = Number.isFinite(args.maxAgeHours) && args.maxAgeHours > 0 ? args.maxAgeHours * 60 * 60 * 1000 : DEFAULT_MAX_AGE_MS;
  const options = { headSha, nowMs: Date.now(), maxAgeMs };
  const results = [];
  const sources = [];

  if (args.source === 'auto' || args.source === 'file') {
    const paths = new Set();
    for (const file of args.certFiles) paths.add(path.resolve(file));
    const defaultFile = path.join(args.certDir, `${headSha}.json`);
    if (fs.existsSync(defaultFile)) paths.add(defaultFile);
    for (const file of paths) {
      results.push(loadCertFileResult(file, options));
      sources.push(`file:${path.relative(process.cwd(), file) || file}`);
    }
  }

  if (args.source === 'auto' || args.source === 'issue80') {
    let text = env && env.FLEET_PRE_ISSUE80_TEXT ? env.FLEET_PRE_ISSUE80_TEXT : '';
    if (!text && args.issue80TextFile) {
      try { text = fs.readFileSync(args.issue80TextFile, 'utf8'); } catch {}
    }
    if (!text) {
      results.push({ ok: false, rule: 'source-unavailable', reason: 'issue #80 text source unavailable (provide --issue80-text-file or FLEET_PRE_ISSUE80_TEXT)', source: 'issue80' });
    } else {
      const loaded = loadIssue80Result(text, options);
      if (loaded.results) {
        results.push(...loaded.results);
      } else {
        results.push(loaded);
      }
    }
    sources.push('issue80');
  }

  const verdict = selectVerdict(results);
  const summary = {
    ok: verdict.ok,
    headSha,
    maxAgeMs,
    source: args.source,
    sources,
    reason: verdict.reason,
    cert: verdict.cert ? {
      certificate: verdict.cert.certificate,
      pr: verdict.cert.pr,
      exactHeadSha: verdict.cert.exactHeadSha,
      verdict: verdict.cert.verdict,
      verifiedAt: verdict.cert.verifiedAt,
      canonicalSha256: verdict.cert.canonicalSha256
    } : null
  };
  out(JSON.stringify(summary, null, 2));
  return { ok: verdict.ok, exit: verdict.ok ? 0 : 1 };
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  let message = '';
  const result = run(args, process.env, (chunk) => { message += chunk; });
  process.stdout.write(message);
  if (!result.ok) {
    try {
      const parsed = JSON.parse(message);
      if (parsed.reason) process.stderr.write(`[FLEET_PRE_MERGE_CHAIN] BLOCKED: ${parsed.reason}\n`);
    } catch {}
  }
  process.exit(result.exit);
}

if (require.main === module) main();

module.exports = {
  DEFAULT_MAX_AGE_MS,
  FUTURE_TOLERANCE_MS,
  BLOCKING_RULES,
  certificateFingerprint,
  normalizeCert,
  evaluateCertificate,
  scanIssue80Comments,
  selectVerdict,
  loadCertFileResult,
  loadIssue80Result,
  run
};