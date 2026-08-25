(() => {
'use strict';const G=globalThis;if(G.WorldProceduralTemporal)return;const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function reactive({alpha=1,lumaDelta=0,motion=0,semanticChanged=false}={}){return clamp((1-alpha)*.7+lumaDelta*.9+motion*.55+(semanticChanged?.55:0),0,1)}
function disocclusion({depthDelta=0,normalDot=1,motion=0}={}){return clamp(depthDelta*5+(1-normalDot)*1.8+motion*1.4,0,1)}
function historyWeight(x={}){const r=reactive(x),d=disocclusion(x);return clamp((x.base??.91)*(1-r)*(1-d),0,.96)}
function varianceClamp(current,history,minV,maxV,sigma=.75){const lo=Math.max(minV,current-sigma),hi=Math.min(maxV,current+sigma);return Math.min(hi,Math.max(lo,history))}
const wgsl=String.raw`
fn pq_luma(c:vec3<f32>)->f32{return dot(c,vec3<f32>(0.2126,0.7152,0.0722));}
fn pq_reactive(alpha:f32,lumaDelta:f32,motion:f32,semanticChanged:f32)->f32{return clamp((1.0-alpha)*0.7+lumaDelta*0.9+motion*0.55+semanticChanged*0.55,0.0,1.0);}
fn pq_disocclusion(depthDelta:f32,normalDot:f32,motion:f32)->f32{return clamp(depthDelta*5.0+(1.0-normalDot)*1.8+motion*1.4,0.0,1.0);}
fn pq_history_weight(base:f32,reactive:f32,disocclusion:f32)->f32{return clamp(base*(1.0-reactive)*(1.0-disocclusion),0.0,0.96);}`;
G.WorldProceduralTemporal={version:'5.0.0',reactive,disocclusion,historyWeight,varianceClamp,wgsl};})();