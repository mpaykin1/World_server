const crypto=require('crypto');let createClient=null;try{({createClient}=require('@supabase/supabase-js'))}catch(_){}
const clean=x=>JSON.parse(JSON.stringify(x||{}).slice(0,20000)),txt=(v,n=300)=>String(v??'').slice(0,n),num=v=>Number.isFinite(Number(v))?Number(v):null;
function db(){const k=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;return createClient&&process.env.SUPABASE_URL&&k?createClient(process.env.SUPABASE_URL,k,{auth:{persistSession:false}}):null}
module.exports=async function(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false});
 const b=clean(req.body),row={id:crypto.randomUUID(),schema_version:8,device_class:txt(b.deviceClass,64)||'unknown',physical:b.physical!==false,
  user_agent:txt(b.userAgent,500),screen:b.screen||{},hardware:b.hardware||{},metrics:b.metrics||{},app_path:txt(b.app,240),verified:false,created_at:new Date().toISOString()};
 const d=db();if(!d)return res.status(200).json({ok:true,version:8,persistent:false,id:row.id});
 try{const out=await d.from('procedural_quality_device_reports').insert(row);if(out.error)throw out.error;return res.status(200).json({ok:true,version:8,persistent:true,id:row.id})}
 catch(e){return res.status(200).json({ok:true,version:8,persistent:false,id:row.id,warning:txt(e.message||e,180)})}};
