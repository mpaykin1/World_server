'use strict';

const { createPublicServerClient } = require('../lib/env');
const { bearerToken, profileForUser } = require('../lib/auth');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = bearerToken(req) || requestUrl.searchParams.get('token') || '';
  if (!token) return sendJson(res, 200, { user: null });
  // getUser(jwt) validates the JWT against GoTrue's /auth/v1/user endpoint —
  // confirmed directly (curl against a real project): failures there are
  // bad_jwt/no_authorization, never a privilege error, so the publishable
  // key is sufficient. No admin/service-role key needed to check "who am I".
  const client = createPublicServerClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return sendJson(res, 200, { user: null });
  sendJson(res, 200, { user: await profileForUser(client, data.user) });
});
