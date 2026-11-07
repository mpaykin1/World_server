'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const readTools=['list_games','inspect_game','list_assets','search_assets','search_mechanics','get_asset','get_source','get_dependencies'];
const tools=['list_games','inspect_game','list_assets','search_assets','search_mechanics','get_asset','get_source','combine_assets','create_game','validate_game','preview_game','get_dependencies'];
const candidates=['ashen-mechanics','observer-audio','observer-buildings','observer-npcs'];
const approved=['observer-story','observer-mobile-input'];
async function executeSmoke({mechanicsLeak=false,dependenciesLeak=false}={}){
 const file=path.join(__dirname,'../architecture/meta-games-platform/mcp/live-smoke.mjs');
 const source=fs.readFileSync(file,'utf8')
  .replace("import { readFileSync } from 'node:fs';",'')
  .replace("import { execFileSync } from 'node:child_process';",'')
  .replace("import { expectedDeployedSha } from './expected-sha.mjs';",'')
  .replaceAll('import.meta.url',JSON.stringify('file:///fixture/mcp/live-smoke.mjs'));
 const calls=[],logs=[];
 const fetch=async(url,options)=>{
  let body;
  if(options?.method==='POST'){
   const request=JSON.parse(options.body),name=request.params.name;
   if(request.method==='server/discover')body={result:{supportedVersions:['2026-07-28']}};
   else if(request.method==='tools/list')body={result:{tools:tools.map(name=>({name}))}};
   else{
    calls.push(name);let result={structuredContent:{}};
    if(name==='list_games')result.structuredContent={games:[...([1,2,3,4].map(i=>({id:'game-'+i}))),{id:'veil-terraces'}]};
    else if(name==='inspect_game')result.structuredContent={id:request.params.arguments.game_id};
    else if(name==='list_assets'||name==='search_assets')result.structuredContent={assets:approved.map(id=>({id})),total:2};
    else if(name==='get_source'&&approved.includes(request.params.arguments.asset_id))result.structuredContent={asset_id:request.params.arguments.asset_id,encoding:'utf-8',content:'export const ready = true;'};
    else if(name==='get_asset'&&approved.includes(request.params.arguments.asset_id))result.structuredContent={asset_id:request.params.arguments.asset_id,encoding:'base64',content:'ZXhwb3J0'};
    else if(name==='search_mechanics')result.structuredContent={mechanics:mechanicsLeak?[{id:candidates[0]}]:[],total:0};
    else if(name==='get_dependencies'&&dependenciesLeak)result.structuredContent={dependencies:[{source:'unlicensed'}]};
    else result={isError:true,structuredContent:{error:'Asset unavailable for reuse'}};
    body={result};
   }
  }else body={status:'ok',games:5,licensed_assets:2,source_sha:'2'.repeat(40)};
  return {status:200,ok:true,json:async()=>body,headers:{get:()=> 'text/html'},text:async()=>'<html>fixture</html>'};
 };
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('fetch','readFileSync','execFileSync','expectedDeployedSha','console','process',source)(
  fetch,
  ()=>JSON.stringify({review_candidates:candidates.map(id=>({id}))}),
  (_command,args)=> args[0]==='show' ? JSON.stringify({
    games:[...([1,2,3,4].map(i=>({id:'game-'+i}))),{id:'veil-terraces'}],
    reusable_assets:approved.map(id=>({id})),
    review_candidates:candidates.map(id=>({id}))
  }) : 'master-fixture-sha',
  ()=> '2'.repeat(40),
  {log:s=>logs.push(s)},
  {env:{META_GAMES_REQUIRE_PINNED_READS:'true'}}
 );
 return {calls,logs};
}
test('twelve-tool discovery requires all eight licensed read tools to be called',async()=>{
 const {calls}=await executeSmoke();
 assert.deepEqual([...new Set(calls)].sort(),[...readTools].sort());
 assert.equal(tools.length,12);
 assert.equal(calls.filter(x=>x==='get_dependencies').length,5);
});
test('unlicensed mechanics content prevents public smoke PASS',async()=>{
 await assert.rejects(executeSmoke({mechanicsLeak:true}),/mechanic/i);
});
test('dependency disclosure prevents public smoke PASS',async()=>{
 await assert.rejects(executeSmoke({dependenciesLeak:true}),/get_dependencies|dependenc/i);
});
