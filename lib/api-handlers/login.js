'use strict';

const { createAdminClient, createPublicServerClient } = require('../env');
const { safeName, accountEmail, profileForUser } = require('../auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  const username = safeName(body.username);
  const password = String(body.password || '');
  if (!username || !password) throw httpError(400, 'Введите ник и пароль.');
  const publicClient = createPublicServerClient();
  const { data, error } = await publicClient.auth.signInWithPassword({ email: accountEmail(username), password });
  if (error || !data.session || !data.user) throw httpError(401, 'Неверный логин или пароль.');
  const user = await profileForUser(createAdminClient(), data.user);
  sendJson(res, 200, {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user
  });
});
