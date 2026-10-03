'use strict';

const abs=(a,b)=>Math.abs((Number(a)||0)-(Number(b)||0));

function push(out,priority,system,reason,action){
  out.push({priority,system,reason,action});
}

function planReferenceCorrections(referenceGrammar,runtimeGrammar,fidelity={}){
  if(!referenceGrammar||!runtimeGrammar)throw new TypeError('Reference and runtime grammars required');
  const fixes=[];
  const structure=Number(fidelity.structuralFidelity);
  const identity=Number(fidelity.identityFidelity);
  const hero=Number(fidelity.heroDetailFidelity);

  if(Number.isFinite(structure)&&structure<0.85)push(fixes,100,'geometry','structural fidelity below 0.85','adjust silhouette, large masses, arches/bridges/towers before microdetail');
  if(abs(referenceGrammar.geometry.edgeDensity,runtimeGrammar.geometry.edgeDensity)>0.08)push(fixes,88,'detail','edge/detail density mismatch','retune semantic detail density and large-to-small feature ratio');
  if(abs(referenceGrammar.lighting.contrast,runtimeGrammar.lighting.contrast)>0.08)push(fixes,92,'lighting','contrast mismatch','retune local light falloff, exposure and shadow separation');
  if(referenceGrammar.lighting.localEmitters!==runtimeGrammar.lighting.localEmitters)push(fixes,96,'LIGHT','emissive/local-light behavior mismatch','enable or disable LIGHT/local emissive treatment to match reference grammar');
  if(abs(referenceGrammar.palette.warmBias,runtimeGrammar.palette.warmBias)>0.12)push(fixes,72,'materials','palette temperature mismatch','rebalance material palette and emissive temperature');
  if(referenceGrammar.camera.type!==runtimeGrammar.camera.type)push(fixes,94,'camera','camera projection mismatch','match projection/FOV/view class before geometry tuning');
  if(abs(referenceGrammar.motion.energy,runtimeGrammar.motion.energy)>0.08)push(fixes,76,'animation','motion grammar mismatch','retune animation amplitude/cadence and secondary motion');
  if(Number.isFinite(identity)&&identity<0.85)push(fixes,84,'composition','image identity fidelity below 0.85','retune palette, framing and dominant visual masses');
  if(Number.isFinite(hero)&&hero<0.85)push(fixes,82,'hero-detail','hero detail fidelity below 0.85','increase semantic identity marks instead of generic noise');

  fixes.sort((a,b)=>b.priority-a.priority);
  return{pass:fixes.length===0,fixes,highestPriority:fixes[0]||null};
}

module.exports={planReferenceCorrections};
