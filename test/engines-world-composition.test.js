'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGenerationService}=require('../lib/engines/generation-service.cjs');
const {createLocalGeneratorMcp}=require('../lib/engines/local-generator-mcp.cjs');
const fixture=require('./fixtures/meta-game-vault.json');
const sourceCommit='a'.repeat(40);
const input=label=>({gameCard:structuredClone(fixture.gameCard),randomSeed:[...label].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0),recentGames:[]});
const part=(id,x=0)=>({artifact_id:id,translation:{x,y:0,z:0}});
function setup(){const service=createGenerationService({sourceCommit});const a=service.createGame(input('one')).artifact_id;const b=service.createGame(input('two')).artifact_id;return {service,a,b,parts:[part(a),part(b,30)]};}
test('actual generated worlds combine and build with source hashes and isolated data',()=>{
 const {service,a,b,parts}=setup();const result=service.combineAssets({parts});
 assert.equal(result.world.solids.length,fixture.gameCard.world.solids.length*2);
 assert.deepEqual(result.world.solids[5].min,{x:21,y:-1,z:-18});
 assert.deepEqual(result.world.assetComposition.parts.map(p=>p.artifact_id),[a,b]);
 assert.equal(result.composition_id,service.combineAssets({parts}).composition_id);
 const request=input('combined');request.gameCard.world=result.world;
 const built=service.createGame(request);assert.equal(built.integrity,true);
 const preview=service.previewGame(built.artifact_id);
 assert.match(preview.package.files['index.html'],new RegExp(result.composition_id));
 assert.equal(preview.validation.publication,'not_published');
 result.world.solids[0].min.x=999;parts[0].translation.x=999;
 const original=service.previewGame(a).package.files['index.html'];
 assert.ok(!original.includes('"x":999'));
 assert.equal(service.combineAssets({parts:[part(a),part(b,30)]}).world.solids[0].min.x,-9);
});
test('composition rejects paths, unknown IDs, incompatible physics and coordinate/part/solid budgets',()=>{
 const {service,a,b,parts}=setup();
 for(const bad of [{parts:[]},{parts:[part(a)]},{parts:Array(5).fill(part(a))},{parts,path:'../x'},
  {parts:[part(a),{...part(b),path:'x'}]},{parts:[part(a),part('../x')]},
  {parts:[part(a),part('f'.repeat(64))]}, {parts:[part(a),{...part(b),translation:{x:Infinity,y:0,z:0}}]},
  {parts:[part(a),part(b,9999)]}])assert.throws(()=>service.combineAssets(bad));
 const altered=input('gravity');altered.gameCard.world.gravity=20;const c=service.createGame(altered).artifact_id;
 assert.throws(()=>service.combineAssets({parts:[part(a),part(c,30)]}),/physics/);
 const large=input('large');large.gameCard.world.solids=Array.from({length:126},()=>structuredClone(fixture.gameCard.world.solids[0]));
 const d=service.createGame(large).artifact_id;
 assert.throws(()=>service.combineAssets({parts:[part(d),part(d,30)]}),/250 solids/);
});
test('evicted packages cannot be used as composition sources',()=>{
 const {service,a,b,parts}=setup();for(const s of ['three','four','five'])service.createGame(input(s));
 assert.throws(()=>service.combineAssets({parts}),/unavailable/);
});
test('local MCP combines actual cached geometry and keeps external references unavailable',()=>{
 const h=createLocalGeneratorMcp({sourceCommit});
 const call=(name,args)=>h({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}}}).result;
 const a=call('create_game',input('rpc-one')).structuredContent.artifact_id;
 const b=call('create_game',input('rpc-two')).structuredContent.artifact_id;
 const c=call('combine_assets',{parts:[part(a),part(b,30)]});assert.equal(c.isError,false);
 const request=input('rpc-combined');request.gameCard.world=c.structuredContent.world;
 assert.equal(call('create_game',request).structuredContent.integrity,true);
 assert.equal(call('combine_assets',{parts:[part('observer-npcs'),part(b)]}).isError,true);
 const external=input('external');external.gameCard.referenceIds=['observer-npcs'];
 assert.equal(call('create_game',external).isError,true);
});
