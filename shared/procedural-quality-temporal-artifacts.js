(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralTemporalArtifactDetector?.version==='10.0.0')return;
const states=new WeakMap(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function sampleCanvas(canvas,w=96,h=54){
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});
 try{x.drawImage(canvas,0,0,w,h);return x.getImageData(0,0,w,h).data}catch(_){return null}
}
function analyze(canvas,{motionMagnitude=0,reactiveFraction=0}={}){
 const cur=sampleCanvas(canvas);if(!cur)return{available:false};
 let s=states.get(canvas);if(!s){states.set(canvas,{prev:cur,prev2:null,last:null});return{available:true,warmup:true}}
 let diff=0,high=0,osc=0,n=0;
 for(let i=0;i<cur.length;i+=16){const y=.2126*cur[i]+.7152*cur[i+1]+.0722*cur[i+2],p=.2126*s.prev[i]+.7152*s.prev[i+1]+.0722*s.prev[i+2];const d=Math.abs(y-p)/255;diff+=d;if(d>.15)high++;if(s.prev2){const p2=.2126*s.prev2[i]+.7152*s.prev2[i+1]+.0722*s.prev2[i+2];if((y-p)*(p-p2)<0&&Math.abs(y-p2)<24&&d>.04)osc++}n++}
 const mean=diff/Math.max(1,n),highFrac=high/Math.max(1,n),oscFrac=osc/Math.max(1,n);
 const expected=clamp(Number(motionMagnitude)*.6+Number(reactiveFraction)*.4,0,1);
 const ghosting=clamp((highFrac-expected*.45)*1.9,0,1),flicker=clamp(oscFrac*4.5,0,1),shimmer=clamp((mean-.035-expected*.08)*6,0,1);
 const score=Math.round((1-(ghosting*.45+flicker*.35+shimmer*.20))*100);
 const out={available:true,score,ghosting:+ghosting.toFixed(4),flicker:+flicker.toFixed(4),shimmer:+shimmer.toFixed(4),meanDiff:+mean.toFixed(5),expectedMotion:+expected.toFixed(4),pass:score>=82};
 s.prev2=s.prev;s.prev=cur;s.last=out;return out;
}
function status(canvas){return states.get(canvas)?.last||null}
G.WorldProceduralTemporalArtifactDetector={version:'10.0.0',analyze,status};
})();