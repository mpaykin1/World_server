'use strict';

const { getPublicConfig } = require('../lib/env');
const { bearerToken } = require('../lib/auth');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const token = bearerToken(req);
  if (token) {
    // GoTrue's /auth/v1/logout invalidates the token passed as the bearer —
    // it doesn't need an elevated key, just the caller's own JWT (confirmed
    // directly against a real project: failures there are bad_jwt, never a
    // privilege error). Calling the endpoint directly with the publishable
    // key avoids needing admin.auth.admin.signOut()'s service-role key.
    try {
      const { url, publishableKey } = getPublicConfig();
      const response = await fetch(`${url}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }
      });
      if (!response.ok && response.status !== 401 && response.status !== 403) {
        console.warn('Supabase logout warning:', response.status, await response.text());
      }
    } catch (error) {
      console.warn('Supabase logout warning:', error.message);
    }
  }
  sendJson(res, 200, { ok: true });
});
