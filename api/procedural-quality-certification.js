let createClient=null;try{({createClient}=require('@supabase/supabase-js'))}catch(_){}
function db(){const k=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;return createClient&&process.env.SUPABASE_URL&&k?createClient(process.env.SUPABASE_URL,k,{auth:{persistSession:false}}):null}
const REQUIRED=['mobile-ios','mobile-android','desktop-igpu','desktop-dgpu'];
module.exports=async function(req,res){res.setHeader('Cache-Control','no-store');const d=db();if(!d)return res.status(200).json({ok:true,version:8,persistent:false,certified:false,required:REQUIRED,coverage:[]});
 try{const out=await d.from('procedural_quality_device_reports').select('device_class,physical,verified,metrics,created_at').eq('physical',true).order('created_at',{ascending:false}).limit(500);if(out.error)throw out.error;
  const rows=out.data||[],coverage=REQUIRED.map(c=>{const xs=rows.filter(r=>r.device_class===c),good=xs.filter(r=>{const p95=Number(r.metrics?.p95FrameMs||999);return p95<=40});return{deviceClass:c,samples:xs.length,good:good.length,verified:xs.some(x=>x.verified===true),pass:good.length>0}});
  return res.status(200).json({ok:true,version:8,persistent:true,certified:coverage.every(x=>x.pass),required:REQUIRED,coverage,totalPhysical:rows.length});
 }catch(e){return res.status(200).json({ok:true,version:8,persistent:false,certified:false,error:String(e?.message||e).slice(0,180),required:REQUIRED,coverage:[]})}};
