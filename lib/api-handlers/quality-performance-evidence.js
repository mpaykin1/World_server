import { neon } from '@neondatabase/serverless';
const SAFE_KNOBS=new Set(['decodeConcurrency','distantTickHz','shadowUpdateIntervalFrames','reflectionUpdateIntervalFrames','farAudioUpdateHz','streamingPrefetchSeconds','animationFarHz','physicsSleepDelaySec','networkFarHz','backgroundBakeConcurrency']);
const clean=(x,n=120)=>String(x??'').slice(0,n);
function sanitizeSchedule(s){const out={};if(!s||typeof s!=='object')return out;for(const [k,v] of Object.entries(s)){if(SAFE_KNOBS.has(k)&&Number.isFinite(+v))out[k]=+v;}return out;}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'method-not-allowed'});}
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const row={project:clean(b.project||'unknown'),world:clean(b.worldId||''),build:clean(b.buildId||''),device:clean(b.deviceProfile||'unknown'),avg:Number.isFinite(+b.avgFps)?+b.avgFps:null,p95:Number.isFinite(+b.p95FrameMs)?+b.p95FrameMs:null,p99:Number.isFinite(+b.p99FrameMs)?+b.p99FrameMs:null,hitches:Number.isFinite(+b.hitchCount)?Math.max(0,Math.trunc(+b.hitchCount)):0,source:Number.isFinite(+b.sourceFidelity)?+b.sourceFidelity:100,near:Number.isFinite(+b.nearFieldFidelity)?+b.nearFieldFidelity:100,visual:Number.isFinite(+b.visualScore)?+b.visualScore:null,schedule:sanitizeSchedule(b.schedule),payload:b.payload&&typeof b.payload==='object'?b.payload:{}};
  const qualitySafe=row.source>=100&&row.near>=100&&(row.visual===null||row.visual>=99);
  if(!qualitySafe)return res.status(409).json({ok:false,error:'quality-regression-evidence-rejected',sourceFidelity:row.source,nearFieldFidelity:row.near,visualScore:row.visual});
  if(!process.env.DATABASE_URL){console.log('QUALITY_PERFORMANCE_EVIDENCE',JSON.stringify(row));return res.status(202).json({ok:true,durable:false,qualitySafe:true,safeSchedule:row.schedule});}
  const sql=neon(process.env.DATABASE_URL);
  await sql`insert into quality_performance_evidence(project_id,world_id,build_id,device_profile,avg_fps,p95_frame_ms,p99_frame_ms,hitch_count,source_fidelity,near_field_fidelity,visual_score,schedule,payload) values(${row.project},${row.world},${row.build},${row.device},${row.avg},${row.p95},${row.p99},${row.hitches},${row.source},${row.near},${row.visual},${JSON.stringify(row.schedule)}::jsonb,${JSON.stringify(row.payload)}::jsonb)`;
  return res.status(200).json({ok:true,durable:true,qualitySafe:true,safeSchedule:row.schedule});
}
