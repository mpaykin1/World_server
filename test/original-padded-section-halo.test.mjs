import test from 'node:test';import assert from 'node:assert/strict';
import {sampleOriginalPaddedSection} from '../shared/original-padded-section-halo.mjs';
const idx=(x,y,z)=>x+16*(z+16*y),pad=(x,y,z)=>x+18*(z+18*y);
test('center and adjacent chunk borders sample correctly',()=>{
 const center={blocks:new Uint16Array(16*16*16),light:new Uint8Array(16*16*16)};
 const east={blocks:new Uint16Array(16*16*16),light:new Uint8Array(16*16*16)};
 center.blocks[idx(15,0,0)]=7;east.blocks[idx(0,0,0)]=9;east.light[idx(0,0,0)]=0xAB;
 const r=sampleOriginalPaddedSection({chunks:new Map([['0,0',center],['1,0',east]]),worldHeight:16});
 assert.equal(r.blocks[pad(16,1,1)],7);assert.equal(r.blocks[pad(17,1,1)],9);assert.equal(r.light[pad(17,1,1)],0xAB);
});
test('below world bedrock, missing neighbors sky, above world air',()=>{
 const r=sampleOriginalPaddedSection({chunks:new Map(),worldHeight:16,bedrock:4});
 assert.equal(r.blocks[pad(0,0,0)],4);assert.equal(r.light[pad(0,0,0)],0);
 assert.equal(r.blocks[pad(0,1,0)],0);assert.equal(r.light[pad(0,1,0)],240);
 assert.equal(r.blocks[pad(0,17,0)],0);assert.equal(r.light[pad(0,17,0)],240);
 assert.equal(r.rowFull[0],1);
});
test('all solid center row marked full',()=>{
 const c={blocks:new Uint16Array(4096).fill(1)};
 const r=sampleOriginalPaddedSection({chunks:new Map([['0,0',c]]),worldHeight:16});
 assert.equal(r.rowFull[1*18+1],1);assert.equal(r.rowFull[1*18+0],0);
});
