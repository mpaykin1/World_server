'use strict';

const { createClient } = require('@supabase/supabase-js');

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function getPublicConfig() {
  const url = firstEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const publishableKey = firstEnv([
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ]);
  if (!url || !publishableKey) {
    throw new Error('Supabase public environment variables are not configured.');
  }
  return { url, publishableKey };
}

function getSecretKey() {
  const key = firstEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (!key) throw new Error('Supabase server secret environment variable is not configured.');
  return key;
}

// PostHog is optional (product analytics only, no key = analytics simply stay off),
// unlike Supabase above which is a hard requirement — so this never throws.
function getAnalyticsConfig() {
  const key = firstEnv(['POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_KEY']);
  const host = firstEnv(['POSTHOG_HOST', 'NEXT_PUBLIC_POSTHOG_HOST']) || 'https://us.i.posthog.com';
  return { key, host };
}

const options = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
};

function createAdminClient() {
  const { url } = getPublicConfig();
  return createClient(url, getSecretKey(), options);
}

function createPublicServerClient() {
  const { url, publishableKey } = getPublicConfig();
  return createClient(url, publishableKey, options);
}

module.exports = { firstEnv, getPublicConfig, getSecretKey, getAnalyticsConfig, createAdminClient, createPublicServerClient };
