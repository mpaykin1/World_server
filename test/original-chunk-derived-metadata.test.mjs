import test from 'node:test';import assert from 'node:assert/strict';
import {buildOriginalChunkMetadata,updateOriginalHeightColumn} from '../shared/original-chunk-derived-metadata.mjs';
test('heightmap tracks highest opaque block and emissive indices',()=>{
 const size=[2,17,1],blocks=new Uint16Array(34);blocks[0]=1;blocks[2]=2;blocks[32]=1;blocks[3]=3;
 const r=buildOriginalChunkMetadata({size,blocks,minY:-8,opacity:id=>id===1?15:0,emission:id=>id===3?12:0});
 assert.deepEqual([...r.heights],[8,-9]);assert.deepEqual([...r.emitters],[3]);
 assert.deepEqual([...r.nonAirSections],[3,1]);
});
test('column update after removing top block leaves other column untouched',()=>{
 const size=[2,17,1],blocks=new Uint16Array(34);blocks[0]=1;blocks[32]=1;
 const before=new Int32Array([16,99]);blocks[32]=0;
 const after=updateOriginalHeightColumn({size,blocks,opacity:id=>id===1?15:0,heights:before,x:0,z:0});
 assert.deepEqual([...after],[0,99]);assert.equal(before[0],16);
});
