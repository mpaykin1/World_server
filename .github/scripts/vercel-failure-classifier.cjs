'use strict';

const EXTERNAL_LIMIT_PATTERNS = [
  /rate\s*limit/i,
  /quota\s*(?:exceeded|limit)/i,
  /retry\s+in\s+\d+/i,
  /usage\s+limit/i,
  /too\s+many\s+requests/i,
  /capacity\s+(?:limit|exceeded|unavailable)/i,
  /resource\s+limit/i,
];

const NON_REPAIR_PATTERNS = [
  /cancel+ed/i,
  /skipped/i,
  /ignored/i,
  /superseded/i,
];

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isVercelContext(context = '') {
  return /^Vercel\s*[–—-]\s*/i.test(clean(context));
}

function projectFromContext(context = '') {
  return clean(context).replace(/^Vercel\s*[–—-]\s*/i, '') || 'unknown';
}

function classifyVercelStatus({ state = '', context = '', description = '', targetUrl = '' } = {}) {
  const normalizedState = clean(state).toLowerCase();
  const normalizedContext = clean(context);
  const normalizedDescription = clean(description);
  const project = projectFromContext(normalizedContext);

  if (!isVercelContext(normalizedContext) || normalizedState !== 'failure') {
    return {
      relevant: false,
      shouldRepair: false,
      kind: 'ignore',
      project,
      reason: 'Not a failed Vercel commit status.',
      targetUrl: clean(targetUrl),
    };
  }

  if (NON_REPAIR_PATTERNS.some((pattern) => pattern.test(normalizedDescription))) {
    return {
      relevant: true,
      shouldRepair: false,
      kind: 'non-repairable',
      project,
      reason: 'Vercel reported a cancelled/skipped/superseded deployment.',
      targetUrl: clean(targetUrl),
    };
  }

  if (EXTERNAL_LIMIT_PATTERNS.some((pattern) => pattern.test(normalizedDescription))) {
    return {
      relevant: true,
      shouldRepair: false,
      kind: 'external-limit',
      project,
      reason: 'External Vercel quota/rate/capacity limit; code repair would be misleading.',
      targetUrl: clean(targetUrl),
    };
  }

  return {
    relevant: true,
    shouldRepair: true,
    kind: 'build-failure',
    project,
    reason: 'Failed Vercel status needs build/root-cause triage.',
    targetUrl: clean(targetUrl),
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'github-output') {
      out.githubOutput = true;
      continue;
    }

    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? next : '';
    if (next && !next.startsWith('--')) i += 1;
  }
  return out;
}

function githubOutput(result) {
  const safe = (value) => clean(value).replace(/[\r\n]/g, ' ');
  return [
    `relevant=${result.relevant ? 'true' : 'false'}`,
    `should_repair=${result.shouldRepair ? 'true' : 'false'}`,
    `kind=${safe(result.kind)}`,
    `project=${safe(result.project)}`,
    `reason=${safe(result.reason)}`,
  ].join('\n');
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const result = classifyVercelStatus({
    state: args.state,
    context: args.context,
    description: args.description,
    targetUrl: args['target-url'],
  });
  process.stdout.write(args.githubOutput ? `${githubOutput(result)}\n` : `${JSON.stringify(result, null, 2)}\n`);
}

module.exports = { classifyVercelStatus, isVercelContext, projectFromContext, githubOutput };
