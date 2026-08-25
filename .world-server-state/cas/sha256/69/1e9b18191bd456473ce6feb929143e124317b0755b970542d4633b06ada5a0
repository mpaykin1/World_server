import process from 'node:process';
if(!process.env.DATABASE_URL){console.log(JSON.stringify({pass:false,external:true,state:'DATABASE_URL-not-configured'}));process.exit(2);}
let neon;try{({neon}=await import('@neondatabase/serverless'));}catch(e){console.error(JSON.stringify({pass:false,state:'neon-package-missing',error:String(e)}));process.exit(2);}
const sql=neon(process.env.DATABASE_URL);const probe=`v8-smoke-${Date.now()}`;const device=`${probe}-device`;
try{
  await sql`insert into quality_project_state(project_id,runtime_hash,protection_pack_hash,quality_genome_hash,last_known_good_build,release_blocked,block_reason,updated_at) values(${probe},'smoke','smoke','smoke','smoke',false,'',now()) on conflict(project_id) do update set updated_at=now()`;
  await sql`insert into quality_performance_evidence(project_id,world_id,build_id,device_profile,avg_fps,p95_frame_ms,p99_frame_ms,hitch_count,source_fidelity,near_field_fidelity,visual_score,schedule,payload) values(${probe},'smoke-world','smoke-build',${device},60,17,19,0,100,100,100,'{}'::jsonb,'{}'::jsonb)`;
  await sql`insert into quality_device_schedules(device_profile,schedule,source_fidelity_floor,near_field_fidelity_floor,evidence_samples,evidence_projects,ratchet_approved,updated_at) values(${device},'{}'::jsonb,100,100,1,1,false,now()) on conflict(device_profile) do update set updated_at=now()`;
  const rows=await sql`select project_id,release_blocked from quality_project_state where project_id=${probe}`;
  const perf=await sql`select project_id,source_fidelity,near_field_fidelity from quality_performance_evidence where project_id=${probe} order by id desc limit 1`;
  const sched=await sql`select device_profile from quality_device_schedules where device_profile=${device}`;
  await sql`delete from quality_performance_evidence where project_id=${probe}`;
  await sql`delete from quality_device_schedules where device_profile=${device}`;
  await sql`delete from quality_project_state where project_id=${probe}`;
  const pass=rows.length===1&&rows[0].project_id===probe&&perf.length===1&&Number(perf[0].source_fidelity)===100&&Number(perf[0].near_field_fidelity)===100&&sched.length===1;
  console.log(JSON.stringify({pass,external:true,state:'durable-neon-v8-roundtrip',projectRows:rows.length,performanceRows:perf.length,scheduleRows:sched.length}));process.exit(pass?0:1);
}catch(e){console.error(JSON.stringify({pass:false,external:true,state:'neon-v8-roundtrip-failed',error:String(e?.message||e)}));process.exit(1);}
