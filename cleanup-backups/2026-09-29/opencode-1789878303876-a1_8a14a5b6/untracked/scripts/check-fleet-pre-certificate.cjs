'use strict';

/**
 * Fleet PRE merge-chain gate — exact-SHA independent authorization.
 *
 * Pure Node, no runtime deps. Logic is separated from I/O so tests can drive
 * the evaluator directly. The authoritative certificate source is a scan of
 * issue #80 comments for the marker:
 *
 *   [FLEET][PRE_INTEGRATION_QA][PR_<n>][EXACT_HEAD_<40hex>]
 *
 * that also carries READY_FOR_OCEAN=YES. A checked-in
 * data/fleet-pre-certificates/ directory is an optional corroborating source
 * and can never grant a PASS on its own.
 *
 * Usage (I/O wrapper):
 *   node scripts/check-fleet-pre-certificate.cjs \
 *     --pr=123 \
 *     --head-sha=0123456789abcdef... \
 *     --issue-comments=fleet-pre-comments.json \
 *     [--data-dir=data/fleet-pre-certificates] \
 *     [--max-age-hours=24]
 *
 * Exit 0 = PASS (exact fresh READY_FOR_OCEAN cert in the authoritative source).
 * Exit 1 = fail-closed BLOCK with a machine-readable reason.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MARKER_RE = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-f]{40})\]/g;

const VERDICT_READY = 'READY_FOR_OCEAN';
const VERDICT_RETURN = 'RETURN_TO_BUILDER';
const VERDICT_BLOCKED = 'BLOCKED';
const VERDICT_UNKNOWN = 'UNKNOWN';

function cleanHeadSha(value) {
  if (typeof value !== 'string') return null;
  const sha = value.trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

function block(reason, extra = null) {
  return { ok: false, reason, cert: extra && extra.cert ? extra.cert : null };
}

function parseCertMarkers(text) {
  const certs = [];
  if (typeof text !== 'string') return certs;
  MARKER_RE.lastIndex = 0;
  let match;
  while ((match = MARKER_RE.exec(text)) !== null) {
    certs.push({ pr: Number(match[1]), exactHeadSha: match[2] });
  }
  return certs;
}

function extractVerdict(text) {
  if (typeof text !== 'string') return VERDICT_UNKNOWN;
  if (/RETURN_TO_BUILDER/i.test(text)) return VERDICT_RETURN;
  if (/VERDICT\s*[:=]\s*BLOCK/i.test(text)) return VERDICT_BLOCKED;
  if (/(?:READY_FOR_OCEAN|VERDICT)\s*=\s*YES/i.test(text)) return VERDICT_READY;
  if (/(?:READY_FOR_OCEAN|VERDICT)\s*=\s*NO/i.test(text)) return VERDICT_RETURN;
  return VERDICT_UNKNOWN;
}

function parseIssueComments(entries) {
  const certs = [];
  if (!Array.isArray(entries)) return certs;
  for (const entry of entries) {
    const body = entry && typeof entry.body === 'string' ? entry.body : '';
    const verifiedAt = entry && typeof entry.created_at === 'string' ? entry.created_at : null;
    const verdict = extractVerdict(body);
    for (const marker of parseCertMarkers(body)) {
      certs.push({
        pr: marker.pr,
        exactHeadSha: marker.exactHeadSha,
        verdict,
        verifiedAt,
        source: 'issue80'
      });
    }
  }
  return certs;
}

function parseDataCerts(records, sourceFile) {
  const syntax = { ok: false, records: [] };
  if (!Array.isArray(records)) {
    if (!records || typeof records !== 'object') return syntax;
    records = [records];
  }
  const source = sourceFile || 'data/fleet-pre-certificates';
  const certs = [];
  for (const record of records) {
    const sha = cleanHeadSha(record && record.exactHeadSha);
    if (!sha) continue;
    if (typeof record.pr !== 'number' && typeof record.pr !== 'string') continue;
    certs.push({
      pr: Number(record.pr),
      exactHeadSha: sha,
      verdict: extractVerdictPath(record),
      verifiedAt: record.verifiedAt || record.createdAt || null,
      source
    });
  }
  syntax.ok = true;
  syntax.records = certs;
  return syntax;
}

function extractVerdictPath(record) {
  if (record && typeof record.verdict === 'string') {
    const verdict = record.verdict.toUpperCase();
    if (verdict === VERDICT_READY || verdict === VERDICT_RETURN || verdict === VERDICT_BLOCKED) {
      return verdict;
    }
  }
  return VERDICT_UNKNOWN;
}

function evaluate(certs, dataCerts, options = {}) {
  const {
    pr = null,
    headSha = null,
    now = Date.now(),
    maxAgeMs = DEFAULT_MAX_AGE_MS
  } = options;

  const head = cleanHeadSha(headSha);
  if (!head) return block('BLOCKED_INVALID_HEAD');

  const hasAnySource = (Array.isArray(certs) && certs.length > 0) ||
    (Array.isArray(dataCerts) && dataCerts.length > 0);
  if (!hasAnySource) return block('BLOCKED_NO_SOURCE');

  if (!Array.isArray(certs) || certs.length === 0) {
    return block('BLOCKED_SOURCE_UNAVAILABLE');
  }

  const primary = certs.filter(c => c.exactHeadSha === head && (pr === null || c.pr === pr));
  if (primary.length === 0) {
    const anyForPr = certs.filter(c => pr === null || c.pr === pr);
    return block(anyForPr.length > 0 ? 'BLOCKED_SHA_MISMATCH' : 'BLOCKED_NO_EXACT_CERT');
  }

  const negative = primary.filter(c => c.verdict === VERDICT_RETURN || c.verdict === VERDICT_BLOCKED);
  const ready = primary.filter(c => c.verdict === VERDICT_READY);
  if (negative.length > 0) {
    return block(ready.length > 0 ? 'BLOCKED_AMBIGUOUS' : 'BLOCKED_VERDICT');
  }
  if (ready.length === 0) return block('BLOCKED_SKIPPED_EMPTY');

  if (Array.isArray(dataCerts)) {
    const dataExact = dataCerts.filter(c => c.exactHeadSha === head && (pr === null || c.pr === pr));
    const dataNegative = dataExact.filter(c => c.verdict === VERDICT_RETURN || c.verdict === VERDICT_BLOCKED);
    if (dataNegative.length > 0) return block('BLOCKED_AMBIGUOUS');
  }

  const sorted = ready.slice().sort((a, b) => {
    const ta = new Date(a.verifiedAt).getTime() || 0;
    const tb = new Date(b.verifiedAt).getTime() || 0;
    return tb - ta || String(a.source).localeCompare(String(b.source)) || a.pr - b.pr;
  });
  const freshest = sorted[0];
  if (typeof freshest.verifiedAt !== 'string' || freshest.verifiedAt.length === 0) {
    return block('BLOCKED_SKIPPED_EMPTY');
  }
  const verified = new Date(freshest.verifiedAt).getTime();
  if (!Number.isFinite(verified)) return block('BLOCKED_SKIPPED_EMPTY');
  if (now - verified > maxAgeMs) return block('BLOCKED_STALE');
  return { ok: true, verdict: VERDICT_READY, cert: freshest, ageMs: now - verified };
}

function parseArgs(argv) {
  const args = {};
  for (const part of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(part);
    if (!match) continue;
    args[match[1]] = match[2];
  }
  return args;
}

function readIssueComments(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text);
}

function readDataDir(dir) {
  const certs = [];
  if (!dir || !fs.existsSync(dir)) return { ok: true, records: certs, dir };
  let files;
  try {
    files = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
  } catch {
    return { ok: true, records: certs, dir };
  }
  for (const name of files) {
    const full = path.join(dir, name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {
      continue;
    }
    const result = parseDataCerts(parsed, path.join('data', 'fleet-pre-certificates', name));
    if (result.ok) certs.push(...result.records);
  }
  return { ok: true, records: certs, dir };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pr = args.pr != null && args.pr !== '' ? Number(args.pr) : null;
  if (pr != null && !Number.isFinite(pr)) {
    console.error('[FLEET_PRE_GATE] BLOCKED_INVALID_PR: --pr must be a number');
    process.exit(1);
  }
  const headSha = cleanHeadSha(args['head-sha']);
  if (!headSha) {
    console.error('[FLEET_PRE_GATE] BLOCKED_INVALID_HEAD: --head-sha must be a 40-char Git SHA');
    process.exit(1);
  }
  const commentsFile = args['issue-comments'] || args['comments-file'];
  if (!commentsFile || !fs.existsSync(commentsFile)) {
    console.error('[FLEET_PRE_GATE] BLOCKED_SOURCE_UNAVAILABLE: no issue comments file at ' + (commentsFile || '(none)'));
    process.exit(1);
  }
  const maxAgeHours = Number(args['max-age-hours']) > 0 ? Number(args['max-age-hours']) : 24;
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const dataDir = args['data-dir'] || path.join(__dirname, '..', 'data', 'fleet-pre-certificates');

  let entries;
  try {
    entries = readIssueComments(commentsFile);
  } catch (error) {
    console.error('[FLEET_PRE_GATE] BLOCKED_SOURCE_UNAVAILABLE: cannot parse issue comments: ' + error.message);
    process.exit(1);
  }
  const data = readDataDir(dataDir);

  const result = evaluate(parseIssueComments(entries), data.records, { pr, headSha, now: Date.now(), maxAgeMs });
  if (result.ok) {
    console.log(`[FLEET_PRE_GATE] PASS: exact fresh READY_FOR_OCEAN cert for PR ${pr} head ${headSha.slice(0, 12)}`);
    process.exit(0);
  }
  console.error(`[FLEET_PRE_GATE] BLOCK: ${result.reason} for PR ${pr} head ${headSha.slice(0, 12)}`);
  process.exit(1);
}

module.exports = {
  cleanHeadSha,
  parseCertMarkers,
  extractVerdict,
  parseIssueComments,
  parseDataCerts,
  evaluate,
  block,
  VERDICT_READY,
  VERDICT_RETURN,
  VERDICT_BLOCKED,
  VERDICT_UNKNOWN,
  DEFAULT_MAX_AGE_MS,
  parseArgs
};

if (require.main === module) main();