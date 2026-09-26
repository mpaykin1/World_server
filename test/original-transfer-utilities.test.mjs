import test from 'node:test';
import assert from 'node:assert/strict';
import {originalVisualTour,validateOriginalTourResult} from '../shared/original-seeded-visual-tour.mjs';
import {createOriginalAssetManifest,selectOriginalAssets} from '../shared/original-asset-provenance.mjs';
test('seeded tour is deterministic, distinct, and rejects bad seeds',()=>{
 const a=originalVisualTour(123);assert.deepEqual(a,originalVisualTour(123));
 assert.equal(new Set(a.map(s=>s.filename)).size,a.length);
 assert.notEqual(a[0].filename,originalVisualTour(124)[0].filename);
 assert.throws(()=>originalVisualTour(NaN),RangeError);
});
test('tour result detects missing screenshots, errors and seed mismatches',()=>{
 const scenes=originalVisualTour(42);
 const report=validateOriginalTourResult(scenes,[{id:scenes[0].id,seed:99,screenshot:'a.png',errors:[],fps:60,drawCalls:1,triangles:2,visibleChunks:3,missingTextures:0}]);
 assert.equal(report.length,scenes.length);assert.equal(report[0].pass,false);
 assert.ok(report[0].errors.includes('seed mismatch'));
 assert.ok(report[1].errors.includes('missing scene'));
});
test('asset manifest requires documented rights and preserves cross-engine selection',()=>{
 const m=createOriginalAssetManifest([{id:'basalt',path:'models/basalt.glb',rights:'original',author:'World Server'},{id:'atlas',path:'textures/atlas.ktx2',rights:'cc0',author:'Original artist'}]);
 assert.equal(selectOriginalAssets(m,{engine:'godot'}).length,1);
 assert.equal(selectOriginalAssets(m,{engine:'browser'}).length,2);
 assert.throws(()=>createOriginalAssetManifest([{id:'x',path:'../secret.glb',rights:'original',author:'a'}]));
 assert.throws(()=>createOriginalAssetManifest([{id:'x',path:'x.glb',rights:'licensed',author:'a'}]),/permission/);
});
