'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {createLocalGeneratorMcp}=require('../lib/engines/local-generator-mcp.cjs');
const f=require('./fixtures/meta-game-vault.json');
const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}};
const req=(id,method,params={})=>({jsonrpc:'2.0',id,method,params:{...params,_meta:meta}});
test('local MCP discovery and actual create validate preview do not publish',()=>{
 const h=createLocalGeneratorMcp({sourceCommit:'a'.repeat(40)});
 assert.deepEqual(h(req(1,'tools/list')).result.tools.map(t=>t.name),['create_game','validate_game','preview_game']);
 const created=h(req(2,'tools/call',{name:'create_game',arguments:{gameCard:f.gameCard,randomSeed:f.randomSeed,recentGames:f.recentGames}}));
 assert.equal(created.result.isError,false);
 const id=created.result.structuredContent.artifact_id;
 const checked=h(req(3,'tools/call',{name:'validate_game',arguments:{artifact_id:id}}));
 assert.equal(checked.result.structuredContent.integrity,true);
 assert.equal(checked.result.structuredContent.publication,'not_published');
 const preview=h(req(4,'tools/call',{name:'preview_game',arguments:{artifact_id:id}}));
 assert.ok(preview.result.structuredContent.package.files['game.js']);
});
test('metadata, unknown tools, notifications and arbitrary paths fail closed',()=>{
 const h=createLocalGeneratorMcp({sourceCommit:'a'.repeat(40)});
 assert.equal(h({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}).error.code,-32602);
 assert.equal(h({...req(1,'tools/list'),params:{_meta:{...meta,'io.modelcontextprotocol/protocolVersion':'old'}}}).error.code,-32022);
 assert.equal(h(req(1,'tools/call',{name:'publish_game',arguments:{}})).error.code,-32602);
 assert.equal(h(req(1,'tools/call',{name:'preview_game',arguments:{artifact_id:'../x'}})).result.isError,true);
 assert.equal(h({jsonrpc:'2.0',method:'tools/call',params:{name:'create_game'}}),null);
});
test('real stdio process emits JSON only and exits on EOF',()=>{
 const script=path.resolve(__dirname,'../scripts/meta-game-generator-stdio.cjs');
 const run=spawnSync(process.execPath,[script],{input:JSON.stringify(req(1,'server/discover'))+'\n'+JSON.stringify(req(2,'tools/list'))+'\n',encoding:'utf8',timeout:5000});
 assert.equal(run.status,0,run.stderr);
 const lines=run.stdout.trim().split('\n').map(JSON.parse);
 assert.equal(lines.length,2);assert.equal(lines[0].result.supportedVersions[0],'2026-07-28');
 assert.equal(lines[1].result.tools.length,3);
 const invalid=spawnSync(process.execPath,[script],{input:'invalid\n',encoding:'utf8',timeout:5000});
 assert.equal(JSON.parse(invalid.stdout).error.code,-32700);
});

test('stdio rejects oversized frames and incomplete EOF without processing following calls',()=>{
 const script=path.resolve(__dirname,'../scripts/meta-game-generator-stdio.cjs');
 for(const ending of ['', '\n'+JSON.stringify(req(9,'tools/list'))+'\n']){
  const result=spawnSync(process.execPath,[script],{input:'x'.repeat(131073)+ending,encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
  const responses=result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(responses.length,1);
  assert.equal(responses[0].error.code,-32600);
 }
 const partial=spawnSync(process.execPath,[script],{input:JSON.stringify(req(1,'tools/list')),encoding:'utf8',timeout:5000});
 assert.equal(JSON.parse(partial.stdout).error.code,-32700);
});
