const crypto=require('crypto');let createClient=null;try{({createClient}=require('@supabase/supabase-js'))}catch(_){}
function db(){const k=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;return createClient&&process.env.SUPABASE_URL&&k?createClient(process.env.SUPABASE_URL,k,{auth:{persistSession:false}}):null}
const clean=x=>JSON.parse(JSON.stringify(x||{}).slice(0,30000)),txt=(v,n=120)=>String(v??'').slice(0,n);
module.exports=async function(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false});
 const b=clean(req.body),row={id:crypto.randomUUID(),schema_version:10,scene:txt(b.scene||'generic'),stage:txt(b.stage||'preview-canary',32),status:txt(b.status||'candidate',32),metrics:b.metrics||{},evidence:b.evidence||{},created_at:new Date().toISOString()};
 const d=db();if(!d)return res.status(200).json({ok:true,version:10,persistent:false,id:row.id});
 try{const o=await d.from('procedural_quality_canary_runs').insert(row);if(o.error)throw o.error;return res.status(200).json({ok:true,version:10,persistent:true,id:row.id})}
 catch(e){return res.status(200).json({ok:true,version:10,persistent:false,id:row.id,warning:txt(e?.message||e,180)})}};
