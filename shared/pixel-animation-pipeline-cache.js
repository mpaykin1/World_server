(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PixelAnimationPipelineCache=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';const VERSION='3.0.0',KEY='pixel-animation:pipeline-cache:v3';
function hash(text){let h=2166136261>>>0;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
function deviceKey(){const n=root.navigator||{};return hash([n.userAgent||'',n.platform||'',n.hardwareConcurrency||0,n.deviceMemory||0].join('|'));}
function read(){try{return JSON.parse(root.localStorage&&root.localStorage.getItem(KEY)||'{}')}catch{return{};}}
function write(data){try{if(root.localStorage)root.localStorage.setItem(KEY,JSON.stringify(data));}catch{}return data;}
function remember(backend,shaderSource,status){const all=read(),d=deviceKey(),fp=hash(shaderSource||backend);all[d]={...(all[d]||{}),[backend]:{fingerprint:fp,status:status||'ok',at:Date.now()}};write(all);return all[d][backend];}
function preferredOrder(defaultOrder){const all=read()[deviceKey()]||{},order=(defaultOrder||['webgpu','webgl2','canvas2d']).slice();return order.sort((a,b)=>{const A=all[a],B=all[b];const sa=A&&A.status==='ok'?1:A&&A.status==='failed'?-1:0,sb=B&&B.status==='ok'?1:B&&B.status==='failed'?-1:0;return sb-sa;});}
async function warmWebGPU(device,descriptor){if(!device)return null;const t=(root.performance&&root.performance.now?root.performance.now():Date.now());const pipeline=device.createRenderPipelineAsync?await device.createRenderPipelineAsync(descriptor):device.createRenderPipeline(descriptor);return{pipeline,compileMs:(root.performance&&root.performance.now?root.performance.now():Date.now())-t};}
return Object.freeze({VERSION,hash,deviceKey,read,remember,preferredOrder,warmWebGPU});
});
