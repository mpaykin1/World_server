import { neon } from '@neondatabase/serverless';
function clean(x,n=120){return String(x??'').slice(0,n)}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'method-not-allowed'});}
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const row={trait:clean(b.trait),project:clean(b.project||'unknown'),world:clean(b.worldId||''),build:clean(b.buildId||''),passed:b.passed===true,before:Number.isFinite(+b.metricBefore)?+b.metricBefore:null,after:Number.isFinite(+b.metricAfter)?+b.metricAfter:null,visual:Number.isFinite(+b.visualRegression)?+b.visualRegression:null,source:b.sourceRegression===true,payload:b.payload&&typeof b.payload==='object'?b.payload:{}};
  if(!row.trait)return res.status(400).json({ok:false,error:'trait-required'});
  if(!process.env.DATABASE_URL){console.log('QUALITY_PATTERN_EVIDENCE',JSON.stringify(row));return res.status(202).json({ok:true,durable:false});}
  const sql=neon(process.env.DATABASE_URL);
  await sql`insert into quality_pattern_evidence(trait,project_id,world_id,build_id,passed,metric_before,metric_after,visual_regression,source_regression,payload) values(${row.trait},${row.project},${row.world},${row.build},${row.passed},${row.before},${row.after},${row.visual},${row.source},${JSON.stringify(row.payload)}::jsonb)`;
  const evidence=await sql`select count(distinct project_id)::int as projects,count(*)::int as samples from quality_pattern_evidence where trait=${row.trait} and passed=true and source_regression=false and coalesce(visual_regression,0)<=0`;
  return res.status(200).json({ok:true,durable:true,evidence:evidence[0]||{projects:0,samples:0}});
}
