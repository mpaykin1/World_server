'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGenerationService}=require('../lib/engines/generation-service.cjs');
const {verifyPublicDelivery}=require('../lib/engines/publication-delivery.cjs');
const f=require('./fixtures/meta-game-vault.json');
function packageData(){const s=createGenerationService({sourceCommit:'a'.repeat(40)});
 const id=s.createGame({gameCard:f.gameCard,randomSeed:f.randomSeed,recentGames:[]}).artifact_id;
 return s.previewGame(id).package;}
function source(a){return {...a.files,'manifest.json':JSON.stringify({...a.manifest,
 manifest_sha256:a.manifest_sha256},null,2)+'\n'};}
test('seven public responses bind all bytes including manifest without claiming publication',async()=>{
 const a=packageData(),files=source(a),seen=[];
 const result=await verifyPublicDelivery(a,{fetchImpl:async(url,options)=>{
   const u=new URL(url);assert.equal(u.origin,'https://mpaykin1.github.io');
   assert.ok(u.pathname.startsWith('/meta6/meta-games-worlds/witness-vault/'));
   assert.equal(u.searchParams.get('manifest'),a.manifest_sha256);
   assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
   assert.equal(options.method,'GET');assert.ok(options.signal);seen.push(url);
   return new Response(files[u.pathname.split('/witness-vault/')[1]]);
 }});
 assert.equal(seen.length,7);assert.equal(result.files.length,7);
 assert.equal(result.delivery,'verified');assert.equal(result.manifest_sha256,a.manifest_sha256);
 assert.equal(result.publication,'not_published');assert.equal(result.rights,'not_verified');
});
test('stale, missing, redirected, truncated, oversized and network responses fail closed',async()=>{
 const a=packageData();
 for(const fetchImpl of [async()=>new Response('stale'),async()=>new Response('',{status:404}),
   async()=>({status:200,redirected:true}),async()=>new Response(''),
   async()=>new Response('x'.repeat(1048577)),async()=>{throw Error('private detail');}]){
   const r=await verifyPublicDelivery(a,{fetchImpl});
   assert.equal(r.delivery,'not_verified');assert.equal(r.publication,'not_published');
   assert.ok(!JSON.stringify(r).includes('private detail'));
 }
});
test('tampered packages cause zero outbound requests',async()=>{
 const a=packageData();a.files['index.html']+='tamper';let calls=0;
 const r=await verifyPublicDelivery(a,{fetchImpl:async()=>{calls++;throw Error();}});
 assert.equal(r.reason,'invalid_artifact');assert.equal(calls,0);
});
