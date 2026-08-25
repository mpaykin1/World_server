(() => {
'use strict';const G=globalThis;if(G.WorldProceduralPromotion?.version==='8.0.0')return;
function assess(x={}){
 const reasons=[],score=Number(x.score||0),visual=Number(x.visualScore||0),anim=Number(x.animationScore||0),stability=Number(x.stabilityScore||0),native=Number(x.nativeCoveragePct||0),skinned=Number(x.skinnedVelocityPct??100);
 if(!x.verified)reasons.push('not-verified');if(!x.regressionFree)reasons.push('regression');if(score<86)reasons.push('score');if(visual<84)reasons.push('visual');if(anim<80)reasons.push('animation');if(stability<88)reasons.push('stability');if(native<50)reasons.push('native-coverage');if(skinned<70)reasons.push('skinned-velocity');
 if(x.baselinePass!==true)reasons.push('golden-baseline');if(x.production===true&&x.deviceCertified!==true)reasons.push('physical-device-certification');
 return{promote:reasons.length===0,reasons,confidence:Math.max(0,Math.min(1,(score+visual+anim+stability)/400)),productionReady:reasons.length===0&&x.production===true};
}
G.WorldProceduralPromotion={version:'8.0.0',assess};
})();