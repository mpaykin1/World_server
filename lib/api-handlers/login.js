'use strict';

const { createPublicServerClient } = require('../lib/env');
const { safeName, accountEmail, profileForUser } = require('../lib/auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  const username = safeName(body.username);
  const password = String(body.password || '');
  if (!username || !password) throw httpError(400, 'Введите ник и пароль.');
  const publicClient = createPublicServerClient();
  const { data, error } = await publicClient.auth.signInWithPassword({ email: accountEmail(username), password });
  if (error || !data.session || !data.user) throw httpError(401, 'Неверный логин или пароль.');
  // profiles is public-readable (RLS: select using true) and getUser(jwt) only
  // needs a valid JWT, not an elevated key — profileForUser works fine on the
  // public client. No admin/service-role key needed for login at all.
  const user = await profileForUser(publicClient, data.user);
  sendJson(res, 200, {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user
  });
});
