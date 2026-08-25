import { neon } from '@neondatabase/serverless';
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method-not-allowed'});}
  if(!process.env.DATABASE_URL)return res.status(503).json({ok:false,error:'DATABASE_URL-not-configured'});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!process.env.QUALITY_EXPORT_TOKEN||token!==process.env.QUALITY_EXPORT_TOKEN)return res.status(401).json({ok:false,error:'unauthorized'});
  const sql=neon(process.env.DATABASE_URL);const incidents=await sql`select fingerprint,project_id,world_id,error_id,detail,occurrences,first_seen,last_seen,protection_status from quality_runtime_incidents where protection_status in ('needs-protection','protected-recurrence') order by last_seen desc limit 500`;
  const evidence=await sql`select fingerprint,project_id,world_id,build_id,session_id,device,payload,created_at from quality_incident_evidence order by created_at desc limit 2000`;
  return res.status(200).json({schemaVersion:1,generatedAt:new Date().toISOString(),incidents,evidence});
}
