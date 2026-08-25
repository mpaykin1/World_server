(() => {
'use strict';const G=globalThis;if(G.WorldProceduralPerceptual)return;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function luma(d,i){return .2126*d[i]+.7152*d[i+1]+.0722*d[i+2]}
function compare(a,b){
  if(!a||!b||a.length!==b.length||a.length<16)return{score:0,error:'shape'};
  let n=0,ma=0,mb=0,vaa=0,vbb=0,cov=0,edgeA=0,edgeB=0,prevA=0,prevB=0;
  const step=Math.max(4,Math.floor(a.length/150000/4)*4);
  for(let i=0;i<a.length;i+=step){const x=luma(a,i),y=luma(b,i);ma+=x;mb+=y;vaa+=x*x;vbb+=y*y;cov+=x*y;if(n){edgeA+=Math.abs(x-prevA);edgeB+=Math.abs(y-prevB)}prevA=x;prevB=y;n++}
  ma/=n;mb/=n;vaa=vaa/n-ma*ma;vbb=vbb/n-mb*mb;cov=cov/n-ma*mb;
  const C1=6.5025,C2=58.5225,ssim=((2*ma*mb+C1)*(2*cov+C2))/((ma*ma+mb*mb+C1)*(vaa+vbb+C2));
  const edgePreservation=1-Math.abs(edgeA-edgeB)/Math.max(1,edgeA+edgeB);
  const score=100*clamp(.72*ssim+.28*edgePreservation,0,1);
  return{score:+score.toFixed(2),ssim:+clamp(ssim,0,1).toFixed(4),edgePreservation:+clamp(edgePreservation,0,1).toFixed(4)};
}
function temporal(prev,curr,next){
  const a=compare(prev,curr),b=compare(curr,next);if(a.error||b.error)return{score:0};
  return{score:+(100-Math.abs(a.score-b.score)).toFixed(2),pair:[a.score,b.score]};
}
G.WorldProceduralPerceptual={version:'6.0.0',compare,temporal};
})();
