'use strict';

const { createAdminClient } = require('../env');
const { bearerToken } = require('../auth');
const { sendJson, methodNotAllowed, withErrors } = require('../http');

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
