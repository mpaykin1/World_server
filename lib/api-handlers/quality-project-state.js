let neon=null;try{({neon}=require('@neondatabase/serverless'))}catch(_){}
function c(x,n=180){return String(x??'').slice(0,n)}
module.exports = async function handler(req,res){
  if(!process.env.DATABASE_URL||!neon)return res.status(503).json({ok:false,durable:false,error:'DATABASE_URL-not-configured'});
  const sql=neon(process.env.DATABASE_URL);
  if(req.method==='GET'){
    const project=c(req.query?.project||'');if(!project)return res.status(400).json({ok:false,error:'project-required'});
    const rows=await sql`select * from quality_project_state where project_id=${project}`;return res.status(200).json({ok:true,state:rows[0]||null});
  }
  if(req.method==='POST'){
    const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{},project=c(b.project);if(!project)return res.status(400).json({ok:false,error:'project-required'});
    await sql`insert into quality_project_state(project_id,runtime_hash,protection_pack_hash,quality_genome_hash,last_known_good_build,release_blocked,block_reason,updated_at) values(${project},${c(b.runtimeHash)},${c(b.protectionPackHash)},${c(b.qualityGenomeHash)},${c(b.lastKnownGoodBuild)},${b.releaseBlocked===true},${c(b.blockReason,500)},now()) on conflict(project_id) do update set runtime_hash=excluded.runtime_hash,protection_pack_hash=excluded.protection_pack_hash,quality_genome_hash=excluded.quality_genome_hash,last_known_good_build=excluded.last_known_good_build,release_blocked=excluded.release_blocked,block_reason=excluded.block_reason,updated_at=now()`;
    return res.status(200).json({ok:true,durable:true});
  }
  res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,error:'method-not-allowed'});
}
