import test from 'node:test';
import assert from 'node:assert/strict';
import {createProceduralAtlas} from '../shared/original-voxel-texture-atlas.mjs';
test('same seed produces byte-identical original texture atlas',()=>{
 const a=createProceduralAtlas({seed:42}),b=createProceduralAtlas({seed:42});
 assert.equal(a.width,48);assert.equal(a.height,32);
 assert.deepEqual(a.pixels,b.pixels);
 assert.equal(a.pixels.length,a.width*a.height*4);
 assert.ok(a.pixels.every((v,i)=>i%4!==3||v===255));
});
test('different seeds and materials change pixels, tiles do not overlap',()=>{
 const a=createProceduralAtlas({seed:1,materials:['basalt','stone']});
 const b=createProceduralAtlas({seed:2,materials:['basalt','stone']});
 assert.notDeepEqual(a.pixels,b.pixels);
 assert.deepEqual(a.tiles.basalt,{x:0,y:0,width:16,height:16});
 assert.deepEqual(a.tiles.stone,{x:16,y:0,width:16,height:16});
});
test('invalid input cannot allocate unbounded textures',()=>{
 assert.throws(()=>createProceduralAtlas({tileSize:1024}),RangeError);
 assert.throws(()=>createProceduralAtlas({materials:['unknown']}),TypeError);
 assert.throws(()=>createProceduralAtlas({materials:['lava','lava']}),TypeError);
});
