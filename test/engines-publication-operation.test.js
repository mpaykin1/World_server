'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createGenerationService}=require('../lib/engines/generation-service.cjs');
const {createPublicationOperation}=require('../lib/engines/publication-operation.cjs');
const f=require('./fixtures/meta-game-vault.json');const sourceCommit='a'.repeat(40);
function setup(gameId='generated-publication-probe'){const s=createGenerationService({sourceCommit});const card=structuredClone(f.gameCard);
 card.id=gameId;const id=s.createGame({gameCard:card,randomSeed:f.randomSeed}).artifact_id;
 const artifact=s.previewGame(id).package;let writes=0,mode='open',delivery=true,approval=true;
 const candidate={repository:'mpaykin1/meta6',base:'main',number:1,
  url:'https://github.com/mpaykin1/meta6/pull/1',manifest_sha256:id};
 const backend={approveArtifact:async()=>approval?{manifest_sha256:id,source_commit:sourceCommit,
  browser:'passed',rights:'approved',approval_id:'host-approved-artifact'}:null,
  ensureCandidate:async d=>{writes++;assert.equal(d.create_only,true);
   assert.equal(d.directory,'meta-games-worlds/generated-publication-probe/');
   assert.equal(d.operation_id,id);assert.equal(d.package.manifest_sha256,id);return candidate;},
  inspectCandidate:async()=>({...candidate,merged:mode!=='open',merge_commit:'b'.repeat(40),
   release_checks:'passed',acceptance_commit:mode==='stale'?'c'.repeat(40):'b'.repeat(40),
   owner_acceptance:'approved'})};
 const op=createPublicationOperation({sourceCommit,readArtifact:()=>artifact,backend,
  verifyDelivery:async()=>({delivery:delivery?'verified':'not_verified',manifest_sha256:id,
   source_commit:sourceCommit,url:'https://mpaykin1.github.io/meta6/meta-games-worlds/generated-publication-probe/'})});
 return {op,id,backend,artifact,writes:()=>writes,mode:x=>mode=x,delivery:x=>delivery=x,approval:x=>approval=x};}
test('concurrent duplicate operations share one candidate; PR is not publication',async()=>{
 const x=setup();const [a,b]=await Promise.all([x.op({artifact_id:x.id}),x.op({artifact_id:x.id})]);
 assert.deepEqual(a,b);assert.equal(x.writes(),1);assert.equal(a.state,'pending_review');
 assert.equal(a.publication,'not_published');
});
test('merged release needs exact merge acceptance and actual delivery before published',async()=>{
 const x=setup();x.mode('stale');assert.equal((await x.op({artifact_id:x.id})).state,'pending_release_acceptance');
 x.mode('merged');x.delivery(false);assert.equal((await x.op({artifact_id:x.id})).state,'pending_public_delivery');
 x.delivery(true);const r=await x.op({artifact_id:x.id});assert.equal(r.publication,'published');
 assert.equal(r.merge_commit,'b'.repeat(40));
});
test('caller evidence, denied rights and corrupt package never create candidates',async()=>{
 const x=setup();await assert.rejects(x.op({artifact_id:x.id,rights:'approved'}));
 x.approval(false);await assert.rejects(x.op({artifact_id:x.id}),/acceptance/);assert.equal(x.writes(),0);
 x.approval(true);x.artifact.files['game.js']+='corrupt';
 await assert.rejects(x.op({artifact_id:x.id}),/Invalid/);assert.equal(x.writes(),0);
 assert.throws(()=>createPublicationOperation({sourceCommit,readArtifact:()=>x.artifact}),/backend/);
});
test('accepted game routes and mismatched repository candidates are rejected',async()=>{
 const existing=setup('witness-vault');
 await assert.rejects(existing.op({artifact_id:existing.id}),/new generated/);
 assert.equal(existing.writes(),0);
 const x=setup();x.backend.ensureCandidate=async()=>({repository:'another/repository',base:'main',
  number:1,url:'https://github.com/mpaykin1/meta6/pull/1',manifest_sha256:x.id});
 await assert.rejects(x.op({artifact_id:x.id}),/candidate mismatch/);
});
test('malformed merged receipt must not promote a string false to publication',async()=>{
 const x=setup();const inspect=x.backend.inspectCandidate;x.mode('merged');
 x.backend.inspectCandidate=async()=>({...await inspect(),merged:'false'});
 await assert.rejects(x.op({artifact_id:x.id}),/status mismatch/);
});
