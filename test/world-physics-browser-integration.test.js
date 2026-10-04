'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function browserPhysics(){
  const context={console};
  vm.createContext(context);
  const bundle=fs.readFileSync(path.join(__dirname,'../shared/world-physics-runtime.bundle.js'),'utf8');
  const bridge=fs.readFileSync(path.join(__dirname,'../shared/world-physics-voxel-bridge.js'),'utf8');
  vm.runInContext(bundle,context,{filename:'world-physics-runtime.bundle.js'});
  vm.runInContext(bridge,context,{filename:'world-physics-voxel-bridge.js'});
  return context;
}
function k(x,y,z){return `${x},${y},${z}`;}

test('browser bundle exposes the same unified runtime and voxel bridge',()=>{
  const context=browserPhysics();
  assert.equal(typeof context.WorldPhysicsRuntime.WorldPhysicsRuntime,'function');
  assert.equal(typeof context.WorldPhysicsRuntime.WorldStructureEngine,'function');
  assert.equal(typeof context.WorldPhysicsRuntime.WorldClusterEngine,'function');
  assert.equal(typeof context.WorldPhysicsRuntime.WorldPressureEngine,'function');
  assert.equal(typeof context.WorldPhysicsVoxelBridge.createWorldPhysicsVoxelBridge,'function');
});

test('browser voxel bridge turns moving sand into clear+set voxel mutations',()=>{
  const context=browserPhysics(),grid=new Map(),writes=[];
  grid.set(k(0,0,0),3);
  let dynamic=null;
  const bridge=context.WorldPhysicsVoxelBridge.createWorldPhysicsVoxelBridge({
    seed:44,getBlock:(x,y,z)=>grid.get(k(x,y,z))||0,
    setBlock:(x,y,z,b)=>{grid.set(k(x,y,z),b);writes.push({x,y,z,b});},
    onDynamicMatter:state=>{dynamic=state;}
  });
  bridge.beginRegion({x:0,y:2,z:0},{radius:2,verticalRadius:3,groundY:0});
  bridge.inject({x:0,y:3,z:0},'sand');
  writes.length=0;
  bridge.step({ticks:1,structural:false,clusterSteps:0});
  assert.ok(writes.some(w=>w.x===0&&w.y===3&&w.z===0&&w.b===0));
  assert.ok(writes.some(w=>w.x===0&&w.y===2&&w.z===0&&w.b===4));
  assert.equal(grid.get(k(0,2,0)),4);
  assert.ok(dynamic&&Array.isArray(dynamic.cells)&&Array.isArray(dynamic.clusters));
});

test('browser voxel bridge keeps a detached voxel cluster visible while it falls',()=>{
  const context=browserPhysics(),grid=new Map();
  for(const [x,y,z,b] of [[0,0,0,3],[0,1,0,3],[1,1,0,5],[2,1,0,5]])grid.set(k(x,y,z),b);
  let dynamic={cells:[],clusters:[]};
  const bridge=context.WorldPhysicsVoxelBridge.createWorldPhysicsVoxelBridge({
    seed:12,getBlock:(x,y,z)=>grid.get(k(x,y,z))||0,
    setBlock:(x,y,z,b)=>grid.set(k(x,y,z),b),
    onDynamicMatter:state=>{dynamic=state;}
  });
  bridge.beginRegion({x:1,y:1,z:0},{radius:3,verticalRadius:2,groundY:0});
  bridge.runtime.clearCell(0,1,0);
  const result=bridge.step({ticks:1,structural:true,detach:true,clusterSteps:1});
  assert.ok(result.events.some(e=>e.type==='cluster-detached'));
  assert.equal(dynamic.clusters.length,1);
  assert.equal(dynamic.clusters[0].cellCount,2);
});

test('Voxel World loads and exposes unified physics without auto-enabling destruction',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../apps/voxel-world/index.html'),'utf8');
  const client=fs.readFileSync(path.join(__dirname,'../apps/voxel-world/client.js'),'utf8');
  assert.match(html,/world-physics-runtime\.bundle\.js/);
  assert.match(html,/world-physics-voxel-bridge\.js/);
  assert.match(client,/createWorldPhysicsThreeRenderer/);
  assert.match(client,/window\.WorldVoxelMatter=/);
  assert.match(client,/function requireVoxelPhysics/);
  assert.doesNotMatch(client,/requireVoxelPhysics\(\);\s*requestAnimationFrame/);
});
