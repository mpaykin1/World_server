import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const base=path.join(root,'assets','characters','kaykit-knight');

function glbJson(file){
  const b=fs.readFileSync(file);
  assert.equal(b.toString('utf8',0,4),'glTF');
  let offset=12;
  while(offset<b.length){
    const length=b.readUInt32LE(offset);
    const type=b.readUInt32LE(offset+4);
    offset+=8;
    const chunk=b.subarray(offset,offset+length);
    offset+=length;
    if(type===0x4E4F534A)return JSON.parse(chunk.toString('utf8').replace(/[\0\s]+$/,''));
  }
  throw new Error('GLB JSON chunk missing');
}

test('KayKit worker exposes the complete Rig_Medium source animation library',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
  const source=[];
  for(const rel of manifest.animationGroups){
    const json=glbJson(path.join(base,rel));
    source.push(...(json.animations||[]).map(a=>a.name));
  }
  assert.equal(source.length,139);
  assert.equal(manifest.compatibleAnimationClipCount,139);
  assert.equal(new Set(source).size,132);
  assert.equal(source.filter(n=>n==='T-Pose').length,8);
});

test('illustration worker driver loads real KayKit GLBs and keeps semantic control',()=>{
  const source=fs.readFileSync(path.join(root,'shared','graphics','illustration-character-kaykit.js'),'utf8');
  assert.match(source,/GLTFLoader/);
  assert.match(source,/manifest\.animationGroups/);
  assert.match(source,/createKayKitIllustrationWorker/);
  assert.match(source,/playClip/);
  assert.match(source,/playSemantic/);
  assert.match(source,/sourceClipCount/);
  assert.doesNotMatch(source,/placeholder/i);
});

test('KayKit semantic contract includes core locomotion, interaction and simulation actions',()=>{
  const semantics=JSON.parse(fs.readFileSync(path.join(base,'semantic-actions.json'),'utf8'));
  for(const name of ['idle','walk','run','jump_start','airborne','land','interact','pickup','sit_idle','stand_up','ranged_shoot','death']){
    assert.ok(Array.isArray(semantics.actions[name])&&semantics.actions[name].length>0,name);
  }
});
