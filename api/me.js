'use strict';

const { createAdminClient, hasPublicConfig, hasSecretConfig } = require('../lib/env');
const { bearerToken, profileForUser } = require('../lib/auth');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = bearerToken(req) || requestUrl.searchParams.get('token') || '';
  if (!token || !hasPublicConfig() || !hasSecretConfig()) return sendJson(res, 200, { user: null });
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return sendJson(res, 200, { user: null });
  sendJson(res, 200, { user: await profileForUser(admin, data.user) });
});
