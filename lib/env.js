'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Same minimal, dependency-free .env.local loader already proven live by
// scripts/browser-local-worker-live.cjs - centralized here so both bridges
// share one implementation instead of duplicating it. Never overrides a
// real env var already set (production/CI env always wins over a local
// file), and is a silent no-op when the file doesn't exist (Vercel/CI never
// has one).
(function loadDotEnvLocal() {
  try {
    const envPath = path.join(path.resolve(__dirname, '..'), '.env.local');
    if (!fs.existsSync(envPath)) return;
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of txt.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* best effort - never let a malformed local file break module load */ }
})();

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

// Reuses the SAME public/publishable client above - the only difference is
// two extra request headers, attached via supabase-js's own documented
// `global.headers` option (no raw fetch reimplementation, no second client
// construction path). These headers are what a matching RLS policy
// (private.remote_inbox_worker_authorized(), see the real migration this
// pattern was proven against) checks via Postgres's
// current_setting('request.headers') - the same worker-token pattern
// already proven live by scripts/browser-local-worker-live.cjs. Fails
// closed: a worker identity is required to even construct this client: no
// token means no client, never a silent fallback to an unauthenticated
// (and therefore RLS-denied-everything) connection that could be
// misread as "Supabase is unreachable" instead of "not configured".
function createWorkerAuthedClient({ workerId, workerToken } = {}) {
  const { url, publishableKey } = getPublicConfig();
  const id = String(workerId || firstEnv(['BROWSER_WORKER_ID'])).trim();
  const token = String(workerToken || firstEnv(['BROWSER_WORKER_TOKEN'])).trim();
  if (!id) throw new Error('BROWSER_WORKER_ID is not configured - refusing to connect without a worker identity');
  if (!token) throw new Error('BROWSER_WORKER_TOKEN is not configured - refusing to connect without a worker token');
  return createClient(url, publishableKey, {
    ...options,
    global: { headers: { 'x-remote-worker-id': id, 'x-remote-worker-token': token } },
  });
}

module.exports = { firstEnv, getPublicConfig, getSecretKey, createAdminClient, createPublicServerClient, createWorkerAuthedClient };
