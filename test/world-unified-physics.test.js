'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {MatterWorld}=require('../lib/world-matter-engine');
const {WorldPhysicsRuntime}=require('../lib/world-physics-runtime');
const {PixelCellAdapter,VoxelCellAdapter}=require('../lib/world-cell-adapters');
const {WorldPhysicsSequencer}=require('../lib/world-physics-sequencer');
const {renderCommandsForEvents}=require('../lib/world-physics-render-bridge');

function materials2D(runtime){
  return runtime.world.snapshot().map(item=>{
    const [x,y,z]=item.position.split(',').map(Number);return{x,y,z,material:item.material};
  }).sort((a,b)=>a.y-b.y||a.x-b.x||a.z-b.z);
}

test('pixel2d MatterWorld clamps all writes and flow to z=0',()=>{
  const world=new MatterWorld({seed:4,dimensions:2});
  world.setCell(0,4,99,'sand');world.setCell(0,0,0,'stone');
  world.setCell(-1,0,0,'stone');world.setCell(1,0,0,'stone');
  for(let i=0;i<5;i++)world.step();
  assert.ok(world.snapshot().every(item=>item.position.endsWith(',0')));
});

test('matter events expose deterministic movement and reactions',()=>{
  const world=new MatterWorld({seed:9,dimensions:2});
  world.setCell(0,2,0,'sand');world.drainEvents();world.step();
  assert.ok(world.drainEvents().some(event=>event.type==='cell-move'&&event.material==='sand'));
  world.setCell(3,1,0,'lava');world.setCell(4,1,0,'water');world.drainEvents();world.step();
  assert.ok(world.drainEvents().some(event=>event.type==='reaction'&&event.reaction==='lava-water'));
});

test('2D structural analysis separates anchored structure from floating island',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'pixel2d',seed:1,groundY:0});
  const p=new PixelCellAdapter(runtime);
  for(const [x,y] of [[0,0],[0,1],[0,2],[1,2],[2,2],[5,3],[6,3]])p.set(x,y,'stone');
  const analysis=runtime.analyzeStructure();
  assert.equal(analysis.complete,true);assert.equal(analysis.supportedCells,5);
  assert.equal(analysis.unsupportedCells,2);assert.equal(analysis.components.length,1);
  assert.equal(analysis.components[0].cellCount,2);
});

test('3D support propagates through z-neighbors',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'voxel3d',seed:1,groundY:0});
  const v=new VoxelCellAdapter(runtime);
  v.set(0,0,0,'stone');v.set(0,1,0,'stone');v.set(0,1,1,'stone');
  const analysis=runtime.analyzeStructure();
  assert.equal(analysis.supportedCells,3);assert.equal(analysis.unsupportedCells,0);
});

test('cutting a supported pixel bridge detaches exactly the unsupported component',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'pixel2d',seed:2,groundY:0});
  const p=new PixelCellAdapter(runtime);
  p.set(0,0,'stone');p.set(0,1,'stone');
  for(let x=1;x<=4;x++)p.set(x,1,'wood');p.set(4,2,'wood');
  assert.equal(runtime.analyzeStructure().unsupportedCells,0);
  runtime.damageCell(1,1,99);
  const detached=runtime.detachUnsupported();
  assert.equal(detached.detached.length,1);assert.equal(detached.detached[0].cellCount,4);
  assert.equal(runtime.clusters.snapshot().length,1);assert.equal(p.get(4,2),null);
});

test('cutting a voxel bridge works across the z axis with the same rule',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'voxel3d',seed:2,groundY:0});
  const v=new VoxelCellAdapter(runtime);
  v.set(0,0,0,'stone');v.set(0,1,0,'stone');
  for(let z=1;z<=4;z++)v.set(0,1,z,'wood');v.set(0,2,4,'wood');
  assert.equal(runtime.analyzeStructure().unsupportedCells,0);
  runtime.damageCell(0,1,1,99);
  const detached=runtime.detachUnsupported();
  assert.equal(detached.detached.length,1);assert.equal(detached.detached[0].cellCount,4);
  assert.equal(v.get(0,2,4),null);
});

test('detached cluster falls, collides and materializes back into cells',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'pixel2d',seed:3,groundY:0,
    clusterOptions:{gravity:-.5,fractureImpact:99}});
  const p=new PixelCellAdapter(runtime);
  p.set(0,0,'stone');p.set(1,0,'stone');p.set(0,4,'wood');p.set(1,4,'wood');
  const detached=runtime.detachUnsupported();assert.equal(detached.detached[0].cellCount,2);
  for(let i=0;i<8&&runtime.clusters.snapshot().length;i++)runtime.clusters.step();
  assert.equal(runtime.clusters.snapshot().length,0);
  assert.equal(p.get(0,1)?.material,'wood');assert.equal(p.get(1,1)?.material,'wood');
});

test('high impact converts a rigid cluster back to cell simulation and emits shatter evidence',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'pixel2d',seed:3,groundY:0,
    clusterOptions:{gravity:0,fractureImpact:2}});
  const p=new PixelCellAdapter(runtime);p.set(0,0,'stone');p.set(0,2,'glass');
  runtime.detachUnsupported();const id=runtime.clusters.snapshot()[0].id;
  runtime.clusters.applyImpulse(id,{x:0,y:-5,z:0});
  for(let i=0;i<3&&runtime.clusters.snapshot().length;i++)runtime.clusters.step();
  const events=runtime.drainEvents();
  assert.ok(events.some(event=>event.type==='cluster-impact'&&event.result==='shattered'));
  assert.equal(runtime.clusters.snapshot().length,0);
});

test('explosion is radial, bounded and leaves cells outside its radius unchanged',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'pixel2d',seed:5,groundY:-10});
  const p=new PixelCellAdapter(runtime);
  p.set(0,0,'glass');p.set(1,0,'stone');p.set(8,0,'glass');
  const report=p.explode(0,0,{radius:3,force:20,heat:500,maxCells:200});
  assert.ok(report.fractured>=1);assert.equal(p.get(8,0)?.material,'glass');
  assert.ok(report.visited<=200);assert.equal(report.truncated,false);
});

test('explosion does not process a displaced mobile cell twice',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'pixel2d',seed:15,groundY:-10});
  const p=new PixelCellAdapter(runtime);p.set(1,0,'sand');
  const report=p.explode(0,0,{radius:4,force:9,heat:0,maxCells:200});
  assert.equal(report.displaced,1);
  const sand=runtime.world.snapshot().filter(cell=>cell.material==='sand');
  assert.equal(sand.length,1);assert.equal(sand[0].position,'2,0,0');
});

test('pixel and voxel modes share identical lava-water material rules on one slice',()=>{
  const pixel=new WorldPhysicsRuntime({mode:'pixel2d',seed:77,groundY:-100});
  const voxel=new WorldPhysicsRuntime({mode:'voxel3d',seed:77,groundY:-100});
  for(const runtime of [pixel,voxel]){
    for(const x of [-1,0,1,2])runtime.setCell(x,0,0,'stone');
    runtime.setCell(-1,1,0,'stone');runtime.setCell(2,1,0,'stone');
    if(runtime.mode==='voxel3d')for(const x of [0,1]){
      runtime.setCell(x,1,-1,'stone');runtime.setCell(x,1,1,'stone');
    }
    runtime.setCell(0,1,0,'lava');runtime.setCell(1,1,0,'water');
    runtime.step({structural:false,clusterSteps:0});
  }
  const dynamic=runtime=>materials2D(runtime).filter(c=>c.z===0&&c.y===1&&[0,1].includes(c.x))
    .map(({x,y,material})=>({x,y,material}));
  const a=dynamic(pixel),b=dynamic(voxel);assert.deepEqual(a,b);
  assert.ok(a.some(cell=>cell.material==='stone'));assert.ok(a.some(cell=>cell.material==='steam'));
});

test('voxel adapter maps current Voxel World block ids without inventing unknown assets',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'voxel3d',seed:8});
  const adapter=new VoxelCellAdapter(runtime);
  const report=adapter.importRows([
    {x:1,y:1,z:1,block_type:3},{x:2,y:1,z:1,block_type:5},
    {x:3,y:1,z:1,block_type:13},{x:4,y:1,z:1,block_type:999}
  ]);
  assert.equal(report.imported,3);assert.equal(report.unsupported,1);
  assert.equal(adapter.get(1,1,1).material,'stone');
  assert.equal(adapter.get(2,1,1).material,'wood');
  assert.equal(adapter.get(3,1,1).material,'metal');
});

test('voxel changes include both ends of a moved material cell',()=>{
  const runtime=new WorldPhysicsRuntime({mode:'voxel3d',seed:3,groundY:-10});
  const adapter=new VoxelCellAdapter(runtime);
  runtime.setCell(0,2,0,'sand');runtime.drainEvents();
  runtime.step({structural:false,clusterSteps:0});
  const changes=adapter.changesFromEvents(runtime.drainEvents());
  assert.ok(changes.some(c=>c.x===0&&c.y===2&&c.z===0&&c.block===0));
  assert.ok(changes.some(c=>c.x===0&&c.y===1&&c.z===0&&c.block===4));
});

test('render bridge converts physics evidence into particles, light and camera commands',()=>{
  const commands=renderCommandsForEvents([
    {type:'ignition',at:{x:0,y:1,z:0}},
    {type:'explosion',center:{x:2,y:2,z:0},force:10},
    {type:'cluster-impact',position:{x:1,y:0,z:0},result:'shattered',speed:8}
  ]);
  assert.ok(commands.some(c=>c.type==='particle-emitter'&&c.effect==='fire-sparks'));
  assert.ok(commands.some(c=>c.type==='light-pulse'&&c.effect==='explosion'));
  assert.ok(commands.some(c=>c.type==='camera-impulse'));
});

test('scene sequencer replays the same chain deterministically',()=>{
  const actions=[
    {at:0,type:'fill',min:{x:-2,y:0},max:{x:2,y:0},material:'stone'},
    {at:0,type:'fill',min:{x:-1,y:5},max:{x:1,y:6},material:'sand'},
    {at:2,type:'set',position:{x:4,y:1},material:'wood'},
    {at:3,type:'ignite',position:{x:4,y:1},temperature:700},
    {at:4,type:'explode',position:{x:0,y:1},options:{radius:2,force:3,heat:40}},
    {at:5,type:'transition',name:'fire-scene'}
  ];
  const run=()=>{
    const runtime=new WorldPhysicsRuntime({mode:'pixel2d',seed:123,groundY:0});
    const seq=new WorldPhysicsSequencer(runtime,actions);
    seq.run(8,{structural:false,clusterSteps:0});return runtime.snapshot();
  };
  assert.deepEqual(run(),run());
});
