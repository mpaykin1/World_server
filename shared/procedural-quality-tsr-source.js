(() => {
'use strict';const G=globalThis;if(G.WorldProceduralTSRSource)return;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function halton(i,b){let f=1,r=0;while(i>0){f/=b;r+=f*(i%b);i=Math.floor(i/b)}return r}
function jitter(frame,width,height){const i=(frame|0)+2;return[(halton(i,2)-.5)/Math.max(1,width),(halton(i,3)-.5)/Math.max(1,height)]}
function reactiveMask(curr,prev,{threshold=.08,gain=3}={}){
  if(!curr||!prev||curr.length!==prev.length)return null;
  const n=Math.floor(curr.length/4),out=new Uint8Array(n);
  for(let i=0,j=0;i<n;i++,j+=4){
    const lc=.2126*curr[j]+.7152*curr[j+1]+.0722*curr[j+2];
    const lp=.2126*prev[j]+.7152*prev[j+1]+.0722*prev[j+2];
    const alpha=Math.abs((curr[j+3]??255)-(prev[j+3]??255))/255;
    out[i]=Math.round(255*clamp((Math.abs(lc-lp)/255-threshold)*gain+alpha,0,1));
  }return out;
}
function disocclusionMask(depth,prev,{relative=.035,absolute=.01}={}){
  if(!depth||!prev||depth.length!==prev.length)return null;
  const out=new Uint8Array(depth.length);
  for(let i=0;i<depth.length;i++){const a=Number(depth[i]),b=Number(prev[i]),d=Math.abs(a-b);out[i]=(d>absolute+relative*Math.max(Math.abs(a),Math.abs(b)))?255:0}
  return out;
}
function cameraMotion(prev,curr,width,height){
  if(!prev||!curr)return{x:0,y:0};
  const dx=Number(curr.x||0)-Number(prev.x||0),dy=Number(curr.y||0)-Number(prev.y||0);
  return{x:dx/Math.max(1,width),y:dy/Math.max(1,height)};
}
function historyWeight({reactive=0,disoccluded=false,motion=0,confidence=1}={}){
  if(disoccluded)return 0;
  return clamp((1-reactive)*(1-clamp(Math.abs(motion)*2,0,.8))*confidence,.04,.96);
}
G.WorldProceduralTSRSource={version:'6.0.0',jitter,reactiveMask,disocclusionMask,cameraMotion,historyWeight};
})();
