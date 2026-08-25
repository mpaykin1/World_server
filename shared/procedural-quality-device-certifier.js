(() => {
'use strict';
const G=globalThis;if(G.WorldProceduralDeviceCertifier?.version==='8.0.0')return;
const samples=[];let started=false,sent=false,last=performance.now();
function q(a,p){if(!a.length)return null;const x=[...a].sort((u,v)=>u-v),i=Math.min(x.length-1,Math.floor((x.length-1)*p));return x[i]}
function glInfo(){
 const c=document.createElement('canvas'),gl=c.getContext('webgl2')||c.getContext('webgl');if(!gl)return{webgl:false};
 const ext=gl.getExtension('WEBGL_debug_renderer_info');return{webgl:true,vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):'',renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'',webgl2:!!c.getContext('webgl2')}}
function classify(info){
 const ua=navigator.userAgent||'',gpu=(info.renderer||'').toLowerCase();
 if(/iphone|ipad|ipod/i.test(ua))return'mobile-ios';
 if(/android/i.test(ua))return'mobile-android';
 if(/intel.*(uhd|iris|hd graphics)|radeon.*(graphics|vega)|apple m[1-9]/i.test(gpu))return'desktop-igpu';
 if(/nvidia|geforce|rtx|gtx|radeon rx|arc a[0-9]/i.test(gpu))return'desktop-dgpu';
 return navigator.maxTouchPoints>1?'mobile-other':'desktop-other';
}
function report(){
 const g=glInfo(),p50=q(samples,.5),p95=q(samples,.95),dc=classify(g),r={
  version:8,physical:true,deviceClass:dc,userAgent:navigator.userAgent.slice(0,240),
  screen:{width:screen.width,height:screen.height,dpr:devicePixelRatio||1,orientation:screen.orientation?.type||''},
  hardware:{cores:navigator.hardwareConcurrency||null,memory:navigator.deviceMemory||null,touch:navigator.maxTouchPoints||0,webgpu:!!navigator.gpu,...g},
  metrics:{sampleCount:samples.length,p50FrameMs:p50,p95FrameMs:p95,fpsP50:p50?1000/p50:null,fpsP95:p95?1000/p95:null},
  app:location.pathname,ts:new Date().toISOString()
 };return r
}
async function send(){
 if(sent||samples.length<90)return null;sent=true;const body=report();
 try{const r=await fetch('/api/procedural-quality-device-report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),keepalive:true});const j=await r.json();return{...body,server:j}}catch(e){sent=false;return{...body,error:String(e?.message||e)}}
}
function tick(now){if(!started)return;const dt=now-last;last=now;if(dt>1&&dt<250)samples.push(dt);if(samples.length>240)samples.shift();if(samples.length===120)send();requestAnimationFrame(tick)}
function start(){if(started)return;started=true;last=performance.now();requestAnimationFrame(tick);setTimeout(send,9000)}
function status(){return{started,sent,samples:samples.length,report:report()}}
G.WorldProceduralDeviceCertifier={version:'8.0.0',start,send,status};setTimeout(start,1500);
})();