'use strict';

// Consolidated router for the "quality" telemetry/autopilot API surface.
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions; this repo's
// quality/procedural-quality subsystem alone used 25 separate api/*.js files.
// vercel.json rewrites map each original public URL (e.g. /api/quality-summary)
// to this single function with ?__route=<name>, so external URLs are unchanged
// and each handler's original logic runs untouched from lib/api-handlers/.
const regionalProbe = require('../lib/quality-regional-probe');

const routes = {
  'quality-summary': require('../lib/api-handlers/quality-summary'),
  'quality-profile': require('../lib/api-handlers/quality-profile'),
  'quality-project-state': require('../lib/api-handlers/quality-project-state'),
  'quality-rollout-config': require('../lib/api-handlers/quality-rollout-config'),
  'quality-telemetry': require('../lib/api-handlers/quality-telemetry'),
  'quality-telemetry-export': require('../lib/api-handlers/quality-telemetry-export'),
  'quality-trace': require('../lib/api-handlers/quality-trace'),
  'quality-pattern-evidence': require('../lib/api-handlers/quality-pattern-evidence'),
  'quality-performance-evidence': require('../lib/api-handlers/quality-performance-evidence'),
  'quality-autopilot-nightly': require('../lib/api-handlers/quality-autopilot-nightly'),
  'quality-autopilot-summary': require('../lib/api-handlers/quality-autopilot-summary'),
  'quality-autopilot-worker': require('../lib/api-handlers/quality-autopilot-worker'),
  'procedural-quality-baseline': require('../lib/api-handlers/procedural-quality-baseline'),
  'procedural-quality-canary': require('../lib/api-handlers/procedural-quality-canary'),
  'procedural-quality-certification': require('../lib/api-handlers/procedural-quality-certification'),
  'procedural-quality-device-report': require('../lib/api-handlers/procedural-quality-device-report'),
  'procedural-quality-learn': require('../lib/api-handlers/procedural-quality-learn'),
  'procedural-quality-orchestrate': require('../lib/api-handlers/procedural-quality-orchestrate'),
  'procedural-quality-profile': require('../lib/api-handlers/procedural-quality-profile'),
  'procedural-quality-repair-report': require('../lib/api-handlers/procedural-quality-repair-report'),
  'procedural-quality-runtime-health': require('../lib/api-handlers/procedural-quality-runtime-health'),
  'procedural-quality-system-status': require('../lib/api-handlers/procedural-quality-system-status'),
  'quality-probe-ap': regionalProbe('sin1'),
  'quality-probe-eu': regionalProbe('fra1'),
  'quality-probe-us': regionalProbe('iad1')
};

function routeName(req) {
  const fromRewrite = req.query && req.query.__route;
  if (fromRewrite) return String(fromRewrite);
  const pathname = String(req.url || '').split('?')[0];
  return pathname.replace(/^\/?api\/?/, '');
}

module.exports = async function handler(req, res) {
  const route = routeName(req);
  const target = routes[route];
  if (!target) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: `Unknown quality route: ${route}` }));
    return;
  }
  return target(req, res);
};
