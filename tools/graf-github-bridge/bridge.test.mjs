import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {Store, validateJob, GithubClient, Worker, serve} from './bridge.mjs';
const repos=['mpaykin1/World_server'];
function job(x={}){return {repo:repos[0],action:'create_issue',payload:{title:'Bridge test',body:'Hello'},...x}}
test('allowlist and strict job validation',()=>{
 const x=validateJob(job(),repos);assert.equal(x.action,'create_issue');
 assert.throws(()=>validateJob(job({repo:'other/repo'}),repos),/not allowed/);
 assert.throws(()=>validateJob(job({action:'delete_repo'}),repos),/Unsupported/);
 assert.throws(()=>validateJob(job({action:'create_pr',payload:{title:'T',head:'main',base:'main'}}),repos),/Invalid PR branches/);
 assert.throws(()=>validateJob(job({action:'update_issue',payload:{issue_number:1}}),repos),/No changes/);
});
test('persistent queue enforces identical idempotency and restart recovery',()=>{
 const dir=mkdtempSync(join(tmpdir(),'graf-'));try{
  const file=join(dir,'q.json');const s=new Store(file);
  const x=s.submit(validateJob(job(),repos),'job-testing-id-123');
  assert.equal(x.existing,false);
  assert.equal(s.submit(validateJob(job(),repos),'job-testing-id-123').existing,true);
  assert.throws(()=>s.submit(validateJob(job({payload:{title:'Changed'}}),repos),'job-testing-id-123'),/different/);
  s.update(x.job,{status:'running'});
  const t=new Store(file);assert.equal(t.jobs[0].status,'queued');assert.equal(t.jobs.length,1);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('retry transient error, block permanent error, complete successfully',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'graf-'));try{
  const s=new Store(join(dir,'queue.json'));
  const {job:j}=s.submit(validateJob(job(),repos),'job-testing-id-234');
  let calls=0;
  const g={execute:async()=>{calls++;if(calls===1){let e=new Error('503');e.transient=true;throw e}return {number:5,url:'https://github.com/example'}}};
  const w=new Worker(s,g,3);await w.tick();assert.equal(j.status,'queued');
  j.nextAt=Date.now()-1;await w.tick();assert.equal(j.status,'done');assert.equal(calls,2);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('create operation checks marker before POST after uncertain completion',async()=>{
 const c={repos,appId:'1',installationId:'2',pem:'dummy',apiBase:'https://api.github.com'};
 const gh=new GithubClient(c);let posts=0;
 gh.api=async(_repo,method,path,_body)=>{
  if(method==='GET')return [{id:10,number:123,html_url:'https://github.com/test/issues/123',body:'<!-- graf-bridge:jobid -->'}];
  posts++;return {number:999};
 };
 const result=await gh.execute({id:'jobid',...validateJob(job(),repos)});
 assert.equal(posts,0);assert.equal(result.number,123);assert.equal(result.deduplicated,true);
});
test('http auth and queue submission, no secrets in job response',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'graf-'));
 const config={token:'a'.repeat(64),repos,dataFile:join(dir,'q.json'),host:'127.0.0.1',port:0,interval:10000,maxAttempts:2};
 const {server}=serve(config,undefined,{execute:async()=>({number:8,url:'https://github.com/ok'}),diagnostic:async()=>({issuesReadable:true})});
 try{
  await once(server,'listening'); const origin=`http://127.0.0.1:${server.address().port}`;
  const unauth=await fetch(`${origin}/v1/jobs`);assert.equal(unauth.status,401);
  const res=await fetch(`${origin}/v1/jobs`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'idempotency-key':'job-http-id-123','content-type':'application/json'},body:JSON.stringify(job())});
  assert.equal(res.status,202);const a=await res.json();assert.ok(a.id);assert.ok(!JSON.stringify(a).includes(config.token));
  await new Promise(resolve=>setImmediate(resolve));
  const r=await fetch(`${origin}/v1/jobs/${a.id}`,{headers:{authorization:`Bearer ${config.token}`}});
  const got=await r.json();assert.equal(got.status,'done');
  const same=await fetch(`${origin}/v1/jobs`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'idempotency-key':'job-http-id-123','content-type':'application/json'},body:JSON.stringify(job())});assert.equal(same.status,200);
 }finally{server.close();rmSync(dir,{recursive:true,force:true})}
});
