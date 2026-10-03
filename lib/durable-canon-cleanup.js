'use strict';

async function cleanupDurableCanonState(admin, { sourceEventKey, userId = '', username = '' } = {}) {
  const errors = [];
  let resolvedUserId = userId;

  try {
    const purge = await admin.rpc('purge_fleet_durable_canon', { p_source_event_key: sourceEventKey });
    if (purge.error) errors.push(new Error(`canon cleanup failed: ${purge.error.message}`));
  } catch (error) {
    errors.push(new Error(`canon cleanup failed: ${error.message}`));
  }

  if (!resolvedUserId) {
    try {
      const lookup = await admin.from('profiles').select('id').eq('username', username.toLowerCase()).maybeSingle();
      if (lookup.error) throw new Error(`test user lookup failed: ${lookup.error.message}`);
      resolvedUserId = lookup.data?.id || '';
    } catch (error) {
      errors.push(error);
    }
  }

  if (resolvedUserId) {
    try {
      const { error } = await admin.auth.admin.deleteUser(resolvedUserId);
      if (error) throw new Error(`test user cleanup failed: ${error.message}`);
    } catch (error) {
      errors.push(error);
    }
  }

  return { errors, userId: resolvedUserId };
}

module.exports = { cleanupDurableCanonState };
