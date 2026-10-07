'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runReferenceAutotune,correctionsFromFidelity}=require('../lib/reference-visual-autotune');

function rgba(width,height,r,g,b){
  const pixels=new Uint8Array(width*height*4);
  for(let i=0;i<width*height;i++){const o=i*4;pixels[o]=r;pixels[o+1]=g;pixels[o+2]=b;pixels[o+3]=255;}
  return{width,height,pixels};
}

test('autotune loops render compare correct until fidelity threshold',async()=>{
  const reference=rgba(8,8,200,170,120),values=[90,140,175,195,200],seen=[];
  const result=await runReferenceAutotune({
    compilation:{plans:{lighting:{contrast:.7,ambientLevel:.3},detail:{silhouette:'highest',microdetail:'high'}}},
    referenceImage:reference,targetFidelity:.95,maxIterations:5,
    render:async({tuning,iteration})=>{seen.push(tuning);const v=values[iteration];return rgba(8,8,v,Math.round(v*.85),Math.round(v*.6));}
  });
  assert.equal(result.status,'THRESHOLD_MET');
  assert.ok(result.history.length>1);
  assert.ok(result.best.fidelity.score>=.95);
  assert.ok(seen[1].paletteWeight>=seen[0].paletteWeight);
});

test('autotune stops honestly when renderer cannot improve',async()=>{
  const reference=rgba(8,8,240,220,200);
  const result=await runReferenceAutotune({
    compilation:{plans:{}},referenceImage:reference,maxIterations:3,targetFidelity:.95,
    render:async()=>rgba(8,8,30,30,30)
  });
  assert.equal(result.status,'NEEDS_MORE_ITERATION');
  assert.equal(result.history.length,3);
  assert.ok(result.best.fidelity.score<.95);
  assert.ok(result.nextTuning.paletteWeight>0.65);
});

test('fidelity correction priorities cover structure palette detail and materials',()=>{
  const fixes=correctionsFromFidelity({structuralFidelity:.4,identityFidelity:.5,heroDetailFidelity:.6,score:.55},.85);
  assert.deepEqual(fixes.map(x=>x.axis),['silhouette','palette','detail','material']);
});
