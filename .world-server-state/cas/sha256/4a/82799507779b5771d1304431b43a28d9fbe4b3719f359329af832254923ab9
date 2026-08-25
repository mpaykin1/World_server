#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const AUDIENCE = 'world-server-quality-bridge';
const BRIDGE_URL =
  process.env.QUALITY_GITHUB_BRIDGE_URL ||
  'https://iphfwxjuhsucvdyluink.supabase.co/functions/v1/quality-github-bridge';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function oidcToken() {
  const requestUrl = new URL(required('ACTIONS_ID_TOKEN_REQUEST_URL'));
  requestUrl.searchParams.set('audience', AUDIENCE);
  const requestToken = required('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
  const r = await fetch(requestUrl, {
    headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`GitHub OIDC token request ${r.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  if (!data.value) throw new Error('GitHub OIDC token response missing value');
  return data.value;
}

async function bridge(action, extra = {}) {
  const token = await oidcToken();
  const r = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok || data.ok !== true) throw new Error(`bridge ${action} ${r.status}: ${text.slice(0, 1000)}`);
  return data;
}

function migrationNames(dir = path.join(process.cwd(), 'supabase', 'migrations')) {
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()
    : [];
}

async function githubMasterProtected() {
  const token = required('GITHUB_TOKEN');
  const repo = required('GITHUB_REPOSITORY');
  const r = await fetch(`https://api.github.com/repos/${repo}/branches/master`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`GitHub branch read ${r.status}: ${text.slice(0, 500)}`);
  const data = JSON.parse(text);
  return {
    protected: data.protected === true,
    github: {
      branch: data.name,
      sha: data.commit?.sha || null,
      requiredContexts: data.protection?.required_status_checks?.contexts || [],
    },
  };
}

async function main() {
  const cmd = process.argv[2] || 'status';

  if (cmd === 'export-migrations') {
    const out = process.argv[3] || 'QUALITY_BRIDGE_MIGRATIONS.json';
    const result = await bridge('migration-export');
    fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, action: cmd, out, count: result.data?.count, digest: result.data?.digest }, null, 2));
    return;
  }

  if (cmd === 'work-packet') {
    const out = process.argv[3] || 'QUALITY_RUNTIME_WORK_PACKET.json';
    const result = await bridge('work-packet');
    fs.writeFileSync(out, JSON.stringify(result.data, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, action: cmd, out, version: result.data?.version, gaps: result.data?.gaps?.length || 0 }, null, 2));
    return;
  }

  if (cmd === 'record-manifest') {
    const names = migrationNames();
    if (!names.length) throw new Error('No local Supabase migration files found');
    const result = await bridge('record-manifest', { migrationNames: names });
    console.log(JSON.stringify({ ok: true, action: cmd, count: names.length, data: result.data }, null, 2));
    if (result.data?.drift === true) process.exit(13);
    return;
  }

  if (cmd === 'record-master-protection') {
    const state = await githubMasterProtected();
    const result = await bridge('record-master-protection', state);
    console.log(JSON.stringify({ ok: true, action: cmd, protected: state.protected, data: result.data }, null, 2));
    if (!state.protected) process.exit(14);
    return;
  }

  if (cmd === 'status') {
    const result = await bridge('status');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(`[QUALITY_GITHUB_BRIDGE_V12] ${e.message || e}`);
  process.exit(11);
});
