'use strict';

// Regression guard for a real production incident: every Vercel project in
// this team defaults to SSO Deployment Protection ON when created (found
// 2026-08-26 — 43 of 45 projects in the "improve-world" team had it enabled,
// meaning every auto-generated "world" deployment showed visitors a Vercel
// login wall instead of the actual public game/story). Fixed once by hand
// for all 45 projects at the time; this script exists so the NEXT
// auto-created project can't silently reintroduce the same bug.
//
// Two independent layers, either can run alone:
//   1. API layer (needs VERCEL_TOKEN) — lists every project in the team and
//      fails if any has passwordProtection/ssoProtection enabled for
//      anything other than an explicitly allowlisted project.
//   2. HTTP layer (no token needed) — hits each known public URL directly
//      and fails if the response is Vercel's own auth wall (a redirect to
//      vercel.com/sso-api, or a login page) instead of the real app.
//
// Layer 2 is what actually matches what a real visitor experiences, so it
// runs even when VERCEL_TOKEN isn't configured (e.g. a contributor running
// this locally without CI secrets) — it just can't discover brand-new
// projects on its own then, only re-check the known list below.

const https = require('node:https');

const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_itmMhMILAlqU6yLs7xnsvbo1';
const TOKEN = process.env.VERCEL_TOKEN || '';

// Projects allowed to keep protection ON (internal tooling only, never a
// public-facing "world"). Empty by default — nothing in this team should be
// protected right now; add an entry here only with a documented reason.
const PROTECTION_ALLOWLIST = new Set([]);

// Known public entry points a real visitor reaches. Kept here as a fixed
// baseline check independent of the Vercel API (see module comment) — the
// API layer below is what actually scales to newly created projects.
const KNOWN_PUBLIC_URLS = [
  'https://improve-world-home-improve-world.vercel.app/',
  'https://voxel-gothic-steampunk-world-improve-world.vercel.app/',
  'https://gothic-voxel-city-atlas-v3-mobile-final-improve-world.vercel.app/',
  'https://voxel-gothic-steampunk-mobile-repaired-improve-world.vercel.app/',
  'https://world-server.vercel.app/'
];

function httpsJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, json: body ? JSON.parse(body) : null }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, json: null, parseError: e.message, body }); }
      });
    }).on('error', reject);
  });
}

function httpsGetFollowing(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const attempt = (currentUrl, redirectsLeft) => {
      https.get(currentUrl, (res) => {
        const location = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && location && redirectsLeft > 0) {
          res.resume();
          const nextUrl = new URL(location, currentUrl).toString();
          attempt(nextUrl, redirectsLeft - 1);
          return;
        }
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); if (body.length > 20000) res.destroy(); });
        res.on('end', () => resolve({ finalUrl: currentUrl, status: res.statusCode, body }));
        res.on('close', () => resolve({ finalUrl: currentUrl, status: res.statusCode, body }));
      }).on('error', reject);
    };
    attempt(url, maxRedirects);
  });
}

function looksLikeVercelAuthWall(result) {
  const host = (() => { try { return new URL(result.finalUrl).host; } catch { return ''; } })();
  if (host === 'vercel.com') return true;
  if (result.status === 401 || result.status === 403) return true;
  if (/_vercel_sso_nonce|Vercel Authentication|vercel\.com\/sso-api/i.test(result.body || '')) return true;
  return false;
}

async function checkKnownUrls() {
  const failures = [];
  for (const url of KNOWN_PUBLIC_URLS) {
    let result;
    try {
      result = await httpsGetFollowing(url);
    } catch (error) {
      failures.push(`${url}: request failed (${error.message})`);
      continue;
    }
    if (looksLikeVercelAuthWall(result)) {
      failures.push(`${url}: blocked by Vercel Authentication (ended at ${result.finalUrl}, status ${result.status})`);
    } else {
      console.log(`[HTTP_LAYER] OK: ${url} -> ${result.status}, no auth wall`);
    }
  }
  return failures;
}

async function checkAllTeamProjects() {
  if (!TOKEN) {
    console.warn('[API_LAYER] SKIPPED: VERCEL_TOKEN not set — only the fixed known-URL list above was checked. ' +
      'Set VERCEL_TOKEN in CI to also catch protection left enabled on brand-new, not-yet-linked projects.');
    return { skipped: true, failures: [] };
  }
  const listRes = await httpsJson(`https://api.vercel.com/v9/projects?teamId=${TEAM_ID}&limit=100`, { Authorization: `Bearer ${TOKEN}` });
  if (listRes.status !== 200 || !listRes.json) {
    return { skipped: false, failures: [`could not list team projects (status ${listRes.status})`] };
  }
  const projects = listRes.json.projects || [];
  const failures = [];
  for (const project of projects) {
    if (PROTECTION_ALLOWLIST.has(project.name)) continue;
    const detail = await httpsJson(`https://api.vercel.com/v9/projects/${project.id}?teamId=${TEAM_ID}`, { Authorization: `Bearer ${TOKEN}` });
    const proj = detail.json || {};
    const sso = proj.ssoProtection;
    const password = proj.passwordProtection;
    if (sso && sso.deploymentType) failures.push(`${project.name} (${project.id}): ssoProtection enabled (${sso.deploymentType})`);
    if (password && password.deploymentType) failures.push(`${project.name} (${project.id}): passwordProtection enabled (${password.deploymentType})`);
  }
  console.log(`[API_LAYER] checked ${projects.length} team projects`);
  return { skipped: false, failures };
}

async function main() {
  const httpFailures = await checkKnownUrls();
  const apiResult = await checkAllTeamProjects();
  const allFailures = [...httpFailures, ...apiResult.failures];

  if (allFailures.length) {
    console.error('\n[VERCEL_PUBLIC_ACCESS] FAIL — Vercel Authentication is blocking a public URL:');
    for (const f of allFailures) console.error(' -', f);
    process.exit(1);
  }
  console.log('\n[VERCEL_PUBLIC_ACCESS] PASS — no known public URL is behind Vercel Authentication' +
    (apiResult.skipped ? ' (API layer skipped, set VERCEL_TOKEN for full team coverage)' : ''));
}

main().catch((error) => {
  console.error('[VERCEL_PUBLIC_ACCESS] ERROR:', error.message);
  process.exit(1);
});
