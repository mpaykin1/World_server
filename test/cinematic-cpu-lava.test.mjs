import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLavaRibbons} from '../apps/ai3d-voxel-city/cinematic-cpu-lava.mjs';

test('volcanic fissures produce actual finite triangles with front-side coverage',()=>{
  const a=buildLavaRibbons({tier:'balanced'});
  assert.equal(a.pathCount,10);
  assert.equal(a.vertexCount,10*17*6);
  assert.equal(a.positions.length,a.colors.length);
  assert.ok(a.positions.every(Number.isFinite));
  assert.ok(a.colors.every(c=>Number.isFinite(c)&&c>=0&&c<=1));
  const mountainX=Array.from({length:a.positions.length/3},(_,i)=>a.positions[i*3]);
  assert.ok(Math.max(...mountainX)>-10,'ribbons must span visible near hemisphere');
  assert.ok(Math.min(...mountainX)<-10,'ribbons must cover several slopes');
});
test('mobile fissures use fewer vertices and reproduce exactly',()=>{
  const a=buildLavaRibbons({tier:'low'}),b=buildLavaRibbons({tier:'low'});
  assert.equal(a.vertexCount,300);
  assert.deepEqual(a.positions,b.positions);
  assert.ok(a.vertexCount<buildLavaRibbons({tier:'balanced'}).vertexCount);
});
