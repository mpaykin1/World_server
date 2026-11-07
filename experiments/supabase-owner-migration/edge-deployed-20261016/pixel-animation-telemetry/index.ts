const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Pixel-Animation-Telemetry':'v1' } }); }
function getSecretCredential(): { key: string; modern: boolean } {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (modern) {
    try {
      const parsed=JSON.parse(modern) as Record<string,string>;
      const key=parsed.default ?? Object.values(parsed)[0] ?? '';
      if(key)return { key, modern:true };
    } catch {}
  }
  return { key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', modern:false };
}
function serviceHeaders(credential:{key:string;modern:boolean}, extra:Record<string,string>={}) {
  const headers:Record<string,string>={ apikey:credential.key, ...extra };
  if(!credential.modern)headers.Authorization=`Bearer ${credential.key}`;
  return headers;
}
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function finite(v:unknown,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback;}
Deno.serve(async (req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  const len=Number(req.headers.get('content-length')||0);if(len>65536)return json({error:'payload_too_large'},413);
  const baseUrl=Deno.env.get('SUPABASE_URL')??'',credential=getSecretCredential();if(!baseUrl||!credential.key)return json({error:'runtime_not_configured'},503);
  let body:any;try{body=await req.json();}catch{return json({error:'invalid_json'},400);}
  const fingerprint=String(body?.fingerprint||'');const backend=String(body?.backend||'unknown');const tier=String(body?.tier||'medium');const s=body?.summary||{};
  if(!/^[0-9a-f]{6,64}$/.test(fingerprint))return json({error:'invalid_fingerprint'},400);
  if(!['webgpu','webgl2','canvas2d','unknown'].includes(backend)||!['low','medium','high','ultra'].includes(tier))return json({error:'invalid_classification'},400);
  const sampleCount=Math.round(clamp(finite(s.count,0),1,1000000));
  const row={fingerprint,backend,tier,sample_count:sampleCount,p10_fps:clamp(finite(s.p10),0,1000),p50_fps:clamp(finite(s.p50),0,1000),p90_fps:clamp(finite(s.p90),0,1000),avg_fps:clamp(finite(s.avg),0,1000),max_visible:Math.round(clamp(finite(s.maxVisible),0,1000000)),updated_at:new Date().toISOString()};
  const headers=serviceHeaders(credential,{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'});
  const upsert=await fetch(`${baseUrl}/rest/v1/pixel_animation_device_baselines?on_conflict=fingerprint,backend,tier`,{method:'POST',headers,body:JSON.stringify(row)});if(!upsert.ok){console.error('baseline upsert',upsert.status,await upsert.text());return json({error:'baseline_write_failed'},503);}
  let learned=false;
  if(sampleCount>=20){
    const cfgRes=await fetch(`${baseUrl}/rest/v1/pixel_animation_runtime_policy?select=policy&policy_key=eq.default&limit=1`,{headers:serviceHeaders(credential)});
    if(cfgRes.ok){const rows=await cfgRes.json();const base=rows?.[0]?.policy;const t=base?.tiers?.[tier];if(t){let maxVisible=finite(t.maxVisible,4000),resolutionScale=finite(t.resolutionScale,1);if(row.p10_fps<50){maxVisible=Math.floor(maxVisible*.90);resolutionScale=Math.max(.55,resolutionScale-.05);}else if(row.p10_fps>58&&row.p50_fps>59){maxVisible=Math.floor(maxVisible*1.05);}const patch={tiers:{[tier]:{maxVisible,resolutionScale:Number(resolutionScale.toFixed(2)),farUpdateHz:finite(t.farUpdateHz,12)}}};const evidence={backend,sampleCount,p10:row.p10_fps,p50:row.p50_fps,p90:row.p90_fps,updatedAt:row.updated_at};const lr={fingerprint,tier,version:1,policy_patch:patch,evidence,enabled:true,updated_at:row.updated_at};const lrRes=await fetch(`${baseUrl}/rest/v1/pixel_animation_learned_policy?on_conflict=fingerprint,tier`,{method:'POST',headers,body:JSON.stringify(lr)});learned=lrRes.ok;if(!lrRes.ok)console.error('learned upsert',lrRes.status,await lrRes.text());}}
  }
  return json({ok:true,learned,sampleCount});
});
