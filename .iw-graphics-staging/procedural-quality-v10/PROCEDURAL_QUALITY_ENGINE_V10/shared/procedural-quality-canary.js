(() => {
'use strict';const G=globalThis;if(G.WorldProceduralCanary?.version==='10.0.0')return;
function assess(x={}){
 const reasons=[];const temporal=Number(x.temporalScore??100),p95=Number(x.p95FrameMs??16.7),leak=!!x.possibleLeak,reg=!!x.regressionFree,golden=!!x.goldenVerified,devices=!!x.deviceCertified;
 if(!reg)reasons.push('regression');if(temporal<84)reasons.push('temporal-artifacts');if(p95>40)reasons.push('frame-pacing');if(leak)reasons.push('resource-leak');
 if(x.production&& !golden)reasons.push('golden-baseline');if(x.production&&!devices)reasons.push('physical-device-certification');
 return{version:10,promote:reasons.length===0,reasons,stage:reasons.length?'hold':(x.production?'production':'preview-canary')};
}
G.WorldProceduralCanary={version:'10.0.0',assess};
})();