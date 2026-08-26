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

function isPreviewEnv() {
  return process.env.VERCEL_ENV === 'preview';
}

// Preview deployments build from arbitrary PR/AI branches. They must never be
// able to use the production Supabase service-role secret, even if it were
// ever (mis)configured into Preview scope in Vercel — so in preview this
// looks ONLY at SUPABASE_PREVIEW_SECRET_KEY (a separate, least-privilege key
// for a preview/test Supabase project) and does not fall back to the
// production secret names at all. Production and local dev are unaffected.
function getSecretKey() {
  if (isPreviewEnv()) {
    const previewKey = firstEnv(['SUPABASE_PREVIEW_SECRET_KEY']);
    if (!previewKey) {
      throw new Error(
        'Preview deployments need SUPABASE_PREVIEW_SECRET_KEY (a separate least-privilege key for a ' +
        'preview/test Supabase project) — the production SUPABASE_SECRET_KEY is intentionally not usable here.'
      );
    }
    return previewKey;
  }
  const key = firstEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (!key) throw new Error('Supabase server secret environment variable is not configured.');
  return key;
}

// A PostHog Project API Key (phc_...) is a public, client-side token by
// design — every browser that loads the page receives it — the same trust
// class as the Sentry DSN hardcoded in shared/sentry-runtime.entry.js, not a
// server secret like SUPABASE_SECRET_KEY above. So this doesn't need to be a
// Vercel env var scoped per-environment at all: DEFAULT_POSTHOG_KEY/_HOST
// below are the single source of truth, exactly like the Sentry DSN. An env
// var still overrides them if set (e.g. to rotate the key without a code
// change), but once these two lines carry a real value, PostHog works in
// every environment — production, every Preview branch, local dev — with
// zero per-environment Vercel configuration. Left blank until a real value
// is available: analytics simply stay off, same as before, until either this
// or the env var is set.
const DEFAULT_POSTHOG_KEY = '';
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

// PostHog is optional (product analytics only, no key = analytics simply stay off),
// unlike Supabase above which is a hard requirement — so this never throws.
function getAnalyticsConfig() {
  const key = firstEnv(['POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_KEY']) || DEFAULT_POSTHOG_KEY;
  const host = firstEnv(['POSTHOG_HOST', 'NEXT_PUBLIC_POSTHOG_HOST']) || DEFAULT_POSTHOG_HOST;
  return { key, host };
}

const options = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
};

function createAdminClient() {
  // In preview this is a deliberately different Supabase project (see
  // getSecretKey() above) — pairing SUPABASE_PREVIEW_SECRET_KEY with the
  // production SUPABASE_URL would just be a mismatched project/key auth
  // failure, and defeats the isolation anyway if it ever did happen to work.
  const url = isPreviewEnv() ? firstEnv(['SUPABASE_PREVIEW_URL']) || getPublicConfig().url : getPublicConfig().url;
  return createClient(url, getSecretKey(), options);
}

function createPublicServerClient() {
  const { url, publishableKey } = getPublicConfig();
  return createClient(url, publishableKey, options);
}

module.exports = { firstEnv, isPreviewEnv, getPublicConfig, getSecretKey, getAnalyticsConfig, createAdminClient, createPublicServerClient };
