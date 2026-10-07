'use strict';

const {compareReferenceRuntime}=require('./reference-fidelity');

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));

function initialTuning(compilation={}){
  const light=compilation.plans?.lighting||{},detail=compilation.plans?.detail||{};
  return {
    contrast:clamp(light.contrast??light.keyContrast??0.55,0,1),
    ambient:clamp(light.ambientLevel??0.5,0,1),
    fog:light.volumetricFog?0.65:0,
    paletteWeight:0.65,
    silhouetteWeight:detail.silhouette==='highest'?0.9:0.7,
    microdetail:detail.microdetail==='high'?0.85:0.55,
    materialWeight:0.65,
    cameraWeight:0.75
  };
}

function correctionsFromFidelity(fidelity,target=0.85){
  const fixes=[];
  if(fidelity.structuralFidelity<target)fixes.push({axis:'silhouette',amount:clamp((target-fidelity.structuralFidelity)*0.7,0.03,0.2)});
  if(fidelity.identityFidelity<target)fixes.push({axis:'palette',amount:clamp((target-fidelity.identityFidelity)*0.6,0.03,0.2)});
  if(fidelity.heroDetailFidelity<target)fixes.push({axis:'detail',amount:clamp((target-fidelity.heroDetailFidelity)*0.65,0.03,0.2)});
  if(fidelity.score<target)fixes.push({axis:'material',amount:clamp((target-fidelity.score)*0.4,0.02,0.12)});
  return fixes;
}

function applyCorrections(tuning,fixes=[]){
  const next={...tuning};
  for(const fix of fixes){
    if(fix.axis==='silhouette')next.silhouetteWeight=clamp(next.silhouetteWeight+fix.amount,0,1);
    if(fix.axis==='palette')next.paletteWeight=clamp(next.paletteWeight+fix.amount,0,1);
    if(fix.axis==='detail')next.microdetail=clamp(next.microdetail+fix.amount,0,1);
    if(fix.axis==='material')next.materialWeight=clamp(next.materialWeight+fix.amount,0,1);
  }
  return next;
}

async function runReferenceAutotune({compilation,referenceImage,render,maxIterations=5,targetFidelity=0.85,compareOptions={}}={}){
  if(!compilation||!referenceImage||typeof render!=='function')throw new TypeError('compilation, referenceImage and render callback are required');
  const iterations=Math.max(1,Math.min(Number(maxIterations)||5,12)),target=clamp(targetFidelity,0.5,0.99);
  let tuning=initialTuning(compilation),best=null;
  const history=[];
  for(let index=0;index<iterations;index+=1){
    const candidate=await render({compilation,tuning:{...tuning},iteration:index});
    const fidelity=compareReferenceRuntime(referenceImage,candidate,compareOptions);
    const record={iteration:index+1,fidelity,tuning:{...tuning}};
    history.push(record);
    if(!best||fidelity.score>best.fidelity.score)best=record;
    if(fidelity.score>=target)return{status:'THRESHOLD_MET',targetFidelity:target,best,history};
    tuning=applyCorrections(tuning,correctionsFromFidelity(fidelity,target));
  }
  return{status:'NEEDS_MORE_ITERATION',targetFidelity:target,best,history,nextTuning:tuning};
}

module.exports={initialTuning,correctionsFromFidelity,applyCorrections,runReferenceAutotune};
