'use strict';

const { createAdminClient } = require('../lib/env');
const { bearerToken } = require('../lib/auth');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const token = bearerToken(req);
  if (token) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.signOut(token, 'local');
    if (error) console.warn('Supabase logout warning:', error.message);
  }
  sendJson(res, 200, { ok: true });
});
