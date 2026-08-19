'use strict';

const { createAdminClient, createPublicServerClient } = require('../lib/env');
const { safeName, normalizedName, accountEmail, profileForUser } = require('../lib/auth');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = await readJsonBody(req);
  const username = safeName(body.username);
  const password = String(body.password || '');
  if (username.length < 3) throw httpError(400, 'Ник должен быть минимум 3 символа.');
  if (password.length < 6) throw httpError(400, 'Пароль должен быть минимум 6 символов.');

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from('profiles')
    .select('id')
    .eq('username', normalizedName(username))
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) throw httpError(409, 'Такой аккаунт уже есть.');

  const email = accountEmail(username);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: username }
  });
  if (error) {
    if (/already|registered|duplicate/i.test(error.message)) throw httpError(409, 'Такой аккаунт уже есть.');
    throw httpError(400, error.message);
  }

  const publicClient = createPublicServerClient();
  const { data: login, error: loginError } = await publicClient.auth.signInWithPassword({ email, password });
  if (loginError || !login.session) throw httpError(500, 'Аккаунт создан, но не удалось открыть сессию.');
  const user = await profileForUser(admin, data.user);
  sendJson(res, 200, {
    token: login.session.access_token,
    refreshToken: login.session.refresh_token,
    expiresAt: login.session.expires_at,
    user
  });
});
