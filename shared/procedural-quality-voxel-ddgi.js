(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralVoxelDDGI?.version==='8.0.0')return;
const controllers=new WeakMap();
function half(v){const f=new Float32Array(1),u=new Uint32Array(f.buffer);f[0]=v;const x=u[0],s=(x>>16)&0x8000,m=x&0x7fffff,e=(x>>23)&255;if(e<103)return s;if(e>142)return s|0x7c00|((e==255&&m)?1:0);if(e<113)return s|((m|0x800000)>>(114-e)+0x1000>>13);return s|((e-112)<<10)|((m+0x1000)>>13)}
function paletteColor(pal,i){const c=pal?.[i]||pal?.[String(i)]||[110,100,90];if(Array.isArray(c))return[c[0]||0,c[1]||0,c[2]||0];if(c&&typeof c==='object')return[c.r||0,c.g||0,c.b||0];return[110,100,90]}
function voxelsOf(world){return world?.voxels||world?.data?.voxels||[]}
function inject(world,cameraPosition,device,ddgi,{maxVoxels=180000}={}){
 if(!device?.queue?.writeTexture||!ddgi?.supported)return{ok:false,reason:'device/ddgi unavailable'};
 const vox=voxelsOf(world),pal=world?.palette||world?.data?.palette||[],res=ddgi.resolution||[16,8,16];
 const scroll=ddgi.scroll(cameraPosition||[0,0,0]),results=[];
 for(let li=0;li<ddgi.clips.length;li++){
  const clip=ddgi.clips[li],scale=clip.scale||1,origin=clip.origin||[0,0,0],n=res[0]*res[1]*res[2],data=new Uint16Array(n*4);
  const min=[origin[0]-res[0]*scale*.5,origin[1]-res[1]*scale*.5,origin[2]-res[2]*scale*.5];
  let used=0,emissive=0;
  const step=Math.max(1,Math.ceil(vox.length/maxVoxels));
  for(let vi=0;vi<vox.length;vi+=step){
   const v=vox[vi];if(!Array.isArray(v)||v.length<3)continue;
   const x=Number(v[0]),y=Number(v[1]),z=Number(v[2]),ix=Math.floor((x-min[0])/scale),iy=Math.floor((y-min[1])/scale),iz=Math.floor((z-min[2])/scale);
   if(ix<0||iy<0||iz<0||ix>=res[0]||iy>=res[1]||iz>=res[2])continue;
   const color=paletteColor(pal,Number(v[3]??v[4]??0)),r=color[0]/255,g=color[1]/255,b=color[2]/255;
   const lum=.2126*r+.7152*g+.0722*b,sat=Math.max(r,g,b)-Math.min(r,g,b),emit=Math.max(0,(lum-.68)*2.4)*(1+.6*sat);
   if(emit>.05)emissive++;
   const ambient=.018+Math.max(0,y-min[1])/(Math.max(1,res[1]*scale))*.012;
   const q=((iz*res[1]+iy)*res[0]+ix)*4;
   const gain=ambient+emit;
   data[q]=half(Math.min(12,r*gain));data[q+1]=half(Math.min(12,g*gain));data[q+2]=half(Math.min(12,b*gain));data[q+3]=half(1);used++;
  }
  try{
   const tex=ddgi.current(li);device.queue.writeTexture({texture:tex},{data,bytesPerRow:res[0]*8,rowsPerImage:res[1]},
     {width:res[0],height:res[1],depthOrArrayLayers:res[2]});
   results.push({level:li,used,emissive,scale});
  }catch(e){results.push({level:li,error:String(e?.message||e)})}
 }
 return{ok:true,version:8,scroll,levels:results,voxelCount:vox.length,sceneAware:true};
}
async function attach({renderer,worldGetter,cameraGetter}={}){
 if(!renderer||controllers.has(renderer))return controllers.get(renderer)||null;
 const ctrl={version:'8.0.0',ready:false,last:null,device:null,ddgi:null,frames:0,async init(){
   try{if(!navigator.gpu)return false;const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)return false;
    ctrl.device=await adapter.requestDevice();ctrl.ddgi=await G.WorldProceduralWebGPUDDGI?.create?.(ctrl.device,{resolution:[20,10,20],levels:3,baseCell:2,bounce:.76});ctrl.ready=!!ctrl.ddgi?.supported;return ctrl.ready
   }catch(_){return false}
 }};
 controllers.set(renderer,ctrl);ctrl.init();
 const old=renderer.render.bind(renderer);renderer.render=function(scene,camera){const r=old(scene,camera);ctrl.frames++;
   if(ctrl.ready&&ctrl.frames%30===0){const w=worldGetter?.();const c=cameraGetter?.()||camera;const p=c?.position?[c.position.x,c.position.y,c.position.z]:[0,0,0];
     if(w){ctrl.last=inject(w,p,ctrl.device,ctrl.ddgi);try{const enc=ctrl.device.createCommandEncoder();ctrl.ddgi.encode(enc,2);ctrl.device.queue.submit([enc.finish()])}catch(_){}}}
   return r};
 return ctrl;
}
G.WorldProceduralVoxelDDGI={version:'8.0.0',inject,attach,capability:{voxelSceneRadiance:true,webgpu3DClipmaps:true,multiBounce:true}};
})();