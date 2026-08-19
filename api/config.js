'use strict';

const { getPublicConfig } = require('../lib/env');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const { url, publishableKey } = getPublicConfig();
  sendJson(res, 200, { supabaseUrl: url, supabasePublishableKey: publishableKey });
});
