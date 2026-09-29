'use strict';

const AUTHORITY_DETECTION_STEP = 'Detect Cloudflare deployment authority';
const NETLIFY_FALLBACK_BYPASS_STEP =
  'Verify Netlify PR fallback when Cloudflare credentials are unavailable';
const FAIL_CLOSED_STEP = 'Fail closed when Cloudflare credentials are unavailable';
const FAIL_CLOSED_CONDITION = /configured\s*!=\s*'true'/;
const DEPLOY_CONDITION = /configured\s*==\s*'true'/;

function assertCloudflarePreviewFailClosed(workflowSource) {
  const errors = [];
  const source = String(workflowSource || '');

  if (!source.includes('CLOUDFLARE_API_TOKEN')) {
    errors.push('MISSING_CLOUDFLARE_API_TOKEN');
  }
  if (!source.includes(AUTHORITY_DETECTION_STEP)) {
    errors.push('MISSING_CLOUDFLARE_AUTHORITY_DETECTION');
  }
  if (!DEPLOY_CONDITION.test(source)) {
    errors.push('MISSING_DEPLOY_AUTHORITY_CONDITION');
  }
  if (source.includes(NETLIFY_FALLBACK_BYPASS_STEP)) {
    errors.push('NETLIFY_FALLBACK_GREEN_PRESENT');
  }
  const failureIdx = source.indexOf(FAIL_CLOSED_STEP);
  const authorityIdx = source.indexOf(AUTHORITY_DETECTION_STEP);
  if (failureIdx === -1) {
    errors.push('MISSING_FAIL_CLOSED_STEP');
  } else {
    if (authorityIdx === -1 || failureIdx < authorityIdx) {
      errors.push('FAIL_CLOSED_BEFORE_AUTHORITY');
    }
    const failClosedBlock = source.slice(failureIdx);
    if (!FAIL_CLOSED_CONDITION.test(failClosedBlock)) {
      errors.push('FAIL_CLOSED_CONDITION_MISSING');
    }
    if (!/exit\s+1/.test(failClosedBlock)) {
      errors.push('FAIL_CLOSED_EXIT_MISSING');
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  AUTHORITY_DETECTION_STEP,
  DEPLOY_CONDITION,
  FAIL_CLOSED_CONDITION,
  FAIL_CLOSED_STEP,
  NETLIFY_FALLBACK_BYPASS_STEP,
  assertCloudflarePreviewFailClosed,
};