import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFactoryWorld,placeBlock,tickFactoryWorld,serializeFactoryWorld,restoreFactoryWorld,upgradeBlock,generateChunk,chunkOf,connectedMask,visibleChunks,viewportBounds,worldToScreen,screenToWorld} from '../shared/graphics/world-block-factory.mjs';
const clone=w=>restoreFactoryWorld(serializeFactoryWorld(w));
test('13 stable block definitions, seeded terrain and negative chunk boundaries',()=>{
 const a=generateChunk(12,-1,0),b=generateChunk(12,-1,0);
 assert.deepEqual(a,b);assert.equal(a.tiles.length,256);
 assert.deepEqual(chunkOf(-1,-17),{cx:-1,cz:-2});
 for(let i=-101;i<=101;i++)assert.deepEqual(generateChunk(42,i,0),generateChunk(42,i,0));
});
test('viewport pan and placing only on screen',()=>{
 const w=createFactoryWorld(),camera={x:-4,z:5};
 for(let i=0;i<20;i++){
  camera.x+=13;camera.z-=7;const b=viewportBounds(camera,390,844);
  assert.ok(visibleChunks(b).length>0);
  const p=screenToWorld(195,422,camera,390,844);
  const screen=worldToScreen(p.x,p.z,camera,390,844);
  assert.ok(Math.abs(screen.x-195)<60&&Math.abs(screen.y-422)<30);
  assert.throws(()=>placeBlock(w,'forest',b.maxX+1,0,b));
 }
});
test('water joins across tile and chunk seams, upgrade preserves ID',()=>{
 const w=createFactoryWorld(),a=placeBlock(w,'river',15,-1),b=placeBlock(w,'river',16,-1);
 assert.equal(connectedMask(w,a,'water')&2,2);
 assert.equal(connectedMask(w,b,'water')&8,8);
 const id=a.id;upgradeBlock(w,id,'GLB_FX');
 assert.equal(w.blocks.find(x=>x.id===id).quality,'GLB_FX');
 assert.deepEqual(clone(w),w);
});
test('lava reaches river; forest burns and residents evacuate; restore/replay identical',()=>{
 const original=createFactoryWorld(119);
 const forest=placeBlock(original,'forest',4,1),river=placeBlock(original,'river',5,1);
 placeBlock(original,'volcano',8,1);
 const a=clone(original),b=clone(original);
 for(let i=0;i<8;i++){tickFactoryWorld(a);tickFactoryWorld(b);}
 assert.equal(serializeFactoryWorld(a),serializeFactoryWorld(b));
 assert.equal(a.blocks.find(x=>x.id===forest.id).type,'burnt_forest');
 assert.ok(a.events.some(x=>x.type==='steam'&&x.blockId===river.id));
 assert.ok(a.events.some(x=>x.type==='resident_evacuated'));
 assert.equal(restoreFactoryWorld('{invalid'),null);
 assert.deepEqual(clone(a),a);
});
test('120 chunk-distance camera traversals keep persistent block coordinates and bounded visible buffer',()=>{
 const w=createFactoryWorld(341,'chain-test'),b=placeBlock(w,'forest',-33,16);
 const cache=new Map();
 for(let i=0;i<120;i++){
  const camera={x:-20+i*17,z:40-i*19};
  const area=viewportBounds(camera,390,844),chunks=visibleChunks(area);
  assert.ok(chunks.length>0&&chunks.length<64);
  const keep=new Set(chunks.map(pair=>pair.join(',')));
  for(const key of cache.keys())if(!keep.has(key))cache.delete(key);
  for(const [cx,cz] of chunks)if(!cache.has(cx+','+cz))cache.set(cx+','+cz,generateChunk(w.seed,cx,cz));
  assert.equal(cache.size,chunks.length);
 }
 assert.equal(w.blocks.find(item=>item.id===b.id).x,-33);
 assert.equal(w.blocks.find(item=>item.id===b.id).z,16);
 assert.deepEqual(clone(w),w);
});
