'use strict';

const MAX_PAGES = 10;
const SOURCE_PATH = /\.(?:c|cc|cpp|cs|css|go|html?|java|js|jsx|mjs|php|py|rb|rs|scss|sh|sql|svg|ts|tsx|wasm|webp|png|jpe?g|gif|avif|zip)$/i;
const WORKFLOW_PATH = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i;
const REPORT_PATH = /(^|\/)(?:reports?|metrics?|coverage|evidence|artifacts?)(\/|$)|(^|\/)(?:summary|analysis|report|audit|quality|impact|candidate|manifest|contract|matrix|ledger|plan|status|health|graph|baseline|semantic|experiment|optimizer|learner|scheduler|profile)(?:[-_.][^/]*)?\.json$/i;

function sourceFiles(files) {
  return (files || []).map(file => typeof file === 'string' ? file : file.filename)
    .filter(Boolean)
    .filter(file => (SOURCE_PATH.test(file) || WORKFLOW_PATH.test(file)) && !REPORT_PATH.test(file));
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
  for (let page = 1; page <= MAX_PAGES; page++) {
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
      return {
        status: 'CONTENT_VERIFIED', reason: null, paths: [],
        proof: wasMerged ? 'MERGED_PR_CLOSED' : 'CLOSED_WITHOUT_MERGE', merged: wasMerged
      };
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

module.exports = { sourceFiles, fetchPullFiles, verifyEvidence };