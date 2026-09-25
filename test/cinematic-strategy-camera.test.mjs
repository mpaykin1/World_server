import test from 'node:test';
import assert from 'node:assert/strict';
import {minimumPitch,horizonMarginDegrees,limitStrategyPitch,
 strategyFraming,applyStrategyFraming} from '../apps/ai3d-voxel-city/cinematic-strategy-camera.mjs';
import {industryBudget,drawIndustrialLayer}
 from '../apps/ai3d-voxel-city/cinematic-industrial-parallax.mjs';

test('cinematic perspective keeps horizon outside both desktop and portrait views',()=>{
  for(const [width,height] of [[1280,720],[390,844],[834,1194],[1920,1080]]){
    const f=strategyFraming({width,height});
    assert.ok(f.pitch>minimumPitch(f.fov));
    assert.ok(f.horizonClearanceDeg>=14);
    assert.ok(f.pitch<1.26);
    assert.ok(f.cameraHeightOverTarget>45);
    assert.ok(f.distance>=100);
    assert.equal(f.portrait,width/height<.82);
  }
});
test('camera vertical rotation cannot reveal horizon at any control extreme',()=>{
  for(const fov of [42,50,52,68]){
    const min=minimumPitch(fov);
    assert.ok(horizonMarginDegrees(limitStrategyPitch(-10,fov),fov)>=13.99);
    assert.ok(horizonMarginDegrees(limitStrategyPitch(0,fov),fov)>=13.99);
    assert.ok(limitStrategyPitch(20,fov)<=1.26);
    assert.ok(min<1.26);
  }
  assert.throws(()=>strategyFraming({height:0}),/viewport/);
  assert.throws(()=>limitStrategyPitch(NaN),/pitch/);
});
test('strategy director positions existing camera without creating another renderer',()=>{
  const f=strategyFraming({width:1024,height:768});
  const camera={isPerspectiveCamera:true,far:4000,updateProjectionMatrix(){this.updated=true;},
    position:{set(x,y,z){this.array=[x,y,z];},toArray(){return this.array;}},
    lookAt(v){this.lookedAt=v;},updateMatrixWorld(){this.worldUpdated=true;}};
  const result=applyStrategyFraming(camera,f,{Vector3:class{constructor(x,y,z){this.v=[x,y,z];}}});
  assert.ok(camera.updated&&camera.worldUpdated);
  assert.equal(camera.far,700);
  assert.equal(result.fov,f.fov);
  assert.ok(result.cameraPosition[1]>f.target[1]);
  assert.ok(result.horizonMarginDegrees>14);
});
test('CPU industrial art is deterministically budgeted',()=>{
  const low=industryBudget('low'),ultra=industryBudget('ultra');
  assert.ok(low.width*low.height*4*low.layers<500000);
  assert.ok(ultra.width*ultra.height*4*ultra.layers<4_000_000);
  assert.equal(industryBudget('unknown'),industryBudget('balanced'));
  assert.ok(low.layers<ultra.layers);
  assert.throws(()=>drawIndustrialLayer({},5000,1000),/budget/);
});
test('factory skyline draws real silhouettes, pipes, beacons and many tiny lit windows',()=>{
  const counts={rectangles:0,strokes:0,gradients:0};
  const ctx={
    clearRect(){},createLinearGradient(){counts.gradients++;return{addColorStop(){}};},
    fillRect(){counts.rectangles++;},beginPath(){},moveTo(){},lineTo(){},stroke(){counts.strokes++;},
    set fillStyle(_){},set strokeStyle(_){},set lineWidth(_){}};
  const first=drawIndustrialLayer(ctx,640,256,20260925,29);
  const second=drawIndustrialLayer(ctx,640,256,20260925,29);
  assert.deepEqual(first,second);
  assert.equal(first.buildings,29);
  assert.ok(first.windows>50);
  assert.ok(first.beacons>=8);
  assert.ok(first.pipes>=7);
  assert.ok(counts.rectangles>300);
  assert.ok(counts.strokes>50);
});
