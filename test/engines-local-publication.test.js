'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLocalGeneratorMcp}=require('../lib/engines/local-generator-mcp.cjs');
const f=require('./fixtures/meta-game-vault.json');
const sourceCommit='a'.repeat(40);
const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}};
const req=(id,name,args)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args,_meta:meta}});
const list={jsonrpc:'2.0',id:1,method:'tools/list',params:{_meta:meta}};
function fixture(){
 let calls=0,descriptor;
 const candidate={repository:'mpaykin1/meta6',base:'main',number:42,url:'https://github.com/mpaykin1/meta6/pull/42'};
 const backend={
  async approveArtifact(a){await Promise.resolve();return {manifest_sha256:a.manifest_sha256,source_commit:sourceCommit,browser:'passed',rights:'approved',approval_id:'test-only'};},
  async ensureCandidate(d){calls++;descriptor=d;return {...candidate,manifest_sha256:d.operation_id};},
  async inspectCandidate(){return {...candidate,manifest_sha256:descriptor.operation_id,merged:false};}
 };
 const h=createLocalGeneratorMcp({sourceCommit,publicationBackend:backend});
 const made=h(req(2,'create_game',{gameCard:{...f.gameCard,id:'generated-mcp-regression'},randomSeed:f.randomSeed,recentGames:f.recentGames}));
 assert.equal(made.result.isError,false);
 return {h,backend,id:made.result.structuredContent.artifact_id,calls:()=>calls,descriptor:()=>descriptor};
}
test('host-configured MCP publication uses actual cached artifact and awaits one shared candidate',async()=>{
 const x=fixture();
 assert.equal(x.h(list).result.tools.at(-1).name,'publish_game');
 const pending=x.h(req(3,'publish_game',{artifact_id:x.id}));
 assert.ok(pending instanceof Promise);
 const duplicate=x.h(req(4,'publish_game',{artifact_id:x.id}));
 const [a,b]=await Promise.all([pending,duplicate]);
 assert.equal(a.id,3);assert.equal(b.id,4);
 for(const r of [a,b]){
  assert.equal(r.result.isError,false);
  assert.equal(r.result.structuredContent.state,'pending_review');
  assert.equal(r.result.structuredContent.publication,'not_published');
 }
 assert.equal(x.calls(),1);
 assert.equal(x.descriptor().directory,'meta-games-worlds/generated-mcp-regression/');
 assert.equal(x.descriptor().package.manifest.source_commit,sourceCommit);
 assert.ok(x.descriptor().package.files['game.js']);
});
test('unconfigured/default host, notifications and caller authority never enable publication',async()=>{
 const plain=createLocalGeneratorMcp({sourceCommit});
 assert.equal(plain(list).result.tools.length,4);
 assert.equal(plain(req(1,'publish_game',{artifact_id:'a'.repeat(64),publicationBackend:{}})).error.code,-32602);
 assert.throws(()=>createLocalGeneratorMcp({sourceCommit,publicationBackend:{}}),/Trusted publication backend/);
 const x=fixture();
 const notification=req(1,'publish_game',{artifact_id:x.id});delete notification.id;
 assert.equal(x.h(notification),null);
 for(const args of [{artifact_id:x.id,rights:'approved'},{artifact_id:x.id,path:'../x'},{artifact_id:'b'.repeat(64)}])
  assert.equal((await x.h(req(9,'publish_game',args))).result.isError,true);
 assert.equal(x.calls(),0);
});
test('asynchronous backend rejection is contained and does not leak its error',async()=>{
 const x=fixture();
 x.backend.ensureCandidate=async()=>{throw Error('private backend details');};
 const result=await x.h(req(10,'publish_game',{artifact_id:x.id}));
 assert.equal(result.result.isError,true);
 assert.ok(!JSON.stringify(result).includes('private backend details'));
});
