(() => {
'use strict';const G=globalThis;if(G.WorldProceduralStyleCalibration)return;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function analyzeRGBA(data){
  if(!data?.length)return null;let n=0,sum=0,sum2=0,sat=0,dark=0,bright=0,edge=0,pr=0,pg=0,pb=0;
  const step=Math.max(4,Math.floor(data.length/200000/4)*4);
  for(let i=0;i<data.length;i+=step){const r=data[i],g=data[i+1],b=data[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=.2126*r+.7152*g+.0722*b;sum+=l;sum2+=l*l;sat+=(mx-mn)/Math.max(1,mx);if(l<48)dark++;if(l>210)bright++;if(n){edge+=Math.abs(r-pr)+Math.abs(g-pg)+Math.abs(b-pb)}pr=r;pg=g;pb=b;n++}
  const mean=sum/n,variance=Math.max(0,sum2/n-mean*mean);
  return{luma:mean/255,contrast:Math.sqrt(variance)/128,saturation:sat/n,darkRatio:dark/n,brightRatio:bright/n,edgeDensity:edge/(n*765)};
}
function target(stats,{preserveMood=true}={}){
  if(!stats)return{exposure:1,contrast:1,saturation:1,sharpen:.05,bloom:.1};
  const lowKey=stats.darkRatio>.55&&stats.brightRatio<.12;
  const exposure=preserveMood&&lowKey?clamp(.9+(0.23-stats.luma)*.45,.88,1.08):clamp(1+(0.42-stats.luma)*.5,.88,1.18);
  return{
    exposure,contrast:clamp(1+(0.34-stats.contrast)*.22,.96,1.12),
    saturation:clamp(1+(0.22-stats.saturation)*.18,.96,1.1),
    sharpen:clamp(.04+(0.12-stats.edgeDensity)*.22,.03,.12),
    bloom:clamp(.05+stats.brightRatio*.7,.04,.22),preserveMood:!!preserveMood,lowKey
  };
}
function fingerprint(stats){
  if(!stats)return'unknown';
  const q=v=>Math.round(v*20)/20;
  return [q(stats.luma),q(stats.contrast),q(stats.saturation),q(stats.darkRatio),q(stats.brightRatio),q(stats.edgeDensity)].join(':');
}
G.WorldProceduralStyleCalibration={version:'6.0.0',analyzeRGBA,target,fingerprint};
})();
