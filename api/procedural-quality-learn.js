const crypto=require('crypto');
let createClient=null;try{({createClient}=require('@supabase/supabase-js'))}catch(_){}
const mem=globalThis.__PQ_LEARN_MEM__||(globalThis.__PQ_LEARN_MEM__=[]);
function clean(x){return JSON.parse(JSON.stringify(x||{}).slice(0,18000))}
function txt(v,n=96){return String(v??'').slice(0,n)}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function client(){const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;return createClient&&process.env.SUPABASE_URL&&key?createClient(process.env.SUPABASE_URL,key,{auth:{persistSession:false}}):null}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'){
    const scene=txt(req.query?.scene,64),device=txt(req.query?.device,96),deviceClass=txt(req.query?.deviceClass,64),backend=txt(req.query?.backend,32),fingerprint=txt(req.query?.fingerprint,128),db=client();
    if(db)try{
      let q=db.from('procedural_quality_learning').select('scene,device,device_class,render_backend,scene_fingerprint,score,visual_score,animation_score,stability_score,p50_frame_ms,p95_frame_ms,settings,metrics,verified,source,native_coverage_pct,skinned_velocity_pct,regression_free,golden_verified,device_certified,promotion_state,style_profile,baseline_id,created_at')
        .order('device_certified',{ascending:false}).order('golden_verified',{ascending:false}).order('verified',{ascending:false}).order('promotion_state',{ascending:false}).order('score',{ascending:false}).order('created_at',{ascending:false}).limit(1);
      if(scene)q=q.eq('scene',scene);if(device)q=q.eq('device',device);if(deviceClass)q=q.eq('device_class',deviceClass);if(backend)q=q.eq('render_backend',backend);if(fingerprint)q=q.eq('scene_fingerprint',fingerprint);
      const out=await q;if(out.error)throw out.error;return res.status(200).json({ok:true,version:8,persistent:true,recommendation:out.data?.[0]||null});
    }catch(e){return res.status(200).json({ok:true,version:8,persistent:false,recommendation:null,warning:txt(e.message||e,180)})}
    const rows=mem.filter(r=>(!scene||r.scene===scene)&&(!device||r.device===device)).sort((a,b)=>(Number(b.verified)-Number(a.verified))||b.score-a.score);
    return res.status(200).json({ok:true,version:8,persistent:false,recommendation:rows[0]||null,samples:mem.length});
  }
  if(req.method!=='POST')return res.status(405).json({ok:false});
  const b=clean(req.body),m=b.metrics||{},row={
    id:crypto.randomUUID(),schema_version:8,scene:txt(b.scene||'generic',64),device:txt(b.device||'unknown',96),
    device_class:txt(b.deviceClass||m.deviceClass||'',64)||null,render_backend:txt(b.backend||m.backend||'',32)||null,
    scene_fingerprint:txt(b.fingerprint||m.sceneFingerprint||'',128)||null,settings_hash:txt(b.settingsHash||'',128)||null,
    score:num(b.score)||0,visual_score:num(b.visualScore),animation_score:num(b.animationScore),stability_score:num(b.stabilityScore),
    p50_frame_ms:num(b.p50FrameMs??m.p50FrameMs),p95_frame_ms:num(b.p95FrameMs??m.p95FrameMs),
    verified:!!b.verified,source:txt(b.source||'runtime',32),native_coverage_pct:num(b.nativeCoveragePct??m.nativeCoveragePct),skinned_velocity_pct:num(b.skinnedVelocityPct??m.skinnedVelocityPct),regression_free:!!b.regressionFree,golden_verified:!!b.goldenVerified,device_certified:!!b.deviceCertified,promotion_state:txt(b.promotionState||((b.verified&&b.regressionFree&&b.goldenVerified&&Number(b.score||0)>=86)?'promoted':'candidate'),24),style_profile:b.styleProfile||{},baseline_id:b.baselineId||null,settings:b.settings||{},metrics:m,created_at:new Date().toISOString()
  };
  mem.push(row);if(mem.length>256)mem.shift();
  const db=client();if(db)try{const out=await db.from('procedural_quality_learning').insert(row);if(out.error)throw out.error;return res.status(200).json({ok:true,version:8,persistent:true,id:row.id})}
  catch(e){return res.status(200).json({ok:true,version:8,persistent:false,id:row.id,warning:'supabase:'+txt(e.message||e,180)})}
  return res.status(200).json({ok:true,version:8,persistent:false,id:row.id});
};
