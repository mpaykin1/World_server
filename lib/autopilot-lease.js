// Dependency-free, deterministic task leasing core. Storage is supplied by the caller.
export function claim(tasks, id, agent, now, ttl = 300000) {
  if (!Number.isFinite(now) || !Number.isFinite(ttl) || ttl <= 0) throw Error('invalid clock/ttl');
  if (!agent || !id) throw Error('missing agent/id');
  const task = tasks.find(t => t.id === id);
  if (!task) throw Error('task not found');
  if (task.status === 'done' || task.status === 'awaiting_owner') throw Error('task locked');
  if (task.lease && task.lease.until > now && task.lease.agent !== agent) throw Error('leased');
  return tasks.map(t => t.id === id ? {...t, status:'running', lease:{agent, until:now+ttl}, attempts:(t.attempts||0)+1} : t);
}
export function finish(tasks, id, agent, now, evidence) {
  const task = tasks.find(t => t.id === id);
  if (!task || task.status !== 'running' || !task.lease || task.lease.agent !== agent || task.lease.until <= now) throw Error('not lease owner');
  if (!evidence || !evidence.tests || !evidence.commit) throw Error('missing evidence');
  return tasks.map(t => t.id === id ? {...t,status:'awaiting_owner',lease:null,evidence} : t);
}
export function ownerDecision(tasks, id, decision) {
  if (!['PASS','FAIL'].includes(decision)) throw Error('owner decision must be PASS or FAIL');
  const task=tasks.find(t=>t.id===id);
  if (!task || task.status!=='awaiting_owner') throw Error('not awaiting owner');
  return tasks.map(t=>t.id===id ? {...t,status:decision==='PASS'?'done':'queued',decision,decisionPendingAnalysis:true} : t);
}
export function reclaimExpired(tasks, now) {
  return tasks.map(t=>t.status==='running' && t.lease?.until<=now ? {...t,status:'queued',lease:null} : t);
}
