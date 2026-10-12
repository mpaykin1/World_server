#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const MARK = '[TASK_INTEGRITY_EVENT_V1]';
const ALERT = '[TASK_INTEGRITY_ALERT_V1]';
const LANES = ['CLEAN_SERVER', 'GRAPHICS-DEMO-001'];
const KINDS = new Set(['code', 'playable', 'fix', 'pr_closed', 'regression']);
const WINDOW_MS = 4 * 60 * 60 * 1000;
const FRESH_MS = 2 * 60 * 60 * 1000;
const MAX_EVENT_MS = 60 * 60 * 1000;
const MAX_EVIDENCE_CHECKS = 20;
const EVIDENCE_CONCURRENCY = 4;
const SOURCE_PATH = /\.(?:c|cc|cpp|cs|css|go|html?|java|js|jsx|mjs|php|py|rb|rs|scss|sh|sql|svg|ts|tsx|wasm|webp|png|jpe?g|gif|avif|zip)$/i;
const WORKFLOW_PATH = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i;
const REPORT_PATH = /(^|\/)(?:reports?|metrics?|coverage|evidence|artifacts?)(\/|$)|(^|\/)(?:summary|analysis|report|audit|quality|impact|candidate|manifest|contract|matrix|ledger|plan|status|health|graph|baseline|semantic|experiment|optimizer|learner|scheduler|profile)(?:[-_.][^/]*)?\.json$/i;

function parseJsonEvent(comment) {
  const body = String(comment.body || '').trimStart();
  if (!body.startsWith(MARK)) return null;
  try {
    const parsed = JSON.parse(body.slice(MARK.length).trim());
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { __parseError: true };
  } catch { return { __parseError: true }; }
}

function durationMinutes(start, end) {
  return (end - start) / 60000;
}

function clipInterval(start, end, lower, upper) {
  const clippedStart = Math.max(start, lower);
  const clippedEnd = Math.min(end, upper);
  return clippedEnd > clippedStart ? [clippedStart, clippedEnd] : null;
}

function sourceFiles(files) {
  return (files || []).map(f => typeof f === 'string' ? f : f.filename)
    .filter(Boolean)
    .filter(path => (SOURCE_PATH.test(path) || WORKFLOW_PATH.test(path)) && !REPORT_PATH.test(path));
}

function isSelfEvidence(ref) {
  try {
    const url = new URL(String(ref));
    return url.hostname === 'github.com' && url.pathname === '/mpaykin1/World_server/issues/80';
  } catch { return false; }
}

function parseEvents(comments, now = Date.now()) {
  const valid = [];
  const invalid = [];
  const seenIds = new Set();
  const acceptedAuthors = new Set(['OWNER', 'COLLABORATOR', 'MEMBER']);

  for (const comment of comments) {
    const event = parseJsonEvent(comment);
    if (event === null) continue;
    if (!acceptedAuthors.has(String(comment.author_association || ''))) continue;

    const fail = reason => invalid.push({ comment_id: comment.id, reason });
    if (event.__parseError) { fail('BAD_JSON'); continue; }

    const start = Date.parse(event.started_at);
    const end = Date.parse(event.finished_at);
    const posted = Date.parse(comment.created_at);
    const minutes = Number(event.productive_minutes);
    // Authenticated comment identity is the only overlap key; payload actor labels are untrusted.
    const commentActor = comment.user?.login || null;
    const actor = String(commentActor || '').trim();
    const declaredActor = String(event.actor_id || event.worker_id || event.role || '').trim() || null;
    const eventId = String(event.id || '');
    if (Number.isFinite(end) && end < now - WINDOW_MS) continue;

    let reason = null;
    if (!LANES.includes(event.lane)) reason = 'BAD_LANE';
    else if (!/^[a-z0-9_.:-]{8,120}$/i.test(eventId)) reason = 'BAD_ID';
    else if (!KINDS.has(event.kind)) reason = 'NOT_PRODUCTIVE_KIND';
    else if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) reason = 'BAD_INTERVAL';
    else if (end - start > MAX_EVENT_MS) reason = 'INTERVAL_TOO_LONG';
    else if (end > now + 60000) reason = 'FUTURE_INTERVAL';
    else if (!Number.isFinite(posted) || posted < end - 60000 || posted > end + 30 * 60000) reason = 'STALE_ATTESTATION';
    else if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60 || minutes > Math.ceil(durationMinutes(start, end)) + 1) reason = 'BAD_MINUTES';
    else if (!/^(https:\/\/|library:)/i.test(String(event.evidence_ref || ''))) reason = 'MISSING_EVIDENCE_REF';
    else if (isSelfEvidence(event.evidence_ref)) reason = 'SELF_EVIDENCE';
    else if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(String(event.evidence_sha || ''))) reason = 'BAD_EVIDENCE_HASH';

    if (reason) { fail(reason); continue; }
    if (seenIds.has(eventId)) { fail('DUPLICATE_ID'); continue; }
    seenIds.add(eventId);

    const lower = now - WINDOW_MS;
    const clipped = clipInterval(start, end, lower, now);
    if (!clipped) continue;

    const elapsed = end - start;
    const clippedElapsed = clipped[1] - clipped[0];
    let segmentIntervals = null;
    if (event.productive_segments !== undefined) {
      if (!Array.isArray(event.productive_segments) || event.productive_segments.length === 0) {
        fail('BAD_PRODUCTIVE_SEGMENTS'); continue;
      }
      segmentIntervals = [];
      let segmentMinutes = 0;
      let segmentFailure = false;
      for (const segment of event.productive_segments) {
        const segmentStart = Date.parse(segment.started_at);
        const segmentEnd = Date.parse(segment.finished_at);
        if (!Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd) || segmentStart < start || segmentEnd > end || segmentStart >= segmentEnd) {
          segmentFailure = true; break;
        }
        segmentIntervals.push([segmentStart, segmentEnd]);
        segmentMinutes += durationMinutes(segmentStart, segmentEnd);
      }
      segmentIntervals.sort((a, b) => a[0] - b[0]);
      if (segmentIntervals.some((segment, index) => index > 0 && segment[0] < segmentIntervals[index - 1][1])) segmentFailure = true;
      if (segmentFailure || Math.abs(segmentMinutes - minutes) > 1) {
        fail('BAD_PRODUCTIVE_SEGMENTS'); continue;
      }
    }
    const clippedClaim = segmentIntervals
      ? Math.floor(segmentIntervals.reduce((sum, segment) => {
          const visible = clipInterval(segment[0], segment[1], lower, now);
          return sum + (visible ? durationMinutes(visible[0], visible[1]) : 0);
        }, 0))
      : (clippedElapsed === elapsed ? minutes : Math.floor(minutes * clippedElapsed / elapsed));
    if (!clippedClaim) continue;

    valid.push({
      id: eventId,
      lane: event.lane,
      kind: event.kind,
      actor_id: actor || 'unknown',
      declared_actor_id: declaredActor,
      measurement_source: String(event.measurement_source || 'comment_attestation'),
      started_ms: start,
      finished_ms: end,
      clipped_start_ms: clipped[0],
      clipped_end_ms: clipped[1],
      minutes: clippedClaim,
      original_minutes: minutes,
      evidence_ref: String(event.evidence_ref),
      evidence_sha: String(event.evidence_sha).toLowerCase(),
      evidence_status: 'CONTENT_UNVERIFIED',
      evidence_reason: /^library:/i.test(String(event.evidence_ref)) ? 'LIBRARY_NOT_FETCHABLE_FROM_GITHUB_ACTION' : 'NOT_FETCHED',
      interval_status: Array.isArray(event.productive_segments) ? 'SEGMENTS_DECLARED_UNVERIFIED' : 'INTERVAL_ATTESTED_UNVERIFIED',
      active_intervals: segmentIntervals
        ? segmentIntervals.map(segment => clipInterval(segment[0], segment[1], lower, now)).filter(Boolean)
        : [clipped],
      comment_id: comment.id,
      actor_known: Boolean(actor),
      actor_identity_source: actor ? 'AUTHENTICATED_COMMENT_USER' : 'UNKNOWN'
    });
  }

  const byActor = new Map();
  for (const event of valid) {
    if (event.actor_id === 'unknown') continue;
    const rows = byActor.get(event.actor_id) || [];
    rows.push(event);
    byActor.set(event.actor_id, rows);
  }
  const overlapping = new Set();
  for (const rows of byActor.values()) {
    const intervals = rows.flatMap(event => event.active_intervals.map(([start, end]) => ({ id: event.id, start, end })))
      .sort((a, b) => a.start - b.start);
    for (let i = 0; i < intervals.length; i++) {
      for (let j = i + 1; j < intervals.length && intervals[j].start < intervals[i].end; j++) {
        if (intervals[i].id !== intervals[j].id) {
          overlapping.add(intervals[i].id);
          overlapping.add(intervals[j].id);
        }
      }
    }
  }
  for (const id of overlapping) invalid.push({ id, reason: 'OVERLAPPING_PERFORMER_INTERVAL' });

  return { valid: valid.filter(event => !overlapping.has(event.id)), invalid };
}
function evaluate(comments, now = Date.now(), options = {}) {
  const parsed = parseEvents(comments, now);
  const events = parsed.valid.map(event => ({
    ...event,
    measurement_verified: options.measurementVerifier ? options.measurementVerifier(event) === true : false,
    evidence_verified: options.evidenceVerifier ? options.evidenceVerifier(event) === true : false
  }));
  const actual = Object.fromEntries(LANES.map(lane => [
    lane, events.filter(event => event.lane === lane).reduce((sum, event) => sum + event.minutes, 0)
  ]));
  const total = actual.CLEAN_SERVER + actual['GRAPHICS-DEMO-001'];
  const target = total / 2;
  const latest = Object.fromEntries(LANES.map(lane => [
    lane, events.filter(event => event.lane === lane).sort((a, b) => b.finished_ms - a.finished_ms)[0] || null
  ]));
  const starved = LANES.filter(lane => !latest[lane] || latest[lane].finished_ms < now - FRESH_MS);
  const recovery = LANES.map(lane => ({
    lane, target_minutes: target, actual_minutes: actual[lane],
    debt_minutes: Math.max(0, Math.ceil(target - actual[lane]))
  })).sort((a, b) => b.debt_minutes - a.debt_minutes);
  const evidenceStates = [...new Set(events.map(event => event.evidence_status))];
  const telemetryBalanced = !parsed.invalid.length && Boolean(total) && !starved.length &&
    Math.abs(actual.CLEAN_SERVER - actual['GRAPHICS-DEMO-001']) <= 1;
  const measurementVerified = Boolean(events.length) && events.every(event => event.measurement_verified);
  const evidenceVerified = Boolean(events.length) && events.every(event =>
    event.evidence_verified || event.evidence_status === 'CONTENT_VERIFIED');
  const verificationPass = telemetryBalanced && measurementVerified && evidenceVerified;
  const status = parsed.invalid.length ? 'INVALID_TELEMETRY'
    : !total ? 'NO_TELEMETRY'
    : starved.length ? 'TASK_STARVATION'
    : Math.abs(actual.CLEAN_SERVER - actual['GRAPHICS-DEMO-001']) > 1 ? 'MISSED_QUOTA'
    : verificationPass ? 'TELEMETRY_BALANCED_VERIFIED' : 'TELEMETRY_BALANCED_UNVERIFIED';
  const attestedMinutes = actual;
  const verifiedActualMinutes = measurementVerified ? actual : null;
  return {
    status, ok: telemetryBalanced,
    telemetry_balanced: telemetryBalanced, verification_pass: verificationPass,
    measurement_verified: measurementVerified, evidence_verified: evidenceVerified,
    target: { CLEAN_SERVER: 50, 'GRAPHICS-DEMO-001': 50 },
    window_hours: 4, actual_minutes: actual,
    actual_minutes_status: 'ATTESTED_UNVERIFIED',
    attested_minutes: attestedMinutes,
    verified_actual_minutes: verifiedActualMinutes,
    target_minutes_each: target,
    debt_minutes: Object.fromEntries(recovery.map(row => [row.lane, row.debt_minutes])),
    recovery_lane: recovery[0]?.debt_minutes > 0 ? recovery[0].lane : null,
    recovery_action: recovery[0]?.debt_minutes > 0
      ? 'NEXT_SAFE_CYCLE_MUST_DO_PRODUCTIVE_WORK_FOR_THIS_LANE; REPORTING_ALONE_DOES_NOT_REPAY_DEBT'
      : !verificationPass
        ? 'CAPTURE_TRUSTED_TIME_AND_ARTIFACT_EVIDENCE; ATTESTED_BALANCE_IS_NOT_VERIFIED_50_50'
        : null,
    starved, rejected: parsed.invalid, accepted_events: events.length,
    evidence_states: evidenceStates, independent_fleet_visual_score: 'UNKNOWN',
    owner_verdict: 'UNSET',
    latest_artifacts: Object.fromEntries(LANES.map(lane => [lane, latest[lane] ? {
      id: latest[lane].id, ref: latest[lane].evidence_ref, sha: latest[lane].evidence_sha,
      evidence_status: latest[lane].evidence_status
    } : null]))
  };
}

function finalizeVerification(result, evidenceRows) {
  const rows = evidenceRows || [];
  result.content_verified_events = rows.filter(event => event.status === 'CONTENT_VERIFIED').length;
  result.content_unverified_events = rows.filter(event => event.status === 'CONTENT_UNVERIFIED').length;
  result.invalid_evidence_events = rows.filter(event => event.status === 'INVALID').length;
  result.evidence_states = [...new Set(rows.map(event => event.status))];
  result.evidence_verified = rows.length > 0 && rows.every(event => event.status === 'CONTENT_VERIFIED');
  result.verification_pass = Boolean(result.telemetry_balanced && result.measurement_verified && result.evidence_verified);
  for (const lane of LANES) {
    const latest = result.latest_artifacts[lane];
    const checked = latest && rows.find(event => event.id === latest.id);
    if (checked) latest.evidence_status = checked.status;
  }
  if (result.invalid_evidence_events > 0) {
    result.status = 'INVALID_EVIDENCE';
    result.ok = false;
  } else if (result.telemetry_balanced) {
    result.status = result.verification_pass ? 'TELEMETRY_BALANCED_VERIFIED' : 'TELEMETRY_BALANCED_UNVERIFIED';
  }
  if (result.telemetry_balanced && !result.verification_pass) {
    result.recovery_action = 'NEXT_SAFE_CYCLE_CAPTURE_TRUSTED_TIME_AND_FETCHABLE_ARTIFACT_EVIDENCE; ATTESTED_BALANCE_IS_NOT_VERIFIED_50_50';
  }
  return result;
}

async function fetchJson(path, token, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.github.com' + path, {
    headers: {
      Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
      'User-Agent': 'world-server-task-integrity', 'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw Error('GitHub API ' + response.status + ' on ' + path);
  return response.json();
}

async function fetchPullFiles(number, token, fetchImpl = fetch) {
  const files = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await fetchJson('/repos/mpaykin1/World_server/pulls/' + number + '/files?per_page=100&page=' + page, token, fetchImpl);
    if (!Array.isArray(rows)) throw Error('Malformed PR files response');
    files.push(...rows);
    if (rows.length < 100) return files;
  }
  throw Error('PR files pagination exceeded safe bound');
}

async function verifyEvidence(event, token, fetchImpl = fetch) {
  const ref = String(event.evidence_ref || '');
  if (/^library:/i.test(ref)) return { status: 'CONTENT_UNVERIFIED', reason: 'LIBRARY_NOT_FETCHABLE_FROM_GITHUB_ACTION' };
  const commitMatch = ref.match(/^https:\/\/github\.com\/mpaykin1\/World_server\/commit\/([0-9a-f]{40,64})(?:[/?#].*)?$/i);
  const prMatch = ref.match(/^https:\/\/github\.com\/mpaykin1\/World_server\/pull\/(\d+)(?:[/?#].*)?$/i);
  if (!commitMatch && !prMatch) return { status: 'INVALID', reason: 'UNSUPPORTED_EVIDENCE_URL' };
  if (!token) return { status: 'CONTENT_UNVERIFIED', reason: 'GITHUB_TOKEN_UNAVAILABLE' };
  try {
    if (commitMatch) {
      const sha = commitMatch[1].toLowerCase();
      if (sha !== String(event.evidence_sha).toLowerCase()) return { status: 'INVALID', reason: 'HASH_REF_MISMATCH' };
      const commit = await fetchJson('/repos/mpaykin1/World_server/commits/' + sha, token, fetchImpl);
      if (String(commit.sha || '').toLowerCase() !== sha) return { status: 'INVALID', reason: 'COMMIT_SHA_MISMATCH' };
      const paths = sourceFiles(commit.files);
      if (!paths.length) return { status: 'INVALID', reason: 'NO_PRODUCT_SOURCE_CHANGE' };
      return { status: 'CONTENT_VERIFIED', reason: null, paths };
    }
    const number = Number(prMatch[1]);
    const pr = await fetchJson('/repos/mpaykin1/World_server/pulls/' + number, token, fetchImpl);
    const expectedSha = String(event.evidence_sha).toLowerCase();
    if (event.kind === 'pr_closed') {
      if (pr.state !== 'closed' || !pr.closed_at) return { status: 'INVALID', reason: 'PR_NOT_CLOSED' };
      const wasMerged = Boolean(pr.merged_at);
      const closedSha = String(wasMerged ? pr.merge_commit_sha || '' : pr.head?.sha || '').toLowerCase();
      if (!closedSha || closedSha !== expectedSha) return { status: 'INVALID', reason: 'CLOSED_SHA_MISMATCH' };
      return { status: 'CONTENT_VERIFIED', reason: null, paths: [],
        proof: wasMerged ? 'MERGED_PR_CLOSED' : 'CLOSED_WITHOUT_MERGE', merged: wasMerged };
    }
    const refSha = String(pr.head?.sha || '').toLowerCase();
    if (!refSha || refSha !== expectedSha) return { status: 'INVALID', reason: 'HASH_REF_MISMATCH' };
    const paths = sourceFiles(await fetchPullFiles(number, token, fetchImpl));
    if (!paths.length) return { status: 'INVALID', reason: 'NO_PRODUCT_SOURCE_CHANGE' };
    return { status: 'CONTENT_VERIFIED', reason: null, paths };
  } catch (error) {
    return { status: 'CONTENT_UNVERIFIED', reason: String(error.message).slice(0, 240) };
  }
}

async function enrichEvidence(events, token, fetchImpl = fetch) {
  const enriched = [];
  for (let start = 0; start < events.length; start += EVIDENCE_CONCURRENCY) {
    const batch = events.slice(start, start + EVIDENCE_CONCURRENCY);
    const checked = await Promise.all(batch.map(async (event, offset) => {
      const index = start + offset;
      const verification = index < MAX_EVIDENCE_CHECKS
        ? await verifyEvidence(event, token, fetchImpl)
        : { status: 'CONTENT_UNVERIFIED', reason: 'EVIDENCE_CHECK_LIMIT_REACHED' };
      return { ...event, ...verification, evidence_status: verification.status, evidence_reason: verification.reason };
    }));
    enriched.push(...checked);
  }
  return enriched;
}

async function api(path, token, init = {}, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.github.com' + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
      'User-Agent': 'world-server-task-integrity', 'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw Error('GitHub API ' + response.status + ' on ' + path);
  return response.json();
}

async function comments(token, now, fetchImpl = fetch) {
  const since = encodeURIComponent(new Date(now - WINDOW_MS - MAX_EVENT_MS - 30 * 60000).toISOString());
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const rows = await api('/repos/mpaykin1/World_server/issues/80/comments?per_page=100&page=' + page + '&since=' + since, token, {}, fetchImpl);
    if (!Array.isArray(rows)) throw Error('Malformed comments API response');
    all.push(...rows);
    if (rows.length < 100) return all;
  }
  throw Error('Comments pagination exceeded safe bound');
}

async function alertIfDue(rows, result, token, now, fetchImpl = fetch) {
  if (result.ok && result.verification_pass) return;
  const latest = Math.max(0, ...rows.filter(row => String(row.body || '').startsWith(ALERT))
    .map(row => Date.parse(row.created_at)).filter(Number.isFinite));
  if (latest > now - WINDOW_MS) return;
  await api('/repos/mpaykin1/World_server/issues/80/comments', token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: ALERT + '\n' + result.status +
        '\nAttested productive minutes: ' + JSON.stringify(result.attested_minutes) +
        '\nVerified actual minutes: ' + JSON.stringify(result.verified_actual_minutes) +
        '\nRecovery lane/debt: ' + String(result.recovery_lane || 'NONE') + ' / ' +
        JSON.stringify(result.debt_minutes) +
        '\nRequired next action: ' + String(result.recovery_action || 'Review both lanes and select the next safe executable action.') +
        '\nThis alert is not recovery, user verdict, Fleet PASS, or proof of verified effort.'
    })
  }, fetchImpl);
}

async function main() {
  if (!process.argv.includes('--monitor')) throw Error('Use --monitor, or node --test');
  const token = process.env.GH_TOKEN;
  if (!token) throw Error('GH_TOKEN missing; no verification possible');
  const now = Date.now();
  const rows = await comments(token, now);
  const result = evaluate(rows, now);
  result.verified_evidence = await enrichEvidence(parseEvents(rows, now).valid, token);
  finalizeVerification(result, result.verified_evidence);
  const json = JSON.stringify(result, null, 2);
  console.log(json);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '\n### 50/50 task execution audit\n\n' + String.fromCharCode(96).repeat(3) +
      'json\n' + json + '\n' + String.fromCharCode(96).repeat(3) + '\n');
  }
  if (process.env.GITHUB_EVENT_NAME === 'schedule') await alertIfDue(rows, result, token, now);
  if (!result.verification_pass) process.exitCode = 73;
}

module.exports = { parseEvents, evaluate, verifyEvidence, enrichEvidence, alertIfDue, sourceFiles, finalizeVerification, fetchPullFiles };
if (require.main === module) main().catch(error => {
  console.error('[TASK_INTEGRITY] FAIL CLOSED:', error.message);
  process.exitCode = 73;
});