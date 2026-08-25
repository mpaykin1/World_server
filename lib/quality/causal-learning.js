'use strict';
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function variance(a,m=mean(a)){return a.length>1?a.reduce((n,x)=>n+(x-m)**2,0)/(a.length-1):0;}
function estimateEffect({ treatmentBefore=[], treatmentAfter=[], controlBefore=[], controlAfter=[], higherIsBetter=true }) {
  const lengths=[treatmentBefore.length,treatmentAfter.length,controlBefore.length,controlAfter.length];
  if (Math.min(...lengths) < 2) return {ok:false,reason:'insufficient-samples'};
  const tDelta=mean(treatmentAfter)-mean(treatmentBefore); const cDelta=mean(controlAfter)-mean(controlBefore); let effect=tDelta-cDelta; if(!higherIsBetter) effect=-effect;
  const pooled=Math.sqrt((variance(treatmentAfter)+variance(treatmentBefore)+variance(controlAfter)+variance(controlBefore))/4); const signal=pooled>1e-9?effect/pooled:(effect>0?10:effect<0?-10:0); const confidence=Math.max(0,Math.min(0.999,0.5+Math.tanh(Math.abs(signal))/2));
  return {ok:true,effect,rawDifferenceInDifferences:tDelta-cDelta,treatmentDelta:tDelta,controlDelta:cDelta,signal,confidence,direction:effect>0?'improved':effect<0?'worse':'neutral'};
}
function promoteCausalGolden(result, threshold=0.9){return !!(result?.ok&&result.direction==='improved'&&result.confidence>=threshold);}
module.exports={estimateEffect,promoteCausalGolden};
