import test from 'node:test';
import assert from 'node:assert/strict';
import {createWatercolorStyle,stableSeed,hash01,coherentWobble,watercolorLodForDistance} from '../shared/graphics/living-watercolor-3d.js';

test('watercolor style is bounded and deterministic',()=>{
  const a=createWatercolorStyle({seed:'house',washOpacity:9,edgeWidth:-2,granulation:2,lod:{near:10}});
  const b=createWatercolorStyle({seed:'house',washOpacity:9,edgeWidth:-2,granulation:2,lod:{near:10}});
  assert.equal(a.seed,b.seed);assert.equal(a.washOpacity,1);assert.equal(a.edgeWidth,.002);assert.equal(a.granulation,.8);
  assert.equal(a.lod.near,10);assert.equal(a.lod.mid,42);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.lod));
});

test('seed and hash helpers are stable',()=>{
  assert.equal(stableSeed('volcano'),stableSeed('volcano'));
  assert.notEqual(stableSeed('volcano'),stableSeed('tree'));
  const h=hash01(1,2,3,stableSeed('ink'));assert.ok(h>=0&&h<=1);assert.equal(h,hash01(1,2,3,stableSeed('ink')));
});

test('coherent wobble changes smoothly rather than rerolling each frame',()=>{
  const a=coherentWobble('tree',1000),b=coherentWobble('tree',1016),c=coherentWobble('tree',9000);
  assert.ok(Math.abs(a-b)<.02);assert.ok(Math.abs(a-c)>.01);assert.ok(Math.abs(a)<=1&&Math.abs(b)<=1&&Math.abs(c)<=1);
});

test('artistic LOD keeps near/mid/far/budget bands explicit',()=>{
  assert.equal(watercolorLodForDistance(0),'near');assert.equal(watercolorLodForDistance(18),'near');
  assert.equal(watercolorLodForDistance(19),'mid');assert.equal(watercolorLodForDistance(60),'far');assert.equal(watercolorLodForDistance(200),'budget');
});
