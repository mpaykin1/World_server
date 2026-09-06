'use strict';

try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {
  // .env is optional
}

const { createClient } = require('@supabase/supabase-js');

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function hasPublicConfig() {
  const url = firstEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const publishableKey = firstEnv([
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ]);
  return Boolean(url && publishableKey);
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

function hasSecretConfig() {
  const key = firstEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  return Boolean(key);
}

function getSecretKey() {
  const key = firstEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (!key) throw new Error('Supabase server secret environment variable is not configured.');
  return key;
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

module.exports = { firstEnv, hasPublicConfig, getPublicConfig, hasSecretConfig, getSecretKey, createAdminClient, createPublicServerClient };
