(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralRendererContract)return;
const registry=new WeakMap(), frameState=new WeakMap();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function halton(index,base){let f=1,r=0,i=index;while(i>0){f/=base;r+=f*(i%base);i=Math.floor(i/base)}return r}
function jitter(frameIndex,width,height){
  const i=(frameIndex|0)+2;
  return {x:(halton(i,2)-.5)/Math.max(1,width),y:(halton(i,3)-.5)/Math.max(1,height)};
}
function normalizeBuffer(name,b,width,height){
  if(!b)return null;
  const out={...b,name};
  out.width=Number(out.width||width||0);out.height=Number(out.height||height||0);
  out.format=String(out.format||({
    depth:'r32float',normal:'rgba16float',motion:'rg16float',semantic:'r8uint',
    reactive:'r8unorm',transparency:'r8unorm',color:'rgba8unorm'
  }[name]||'unknown'));
  return out;
}
function validateFrame(frame){
  const errors=[];
  if(!frame||typeof frame!=='object')return{ok:false,errors:['frame missing']};
  const width=Number(frame.width||0),height=Number(frame.height||0);
  if(width<1||height<1)errors.push('invalid dimensions');
  for(const k of ['color','depth','normal','motion','semantic']){
    const b=frame[k]; if(!b)continue;
    if(Number(b.width||width)!==width||Number(b.height||height)!==height)errors.push(`${k} dimensions mismatch`);
  }
  return{ok:errors.length===0,errors,width,height,coverage:{
    color:!!frame.color,depth:!!frame.depth,normal:!!frame.normal,motion:!!frame.motion,
    semantic:!!frame.semantic,reactive:!!frame.reactive,transparency:!!frame.transparency
  }};
}
function register(canvas,provider){
  if(!canvas||typeof provider!=='object')throw new TypeError('canvas/provider required');
  if(typeof provider.captureFrame!=='function')throw new TypeError('provider.captureFrame required');
  const rec={provider,registeredAt:Date.now(),frames:0,lastValidation:null};
  registry.set(canvas,rec);
  return()=>registry.delete(canvas);
}
async function capture(canvas,ctx={}){
  const rec=registry.get(canvas);if(!rec)return null;
  const raw=await rec.provider.captureFrame(ctx);if(!raw)return null;
  const width=Number(raw.width||canvas.width||0),height=Number(raw.height||canvas.height||0);
  const frame={...raw,width,height};
  for(const k of ['color','depth','normal','motion','semantic','reactive','transparency']){
    frame[k]=normalizeBuffer(k,raw[k],width,height);
  }
  frame.frameIndex=Number(raw.frameIndex??rec.frames++);
  frame.jitter=raw.jitter||jitter(frame.frameIndex,width,height);
  frame.backend=raw.backend||rec.provider.backend||'unknown';
  frame.native=true;
  rec.lastValidation=validateFrame(frame);
  frameState.set(canvas,frame);
  return frame;
}
function get(canvas){return registry.get(canvas)?.provider||null}
function lastFrame(canvas){return frameState.get(canvas)||null}
function status(canvas){
  const r=registry.get(canvas);
  return r?{registered:true,backend:r.provider.backend||'unknown',frames:r.frames,lastValidation:r.lastValidation}:{registered:false};
}
function motionFromTransforms(prev,curr,scale=1){
  if(!prev||!curr)return{x:0,y:0,confidence:0};
  const px=Number(prev.x??prev[12]??0),py=Number(prev.y??prev[13]??0);
  const cx=Number(curr.x??curr[12]??0),cy=Number(curr.y??curr[13]??0);
  return{x:(cx-px)*scale,y:(cy-py)*scale,confidence:1};
}
G.WorldProceduralRendererContract={version:'7.0.0',register,capture,get,lastFrame,status,validateFrame,jitter,motionFromTransforms};
})();
