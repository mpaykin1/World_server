#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = 'mpaykin1/World_server';
const DEFAULT_ISSUE = 80;
const DEFAULT_API_BASE = 'https://api.github.com';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VERDICT_ACCEPTED = 'READY_FOR_OCEAN';
const MAX_PAGES = 10;
const FETCH_TIMEOUT_MS = 30000;

const RULES = {
  NO_CERT_FOUND: 'NO_CERT_FOUND',
  SKIPPED_OR_INVALID_CERT: 'SKIPPED_OR_INVALID_CERT',
  EXACT_SHA_MISMATCH: 'EXACT_SHA_MISMATCH',
  PR_MISMATCH: 'PR_MISMATCH',
  VERDICT_NOT_READY_FOR_OCEAN: 'VERDICT_NOT_READY_FOR_OCEAN',
  STALE_CERTIFICATE: 'STALE_CERTIFICATE',
  AMBIGUOUS_CERT: 'AMBIGUOUS_CERT',
  CERT_SOURCE_UNAVAILABLE: 'CERT_SOURCE_UNAVAILABLE',
  CERT_FILE_NOT_AUTHORITATIVE: 'CERT_FILE_NOT_AUTHORITATIVE',
  FRESH_EXACT_SHA_CERTIFICATE: 'FRESH_EXACT_SHA_CERTIFICATE'
};

function normalizeSha(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isHex40(value) {
  return /^[0-9a-f]{40}$/.test(normalizeSha(value));
}

function parseCertFromComment(body, createdAt, sourceId) {
  const text = String(body ?? '');
  const marker = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-fA-F]{40})\]/.exec(text);
  if (!marker) return [];
  const pr = Number(marker[1]);
  const exactHeadSha = normalizeSha(marker[2]);
  const verdictMatch = /READY_FOR_OCEAN\s*=\s*(YES|NO)/.exec(text);
  const verdict = verdictMatch ? verdictMatch[1] : '';
  const parsedAt = Date.parse(createdAt || '');
  return [{
    certificate: 'FLEET_PRE',
    pr,
    exactHeadSha,
    verdict,
    verifiedAt: Number.isFinite(parsedAt) ? parsedAt : null,
    sourceId: sourceId || `issue-${DEFAULT_ISSUE}`
  }];
}

function extractCertRecords(comments) {
  const records = [];
  for (const comment of Array.isArray(comments) ? comments : []) {
    for (const record of parseCertFromComment(comment.body, comment.created_at, comment.sourceId)) {
      records.push(record);
    }
  }
  return records;
}

function validateCertificates({ records, expectedSha, pr = null, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS }) {
  const expected = normalizeSha(expectedSha);
  if (!Array.isArray(records) || records.length === 0) {
    return { ok: false, reason: RULES.NO_CERT_FOUND };
  }

  const clean = [];
  for (const record of records) {
    const sha = normalizeSha(record && record.exactHeadSha);
    const verdict = String(record && record.verdict !== undefined ? record.verdict : '').trim();
    const verifiedAt = Number(record && record.verifiedAt);
    if (!record || sha.length !== 40 || verdict === '' || !Number.isFinite(verifiedAt)) {
      return { ok: false, reason: RULES.SKIPPED_OR_INVALID_CERT, record };
    }
    clean.push({ ...record, exactHeadSha: sha, verdict, verifiedAt });
  }

  const shaMatches = clean.filter((r) => r.exactHeadSha === expected);
  if (shaMatches.length === 0) {
    return { ok: false, reason: RULES.EXACT_SHA_MISMATCH };
  }
  const matches = pr == null ? shaMatches : shaMatches.filter((r) => r.pr === pr);
  if (matches.length === 0) {
    return { ok: false, reason: RULES.PR_MISMATCH, records: shaMatches };
  }

  const byTime = new Map();
  for (const record of matches) {
    const time = record.verifiedAt;
    if (!byTime.has(time)) byTime.set(time, []);
    byTime.get(time).push(record);
  }
  for (const group of byTime.values()) {
    const verdicts = new Set(group.map((r) => r.verdict));
    if (verdicts.size > 1) {
      return { ok: false, reason: RULES.AMBIGUOUS_CERT, records: group };
    }
  }

  const newest = matches.reduce((best, r) => (r.verifiedAt > best.verifiedAt ? r : best), matches[0]);
  if (newest.verdict !== VERDICT_ACCEPTED) {
    return { ok: false, reason: RULES.VERDICT_NOT_READY_FOR_OCEAN, record: newest };
  }
  const ageMs = now - newest.verifiedAt;
  if (ageMs > maxAgeMs) {
    return { ok: false, reason: RULES.STALE_CERTIFICATE, record: newest, ageMs };
  }

  return { ok: true, reason: RULES.FRESH_EXACT_SHA_CERTIFICATE, record: newest };
}

async function fetchComments({ repo = REPO, issue = DEFAULT_ISSUE, apiBase = DEFAULT_API_BASE, token = null, maxPages = MAX_PAGES } = {}) {
  const authToken = token || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const headers = { accept: 'application/vnd.github+json', 'user-agent': `world-server-fleet-pre-certificate (${repo})` };
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const all = [];
  let page = 1;
  try {
    while (page <= maxPages) {
      const url = new URL(`${apiBase}/repos/${repo}/issues/${issue}/comments`);
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(url, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      const comments = await response.json();
      if (!Array.isArray(comments)) {
        throw new Error(`comments response for ${url} is not an array`);
      }
      all.push(...comments.map((c) => ({ body: c.body, created_at: c.created_at })));
      if (comments.length < 100) break;
      page += 1;
    }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error), comments: all };
  }
  return { ok: true, comments: all };
}

function parseArgs(argv) {
  const sha = normalizeSha(argv[0] ?? '');
  const options = {
    pr: null,
    maxAgeMs: DEFAULT_MAX_AGE_MS,
    apiBase: DEFAULT_API_BASE,
    issue: DEFAULT_ISSUE,
    repo: REPO
  };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextValue = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === '--pr') options.pr = Number(nextValue());
    else if (arg === '--max-age-hours') options.maxAgeMs = Number(nextValue()) * 60 * 60 * 1000;
    else if (arg === '--api-base') options.apiBase = nextValue();
    else if (arg === '--issue') options.issue = Number(nextValue());
    else if (arg === '--repo') options.repo = nextValue();
    else throw new Error(`unknown argument: ${arg}`);
  }
  return { sha, options };
}

async function run(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(`usage error: ${(error && error.message) || error}`);
    return 2;
  }
  const { sha, options } = parsed;
  if (!isHex40(sha)) {
    console.error('usage: node scripts/check-fleet-pre-certificate.cjs <headSha(40hex)> --pr <n> [--max-age-hours <n>] [--api-base <url>] [--issue <n>] [--repo <org/repo>]');
    return 2;
  }
  if (!Number.isInteger(options.pr) || options.pr <= 0) {
    console.error('--pr <positive integer> is required and must match the PR that owns the exact head SHA.');
    return 2;
  }

  const fetched = await fetchComments(options);
  if (!fetched.ok) {
    console.error(`[FLEET-PRE-MERGE-CHAIN] BLOCKED: ${RULES.CERT_SOURCE_UNAVAILABLE} (${fetched.error})`);
    return 1;
  }
  const records = extractCertRecords(fetched.comments || []);

  const certFile = path.join(process.cwd(), 'data', 'fleet-pre-certificates', `${sha}.json`);
  if (records.length === 0 && fs.existsSync(certFile)) {
    console.error(`[FLEET-PRE-MERGE-CHAIN] BLOCKED: ${RULES.CERT_FILE_NOT_AUTHORITATIVE}; checked-in ${certFile} is not authoritative on its own — only Fleet PRE issue #${options.issue} comments certify.`);
    return 1;
  }

  const result = validateCertificates({ records, expectedSha: sha, pr: options.pr, maxAgeMs: options.maxAgeMs });
  if (!result.ok) {
    const detail = result.record ? ` head=${sha} verdict=${result.record.verdict} source=${result.record.sourceId}` : ` head=${sha}`;
    console.error(`[FLEET-PRE-MERGE-CHAIN] BLOCKED: ${result.reason}${detail}`);
    return 1;
  }
  console.log(`[FLEET-PRE-MERGE-CHAIN] PASS: ${result.reason} head=${sha} pr=${options.pr} verifiedAt=${new Date(result.record.verifiedAt).toISOString()} source=${result.record.sourceId}`);
  return 0;
}

async function main() {
  process.exitCode = await run(process.argv.slice(2));
}

if (require.main === module) {
  main();
}

module.exports = {
  RULES,
  REPO,
  DEFAULT_ISSUE,
  DEFAULT_API_BASE,
  DEFAULT_MAX_AGE_MS,
  VERDICT_ACCEPTED,
  normalizeSha,
  isHex40,
  parseCertFromComment,
  extractCertRecords,
  validateCertificates,
  fetchComments,
  parseArgs,
  run
};