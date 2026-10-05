import test from 'node:test';
import assert from 'node:assert/strict';
import {organicDisplacementAt} from '../shared/graphics/living-watercolor-generators.js';
import {
  WATERCOLOUR_REFERENCE_PROFILES,measureWatercolorImageData,scoreWatercolorMetrics
} from '../shared/graphics/living-watercolor-reference-gate.js';

test('organic displacement is deterministic, bounded and seed-sensitive',()=>{
  const a=organicDisplacementAt(.3,.7,-.2,{seed:'tree',amount:.04,scale:1.2});
  const b=organicDisplacementAt(.3,.7,-.2,{seed:'tree',amount:.04,scale:1.2});
  const c=organicDisplacementAt(.3,.7,-.2,{seed:'volcano',amount:.04,scale:1.2});
  assert.equal(a,b);assert.notEqual(a,c);assert.ok(Math.abs(a)<=.04);
});

test('reference profiles preserve measured sketch traits',()=>{
  assert.deepEqual(Object.keys(WATERCOLOUR_REFERENCE_PROFILES).sort(),['house','plant','tree','volcano']);
  for(const profile of Object.values(WATERCOLOUR_REFERENCE_PROFILES)){
    assert.ok(profile.foregroundCoverage>.28&&profile.foregroundCoverage<.34);
    assert.ok(profile.inkCoverage>.19&&profile.inkCoverage<.26);
    assert.ok(profile.edgeDensityForeground>.10&&profile.edgeDensityForeground<.22);
    assert.ok(profile.lumaMean>150&&profile.lumaMean<180);
  }
});

test('reference score is 100 for its own measured profile and fails a wireframe-like mismatch',()=>{
  const target=WATERCOLOUR_REFERENCE_PROFILES.house;
  const exact=scoreWatercolorMetrics(target,'house');assert.equal(exact.score,100);assert.equal(exact.pass,true);
  const wireframe={...target,foregroundCoverage:.18,inkCoverage:.07,midWashCoverage:.13,edgeDensityForeground:.48,lumaMean:196,bboxArea:.93};
  const bad=scoreWatercolorMetrics(wireframe,'house');assert.ok(bad.score<50);assert.equal(bad.pass,false);
});

test('image-data measurement separates paper from blue-gray pigment',()=>{
  const w=20,h=20,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,isInk=x>=5&&x<15&&y>=5&&y<15;
    data[i]=isInk?90:246;data[i+1]=isInk?105:242;data[i+2]=isInk?125:230;data[i+3]=255;
  }
  const m=measureWatercolorImageData({data,width:w,height:h});
  assert.ok(m.foregroundCoverage>.20&&m.foregroundCoverage<.30);
  assert.ok(m.inkCoverage>.20);assert.ok(m.lumaMean<150);
  assert.ok(m.bboxArea>.20&&m.bboxArea<.30);
});
