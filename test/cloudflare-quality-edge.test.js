'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'cloudflare-worker.js'),'utf8').replace(/^\uFEFF/,'');
async function loadWorker(){const url=`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Date.now()}-${Math.random()}`;return (await import(url)).default;}

test('Cloudflare quality endpoints use dedicated Supabase Edge lanes',async()=>{
  const worker=await loadWorker(); const original=global.fetch; const calls=[];
  global.fetch=async req=>{calls.push(req);return new Response(JSON.stringify({ok:true,apps:{}}),{status:200,headers:{'content-type':'application/json'}});};
  try{
    const summary=await worker.fetch(new Request('https://world.example/api/quality-summary?hours=1'),{});
    assert.equal(summary.status,200); assert.equal(summary.headers.get('x-world-server-quality-proxy'),'cloudflare');
    assert.match(calls[0].url,/supabase\.co\/functions\/v1\/quality-summary\?hours=1$/);
    const telemetry=await worker.fetch(new Request('https://world.example/api/quality-telemetry',{method:'POST',headers:{'content-type':'application/json'},body:'{"app":"voxel-world","type":"quality_session"}'}),{});
    assert.equal(telemetry.status,200); assert.match(calls[1].url,/supabase\.co\/functions\/v1\/quality-telemetry$/); assert.equal(calls[1].method,'POST');
  } finally { global.fetch=original; }
});

test('production quality monitoring points at Cloudflare authority',()=>{
  const feedback=fs.readFileSync(path.join(root,'.github','workflows','production-quality-feedback.yml'),'utf8');
  const sentry=fs.readFileSync(path.join(root,'.github','workflows','sentry-production-verify.yml'),'utf8');
  const pull=fs.readFileSync(path.join(root,'scripts','production-quality-pull.js'),'utf8');
  for(const text of [feedback,sentry,pull]){assert.match(text,/https:\/\/world-server\.mmmpaykin\.workers\.dev/);assert.doesNotMatch(text,/world-server\.vercel\.app/);}
  assert.match(feedback,/QUALITY_FRESH_HOURS: 6/); assert.match(feedback,/INCONCLUSIVE/); assert.match(feedback,/Close recovered production quality blocker/); assert.doesNotMatch(feedback,/steps\.prod\.outcome == 'failure'/);
});

test('Supabase quality Edge functions are source-controlled and local server exposes compatibility routes',()=>{
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  const ingest=fs.readFileSync(path.join(root,'supabase','functions','quality-telemetry','index.ts'),'utf8');
  const summary=fs.readFileSync(path.join(root,'supabase','functions','quality-summary','index.ts'),'utf8');
  assert.match(server,/\/api\/quality-summary/); assert.match(server,/\/api\/quality-telemetry/);
  assert.match(ingest,/quality_telemetry/); assert.match(ingest,/SUPABASE_SERVICE_ROLE_KEY/); assert.match(summary,/quality_telemetry/); assert.match(summary,/SUPABASE_SERVICE_ROLE_KEY/);
});
