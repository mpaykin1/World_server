import test from 'node:test';import assert from 'node:assert/strict';
import {buildOriginalSectionVisibility} from '../shared/original-section-visibility.mjs';
const at=(x,y,z)=>x+18*(z+18*y);
test('single isolated voxel has six visible faces',()=>{const b=new Uint16Array(5832);b[at(8,8,8)]=1;const r=buildOriginalSectionVisibility({blocks:b});assert.equal(r.visibleFaces,6);});
test('two adjacent cubes hide their shared faces',()=>{const b=new Uint16Array(5832);b[at(8,8,8)]=1;b[at(9,8,8)]=1;const r=buildOriginalSectionVisibility({blocks:b});assert.equal(r.visibleFaces,10);});
test('fully enclosed center voxel emits no faces',()=>{const b=new Uint16Array(5832);for(let y=7;y<=9;y++)for(let z=7;z<=9;z++)for(let x=7;x<=9;x++)b[at(x,y,z)]=1;const r=buildOriginalSectionVisibility({blocks:b});assert.ok(r.hiddenBlocks>=1);});
