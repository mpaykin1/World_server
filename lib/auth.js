'use strict';

const crypto = require('crypto');
const { httpError } = require('./http');

function safeName(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_а-яА-ЯёЁ-]/g, '').slice(0, 20);
}

function normalizedName(value) {
  return safeName(value).toLocaleLowerCase('ru-RU');
}

function accountEmail(username) {
  const digest = crypto.createHash('sha256').update(normalizedName(username), 'utf8').digest('hex');
  return `u_${digest}@accounts.world.invalid`;
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function profileForUser(admin, user) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, username, display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  const username = safeName(data?.display_name || data?.username || user.user_metadata?.username || 'Player');
  return { id: user.id, username: username || 'Player' };
}

async function optionalIdentity(admin, req, body = {}) {
  const token = bearerToken(req);
  if (token) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user) {
      const profile = await profileForUser(admin, data.user);
      return { kind: 'user', userId: data.user.id, guestId: null, name: profile.username, token };
    }
  }
  const guestId = String(body.guestId || body.guest_id || '');
  if (!validUuid(guestId)) throw httpError(400, 'Не удалось определить игровую сессию гостя.');
  return { kind: 'guest', userId: null, guestId, name: `Guest_${guestId.replaceAll('-', '').slice(0, 4)}`, token: '' };
}

async function requireUser(admin, req) {
  const token = bearerToken(req);
  if (!token) throw httpError(401, 'Требуется вход в аккаунт.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw httpError(401, 'Сессия истекла. Войдите снова.');
  return { token, authUser: data.user, user: await profileForUser(admin, data.user) };
}

module.exports = { safeName, normalizedName, accountEmail, bearerToken, validUuid, profileForUser, optionalIdentity, requireUser };
