'use strict';

async function persistRun(admin, run, evidence = {}) {
  const client = admin.schema('private');
  const runKey = `${run.startedAt || new Date().toISOString()}|${run.mode}|${run.summary?.scanned || 0}`;
  const payload = { run_key: runKey, mode: String(run.mode || 'observe'), status: run.verification?.some(v=>!v.ok) ? 'failed' : 'complete', summary: run.summary || {}, evidence };
  const { error } = await client.from('quality_autopilot_runs').upsert(payload, { onConflict: 'run_key' });
  if (error) throw error;
  return runKey;
}

async function persistRegressionKb(admin, kb) {
  const rules=(kb?.rules||[]).map(r=>({rule_id:r.id,signature:r.signature,rule:r,confidence:Number(r.confidence||0),blocked_regressions:Number(r.blockedRegressions||0),updated_at:r.updatedAt||new Date().toISOString()}));
  if (!rules.length) return 0;
  const { error } = await admin.schema('private').from('quality_regression_kb').upsert(rules, { onConflict: 'rule_id' });
  if (error) throw error; return rules.length;
}

async function persistCanaryDecision(admin, { projectId, releaseId, result }) {
  const row={project_id:projectId,release_id:releaseId,stage_percent:Number(result.traffic||result.nextTraffic||1),decision:result.decision,evidence:result};
  const { error }=await admin.schema('private').from('quality_canary_decisions').insert(row); if(error)throw error; return row;
}
module.exports={persistCanaryDecision,persistRegressionKb,persistRun};
