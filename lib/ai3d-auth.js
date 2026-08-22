'use strict';

const crypto = require('crypto');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function timingSafeEqualText(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function signPayload(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function issueAi3dToken({ secret, ttlSeconds = 600, subject = 'anonymous' } = {}) {
  if (!secret || String(secret).length < 24) throw new Error('AI3D_SHARED_SECRET must contain at least 24 characters.');
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, Math.min(Number(ttlSeconds) || 600, 3600));
  const payload = {
    v: 1,
    iat: now,
    exp: now + ttl,
    sub: String(subject || 'anonymous').slice(0, 128),
    nonce: crypto.randomBytes(12).toString('base64url')
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  return { token: `${payloadB64}.${signPayload(payloadB64, String(secret))}`, payload };
}

function verifyAi3dToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || !secret) return null;
  const [payloadB64, signature, extra] = String(token).split('.');
  if (!payloadB64 || !signature || extra) return null;
  const expected = signPayload(payloadB64, String(secret));
  if (!timingSafeEqualText(signature, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')); }
  catch { return null; }
  if (payload?.v !== 1 || !Number.isFinite(payload?.exp) || !Number.isFinite(payload?.iat)) return null;
  if (payload.iat > nowSeconds + 30 || payload.exp < nowSeconds) return null;
  return payload;
}

module.exports = { issueAi3dToken, verifyAi3dToken };
