#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function firstEnv(names) {
  for (const n of names) {
    const v = String(process.env[n] || '').trim();
    if (v) return v;
  }
  return '';
}

(async () => {
  const url = firstEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const key = firstEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (!url || !key) throw new Error('Supabase server environment variables are required.');
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/quality_desktop_ai_work_packet`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: '{}',
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`quality_desktop_ai_work_packet ${r.status}: ${text.slice(0, 500)}`);
  const packet = JSON.parse(text);
  fs.writeFileSync(path.join(process.cwd(), 'QUALITY_RUNTIME_WORK_PACKET.json'), JSON.stringify(packet, null, 2) + '\n');
  console.log(JSON.stringify({
    version: packet.version,
    score: packet.score?.score,
    runtimeStatus: packet.score?.status,
    jobs: packet.jobs?.length || 0,
    gaps: packet.gaps?.length || 0,
  }, null, 2));
})().catch((e) => {
  console.error(`[QUALITY_WORK_PACKET] ${e.message || e}`);
  process.exit(11);
});
