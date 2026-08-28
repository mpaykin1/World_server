'use strict';

const { getPublicConfig, getAnalyticsConfig } = require('../lib/env');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const { url, publishableKey } = getPublicConfig();
  const { key: posthogKey, host: posthogHost } = getAnalyticsConfig();
  sendJson(res, 200, {
    supabaseUrl: url,
    supabasePublishableKey: publishableKey,
    posthogKey,
    posthogHost
  });
});
