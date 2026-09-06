#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {ROOT,STATE_DIR,ensureDir,nowIso,writeJSON}=require('./integration-utils.cjs');
ensureDir(STATE_DIR);
let DatabaseSync;try{({DatabaseSync}=require('node:sqlite'))}catch(e){console.error('[DURABLE_QUEUE] node:sqlite unavailable:',e.message);process.exit(3)}
const DB=process.env.WORLD_SERVER_QUEUE_DB?path.resolve(process.env.WORLD_SERVER_QUEUE_DB):path.join(STATE_DIR,'system-jobs.sqlite');ensureDir(path.dirname(DB));
const db=new DatabaseSync(DB,{timeout:5000});
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS jobs(
 id TEXT PRIMARY KEY,
 dedupe_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL,
 payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued',
 priority INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 max_attempts INTEGER NOT NULL DEFAULT 3,
 available_at INTEGER NOT NULL,
 lease_owner TEXT,
 lease_until INTEGER,
 checkpoint TEXT,
 result TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 last_error TEXT,
 dead_at INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_pick ON jobs(status,available_at,priority DESC,created_at);
CREATE INDEX IF NOT EXISTS jobs_lease ON jobs(status,lease_until);
CREATE TABLE IF NOT EXISTS job_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,event TEXT NOT NULL,data TEXT,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS job_events_job ON job_events(job_id,seq);`);
function tx(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){try{db.exec('ROLLBACK')}catch{}throw e}}
function emit(id,event,data={}){db.prepare('INSERT INTO job_events(job_id,event,data,created_at) VALUES(?,?,?,?)').run(id,event,JSON.stringify(data),Date.now())}
function json(v,f={}){try{return JSON.parse(v)}catch{return f}}
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v)}
function enqueue(kind,payloadRaw='{}',priority=0,maxAttempts=3,dedupe){const payload=json(payloadRaw,null);if(payload===null)throw new Error('payload must be valid JSON');const canonical=stable(payload);const key=dedupe||crypto.createHash('sha256').update(kind+'\0'+canonical).digest('hex');const id=crypto.createHash('sha256').update(key).digest('hex');const now=Date.now();tx(()=>{db.prepare(`INSERT OR IGNORE INTO jobs(id,dedupe_key,kind,payload,status,priority,max_attempts,available_at,created_at,updated_at) VALUES(?,?,?,?, 'queued',?,?,?,?,?)`).run(id,key,kind,canonical,Number(priority)||0,Math.max(1,Number(maxAttempts)||3),now,now,now);emit(id,'enqueue',{kind,priority:Number(priority)||0,dedupeKey:key})});return {ok:true,id,dedupeKey:key}}
function claim(worker='worker',leaseMs=300000){const now=Date.now();return tx(()=>{const row=db.prepare(`SELECT * FROM jobs WHERE status='queued' AND available_at<=? ORDER BY priority DESC,created_at ASC LIMIT 1`).get(now);if(!row)return null;const until=now+Math.max(1000,Number(leaseMs)||300000);db.prepare(`UPDATE jobs SET status='running',attempts=attempts+1,lease_owner=?,lease_until=?,updated_at=? WHERE id=? AND status='queued'`).run(worker,until,now,row.id);emit(row.id,'claim',{worker,leaseUntil:until});return {...row,status:'running',attempts:Number(row.attempts)+1,lease_owner:worker,lease_until:until,payload:json(row.payload,{})}})}
function heartbeat(id,worker,checkpointRaw='{}',leaseMs=300000){const now=Date.now(),cp=json(checkpointRaw,null);if(cp===null)throw new Error('checkpoint must be JSON');const r=db.prepare(`UPDATE jobs SET checkpoint=?,lease_until=?,updated_at=? WHERE id=? AND status='running' AND lease_owner=?`).run(JSON.stringify(cp),now+Math.max(1000,Number(leaseMs)||300000),now,id,worker);if(Number(r.changes)!==1)throw new Error('job not running or lease owner mismatch');emit(id,'checkpoint',{worker,checkpoint:cp});return {ok:true,id}}
function ack(id,worker,resultRaw='{}'){const result=json(resultRaw,null);if(result===null)throw new Error('result must be JSON');const now=Date.now();const r=db.prepare(`UPDATE jobs SET status='done',result=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status='running' AND lease_owner=?`).run(JSON.stringify(result),now,id,worker);if(Number(r.changes)!==1)throw new Error('job not running or lease owner mismatch');emit(id,'ack',{worker,result});return {ok:true,id}}
function fail(id,worker,error='unknown error',retryDelayMs=5000){const now=Date.now();return tx(()=>{const row=db.prepare('SELECT attempts,max_attempts FROM jobs WHERE id=? AND status=\'running\' AND lease_owner=?').get(id,worker);if(!row)throw new Error('job not running or lease owner mismatch');const dead=Number(row.attempts)>=Number(row.max_attempts);db.prepare(`UPDATE jobs SET status=?,available_at=?,lease_owner=NULL,lease_until=NULL,updated_at=?,last_error=?,dead_at=? WHERE id=?`).run(dead?'dead':'queued',dead?now:now+Math.max(0,Number(retryDelayMs)||0),now,String(error),dead?now:null,id);emit(id,dead?'dead-letter':'retry-scheduled',{worker,error:String(error),attempts:row.attempts,maxAttempts:row.max_attempts});return {ok:true,id,status:dead?'dead':'queued'}})}
function resumeStale(leaseGraceMs=0){const now=Date.now()-Math.max(0,Number(leaseGraceMs)||0);return tx(()=>{const rows=db.prepare(`SELECT id,attempts,max_attempts FROM jobs WHERE status='running' AND lease_until IS NOT NULL AND lease_until<?`).all(now);let queued=0,dead=0;for(const r of rows){const isDead=Number(r.attempts)>=Number(r.max_attempts);db.prepare(`UPDATE jobs SET status=?,available_at=?,lease_owner=NULL,lease_until=NULL,updated_at=?,last_error=?,dead_at=? WHERE id=?`).run(isDead?'dead':'queued',Date.now(),Date.now(),'lease expired',isDead?Date.now():null,r.id);emit(r.id,isDead?'dead-letter':'lease-recovered',{});isDead?dead++:queued++}return {ok:true,recovered:rows.length,queued,dead}})}
function defer(id,worker,reason='resource pressure',delayMs=30000){const now=Date.now();return tx(()=>{const r=db.prepare("UPDATE jobs SET status='queued',attempts=MAX(0,attempts-1),available_at=?,lease_owner=NULL,lease_until=NULL,updated_at=?,last_error=? WHERE id=? AND status='running' AND lease_owner=?").run(now+Math.max(0,Number(delayMs)||0),now,String(reason),id,worker);if(Number(r.changes)!==1)throw new Error('job not running or lease owner mismatch');emit(id,'resource-deferred',{worker,reason:String(reason)});return{ok:true,id,status:'queued'}})}
function retryDead(id){const now=Date.now();const q=id?`id=? AND status='dead'`:`status='dead'`;const stmt=db.prepare(`UPDATE jobs SET status='queued',attempts=0,available_at=?,dead_at=NULL,last_error=NULL,updated_at=? WHERE ${q}`);const r=id?stmt.run(now,now,id):stmt.run(now,now);return {ok:true,requeued:Number(r.changes)}}
function health(){const rows=db.prepare(`SELECT status,count(*) n FROM jobs GROUP BY status`).all();const oldest=db.prepare(`SELECT MIN(created_at) oldest FROM jobs WHERE status IN ('queued','running')`).get();const counts=Object.fromEntries(rows.map(r=>[r.status,Number(r.n)]));const report={schemaVersion:'2.0.0',generatedAt:nowIso(),ok:true,backend:'node:sqlite',journal:'WAL',synchronous:'FULL',idempotency:true,priorityQueue:true,checkpointResume:true,leaseRecovery:true,deadLetterQueue:true,retry:true,counts,oldestActiveAt:oldest?.oldest?new Date(Number(oldest.oldest)).toISOString():null};writeJSON(path.join(ROOT,'DURABLE_QUEUE_STATUS.json'),report);return report}
function events(id){return db.prepare('SELECT seq,event,data,created_at FROM job_events WHERE job_id=? ORDER BY seq ASC').all(id).map(r=>({...r,data:json(r.data,{}),createdAt:new Date(Number(r.created_at)).toISOString()}))}
const [cmd='health',...a]=process.argv.slice(2);
try{let out;if(cmd==='enqueue')out=enqueue(a[0],a[1]||'{}',a[2]||0,a[3]||3,a[4]);else if(cmd==='claim')out=claim(a[0]||`worker-${process.pid}`,a[1]||300000);else if(cmd==='heartbeat')out=heartbeat(a[0],a[1],a[2]||'{}',a[3]||300000);else if(cmd==='ack')out=ack(a[0],a[1],a[2]||'{}');else if(cmd==='fail')out=fail(a[0],a[1],a[2]||'error',a[3]||5000);else if(cmd==='defer')out=defer(a[0],a[1],a[2]||'resource pressure',a[3]??30000);else if(cmd==='resume-stale')out=resumeStale(a[0]||0);else if(cmd==='retry-dead')out=retryDead(a[0]);else if(cmd==='events')out=events(a[0]);else if(cmd==='health')out=health();else throw new Error('usage: durable-job-queue.cjs health | enqueue <kind> <json> [priority] [maxAttempts] [dedupeKey] | claim [worker] [leaseMs] | heartbeat <id> <worker> <checkpoint-json> [leaseMs] | ack <id> <worker> <result-json> | fail <id> <worker> <error> [retryDelayMs] | defer <id> <worker> <reason> [delayMs] | resume-stale [graceMs] | retry-dead [id] | events <id>');console.log(JSON.stringify(out,null,2))}catch(e){console.error('[DURABLE_QUEUE] FAIL',e.stack||e.message);process.exit(2)}
