'use strict';

const { getPublicConfig, hasPublicConfig } = require('../lib/env');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!hasPublicConfig()) {
    return sendJson(res, 200, { supabaseUrl: '', supabasePublishableKey: '', configured: false });
  }
  const { url, publishableKey } = getPublicConfig();
  sendJson(res, 200, { supabaseUrl: url, supabasePublishableKey: publishableKey, configured: true });
});
