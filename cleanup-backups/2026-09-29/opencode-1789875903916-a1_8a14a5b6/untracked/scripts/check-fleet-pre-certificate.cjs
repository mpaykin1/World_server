'use strict';

/**
 * Fleet PRE exact-SHA certificate gate (GAP B).
 *
 * Fail-closed merge-chain guard that makes it impossible to integrate a PR
 * into master without an independent, fresh, exact-SHA `READY_FOR_OCEAN=YES`
 * certificate from the Fleet PRE_INTEGRATION_QA stage.
 *
 * Pure logic is exported via module.exports and separated from I/O so tests
 * can unit-test every fail-closed rule without a network or gh binary.
 */

const DEFAULT_MAX_AGE_HOURS = 24;
const ACCEPTED_VERDICT = 'READY_FOR_OCEAN';

const MARKER_RE = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-f]{40})\]/gi;
const VERDICT_RE = /READY_FOR_OCEAN\s*=\s*(YES|NO|SKIPPED)\b/i;

function normalizeHead(sha) {
  return String(sha || '').trim().toLowerCase();
}

/**
 * Extract certificate markers from a comment body.
 * Returns deterministic array of { pr, exactHeadSha, verdict } for every
 * `[FLEET][PRE_INTEGRATION_QA][PR_n][EXACT_HEAD_<fullsha>]` marker found.
 * Verdict is taken from the `READY_FOR_OCEAN=<value>` token in the same body.
 * A marker without an explicit verdict is treated as `skipped` and must BLOCK.
 */
function parseCertMarkers(body) {
  const out = [];
  const text = String(body || '');
  MARKER_RE.lastIndex = 0;
  let match;
  const verdictToken = VERDICT_RE.exec(text);
  const verdict = verdictToken
    ? (verdictToken[1] === 'YES' ? ACCEPTED_VERDICT : `NOT_${verdictToken[1]}`)
    : 'SKIPPED';
  while ((match = MARKER_RE.exec(text)) !== null) {
    out.push({
      pr: Number(match[1]),
      exactHeadSha: normalizeHead(match[2]),
      verdict
    });
  }
  return out;
}

/**
 * Evaluate the fail-closed certificate matrix.
 *
 * @param {object} opts
 * @param {string} opts.expectedHeadSha - exact PR head (40 hex lowercase)
 * @param {number|string} opts.expectedPr - PR number
 * @param {number} opts.maxAgeHours - freshness window (default 24)
 * @param {Array} opts.certs - parsed candidate certificates:
 *    [{ pr, exactHeadSha, verdict, createdAtMs, source }]
 * @param {number} [opts.nowMs] - injectable clock for deterministic tests
 *
 * @returns {{pass:boolean, block:string, code:string, reasons:string[], matched:Array}}
 *   block: one of no-source | head-mismatch | verdict-mismatch | skipped-empty |
 *   stale | no-timestamp | ambiguous; '' when pass.
 */
function evaluateCertificates({ expectedHeadSha, expectedPr, maxAgeHours, certs, nowMs }) {
  const reasons = [];
  const maxAgeHoursEffective = Number.isFinite(Number(maxAgeHours)) && Number(maxAgeHours) > 0
    ? Number(maxAgeHours)
    : DEFAULT_MAX_AGE_HOURS;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const target = normalizeHead(expectedHeadSha);
  const targetPr = Number(expectedPr);
  const list = Array.isArray(certs) ? certs : [];

  if (!target || !/^[0-9a-f]{40}$/.test(target)) {
    return { pass: false, block: 'head-mismatch', code: 'INVALID_EXPECTED_HEAD', reasons: ['expected head SHA is missing or malformed'], matched: [] };
  }

  if (list.length === 0) {
    return { pass: false, block: 'no-source', code: 'NO_CERT_SOURCE', reasons: ['no certificate source provided or both sources unavailable/empty'], matched: [] };
  }

  const matching = list
    .filter((c) => c && normalizeHead(c.exactHeadSha) === target && Number(c.pr) === targetPr)
    .sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0) || String(a.source || '').localeCompare(String(b.source || '')));

  if (matching.length === 0) {
    const anyOtherHead = list.some((c) => normalizeHead(c.exactHeadSha) === target);
    reasons.push(anyOtherHead
      ? `certificates exist for head ${target} but none for PR #${targetPr}`
      : `no certificate found for exact head ${target} (PR #${targetPr})`);
    return { pass: false, block: 'head-mismatch', code: 'EXACT_HEAD_MISMATCH', reasons, matched: [] };
  }

  const skippedEmpty = matching.filter((c) => !c.verdict || c.verdict === 'SKIPPED' || c.verdict === 'NO' || c.verdict === 'NOT_NO');
  if (skippedEmpty.length > 0) {
    reasons.push(`certificate present but skipped/empty/negative (${skippedEmpty[0].verdict}, source=${skippedEmpty[0].source})`);
    return { pass: false, block: 'skipped-empty', code: 'CERT_SKIPPED_OR_EMPTY', reasons, matched: skippedEmpty };
  }

  const verdictMismatch = matching.filter((c) => c.verdict !== ACCEPTED_VERDICT);
  if (verdictMismatch.length > 0) {
    reasons.push(`certificate verdict is not ${ACCEPTED_VERDICT} (got ${verdictMismatch[0].verdict}, source=${verdictMismatch[0].source})`);
    return { pass: false, block: 'verdict-mismatch', code: 'VERDICT_NOT_READY_FOR_OCEAN', reasons, matched: verdictMismatch };
  }

  const noTimestamp = matching.filter((c) => !Number.isFinite(c.createdAtMs) || c.createdAtMs <= 0);
  if (noTimestamp.length > 0) {
    reasons.push(`certificate has no usable timestamp (source=${noTimestamp[0].source})`);
    return { pass: false, block: 'no-timestamp', code: 'CERT_NO_TIMESTAMP', reasons, matched: noTimestamp };
  }

  const stale = matching.filter((c) => (now - c.createdAtMs) > maxAgeHoursEffective * 3600 * 1000);
  if (stale.length > 0) {
    const ageHours = (now - stale[0].createdAtMs) / 3600 / 1000;
    reasons.push(`certificate older than ${maxAgeHoursEffective}h (age ~${ageHours.toFixed(2)}h, source=${stale[0].source})`);
    return { pass: false, block: 'stale', code: 'CERT_STALE', reasons, matched: stale };
  }

  const future = matching.filter((c) => c.createdAtMs > now + 60 * 60 * 1000);
  if (future.length > 0) {
    reasons.push(`certificate timestamp is implausibly in the future (source=${future[0].source})`);
    return { pass: false, block: 'no-timestamp', code: 'CERT_FUTURE_TIMESTAMP', reasons, matched: future };
  }

  const distinctSources = new Set(matching.map((c) => c.source));
  if (distinctSources.size > 1) {
    reasons.push(`multiple independent sources found for the same PR/head (${[...distinctSources].sort().join(', ')}); treat as ambiguous`);
    return { pass: false, block: 'ambiguous', code: 'MULTIPLE_SOURCES_AMBIGUOUS', reasons, matched: matching };
  }

  return {
    pass: true,
    block: '',
    code: 'PASS',
    reasons: [`exact fresh ${ACCEPTED_VERDICT} certificate found for head ${target} (PR #${targetPr}, source=${matching[0].source})`],
    matched: matching
  };
}

/**
 * Read checked-in secondary certificates from `data/fleet-pre-certificates/*.json`.
 * Schema (version 1):
 * {
 *   "format": "fleet-pre-certificate",
 *   "version": 1,
 *   "source": "issue-80-comment",
 *   "pr": 118,
 *   "headSha": "<40 hex full sha>",
 *   "verdict": "READY_FOR_OCEAN",
 *   "issuedAt": "2026-09-20T01:05:39Z",
 *   "commentId": 123
 * }
 * Returns [] when the directory is missing or unreadable (secondary only).
 */
function loadCheckedInCerts(dir) {
  const fs = require('fs');
  const path = require('path');
  const out = [];
  if (!dir) return out;
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return out;
  }
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (!raw || !raw.headSha || (raw.verdict || '') !== ACCEPTED_VERDICT) continue;
      out.push({
        pr: Number(raw.pr),
        exactHeadSha: normalizeHead(raw.headSha),
        verdict: raw.verdict,
        createdAtMs: Date.parse(String(raw.issuedAt || '')) || 0,
        source: String(raw.source || 'checked-in')
      });
    } catch {
      // malformed secondary file must not crash the gate, but it is not valid evidence
    }
  }
  return out;
}

/**
 * Fetch issue comments used as the authoritative cert source.
 * Uses the `gh` CLI (preinstalled on GitHub runners), never a raw token.
 * Returns [{ id, created_at, body }] or null when gh is unavailable/fails.
 */
function fetchIssueComments({ owner, repo, issue }) {
  const { spawnSync } = require('child_process');
  const args = ['api', `repos/${owner}/${repo}/issues/${issue}/comments`, '--paginate', '--jq', '.[] | {id, created_at, body}'];
  const res = spawnSync('gh', args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (res.status !== 0 || res.error) return null;
  const comments = [];
  for (const line of String(res.stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.body === 'string') comments.push({
        id: parsed.id,
        createdAtMs: Date.parse(String(parsed.created_at || '')) || 0,
        body: parsed.body
      });
    } catch {
      // ignore malformed line deterministically
    }
  }
  return comments;
}

function parseArgs(argv) {
  const out = { head: '', pr: 0, owner: '', repo: '', issue: 80, maxAgeHours: DEFAULT_MAX_AGE_HOURS, source: 'both' };
  const args = argv.slice(2);
  if (args[0] && !args[0].startsWith('--')) out.head = args[0];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const set = (name, fn) => {
      if (a === `--${name}`) { if (args[i + 1]) fn(args[++i]); }
      else if (a.startsWith(`--${name}=`)) fn(a.slice(`--${name}=`.length));
    };
    set('head', (v) => { out.head = v; });
    set('pr', (v) => { out.pr = Number(v); });
    set('owner', (v) => { out.owner = v; });
    set('repo', (v) => { out.repo = v; });
    set('issue', (v) => { out.issue = Number(v); });
    set('max-age-hours', (v) => { out.maxAgeHours = Number(v); });
    set('source', (v) => {
      if (v === 'gh' || v === 'files' || v === 'both') out.source = v;
    });
  }
  return out;
}

function formatReport(verdict, opts, certs) {
  const sources = new Set(certs.map((c) => c.source));
  return JSON.stringify({
    gate: 'fleet-pre-merge-chain',
    pass: verdict.pass,
    block: verdict.block || null,
    code: verdict.code,
    reasons: verdict.reasons,
    expectedHeadSha: normalizeHead(opts.head),
    expectedPr: opts.pr,
    maxAgeHours: opts.maxAgeHours,
    sources: [...sources].sort()
  }, null, 2);
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.head || !/^[0-9a-f]{40}$/i.test(opts.head) || !opts.pr) {
    console.error('[FLEET_PRE] usage: node scripts/check-fleet-pre-certificate.cjs <HEAD_SHA> --pr <PR_NUMBER> [--owner o] [--repo r] [--issue 80] [--max-age-hours 24] [--source gh|files|both]');
    process.exit(1);
  }

  const certs = [];
  const useGh = opts.source === 'gh' || opts.source === 'both';
  const useFiles = opts.source === 'files' || opts.source === 'both';
  const checkedInDir = require('path').resolve(__dirname, '../data/fleet-pre-certificates');

  if (useGh && opts.owner && opts.repo) {
    const comments = fetchIssueComments({ owner: opts.owner, repo: opts.repo, issue: opts.issue });
    if (comments) {
      for (const comment of comments) {
        for (const marker of parseCertMarkers(comment.body)) {
          certs.push({
            pr: marker.pr,
            exactHeadSha: marker.exactHeadSha,
            verdict: marker.verdict,
            createdAtMs: comment.createdAtMs,
            source: `issue-${opts.issue}:comment-${comment.id}`
          });
        }
      }
    }
  }
  if (useFiles) certs.push(...loadCheckedInCerts(checkedInDir));

  const verdict = evaluateCertificates({
    expectedHeadSha: opts.head,
    expectedPr: opts.pr,
    maxAgeHours: opts.maxAgeHours,
    certs,
    nowMs: Date.now()
  });

  const report = formatReport(verdict, opts, certs);
  if (verdict.pass) {
    console.log(`[FLEET_PRE] PASS ${verdict.code}`);
    console.log(report);
    process.exit(0);
  }
  console.error(`[FLEET_PRE] BLOCK ${verdict.code}: ${verdict.reasons.join('; ')}`);
  console.error(report);
  process.exit(1);
}

if (require.main === module) main();

module.exports = {
  DEFAULT_MAX_AGE_HOURS,
  ACCEPTED_VERDICT,
  normalizeHead,
  parseCertMarkers,
  evaluateCertificates,
  loadCheckedInCerts,
  parseArgs
};