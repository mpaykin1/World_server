'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createGameArtifact}=require('../lib/engines/game-builder.cjs');
const {createGithubPublicationBackend}=require('../lib/engines/github-publication-backend.cjs');
const {createPublicationOperation}=require('../lib/engines/publication-operation.cjs');
const f=require('./fixtures/meta-game-vault.json');
const sha=x=>createHash('sha1').update(JSON.stringify(x)).digest('hex');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');
function fixture(){
 const artifact=createGameArtifact({...f,gameCard:{...f.gameCard,id:'generated-backend-test'},sourceCommit:'a'.repeat(40)});
 const descriptor={repository:'mpaykin1/meta6',base:'main',create_only:true,operation_id:artifact.manifest_sha256,
  directory:'meta-games-worlds/generated-backend-test/',package:artifact};
 const main='b'.repeat(40),baseTree='c'.repeat(40),refs=new Map([['main',main]]),trees=new Map(),commits=new Map([[main,{sha:main,tree:{sha:baseTree},parents:[]}]]),prs=[];
 const state={occupied:false,timeoutRef:false,timeoutPr:false,tamper:false,symlink:false,writes:[],release:null};
 const request=async({method,path,body})=>{
  assert.ok(path.startsWith('/repos/mpaykin1/meta6/'));
  const p=path.slice('/repos/mpaykin1/meta6'.length),ok=data=>({status:200,data});
  if(method==='POST')state.writes.push(p);
  if(method==='GET'&&p.startsWith('/pulls?'))return ok(prs);
  if(method==='GET'&&/^\/pulls\/\d+$/.test(p))return ok(prs.find(x=>x.number===Number(p.split('/').pop())));
  if(method==='GET'&&p.startsWith('/git/ref/heads/')){const s=refs.get(p.slice('/git/ref/heads/'.length));return s?ok({object:{sha:s}}):{status:404};}
  if(method==='GET'&&p.startsWith('/contents/'))return state.occupied?ok([]):{status:404};
  if(method==='GET'&&p.startsWith('/git/commits/'))return ok(commits.get(p.split('/').pop()));
  if(method==='GET'&&p.startsWith('/git/trees/')){
   const tail=p.slice('/git/trees/'.length),isFiles=tail.endsWith('?recursive=1');
   const entries=[...trees.values()][0];
   if(isFiles)return ok({truncated:false,tree:entries.map(e=>({path:e.path.slice(descriptor.directory.length),type:'blob',mode:state.symlink?'120000':'100644',sha:blob(e.content)}))});
   return ok({truncated:false,tree:[{path:tail==='d'.repeat(40)?'generated-backend-test':'meta-games-worlds',type:'tree',mode:'040000',sha:tail==='d'.repeat(40)?'e'.repeat(40):'d'.repeat(40)}]});
  }
  if(method==='GET'&&p.startsWith('/compare/')){
   const head=p.split('...')[1],c=commits.get(head),entries=trees.get(c.tree.sha);
   return ok({total_commits:1,commits:[{sha:head}],files:entries.map((e,i)=>({filename:e.path,status:'added',sha:state.tamper&&i===0?'d'.repeat(40):blob(e.content)}))});
  }
  if(method==='POST'&&p==='/git/trees'){const s=sha(body);trees.set(s,body.tree);return ok({sha:s});}
  if(method==='POST'&&p==='/git/commits'){const s=sha(body);commits.set(s,{sha:s,tree:{sha:body.tree},parents:body.parents.map(sha=>({sha}))});return ok({sha:s});}
  if(method==='POST'&&p==='/git/refs'){
   const branch=body.ref.slice('refs/heads/'.length);
   if(refs.has(branch))return {status:422};refs.set(branch,body.sha);
   if(state.timeoutRef)throw Error('network timeout after successful ref write');return ok({});
  }
  if(method==='POST'&&p==='/pulls'){
   if(prs.length)return {status:422};
   const pr={number:1,html_url:'https://github.com/mpaykin1/meta6/pull/1',state:'open',merged:false,
    base:{ref:'main',repo:{full_name:'mpaykin1/meta6'}},head:{ref:body.head,sha:refs.get(body.head),repo:{full_name:'mpaykin1/meta6'}}};
   prs.push(pr);if(state.timeoutPr)throw Error('network timeout after successful PR write');return ok(pr);
  }
  throw Error('Unexpected request '+method+' '+p);
 };
 const make=()=>createGithubPublicationBackend({request,approveArtifact:async a=>({manifest_sha256:a.manifest_sha256,source_commit:a.manifest.source_commit,browser:'passed',rights:'approved',approval_id:'test-only'}),acceptRelease:async()=>state.release});
 return {descriptor,state,refs,prs,make};
}
test('two instances, concurrent requests and restart reuse one remote candidate',async()=>{
 const x=fixture(),a=x.make(),b=x.make();
 const results=await Promise.all([a.ensureCandidate(x.descriptor),b.ensureCandidate(x.descriptor)]);
 assert.deepEqual(results[0],results[1]);assert.equal(x.prs.length,1);assert.equal(x.refs.size,2);
 const before=x.state.writes.length;
 assert.deepEqual(await x.make().ensureCandidate(x.descriptor),results[0]);
 assert.equal(x.state.writes.length,before);
 const status=await a.inspectCandidate(1);assert.equal(status.merged,false);
 assert.equal(status.manifest_sha256,x.descriptor.operation_id);
});
test('uncertain successful ref and PR writes recover without a duplicate',async()=>{
 const x=fixture();x.state.timeoutRef=true;x.state.timeoutPr=true;
 const result=await x.make().ensureCandidate(x.descriptor);
 assert.equal(result.number,1);assert.equal(x.prs.length,1);
 assert.equal(x.state.writes.filter(p=>p==='/pulls').length,1);
 assert.equal(x.state.writes.filter(p=>p==='/git/refs').length,1);
});
test('occupied route, caller repository and corrupt package fail before writes',async()=>{
 const x=fixture();x.state.occupied=true;
 await assert.rejects(x.make().ensureCandidate(x.descriptor),/route already exists/);
 x.state.occupied=false;
 await assert.rejects(x.make().ensureCandidate({...x.descriptor,repository:'someone/else'}));
 await assert.rejects(x.make().ensureCandidate({...x.descriptor,directory:'../accepted/'}));
 const bad=structuredClone(x.descriptor);bad.package.files['game.js']+='tampered';
 await assert.rejects(x.make().ensureCandidate(bad));assert.equal(x.state.writes.length,0);
});
test('existing foreign or tampered candidate fails closed instead of replacing it',async()=>{
 const x=fixture();await x.make().ensureCandidate(x.descriptor);
 const before=x.state.writes.length;x.state.tamper=true;
 await assert.rejects(x.make().ensureCandidate(x.descriptor),/bytes mismatch/);
 x.state.tamper=false;x.state.symlink=true;
 await assert.rejects(x.make().ensureCandidate(x.descriptor),/file mode/);
 x.state.symlink=false;x.prs[0].head.repo.full_name='someone/else';
 await assert.rejects(x.make().ensureCandidate(x.descriptor),/PR mismatch/);
 assert.equal(x.state.writes.length,before);
});
test('merged result exposes only separate host release acceptance, never published',async()=>{
 const x=fixture(),b=x.make();await b.ensureCandidate(x.descriptor);
 x.prs[0].state='closed';x.prs[0].merged=true;x.prs[0].merge_commit_sha='e'.repeat(40);
 x.state.release={release_checks:'passed',owner_acceptance:'approved',acceptance_commit:'f'.repeat(40)};
 const result=await b.inspectCandidate(1);
 assert.equal(result.merge_commit,'e'.repeat(40));assert.equal(result.acceptance_commit,'f'.repeat(40));
 assert.equal(result.publication,undefined); // Coordinator must reject stale acceptance.
 x.prs[0].head.sha='0'.repeat(40);
 await assert.rejects(b.inspectCandidate(1),/PR changed/);
 assert.throws(()=>createGithubPublicationBackend({}),/Trusted GitHub/);
});
test('existing coordinator consumes concrete backend and retains pending publication',async()=>{
 const x=fixture();
 const publish=createPublicationOperation({sourceCommit:'a'.repeat(40),readArtifact:()=>x.descriptor.package,backend:x.make(),
  verifyDelivery:async()=>{throw Error('Unmerged candidate must not invoke public delivery');}});
 const result=await publish({artifact_id:x.descriptor.operation_id});
 assert.equal(result.state,'pending_review');assert.equal(result.publication,'not_published');
 assert.equal(x.prs.length,1);
});
