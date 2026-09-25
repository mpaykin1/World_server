import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {levelSelection,allowedLods} from '../apps/ai3d-voxel-city/cinematic-cpu-runtime.mjs';

const require=createRequire(import.meta.url);
const {validate,checkGlb}=require('../scripts/cinematic_cpu/verify_pack.cjs');
const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR=path.join(ROOT,'apps/ai3d-voxel-city/cinematic-assets');
const manifest=JSON.parse(fs.readFileSync(path.join(DIR,'cinematic-pack.json'),'utf8'));

test('generated CPU pack passes strict actual GLB + SHA + LOD verification',()=>{
  const r=validate();
  assert.equal(r.ok,true);
  assert.equal(Object.keys(r.shaByAsset).length,6);
  assert.ok(r.totalBytes<4*1024*1024);
  assert.ok(r.tiers['geothermal-plant'][0].drawCallUpperBound<=6);
  assert.ok(r.tiers.volcano[0].triangles>r.tiers.volcano[2].triangles*10);
});
test('GLB validator rejects empty files and malformed headers',()=>{
  assert.throws(()=>checkGlb(Buffer.alloc(256)),/magic/);
  const bytes=fs.readFileSync(path.join(DIR,'volcano-lod2.glb'));
  const corrupt=Buffer.from(bytes);corrupt.writeUInt32LE(400,8);
  assert.throws(()=>checkGlb(corrupt),/version\/length/);
});
test('manifest checksum tampering is rejected',()=>{
  const fake=structuredClone(manifest);
  fake.assets[0].sha256='0'.repeat(64);
  assert.throws(()=>validate(DIR,fake),/checksum mismatch/);
});
test('fabricated visual approval cannot pass',()=>{
  const fake=structuredClone(manifest);
  fake.status='LIVE_VERIFIED';
  assert.throws(()=>validate(DIR,fake),/self-certify/);
});
test('LOD metrics and missing assets fail closed',()=>{
  const bad=structuredClone(manifest);
  bad.assets[0].triangles=1;
  assert.throws(()=>validate(DIR,bad),/LOD triangle order/);
  const missing=structuredClone(manifest);
  missing.assets.pop();
  assert.throws(()=>validate(DIR,missing),/pack incomplete/);
});
test('native LOD tier routing preserves mobile GPU/network budget',()=>{
  assert.deepEqual(allowedLods('low'),[1,2]);
  assert.deepEqual(allowedLods('balanced'),[0,1,2]);
  assert.equal(levelSelection(20,'balanced',1),0);
  assert.equal(levelSelection(65,'balanced',0),0);
  assert.equal(levelSelection(80,'balanced',0),1);
  assert.equal(levelSelection(145,'balanced',1),2);
  assert.equal(levelSelection(20,'low',2),1);
});
