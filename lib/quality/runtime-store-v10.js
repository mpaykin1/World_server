'use strict';
function creds(){const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'';const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'';return {url,key};}
async function insert(table,row){const {url,key}=creds();if(!url||!key)return {ok:false,status:'HOLD',reason:'server-supabase-credentials-missing'};const r=await fetch(`${url.replace(/\/$/,'')}/rest/v1/${table}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(row)});const body=await r.json().catch(()=>null);return r.ok?{ok:true,status:'PASS',body}:{ok:false,status:'HOLD',reason:`supabase-${r.status}`,body};}
async function persistPromotionAttestation(row){return insert('quality_promotion_attestations_v10',row);}
async function persistRestoreDrill(row){return insert('quality_restore_drills_v10',row);}
module.exports={persistPromotionAttestation,persistRestoreDrill,creds};
