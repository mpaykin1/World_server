(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PixelAnimationAutoIntegrator=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';const VERSION='3.0.0';
function discover(doc){const d=doc||root.document;if(!d)return[];return[...d.querySelectorAll('canvas[data-pixel-animation],canvas[data-world-canvas],canvas#game,canvas#world')];}
async function install(options){const opts=options||{},Runtime=root.PixelAnimationRuntime;if(!Runtime)throw new Error('PixelAnimationRuntime unavailable');const canvases=discover(opts.document),engines=[];for(const canvas of canvases){if(canvas.__pixelAnimationEngine)continue;try{const engine=opts.configUrl?await Runtime.createFromRemote(canvas,opts.configUrl,opts):await Runtime.create(canvas,opts);canvas.__pixelAnimationEngine=engine;engines.push(engine);if(typeof opts.onEngine==='function')opts.onEngine(engine,canvas);}catch(error){if(typeof opts.onError==='function')opts.onError(error,canvas);}}return engines;}
return Object.freeze({VERSION,discover,install});
});
