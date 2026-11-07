import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourcePackage,sourceGate,previewSourcePackage} from './source-package.mjs';
const sha='a'.repeat(40), blob='b'.repeat(40);
const source={repository:'mpaykin1/meta6',commit:sha,path:'three-worlds-game/weather-cycle.mjs',git_blob_sha:blob,url:'https://github.com/mpaykin1/meta6/blob/'+sha+'/three-worlds-game/weather-cycle.mjs'};
const asset={id:'weather',source,license_status:'verified',reuse_allowed:true,redistribution_allowed:true,dependencies_verified:true};
const read=async()=>({encoding:'utf-8',content:'export const weather = 1;',source_blob_sha:blob,source_commit:sha});
test('licensed original source builds a bounded provenance package',async()=>{
 const pkg=await createSourcePackage({asset_ids:['weather']},[asset],read);
 assert.ok(pkg); assert.equal(pkg.files[0].path,'index.html');
 assert.equal(pkg.provenance.assets[0].id,'weather');
 assert.equal(sourceGate(pkg,[asset]),true);
 assert.match(previewSourcePackage(pkg,[asset]).html,/weather = 1/);
});
test('unknown, duplicate, unlicensed and binary assets are denied',async()=>{
 assert.equal(await createSourcePackage({asset_ids:['unknown']},[asset],read),null);
 assert.equal(await createSourcePackage({asset_ids:['weather','weather']},[asset],read),null);
 assert.equal(await createSourcePackage({asset_ids:['weather']},[{...asset,reuse_allowed:false}],read),null);
 assert.equal(await createSourcePackage({asset_ids:['weather']},[{...asset,source:{...source,path:'file.png'}}],read),null);
});
test('tampering with provenance, generated layers or index.html fails closed',async()=>{
 const pkg=await createSourcePackage({asset_ids:['weather']},[asset],read);
 assert.equal(sourceGate({...pkg,provenance:{assets:[]}},[asset]),false);
 assert.equal(sourceGate({...pkg,visual_layers:[{origin:'engine_generated'}]},[asset]),false);
 assert.equal(sourceGate({...pkg,files:[]},[asset]),false);
 assert.equal(sourceGate(pkg,[]),false);
});
