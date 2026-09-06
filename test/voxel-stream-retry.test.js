const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('actual voxel streaming loop bounds retries and resumes after backend recovery',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../apps/voxel-world/client.js'),'utf8');
  const body=source.slice(source.indexOf('async function loadNeededChunks(){'),source.indexOf('\nconst player='));
  let now=0,calls=0,available=false;
  const ctx=vm.createContext({performance:{now:()=>now},player:{pos:{x:0,z:0}},CHUNK:16,VIEW:0,
    floorDiv:(a,b)=>Math.floor(a/b),key2:(x,z)=>`${x},${z}`,chunks:new Map(),requested:new Set(),statusEl:{},
    api:async()=>{calls++;if(!available)throw new Error('offline');return {blocks:[]};},
    ChunkData:class{constructor(cx,cz){this.cx=cx;this.cz=cz;this.meshes=[];}},
    generateChunkData:c=>c,rebuildChunk:()=>{},worldGroup:{remove:()=>{}}});
  vm.runInContext('let streamBusy=false,streamRetryAt=0,streamFailures=0;'+body,ctx);
  await ctx.loadNeededChunks();assert.equal(calls,1);assert.equal(ctx.requested.size,0);
  for(let i=0;i<100;i++){now=999;await ctx.loadNeededChunks();}assert.equal(calls,1);
  now=1000;await ctx.loadNeededChunks();assert.equal(calls,2);
  now=2999;await ctx.loadNeededChunks();assert.equal(calls,2);
  available=true;now=3000;await ctx.loadNeededChunks();assert.equal(calls,3);assert.equal(ctx.chunks.size,1);
  ctx.player.pos.x=16;await ctx.loadNeededChunks();assert.equal(calls,4,'successful recovery removes the retry delay for new chunks');
});
