import test from 'node:test';
import assert from 'node:assert/strict';
import app, { licensedAssets, searchLicensedAssets, getLicensedDependencies, searchLicensedMechanics } from './worker.mjs';
import index from '../ASSET_INDEX.json' with { type: 'json' };
import rights from '../RIGHTS_REVIEW.json' with { type: 'json' };
const v='2026-07-28';
function call(method,name,args,override={}){
 const m={'io.modelcontextprotocol/protocolVersion':v,'io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'smoke',version:'1'}};
 const payload={jsonrpc:'2.0',id:1,method,params:{_meta:m,...(name?{name,arguments:args}:{})}};
 return new Request('https://test.example/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':v,'mcp-method':method,...(name?{'mcp-name':name}:{}),...override},body:JSON.stringify(payload)});
}
test('health',async()=>{const r=await app.fetch(new Request('https://test.example/health'));assert.equal(r.status,200);assert.equal((await r.json()).games,4);});
test('discovery',async()=>{const b=await(await app.fetch(call('server/discover'))).json();assert.deepEqual(b.result.supportedVersions,[v]);assert.equal(b.result.resultType,'complete');});
test('list tools',async()=>{const b=await(await app.fetch(call('tools/list'))).json();assert.deepEqual(b.result.tools.map(t=>t.name),['list_games','inspect_game','list_assets','search_assets','search_mechanics','get_dependencies']);});
test('list real games',async()=>{const b=await(await app.fetch(call('tools/call','list_games',{}))).json();assert.equal(b.result.structuredContent.games.length,4);assert.match(b.result.structuredContent.games[0].entry.git_blob_sha,/^[a-f0-9]{40}$/);});
test('list_assets returns no unaudited candidates',async()=>{
 const b=await(await app.fetch(call('tools/call','list_assets',{}))).json();
 assert.equal(b.result.isError,false);
 assert.deepEqual(b.result.structuredContent,{assets:[],total:0});
 assert.equal(index.review_candidates.length,6);
});
test('search_assets stays empty for unlicensed source candidates',async()=>{
 const b=await(await app.fetch(call('tools/call','search_assets',{query:'observer',limit:10}))).json();
 assert.equal(b.result.isError,false);
 assert.deepEqual(b.result.structuredContent,{assets:[],total:0});
});
test('search_assets rejects unbounded or unknown filters',async()=>{
 for(const args of [{limit:51},{query:'x'.repeat(121)},{unexpected:'all'},{limit:0}]){
  const b=await(await app.fetch(call('tools/call','search_assets',args))).json();
  assert.equal(b.result.isError,true);
 }
});
test('search results require a matching rights grant and preserve pagination bounds',()=>{
 const a=index.review_candidates[0];
 const approved={...a,license_status:'verified',license_id:'MIT',reuse_allowed:true,redistribution_allowed:true,dependencies_verified:true};
 const data={...index,reusable_assets:[approved],review_candidates:index.review_candidates.slice(1)};
 const audit={...rights,entries:rights.entries.map(r=>r.id===a.id?{
  ...r,license_status:'verified',reuse_allowed:true,redistribution_allowed:true,
  dependencies_verified:true,grant_evidence:'Verified explicit grant by rights holder'
 }:r)};
 assert.deepEqual(searchLicensedAssets({query:'mechan',limit:1},data,audit),{assets:[approved],total:1});
 assert.deepEqual(searchLicensedAssets({type:'geometry'},data,audit),{assets:[],total:0});
 assert.deepEqual(searchLicensedAssets({game_id:'observer-v7'},data,audit),{assets:[],total:0});
 assert.deepEqual(searchLicensedAssets({limit:50},data,rights),{assets:[],total:0});
});
test('forged rights cannot unlock an asset',()=>{
 const original=index.review_candidates[0];
 const fake={...index,reusable_assets:[{...original,license_status:'verified',reuse_allowed:true,redistribution_allowed:true,license_id:'MIT',dependencies_verified:true}],review_candidates:index.review_candidates.slice(1)};
 assert.deepEqual(licensedAssets(fake,rights),[]);
 assert.deepEqual(licensedAssets({...fake,source_commit:'0'.repeat(40)},rights),[]);
});
test('known and unknown game',async()=>{const a=await(await app.fetch(call('tools/call','inspect_game',{game_id:'ashen'}))).json();assert.equal(a.result.structuredContent.id,'ashen');const b=await(await app.fetch(call('tools/call','inspect_game',{game_id:'absent'}))).json();assert.equal(b.result.isError,true);});
test('CORS reject',async()=>{const r=await app.fetch(call('tools/list',null,null,{origin:'https://evil.example'}));assert.equal(r.status,403);});
test('version and method header reject',async()=>{assert.equal((await app.fetch(call('tools/list',null,null,{'mcp-protocol-version':'2025-11-25'}))).status,400);assert.equal((await app.fetch(call('tools/list',null,null,{'mcp-method':'tools/call'}))).status,400);});
test('reject oversized input',async()=>{const r=await app.fetch(new Request('https://test.example/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:'a'.repeat(17000)}));assert.equal(r.status,413);});

test('mechanics discovery never exposes unaudited source', async () => {
 const b = await (await app.fetch(call('tools/call','search_mechanics',{query:'ashen',limit:10}))).json();
 assert.equal(b.result.isError,false);
 assert.deepEqual(b.result.structuredContent,{mechanics:[],total:0});
 for(const invalid of [{type:'game_mechanics'},{limit:100},{foo:'bar'}]){
  const result=await(await app.fetch(call('tools/call','search_mechanics',invalid))).json();
  assert.equal(result.result.isError,true);
 }
});
test('get_dependencies denies unlicensed candidates and arbitrary IDs identically',async()=>{
 for(const asset_id of ['ashen-mechanics','not-in-library']){
  const b=await(await app.fetch(call('tools/call','get_dependencies',{asset_id}))).json();
  assert.equal(b.result.isError,true);
  assert.deepEqual(b.result.structuredContent,{error:'Asset unavailable for reuse'});
 }
 const invalid=await(await app.fetch(call('tools/call','get_dependencies',{asset_id:'ashen-mechanics',unsafe:true}))).json();
 assert.equal(invalid.result.isError,true);
});
test('approved dependencies and mechanics require a matching independent grant',()=>{
 const original=index.review_candidates[0];
 const approved={
  ...original, license_status:'verified',license_id:'MIT',
  reuse_allowed:true, redistribution_allowed:true,
  dependencies_verified:true, dependencies:['three']
 };
 const data={...index,reusable_assets:[approved],review_candidates:index.review_candidates.slice(1)};
 const audit={...rights,entries:rights.entries.map(r=>r.id===original.id?{
  ...r,license_status:'verified',reuse_allowed:true,redistribution_allowed:true,
  dependencies_verified:true,grant_evidence:'Verified explicit grant by rights holder'
 }:r)};
 assert.deepEqual(getLicensedDependencies(original.id,data,audit),{
  asset_id:original.id,
  source_commit:original.source.commit,
  source_blob_sha:original.source.git_blob_sha,
  dependencies:['three']
 });
 assert.deepEqual(searchLicensedMechanics({query:'ashen'},data,audit),{mechanics:[approved],total:1});
 assert.equal(getLicensedDependencies(original.id,data,rights),null);
 assert.deepEqual(searchLicensedMechanics({},data,rights),{mechanics:[],total:0});
 assert.equal(getLicensedDependencies(original.id,{...data,reusable_assets:[{...approved,dependencies:null}]},audit),null);
});
